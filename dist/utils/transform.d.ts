import type { TransformState } from "../types.js";
/**
 * A point to zoom about, as an offset in CSS pixels from the boundary center.
 * The viewport is centered in the boundary, so `{ x: 0, y: 0 }` is the viewport center.
 */
export interface ZoomAnchor {
    x: number;
    y: number;
}
/** Zoom about the viewport center. */
export declare const CENTER_ANCHOR: ZoomAnchor;
/**
 * Zoom to a new scale while keeping the image point under `anchor` fixed on screen.
 *
 * `transform.x`/`y` is the offset of the image center from the boundary center, so an
 * image point under screen offset `a` sits at `(a - x) / scale` from the image center.
 * Keeping it fixed, `(a - x') / s' = (a - x) / s`, gives with `r = s' / s`:
 *
 * ```
 * x' = a.x + (x - a.x) * r
 * y' = a.y + (y - a.y) * r
 * ```
 *
 * About the center this reduces to `x' = x * r`, so a freshly bound image (x = y = 0)
 * ends up exactly where plain scaling would put it.
 *
 * @param transform - Current transform; not mutated
 * @param newScale - The scale to zoom to (already clamped by the caller)
 * @param anchor - Point to keep fixed; defaults to the viewport center
 * @returns A new transform at `newScale`. If the current scale is not positive there is
 *   no reference point to preserve, so only the scale changes.
 */
export declare function zoomAboutAnchor(transform: TransformState, newScale: number, anchor?: ZoomAnchor): TransformState;
