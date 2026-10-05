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
	getLastMockContext,
	restoreCanvasMocks,
	setupCanvasMocks,
} from "../canvas/mocks.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";
import {
	fixtureDimensions,
	SMALL_PNG,
	TINY_PNG,
} from "../fixtures/test-image-data-url.ts";

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

			await croppie.result({ type: "canvas" });

			const ctx = getLastMockContext();
			expect(ctx?.ellipse).toHaveBeenCalledWith(
				50,
				50,
				50,
				50,
				0,
				0,
				Math.PI * 2,
			);
			expect(ctx?.clip).toHaveBeenCalledTimes(1);
		});

		it("uses square output for square viewport by default", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			await croppie.result({ type: "canvas" });

			expect(getLastMockContext()?.clip).not.toHaveBeenCalled();
		});

		it("can override circle option", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			await croppie.result({ type: "canvas", circle: true });

			expect(getLastMockContext()?.clip).toHaveBeenCalledTimes(1);
		});

		it("can force square output on circle viewport", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "circle" },
			});
			await croppie.bind(TINY_PNG);

			await croppie.result({ type: "canvas", circle: false });

			expect(getLastMockContext()?.clip).not.toHaveBeenCalled();
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
			await croppie.result({ type: "canvas", backgroundColor: "#ff0000" });

			const ctx = getLastMockContext();
			expect(ctx?.fillStyle).toBe("#ff0000");
			expect(ctx?.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
		});

		it("accepts rgba background color", async () => {
			await croppie.result({
				type: "canvas",
				backgroundColor: "rgba(255, 0, 0, 0.5)",
			});

			expect(getLastMockContext()?.fillStyle).toBe("rgba(255, 0, 0, 0.5)");
		});

		it("leaves the background transparent by default", async () => {
			await croppie.result({ type: "canvas" });

			expect(getLastMockContext()?.fillRect).not.toHaveBeenCalled();
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

			await croppie.result({ type: "canvas" });

			// The 400x300 image is drawn at 40x30 in the middle of the 100x100 output
			expect(getLastMockContext()?.drawImage).toHaveBeenCalledWith(
				expect.anything(),
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

			await croppie.result({
				type: "canvas",
				size: { width: 200, height: 200 },
			});

			expect(getLastMockContext()?.drawImage).toHaveBeenCalledWith(
				expect.anything(),
				0,
				0,
				400,
				300,
				60,
				70,
				80,
				60,
			);
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
		it("keeps the image's proportions and centres the crop between bars", async () => {
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
			expect(getLastMockContext()?.drawImage).toHaveBeenCalledWith(
				expect.anything(),
				200,
				150,
				200,
				100,
				0,
				25,
				100,
				50,
			);
		});

		it("masks a circle viewport with a circle, not an ellipse", async () => {
			cleanupImageMock();
			cleanupImageMock = installImageMock({ width: 400, height: 300 });
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "circle" },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 0.5 });

			await croppie.result({
				type: "canvas",
				size: { width: 200, height: 100 },
			});

			expect(getLastMockContext()?.ellipse).toHaveBeenCalledWith(
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
			// Scaled by 4096 / 40000, the image is 204.8 px square in the middle
			const [, , , , , dx, dy, dw, dh] =
				getLastMockContext()?.drawImage.mock.calls[0] ?? [];
			expect(dw).toBeCloseTo(204.8, 6);
			expect(dh).toBeCloseTo(204.8, 6);
			expect(dx + dw / 2).toBeCloseTo(2048, 6);
			expect(dy + dh / 2).toBeCloseTo(2048, 6);
		});

		it("scales a frame around a large image to the image's area, keeping its shape", async () => {
			// Zoomed out to fit, a 1000x200 viewport spans 40320x8064 px around the 6048x8064
			// photo; scaled by sqrt(6048 / 40320) it has as many pixels as the photo
			await bindZoomedOut({
				image: { width: 6048, height: 8064 },
				viewport: { width: 1000, height: 200 },
				zoom: 0,
			});

			const canvas = await croppie.result({ type: "canvas", size: "original" });

			// 5:1 like the viewport, 48.8 MP like the photo
			expect([canvas.width, canvas.height]).toEqual([15616, 3123]);
		});

		it("keeps the image resolution for a large crop inside the image", async () => {
			cleanupImageMock();
			cleanupImageMock = installImageMock({ width: 6000, height: 6000 });
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 0.02 });

			const canvas = await croppie.result({ type: "canvas", size: "original" });

			// 5000x5000 is above 4096x4096 but has no empty margin, so it is not scaled
			expect([canvas.width, canvas.height]).toEqual([5000, 5000]);
		});
	});
});
