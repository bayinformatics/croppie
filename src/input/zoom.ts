import type { ZoomConfig } from "../types.ts";
import { clamp } from "../utils/clamp.ts";

export interface ZoomCallbacks {
	onChange?: (zoom: number, previousZoom: number) => void;
}

/**
 * Create and attach a wheel-based zoom handler to an element.
 *
 * When the user scrolls the wheel over the element this handler adjusts the zoom
 * by steps of 0.1, clamped to the supplied `config` bounds, and invokes the
 * optional `onChange` callback when the zoom changes.
 *
 * @param element - The HTMLElement to attach the wheel listener to
 * @param getZoom - Function that returns the current zoom level
 * @param setZoom - Function that updates the zoom level
 * @param config - Zoom bounds; `min` and `max` define the allowed zoom range
 * @param callbacks - Optional callbacks; `onChange(newZoom, previousZoom)` is called when zoom changes
 * @param requireCtrl - If true, the handler only responds when the Ctrl key is pressed (default: `false`)
 * @returns A cleanup function that removes the attached wheel listener
 */
export function createWheelZoomHandler(
	element: HTMLElement,
	getZoom: () => number,
	setZoom: (zoom: number) => void,
	config: ZoomConfig,
	callbacks?: ZoomCallbacks,
	requireCtrl = false,
): () => void {
	const handleWheel = (e: WheelEvent) => {
		// Check for ctrl requirement
		if (requireCtrl && !e.ctrlKey) return;

		// Ignore zero-movement events (no scroll)
		if (e.deltaY === 0) return;

		e.preventDefault();

		const previousZoom = getZoom();
		const delta = e.deltaY > 0 ? -0.1 : 0.1;
		const newZoom = clamp(previousZoom + delta, config.min, config.max);

		if (newZoom !== previousZoom) {
			setZoom(newZoom);
			callbacks?.onChange?.(newZoom, previousZoom);
		}
	};

	element.addEventListener("wheel", handleWheel, { passive: false });

	return () => {
		element.removeEventListener("wheel", handleWheel);
	};
}

/**
 * Attaches pinch-to-zoom touch handlers to an element and returns a cleanup function.
 *
 * Handles two-finger pinch gestures to update zoom between the bounds specified by `config`.
 * When the effective zoom changes, `setZoom` is called and `callbacks.onChange` is invoked with the new and previous zoom values.
 *
 * @param element - The target HTMLElement to attach touch listeners to.
 * @param getZoom - Function that returns the current zoom level.
 * @param setZoom - Function called with the new zoom level when it changes.
 * @param config - Zoom bounds (`min` and `max`) used to clamp the computed zoom.
 * @param callbacks - Optional callbacks; `onChange(newZoom, previousZoom)` is called when zoom changes.
 * @returns A function that removes the attached touch listeners from `element`.
 */
export function createPinchZoomHandler(
	element: HTMLElement,
	getZoom: () => number,
	setZoom: (zoom: number) => void,
	config: ZoomConfig,
	callbacks?: ZoomCallbacks,
): () => void {
	let initialDistance = 0;
	let initialZoom = 1;

	const getDistance = (touches: TouchList): number => {
		if (touches.length < 2) return 0;
		const touch1 = touches[0];
		const touch2 = touches[1];
		if (!touch1 || !touch2) return 0;
		const dx = touch1.clientX - touch2.clientX;
		const dy = touch1.clientY - touch2.clientY;
		return Math.sqrt(dx * dx + dy * dy);
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

			const currentDistance = getDistance(e.touches);
			const scale = currentDistance / initialDistance;
			const previousZoom = getZoom();
			const newZoom = clamp(initialZoom * scale, config.min, config.max);

			if (newZoom !== previousZoom) {
				setZoom(newZoom);
				callbacks?.onChange?.(newZoom, previousZoom);
			}
		}
	};

	const handleTouchEnd = () => {
		initialDistance = 0;
	};

	element.addEventListener("touchstart", handleTouchStart, { passive: false });
	element.addEventListener("touchmove", handleTouchMove, { passive: false });
	element.addEventListener("touchend", handleTouchEnd);

	return () => {
		element.removeEventListener("touchstart", handleTouchStart);
		element.removeEventListener("touchmove", handleTouchMove);
		element.removeEventListener("touchend", handleTouchEnd);
	};
}
