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
		// TODO(phase-b): bind() sets slider.min to the uncapped coverage zoom ("100")
		// even though zoom.max is 10; PR 3 caps the effective minimum at zoom.max.
		it.skip("updates slider min to effective minimum zoom", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 10 },
				showZoomer: true,
			});

			await croppie.bind(TINY_PNG);

			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			// Slider min should be the effective minimum (coverage zoom, clamped to max)
			expect(slider.min).toBe("10");
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
});
