import type { TransformState } from "../types.js";

export interface DragCallbacks {
	onStart?: (state: TransformState) => void;
	onMove?: (state: TransformState) => void;
	onEnd?: (state: TransformState) => void;
}

interface DragState {
	/** The pointer driving the drag, or null when idle. */
	pointerId: number | null;
	startX: number;
	startY: number;
	startTransformX: number;
	startTransformY: number;
}

/**
 * Attach pointer-based dragging behavior to an element.
 *
 * Sets up handlers that read the current transform via `getTransform`, update it via `setTransform`
 * while the primary pointer is dragged, and invoke the optional lifecycle callbacks.
 *
 * Only the pointer that started the drag is followed: events from other pointers are
 * ignored, except that a second pointer going down ends the drag so a two-finger
 * pinch does not also pan. The drag also ends when the pointer loses its capture.
 * Pointer capture is best-effort: when the browser or the environment lacks
 * `setPointerCapture`/`releasePointerCapture`, or they throw, dragging still works.
 *
 * @param element - The HTMLElement to enable dragging on
 * @param getTransform - Function that returns the element's current TransformState
 * @param setTransform - Function to update the element's transform coordinates (`x`, `y`)
 * @param callbacks - Optional callbacks invoked on drag start, move, and end
 * @returns A cleanup function that removes the installed event listeners
 */
export function createDragHandler(
	element: HTMLElement,
	getTransform: () => TransformState,
	setTransform: (x: number, y: number) => void,
	callbacks?: DragCallbacks,
): () => void {
	const state: DragState = {
		pointerId: null,
		startX: 0,
		startY: 0,
		startTransformX: 0,
		startTransformY: 0,
	};

	const tryCapture = (pointerId: number) => {
		if (typeof element.setPointerCapture !== "function") return;
		try {
			element.setPointerCapture(pointerId);
		} catch {
			// The pointer is gone or capture is unsupported: dragging works without it
		}
	};

	const tryRelease = (pointerId: number) => {
		if (typeof element.releasePointerCapture !== "function") return;
		try {
			element.releasePointerCapture(pointerId);
		} catch {
			// Already released
		}
	};

	const endDrag = (releaseCapture: boolean) => {
		const pointerId = state.pointerId;
		if (pointerId === null) return;

		state.pointerId = null;
		if (releaseCapture) tryRelease(pointerId);
		element.style.cursor = "grab";

		callbacks?.onEnd?.(getTransform());
	};

	const handlePointerDown = (e: PointerEvent) => {
		if (e.button !== 0) return; // Only left click

		if (state.pointerId !== null) {
			// A second pointer joined (pinch): stop panning instead of fighting over the image
			if (e.pointerId !== state.pointerId) endDrag(true);
			return;
		}

		state.pointerId = e.pointerId;
		state.startX = e.clientX;
		state.startY = e.clientY;

		const transform = getTransform();
		state.startTransformX = transform.x;
		state.startTransformY = transform.y;

		tryCapture(e.pointerId);
		element.style.cursor = "grabbing";

		callbacks?.onStart?.(transform);
	};

	const handlePointerMove = (e: PointerEvent) => {
		if (e.pointerId !== state.pointerId) return;

		const deltaX = e.clientX - state.startX;
		const deltaY = e.clientY - state.startY;

		const newX = state.startTransformX + deltaX;
		const newY = state.startTransformY + deltaY;

		setTransform(newX, newY);

		const transform = getTransform();
		callbacks?.onMove?.(transform);
	};

	const handlePointerUp = (e: PointerEvent) => {
		if (e.pointerId !== state.pointerId) return;

		endDrag(true);
	};

	const handleLostPointerCapture = (e: PointerEvent) => {
		if (e.pointerId !== state.pointerId) return;

		// The capture is already gone, so there is nothing to release
		endDrag(false);
	};

	// Attach listeners
	element.addEventListener("pointerdown", handlePointerDown);
	element.addEventListener("pointermove", handlePointerMove);
	element.addEventListener("pointerup", handlePointerUp);
	element.addEventListener("pointercancel", handlePointerUp);
	element.addEventListener("lostpointercapture", handleLostPointerCapture);

	element.style.cursor = "grab";
	element.style.touchAction = "none"; // Prevent browser handling

	// Return cleanup function
	return () => {
		element.removeEventListener("pointerdown", handlePointerDown);
		element.removeEventListener("pointermove", handlePointerMove);
		element.removeEventListener("pointerup", handlePointerUp);
		element.removeEventListener("pointercancel", handlePointerUp);
		element.removeEventListener("lostpointercapture", handleLostPointerCapture);
	};
}
