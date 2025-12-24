/**
 * Mock helpers for Croppie tests
 */

/**
 * Install a mock Image constructor that automatically fires onload when src is set.
 * This works around happy-dom's limitation where Image.onload doesn't fire for data URLs.
 *
 * @returns A cleanup function that restores the original Image constructor
 */
export function installImageMock(): () => void {
	const OriginalImage = globalThis.Image;

	class MockImage extends OriginalImage {
		private _src = "";
		private _onload: ((event: Event) => void) | null = null;
		private _onerror: ((event: Event) => void) | null = null;

		get src(): string {
			return this._src;
		}

		set src(value: string) {
			this._src = value;
			// Schedule onload/onerror to fire asynchronously (like real browsers)
			setTimeout(() => {
				if (value.startsWith("data:") || value.startsWith("http")) {
					// Simulate successful load for data URLs and http URLs
					if (this._onload) {
						this._onload(new Event("load"));
					}
				} else {
					// Simulate error for invalid URLs
					if (this._onerror) {
						this._onerror(new Event("error"));
					}
				}
			}, 0);
		}

		get onload(): ((event: Event) => void) | null {
			return this._onload;
		}

		set onload(handler: ((event: Event) => void) | null) {
			this._onload = handler;
		}

		get onerror(): ((event: Event) => void) | null {
			return this._onerror;
		}

		set onerror(handler: ((event: Event) => void) | null) {
			this._onerror = handler;
		}
	}

	globalThis.Image = MockImage as unknown as typeof Image;

	return () => {
		globalThis.Image = OriginalImage;
	};
}

/**
 * Install a mock for window.getComputedStyle that normalizes element transform values to `matrix(...)` format.
 *
 * This replaces the global `getComputedStyle` with a wrapper that, when the `transform` property is accessed,
 * parses simple `translate(xpx, ypx)` and `scale(s)` forms from the element's inline `style.transform` and
 * returns an equivalent `matrix(a, b, c, d, e, f)` string; other properties are forwarded unchanged.
 *
 * @returns The cleanup function that restores the original `window.getComputedStyle`.
 */
export function installGetComputedStyleMock(): () => void {
	const originalGetComputedStyle = window.getComputedStyle;

	window.getComputedStyle = ((element: Element) => {
		const style = originalGetComputedStyle(element);

		return new Proxy(style, {
			get(target, prop) {
				if (prop === "transform") {
					const transform = (element as HTMLElement).style.transform;
					if (!transform || transform === "none") {
						return "none";
					}

					// Parse translate(Xpx, Ypx) scale(S) and convert to matrix format
					const translateMatch = transform.match(
						/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/,
					);
					const scaleMatch = transform.match(/scale\(\s*(-?[\d.]+)\s*\)/);

					const tx = translateMatch ? Number.parseFloat(translateMatch[1]) : 0;
					const ty = translateMatch ? Number.parseFloat(translateMatch[2]) : 0;
					const s = scaleMatch ? Number.parseFloat(scaleMatch[1]) : 1;

					// Return as 2D matrix: matrix(a, b, c, d, tx, ty)
					// For scale and translate: matrix(s, 0, 0, s, tx, ty)
					return `matrix(${s}, 0, 0, ${s}, ${tx}, ${ty})`;
				}
				return (target as unknown as Record<string | symbol, unknown>)[prop];
			},
		});
	}) as typeof window.getComputedStyle;

	return () => {
		window.getComputedStyle = originalGetComputedStyle;
	};
}

/**
 * Create an HTMLImageElement whose naturalWidth and naturalHeight match the given dimensions.
 *
 * @param width - Desired natural width in pixels (default: 400)
 * @param height - Desired natural height in pixels (default: 300)
 * @returns The created HTMLImageElement with `naturalWidth` equal to `width` and `naturalHeight` equal to `height`
 */
export function createMockImage(width = 400, height = 300): HTMLImageElement {
	const img = document.createElement("img");
	Object.defineProperty(img, "naturalWidth", { value: width, writable: false });
	Object.defineProperty(img, "naturalHeight", {
		value: height,
		writable: false,
	});
	return img;
}

/**
 * Create a PointerEvent configured for simulating pointer-based drag interactions in tests.
 *
 * @param type - The event type (e.g., "pointerdown", "pointermove", "pointerup").
 * @param options - Partial PointerEventInit values that override the following defaults: bubbles = true, cancelable = true, clientX = 100, clientY = 100, button = 0, pointerId = 1, pointerType = "mouse".
 * @returns The constructed PointerEvent with the merged defaults and provided overrides.
 */
export function createPointerEvent(
	type: string,
	options: Partial<PointerEventInit> = {},
): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: 100,
		clientY: 100,
		button: 0,
		pointerId: 1,
		pointerType: "mouse",
		...options,
	});
}

/**
 * Create a WheelEvent representing a wheel gesture used for zoom interactions.
 *
 * @param deltaY - Vertical scroll delta; positive values indicate movement away from the user.
 * @param options - Partial WheelEventInit to override the default event properties.
 * @returns A WheelEvent with `deltaY` set to the provided value, `bubbles` true, `cancelable` true, `deltaMode` 0, and any provided `options` applied on top of these defaults.
 */
export function createWheelEvent(
	deltaY: number,
	options: Partial<WheelEventInit> = {},
): WheelEvent {
	const event = new WheelEvent("wheel", {
		bubbles: true,
		cancelable: true,
		deltaY,
		deltaMode: 0,
		...options,
	});

	// Happy-dom doesn't properly set ctrlKey from constructor options,
	// so we use Object.defineProperty to set it
	if (options.ctrlKey !== undefined) {
		Object.defineProperty(event, "ctrlKey", {
			value: options.ctrlKey,
			writable: false,
		});
	}

	return event;
}

/**
 * Creates a TouchEvent with synthetic touch points for testing gestures such as pinch/zoom.
 *
 * @param type - The touch event type (e.g., `"touchstart"`, `"touchmove"`, `"touchend"`).
 * @param touches - Array of touch coordinates; each entry provides `clientX` and `clientY` for a touch point.
 * @returns A TouchEvent whose `touches` list contains one touch per input coordinate. Each synthetic touch has an incremental `identifier`, `target` set to `document.body`, matching `clientX`/`clientY`/`pageX`/`pageY`/`screenX`/`screenY`, and default `radiusX`/`radiusY` of `1`, `rotationAngle` of `0`, and `force` of `1`. The event is created with `bubbles: true` and `cancelable: true`.
 */
export function createTouchEvent(
	type: string,
	touches: Array<{ clientX: number; clientY: number }>,
): TouchEvent {
	const touchList = touches.map((t, i) => ({
		identifier: i,
		target: document.body,
		clientX: t.clientX,
		clientY: t.clientY,
		pageX: t.clientX,
		pageY: t.clientY,
		screenX: t.clientX,
		screenY: t.clientY,
		radiusX: 1,
		radiusY: 1,
		rotationAngle: 0,
		force: 1,
	}));

	return new TouchEvent(type, {
		bubbles: true,
		cancelable: true,
		touches: touchList as unknown as Touch[],
	});
}

/**
 * Simulates a user drag on an element between two client coordinates.
 *
 * Dispatches pointerdown at the start coordinates, pointermove to the end coordinates, and pointerup at the end coordinates.
 *
 * @param element - The element that will receive the pointer events
 * @param startX - Starting client X coordinate in pixels
 * @param startY - Starting client Y coordinate in pixels
 * @param endX - Ending client X coordinate in pixels
 * @param endY - Ending client Y coordinate in pixels
 */
export function simulateDrag(
	element: HTMLElement,
	startX: number,
	startY: number,
	endX: number,
	endY: number,
): void {
	element.dispatchEvent(
		createPointerEvent("pointerdown", { clientX: startX, clientY: startY }),
	);
	element.dispatchEvent(
		createPointerEvent("pointermove", { clientX: endX, clientY: endY }),
	);
	element.dispatchEvent(
		createPointerEvent("pointerup", { clientX: endX, clientY: endY }),
	);
}

/**
 * Waits until the next animation frame.
 *
 * @returns No value.
 */
export function nextFrame(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Pause execution for a given duration.
 *
 * @param ms - Delay duration in milliseconds
 * @returns `undefined` after the specified delay
 */
export function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}