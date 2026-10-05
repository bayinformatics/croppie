import {
	canvasToBase64,
	canvasToBlob,
	drawCroppedImage,
} from "./canvas/index.js";
import { createDragHandler } from "./input/drag.js";
import {
	createPinchZoomHandler,
	createWheelZoomHandler,
} from "./input/zoom.js";
import type {
	BindOptions,
	Boundary,
	CropPoints,
	CroppieData,
	CroppieEventHandler,
	CroppieEvents,
	CroppieOptions,
	ResultOptions,
	Rotation,
	TransformState,
	ZoomConfig,
} from "./types.js";
import {
	createBoundary,
	createContainer,
	createOverlay,
	createPreview,
	createSliderContainer,
	createViewport,
	createZoomSlider,
} from "./ui/index.js";
import {
	CENTER_ANCHOR,
	calculateBounds,
	calculateContainZoom,
	calculateInitialZoom,
	calculateTransformFromPoints,
	clamp,
	DEFAULT_MAX_ZOOM,
	DEFAULT_MIN_ZOOM,
	fileToDataUrl,
	loadImage,
	naturalRectToRotated,
	normalizePoints,
	normalizeRotation,
	resolveMinZoom,
	rotatedRectToNatural,
	rotateOffset,
	setTransform,
	swapDims,
	validateOptions,
	type ZoomAnchor,
	zoomAboutAnchor,
} from "./utils/index.js";

const DEFAULT_ZOOM: ZoomConfig = {
	min: DEFAULT_MIN_ZOOM,
	max: DEFAULT_MAX_ZOOM,
};

/**
 * Modern, TypeScript-first image cropper.
 *
 * @example
 * ```ts
 * const croppie = new Croppie(element, {
 *   viewport: { width: 200, height: 200, type: 'circle' }
 * })
 *
 * await croppie.bind({ url: 'image.jpg' })
 * const blob = await croppie.result({ type: 'blob' })
 * ```
 */
export class Croppie {
	private readonly element: HTMLElement;
	private readonly options: Required<
		Pick<
			CroppieOptions,
			"viewport" | "boundary" | "showZoomer" | "mouseWheelZoom" | "enableZoom"
		>
	> &
		CroppieOptions;

	// DOM elements
	private container: HTMLDivElement | null = null;
	private boundaryEl: HTMLDivElement | null = null;
	private viewportEl: HTMLDivElement | null = null;
	private overlayEl: HTMLDivElement | null = null;
	private previewEl: HTMLImageElement | null = null;
	private sliderEl: HTMLInputElement | null = null;

	// State
	private image: HTMLImageElement | null = null;
	private transform: TransformState = { x: 0, y: 0, scale: 1, rotation: 0 };
	/** The rotation `bind()` started with; `reset()` returns to it. */
	private initialRotation: Rotation = 0;
	private zoomConfig: ZoomConfig;
	/** `options.zoom.min` as given; undefined when unset (then the minimum is per image). */
	private configuredMinZoom: number | undefined;
	private effectiveMinZoom = DEFAULT_MIN_ZOOM;

	// Event handlers
	private eventHandlers: Map<
		keyof CroppieEvents,
		Set<CroppieEventHandler<keyof CroppieEvents>>
	> = new Map();

	// Cleanup functions
	private cleanupFns: Array<() => void> = [];

	// Lifecycle: `destroyed` guards every public method; `bindGeneration` makes the last
	// bind win (an older bind that finishes loading later sees a newer generation and stops)
	private destroyed = false;
	private bindGeneration = 0;

	constructor(element: HTMLElement, options: CroppieOptions) {
		validateOptions(options);
		this.element = element;

		// Calculate default boundary (viewport + 100px padding)
		const defaultBoundary: Boundary = {
			width: options.viewport.width + 100,
			height: options.viewport.height + 100,
		};

		this.options = {
			...options,
			boundary: options.boundary ?? defaultBoundary,
			showZoomer: options.showZoomer ?? true,
			mouseWheelZoom: options.mouseWheelZoom ?? true,
			enableZoom: options.enableZoom ?? true,
		};

		this.configuredMinZoom = options.zoom?.min;
		this.zoomConfig = {
			...DEFAULT_ZOOM,
			...options.zoom,
		};

		this.createElements();
		this.attachEventHandlers();
	}

	/**
	 * Creates all DOM elements
	 */
	private createElements(): void {
		this.container = createContainer(this.options.customClass);
		this.boundaryEl = createBoundary(this.options.boundary);
		this.viewportEl = createViewport(this.options.viewport);
		this.overlayEl = createOverlay(
			this.options.boundary,
			this.options.viewport,
		);
		this.previewEl = createPreview();

		// Assemble the DOM tree
		this.boundaryEl.appendChild(this.previewEl);
		this.boundaryEl.appendChild(this.overlayEl);
		this.boundaryEl.appendChild(this.viewportEl);
		this.container.appendChild(this.boundaryEl);

		// Add zoom slider if enabled
		if (this.options.enableZoom && this.options.showZoomer) {
			const sliderWrap = createSliderContainer();
			this.sliderEl = createZoomSlider(
				this.configuredMinZoom ?? DEFAULT_MIN_ZOOM,
				this.zoomConfig.max,
				this.transform.scale,
			);
			sliderWrap.appendChild(this.sliderEl);
			this.container.appendChild(sliderWrap);

			// Slider input handler
			const handleSliderInput = () => {
				if (this.sliderEl) {
					this.applyZoom(Number.parseFloat(this.sliderEl.value));
				}
			};
			this.sliderEl.addEventListener("input", handleSliderInput);
			this.cleanupFns.push(() => {
				this.sliderEl?.removeEventListener("input", handleSliderInput);
			});
		}

		this.element.appendChild(this.container);
	}

	/**
	 * Attaches drag and zoom event handlers
	 */
	private attachEventHandlers(): void {
		if (!this.boundaryEl || !this.previewEl) return;

		// Drag handler
		const dragCleanup = createDragHandler(
			this.boundaryEl,
			() => this.transform,
			(x, y) => {
				const { x: previousX, y: previousY } = this.transform;
				this.transform.x = x;
				this.transform.y = y;
				this.constrainPosition();

				// A drag the bounds fully absorb (e.g. vertical on a landscape image) moves nothing
				if (this.transform.x === previousX && this.transform.y === previousY) {
					return;
				}
				this.updateTransform();
				this.emitUpdate();
			},
		);
		this.cleanupFns.push(dragCleanup);

		// Wheel zoom handler
		if (this.options.enableZoom && this.options.mouseWheelZoom) {
			const requireCtrl = this.options.mouseWheelZoom === "ctrl";
			const wheelCleanup = createWheelZoomHandler(
				this.boundaryEl,
				() => this.transform.scale,
				(zoom, anchor) => this.applyZoom(zoom, anchor),
				{ requireCtrl },
			);
			this.cleanupFns.push(wheelCleanup);
		}

		// Pinch zoom handler
		if (this.options.enableZoom) {
			const pinchCleanup = createPinchZoomHandler(
				this.boundaryEl,
				() => this.transform.scale,
				(zoom, anchor) => this.applyZoom(zoom, anchor),
			);
			this.cleanupFns.push(pinchCleanup);
		}
	}

	/**
	 * Loads an image into the cropper
	 */
	async bind(options: BindOptions | string): Promise<void> {
		this.assertNotDestroyed("bind");

		const bindOptions: BindOptions =
			typeof options === "string" ? { url: options } : options;

		// Validate before claiming a generation, so a bad call cannot supersede a good bind
		const rotation = this.resolveBindRotation(bindOptions);

		await this.load(bindOptions, ++this.bindGeneration, rotation);
	}

	/**
	 * The rotation a bind starts with: the validated `rotation` option, or 0.
	 *
	 * @throws RangeError if `bindOptions.rotation` is not a multiple of 90
	 */
	private resolveBindRotation(bindOptions: BindOptions): Rotation {
		return bindOptions.rotation !== undefined
			? normalizeRotation(bindOptions.rotation)
			: 0;
	}

	/**
	 * Loads and applies an image for a bind that claimed `generation`. If the instance was
	 * destroyed or a newer bind started meanwhile, resolves without applying or emitting
	 * anything, and without surfacing a load error nobody is waiting for any more.
	 */
	private async load(
		bindOptions: BindOptions,
		generation: number,
		rotation: Rotation,
	): Promise<void> {
		let image: HTMLImageElement;
		try {
			image = await loadImage(bindOptions.url);
		} catch (error) {
			if (this.isStaleBind(generation)) return;
			throw error;
		}
		if (this.isStaleBind(generation)) return;

		// A 0x0 image (e.g. an SVG without a size) would make every zoom calculation Infinity
		if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) {
			throw new Error(
				"[@bayinformatics/croppie] Image has no intrinsic size (0×0); cannot bind",
			);
		}
		this.image = image;

		if (this.previewEl) {
			// Use the loaded image's src to ensure preview matches the image we crop from
			// (important for URLs that return different content on each request)
			this.previewEl.src = this.image.src;
		}

		// Resolve the zoom limits (from the displayed dimensions) and sync the slider's min
		this.initialRotation = rotation;
		const coverageZoom = this.updateZoomLimits(this.image, rotation);

		// Calculate initial zoom
		const initialZoom = bindOptions.zoom ?? coverageZoom;

		this.transform = {
			x: 0,
			y: 0,
			scale: clamp(initialZoom, this.effectiveMinZoom, this.zoomConfig.max),
			rotation,
		};

		// Apply initial points if provided. They are in the natural frame; the transform
		// works in the displayed (rotated) frame, so map the rectangle across first.
		if (bindOptions.points) {
			const normalizedPoints = normalizePoints(bindOptions.points);
			const [displayedWidth, displayedHeight] = this.displayedSize(rotation);
			const pointsTransform = normalizedPoints
				? calculateTransformFromPoints(
						naturalRectToRotated(
							normalizedPoints,
							this.image.naturalWidth,
							this.image.naturalHeight,
							rotation,
						),
						displayedWidth,
						displayedHeight,
						this.options.viewport.width,
						this.options.viewport.height,
						{ min: this.effectiveMinZoom, max: this.zoomConfig.max },
					)
				: undefined;
			if (pointsTransform) {
				this.transform = { ...pointsTransform, rotation };
			} else {
				console.warn(
					"[@bayinformatics/croppie] Ignoring invalid initial points:",
					normalizedPoints,
				);
			}
		}

		this.constrainPosition();
		this.updateTransform();
		this.updateSlider();
		this.emitUpdate();
	}

	/**
	 * Binds a File or Blob to the cropper
	 */
	async bindFile(file: File | Blob): Promise<void> {
		this.assertNotDestroyed("bindFile");

		// Claim the generation before reading, so a bind() started while the file is
		// still being read supersedes this one
		const generation = ++this.bindGeneration;

		let dataUrl: string;
		try {
			dataUrl = await fileToDataUrl(file);
		} catch (error) {
			if (this.isStaleBind(generation)) return;
			throw error;
		}
		if (this.isStaleBind(generation)) return;

		await this.load({ url: dataUrl }, generation, 0);
	}

	/**
	 * Gets the current cropped result. The return type follows `options.type`:
	 * `"blob"` gives a `Blob`, `"base64"` a data URL string and `"canvas"` the canvas.
	 */
	result(options: ResultOptions & { type: "blob" }): Promise<Blob>;
	result(options: ResultOptions & { type: "base64" }): Promise<string>;
	result(
		options: ResultOptions & { type: "canvas" },
	): Promise<HTMLCanvasElement>;
	result(options: ResultOptions): Promise<Blob | string | HTMLCanvasElement>;
	async result(
		options: ResultOptions,
	): Promise<Blob | string | HTMLCanvasElement> {
		this.assertNotDestroyed("result");

		if (!this.image) {
			throw new Error("No image bound");
		}

		// The viewport rectangle in the displayed frame; the output canvas is in that
		// orientation, so its size comes from here
		const displayedFrame = this.getViewportRect();
		const viewport = this.options.viewport;
		const rotation = this.transform.rotation;

		// Determine output size
		let outputWidth: number;
		let outputHeight: number;

		if (options.size === "viewport") {
			outputWidth = viewport.width;
			outputHeight = viewport.height;
		} else if (options.size === "original") {
			// The displayed crop at image resolution, at a whole number of pixels
			outputWidth = Math.max(
				1,
				Math.round(displayedFrame.bottomRightX - displayedFrame.topLeftX),
			);
			outputHeight = Math.max(
				1,
				Math.round(displayedFrame.bottomRightY - displayedFrame.topLeftY),
			);
		} else if (options.size) {
			outputWidth = options.size.width;
			outputHeight = options.size.height;
		} else {
			outputWidth = viewport.width;
			outputHeight = viewport.height;
		}

		// drawCroppedImage samples the natural image, so hand it the frame in natural coordinates
		const canvas = drawCroppedImage(
			this.image,
			rotatedRectToNatural(
				displayedFrame,
				this.image.naturalWidth,
				this.image.naturalHeight,
				rotation,
			),
			outputWidth,
			outputHeight,
			{
				circle: options.circle ?? viewport.type === "circle",
				backgroundColor: options.backgroundColor,
				rotation,
			},
		);

		switch (options.type) {
			case "canvas":
				return canvas;
			case "base64":
				return canvasToBase64(canvas, options.format, options.quality);
			case "blob":
				return canvasToBlob(canvas, options.format, options.quality);
			default:
				throw new Error(`Unknown result type: ${options.type}`);
		}
	}

	/**
	 * Gets the current crop data
	 */
	get(): CroppieData {
		return {
			points: this.getPoints(),
			zoom: this.transform.scale,
			rotation: this.transform.rotation,
		};
	}

	/**
	 * Gets the current zoom level
	 */
	get zoom(): number {
		return this.transform.scale;
	}

	/**
	 * Sets the zoom level
	 */
	set zoom(value: number) {
		this.setZoom(value);
	}

	/**
	 * Sets the zoom level, clamped to the effective zoom limits. Zooms about the
	 * viewport centre. Emits `update` then `zoom` only when the clamped zoom changed;
	 * a non-finite value is ignored.
	 */
	setZoom(value: number): void {
		this.applyZoom(value);
	}

	/**
	 * The single path for every zoom change (setZoom, slider, wheel, pinch).
	 *
	 * Clamps the request to the effective limits, zooms about `anchor` so the image point
	 * under it stays put, re-clamps the position, syncs the slider and emits `update`
	 * then `zoom`. Nothing is emitted when the clamped zoom did not change.
	 *
	 * @param requested - Requested zoom level; not clamped by the caller
	 * @param anchor - Offset from the boundary centre to keep fixed (default: the viewport centre)
	 */
	private applyZoom(
		requested: number,
		anchor: ZoomAnchor = CENTER_ANCHOR,
	): void {
		if (this.destroyed || !Number.isFinite(requested)) return;

		const previousZoom = this.transform.scale;
		const zoom = clamp(requested, this.effectiveMinZoom, this.zoomConfig.max);

		if (zoom !== previousZoom) {
			this.transform = zoomAboutAnchor(this.transform, zoom, anchor);
			this.constrainPosition();
			this.updateTransform();
		}

		// Always sync, so a slider drag the clamp rejected snaps back
		this.updateSlider();

		if (zoom === previousZoom) return;

		this.emitUpdate();
		this.emitEvent("zoom", { zoom, previousZoom });
	}

	/**
	 * Rotates the image clockwise by `degrees`, any multiple of 90 (negative turns
	 * counter-clockwise). The image pixel under the viewport centre stays there.
	 *
	 * Emits `rotate`, then `update`, then `zoom` if the zoom had to change: the zoom limits are
	 * recomputed for the rotated image, so with a non-square viewport a quarter turn may raise
	 * the zoom to the new minimum. Rotating by a full turn or 0, before an image is bound or
	 * after `destroy()` does nothing. `points` in `get()` stay in the natural frame.
	 * Calling it while the user is dragging is not special-cased.
	 *
	 * @param degrees - Clockwise rotation in degrees
	 * @throws RangeError if `degrees` is not a finite multiple of 90
	 */
	rotate(degrees: number): void {
		const delta = normalizeRotation(degrees);
		if (this.destroyed || !this.image || delta === 0) return;

		const previousRotation = this.transform.rotation;
		const previousZoom = this.transform.scale;
		const rotation = ((previousRotation + delta) % 360) as Rotation;

		// The offset of the image centre from the viewport centre turns with the image
		const [x, y] = rotateOffset(this.transform.x, this.transform.y, delta);
		this.transform = { x, y, scale: previousZoom, rotation };

		// The displayed dimensions changed, so the zoom limits did too
		this.updateZoomLimits(this.image, rotation);
		if (this.transform.scale < this.effectiveMinZoom) {
			this.transform = zoomAboutAnchor(
				this.transform,
				this.effectiveMinZoom,
				CENTER_ANCHOR,
			);
		}

		this.constrainPosition();
		this.updateTransform();
		this.updateSlider();

		this.emitEvent("rotate", { rotation, previousRotation });
		this.emitUpdate();
		if (this.transform.scale !== previousZoom) {
			this.emitEvent("zoom", {
				zoom: this.transform.scale,
				previousZoom,
			});
		}
	}

	/**
	 * Resets the cropper to initial state
	 */
	reset(): void {
		if (this.destroyed) return;

		if (this.image) {
			const previousZoom = this.transform.scale;
			const previousRotation = this.transform.rotation;
			const rotation = this.initialRotation;
			const coverageZoom = this.updateZoomLimits(this.image, rotation);

			// Clamp to effective minimum zoom (same logic as bind)
			const initialZoom = clamp(
				coverageZoom,
				this.effectiveMinZoom,
				this.zoomConfig.max,
			);

			this.transform = { x: 0, y: 0, scale: initialZoom, rotation };
			this.constrainPosition();
			this.updateTransform();
			this.updateSlider();

			if (previousRotation !== rotation) {
				this.emitEvent("rotate", { rotation, previousRotation });
			}
			this.emitUpdate();

			if (previousZoom !== this.transform.scale) {
				this.emitEvent("zoom", {
					zoom: this.transform.scale,
					previousZoom,
				});
			}
		}
	}

	/**
	 * Destroys the cropper and cleans up
	 */
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		// Invalidate any bind that is still loading
		this.bindGeneration++;

		// Run all cleanup functions
		for (const cleanup of this.cleanupFns) {
			cleanup();
		}
		this.cleanupFns = [];

		// Clear event handlers
		this.eventHandlers.clear();

		// Remove DOM elements
		if (this.container?.parentNode) {
			this.container.parentNode.removeChild(this.container);
		}

		this.container = null;
		this.boundaryEl = null;
		this.viewportEl = null;
		this.overlayEl = null;
		this.previewEl = null;
		this.sliderEl = null;
		this.image = null;
	}

	/**
	 * Registers an event handler
	 */
	on<K extends keyof CroppieEvents>(
		event: K,
		handler: CroppieEventHandler<K>,
	): void {
		if (!this.eventHandlers.has(event)) {
			this.eventHandlers.set(event, new Set());
		}
		this.eventHandlers
			.get(event)
			?.add(handler as CroppieEventHandler<keyof CroppieEvents>);
	}

	/**
	 * Removes an event handler
	 */
	off<K extends keyof CroppieEvents>(
		event: K,
		handler: CroppieEventHandler<K>,
	): void {
		this.eventHandlers
			.get(event)
			?.delete(handler as CroppieEventHandler<keyof CroppieEvents>);
	}

	/**
	 * Throws if the instance was destroyed, naming the method that was called
	 */
	private assertNotDestroyed(method: string): void {
		if (this.destroyed) {
			throw new Error(
				`[@bayinformatics/croppie] ${method}() called on a destroyed instance`,
			);
		}
	}

	/**
	 * Whether a bind that claimed `generation` was destroyed or superseded in the meantime
	 */
	private isStaleBind(generation: number): boolean {
		return this.destroyed || generation !== this.bindGeneration;
	}

	/**
	 * Resolves the effective minimum zoom for an image shown at `rotation` (see
	 * `resolveMinZoom`) and syncs the slider's `min`, so the slider range is never inverted.
	 *
	 * @returns The zoom at which the displayed image covers the viewport
	 */
	private updateZoomLimits(
		image: HTMLImageElement,
		rotation: Rotation,
	): number {
		// Coverage and fit depend on the image as displayed, i.e. after the rotation
		const [displayedWidth, displayedHeight] = swapDims(
			image.naturalWidth,
			image.naturalHeight,
			rotation,
		);
		const { width, height } = this.options.viewport;
		const coverage = calculateInitialZoom(
			displayedWidth,
			displayedHeight,
			width,
			height,
		);

		this.effectiveMinZoom = resolveMinZoom({
			configuredMin: this.configuredMinZoom,
			max: this.zoomConfig.max,
			coverage,
			contain: calculateContainZoom(
				displayedWidth,
				displayedHeight,
				width,
				height,
			),
			enforceMinimumCoverage: this.zoomConfig.enforceMinimumCoverage !== false,
		});

		if (this.sliderEl) {
			this.sliderEl.min = String(this.effectiveMinZoom);
		}

		return coverage;
	}

	/**
	 * The dimensions of the image as displayed: the natural size, swapped for a quarter turn.
	 *
	 * @param rotation - Defaults to the current rotation
	 */
	private displayedSize(
		rotation: Rotation = this.transform.rotation,
	): [number, number] {
		return swapDims(
			this.image?.naturalWidth ?? 0,
			this.image?.naturalHeight ?? 0,
			rotation,
		);
	}

	/**
	 * Updates the CSS transform on the preview element.
	 *
	 * The `<img>` keeps its natural size with transform-origin 0 0, so the transform is
	 * `translate(tx, ty) scale(s) rotate(r)`. The rotation is about the displayed image's
	 * centre, which sits at `(x, y)` from the boundary centre, so
	 * `(tx, ty) = (B.w/2 + x, B.h/2 + y) - s * R(r)(W/2, H/2)`, written out per rotation.
	 */
	private updateTransform(): void {
		if (this.previewEl) {
			const boundaryWidth = this.options.boundary.width;
			const boundaryHeight = this.options.boundary.height;
			const { x, y, scale, rotation } = this.transform;

			// The natural image at the current scale
			const scaledWidth = (this.image?.naturalWidth ?? 0) * scale;
			const scaledHeight = (this.image?.naturalHeight ?? 0) * scale;

			let translateX: number;
			let translateY: number;
			switch (rotation) {
				case 90:
					translateX = (boundaryWidth + scaledHeight) / 2 + x;
					translateY = (boundaryHeight - scaledWidth) / 2 + y;
					break;
				case 180:
					translateX = (boundaryWidth + scaledWidth) / 2 + x;
					translateY = (boundaryHeight + scaledHeight) / 2 + y;
					break;
				case 270:
					translateX = (boundaryWidth - scaledHeight) / 2 + x;
					translateY = (boundaryHeight + scaledWidth) / 2 + y;
					break;
				default:
					translateX = (boundaryWidth - scaledWidth) / 2 + x;
					translateY = (boundaryHeight - scaledHeight) / 2 + y;
			}

			setTransform(this.previewEl, translateX, translateY, scale, rotation);
		}
	}

	/**
	 * Updates the slider value to match current zoom, and its spoken value ("150%")
	 */
	private updateSlider(): void {
		if (this.sliderEl) {
			this.sliderEl.value = String(this.transform.scale);
			this.sliderEl.setAttribute(
				"aria-valuetext",
				`${Math.round(this.transform.scale * 100)}%`,
			);
		}
	}

	/**
	 * Constrains the current position to keep the image covering the viewport
	 */
	private constrainPosition(): void {
		if (!this.image) return;

		const [displayedWidth, displayedHeight] = this.displayedSize();
		const bounds = calculateBounds(
			displayedWidth,
			displayedHeight,
			this.transform.scale,
			this.options.viewport.width,
			this.options.viewport.height,
		);

		this.transform.x = clamp(this.transform.x, bounds.minX, bounds.maxX);
		this.transform.y = clamp(this.transform.y, bounds.minY, bounds.maxY);
	}

	/**
	 * Calculates the crop points based on current transform, clamped to the image, in the
	 * natural frame (the pixel space of the image as decoded): the displayed-frame rectangle
	 * is clamped to the displayed image and then mapped back through the rotation.
	 */
	private getPoints(): CropPoints {
		if (!this.image) {
			return { topLeftX: 0, topLeftY: 0, bottomRightX: 0, bottomRightY: 0 };
		}

		const rect = this.getViewportRect();
		const [displayedWidth, displayedHeight] = this.displayedSize();

		return rotatedRectToNatural(
			{
				topLeftX: Math.max(0, rect.topLeftX),
				topLeftY: Math.max(0, rect.topLeftY),
				bottomRightX: Math.min(displayedWidth, rect.bottomRightX),
				bottomRightY: Math.min(displayedHeight, rect.bottomRightY),
			},
			this.image.naturalWidth,
			this.image.naturalHeight,
			this.transform.rotation,
		);
	}

	/**
	 * The viewport rectangle in the DISPLAYED frame (the image after rotation), in image
	 * pixels and NOT clamped to the image: it extends past the image when the user zoomed out
	 * further than the image covers. With `(Dw, Dh)` the displayed dimensions:
	 * `topLeft = (Dw/2 - (x + vw/2) / s, Dh/2 - (y + vh/2) / s)` and `bottomRight = topLeft +
	 * (vw, vh) / s`.
	 */
	private getViewportRect(): CropPoints {
		if (!this.image) {
			return { topLeftX: 0, topLeftY: 0, bottomRightX: 0, bottomRightY: 0 };
		}

		const viewport = this.options.viewport;
		const { x, y, scale } = this.transform;
		const [displayedWidth, displayedHeight] = this.displayedSize();

		const topLeftX = displayedWidth / 2 - (x + viewport.width / 2) / scale;
		const topLeftY = displayedHeight / 2 - (y + viewport.height / 2) / scale;

		return {
			topLeftX,
			topLeftY,
			bottomRightX: topLeftX + viewport.width / scale,
			bottomRightY: topLeftY + viewport.height / scale,
		};
	}

	/**
	 * Emits an update event
	 */
	private emitUpdate(): void {
		this.emitEvent("update", this.get());
	}

	/**
	 * Emits an event to all registered handlers
	 */
	private emitEvent<K extends keyof CroppieEvents>(
		event: K,
		data: CroppieEvents[K],
	): void {
		const handlers = this.eventHandlers.get(event);
		if (handlers) {
			for (const handler of handlers) {
				(handler as CroppieEventHandler<K>)(data);
			}
		}
	}
}
