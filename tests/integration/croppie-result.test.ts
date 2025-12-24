import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { setupCanvasMocks } from "../canvas/mocks.ts";
import { TINY_PNG, SMALL_PNG } from "../fixtures/test-image-data-url.ts";

// Note: Most result tests are skipped because happy-dom's Image doesn't trigger onload for data URLs
// These tests would work in a real browser environment
describe.skip("Croppie result", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		setupCanvasMocks();
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
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
			const canvas = (await croppie.result({
				type: "canvas",
			})) as HTMLCanvasElement;

			expect(canvas.width).toBe(100);
			expect(canvas.height).toBe(100);
		});

		it("uses viewport size when size is viewport", async () => {
			const canvas = (await croppie.result({
				type: "canvas",
				size: "viewport",
			})) as HTMLCanvasElement;

			expect(canvas.width).toBe(100);
			expect(canvas.height).toBe(100);
		});

		it("uses custom size when provided", async () => {
			const canvas = (await croppie.result({
				type: "canvas",
				size: { width: 200, height: 150 },
			})) as HTMLCanvasElement;

			expect(canvas.width).toBe(200);
			expect(canvas.height).toBe(150);
		});

		it("uses original size when size is original", async () => {
			// The original size is based on the cropped region in image coordinates
			// This depends on zoom level and viewport size
			const canvas = (await croppie.result({
				type: "canvas",
				size: "original",
			})) as HTMLCanvasElement;

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
			const result = (await croppie.result({ type: "base64" })) as string;

			expect(result).toMatch(/^data:image\/png/);
		});

		it("supports jpeg format", async () => {
			const result = (await croppie.result({
				type: "base64",
				format: "jpeg",
			})) as string;

			expect(result).toMatch(/^data:image\/jpeg/);
		});

		it("supports webp format", async () => {
			const result = (await croppie.result({
				type: "base64",
				format: "webp",
			})) as string;

			expect(result).toMatch(/^data:image\/webp/);
		});

		it("applies quality to blob", async () => {
			const blob = (await croppie.result({
				type: "blob",
				format: "jpeg",
				quality: 0.5,
			})) as Blob;

			expect(blob.type).toBe("image/jpeg");
		});
	});

	describe("circle option", () => {
		it("uses viewport type circle by default for circle viewport", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "circle" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = (await croppie.result({
				type: "canvas",
			})) as HTMLCanvasElement;

			// Circle rendering is applied (we can't easily verify the content in tests)
			expect(canvas).toBeInstanceOf(HTMLCanvasElement);
		});

		it("uses square output for square viewport by default", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = (await croppie.result({
				type: "canvas",
			})) as HTMLCanvasElement;

			expect(canvas).toBeInstanceOf(HTMLCanvasElement);
		});

		it("can override circle option", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = (await croppie.result({
				type: "canvas",
				circle: true,
			})) as HTMLCanvasElement;

			expect(canvas).toBeInstanceOf(HTMLCanvasElement);
		});

		it("can force square output on circle viewport", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "circle" },
			});
			await croppie.bind(TINY_PNG);

			const canvas = (await croppie.result({
				type: "canvas",
				circle: false,
			})) as HTMLCanvasElement;

			expect(canvas).toBeInstanceOf(HTMLCanvasElement);
		});
	});

	describe("backgroundColor option", () => {
		beforeEach(async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);
		});

		it("accepts background color", async () => {
			const canvas = (await croppie.result({
				type: "canvas",
				backgroundColor: "#ff0000",
			})) as HTMLCanvasElement;

			expect(canvas).toBeInstanceOf(HTMLCanvasElement);
		});

		it("accepts rgba background color", async () => {
			const canvas = (await croppie.result({
				type: "canvas",
				backgroundColor: "rgba(255, 0, 0, 0.5)",
			})) as HTMLCanvasElement;

			expect(canvas).toBeInstanceOf(HTMLCanvasElement);
		});
	});

	describe("get() method", () => {
		it("returns current crop data", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
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
});
