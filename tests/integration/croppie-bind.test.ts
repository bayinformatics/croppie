import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { TINY_PNG, SMALL_PNG } from "../fixtures/test-image-data-url.ts";

// Note: Most bind tests are skipped because happy-dom's Image doesn't trigger onload for data URLs
// These tests would work in a real browser environment
describe.skip("Croppie bind", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
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
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
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

		describe("points option", () => {
			let originalWarn: typeof console.warn;

			beforeEach(() => {
				originalWarn = console.warn;
			});

			afterEach(() => {
				console.warn = originalWarn;
			});

			it("handles points option (with warning)", async () => {
				const warn = mock();
				console.warn = warn;

				croppie = new Croppie(container, {
					viewport: { width: 100, height: 100, type: "square" },
				});

				await croppie.bind({
					url: TINY_PNG,
					points: [0, 0, 100, 100],
				});

				expect(warn).toHaveBeenCalled();
			});
		});
	});

	describe("bindFile", () => {
		it("binds a Blob", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			// Create a simple blob
			const blob = new Blob(["test"], { type: "image/png" });
			// Note: In happy-dom this may not fully load, but we test the method works
			try {
				await croppie.bindFile(blob);
			} catch {
				// Expected in test environment - image loading may fail
			}
		});

		it("binds a File", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			const file = new File(["test"], "test.png", { type: "image/png" });
			try {
				await croppie.bindFile(file);
			} catch {
				// Expected in test environment
			}
		});
	});

	describe("initial zoom calculation", () => {
		it("calculates zoom to cover viewport", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
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
			// Slider min should be the effective minimum (coverage zoom, clamped to max)
			expect(slider.min).toBe("10");
		});

		it("updates slider value to match zoom", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5 },
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
	});

	describe("multiple binds", () => {
		it("resets transform on new bind", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 10 },
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
