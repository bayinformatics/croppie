/**
 * Canvas mocking utilities for happy-dom
 *
 * happy-dom has limited canvas support, so we mock canvas methods
 * to enable testing canvas-related functionality.
 */

import { mock } from "bun:test";

// Store original methods for restoration
let originalToBlob: typeof HTMLCanvasElement.prototype.toBlob | undefined;
let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL | undefined;
let originalGetContext:
	| typeof HTMLCanvasElement.prototype.getContext
	| undefined;

// One context per canvas (like a real canvas), plus the most recently created one
let mockContexts = new WeakMap<HTMLCanvasElement, MockCanvasContext>();
let lastMockContext: MockCanvasContext | undefined;

export interface MockCanvasContext {
	fillRect: ReturnType<typeof mock>;
	beginPath: ReturnType<typeof mock>;
	arc: ReturnType<typeof mock>;
	ellipse: ReturnType<typeof mock>;
	closePath: ReturnType<typeof mock>;
	clip: ReturnType<typeof mock>;
	drawImage: ReturnType<typeof mock>;
	fillStyle: string;
	imageSmoothingEnabled: boolean;
	imageSmoothingQuality: ImageSmoothingQuality;
}

/**
 * Create a mock 2D canvas context with jest-style spy functions for common drawing methods.
 *
 * The returned object provides spy functions for methods used in tests and initializes `fillStyle` to an empty string.
 *
 * @returns A `MockCanvasContext` whose drawing methods are jest-style spies and whose `fillStyle` is `""`.
 */
export function createMockCanvasContext(): MockCanvasContext {
	return {
		fillRect: mock(),
		beginPath: mock(),
		arc: mock(),
		ellipse: mock(),
		closePath: mock(),
		clip: mock(),
		drawImage: mock(),
		fillStyle: "",
		// The defaults of a real 2D context
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "low",
	};
}

/**
 * Install test-friendly mocks on HTMLCanvasElement prototypes.
 *
 * Mocks:
 * - `getContext("2d")` — returns a `MockCanvasContext` (the same one for repeated calls on a canvas; happy-dom returns `null`). Other context ids go to the original `getContext`, as in `createMockCanvas()`.
 * - `toBlob(callback, type, quality)` — invokes `callback` with a `Blob` whose data is `"mock-canvas-data"` and whose MIME type is `type` or `"image/png"`.
 * - `toDataURL(type, quality)` — returns a data URL of the form `data:<type or "image/png">;base64,mockbase64data`.
 */
export function setupCanvasMocks(): void {
	// Only store originals if not already mocked (idempotent)
	if (originalToBlob === undefined) {
		originalToBlob = HTMLCanvasElement.prototype.toBlob;
	}
	if (originalToDataURL === undefined) {
		originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
	}
	if (originalGetContext === undefined) {
		originalGetContext = HTMLCanvasElement.prototype.getContext;
	}

	mockContexts = new WeakMap();
	lastMockContext = undefined;
	const realGetContext = originalGetContext as (
		this: HTMLCanvasElement,
		contextId: string,
		...options: unknown[]
	) => RenderingContext | null;
	HTMLCanvasElement.prototype.getContext = function (
		this: HTMLCanvasElement,
		contextId: string,
		...options: unknown[]
	) {
		if (contextId !== "2d") {
			// Only "2d" is mocked; other context ids get the original, like createMockCanvas
			return realGetContext.call(this, contextId, ...options);
		}
		let ctx = mockContexts.get(this);
		if (!ctx) {
			ctx = createMockCanvasContext();
			mockContexts.set(this, ctx);
		}
		lastMockContext = ctx;
		return ctx as unknown as CanvasRenderingContext2D;
	} as typeof HTMLCanvasElement.prototype.getContext;

	// Mock toBlob (async like the real implementation)
	HTMLCanvasElement.prototype.toBlob = (
		callback: BlobCallback,
		type?: string,
		_quality?: number,
	) => {
		const blob = new Blob(["mock-canvas-data"], { type: type || "image/png" });
		queueMicrotask(() => callback(blob));
	};

	// Mock toDataURL
	HTMLCanvasElement.prototype.toDataURL = (type?: string, _quality?: number) =>
		`data:${type || "image/png"};base64,mockbase64data`;
}

/**
 * Restore original HTMLCanvasElement methods that may have been overridden for tests.
 *
 * This is safe to call from test teardown; in environments where originals are not present (for example, happy-dom) the function may be a no-op.
 */
export function restoreCanvasMocks(): void {
	if (originalToBlob) {
		HTMLCanvasElement.prototype.toBlob = originalToBlob;
	}
	if (originalToDataURL) {
		HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
	}
	if (originalGetContext) {
		HTMLCanvasElement.prototype.getContext = originalGetContext;
	}
	originalToBlob = undefined;
	originalToDataURL = undefined;
	originalGetContext = undefined;
	lastMockContext = undefined;
}

/**
 * The mock 2D context most recently handed out by the mocked `getContext("2d")`.
 *
 * @returns The context, or `undefined` if none was requested since `setupCanvasMocks()`
 */
export function getLastMockContext(): MockCanvasContext | undefined {
	return lastMockContext;
}

/**
 * Create an HTMLCanvasElement whose "2d" context is replaced with a mock context.
 *
 * @returns An object containing the created `canvas` and the mock `MockCanvasContext` that will be returned when calling `canvas.getContext("2d")`
 */
export function createMockCanvas(
	width = 200,
	height = 200,
): {
	canvas: HTMLCanvasElement;
	ctx: MockCanvasContext;
} {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	const ctx = createMockCanvasContext();

	// Override getContext to return our mock
	const originalGetContext = canvas.getContext.bind(canvas);
	canvas.getContext = ((contextId: string) => {
		if (contextId === "2d") {
			return ctx as unknown as CanvasRenderingContext2D;
		}
		return originalGetContext(contextId);
	}) as typeof canvas.getContext;

	return { canvas, ctx };
}
