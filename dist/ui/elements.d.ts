import type { Boundary, Viewport } from "../types.ts";
/**
 * Create the croppie container element.
 *
 * @param customClass - Optional additional class name to append to the container's class list
 * @returns The created div element with class "croppie-container" and the optional `customClass` appended
 */
export declare function createContainer(customClass?: string): HTMLDivElement;
/**
 * Create the outer boundary element that constrains the crop area.
 *
 * @param boundary - Object describing the boundary's width and height in pixels
 * @returns The created div element used as the boundary container
 */
export declare function createBoundary(boundary: Boundary): HTMLDivElement;
/**
 * Create a positioned, sized DOM element that represents the crop viewport.
 *
 * @param viewport - Object describing the viewport's width, height, and type which determine the element's size and shape
 * @returns The configured `HTMLDivElement` to be used as the viewport element (includes class `cr-viewport cr-vp-{type}`)
 */
export declare function createViewport(viewport: Viewport): HTMLDivElement;
/**
 * Creates the overlay that darkens the area outside the viewport.
 *
 * @param boundary - The cropping boundary used to position and size the overlay mask
 * @param viewport - The viewport dimensions and type that define the transparent cutout
 * @returns The overlay div element with a semi-transparent black background and a mask that cuts out the viewport area
 */
export declare function createOverlay(boundary: Boundary, viewport: Viewport): HTMLDivElement;
/**
 * Create the image element used as the crop preview.
 *
 * The element is configured with alt text, non-draggable behavior, absolute positioning,
 * origin at the top-left, and no maximum width/height so it can be transformed freely.
 *
 * @returns The configured HTMLImageElement used to display the source image inside the cropper.
 */
export declare function createPreview(): HTMLImageElement;
/**
 * Creates a range input element configured as the zoom slider.
 *
 * @param min - Minimum slider value
 * @param max - Maximum slider value
 * @param value - Initial slider value
 * @returns The configured HTMLInputElement with type `"range"` and `step` set to `0.01`
 */
export declare function createZoomSlider(min: number, max: number, value: number): HTMLInputElement;
/**
 * Create the slider container element used to wrap the zoom slider.
 *
 * @returns The created div element with class "cr-slider-wrap".
 */
export declare function createSliderContainer(): HTMLDivElement;
//# sourceMappingURL=elements.d.ts.map