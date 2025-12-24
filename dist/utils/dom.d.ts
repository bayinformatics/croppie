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
 * Set an element's CSS transform to a translation (in pixels) and a uniform scale.
 *
 * @param element - The target HTMLElement to transform
 * @param x - Horizontal translation in pixels
 * @param y - Vertical translation in pixels
 * @param scale - Uniform scale factor (1 = no scale)
 */
export declare function setTransform(element: HTMLElement, x: number, y: number, scale: number): void;
//# sourceMappingURL=dom.d.ts.map