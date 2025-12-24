import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
	loadImage,
	fileToDataUrl,
	getImageDimensions,
	aspectRatio,
	calculateInitialZoom,
} from "../../src/utils/image.ts";
import { TINY_PNG, RED_PNG, SMALL_PNG } from "../fixtures/test-image-data-url.ts";
import { createMockImage, installImageMock } from "../fixtures/mock-helpers.ts";

describe("Image utilities", () => {
	describe("loadImage", () => {
		let cleanupImageMock: () => void;

		beforeEach(() => {
			cleanupImageMock = installImageMock();
		});

		afterEach(() => {
			cleanupImageMock();
		});
		it("loads a data URL image", async () => {
			const img = await loadImage(TINY_PNG);

			expect(img).toBeInstanceOf(HTMLImageElement);
			expect(img.src).toBe(TINY_PNG);
		});

		it("does not set crossOrigin for data URLs", async () => {
			const img = await loadImage(TINY_PNG);

			// crossOrigin should not be set for data URLs (null or "" both indicate not set)
			expect(img.crossOrigin === null || img.crossOrigin === "").toBe(true);
		});

		it("loads different data URL images", async () => {
			const tiny = await loadImage(TINY_PNG);
			const red = await loadImage(RED_PNG);
			const small = await loadImage(SMALL_PNG);

			expect(tiny.src).toBe(TINY_PNG);
			expect(red.src).toBe(RED_PNG);
			expect(small.src).toBe(SMALL_PNG);
		});

		// Note: crossOrigin behavior for external URLs is best verified by inspecting
		// the source code at src/utils/image.ts:loadImage, as external URLs cannot be
		// tested in happy-dom. The implementation sets crossOrigin = "anonymous" for
		// non-data-URL sources.

		it("rejects when image fails to load", async () => {
			// In happy-dom, invalid data URLs may or may not trigger error
			// This tests the error path works when it does fail
			await expect(loadImage("not-a-valid-url")).rejects.toThrow(
				"Failed to load image",
			);
		});
	});

	describe("fileToDataUrl", () => {
		it("converts a blob to data URL", async () => {
			const blob = new Blob(["test content"], { type: "text/plain" });
			const result = await fileToDataUrl(blob);

			expect(result).toMatch(/^data:text\/plain;base64,/);
		});

		it("converts image blob to data URL", async () => {
			const imageData = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
			const blob = new Blob([imageData], { type: "image/png" });
			const result = await fileToDataUrl(blob);

			expect(result).toMatch(/^data:image\/png;base64,/);
		});

		it("converts File object to data URL", async () => {
			const file = new File(["hello world"], "test.txt", { type: "text/plain" });
			const result = await fileToDataUrl(file);

			expect(result).toMatch(/^data:text\/plain;base64,/);
			// "hello world" in base64 is "aGVsbG8gd29ybGQ="
			expect(result).toContain("base64,");
		});

		it("preserves MIME type in data URL", async () => {
			const jsonBlob = new Blob(['{"key": "value"}'], {
				type: "application/json",
			});
			const result = await fileToDataUrl(jsonBlob);

			expect(result).toMatch(/^data:application\/json;base64,/);
		});

		it("handles empty blob", async () => {
			const blob = new Blob([], { type: "text/plain" });
			const result = await fileToDataUrl(blob);

			expect(result).toBe("data:text/plain;base64,");
		});

		it("handles binary data", async () => {
			const binaryData = new Uint8Array([0, 1, 2, 255, 254, 253]);
			const blob = new Blob([binaryData], { type: "application/octet-stream" });
			const result = await fileToDataUrl(blob);

			expect(result).toMatch(/^data:application\/octet-stream;base64,/);
		});
	});

	describe("getImageDimensions", () => {
		it("returns natural dimensions of image", () => {
			const img = createMockImage(400, 300);
			const dimensions = getImageDimensions(img);

			expect(dimensions.width).toBe(400);
			expect(dimensions.height).toBe(300);
		});

		it("returns different dimensions for different images", () => {
			const square = createMockImage(200, 200);
			const landscape = createMockImage(800, 400);
			const portrait = createMockImage(300, 600);

			expect(getImageDimensions(square)).toEqual({ width: 200, height: 200 });
			expect(getImageDimensions(landscape)).toEqual({ width: 800, height: 400 });
			expect(getImageDimensions(portrait)).toEqual({ width: 300, height: 600 });
		});

		it("handles very small dimensions", () => {
			const tiny = createMockImage(1, 1);
			const dimensions = getImageDimensions(tiny);

			expect(dimensions.width).toBe(1);
			expect(dimensions.height).toBe(1);
		});

		it("handles very large dimensions", () => {
			const large = createMockImage(10000, 8000);
			const dimensions = getImageDimensions(large);

			expect(dimensions.width).toBe(10000);
			expect(dimensions.height).toBe(8000);
		});
	});

	describe("aspectRatio", () => {
		it("calculates aspect ratio for landscape", () => {
			expect(aspectRatio(800, 400)).toBe(2);
		});

		it("calculates aspect ratio for portrait", () => {
			expect(aspectRatio(400, 800)).toBe(0.5);
		});

		it("calculates aspect ratio for square", () => {
			expect(aspectRatio(500, 500)).toBe(1);
		});

		it("calculates 16:9 aspect ratio", () => {
			expect(aspectRatio(1920, 1080)).toBeCloseTo(16 / 9, 5);
		});

		it("calculates 4:3 aspect ratio", () => {
			expect(aspectRatio(1024, 768)).toBeCloseTo(4 / 3, 5);
		});

		it("handles non-integer ratios", () => {
			expect(aspectRatio(100, 300)).toBeCloseTo(1 / 3, 5);
		});

		it("handles very wide ratios", () => {
			expect(aspectRatio(2100, 900)).toBeCloseTo(7 / 3, 5);
		});
	});

	describe("calculateInitialZoom", () => {
		it("returns 1 when image matches viewport", () => {
			const zoom = calculateInitialZoom(200, 200, 200, 200);
			expect(zoom).toBe(1);
		});

		it("scales up small images to fill viewport", () => {
			// 100x100 image in 200x200 viewport needs 2x scale
			const zoom = calculateInitialZoom(100, 100, 200, 200);
			expect(zoom).toBe(2);
		});

		it("scales down large images to fill viewport", () => {
			// 400x400 image in 200x200 viewport needs 0.5x scale
			const zoom = calculateInitialZoom(400, 400, 200, 200);
			expect(zoom).toBe(0.5);
		});

		it("uses larger ratio for landscape image in square viewport", () => {
			// 400x200 image (2:1) in 200x200 viewport
			// widthRatio = 200/400 = 0.5
			// heightRatio = 200/200 = 1
			// Should use 1 (larger) to fill viewport
			const zoom = calculateInitialZoom(400, 200, 200, 200);
			expect(zoom).toBe(1);
		});

		it("uses larger ratio for portrait image in square viewport", () => {
			// 200x400 image (1:2) in 200x200 viewport
			// widthRatio = 200/200 = 1
			// heightRatio = 200/400 = 0.5
			// Should use 1 (larger) to fill viewport
			const zoom = calculateInitialZoom(200, 400, 200, 200);
			expect(zoom).toBe(1);
		});

		it("fills landscape viewport with square image", () => {
			// 100x100 image in 400x200 viewport
			// widthRatio = 400/100 = 4
			// heightRatio = 200/100 = 2
			// Should use 4 to fill viewport
			const zoom = calculateInitialZoom(100, 100, 400, 200);
			expect(zoom).toBe(4);
		});

		it("fills portrait viewport with square image", () => {
			// 100x100 image in 200x400 viewport
			// widthRatio = 200/100 = 2
			// heightRatio = 400/100 = 4
			// Should use 4 to fill viewport
			const zoom = calculateInitialZoom(100, 100, 200, 400);
			expect(zoom).toBe(4);
		});

		it("handles matching aspect ratios", () => {
			// 200x100 image in 400x200 viewport (both 2:1)
			// widthRatio = 400/200 = 2
			// heightRatio = 200/100 = 2
			// Both ratios are equal
			const zoom = calculateInitialZoom(200, 100, 400, 200);
			expect(zoom).toBe(2);
		});

		it("handles real-world dimensions", () => {
			// 3000x2000 photo in 300x200 viewport
			// widthRatio = 300/3000 = 0.1
			// heightRatio = 200/2000 = 0.1
			const zoom = calculateInitialZoom(3000, 2000, 300, 200);
			expect(zoom).toBe(0.1);
		});

		it("handles fractional zoom values", () => {
			// 1000x600 in 300x200 viewport
			// widthRatio = 300/1000 = 0.3
			// heightRatio = 200/600 = 0.333...
			const zoom = calculateInitialZoom(1000, 600, 300, 200);
			expect(zoom).toBeCloseTo(1 / 3, 5);
		});
	});
});
