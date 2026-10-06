import type { Rotation } from "../types.js";
import { type ZoomAnchor } from "./transform.js";
/**
 * Create an HTML element of the given tag and apply optional class, attributes, and styles.
 *
 * @param tag - The tag name of the element to create.
 * @param options - Optional configuration for the created element.
 * @param options.className - A string to assign to the element's `className`.
 * @param options.attributes - Key/value pairs to set as attributes on the element.
 * @param options.styles - Partial style declarations to merge into the element's `style`.
 * @returns The newly created and configured element.
 */
export declare function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, options?: {
    className?: string;
    attributes?: Record<string, string>;
    styles?: Partial<CSSStyleDeclaration>;
}): HTMLElementTagNameMap[K];
/**
 * Extracts the translation (x, y) and uniform scale from an element's computed CSS transform.
 *
 * @param element - The element whose computed transform will be inspected.
 * @returns An object with `x` and `y` translation values (in CSS pixels) and `scale` as the uniform scaling factor; defaults to `x: 0`, `y: 0`, `scale: 1` when no transform is present or cannot be parsed.
 */
export declare function getTransformValues(element: HTMLElement): {
    x: number;
    y: number;
    scale: number;
};
/**
 * Set an element's CSS transform to a translation (in pixels), a uniform scale and an optional
 * clockwise quarter-turn rotation.
 *
 * With transform-origin `0 0` the rotation is applied first, then the scale, then the
 * translation. The `rotate()` term is omitted for rotation 0, so the string is identical to
 * the one produced before rotation existed.
 *
 * @param element - The target HTMLElement to transform
 * @param x - Horizontal translation in pixels
 * @param y - Vertical translation in pixels
 * @param scale - Uniform scale factor (1 = no scale)
 * @param rotation - Clockwise rotation in degrees (default: 0)
 */
export declare function setTransform(element: HTMLElement, x: number, y: number, scale: number, rotation?: Rotation): void;
/**
 * Convert a client (viewport) point to an offset from the center of an element, in the
 * element's own layout pixels: the anchor used to zoom about a cursor or finger position.
 *
 * Works for CSS-scaled elements: the displayed box (`getBoundingClientRect`) is mapped
 * back to layout pixels through `offsetWidth`/`offsetHeight`. Without a layout box
 * (detached or `display: none`), or with a coordinate that is not finite (an event built
 * by hand without `clientX`/`clientY`), it falls back to the center: a NaN anchor would
 * make the zoomed position NaN, which no later zoom could repair.
 *
 * @param element - The element the offset is relative to
 * @param clientX - X in viewport coordinates (e.g. `event.clientX`)
 * @param clientY - Y in viewport coordinates (e.g. `event.clientY`)
 * @returns The offset from the element center; `{ x: 0, y: 0 }` when it has no layout box or
 *   the point is not finite
 */
export declare function anchorFromClientPoint(element: HTMLElement, clientX: number, clientY: number): ZoomAnchor;
/**
 * The factors that turn a distance in client (viewport) pixels into the element's own
 * layout pixels: 1 for an unscaled element, 2 inside a `transform: scale(0.5)` or
 * `zoom: 0.5` ancestor. The displayed box (`getBoundingClientRect`) is compared with the
 * layout size (`offsetWidth`/`offsetHeight`); an axis without a size counts as unscaled.
 *
 * @param element - The element whose layout pixels are wanted
 * @param rect - The element's `getBoundingClientRect()`, when the caller already has it
 * @returns Layout pixels per client pixel along each axis
 */
export declare function clientToLayoutScale(element: HTMLElement, rect?: DOMRect): {
    x: number;
    y: number;
};
