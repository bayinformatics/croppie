import type { ZoomAnchor } from "../utils/transform.js";
/**
 * Proposes a zoom level and the screen point to zoom about. The receiver (the Croppie
 * instance) owns clamping, the position constraint and events, so handlers never clamp
 * or emit.
 */
export type ZoomRequest = (zoom: number, anchor: ZoomAnchor) => void;
/** Zoom factor of one wheel notch (a Chrome mouse notch is 100 CSS px). */
export declare const WHEEL_FACTOR_PER_NOTCH = 1.1;
/** Pixel delta that counts as one notch. */
export declare const WHEEL_NOTCH_PX = 100;
/** Pixels per line when `deltaMode` is `DOM_DELTA_LINE`. */
export declare const WHEEL_LINE_PX = 16;
/** Pixels per page when `deltaMode` is `DOM_DELTA_PAGE`. */
export declare const WHEEL_PAGE_PX = 800;
/** Largest delta used from a single wheel event, so a fling cannot jump the zoom. */
export declare const WHEEL_MAX_PX = 100;
/**
 * The zoom factor for one wheel event: multiplicative, scaled by how far the wheel moved.
 *
 * The delta is normalized to pixels from `deltaMode`, capped to one notch, and then
 * `1.1 ** (-px / 100)`: a mouse notch zooms by 1.1 (up) or 1/1.1 (down) and a
 * trackpad's small deltas zoom smoothly. Scrolling up (negative `deltaY`) zooms in.
 */
export declare function wheelZoomFactor(event: Pick<WheelEvent, "deltaY" | "deltaMode">): number;
/**
 * Create and attach a wheel-based zoom handler to an element.
 *
 * Each wheel event proposes `currentZoom * wheelZoomFactor(event)` anchored at the
 * cursor. The handler does not clamp or emit anything: that is `requestZoom`'s job.
 *
 * @param element - The HTMLElement to attach the wheel listener to
 * @param getZoom - Function that returns the current zoom level
 * @param requestZoom - Receives the proposed zoom and the cursor anchor
 * @param options - `requireCtrl`: only respond while Ctrl is held (default: `false`)
 * @returns A cleanup function that removes the attached wheel listener
 */
export declare function createWheelZoomHandler(element: HTMLElement, getZoom: () => number, requestZoom: ZoomRequest, options?: {
    requireCtrl?: boolean;
}): () => void;
/**
 * Attaches pinch-to-zoom touch handlers to an element and returns a cleanup function.
 *
 * Only fingers that went down on the element count (a touch keeps the `target` it
 * started on, even after sliding off): a finger resting elsewhere on the page neither
 * turns a one-finger pan into a pinch nor blocks a pinch on the element.
 *
 * When exactly two such fingers are down, their distance and the current zoom are
 * captured; every move then proposes `initialZoom * distance / initialDistance`, anchored
 * at their midpoint. A zoom changed by something else mid-pinch (`bind()`, `reset()`,
 * `setZoom()`) becomes the new starting point instead of being overwritten by the next
 * move. Like the wheel handler it neither clamps nor emits.
 *
 * @param element - The target HTMLElement to attach touch listeners to.
 * @param getZoom - Function that returns the current zoom level.
 * @param requestZoom - Receives the proposed zoom and the finger-midpoint anchor.
 * @returns A function that removes the attached touch listeners from `element`.
 */
export declare function createPinchZoomHandler(element: HTMLElement, getZoom: () => number, requestZoom: ZoomRequest): () => void;
