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
			// A square frame fills the square output
			drawCroppedImage(
				image,
				{ topLeftX: 10, topLeftY: 20, bottomRightX: 60, bottomRightY: 70 },
				100,
				100,
				{ circle: true },
			);

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
			// A 2:1 frame (a non-square viewport) fills the 2:1 output
			drawCroppedImage(
				image,
				{ topLeftX: 10, topLeftY: 20, bottomRightX: 60, bottomRightY: 45 },
				100,
				50,
				{ circle: true },
			);

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
				// 400x300 scaled by 100/1000 = 40x30, centered at (30, 35): never stretched
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

	describe("drawCroppedImage with a rotation", () => {
		// A 50x50 natural-frame rectangle inside the 400x300 image
		const frame = {
			topLeftX: 10,
			topLeftY: 20,
			bottomRightX: 60,
			bottomRightY: 70,
		};
		// The natural-frame rectangles that fill a 100x50 output: 50x25 at 0 and 180, and
		// 25x50 at 90 and 270 (the image is shown turned, so the box is the output turned back)
		const wide = { ...frame, bottomRightY: 45 };
		const tall = { ...frame, bottomRightX: 35 };

		it("keeps the plain drawImage call for rotation 0", () => {
			drawCroppedImage(image, wide, 100, 50, { rotation: 0 });

			const ctx = lastContext();
			expect(ctx.drawImage).toHaveBeenCalledWith(
				image,
				10,
				20,
				50,
				25,
				0,
				0,
				100,
				50,
			);
			expect(ctx.save).not.toHaveBeenCalled();
			expect(ctx.translate).not.toHaveBeenCalled();
			expect(ctx.rotate).not.toHaveBeenCalled();
			expect(ctx.restore).not.toHaveBeenCalled();
		});

		it("draws through a context rotated about the output center for 90", () => {
			drawCroppedImage(image, tall, 100, 50, { rotation: 90 });

			const ctx = lastContext();
			expect(ctx.translate).toHaveBeenCalledWith(50, 25);
			expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
			// The destination box is the output turned back: 50 wide and 100 tall
			expect(ctx.drawImage).toHaveBeenCalledWith(
				image,
				10,
				20,
				25,
				50,
				-25,
				-50,
				50,
				100,
			);
		});

		it("draws a half turn into a box the size of the output for 180", () => {
			drawCroppedImage(image, wide, 100, 50, { rotation: 180 });

			const ctx = lastContext();
			expect(ctx.translate).toHaveBeenCalledWith(50, 25);
			expect(ctx.rotate).toHaveBeenCalledWith(Math.PI);
			expect(ctx.drawImage).toHaveBeenCalledWith(
				image,
				10,
				20,
				50,
				25,
				-50,
				-25,
				100,
				50,
			);
		});

		it("rotates by 3 * PI / 2 for 270", () => {
			drawCroppedImage(image, tall, 100, 50, { rotation: 270 });

			const ctx = lastContext();
			expect(ctx.rotate.mock.calls[0]?.[0]).toBeCloseTo((3 * Math.PI) / 2, 12);
			expect(ctx.drawImage).toHaveBeenCalledWith(
				image,
				10,
				20,
				25,
				50,
				-25,
				-50,
				50,
				100,
			);
		});

		it("wraps the transformed draw in save and restore", () => {
			drawCroppedImage(image, frame, 100, 100, { rotation: 90 });

			const ctx = lastContext();
			expect(ctx.save).toHaveBeenCalledTimes(1);
			expect(ctx.restore).toHaveBeenCalledTimes(1);
			expect(firstCall(ctx.save)).toBeLessThan(firstCall(ctx.translate));
			expect(firstCall(ctx.translate)).toBeLessThan(firstCall(ctx.rotate));
			expect(firstCall(ctx.rotate)).toBeLessThan(firstCall(ctx.drawImage));
			expect(firstCall(ctx.drawImage)).toBeLessThan(firstCall(ctx.restore));
		});

		it("clips and fills in canvas coordinates, before the rotation", () => {
			drawCroppedImage(image, tall, 100, 50, {
				rotation: 90,
				circle: true,
				backgroundColor: "#fff",
			});

			const ctx = lastContext();
			expect(ctx.ellipse).toHaveBeenCalledWith(
				50,
				25,
				50,
				25,
				0,
				0,
				Math.PI * 2,
			);
			expect(firstCall(ctx.fillRect)).toBeLessThan(firstCall(ctx.translate));
			expect(firstCall(ctx.clip)).toBeLessThan(firstCall(ctx.translate));
		});

		it("letterboxes a frame larger than the image inside the rotated box", () => {
			// 100x100 output, frame of 1000x1000 natural px around the 400x300 image
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
				{ rotation: 90 },
			);

			// Scale 0.1: the image is 40x30 in a 100x100 box centered on the origin, offset
			// by the 30x35 of empty space before it
			expect(lastContext().drawImage).toHaveBeenCalledWith(
				image,
				0,
				0,
				400,
				300,
				-20,
				-15,
				40,
				30,
			);
		});

		it("skips drawImage for a frame that misses the image", () => {
			drawCroppedImage(
				image,
				{ topLeftX: 500, topLeftY: 0, bottomRightX: 600, bottomRightY: 100 },
				100,
				100,
				{ rotation: 180 },
			);

			expect(lastContext().drawImage).not.toHaveBeenCalled();
		});
	});

	describe("drawCroppedImage into an output of another shape than the frame", () => {
		// A 50x50 natural-frame rectangle inside the 400x300 image
		const square = {
			topLeftX: 10,
			topLeftY: 20,
			bottomRightX: 60,
			bottomRightY: 70,
		};

		it("keeps the image's proportions and centers it between two bars", () => {
			// Scale 1 in a 2:1 output: 50x50, not stretched to 100x50, with 25px either side
			drawCroppedImage(image, square, 100, 50);

			expect(lastContext().drawImage).toHaveBeenCalledWith(
				image,
				10,
				20,
				50,
				50,
				25,
				0,
				50,
				50,
			);
		});

		it("puts the bars above and below in a taller output", () => {
			drawCroppedImage(image, square, 50, 100);

			expect(lastContext().drawImage).toHaveBeenCalledWith(
				image,
				10,
				20,
				50,
				50,
				0,
				25,
				50,
				50,
			);
		});

		it("clips a circle, not an ellipse, around the centered frame", () => {
			drawCroppedImage(image, square, 100, 50, { circle: true });

			expect(lastContext().ellipse).toHaveBeenCalledWith(
				50,
				25,
				25,
				25,
				0,
				0,
				Math.PI * 2,
			);
		});

		it("fills the whole output, bars included, with the background color", () => {
			drawCroppedImage(image, square, 100, 50, { backgroundColor: "#fff" });

			const ctx = lastContext();
			expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
			expect(firstCall(ctx.fillRect)).toBeLessThan(firstCall(ctx.drawImage));
		});

		it("letterboxes in the box turned back by the rotation", () => {
			// A 50x25 frame shown at 90 is 25 wide and 50 tall: centered in the 100x50 output
			drawCroppedImage(image, { ...square, bottomRightY: 45 }, 100, 50, {
				rotation: 90,
				circle: true,
			});

			const ctx = lastContext();
			// In the 50x100 box centered on the origin, the 50x25 frame is centered vertically,
			// on whole pixels of the box: its top edge at 37.5 rounds to 38, i.e. -12
			expect(ctx.drawImage.mock.calls[0]?.slice(1)).toEqual([
				10, 20, 50, 25, -25, -12, 50, 25,
			]);
			// The mask is the turned frame, in canvas coordinates
			expect(ctx.ellipse).toHaveBeenCalledWith(
				50,
				25,
				12.5,
				25,
				0,
				0,
				Math.PI * 2,
			);
		});

		it("centers a frame that extends past the image too", () => {
			// The 1000x1000 frame at scale 0.1 is 100x100 in the middle of the 200x100 output,
			// and the 400x300 image 40x30 in the middle of that
			drawCroppedImage(
				image,
				{
					topLeftX: -300,
					topLeftY: -350,
					bottomRightX: 700,
					bottomRightY: 650,
				},
				200,
				100,
			);

			expect(lastContext().drawImage).toHaveBeenCalledWith(
				image,
				0,
				0,
				400,
				300,
				80,
				35,
				40,
				30,
			);
		});

		it("draws a letterboxed frame on whole pixels, not across a half-pixel seam", () => {
			// Scale 1 in a 101x50 output: the 50x50 frame would start at x = 25.5
			drawCroppedImage(image, square, 101, 50);

			const [, , , , , dx, dy, dw, dh] =
				lastContext().drawImage.mock.calls[0] ?? [];
			expect([dx, dy, dw, dh]).toEqual([26, 0, 50, 50]);
		});

		it("draws an image letterboxed inside a larger frame on whole pixels", () => {
			// The 1000x1000 frame at scale 0.101 is 101x101 at x = 27 in the 155x101 output; the
			// 400x300 image would be drawn at (57.3, 35.35), 40.4 x 30.3
			drawCroppedImage(
				image,
				{
					topLeftX: -300,
					topLeftY: -350,
					bottomRightX: 700,
					bottomRightY: 650,
				},
				155,
				101,
			);

			const [, , , , , dx, dy, dw, dh] =
				lastContext().drawImage.mock.calls[0] ?? [];
			// Each edge rounded: 57.3 -> 57 and 97.7 -> 98, 35.35 -> 35 and 65.65 -> 66
			expect([dx, dy, dw, dh]).toEqual([57, 35, 41, 31]);
		});

		it("keeps the circle mask centered on the output", () => {
			drawCroppedImage(image, square, 101, 50, { circle: true });

			expect(lastContext().ellipse.mock.calls[0]).toEqual([
				50.5,
				25,
				25,
				25,
				0,
				0,
				Math.PI * 2,
			]);
		});

		it("fills an output that is the frame's shape rounded to whole pixels", () => {
			// size 'original' of a 101.5x20.3 frame is 102x20; one scale would draw it 100x20,
			// leaving a 1px gap at either end
			drawCroppedImage(
				image,
				{
					topLeftX: 10,
					topLeftY: 20,
					bottomRightX: 111.5,
					bottomRightY: 40.3,
				},
				102,
				20,
			);

			const [, , , , , dx, dy, dw, dh] =
				lastContext().drawImage.mock.calls[0] ?? [];
			expect(dx).toBeCloseTo(0, 9);
			expect(dy).toBeCloseTo(0, 9);
			expect(dw).toBeCloseTo(102, 9);
			expect(dh).toBeCloseTo(20, 9);
		});
	});
});
