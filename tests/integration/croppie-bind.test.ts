import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";
import {
	EXTERNAL_URL,
	fixtureDimensions,
	SMALL_PNG,
	TINY_PNG,
} from "../fixtures/test-image-data-url.ts";

describe("Croppie bind", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;
	let cleanupImageMock: () => void;

	beforeEach(() => {
		cleanupImageMock = installImageMock(fixtureDimensions);
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
		cleanupImageMock();
	});

	describe("bind with URL string", () => {
		it("accepts a string URL directly", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			await croppie.bind(TINY_PNG);

			// Should have loaded the image
			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.src).toBe(TINY_PNG);
		});
	});

	describe("bind with BindOptions", () => {
		it("accepts BindOptions object", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			await croppie.bind({ url: TINY_PNG });

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.src).toBe(TINY_PNG);
		});

		it("applies initial zoom from options", async () => {
			// A 1x1 image needs 100x to cover the viewport, so coverage is turned off
			// and the max raised for the explicit zoom of 2 to be reachable.
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 100, enforceMinimumCoverage: false },
			});

			await croppie.bind({ url: TINY_PNG, zoom: 2 });

			expect(croppie.zoom).toBe(2);
		});

		it("clamps initial zoom to max", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 3 },
			});

			await croppie.bind({ url: TINY_PNG, zoom: 10 });

			expect(croppie.zoom).toBe(3);
		});
	});

	describe("bindFile", () => {
		const imageData = Buffer.from(
			TINY_PNG.slice("data:image/png;base64,".length),
			"base64",
		);

		it("binds a Blob", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			const blob = new Blob([imageData], { type: "image/png" });
			await croppie.bindFile(blob);

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.src).toBe(TINY_PNG);
		});

		it("binds a File", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			const file = new File([imageData], "test.png", { type: "image/png" });
			await croppie.bindFile(file);

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.src).toBe(TINY_PNG);
		});
	});

	describe("initial zoom calculation", () => {
		it("calculates zoom to cover viewport", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { max: 100 },
			});

			// TINY_PNG is 1x1, viewport is 100x100, so zoom should be 100
			await croppie.bind(TINY_PNG);

			expect(croppie.zoom).toBe(100);
		});

		it("respects max zoom when coverage would exceed it", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { max: 10 },
			});

			// 1x1 image needs 100x zoom for 100x100 viewport, clamped to max 10
			await croppie.bind(TINY_PNG);

			expect(croppie.zoom).toBe(10);
		});
	});

	describe("enforceMinimumCoverage", () => {
		it("enforces minimum coverage by default", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 10 },
			});

			await croppie.bind(TINY_PNG);

			// Even though min is 0.1, the minimum is elevated to coverage zoom
			// For 1x1 image and 100x100 viewport, coverage needs 100x, clamped to max 10
			expect(croppie.zoom).toBe(10);

			// Try to zoom below coverage - should be clamped
			croppie.setZoom(0.5);
			expect(croppie.zoom).toBe(10);
		});

		it("allows zoom below coverage when enforceMinimumCoverage is false", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 10, enforceMinimumCoverage: false },
			});

			await croppie.bind(TINY_PNG);

			// Initial zoom is still coverage zoom
			expect(croppie.zoom).toBe(10);

			// But can zoom below coverage
			croppie.setZoom(0.5);
			expect(croppie.zoom).toBe(0.5);
		});
	});

	describe("slider update", () => {
		it("updates slider min to effective minimum zoom", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 10 },
				showZoomer: true,
			});

			await croppie.bind(TINY_PNG);

			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			// A 1x1 image needs 100x to cover the viewport; the effective minimum is
			// capped at zoom.max, so the slider range is [10, 10] and never inverted
			expect(slider.min).toBe("10");
			expect(slider.max).toBe("10");
		});

		it("updates slider value to match zoom", async () => {
			// Coverage is turned off: with coverage on, a 1x1 image pushes the slider
			// min (100) above its max (5), which makes the range input report 100.
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
				showZoomer: true,
			});

			await croppie.bind({ url: TINY_PNG, zoom: 2 });

			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			expect(slider.value).toBe("2");
		});
	});

	describe("preview image", () => {
		it("sets preview src to loaded image", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			await croppie.bind(SMALL_PNG);

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.src).toBe(SMALL_PNG);
		});

		it("updates preview when binding new image", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			await croppie.bind(TINY_PNG);
			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.src).toBe(TINY_PNG);

			await croppie.bind(SMALL_PNG);
			expect(preview.src).toBe(SMALL_PNG);
		});

		it("loads a remote image in the loader's CORS mode, so the browser can reuse it", async () => {
			// fixtureDimensions only sizes the data URL fixtures
			cleanupImageMock();
			cleanupImageMock = installImageMock({ width: 400, height: 300 });
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			await croppie.bind(EXTERNAL_URL);

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.crossOrigin).toBe("anonymous");
			expect(preview.src).toBe(EXTERNAL_URL);
		});

		it("gives a data URL no CORS mode, like the loader", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			await croppie.bind(SMALL_PNG);

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.crossOrigin).toBeNull();
		});
	});

	describe("multiple binds", () => {
		it("resets transform on new bind", async () => {
			// Coverage is turned off: both fixtures need more than the max of 10 to cover.
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 10, enforceMinimumCoverage: false },
			});

			await croppie.bind({ url: TINY_PNG, zoom: 5 });
			expect(croppie.zoom).toBe(5);

			await croppie.bind({ url: SMALL_PNG, zoom: 2 });
			expect(croppie.zoom).toBe(2);
		});

		it("recalculates coverage zoom for new image", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 100 },
			});

			// 1x1 image needs 100x zoom
			await croppie.bind(TINY_PNG);
			expect(croppie.zoom).toBe(100);

			// 10x10 image needs 10x zoom
			await croppie.bind(SMALL_PNG);
			expect(croppie.zoom).toBe(10);
		});
	});

	describe("default minimum zoom", () => {
		// 4032x3024 photo in a 200x200 viewport: coverage 0.06614, contain 0.0496
		let cleanupPhotoMock: () => void;

		beforeEach(() => {
			cleanupPhotoMock = installImageMock({ width: 4032, height: 3024 });
		});

		afterEach(() => {
			cleanupPhotoMock();
		});

		function sliderMin(): number {
			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			return Number(slider.min);
		}

		it("lets a large photo start at its coverage zoom instead of an unreachable 0.1", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
			});

			await croppie.bind(TINY_PNG);

			expect(croppie.zoom).toBeCloseTo(0.06614, 5);
			expect(sliderMin()).toBeCloseTo(croppie.zoom, 9);
		});

		it("keeps an explicitly configured min of 0.1 as the floor", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
				zoom: { min: 0.1 },
			});

			await croppie.bind(TINY_PNG);

			expect(croppie.zoom).toBeCloseTo(0.1, 9);
			expect(sliderMin()).toBeCloseTo(0.1, 9);
		});

		it("zooms out to fit the whole image when coverage is not enforced and min is unset", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
				zoom: { enforceMinimumCoverage: false },
			});
			await croppie.bind(TINY_PNG);

			croppie.setZoom(0.05);

			expect(croppie.zoom).toBeCloseTo(0.05, 9);
			// ...but not past the contain zoom (0.0496)
			croppie.setZoom(0.01);
			expect(croppie.zoom).toBeCloseTo(200 / 4032, 9);
		});

		it("accepts a lone zoom.max below 0.1 and caps the minimum at it", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
				zoom: { max: 0.05 },
			});
			// Before an image is bound, the slider's placeholder minimum is capped at max too
			expect(sliderMin()).toBeCloseTo(0.05, 9);

			await croppie.bind(TINY_PNG);

			// The coverage zoom (0.066) is above max, so the minimum is max
			expect(croppie.zoom).toBeCloseTo(0.05, 9);
			expect(sliderMin()).toBeCloseTo(0.05, 9);
		});

		it("keeps the zoom before any bind within a lone zoom.max below 1", () => {
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
				zoom: { max: 0.05 },
			});

			// Not the initial 1: above max, with a slider that cannot show it ("100%")
			expect(croppie.zoom).toBeCloseTo(0.05, 9);
			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			expect(slider.getAttribute("aria-valuetext")).toBe("5%");
		});

		it("keeps the zoom before any bind within a configured min above 1", () => {
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
				zoom: { min: 2, max: 4 },
			});

			expect(croppie.zoom).toBe(2);
		});

		it("re-resolves the limits for every image", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
			});
			await croppie.bind(TINY_PNG);
			expect(sliderMin()).toBeCloseTo(200 / 3024, 9);

			cleanupPhotoMock();
			cleanupPhotoMock = installImageMock({ width: 400, height: 400 });
			await croppie.bind(SMALL_PNG);

			expect(sliderMin()).toBeCloseTo(0.5, 9);
			expect(croppie.zoom).toBeCloseTo(0.5, 9);
		});
	});

	describe("images without an intrinsic size", () => {
		// The mock gives unknown sources a 0x0 size, like a broken or SVG-without-size image
		const NO_SIZE = "data:image/png;base64,NOSIZE";

		it("rejects an image with no intrinsic size", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			await expect(croppie.bind(NO_SIZE)).rejects.toThrow(/intrinsic size/);
			await expect(croppie.bind(NO_SIZE)).rejects.toThrow(
				"[@bayinformatics/croppie]",
			);
		});

		it("does not leave an infinite zoom range on the slider", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			const before = slider.min;

			await expect(croppie.bind(NO_SIZE)).rejects.toThrow();

			expect(slider.min).toBe(before);
			expect(slider.min).not.toBe("Infinity");
		});

		it("keeps the previously bound image when a bind is rejected", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { max: 100 },
			});
			await croppie.bind(SMALL_PNG);
			const zoomBefore = croppie.zoom;

			await expect(croppie.bind(NO_SIZE)).rejects.toThrow();

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.src).toBe(SMALL_PNG);
			expect(croppie.zoom).toBe(zoomBefore);
		});

		it("can bind a valid image after a rejected one", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { max: 100 },
			});
			await expect(croppie.bind(NO_SIZE)).rejects.toThrow();

			await croppie.bind(SMALL_PNG);

			expect(croppie.zoom).toBe(10);
		});
	});
});
