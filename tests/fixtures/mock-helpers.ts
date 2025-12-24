/**
 * Mock helpers for Croppie tests
 */

/**
 * Creates a mock HTMLImageElement with specified dimensions
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
 * Creates a PointerEvent for testing drag interactions
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
 * Creates a WheelEvent for testing zoom interactions
 */
export function createWheelEvent(
	deltaY: number,
	options: Partial<WheelEventInit> = {},
): WheelEvent {
	return new WheelEvent("wheel", {
		bubbles: true,
		cancelable: true,
		deltaY,
		deltaMode: 0,
		...options,
	});
}

/**
 * Creates a TouchEvent for testing pinch zoom
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
 * Simulates a drag operation on an element
 */
export async function simulateDrag(
	element: HTMLElement,
	startX: number,
	startY: number,
	endX: number,
	endY: number,
): Promise<void> {
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
 * Waits for the next animation frame
 */
export function nextFrame(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Waits for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
