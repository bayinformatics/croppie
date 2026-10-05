import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	mock,
} from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import type { ResultOptions } from "../../src/types.ts";
import {
	drawCalls,
	getMockContext,
	type MockCanvasContext,
	restoreCanvasMocks,
	setupCanvasMocks,
} from "../canvas/mocks.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";
import {
	fixtureDimensions,
	SMALL_PNG,
	TINY_PNG,
} from "../fixtures/test-image-data-url.ts";

/** The mock context of the canvas result() returned, not of a downscaling step. */
function outputContext(canvas: HTMLCanvasElement): MockCanvasContext {
	const ctx = getMockContext(canvas);
	if (!ctx) throw new Error("result() drew nothing into its canvas");
	return ctx;
}

describe("Croppie result", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;
	let cleanupImageMock: () => void;

	beforeEach(() => {
		cleanupImageMock = installImageMock(fixtureDimensions);
		container = document.createElement("div");
		document.body.appendChild(container);
		setupCanvasMocks();
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
		restoreCanvasMocks();
		cleanupImageMock();
	});

	describe("without bound image", () => {
		it("throws error when no image bound", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			await expect(croppie.result({ type: "canvas" })).rejects.toThrow(
				"No image bound",
			);
		});
	});

	describe("result types", () => {
		beforeEach(async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);
		});

		it("returns canvas when type is canvas", async () => {
			const result = await croppie.result({ type: "canvas" });

			expect(result).toBeInstanceOf(HTMLCanvasElement);
		});

		it("returns string when type is base64", async () => {
			const result = await croppie.result({ type: "base64" });

			expect(typeof result).toBe("string");
			expect(result).toMatch(/^data:image\//);
		});

		it("returns blob when type is blob", async () => {
			const result = await croppie.result({ type: "blob" });

			expect(result).toBeInstanceOf(Blob);
		});

		it("throws on unknown type", async () => {
			await expect(
				// @ts-expect-error Testing invalid type
				croppie.result({ type: "invalid" }),
			).rejects.toThrow("Unknown result type");
		});
	});

	describe("size options", () => {
		beforeEach(async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(SMALL_PNG);
		});

		it("uses viewport size by default", async () => {
			const canvas = await croppie.result({
				type: "canvas",
			});

			expect(canvas.width).toBe(100);
			expect(canvas.height).toBe(100);
		});

		it("uses viewport size when size is viewport", async () => {
			const canvas = await croppie.result({
				type: "canvas",
				size: "viewport",
			});

			expect(canvas.width).toBe(100);
			expect(canvas.height).toBe(100);
		});

		it("uses custom size when provided", async () => {
			const canvas = await croppie.result({
				type: "canvas",
				size: { width: 200, height: 150 },
			});

			expect(canvas.width).toBe(200);
			expect(canvas.height).toBe(150);
		});

		it("uses original size when size is original", async () => {
			// The original size is based on the cropped region in image coordinates
			// This depends on zoom level and viewport size
			const canvas = await croppie.result({
				type: "canvas",
				size: "original",
			});

			// Original size depends on the cropped region - check it's valid
			expect(canvas.width).toBeGreaterThan(0);
			expect(canvas.height).toBeGreaterThan(0);
		});
	});

	describe("format options", () => {
		beforeEach(async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);
		});

		it("defaults to png format", async () => {
			const result = await croppie.result({ type: "base64" });

			expect(result).toMatch(/^data:image\/png/);
		});

		it("supports jpeg format", async () => {
			const result = await croppie.result({
				type: "base64",
				format: "jpeg",
			});

			expect(result).toMatch(/^data:image\/jpeg/);
		});

		it("supports webp format", async () => {
			const result = await croppie.result({
				type: "base64",
				format: "webp",
			});

			expect(result).toMatch(/^data:image\/webp/);
		});

		it("applies quality to blob", async () => {
			const toBlob = mock(HTMLCanvasElement.prototype.toBlob);
			HTMLCanvasElement.prototype.toBlob = toBlob;

			const blob = await croppie.result({
				type: "blob",
				format: "jpeg",
				quality: 0.5,
			});

			expect(blob.type).toBe("image/jpeg");
			expect(toBlob.mock.calls[0]?.[1]).toBe("image/jpeg");
			expect(toBlob.mock.calls[0]?.[2]).toBe(0.5);
		});

		it("applies quality to base64", async () => {
			const toDataURL = mock(HTMLCanvasElement.prototype.toDataURL);
			HTMLCanvasElement.prototype.toDataURL = toDataURL;

			await croppie.result({ type: "base64", format: "jpeg", quality: 0.5 });

			expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.5);
		});
	});

	describe("circle option", () => {
		it("uses viewport type circle by default for circle viewport", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "circle" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = await croppie.result({ type: "canvas" });

			const ctx = outputContext(canvas);
			expect(ctx.ellipse).toHaveBeenCalledWith(
				50,
				50,
				50,
				50,
				0,
				0,
				Math.PI * 2,
			);
			expect(ctx.clip).toHaveBeenCalledTimes(1);
		});

		it("uses square output for square viewport by default", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = await croppie.result({ type: "canvas" });

			expect(outputContext(canvas).clip).not.toHaveBeenCalled();
		});

		it("can override circle option", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = await croppie.result({ type: "canvas", circle: true });

			expect(outputContext(canvas).clip).toHaveBeenCalledTimes(1);
		});

		it("can force square output on circle viewport", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "circle" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = await croppie.result({ type: "canvas", circle: false });

			expect(outputContext(canvas).clip).not.toHaveBeenCalled();
		});
	});

	describe("backgroundColor option", () => {
		beforeEach(async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);
		});

		it("fills the output with the background color", async () => {
			const canvas = await croppie.result({
				type: "canvas",
				backgroundColor: "#ff0000",
			});

			const ctx = outputContext(canvas);
			expect(ctx.fillStyle).toBe("#ff0000");
			expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
		});

		it("accepts rgba background color", async () => {
			const canvas = await croppie.result({
				type: "canvas",
				backgroundColor: "rgba(255, 0, 0, 0.5)",
			});

			expect(outputContext(canvas).fillStyle).toBe("rgba(255, 0, 0, 0.5)");
		});

		it("leaves the background transparent by default", async () => {
			const canvas = await croppie.result({ type: "canvas" });

			expect(outputContext(canvas).fillRect).not.toHaveBeenCalled();
		});
	});

	describe("get() method", () => {
		it("returns current crop data", async () => {
			// A 1x1 image needs 100x to cover the viewport, so coverage is turned off
			// and the max raised for the explicit zoom of 2 to be reachable.
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 100, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 2 });

			const data = croppie.get();

			expect(data.zoom).toBe(2);
			expect(data.points).toBeDefined();
			expect(data.points.topLeftX).toBeDefined();
			expect(data.points.topLeftY).toBeDefined();
			expect(data.points.bottomRightX).toBeDefined();
			expect(data.points.bottomRightY).toBeDefined();
		});

		it("returns empty points when no image bound", () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			const data = croppie.get();

			expect(data.points).toEqual({
				topLeftX: 0,
				topLeftY: 0,
				bottomRightX: 0,
				bottomRightY: 0,
			});
		});

		it("updates points after zoom change", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
			});
			await croppie.bind(SMALL_PNG);

			const data1 = croppie.get();
			croppie.setZoom(5);
			const data2 = croppie.get();

			expect(data1.zoom).not.toBe(data2.zoom);
		});
	});

	describe("zoomed out past the image (coverage not enforced)", () => {
		it("letterboxes instead of stretching the image over the whole output", async () => {
			cleanupImageMock();
			cleanupImageMock = installImageMock({ width: 400, height: 300 });
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 10, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 0.1 });

			const canvas = await croppie.result({ type: "canvas" });

			// The 400x300 image is drawn at 40x30 in the middle of the 100x100 output,
			// from the 50x38 step it was halved to first
			expect(drawCalls(outputContext(canvas))).toEqual([
				["CANVAS 50x38", 0, 0, 50, 38, 30, 35, 40, 30],
			]);
		});

		it("returns an integer-sized canvas for size 'original'", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 100, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: SMALL_PNG, zoom: 3 }); // 10x10 image

			const canvas = await croppie.result({
				type: "canvas",
				size: "original",
			});

			// The viewport spans 100 / 3 = 33.33 image px, letterboxed around the 10x10 image
			expect(canvas.width).toBe(33);
			expect(canvas.height).toBe(33);
		});

		it("keeps the image's proportions for a custom output size", async () => {
			cleanupImageMock();
			cleanupImageMock = installImageMock({ width: 400, height: 300 });
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 10, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 0.1 });

			const canvas = await croppie.result({
				type: "canvas",
				size: { width: 200, height: 200 },
			});

			// 80x60 in the middle of 200x200, from the 100x75 step it was halved to first
			expect(drawCalls(outputContext(canvas))).toEqual([
				["CANVAS 100x75", 0, 0, 100, 75, 60, 70, 80, 60],
			]);
		});
	});

	describe("result() typing", () => {
		beforeEach(async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);
		});

		it("narrows the return type by the output type", async () => {
			expectTypeOf(croppie.result({ type: "blob" })).toEqualTypeOf<
				Promise<Blob>
			>();
			expectTypeOf(croppie.result({ type: "base64" })).toEqualTypeOf<
				Promise<string>
			>();
			expectTypeOf(croppie.result({ type: "canvas" })).toEqualTypeOf<
				Promise<HTMLCanvasElement>
			>();

			// And the narrowed values really are those types at runtime
			expect(await croppie.result({ type: "blob" })).toBeInstanceOf(Blob);
			expect(typeof (await croppie.result({ type: "base64" }))).toBe("string");
			expect((await croppie.result({ type: "canvas" })).tagName).toBe("CANVAS");
		});

		it("narrows when format, size and quality options are passed too", () => {
			expectTypeOf(
				croppie.result({ type: "blob", format: "jpeg", quality: 0.5 }),
			).toEqualTypeOf<Promise<Blob>>();
			expectTypeOf(
				croppie.result({ type: "canvas", size: { width: 10, height: 10 } }),
			).toEqualTypeOf<Promise<HTMLCanvasElement>>();
		});

		it("falls back to the union for an output type only known at runtime", () => {
			const options: ResultOptions = { type: "canvas" };

			expectTypeOf(croppie.result(options)).toEqualTypeOf<
				Promise<Blob | string | HTMLCanvasElement>
			>();
		});
	});

	describe("a size of another shape than the viewport", () => {
		it("keeps the image's proportions and centers the crop between bars", async () => {
			cleanupImageMock();
			cleanupImageMock = installImageMock({ width: 600, height: 400 });
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 100, type: "square" },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

			const canvas = await croppie.result({
				type: "canvas",
				size: { width: 100, height: 100 },
			});

			// The 200x100 crop at half size is 100x50, with a 25px bar above and below
			expect([canvas.width, canvas.height]).toEqual([100, 100]);
			// The 2x shrink goes through one step canvas; the last draw into the output places it
			expect(drawCalls(outputContext(canvas)).at(-1)?.slice(-4)).toEqual([
				0, 25, 100, 50,
			]);
		});

		it("masks a circle viewport with a circle, not an ellipse", async () => {
			cleanupImageMock();
			cleanupImageMock = installImageMock({ width: 400, height: 300 });
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "circle" },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 0.5 });

			const canvas = await croppie.result({
				type: "canvas",
				size: { width: 200, height: 100 },
			});

			expect(outputContext(canvas).ellipse).toHaveBeenCalledWith(
				100,
				50,
				50,
				50,
				0,
				0,
				Math.PI * 2,
			);
		});
	});

	describe("size 'original' zoomed out far past the image", () => {
		/** Binds an image with coverage not enforced, then zooms out (clamped to the minimum). */
		async function bindZoomedOut(setup: {
			image: { width: number; height: number };
			viewport: { width: number; height: number };
			minZoom?: number;
			zoom: number;
		}): Promise<void> {
			cleanupImageMock();
			cleanupImageMock = installImageMock(setup.image);
			croppie = new Croppie(container, {
				viewport: { ...setup.viewport, type: "square" },
				zoom: { min: setup.minZoom, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG });
			croppie.setZoom(setup.zoom);
		}

		it("caps the canvas of a mostly empty frame at 4096x4096", async () => {
			// A 400x400 viewport at zoom 0.01 spans 40000x40000 image px: 1.6 gigapixels
			await bindZoomedOut({
				image: { width: 2000, height: 2000 },
				viewport: { width: 400, height: 400 },
				minZoom: 0.01,
				zoom: 0.01,
			});

			const canvas = await croppie.result({ type: "canvas", size: "original" });

			expect([canvas.width, canvas.height]).toEqual([4096, 4096]);
			// Scaled by 4096 / 40000, the image is 204.8 px square in the middle, from 1945.6
			// to 2150.4: drawn on whole pixels, 1946 to 2150
			const [, , , , , dx, dy, dw, dh] =
				outputContext(canvas).drawImage.mock.calls[0] ?? [];
			expect([dx, dy, dw, dh]).toEqual([1946, 1946, 204, 204]);
		});

		it("scales a frame around a large image down to the canvas cap, keeping its shape", async () => {
			// Zoomed out to fit, a 1000x200 viewport spans 40320x8064 px around the 6048x8064
			// photo; scaled by sqrt(16777216 / (40320 * 8064)) it is 9158.9 x 1831.8
			await bindZoomedOut({
				image: { width: 6048, height: 8064 },
				viewport: { width: 1000, height: 200 },
				zoom: 0,
			});

			const canvas = await croppie.result({ type: "canvas", size: "original" });

			// 5:1 like the viewport; 9159x1832 would be over 16,777,216 px, so rounded down
			expect([canvas.width, canvas.height]).toEqual([9158, 1831]);
			expect(canvas.width * canvas.height).toBeLessThanOrEqual(16_777_216);
		});

		it("caps a large crop inside the image at 4096x4096", async () => {
			cleanupImageMock();
			cleanupImageMock = installImageMock({ width: 6000, height: 6000 });
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 0.02 });

			const canvas = await croppie.result({ type: "canvas", size: "original" });

			// The 5000x5000 crop (25 MP) is scaled down to 16,777,216 px
			expect([canvas.width, canvas.height]).toEqual([4096, 4096]);
		});
	});

	describe("a custom size", () => {
		beforeEach(async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);
		});

		const invalid: Array<[string, number]> = [
			["NaN", Number.NaN],
			["0", 0],
			["a negative number", -5],
			["Infinity", Number.POSITIVE_INFINITY],
		];

		for (const [label, value] of invalid) {
			it(`rejects a width of ${label} with a RangeError`, async () => {
				const error = await croppie
					.result({ type: "canvas", size: { width: value, height: 100 } })
					.then(
						() => undefined,
						(caught: unknown) => caught,
					);

				expect(error).toBeInstanceOf(RangeError);
				expect((error as Error).message).toContain("size.width");
			});

			it(`rejects a height of ${label} with a RangeError`, async () => {
				const error = await croppie
					.result({ type: "base64", size: { width: 100, height: value } })
					.then(
						() => undefined,
						(caught: unknown) => caught,
					);

				expect(error).toBeInstanceOf(RangeError);
				expect((error as Error).message).toContain("size.height");
			});
		}

		it("rounds a fractional size to whole pixels", async () => {
			const canvas = await croppie.result({
				type: "canvas",
				size: { width: 100.4, height: 49.6 },
			});

			expect([canvas.width, canvas.height]).toEqual([100, 50]);
		});
	});

	describe("the canvas size cap (16,777,216 px, 16,384 px a side)", () => {
		it("caps 'original' for a default viewport zoomed out on a large photo", async () => {
			// At its per-image minimum zoom a 200x200 viewport shows 6048x6048 px of an
			// 8064x6048 photo: 36.6 MP, which iOS Safari cannot allocate
			cleanupImageMock();
			cleanupImageMock = installImageMock({ width: 8064, height: 6048 });
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 0 });

			const canvas = await croppie.result({ type: "canvas", size: "original" });

			expect([canvas.width, canvas.height]).toEqual([4096, 4096]);
		});

		it("caps each side of 'original' at 16,384 px", async () => {
			// A 1000x50 viewport at the coverage zoom of a 20000x1000 image shows all of it
			cleanupImageMock();
			cleanupImageMock = installImageMock({ width: 20000, height: 1000 });
			croppie = new Croppie(container, {
				viewport: { width: 1000, height: 50, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = await croppie.result({ type: "canvas", size: "original" });

			// 20 MP and 20000 px wide: the side cap (x0.8192) is the tighter one
			expect([canvas.width, canvas.height]).toEqual([16384, 819]);
		});

		it("caps a custom size by area, keeping its shape", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = await croppie.result({
				type: "canvas",
				size: { width: 5000, height: 5000 },
			});

			expect([canvas.width, canvas.height]).toEqual([4096, 4096]);
		});

		it("caps each side of a custom size", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = await croppie.result({
				type: "canvas",
				size: { width: 20000, height: 100 },
			});

			expect([canvas.width, canvas.height]).toEqual([16384, 82]);
		});

		it("leaves a size within the cap alone", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = await croppie.result({
				type: "canvas",
				size: { width: 4096, height: 4096 },
			});

			expect([canvas.width, canvas.height]).toEqual([4096, 4096]);
		});
	});

	describe("the output canvas", () => {
		beforeEach(async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);
		});

		/** Records the canvas of every toBlob/toDataURL call, with its size at that moment. */
		function recordEncodes(): Array<{
			canvas: HTMLCanvasElement;
			size: number[];
		}> {
			const encodes: Array<{ canvas: HTMLCanvasElement; size: number[] }> = [];
			const { toBlob, toDataURL } = HTMLCanvasElement.prototype;
			HTMLCanvasElement.prototype.toBlob = function (
				this: HTMLCanvasElement,
				...args: Parameters<HTMLCanvasElement["toBlob"]>
			) {
				encodes.push({ canvas: this, size: [this.width, this.height] });
				toBlob.apply(this, args);
			};
			HTMLCanvasElement.prototype.toDataURL = function (
				this: HTMLCanvasElement,
				...args: Parameters<HTMLCanvasElement["toDataURL"]>
			) {
				encodes.push({ canvas: this, size: [this.width, this.height] });
				return toDataURL.apply(this, args);
			};
			return encodes;
		}

		it("is freed once a base64 result is encoded", async () => {
			const encodes = recordEncodes();

			await croppie.result({ type: "base64" });

			// Encoded at full size, emptied afterwards
			expect(encodes.map((e) => e.size)).toEqual([[100, 100]]);
			const canvas = encodes[0]?.canvas;
			expect([canvas?.width, canvas?.height]).toEqual([0, 0]);
		});

		it("is freed once a blob result is encoded", async () => {
			const encodes = recordEncodes();

			await croppie.result({ type: "blob" });

			expect(encodes.map((e) => e.size)).toEqual([[100, 100]]);
			const canvas = encodes[0]?.canvas;
			expect([canvas?.width, canvas?.height]).toEqual([0, 0]);
		});

		it("is freed when the blob cannot be encoded", async () => {
			let encoded: HTMLCanvasElement | undefined;
			HTMLCanvasElement.prototype.toBlob = function (
				this: HTMLCanvasElement,
				callback: BlobCallback,
			) {
				encoded = this;
				callback(null);
			};

			await expect(croppie.result({ type: "blob" })).rejects.toThrow(
				"Failed to create blob from canvas",
			);

			expect([encoded?.width, encoded?.height]).toEqual([0, 0]);
		});

		it("is left to the caller for a canvas result", async () => {
			const canvas = await croppie.result({ type: "canvas" });

			expect([canvas.width, canvas.height]).toEqual([100, 100]);
		});
	});
});
