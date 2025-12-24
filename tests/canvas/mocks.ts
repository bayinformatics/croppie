/**
 * Canvas mocking utilities for happy-dom
 *
 * happy-dom has limited canvas support, so we mock canvas methods
 * to enable testing canvas-related functionality.
 */

export interface MockCanvasContext {
	fillRect: ReturnType<typeof Bun.jest.fn>;
	beginPath: ReturnType<typeof Bun.jest.fn>;
	arc: ReturnType<typeof Bun.jest.fn>;
	closePath: ReturnType<typeof Bun.jest.fn>;
	clip: ReturnType<typeof Bun.jest.fn>;
	drawImage: ReturnType<typeof Bun.jest.fn>;
	fillStyle: string;
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
		fillRect: Bun.jest.fn(),
		beginPath: Bun.jest.fn(),
		arc: Bun.jest.fn(),
		closePath: Bun.jest.fn(),
		clip: Bun.jest.fn(),
		drawImage: Bun.jest.fn(),
		fillStyle: "",
	};
}

/**
 * Install test-friendly mocks on HTMLCanvasElement prototypes.
 *
 * Mocks:
 * - `toBlob(callback, type, quality)` — invokes `callback` with a `Blob` whose data is `"mock-canvas-data"` and whose MIME type is `type` or `"image/png"`.
 * - `toDataURL(type, quality)` — returns a data URL of the form `data:<type or "image/png">;base64,mockbase64data`.
 */
export function setupCanvasMocks(): void {
	// Mock toBlob
	HTMLCanvasElement.prototype.toBlob = function (
		callback: BlobCallback,
		type?: string,
		_quality?: number,
	) {
		const blob = new Blob(["mock-canvas-data"], { type: type || "image/png" });
		callback(blob);
	};

	// Mock toDataURL
	HTMLCanvasElement.prototype.toDataURL = function (
		type?: string,
		_quality?: number,
	) {
		return `data:${type || "image/png"};base64,mockbase64data`;
	};
}

/**
 * Restore original HTMLCanvasElement methods that may have been overridden for tests.
 *
 * This is safe to call from test teardown; in environments where originals are not present (for example, happy-dom) the function may be a no-op.
 */
export function restoreCanvasMocks(): void {
	// In happy-dom these may not have original implementations
	// but this provides a place to restore if needed
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
