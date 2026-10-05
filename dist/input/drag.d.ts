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
export declare function createDragHandler(element: HTMLElement, getTransform: () => TransformState, setTransform: (x: number, y: number) => void, callbacks?: DragCallbacks): () => void;
