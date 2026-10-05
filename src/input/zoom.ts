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
 * The delta is normalised to pixels from `deltaMode`, capped to one notch, and then
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
 * On a two-finger start the finger distance and the current zoom are captured; every
 * move then proposes `initialZoom * distance / initialDistance`, anchored at the finger
 * midpoint. Like the wheel handler it neither clamps nor emits.
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

	const getDistance = (touches: TouchList): number => {
		if (touches.length < 2) return 0;
		const touch1 = touches.item(0);
		const touch2 = touches.item(1);
		if (!touch1 || !touch2) return 0;
		const dx = touch1.clientX - touch2.clientX;
		const dy = touch1.clientY - touch2.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	};

	const getMidpointAnchor = (touches: TouchList): ZoomAnchor => {
		const touch1 = touches.item(0);
		const touch2 = touches.item(1);
		if (!touch1 || !touch2) return { x: 0, y: 0 };
		return anchorFromClientPoint(
			element,
			(touch1.clientX + touch2.clientX) / 2,
			(touch1.clientY + touch2.clientY) / 2,
		);
	};

	const handleTouchStart = (e: TouchEvent) => {
		if (e.touches.length === 2) {
			e.preventDefault();
			initialDistance = getDistance(e.touches);
			initialZoom = getZoom();
		}
	};

	const handleTouchMove = (e: TouchEvent) => {
		if (e.touches.length === 2 && initialDistance > 0) {
			e.preventDefault();

			requestZoom(
				initialZoom * (getDistance(e.touches) / initialDistance),
				getMidpointAnchor(e.touches),
			);
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
