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
	BindFileOptions,
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
	capCanvasSize,
	clamp,
	DEFAULT_MAX_ZOOM,
	DEFAULT_MIN_ZOOM,
	describeUrl,
	exifOrientationToRotation,
	intersectFrame,
	loadImage,
	naturalRectToRotated,
	normalizePoints,
	normalizeRotation,
	positiveFinite,
	readBlobOrientation,
	readDataUrlOrientation,
	resolveMinZoom,
	rotatedRectToNatural,
	rotateOffset,
	setTransform,
	swapDims,
	validateOptions,
	type ZoomAnchor,
	zoomAboutAnchor,
} from "./utils/index.js";
import { toNumber } from "./utils/number.js";

/**
 * `normalizePoints()` for `bind()`: an array without exactly 4 entries gives `undefined`, so
 * `bind()` warns about it and ignores it like any other malformed points, instead of throwing.
 */
function readPoints(points: BindOptions["points"]): CropPoints | undefined {
	try {
		return normalizePoints(points);
	} catch {
		return undefined;
	}
}

/**
 * A value for an error message, never the whole of it: a string (such as a data URL passed
 * where a File belongs) is summarized like the URL of a failed image load, and an object or
 * function is named by its tag, since `String()` of one can be huge or throw.
 */
function describeValue(value: unknown): string {
	if (typeof value === "string") return describeUrl(value);
	if (
		(typeof value === "object" && value !== null) ||
		typeof value === "function"
	) {
		return Object.prototype.toString.call(value);
	}
	return String(value);
}

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
	private transform: TransformState = Croppie.initialTransform();
	/** The rotation `bind()` started with; `reset()` returns to it. */
	private initialRotation: Rotation = 0;
	/** The EXIF Orientation tag of the bound image (only read with `enableExif`); informational. */
	private exifOrientation: number | undefined;
	/** The object URL `bindFile()` made for the bound image; revoked once nothing shows it. */
	private objectUrl: string | undefined;
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
	/**
	 * The lowest zoom the user may reach: resolved per image on bind (see `resolveMinZoom`);
	 * before that, the configured or default minimum, capped at `zoom.max`.
	 */
	private effectiveMinZoom: number;
	/**
	 * The zoom at which the bound image just covers the viewport, stored with the zoom limits
	 * by `updateZoomLimits()`: where `bind()` starts by default and `reset()` returns to.
	 */
	private coverage = 1;

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

	/** The transform before any image is bound, and again after `destroy()`. */
	private static initialTransform(): TransformState {
		return { x: 0, y: 0, scale: 1, rotation: 0 };
	}

	constructor(element: HTMLElement, givenOptions: CroppieOptions) {
		// Dimensions and zoom limits given as numeric strings (data attributes) are numbers
		// from here on, so no string reaches the arithmetic
		const options = validateOptions(givenOptions);
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
		// A lone zoom.max below the default minimum is valid (the minimum is per image and
		// capped at max), so the placeholder until the first bind is capped at max too
		this.effectiveMinZoom = Math.min(
			this.zoomConfig.min ?? DEFAULT_MIN_ZOOM,
			this.zoomConfig.max,
		);
		// The zoom before any bind (what the slider starts at and zoom reports) stays within
		// those limits too: a zoom.max of 0.05 must not leave it at 1
		this.transform.scale = clamp(
			this.transform.scale,
			this.effectiveMinZoom,
			this.zoomConfig.max,
		);

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
				this.effectiveMinZoom,
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
			undefined,
			// Without zoom there is no pinch handler, so the browser keeps pinch-zoom: a pinch
			// over the cropper then zooms the page instead of doing nothing
			{ touchAction: this.options.enableZoom ? "none" : "pinch-zoom" },
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
	 * Loads an image into the cropper.
	 *
	 * A `rotation` that is not a multiple of 90 rejects before anything changes, so it
	 * neither half-applies the new image nor cancels a bind that is still loading.
	 * Malformed `points` (an array without exactly 4 entries, a coordinate that is not a
	 * number, a rect without width or height) are ignored with a console warning, and the
	 * image gets its default framing.
	 *
	 * Only the newest bind applies its image. A bind that a later `bind()` or `bindFile()`
	 * supersedes while it loads rejects with a `DOMException` named `AbortError`
	 * ("bind() was superseded by a later bind() call"), and so does one whose instance is
	 * destroyed meanwhile ("instance destroyed during bind()"). A call on a destroyed instance
	 * rejects at once without superseding anything.
	 */
	async bind(options: BindOptions | string): Promise<void> {
		this.assertNotDestroyed("bind");

		const bindOptions: BindOptions =
			typeof options === "string" ? { url: options } : options;

		// Validate and read before claiming a generation. An invalid rotation rejects, so a bad
		// call cannot supersede a good bind or leave a half-applied image behind. Reading the
		// points cannot throw: an array without exactly 4 entries is malformed like a NaN
		// coordinate, and is ignored with the same warning in load(); the bind itself goes on,
		// and like any bind it supersedes an older one
		const rotation = this.resolveBindRotation(bindOptions);
		const points = readPoints(bindOptions.points);

		await this.runBind(
			++this.bindGeneration,
			() => bindOptions.url,
			(image) => this.load(image, bindOptions, rotation, points),
		);
	}

	/**
	 * The rotation a bind starts with: the validated `rotation` option; else the rotation an
	 * explicit `orientation` (EXIF 1-8) stands for; else 0. Mirrored or out-of-range
	 * orientations cannot be expressed as a rotation, so they are ignored with a warning.
	 *
	 * @throws RangeError if `bindOptions.rotation` is not a multiple of 90
	 */
	private resolveBindRotation(bindOptions: BindFileOptions): Rotation {
		if (bindOptions.rotation !== undefined) {
			return normalizeRotation(bindOptions.rotation);
		}
		if (bindOptions.orientation === undefined) return 0;

		const rotation = exifOrientationToRotation(bindOptions.orientation);
		if (rotation === undefined) {
			console.warn(
				`[@bayinformatics/croppie] Ignoring bind({ orientation: ${bindOptions.orientation} }): only the EXIF orientations 1, 3, 6 and 8 can be expressed as a rotation`,
			);
			return 0;
		}
		return rotation;
	}

	/**
	 * The asynchronous part of every bind, for the bind that claimed `generation` (`bind()`
	 * and `bindFile()` validate their arguments before claiming it, so a call they reject
	 * supersedes nothing): produces the image URL (`bindFile()` reads it from the file), loads
	 * the image, then hands it and its URL to `apply`.
	 *
	 * Only the newest bind applies anything. Once a later bind claimed a generation, or the
	 * instance was destroyed, the next step rejects with an `AbortError` instead, whether it
	 * succeeded or failed: the caller learns that its image was not applied, and a load error
	 * nobody waits for any more is not reported as such.
	 *
	 * @param generation - The generation the bind claimed
	 * @param produceUrl - Gives the URL of the image to load
	 * @param apply - Applies the loaded image; runs only while the bind is the newest
	 */
	private async runBind(
		generation: number,
		produceUrl: () => string | Promise<string>,
		apply: (image: HTMLImageElement, url: string) => void,
	): Promise<void> {
		const url = await this.whileNewest(generation, produceUrl());
		const image = await this.whileNewest(generation, loadImage(url));
		apply(image, url);
	}

	/**
	 * Settles like `step` while the bind that claimed `generation` is still the newest, and
	 * rejects with an `AbortError` once it is not (see `runBind()`).
	 */
	private async whileNewest<T>(
		generation: number,
		step: T | Promise<T>,
	): Promise<T> {
		let value: T;
		try {
			value = await step;
		} catch (error) {
			this.assertNewestBind(generation);
			throw error;
		}
		this.assertNewestBind(generation);
		return value;
	}

	/**
	 * Throws an `AbortError` `DOMException` if the instance was destroyed or a later bind
	 * claimed a generation after the bind that claimed `generation`.
	 */
	private assertNewestBind(generation: number): void {
		if (this.destroyed) {
			throw new DOMException("instance destroyed during bind()", "AbortError");
		}
		if (generation !== this.bindGeneration) {
			throw new DOMException(
				"bind() was superseded by a later bind() call",
				"AbortError",
			);
		}
	}

	/**
	 * Applies a loaded image with the bind's `bindOptions` (its URL, zoom and points), and the
	 * `rotation` and (natural-frame) `points` resolved from them before the bind claimed its
	 * generation (`points` is `undefined` when malformed).
	 *
	 * @throws Error if the image has no intrinsic size
	 */
	private load(
		image: HTMLImageElement,
		bindOptions: BindOptions,
		rotation: Rotation,
		points?: CropPoints,
		file?: { orientation: number | undefined },
	): void {
		// A 0x0 image (e.g. an SVG without a size) would make every zoom calculation Infinity
		if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) {
			throw new Error(
				"[@bayinformatics/croppie] Image has no intrinsic size (0×0); cannot bind",
			);
		}
		this.image = image;

		// The previous file's object URL is no longer shown or cropped from
		this.revokeObjectUrl();
		if (file) this.objectUrl = bindOptions.url;

		if (this.previewEl) {
			// Show the image we crop from. In the loader's CORS mode the browser can reuse the image
			// it already loaded (when the response is cacheable); in any other mode it requests the
			// URL again, which can cost a second download and return different pixels (e.g. a URL
			// that serves a random image)
			this.previewEl.crossOrigin = this.image.crossOrigin;
			this.previewEl.src = this.image.src;
		}

		// A file's tag was read from its first bytes, a data URL's comes from its prefix. The
		// browser has already oriented the pixels, so it is only reported, never applied
		this.exifOrientation = this.options.enableExif
			? file
				? file.orientation
				: readDataUrlOrientation(bindOptions.url)
			: undefined;
		// Warn only when the turn came from `orientation`: an explicit `rotation` wins over it,
		// and orientation 1 or an ignored value turns nothing
		if (
			bindOptions.rotation === undefined &&
			rotation !== 0 &&
			this.exifOrientation !== undefined &&
			this.exifOrientation !== 1
		) {
			console.warn(
				`[@bayinformatics/croppie] bind({ orientation: ${bindOptions.orientation} }) is applied on top of the file's own EXIF orientation (${this.exifOrientation}), which browsers already honor; the image may end up rotated twice. The explicit orientation wins.`,
			);
		}

		// Resolve the zoom limits (from the displayed dimensions) and sync the slider's min
		this.initialRotation = rotation;
		const coverageZoom = this.updateZoomLimits(rotation);

		// Calculate initial zoom. As in setZoom(), a numeric string is converted and a value
		// that is then not finite (NaN, ±Infinity, a blank or non-numeric string) is ignored:
		// the coverage zoom applies instead of a NaN that no later zoom could repair
		const requestedZoom = toNumber(bindOptions.zoom ?? coverageZoom);
		const initialZoom = Number.isFinite(requestedZoom)
			? requestedZoom
			: coverageZoom;

		this.transform = {
			x: 0,
			y: 0,
			scale: clamp(initialZoom, this.effectiveMinZoom, this.zoomConfig.max),
			rotation,
		};

		// Apply initial points if provided. They are in the natural frame; the transform
		// works in the displayed (rotated) frame, so map the rectangle across first.
		if (bindOptions.points) {
			const [displayedWidth, displayedHeight] = this.displayedSize(rotation);
			const pointsTransform = points
				? calculateTransformFromPoints(
						naturalRectToRotated(
							points,
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
					bindOptions.points,
				);
			}
		}

		this.constrainPosition();
		this.updateTransform();
		this.updateSlider();
		this.emitUpdate();
	}

	/**
	 * Binds a File or Blob to the cropper, with the same `options` as `bind()` except `url`:
	 * `rotation`, `orientation`, `points` and `zoom` apply exactly as there (an invalid
	 * `rotation` rejects with a `RangeError` before anything changes; malformed `points` are
	 * ignored with a warning), so a file can be bound back with the data `get()` returned.
	 *
	 * Anything else than a File or Blob (such as the `undefined` of an empty file input)
	 * rejects with a `TypeError` before anything changes, so it does not cancel a bind that is
	 * still loading. Like `bind()`, it rejects with an `AbortError` when a later bind
	 * supersedes it or the instance is destroyed while the file loads.
	 */
	async bindFile(
		file: File | Blob,
		options: BindFileOptions = {},
	): Promise<void> {
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
				`[@bayinformatics/croppie] bindFile() expects a File or Blob (got ${describeValue(file)})`,
			);
		}

		// Validate and read the options like bind() does, before claiming a generation
		const rotation = this.resolveBindRotation(options);
		const points = readPoints(options.points);

		// Claim the generation before reading, so a bind() started while the file is
		// still being read supersedes this one
		let orientation: number | undefined;
		let objectUrl: string | undefined;
		try {
			await this.runBind(
				++this.bindGeneration,
				async () => {
					// Only the first 256 KiB of the file, and only for enableExif
					if (this.options.enableExif) {
						orientation = await readBlobOrientation(file);
					}
					// An object URL hands the browser the file itself. A base64 data URL of a large
					// photo is a string of tens of megabytes that WebKit pays for on every repaint,
					// which made dragging a 48 MP photo take ~600 ms per frame in Safari.
					objectUrl = URL.createObjectURL(file);
					return objectUrl;
				},
				(image, url) =>
					this.load(image, { ...options, url }, rotation, points, {
						orientation,
					}),
			);
		} finally {
			// Superseded, failed, or destroyed before it was shown: nothing else will revoke it
			if (objectUrl !== undefined && this.objectUrl !== objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		}
	}

	/**
	 * Gets the current cropped result. The return type follows `options.type`:
	 * `"blob"` gives a `Blob`, `"base64"` a data URL string and `"canvas"` the canvas.
	 *
	 * The image keeps its proportions at every `size`: a size of another shape than the
	 * viewport centers the crop and leaves the rest transparent (or `backgroundColor`). An
	 * `"original"` or custom size is scaled down, keeping its shape, to at most 16,777,216 px
	 * (4096x4096) and 16,384 px a side, so the canvas stays within what browsers can allocate
	 * (iOS Safari draws nothing on a larger one), and rounded to whole pixels. A custom
	 * width or height that is not a positive finite number rejects with a `RangeError`.
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

		// Determine output size. 'original' (the frame at image resolution) and a custom size
		// are capped to a canvas browsers can allocate, keeping their shape
		let outputWidth: number;
		let outputHeight: number;

		if (options.size === "original") {
			({ width: outputWidth, height: outputHeight } = capCanvasSize(
				displayedFrame.bottomRightX - displayedFrame.topLeftX,
				displayedFrame.bottomRightY - displayedFrame.topLeftY,
			));
		} else if (options.size && options.size !== "viewport") {
			// A size that is not a positive finite number would give a 0-wide canvas and a
			// misleading encoding error later
			({ width: outputWidth, height: outputHeight } = capCanvasSize(
				positiveFinite("size.width", options.size.width),
				positiveFinite("size.height", options.size.height),
			));
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

		// A "canvas" result belongs to the caller. Any other output canvas is dead once encoded,
		// so free its pixels now rather than at garbage collection (iOS caps canvas memory)
		if (options.type === "canvas") return canvas;
		try {
			switch (options.type) {
				case "base64":
					return canvasToBase64(canvas, options.format, options.quality);
				case "blob":
					return await canvasToBlob(canvas, options.format, options.quality);
				default:
					throw new Error(`Unknown result type: ${options.type}`);
			}
		} finally {
			canvas.width = 0;
			canvas.height = 0;
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
			...(this.exifOrientation !== undefined && {
				orientation: this.exifOrientation,
			}),
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
	 * viewport center. Emits `update` then `zoom` only when the clamped zoom changed.
	 * A numeric string (such as a range input's `value`) is converted to a number;
	 * a value that is then not finite, a blank string included, is ignored.
	 */
	setZoom(value: number): void {
		this.applyZoom(toNumber(value));
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
	 * @param anchor - Offset from the boundary center to keep fixed (default: the viewport center)
	 * @returns Whether the zoom changed, in which case `update` was emitted
	 */
	private applyZoom(
		requested: number,
		anchor: ZoomAnchor = CENTER_ANCHOR,
	): boolean {
		if (this.destroyed || !Number.isFinite(requested)) return false;

		const previousZoom = this.transform.scale;
		const zoom = clamp(requested, this.effectiveMinZoom, this.zoomConfig.max);

		if (zoom !== previousZoom) {
			this.transform = zoomAboutAnchor(this.transform, zoom, anchor);
			this.constrainPosition();
			this.updateTransform();
		}

		// Always sync, so a slider drag the clamp rejected snaps back
		this.updateSlider();

		if (zoom === previousZoom) return false;

		this.emitUpdate();
		// An update listener zoomed again: its nested call already emitted the final zoom
		if (this.transform.scale === zoom) {
			this.emitEvent("zoom", { zoom, previousZoom });
		}
		return true;
	}

	/**
	 * Rotates the image clockwise by `degrees`, any multiple of 90 (negative turns
	 * counter-clockwise). The image pixel under the viewport center stays there, unless the
	 * rotated image would then no longer cover the viewport; then the image moves the least
	 * needed.
	 *
	 * Emits `rotate`, then `update`, then `zoom` if the zoom had to change: the zoom limits are
	 * recomputed for the rotated image, so with a non-square viewport a quarter turn may raise
	 * the zoom to the new minimum. As with `setZoom()`, when an `update` listener zooms again,
	 * only its final zoom is reported. Rotating by a full turn or 0, before an image is bound or
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

		// The offset of the image center from the viewport center turns with the image
		const [x, y] = rotateOffset(this.transform.x, this.transform.y, delta);
		this.transform = { x, y, scale: previousZoom, rotation };

		// The displayed dimensions changed, so the zoom limits did too
		this.updateZoomLimits(rotation);
		if (this.transform.scale < this.effectiveMinZoom) {
			this.transform = zoomAboutAnchor(
				this.transform,
				this.effectiveMinZoom,
				CENTER_ANCHOR,
			);
		}

		this.commitTurn(previousRotation, previousZoom);
	}

	/**
	 * Restores the rotation `bind()` started with, re-centers the image and returns to the
	 * coverage zoom of that rotation (clamped to the zoom limits).
	 *
	 * Emits `rotate` when the rotation changed, then `update`, then `zoom` when the zoom
	 * changed. As with `setZoom()`, when an `update` listener zooms again, only its final zoom
	 * is reported.
	 */
	reset(): void {
		if (this.destroyed || !this.image) return;

		const previousZoom = this.transform.scale;
		const previousRotation = this.transform.rotation;
		const rotation = this.initialRotation;

		// Back to the bind-time rotation, centered, at its coverage zoom. A different rotation
		// changes the displayed dimensions, so the zoom limits and the stored coverage zoom are
		// refreshed for it first
		if (rotation !== previousRotation) {
			this.updateZoomLimits(rotation);
		}
		this.transform = {
			x: 0,
			y: 0,
			scale: clamp(this.coverage, this.effectiveMinZoom, this.zoomConfig.max),
			rotation,
		};

		this.commitTurn(previousRotation, previousZoom);
	}

	/**
	 * Shows the rotation, position and zoom that `rotate()` or `reset()` settled, then emits
	 * their events in the documented order: `rotate` when the rotation changed, `update`, and
	 * `zoom` when the settled zoom differs from `previousZoom`.
	 *
	 * Like `applyZoom()`, the `zoom` event is decided from the zoom settled here, before any
	 * listener runs: when a listener zooms again, its nested call already emitted the final
	 * zoom and this one emits none, so `zoom` never reports a value that was already replaced.
	 */
	private commitTurn(previousRotation: Rotation, previousZoom: number): void {
		this.constrainPosition();
		this.updateTransform();
		this.updateSlider();

		const { rotation, scale: zoom } = this.transform;
		if (rotation !== previousRotation) {
			this.emitEvent("rotate", { rotation, previousRotation });
		}
		this.emitUpdate();
		if (zoom !== previousZoom && this.transform.scale === zoom) {
			this.emitEvent("zoom", { zoom, previousZoom });
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
		this.revokeObjectUrl();

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
		// get() and the zoom getter report the initial zoom next to the zeroed points, and no
		// EXIF orientation: that tag belonged to the image that is gone
		this.exifOrientation = undefined;
		this.initialRotation = 0;
		this.transform = Croppie.initialTransform();
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
	 * Revokes the object URL of a bound file, if there is one
	 */
	private revokeObjectUrl(): void {
		if (this.objectUrl === undefined) return;
		URL.revokeObjectURL(this.objectUrl);
		this.objectUrl = undefined;
	}

	/**
	 * Resolves the effective minimum zoom for the bound image shown at `rotation` (see
	 * `resolveMinZoom`), stores it with the coverage zoom of the image as displayed (the one
	 * place both are computed), and syncs the slider's `min`, so the slider range is never
	 * inverted.
	 *
	 * @returns The zoom at which the displayed image covers the viewport
	 */
	private updateZoomLimits(rotation: Rotation): number {
		// Coverage and fit depend on the image as displayed, i.e. after the rotation
		const [displayedWidth, displayedHeight] = this.displayedSize(rotation);
		const { width, height } = this.options.viewport;
		const coverage = calculateInitialZoom(
			displayedWidth,
			displayedHeight,
			width,
			height,
		);
		this.coverage = coverage;

		this.effectiveMinZoom = resolveMinZoom({
			configuredMin: this.zoomConfig.min,
			max: this.zoomConfig.max,
			coverage,
			contain: calculateContainZoom(
				displayedWidth,
				displayedHeight,
				width,
				height,
			),
			enforceMinimumCoverage: this.zoomConfig.enforceMinimumCoverage,
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
	 * center, which sits at `(x, y)` from the boundary center, so
	 * `(tx, ty) = (B.w/2 + x, B.h/2 + y) - s * R(r)(W/2, H/2)`, with `R` from `rotateOffset()`.
	 */
	private updateTransform(): void {
		if (this.previewEl) {
			const boundaryWidth = this.options.boundary.width;
			const boundaryHeight = this.options.boundary.height;
			const { x, y, scale, rotation } = this.transform;

			// The natural image at the current scale
			const scaledWidth = (this.image?.naturalWidth ?? 0) * scale;
			const scaledHeight = (this.image?.naturalHeight ?? 0) * scale;

			// s * R(r)(W/2, H/2): the image center's offset from the top-left corner the
			// transform origin pins, turned with the image
			const [centerX, centerY] = rotateOffset(
				scaledWidth / 2,
				scaledHeight / 2,
				rotation,
			);
			const translateX = boundaryWidth / 2 - centerX + x;
			const translateY = boundaryHeight / 2 - centerY + y;

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
		const frame = this.getViewportRect();
		// Without an image the frame is already the empty rectangle
		if (!this.image) return frame;

		const [displayedWidth, displayedHeight] = this.displayedSize();

		return rotatedRectToNatural(
			intersectFrame(frame, displayedWidth, displayedHeight),
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
