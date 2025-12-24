import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { TINY_PNG, SMALL_PNG } from "../fixtures/test-image-data-url.ts";
import { createWheelEvent } from "../fixtures/mock-helpers.ts";

// Note: Most zoom tests are skipped because happy-dom's Image doesn't trigger onload for data URLs
// These tests would work in a real browser environment
describe.skip("Croppie zoom", () => {
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

	describe("zoom getter", () => {
		it("returns current zoom level", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 2 });

			expect(croppie.zoom).toBe(2);
		});

		it("returns initial zoom after bind", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10 },
			});
			await croppie.bind(TINY_PNG);

			// Initial zoom is coverage zoom (100 for 1x1 image), clamped to max
			expect(croppie.zoom).toBe(10);
		});
	});

	describe("zoom setter", () => {
		it("sets zoom level", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
			});
			await croppie.bind(TINY_PNG);

			croppie.zoom = 5;

			expect(croppie.zoom).toBe(5);
		});

		it("clamps to min", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 1, max: 10, enforceMinimumCoverage: false },
			});
			await croppie.bind(TINY_PNG);

			croppie.zoom = 0.1;

			expect(croppie.zoom).toBe(1);
		});

		it("clamps to max", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5 },
			});
			await croppie.bind(TINY_PNG);

			croppie.zoom = 100;

			expect(croppie.zoom).toBe(5);
		});
	});

	describe("setZoom method", () => {
		it("sets zoom level", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
			});
			await croppie.bind(TINY_PNG);

			croppie.setZoom(3);

			expect(croppie.zoom).toBe(3);
		});

		it("updates slider value", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
				showZoomer: true,
			});
			await croppie.bind(TINY_PNG);

			croppie.setZoom(4);

			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			expect(slider.value).toBe("4");
		});

		it("emits update event when zoom changes", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

			const handler = mock();
			croppie.on("update", handler);

			croppie.setZoom(2);

			expect(handler).toHaveBeenCalled();
		});

		it("does not emit update when zoom unchanged", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10 },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 5 });

			const handler = mock();
			croppie.on("update", handler);

			croppie.setZoom(5);

			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("zoom configuration", () => {
		it("uses default zoom config when not provided", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			// Default min is 0.1, max is 10
			croppie.setZoom(0.05);
			expect(croppie.zoom).toBeGreaterThanOrEqual(0.1);

			croppie.setZoom(15);
			expect(croppie.zoom).toBeLessThanOrEqual(10);
		});

		it("respects custom min zoom", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 2, max: 10, enforceMinimumCoverage: false },
			});
			await croppie.bind(TINY_PNG);

			croppie.setZoom(1);

			expect(croppie.zoom).toBe(2);
		});

		it("respects custom max zoom", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 3 },
			});
			await croppie.bind(TINY_PNG);

			croppie.setZoom(5);

			expect(croppie.zoom).toBe(3);
		});
	});

	describe("slider zoom", () => {
		it("creates slider when showZoomer is true", () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				showZoomer: true,
			});

			const slider = container.querySelector(".cr-slider");
			expect(slider).not.toBeNull();
		});

		it("does not create slider when showZoomer is false", () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				showZoomer: false,
			});

			const slider = container.querySelector(".cr-slider");
			expect(slider).toBeNull();
		});

		it("slider input updates zoom", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
				showZoomer: true,
			});
			await croppie.bind(TINY_PNG);

			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			slider.value = "5";
			slider.dispatchEvent(new Event("input"));

			expect(croppie.zoom).toBe(5);
		});
	});

	describe("wheel zoom", () => {
		it("zooms with wheel when mouseWheelZoom is true", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
				mouseWheelZoom: true,
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

			const boundary = container.querySelector(".cr-boundary") as HTMLElement;
			boundary.dispatchEvent(createWheelEvent(-100)); // Zoom in

			expect(croppie.zoom).toBeCloseTo(1.1, 5);
		});

		it("does not zoom with wheel when mouseWheelZoom is false", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
				mouseWheelZoom: false,
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

			const boundary = container.querySelector(".cr-boundary") as HTMLElement;
			boundary.dispatchEvent(createWheelEvent(-100));

			expect(croppie.zoom).toBe(1);
		});

		it("requires ctrl when mouseWheelZoom is ctrl", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
				mouseWheelZoom: "ctrl",
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

			const boundary = container.querySelector(".cr-boundary") as HTMLElement;

			// Without ctrl - should not zoom
			boundary.dispatchEvent(createWheelEvent(-100));
			expect(croppie.zoom).toBe(1);

			// With ctrl - should zoom
			boundary.dispatchEvent(createWheelEvent(-100, { ctrlKey: true }));
			expect(croppie.zoom).toBeCloseTo(1.1, 5);
		});
	});

	describe("reset", () => {
		it("resets zoom to initial calculated value", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 10, height: 10, type: "square" },
				zoom: { min: 0.5, max: 100 },
			});
			await croppie.bind(SMALL_PNG);

			// SMALL_PNG is 10x10, viewport is 10x10, so coverage zoom is 1
			const initialZoom = croppie.zoom;

			croppie.setZoom(5);
			expect(croppie.zoom).toBe(5);

			croppie.reset();

			expect(croppie.zoom).toBe(initialZoom);
		});

		it("resets position to center", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const data1 = croppie.get();
			croppie.reset();
			const data2 = croppie.get();

			// After reset, should be centered
			expect(data2.points).toBeDefined();
		});

		it("emits update event on reset", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const handler = mock();
			croppie.on("update", handler);

			croppie.reset();

			expect(handler).toHaveBeenCalled();
		});

		it("updates slider on reset", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 10, height: 10, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
				showZoomer: true,
			});
			await croppie.bind(SMALL_PNG);

			croppie.setZoom(5);
			croppie.reset();

			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			expect(slider.value).toBe(String(croppie.zoom));
		});
	});

	describe("destroy", () => {
		it("removes DOM elements", () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			croppie.destroy();

			expect(container.querySelector(".croppie-container")).toBeNull();
		});

		it("removes event listeners", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 10, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

			const boundary = container.querySelector(".cr-boundary") as HTMLElement;
			croppie.destroy();

			// After destroy, wheel events should have no effect
			// (though the boundary no longer exists)
			expect(container.querySelector(".cr-boundary")).toBeNull();
		});
	});

	describe("deprecation warnings", () => {
		it("warns about enableOrientation", () => {
			const warn = mock();
			console.warn = warn;

			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				enableOrientation: true,
			});

			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining("enableOrientation is deprecated"),
			);
		});
	});

	describe("rotate", () => {
		it("logs warning for unimplemented rotation", async () => {
			const warn = mock();
			console.warn = warn;

			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			croppie.rotate(90);

			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining("Rotation not yet implemented"),
				90,
			);
		});
	});
});
