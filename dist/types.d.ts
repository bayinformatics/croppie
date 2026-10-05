/**
 * Viewport shape type - determines the cropping mask shape
 */
export type ViewportType = "circle" | "square";
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
    /** Enable EXIF orientation correction */
    enableExif?: boolean;
    /**
     * @deprecated Use rotate() method instead. This option is a no-op for v2.6 migration compatibility.
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
    /** Crop boundary points */
    points: CropPoints;
    /** Current zoom level */
    zoom: number;
    /** Current rotation in degrees */
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
    /** EXIF orientation (1-8) */
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
     * another shape than the viewport centers the crop and leaves the rest transparent (or
     * `backgroundColor`). `"original"` is the viewport area at image resolution. An
     * `"original"` or custom size is scaled down, keeping its shape, to at most 16,777,216 px
     * (4096x4096) and 16,384 px a side, then rounded to whole pixels.
     */
    size?: {
        width: number;
        height: number;
    } | "viewport" | "original";
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
    /** Fired when zoom/pan changes */
    update: CroppieData;
    /** Fired when zoom level changes */
    zoom: {
        zoom: number;
        previousZoom: number;
    };
}
/**
 * Event handler type
 */
export type CroppieEventHandler<K extends keyof CroppieEvents> = (data: CroppieEvents[K]) => void;
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
}
