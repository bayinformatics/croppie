import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	canvasToBase64,
	canvasToBlob,
	drawCroppedImage,
} from "../../src/canvas/draw.ts";
import type { CropPoints } from "../../src/types.ts";
import {
	getLastMockContext,
	type MockCanvasContext,
	restoreCanvasMocks,
	setupCanvasMocks,
} from "./mocks.ts";

function lastContext(): MockCanvasContext {
	const ctx = getLastMockContext();
	if (!ctx) {
		throw new Error("No 2D context was requested");
	}
	return ctx;
}

/** Global invocation index of a mock's first call, for ordering assertions. */
function firstCall(fn: ReturnType<typeof mock>): number {
	return fn.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
}

const POINTS: CropPoints = {
	topLeftX: 10,
	topLeftY: 20,
	bottomRightX: 60,
	bottomRightY: 80,
};

describe("canvas draw", () => {
	let image: HTMLImageElement;

	beforeEach(() => {
		setupCanvasMocks();
		image = document.createElement("img");
	});

	afterEach(() => {
		restoreCanvasMocks();
	});

	describe("drawCroppedImage", () => {
		it("creates a canvas with the requested output size", () => {
			const canvas = drawCroppedImage(image, POINTS, 120, 90);

			expect(canvas.tagName).toBe("CANVAS");
			expect(canvas.width).toBe(120);
			expect(canvas.height).toBe(90);
		});

		it("draws the source rectangle scaled to the output size", () => {
			drawCroppedImage(image, POINTS, 100, 120);

			const ctx = lastContext();
			expect(ctx.drawImage).toHaveBeenCalledTimes(1);
			expect(ctx.drawImage).toHaveBeenCalledWith(
				image,
				10,
				20,
				50,
				60,
				0,
				0,
				100,
				120,
			);
		});

		it("does not fill the background by default", () => {
			drawCroppedImage(image, POINTS, 100, 100);

			expect(lastContext().fillRect).not.toHaveBeenCalled();
		});

		it("fills the background before drawing when backgroundColor is set", () => {
			drawCroppedImage(image, POINTS, 80, 40, { backgroundColor: "#336699" });

			const ctx = lastContext();
			expect(ctx.fillStyle).toBe("#336699");
			expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 80, 40);
			expect(firstCall(ctx.fillRect)).toBeLessThan(firstCall(ctx.drawImage));
		});

		it("clips to a circle before drawing when circle is set", () => {
			drawCroppedImage(image, POINTS, 100, 100, { circle: true });

			const ctx = lastContext();
			expect(ctx.beginPath).toHaveBeenCalledTimes(1);
			expect(ctx.arc).toHaveBeenCalledWith(50, 50, 50, 0, Math.PI * 2);
			expect(ctx.closePath).toHaveBeenCalledTimes(1);
			expect(ctx.clip).toHaveBeenCalledTimes(1);
			expect(firstCall(ctx.clip)).toBeLessThan(firstCall(ctx.drawImage));
		});

		it("does not clip when circle is not set", () => {
			drawCroppedImage(image, POINTS, 100, 100);

			const ctx = lastContext();
			expect(ctx.beginPath).not.toHaveBeenCalled();
			expect(ctx.arc).not.toHaveBeenCalled();
			expect(ctx.clip).not.toHaveBeenCalled();
		});

		it("throws when no 2D context is available", () => {
			const proto = HTMLCanvasElement.prototype;
			const getContext = proto.getContext;
			proto.getContext = (() => null) as typeof proto.getContext;

			try {
				expect(() => drawCroppedImage(image, POINTS, 100, 100)).toThrow(
					"Failed to get 2D context",
				);
			} finally {
				proto.getContext = getContext;
			}
		});
	});

	describe("canvasToBase64", () => {
		it("encodes as PNG by default", () => {
			const canvas = document.createElement("canvas");
			const toDataURL = mock(() => "data:image/png;base64,AAAA");
			canvas.toDataURL = toDataURL as unknown as typeof canvas.toDataURL;

			const result = canvasToBase64(canvas);

			expect(result).toBe("data:image/png;base64,AAAA");
			expect(toDataURL).toHaveBeenCalledWith("image/png", 0.92);
		});

		it("uses the requested format and quality", () => {
			const canvas = document.createElement("canvas");
			const toDataURL = mock(() => "data:image/jpeg;base64,BBBB");
			canvas.toDataURL = toDataURL as unknown as typeof canvas.toDataURL;

			canvasToBase64(canvas, "jpeg", 0.5);

			expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.5);
		});

		it("returns a data URL from the mocked canvas", () => {
			const canvas = document.createElement("canvas");

			expect(canvasToBase64(canvas, "webp")).toStartWith("data:image/webp;");
		});
	});

	describe("canvasToBlob", () => {
		it("resolves a PNG blob by default", async () => {
			const canvas = document.createElement("canvas");

			const blob = await canvasToBlob(canvas);

			expect(blob.type).toBe("image/png");
		});

		it("resolves a blob with the requested MIME type", async () => {
			const canvas = document.createElement("canvas");

			expect((await canvasToBlob(canvas, "jpeg")).type).toBe("image/jpeg");
			expect((await canvasToBlob(canvas, "webp")).type).toBe("image/webp");
		});

		it("passes the MIME type and quality to toBlob", async () => {
			const canvas = document.createElement("canvas");
			const toBlob = mock(
				(callback: BlobCallback, _type?: string, _quality?: number) => {
					callback(new Blob(["x"], { type: "image/jpeg" }));
				},
			);
			canvas.toBlob = toBlob as unknown as typeof canvas.toBlob;

			await canvasToBlob(canvas, "jpeg", 0.7);

			expect(toBlob.mock.calls[0]?.[1]).toBe("image/jpeg");
			expect(toBlob.mock.calls[0]?.[2]).toBe(0.7);
		});

		it("rejects when the canvas cannot produce a blob", async () => {
			const canvas = document.createElement("canvas");
			canvas.toBlob = ((callback: BlobCallback) => {
				callback(null);
			}) as typeof canvas.toBlob;

			await expect(canvasToBlob(canvas)).rejects.toThrow(
				"Failed to create blob from canvas",
			);
		});
	});
});
