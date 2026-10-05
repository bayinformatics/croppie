/** Default minimum zoom, used when `zoom.min` is not configured. */
export declare const DEFAULT_MIN_ZOOM = 0.1;
/** Default maximum zoom, used when `zoom.max` is not configured. */
export declare const DEFAULT_MAX_ZOOM = 10;
export interface MinZoomInput {
    /** `options.zoom.min` as given by the caller; `undefined` when unset. */
    configuredMin: number | undefined;
    /** The maximum zoom. */
    max: number;
    /** Zoom at which the image just covers the viewport (the larger ratio). */
    coverage: number;
    /** Zoom at which the whole image fits inside the viewport (the smaller ratio). */
    contain: number;
    /** `zoom.enforceMinimumCoverage !== false`. */
    enforceMinimumCoverage: boolean;
}
/**
 * Resolve the lowest zoom the user may reach for the bound image.
 *
 * ```
 * enforce (default): floor = configuredMin !== undefined ? max(configuredMin, coverage) : coverage
 * no enforce:        floor = configuredMin ?? min(0.1, contain)
 * result = min(floor, max)
 * ```
 *
 * With coverage enforced and `zoom.min` unset the floor is the per-image coverage zoom, so
 * a large photo (coverage below 0.1) can zoom out until it just covers the viewport instead
 * of being stopped at an unreachable 0.1. The result never exceeds `max`: a small image
 * whose coverage zoom is above `max` would otherwise give an inverted slider range
 * (`min > max`).
 */
export declare function resolveMinZoom(input: MinZoomInput): number;
/**
 * Largest canvas `result()` renders, in pixels: 4096x4096. iOS Safari cannot allocate a
 * larger canvas (it draws nothing, and `toBlob()` gives `null`).
 */
export declare const MAX_CANVAS_AREA = 16777216;
/** Longest canvas side `result()` renders, in pixels. */
export declare const MAX_CANVAS_SIDE = 16384;
/**
 * The canvas size for an output of `width` x `height` pixels: scaled down, keeping its
 * shape, until it is at most {@link MAX_CANVAS_AREA} pixels and {@link MAX_CANVAS_SIDE}
 * pixels a side, then rounded to whole pixels (at least 1). A size within the caps is only
 * rounded. Rounding never takes the size over a cap: when rounding to the nearest pixel
 * would, both sides are rounded down instead.
 *
 * @param width - Requested width in pixels (positive and finite)
 * @param height - Requested height in pixels (positive and finite)
 * @returns The canvas width and height
 */
export declare function capCanvasSize(width: number, height: number): {
    width: number;
    height: number;
};
