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
	TransformState,
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
	normalizePoints,
	resolveMinZoom,
	setTransform,
	validateOptions,
	type ZoomAnchor,
	zoomAboutAnchor,
} from "./utils/index.js";

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
	private transform: TransformState = { x: 0, y: 0, scale: 1 };
	/**
	 * `options.zoom` with its defaults applied: `min` as given (undefined when unset, then the
	 * minimum is per image), `max` and `enforceMinimumCoverage` defaulted. An explicit
	 * `undefined` counts as unset.
	 */
	private readonly zoomConfig: {
		min: number | undefined;
		max: number;
		enforceMinimumCoverage: boolean;
	};
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

		// Field by field, not by spreading over defaults: an explicit `undefined` (such as
		// `zoom: { max: props.maxZoom }`) must get the default, as validateOptions() assumed
		this.zoomConfig = {
			min: options.zoom?.min,
			max: options.zoom?.max ?? DEFAULT_MAX_ZOOM,
			enforceMinimumCoverage: options.zoom?.enforceMinimumCoverage !== false,
		};

		// Deprecation warning for v2.6 migration
		if (options.enableOrientation !== undefined) {
			console.warn(
				"[@bayinformatics/croppie] enableOrientation is deprecated and has no effect. Rotation support is planned for a future release.",
			);
		}

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
				this.zoomConfig.min ?? DEFAULT_MIN_ZOOM,
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

		// The drag handler turns off every browser touch gesture on the boundary. Without
		// zoom there is no pinch handler, so give pinch-zoom back to the browser: a pinch
		// over the cropper then zooms the page instead of doing nothing
		if (!this.options.enableZoom) {
			this.boundaryEl.style.touchAction = "pinch-zoom";
		}

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
	 * Loads an image into the cropper.
	 *
	 * A `points` array without exactly 4 entries rejects before anything changes, so it
	 * neither half-applies the new image nor cancels a bind that is still loading.
	 */
	async bind(options: BindOptions | string): Promise<void> {
		this.assertNotDestroyed("bind");

		const bindOptions: BindOptions =
			typeof options === "string" ? { url: options } : options;

		// Validate before claiming a generation, so a bad call cannot supersede a good bind
		// or leave a half-applied image behind
		const points = bindOptions.points
			? normalizePoints(bindOptions.points)
			: undefined;

		await this.load(bindOptions, ++this.bindGeneration, points);
	}

	/**
	 * Loads and applies an image for a bind that claimed `generation`, with the `points` that
	 * `bind()` resolved from `bindOptions` before claiming it. If the instance was destroyed
	 * or a newer bind started meanwhile, resolves without applying or emitting anything, and
	 * without surfacing a load error nobody is waiting for any more.
	 */
	private async load(
		bindOptions: BindOptions,
		generation: number,
		points?: CropPoints,
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
			// Show the image we crop from. In the loader's CORS mode the browser reuses the image
			// it already loaded; in any other mode it requests the URL again, which costs a second
			// download and can return different pixels (e.g. a URL that serves a random image)
			this.previewEl.crossOrigin = this.image.crossOrigin;
			this.previewEl.src = this.image.src;
		}

		// Resolve the zoom limits for this image and sync the slider's min
		const coverageZoom = this.updateZoomLimits(this.image);

		// Calculate initial zoom. As in setZoom(), a numeric string is converted and a value
		// that is then not finite (NaN, ±Infinity) is ignored: the coverage zoom applies instead
		// of a NaN that no later zoom could repair
		const requestedZoom = Number(bindOptions.zoom ?? coverageZoom);
		const initialZoom = Number.isFinite(requestedZoom)
			? requestedZoom
			: coverageZoom;

		this.transform = {
			x: 0,
			y: 0,
			scale: clamp(initialZoom, this.effectiveMinZoom, this.zoomConfig.max),
		};

		// Apply initial points if provided
		if (points) {
			const pointsTransform = calculateTransformFromPoints(
				points,
				this.image.naturalWidth,
				this.image.naturalHeight,
				this.options.viewport.width,
				this.options.viewport.height,
				{ min: this.effectiveMinZoom, max: this.zoomConfig.max },
			);
			if (pointsTransform) {
				this.transform = pointsTransform;
			} else {
				console.warn(
					"[@bayinformatics/croppie] Ignoring invalid initial points:",
					points,
				);
			}
		}

		this.constrainPosition();
		this.updateTransform();
		this.updateSlider();
		this.emitUpdate();
	}

	/**
	 * Binds a File or Blob to the cropper. Anything else (such as the `undefined` of an
	 * empty file input) rejects with a `TypeError` before anything changes, so it does not
	 * cancel a bind that is still loading.
	 */
	async bindFile(file: File | Blob): Promise<void> {
		this.assertNotDestroyed("bindFile");

		// Validate before claiming a generation, so a bad call cannot supersede a good bind.
		// The tag check accepts a File or Blob from another realm (e.g. an iframe), which
		// fails `instanceof`
		const tag = Object.prototype.toString.call(file);
		if (
			!(file instanceof Blob) &&
			tag !== "[object Blob]" &&
			tag !== "[object File]"
		) {
			throw new TypeError(
				`[@bayinformatics/croppie] bindFile() expects a File or Blob (got ${String(file)})`,
			);
		}

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

		await this.load({ url: dataUrl }, generation);
	}

	/**
	 * Gets the current cropped result. The return type follows `options.type`:
	 * `"blob"` gives a `Blob`, `"base64"` a data URL string and `"canvas"` the canvas.
	 *
	 * The image keeps its proportions at every `size`: a size of another shape than the
	 * viewport centres the crop and leaves the rest transparent (or `backgroundColor`). With
	 * `size: "original"`, a crop zoomed out past the image is scaled down to at most the area
	 * of the image part it shows or 4096x4096 px, whichever is larger.
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

		const frame = this.getViewportRect();
		const viewport = this.options.viewport;

		// Determine output size
		let outputWidth: number;
		let outputHeight: number;

		if (options.size === "viewport") {
			outputWidth = viewport.width;
			outputHeight = viewport.height;
		} else if (options.size === "original") {
			// The frame at image resolution, at a whole number of pixels. A frame that
			// extends past the image (zoomed out, coverage not enforced) is scaled down until its
			// area is at most that of its overlap with the image or 4096x4096, whichever is
			// larger: the empty margin alone could exceed what browsers allocate for a canvas
			const { topLeftX, topLeftY, bottomRightX, bottomRightY } = frame;
			const { naturalWidth, naturalHeight } = this.image;
			const frameWidth = bottomRightX - topLeftX;
			const frameHeight = bottomRightY - topLeftY;
			const overlapWidth =
				Math.min(naturalWidth, bottomRightX) - Math.max(0, topLeftX);
			const overlapHeight =
				Math.min(naturalHeight, bottomRightY) - Math.max(0, topLeftY);
			const overlapArea =
				Math.max(0, overlapWidth) * Math.max(0, overlapHeight);
			const shrink = Math.min(
				1,
				Math.sqrt(
					Math.max(4096 * 4096, overlapArea) / (frameWidth * frameHeight),
				),
			);
			outputWidth = Math.max(1, Math.round(frameWidth * shrink));
			outputHeight = Math.max(1, Math.round(frameHeight * shrink));
		} else if (options.size) {
			outputWidth = options.size.width;
			outputHeight = options.size.height;
		} else {
			outputWidth = viewport.width;
			outputHeight = viewport.height;
		}

		const canvas = drawCroppedImage(
			this.image,
			frame,
			outputWidth,
			outputHeight,
			{
				circle: options.circle ?? viewport.type === "circle",
				backgroundColor: options.backgroundColor,
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
		};
	}

	/**
	 * Gets the current zoom level
	 */
	get zoom(): number {
		return this.transform.scale;
	}

	/**
	 * Sets the zoom level, exactly like `setZoom()`
	 */
	set zoom(value: number) {
		this.setZoom(value);
	}

	/**
	 * Sets the zoom level, clamped to the effective zoom limits. Zooms about the
	 * viewport centre. Emits `update` then `zoom` only when the clamped zoom changed.
	 * A numeric string (such as a range input's `value`) is converted to a number;
	 * a value that is then not finite is ignored.
	 */
	setZoom(value: number): void {
		this.applyZoom(Number(value));
	}

	/**
	 * The single path for every zoom change (setZoom, slider, wheel, pinch).
	 *
	 * Clamps the request to the effective limits, zooms about `anchor` so the image point
	 * under it stays put, re-clamps the position, syncs the slider and emits `update`
	 * then `zoom`. Nothing is emitted when the clamped zoom did not change. When an `update`
	 * listener zooms again, that nested call emits the final `zoom` and this one emits none,
	 * so `zoom` never reports a value that has already been replaced.
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
		// An update listener zoomed again: its nested call already emitted the final zoom
		if (this.transform.scale !== zoom) return;
		this.emitEvent("zoom", { zoom, previousZoom });
	}

	/**
	 * Rotates the image by 90 degree increments
	 */
	rotate(degrees: 90 | 180 | 270 | -90): void {
		// TODO: Implement rotation
		console.warn("Rotation not yet implemented:", degrees);
	}

	/**
	 * Resets the cropper to initial state
	 */
	reset(): void {
		if (this.destroyed) return;

		if (this.image) {
			const previousZoom = this.transform.scale;
			const coverageZoom = this.updateZoomLimits(this.image);

			// Clamp to effective minimum zoom (same logic as bind)
			const initialZoom = clamp(
				coverageZoom,
				this.effectiveMinZoom,
				this.zoomConfig.max,
			);

			this.transform = { x: 0, y: 0, scale: initialZoom };
			this.constrainPosition();
			this.updateTransform();
			this.updateSlider();
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
	 * Resolves the effective minimum zoom for an image (see `resolveMinZoom`) and syncs
	 * the slider's `min`, so the slider range is never inverted.
	 *
	 * @returns The zoom at which the image covers the viewport
	 */
	private updateZoomLimits(image: HTMLImageElement): number {
		const { naturalWidth, naturalHeight } = image;
		const { width, height } = this.options.viewport;
		const coverage = calculateInitialZoom(
			naturalWidth,
			naturalHeight,
			width,
			height,
		);

		this.effectiveMinZoom = resolveMinZoom({
			configuredMin: this.zoomConfig.min,
			max: this.zoomConfig.max,
			coverage,
			contain: calculateContainZoom(naturalWidth, naturalHeight, width, height),
			enforceMinimumCoverage: this.zoomConfig.enforceMinimumCoverage,
		});

		if (this.sliderEl) {
			this.sliderEl.min = String(this.effectiveMinZoom);
		}

		return coverage;
	}

	/**
	 * Updates the CSS transform on the preview element
	 */
	private updateTransform(): void {
		if (this.previewEl) {
			// Center the image in the boundary
			const boundaryWidth = this.options.boundary.width;
			const boundaryHeight = this.options.boundary.height;
			const imageWidth = this.image?.naturalWidth ?? 0;
			const imageHeight = this.image?.naturalHeight ?? 0;

			const scaledWidth = imageWidth * this.transform.scale;
			const scaledHeight = imageHeight * this.transform.scale;

			const centerX = (boundaryWidth - scaledWidth) / 2 + this.transform.x;
			const centerY = (boundaryHeight - scaledHeight) / 2 + this.transform.y;

			setTransform(this.previewEl, centerX, centerY, this.transform.scale);
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

		const bounds = calculateBounds(
			this.image.naturalWidth,
			this.image.naturalHeight,
			this.transform.scale,
			this.options.viewport.width,
			this.options.viewport.height,
		);

		this.transform.x = clamp(this.transform.x, bounds.minX, bounds.maxX);
		this.transform.y = clamp(this.transform.y, bounds.minY, bounds.maxY);
	}

	/**
	 * Calculates the crop points based on current transform, clamped to the image
	 */
	private getPoints(): CropPoints {
		if (!this.image) {
			return { topLeftX: 0, topLeftY: 0, bottomRightX: 0, bottomRightY: 0 };
		}

		const rect = this.getViewportRect();

		return {
			topLeftX: Math.max(0, rect.topLeftX),
			topLeftY: Math.max(0, rect.topLeftY),
			bottomRightX: Math.min(this.image.naturalWidth, rect.bottomRightX),
			bottomRightY: Math.min(this.image.naturalHeight, rect.bottomRightY),
		};
	}

	/**
	 * The viewport rectangle in image pixels, NOT clamped to the image: it extends past the
	 * image when the user zoomed out further than the image covers. `result()` renders this
	 * frame so the output keeps the image's proportions.
	 */
	private getViewportRect(): CropPoints {
		if (!this.image) {
			return { topLeftX: 0, topLeftY: 0, bottomRightX: 0, bottomRightY: 0 };
		}

		const viewport = this.options.viewport;
		const boundary = this.options.boundary;
		const imageWidth = this.image.naturalWidth;
		const imageHeight = this.image.naturalHeight;

		// Calculate the visible area in image coordinates
		const scaledWidth = imageWidth * this.transform.scale;
		const scaledHeight = imageHeight * this.transform.scale;

		const imageLeft = (boundary.width - scaledWidth) / 2 + this.transform.x;
		const imageTop = (boundary.height - scaledHeight) / 2 + this.transform.y;

		const viewportLeft = (boundary.width - viewport.width) / 2;
		const viewportTop = (boundary.height - viewport.height) / 2;

		// Convert viewport coordinates to image coordinates
		const topLeftX = (viewportLeft - imageLeft) / this.transform.scale;
		const topLeftY = (viewportTop - imageTop) / this.transform.scale;
		const bottomRightX = topLeftX + viewport.width / this.transform.scale;
		const bottomRightY = topLeftY + viewport.height / this.transform.scale;

		return { topLeftX, topLeftY, bottomRightX, bottomRightY };
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
