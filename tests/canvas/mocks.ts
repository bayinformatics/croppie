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
 * Creates a mock 2D canvas context with jest-like spies
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
 * Sets up canvas prototype mocks for testing
 * Call in beforeEach to ensure clean state
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
 * Restores original canvas methods
 * Call in afterEach if needed
 */
export function restoreCanvasMocks(): void {
	// In happy-dom these may not have original implementations
	// but this provides a place to restore if needed
}

/**
 * Creates a canvas element with a mock context
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
