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
	calculateInitialZoom,
	calculateTransformFromPoints,
	clamp,
	fileToDataUrl,
	loadImage,
	normalizePoints,
	setTransform,
	type ZoomAnchor,
	zoomAboutAnchor,
} from "./utils/index.js";

const DEFAULT_ZOOM: ZoomConfig = {
	min: 0.1,
	max: 10,
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
	private transform: TransformState = { x: 0, y: 0, scale: 1 };
	private zoomConfig: ZoomConfig;
	private effectiveMinZoom = 0.1;

	// Event handlers
	private eventHandlers: Map<
		keyof CroppieEvents,
		Set<CroppieEventHandler<keyof CroppieEvents>>
	> = new Map();

	// Cleanup functions
	private cleanupFns: Array<() => void> = [];

	constructor(element: HTMLElement, options: CroppieOptions) {
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

		this.zoomConfig = {
			...DEFAULT_ZOOM,
			...options.zoom,
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
				this.zoomConfig.min,
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
		const bindOptions: BindOptions =
			typeof options === "string" ? { url: options } : options;

		this.image = await loadImage(bindOptions.url);

		if (this.previewEl) {
			// Show the image we crop from. In the loader's CORS mode the browser reuses the image
			// it already loaded; in any other mode it requests the URL again, which costs a second
			// download and can return different pixels (e.g. a URL that serves a random image)
			this.previewEl.crossOrigin = this.image.crossOrigin;
			this.previewEl.src = this.image.src;
		}

		// Calculate minimum zoom to cover viewport
		const coverageZoom = calculateInitialZoom(
			this.image.naturalWidth,
			this.image.naturalHeight,
			this.options.viewport.width,
			this.options.viewport.height,
		);

		// Calculate effective min zoom (enforce coverage by default)
		if (this.zoomConfig.enforceMinimumCoverage !== false) {
			this.effectiveMinZoom = Math.max(this.zoomConfig.min, coverageZoom);
		} else {
			this.effectiveMinZoom = this.zoomConfig.min;
		}

		// Calculate initial zoom
		const initialZoom = bindOptions.zoom ?? coverageZoom;

		this.transform = {
			x: 0,
			y: 0,
			scale: clamp(initialZoom, this.effectiveMinZoom, this.zoomConfig.max),
		};

		// Update slider min to reflect effective minimum
		if (this.sliderEl) {
			this.sliderEl.min = String(this.effectiveMinZoom);
		}

		// Apply initial points if provided
		if (bindOptions.points) {
			const normalizedPoints = normalizePoints(bindOptions.points);
			const pointsTransform = normalizedPoints
				? calculateTransformFromPoints(
						normalizedPoints,
						this.image.naturalWidth,
						this.image.naturalHeight,
						this.options.viewport.width,
						this.options.viewport.height,
						{ min: this.effectiveMinZoom, max: this.zoomConfig.max },
					)
				: undefined;
			if (pointsTransform) {
				this.transform = pointsTransform;
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
		const dataUrl = await fileToDataUrl(file);
		await this.bind({ url: dataUrl });
	}

	/**
	 * Gets the current cropped result
	 */
	async result(
		options: ResultOptions,
	): Promise<Blob | string | HTMLCanvasElement> {
		if (!this.image) {
			throw new Error("No image bound");
		}

		const points = this.getPoints();
		const viewport = this.options.viewport;

		// Determine output size
		let outputWidth: number;
		let outputHeight: number;

		if (options.size === "viewport") {
			outputWidth = viewport.width;
			outputHeight = viewport.height;
		} else if (options.size === "original") {
			outputWidth = points.bottomRightX - points.topLeftX;
			outputHeight = points.bottomRightY - points.topLeftY;
		} else if (options.size) {
			outputWidth = options.size.width;
			outputHeight = options.size.height;
		} else {
			outputWidth = viewport.width;
			outputHeight = viewport.height;
		}

		const canvas = drawCroppedImage(
			this.image,
			points,
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
		if (!Number.isFinite(requested)) return;

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
		if (this.image) {
			const previousZoom = this.transform.scale;
			const coverageZoom = calculateInitialZoom(
				this.image.naturalWidth,
				this.image.naturalHeight,
				this.options.viewport.width,
				this.options.viewport.height,
			);

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
	 * Updates the slider value to match current zoom
	 */
	private updateSlider(): void {
		if (this.sliderEl) {
			this.sliderEl.value = String(this.transform.scale);
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
	 * Calculates the crop points based on current transform
	 */
	private getPoints(): CropPoints {
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

		return {
			topLeftX: Math.max(0, topLeftX),
			topLeftY: Math.max(0, topLeftY),
			bottomRightX: Math.min(imageWidth, bottomRightX),
			bottomRightY: Math.min(imageHeight, bottomRightY),
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
