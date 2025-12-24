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
export function createElement<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options?: {
		className?: string;
		attributes?: Record<string, string>;
		styles?: Partial<CSSStyleDeclaration>;
	},
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);

	if (options?.className) {
		element.className = options.className;
	}

	if (options?.attributes) {
		for (const [key, value] of Object.entries(options.attributes)) {
			element.setAttribute(key, value);
		}
	}

	if (options?.styles) {
		Object.assign(element.style, options.styles);
	}

	return element;
}

/**
 * Extracts the translation (x, y) and uniform scale from an element's computed CSS transform.
 *
 * @param element - The element whose computed transform will be inspected.
 * @returns An object with `x` and `y` translation values (in CSS pixels) and `scale` as the uniform scaling factor; defaults to `x: 0`, `y: 0`, `scale: 1` when no transform is present or cannot be parsed.
 */
export function getTransformValues(element: HTMLElement): {
	x: number;
	y: number;
	scale: number;
} {
	const style = window.getComputedStyle(element);
	const transform = style.transform;

	if (!transform || transform === "none") {
		return { x: 0, y: 0, scale: 1 };
	}

	// matrix(a, b, c, d, tx, ty) or matrix3d(...)
	const match = transform.match(/matrix.*\((.+)\)/);
	if (!match?.[1]) {
		return { x: 0, y: 0, scale: 1 };
	}

	const values = match[1].split(", ").map(Number);

	if (values.length === 6) {
		// 2D matrix
		return {
			x: values[4] ?? 0,
			y: values[5] ?? 0,
			scale: Math.sqrt((values[0] ?? 1) ** 2 + (values[1] ?? 0) ** 2),
		};
	}

	// 3D matrix (16 values)
	return {
		x: values[12] ?? 0,
		y: values[13] ?? 0,
		scale: values[0] ?? 1,
	};
}

/**
 * Set an element's CSS transform to a translation (in pixels) and a uniform scale.
 *
 * @param element - The target HTMLElement to transform
 * @param x - Horizontal translation in pixels
 * @param y - Vertical translation in pixels
 * @param scale - Uniform scale factor (1 = no scale)
 */
export function setTransform(
	element: HTMLElement,
	x: number,
	y: number,
	scale: number,
): void {
	element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}
