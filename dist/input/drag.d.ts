import type { TransformState } from "../types.js";
export interface DragCallbacks {
    onStart?: (state: TransformState) => void;
    onMove?: (state: TransformState) => void;
    onEnd?: (state: TransformState) => void;
}
export interface DragOptions {
    /**
     * The element's CSS `touch-action` (default `"none"`: every touch gesture is the
     * cropper's). Pass `"pinch-zoom"` when nothing handles a pinch, so the page zooms instead.
     * The drag handler is the only writer of this property.
     */
    touchAction?: string;
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
 * element never starts one. Fingers resting elsewhere on the page do not count. When the
 * fingers of a pinch lift until one is left on the element, that finger pans again,
 * starting from its next move so the image does not jump. The drag
 * also ends when the pointer loses its capture. A new press of the same pointer, or the
 * first finger of a new touch, while a drag is still running means that drag's pointerup
 * was lost: it ends, and the new press starts a fresh drag.
 * Pointer capture is best-effort: when the browser or the environment lacks
 * `setPointerCapture`/`releasePointerCapture`, or they throw, dragging still works.
 *
 * @param element - The HTMLElement to enable dragging on
 * @param getTransform - Function that returns the element's current TransformState
 * @param setTransform - Function to update the element's transform coordinates (`x`, `y`, in
 *   the element's layout pixels); it may clamp them, and the next move starts from the result
 * @param callbacks - Optional callbacks invoked on drag start, move, and end
 * @param options - `touchAction`: the element's CSS `touch-action` (default `"none"`)
 * @returns A cleanup function that removes the installed event listeners
 */
export declare function createDragHandler(element: HTMLElement, getTransform: () => TransformState, setTransform: (x: number, y: number) => void, callbacks?: DragCallbacks, options?: DragOptions): () => void;
