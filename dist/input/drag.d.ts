import type { TransformState } from "../types.js";
export interface DragCallbacks {
    onStart?: (state: TransformState) => void;
    onMove?: (state: TransformState) => void;
    onEnd?: (state: TransformState) => void;
}
/**
 * Attach pointer-based dragging behavior to an element.
 *
 * Sets up handlers that read the current transform via `getTransform`, update it via `setTransform`
 * while the primary pointer is dragged, and invoke the optional lifecycle callbacks.
 *
 * Each move adds the pointer movement since the previous event to the current position, so
 * a change made while the button is held (a zoom about the cursor, a rotation) is kept
 * rather than undone by the next move. The movement is converted from client pixels to the
 * element's layout pixels, so the image follows the pointer under a CSS-scaled ancestor.
 *
 * Only the pointer that started the drag is followed: events from other pointers are
 * ignored, except that a second pointer going down ends the drag so a two-finger
 * pinch does not also pan, and a finger put down while another finger is down on the
 * element never starts one. Fingers resting elsewhere on the page do not count. The drag
 * also ends when the pointer loses its capture, and a new press of the same pointer (its
 * pointerup was lost) starts a fresh drag.
 * Pointer capture is best-effort: when the browser or the environment lacks
 * `setPointerCapture`/`releasePointerCapture`, or they throw, dragging still works.
 *
 * @param element - The HTMLElement to enable dragging on
 * @param getTransform - Function that returns the element's current TransformState
 * @param setTransform - Function to update the element's transform coordinates (`x`, `y`, in
 *   the element's layout pixels); it may clamp them, and the next move starts from the result
 * @param callbacks - Optional callbacks invoked on drag start, move, and end
 * @returns A cleanup function that removes the installed event listeners
 */
export declare function createDragHandler(element: HTMLElement, getTransform: () => TransformState, setTransform: (x: number, y: number) => void, callbacks?: DragCallbacks): () => void;
