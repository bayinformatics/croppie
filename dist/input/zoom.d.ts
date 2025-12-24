import type { ZoomConfig } from "../types.ts";
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
export declare function createWheelZoomHandler(element: HTMLElement, getZoom: () => number, setZoom: (zoom: number) => void, config: ZoomConfig, callbacks?: ZoomCallbacks, requireCtrl?: boolean): () => void;
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
export declare function createPinchZoomHandler(element: HTMLElement, getZoom: () => number, setZoom: (zoom: number) => void, config: ZoomConfig, callbacks?: ZoomCallbacks): () => void;
//# sourceMappingURL=zoom.d.ts.map