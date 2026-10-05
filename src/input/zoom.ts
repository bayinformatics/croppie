import { clamp } from "../utils/clamp.js";
import { anchorFromClientPoint } from "../utils/dom.js";
import type { ZoomAnchor } from "../utils/transform.js";

/**
 * Proposes a zoom level and the screen point to zoom about. The receiver (the Croppie
 * instance) owns clamping, the position constraint and events, so handlers never clamp
 * or emit.
 */
export type ZoomRequest = (zoom: number, anchor: ZoomAnchor) => void;

/** Zoom factor of one wheel notch (a Chrome mouse notch is 100 CSS px). */
export const WHEEL_FACTOR_PER_NOTCH = 1.1;
/** Pixel delta that counts as one notch. */
export const WHEEL_NOTCH_PX = 100;
/** Pixels per line when `deltaMode` is `DOM_DELTA_LINE`. */
export const WHEEL_LINE_PX = 16;
/** Pixels per page when `deltaMode` is `DOM_DELTA_PAGE`. */
export const WHEEL_PAGE_PX = 800;
/** Largest delta used from a single wheel event, so a fling cannot jump the zoom. */
export const WHEEL_MAX_PX = 100;

/**
 * The zoom factor for one wheel event: multiplicative, scaled by how far the wheel moved.
 *
 * The delta is normalized to pixels from `deltaMode`, capped to one notch, and then
 * `1.1 ** (-px / 100)`: a mouse notch zooms by 1.1 (up) or 1/1.1 (down) and a
 * trackpad's small deltas zoom smoothly. Scrolling up (negative `deltaY`) zooms in.
 */
export function wheelZoomFactor(
	event: Pick<WheelEvent, "deltaY" | "deltaMode">,
): number {
	const unit =
		event.deltaMode === 1
			? WHEEL_LINE_PX
			: event.deltaMode === 2
				? WHEEL_PAGE_PX
				: 1;
	const px = clamp(event.deltaY * unit, -WHEEL_MAX_PX, WHEEL_MAX_PX);

	return WHEEL_FACTOR_PER_NOTCH ** (-px / WHEEL_NOTCH_PX);
}

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
export function createWheelZoomHandler(
	element: HTMLElement,
	getZoom: () => number,
	requestZoom: ZoomRequest,
	options: { requireCtrl?: boolean } = {},
): () => void {
	const handleWheel = (e: WheelEvent) => {
		// Check for ctrl requirement
		if (options.requireCtrl && !e.ctrlKey) return;

		// Ignore zero deltaY (no scroll)
		if (e.deltaY === 0) return;

		e.preventDefault();

		requestZoom(
			getZoom() * wheelZoomFactor(e),
			anchorFromClientPoint(element, e.clientX, e.clientY),
		);
	};

	element.addEventListener("wheel", handleWheel, { passive: false });

	return () => {
		element.removeEventListener("wheel", handleWheel);
	};
}

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
export function createPinchZoomHandler(
	element: HTMLElement,
	getZoom: () => number,
	requestZoom: ZoomRequest,
): () => void {
	let initialDistance = 0;
	let initialZoom = 1;
	/** The zoom this pinch last left; any other zoom at the next move was set elsewhere. */
	let lastZoom = 1;

	/** The touches that went down on the element, wherever they are now. */
	const ownTouches = (e: TouchEvent): Touch[] =>
		Array.from(e.touches).filter((touch) =>
			element.contains(touch.target as Node),
		);

	const getDistance = (touches: Touch[]): number => {
		const [touch1, touch2] = touches;
		if (!touch1 || !touch2) return 0;
		const dx = touch1.clientX - touch2.clientX;
		const dy = touch1.clientY - touch2.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	};

	const getMidpointAnchor = (touches: Touch[]): ZoomAnchor => {
		const [touch1, touch2] = touches;
		if (!touch1 || !touch2) return { x: 0, y: 0 };
		return anchorFromClientPoint(
			element,
			(touch1.clientX + touch2.clientX) / 2,
			(touch1.clientY + touch2.clientY) / 2,
		);
	};

	const handleTouchStart = (e: TouchEvent) => {
		const touches = ownTouches(e);
		if (touches.length === 2) {
			e.preventDefault();
			initialDistance = getDistance(touches);
			initialZoom = getZoom();
			lastZoom = initialZoom;
		}
	};

	const handleTouchMove = (e: TouchEvent) => {
		const touches = ownTouches(e);
		if (touches.length === 2 && initialDistance > 0) {
			e.preventDefault();

			const distance = getDistance(touches);
			// Zoomed from elsewhere since the last move: carry on from that zoom
			if (getZoom() !== lastZoom && distance > 0) {
				initialZoom = getZoom();
				initialDistance = distance;
			}

			requestZoom(
				initialZoom * (distance / initialDistance),
				getMidpointAnchor(touches),
			);
			lastZoom = getZoom();
		}
	};

	const handleTouchEnd = () => {
		initialDistance = 0;
	};

	element.addEventListener("touchstart", handleTouchStart, { passive: false });
	element.addEventListener("touchmove", handleTouchMove, { passive: false });
	element.addEventListener("touchend", handleTouchEnd);
	element.addEventListener("touchcancel", handleTouchEnd);

	return () => {
		element.removeEventListener("touchstart", handleTouchStart);
		element.removeEventListener("touchmove", handleTouchMove);
		element.removeEventListener("touchend", handleTouchEnd);
		element.removeEventListener("touchcancel", handleTouchEnd);
	};
}
