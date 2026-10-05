import type { TransformState } from "../types.js";

export interface DragCallbacks {
	onStart?: (state: TransformState) => void;
	onMove?: (state: TransformState) => void;
	onEnd?: (state: TransformState) => void;
}

interface DragState {
	/** The pointer driving the drag, or null when idle. */
	pointerId: number | null;
	/** The pointer position at the previous event, in client pixels. */
	lastClientX: number;
	lastClientY: number;
}

/**
 * Attach pointer-based dragging behavior to an element.
 *
 * Sets up handlers that read the current transform via `getTransform`, update it via `setTransform`
 * while the primary pointer is dragged, and invoke the optional lifecycle callbacks.
 *
 * Each move adds the pointer movement since the previous event to the current position, so
 * a change made while the button is held (a zoom about the cursor, a rotation) is kept
 * rather than undone by the next move.
 *
 * Only the pointer that started the drag is followed: events from other pointers are
 * ignored, except that a second pointer going down ends the drag so a two-finger
 * pinch does not also pan. The drag also ends when the pointer loses its capture.
 * Pointer capture is best-effort: when the browser or the environment lacks
 * `setPointerCapture`/`releasePointerCapture`, or they throw, dragging still works.
 *
 * @param element - The HTMLElement to enable dragging on
 * @param getTransform - Function that returns the element's current TransformState
 * @param setTransform - Function to update the element's transform coordinates (`x`, `y`); it
 *   may clamp them, and the next move starts from the result
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
		lastClientX: 0,
		lastClientY: 0,
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
		state.lastClientX = e.clientX;
		state.lastClientY = e.clientY;

		tryCapture(e.pointerId);
		element.style.cursor = "grabbing";

		callbacks?.onStart?.(getTransform());
	};

	const handlePointerMove = (e: PointerEvent) => {
		if (e.pointerId !== state.pointerId) return;

		const deltaX = e.clientX - state.lastClientX;
		const deltaY = e.clientY - state.lastClientY;
		state.lastClientX = e.clientX;
		state.lastClientY = e.clientY;

		// Relative to the current position, which a zoom or rotation may have moved mid-drag
		const { x, y } = getTransform();
		setTransform(x + deltaX, y + deltaY);

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
