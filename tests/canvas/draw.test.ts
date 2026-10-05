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
		// happy-dom reports 0x0; the frame is intersected with the natural size
		Object.defineProperty(image, "naturalWidth", {
			value: 400,
			configurable: true,
		});
		Object.defineProperty(image, "naturalHeight", {
			value: 300,
			configurable: true,
		});
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
			expect(ctx.ellipse).toHaveBeenCalledWith(
				50,
				50,
				50,
				50,
				0,
				0,
				Math.PI * 2,
			);
			expect(ctx.closePath).toHaveBeenCalledTimes(1);
			expect(ctx.clip).toHaveBeenCalledTimes(1);
			expect(firstCall(ctx.clip)).toBeLessThan(firstCall(ctx.drawImage));
		});

		it("clips to an ellipse, not a circle, for a non-square output", () => {
			drawCroppedImage(image, POINTS, 100, 50, { circle: true });

			expect(lastContext().ellipse).toHaveBeenCalledWith(
				50,
				25,
				50,
				25,
				0,
				0,
				Math.PI * 2,
			);
		});

		it("does not clip when circle is not set", () => {
			drawCroppedImage(image, POINTS, 100, 100);

			const ctx = lastContext();
			expect(ctx.beginPath).not.toHaveBeenCalled();
			expect(ctx.ellipse).not.toHaveBeenCalled();
			expect(ctx.clip).not.toHaveBeenCalled();
		});

		it("turns on high-quality image smoothing", () => {
			drawCroppedImage(image, POINTS, 100, 100);

			const ctx = lastContext();
			expect(ctx.imageSmoothingEnabled).toBe(true);
			expect(ctx.imageSmoothingQuality).toBe("high");
		});

		describe("frames that extend past the image", () => {
			// The image is 400x300; the output is 100x100 unless a test says otherwise

			it("draws a frame inside the image exactly like before", () => {
				drawCroppedImage(
					image,
					{ topLeftX: 10, topLeftY: 20, bottomRightX: 60, bottomRightY: 70 },
					100,
					100,
				);

				expect(lastContext().drawImage).toHaveBeenCalledWith(
					image,
					10,
					20,
					50,
					50,
					0,
					0,
					100,
					100,
				);
			});

			it("letterboxes a frame larger than the image into a proportional sub-rect", () => {
				// The viewport shows 1000x1000 image px: the whole 400x300 image fits
				drawCroppedImage(
					image,
					{
						topLeftX: -300,
						topLeftY: -350,
						bottomRightX: 700,
						bottomRightY: 650,
					},
					100,
					100,
				);

				const ctx = lastContext();
				expect(ctx.drawImage).toHaveBeenCalledTimes(1);
				// 400x300 scaled by 100/1000 = 40x30, centred at (30, 35): never stretched
				expect(ctx.drawImage).toHaveBeenCalledWith(
					image,
					0,
					0,
					400,
					300,
					30,
					35,
					40,
					30,
				);
			});

			it("offsets the destination when only one side overshoots", () => {
				// Frame 200x100 starting 50px left of the image, output 200x100 (scale 1)
				drawCroppedImage(
					image,
					{ topLeftX: -50, topLeftY: 0, bottomRightX: 150, bottomRightY: 100 },
					200,
					100,
				);

				expect(lastContext().drawImage).toHaveBeenCalledWith(
					image,
					0,
					0,
					150,
					100,
					50,
					0,
					150,
					100,
				);
			});

			it("clips the far edges of an overshooting frame", () => {
				drawCroppedImage(
					image,
					{
						topLeftX: 300,
						topLeftY: 250,
						bottomRightX: 500,
						bottomRightY: 350,
					},
					200,
					100,
				);

				expect(lastContext().drawImage).toHaveBeenCalledWith(
					image,
					300,
					250,
					100,
					50,
					0,
					0,
					100,
					50,
				);
			});

			it("skips drawImage for a frame entirely outside the image", () => {
				drawCroppedImage(
					image,
					{ topLeftX: 500, topLeftY: 0, bottomRightX: 600, bottomRightY: 100 },
					100,
					100,
				);

				expect(lastContext().drawImage).not.toHaveBeenCalled();
			});

			it("still fills the background behind a letterboxed image", () => {
				drawCroppedImage(
					image,
					{
						topLeftX: -300,
						topLeftY: -350,
						bottomRightX: 700,
						bottomRightY: 650,
					},
					100,
					100,
					{ backgroundColor: "#fff" },
				);

				const ctx = lastContext();
				expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
				expect(firstCall(ctx.fillRect)).toBeLessThan(firstCall(ctx.drawImage));
			});
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
