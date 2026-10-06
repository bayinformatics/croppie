import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
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
			const toBlob = mock(HTMLCanvasElement.prototype.toBlob);
			HTMLCanvasElement.prototype.toBlob = toBlob;

			const blob = (await croppie.result({
				type: "blob",
				format: "jpeg",
				quality: 0.5,
			})) as Blob;

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

			const canvas = (await croppie.result({
				type: "canvas",
			})) as HTMLCanvasElement;

			expect(canvas).toBeInstanceOf(HTMLCanvasElement);
			// The circle mask clips the drawing once
			expect(getLastMockContext()?.clip).toHaveBeenCalledTimes(1);
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
});
