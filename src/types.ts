/**
 * Viewport shape type - determines the cropping mask shape
 */
export type ViewportType = "circle" | "square";

/**
 * A quarter-turn rotation of the image, in degrees, clockwise.
 */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * Output format for the cropped image
 */
export type OutputFormat = "png" | "jpeg" | "webp";

/**
 * Output type - what format to return the result in
 */
export type OutputType = "blob" | "base64" | "canvas";

/**
 * Viewport configuration - defines the visible cropping area
 */
export interface Viewport {
	/** Width in pixels */
	width: number;
	/** Height in pixels */
	height: number;
	/** Shape of the viewport mask */
	type: ViewportType;
}

/**
 * Boundary configuration - defines the outer container
 */
export interface Boundary {
	/** Width in pixels */
	width: number;
	/** Height in pixels */
	height: number;
}

/**
 * Zoom configuration
 */
export interface ZoomConfig {
	/**
	 * Minimum zoom level. When unset, the minimum is derived per image: with
	 * `enforceMinimumCoverage` (the default) it is the zoom at which the image just covers
	 * the viewport, so a large photo can zoom out further than 0.1; without it, it is
	 * `min(0.1, the zoom at which the whole image fits)`. When set, it is a floor, and
	 * with `enforceMinimumCoverage` the effective minimum is `max(min, coverage zoom)`.
	 * The effective minimum never exceeds `max`.
	 */
	min: number;
	/** Maximum zoom level (default: 10) */
	max: number;
	/**
	 * @deprecated No effect: pass `bind({ url, zoom })` to start at a given zoom. Kept so
	 * existing configuration still compiles.
	 */
	initial?: number;
	/**
	 * Automatically enforce minimum zoom to ensure image covers viewport.
	 * When true, prevents zooming out so far that gaps appear.
	 * @default true
	 */
	enforceMinimumCoverage?: boolean;
}

/**
 * Main Croppie configuration options
 */
export interface CroppieOptions {
	/** Viewport (cropping area) configuration */
	viewport: Viewport;
	/** Boundary (container) configuration - defaults to viewport + padding */
	boundary?: Boundary;
	/** Zoom limits */
	zoom?: Partial<ZoomConfig>;
	/** Show zoom slider control */
	showZoomer?: boolean;
	/** Enable mouse wheel zoom */
	mouseWheelZoom?: boolean | "ctrl";
	/**
	 * Let the user zoom: the slider, the mouse wheel and pinch. When `false` none of them
	 * is attached (the slider is not rendered even if `showZoomer` is true), but
	 * `setZoom()` and the `zoom` property keep working.
	 * @default true
	 */
	enableZoom?: boolean;
	/**
	 * Read the EXIF Orientation tag of JPEGs bound with `bindFile()` or as data URLs and
	 * report it as `get().orientation`. Browsers already display such images upright, so
	 * this never rotates anything. Remote URLs are not read; use the exported
	 * `readJpegOrientation()` on bytes you fetched yourself.
	 */
	enableExif?: boolean;
	/**
	 * @deprecated No effect: `rotate()` is always available. Kept so v2 configuration still compiles.
	 */
	enableOrientation?: boolean;
	/** Enable resize handles on viewport */
	enableResize?: boolean;
	/** Custom CSS class for the container */
	customClass?: string;
}

/**
 * Crop points - the coordinates of the cropped region
 */
export interface CropPoints {
	/** Top-left X coordinate */
	topLeftX: number;
	/** Top-left Y coordinate */
	topLeftY: number;
	/** Bottom-right X coordinate */
	bottomRightX: number;
	/** Bottom-right Y coordinate */
	bottomRightY: number;
}

/**
 * Array format for crop points (v2.6 compatibility)
 * [topLeftX, topLeftY, bottomRightX, bottomRightY]
 */
export type PointsArray = [number, number, number, number];

/**
 * Current state of the cropper
 */
export interface CroppieData {
	/**
	 * Crop boundary points, in the natural frame: the pixel space of the image as the browser
	 * decoded it (EXIF orientation already applied). They are not rotated; `rotation` says how
	 * `result()` turns the crop.
	 */
	points: CropPoints;
	/** Current zoom level */
	zoom: number;
	/** Current clockwise rotation (always set by `get()`) */
	rotation?: Rotation;
	/**
	 * The EXIF Orientation tag (1-8) of the bound image when read via `enableExif`.
	 * Informational: it is never derived from `rotation` and never changed by `rotate()`.
	 */
	orientation?: number;
}

/**
 * Bind options - for loading an image
 */
export interface BindOptions {
	/** Image URL or data URL */
	url: string;
	/** Initial crop points (array [x1,y1,x2,y2] or object) */
	points?: CropPoints | PointsArray;
	/** Initial zoom level */
	zoom?: number;
	/**
	 * Initial clockwise rotation in degrees: any multiple of 90, positive or negative.
	 * `points` are given in the natural frame and are not affected by it.
	 */
	rotation?: number;
	/**
	 * EXIF orientation (1-8) override, mapped to a rotation (1 -> 0, 3 -> 180, 6 -> 90,
	 * 8 -> 270; mirrored values 2, 4, 5, 7 are ignored with a warning). For images whose
	 * tag was stripped; prefer `rotation`. An explicit `rotation` wins.
	 */
	orientation?: number;
}

/**
 * Result options - for exporting the cropped image
 */
export interface ResultOptions {
	/** Output type */
	type: OutputType;
	/**
	 * Output dimensions (default `"viewport"`). The image keeps its proportions: a size of
	 * another shape than the viewport centres the crop and leaves the rest transparent (or
	 * `backgroundColor`). `"original"` is the viewport area at image resolution, rounded to
	 * whole pixels; zoomed out past the image, it is scaled down to at most the area of the
	 * image part it shows or 4096x4096 px, whichever is larger.
	 */
	size?: { width: number; height: number } | "viewport" | "original";
	/** Output format (for base64/blob) */
	format?: OutputFormat;
	/** JPEG/WebP quality (0-1) */
	quality?: number;
	/** Include circular mask in output (for circle viewport) */
	circle?: boolean;
	/** Background color for transparent images */
	backgroundColor?: string;
}

/**
 * Event types emitted by Croppie
 */
export interface CroppieEvents {
	/** Fired when zoom/pan/rotation changes */
	update: CroppieData;
	/** Fired when zoom level changes */
	zoom: { zoom: number; previousZoom: number };
	/** Fired when the rotation changes (`rotate()`, or `reset()` restoring the bind-time rotation) */
	rotate: { rotation: Rotation; previousRotation: Rotation };
}

/**
 * Event handler type
 */
export type CroppieEventHandler<K extends keyof CroppieEvents> = (
	data: CroppieEvents[K],
) => void;

/**
 * Internal state for tracking transforms
 */
export interface TransformState {
	/** Current X translation */
	x: number;
	/** Current Y translation */
	y: number;
	/** Current scale/zoom */
	scale: number;
	/** Clockwise quarter-turn rotation of the image */
	rotation: Rotation;
}
