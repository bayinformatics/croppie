import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import {
	createTouchEvent,
	createWheelEvent,
	installImageMock,
	mockElementRect,
	simulateDrag,
} from "../fixtures/mock-helpers.ts";
import {
	fixtureDimensions,
	SMALL_PNG,
	TINY_PNG,
} from "../fixtures/test-image-data-url.ts";

describe("Croppie zoom", () => {
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

	describe("zoom getter", () => {
		it("returns current zoom level", async () => {
			// A 1x1 image needs 100x to cover the viewport, so coverage is turned off
			// and the max raised for the explicit zoom of 2 to be reachable.
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 100, enforceMinimumCoverage: false },
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

			croppie.destroy();

			// After destroy, wheel events should have no effect
			// (though the boundary no longer exists)
			expect(container.querySelector(".cr-boundary")).toBeNull();
		});
	});

	describe("deprecation warnings", () => {
		let originalWarn: typeof console.warn;

		beforeEach(() => {
			originalWarn = console.warn;
		});

		afterEach(() => {
			console.warn = originalWarn;
		});

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
		let originalWarn: typeof console.warn;

		beforeEach(() => {
			originalWarn = console.warn;
		});

		afterEach(() => {
			console.warn = originalWarn;
		});

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

	describe("zoom anchoring", () => {
		// 400x300 image, 100x100 viewport centered in a 300x300 boundary
		let cleanupWideImageMock: () => void;

		beforeEach(() => {
			cleanupWideImageMock = installImageMock({ width: 400, height: 300 });
		});

		afterEach(() => {
			cleanupWideImageMock();
		});

		async function bindWide(
			zoom: number,
			zoomConfig = { min: 0.1, max: 10 },
		): Promise<HTMLElement> {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				boundary: { width: 300, height: 300 },
				zoom: zoomConfig,
			});
			await croppie.bind({ url: TINY_PNG, zoom });
			return container.querySelector(".cr-boundary") as HTMLElement;
		}

		function cropCenterX(): number {
			const { points } = croppie.get();
			return (points.topLeftX + points.bottomRightX) / 2;
		}

		it("keeps the crop center fixed when zooming in after a pan", async () => {
			const boundary = await bindWide(1);

			simulateDrag(boundary, 100, 100, 150, 100); // pan x to 50

			expect(cropCenterX()).toBeCloseTo(150, 6);

			croppie.setZoom(2);

			expect(cropCenterX()).toBeCloseTo(150, 6);
		});

		it("keeps the crop center fixed when zooming out after a pan", async () => {
			const boundary = await bindWide(2);

			simulateDrag(boundary, 100, 100, 160, 100); // pan x to 60
			const before = cropCenterX();

			croppie.setZoom(1);

			expect(cropCenterX()).toBeCloseTo(before, 6);
		});

		it("keeps the crop center fixed when zooming with the slider", async () => {
			const boundary = await bindWide(1);
			simulateDrag(boundary, 100, 100, 150, 100);
			const slider = container.querySelector(".cr-slider") as HTMLInputElement;

			slider.value = "2";
			slider.dispatchEvent(new Event("input"));

			expect(croppie.zoom).toBe(2);
			expect(cropCenterX()).toBeCloseTo(150, 6);
		});

		it("re-clamps after zooming out so the viewport stays covered", async () => {
			const boundary = await bindWide(1);

			simulateDrag(boundary, 100, 100, 250, 100); // pan x to the limit (150)
			croppie.setZoom(0.5);

			const { points } = croppie.get();
			expect(points.topLeftX).toBeGreaterThanOrEqual(0);
			expect(points.bottomRightX).toBeLessThanOrEqual(400);
			// The full 100px viewport still maps onto the image (200px at zoom 0.5);
			// a gap would show up as a shortened crop after clamping to the image.
			expect(points.bottomRightX - points.topLeftX).toBeCloseTo(200, 6);
		});

		describe("wheel and pinch", () => {
			function boxBoundary(boundary: HTMLElement): void {
				mockElementRect(boundary, { left: 0, top: 0, width: 300, height: 300 });
			}

			it("wheel zoom keeps the point under the cursor fixed", async () => {
				const boundary = await bindWide(1);
				boxBoundary(boundary);

				// Client x 200 is the viewport's right edge, which shows image x 250
				expect(croppie.get().points.bottomRightX).toBeCloseTo(250, 6);
				boundary.dispatchEvent(
					createWheelEvent(-100, { clientX: 200, clientY: 150 }),
				);

				expect(croppie.zoom).toBeCloseTo(1.1, 9);
				expect(croppie.get().points.bottomRightX).toBeCloseTo(250, 6);
			});

			it("a wheel event without a finite cursor position zooms about the center", async () => {
				const boundary = await bindWide(1);
				boxBoundary(boundary);
				simulateDrag(boundary, 100, 100, 150, 100); // pan x to 50

				// Hand-built events often lack clientX/clientY
				boundary.dispatchEvent(
					createWheelEvent(-100, { clientX: Number.NaN, clientY: Number.NaN }),
				);

				expect(croppie.zoom).toBeCloseTo(1.1, 9);
				for (const value of Object.values(croppie.get().points)) {
					expect(Number.isFinite(value)).toBe(true);
				}
				expect(cropCenterX()).toBeCloseTo(150, 6);
			});

			it("pinch zoom keeps the point under the finger midpoint fixed", async () => {
				const boundary = await bindWide(1);
				boxBoundary(boundary);

				boundary.dispatchEvent(
					createTouchEvent("touchstart", [
						{ clientX: 150, clientY: 150 },
						{ clientX: 250, clientY: 150 },
					]),
				);
				boundary.dispatchEvent(
					createTouchEvent("touchmove", [
						{ clientX: 100, clientY: 150 },
						{ clientX: 300, clientY: 150 },
					]),
				);

				expect(croppie.zoom).toBeCloseTo(2, 9);
				expect(croppie.get().points.bottomRightX).toBeCloseTo(250, 6);
			});

			it("a wheel step clamped to the zoom limit emits one zoom and one update, then nothing", async () => {
				const boundary = await bindWide(0.95, { min: 0.5, max: 1 });
				const zoomHandler = mock();
				const updateHandler = mock();
				croppie.on("zoom", zoomHandler);
				croppie.on("update", updateHandler);

				boundary.dispatchEvent(createWheelEvent(-100)); // 0.95 * 1.1 -> clamped to 1

				expect(zoomHandler).toHaveBeenCalledTimes(1);
				expect(zoomHandler.mock.calls[0]?.[0]).toEqual({
					zoom: 1,
					previousZoom: 0.95,
				});
				expect(updateHandler).toHaveBeenCalledTimes(1);

				boundary.dispatchEvent(createWheelEvent(-100)); // already at the max

				expect(zoomHandler).toHaveBeenCalledTimes(1);
				expect(updateHandler).toHaveBeenCalledTimes(1);
			});

			it("zooming out at the coverage minimum emits nothing", async () => {
				croppie = new Croppie(container, {
					viewport: { width: 100, height: 100, type: "square" },
					boundary: { width: 300, height: 300 },
				});
				await croppie.bind(TINY_PNG); // starts at the coverage zoom (1/3)
				const zoomHandler = mock();
				const updateHandler = mock();
				croppie.on("zoom", zoomHandler);
				croppie.on("update", updateHandler);
				const boundary = container.querySelector(".cr-boundary") as HTMLElement;

				boundary.dispatchEvent(createWheelEvent(100));

				expect(zoomHandler).not.toHaveBeenCalled();
				expect(updateHandler).not.toHaveBeenCalled();
			});
		});
	});

	describe("enableZoom", () => {
		// 400x300 image, 100x100 viewport: coverage zoom is 1/3
		let cleanupWideImageMock: () => void;
		let boundary: HTMLElement;

		beforeEach(() => {
			cleanupWideImageMock = installImageMock({ width: 400, height: 300 });
		});

		afterEach(() => {
			cleanupWideImageMock();
		});

		async function bindWith(options: { enableZoom?: boolean }): Promise<void> {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				boundary: { width: 300, height: 300 },
				zoom: { min: 0.1, max: 10 },
				...options,
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });
			boundary = container.querySelector(".cr-boundary") as HTMLElement;
		}

		it("renders the slider by default", async () => {
			await bindWith({});

			expect(container.querySelector(".cr-slider")).not.toBeNull();
		});

		it("renders the slider when enableZoom is true", async () => {
			await bindWith({ enableZoom: true });

			expect(container.querySelector(".cr-slider")).not.toBeNull();
		});

		it("does not render the slider when enableZoom is false", async () => {
			await bindWith({ enableZoom: false });

			expect(container.querySelector(".cr-slider")).toBeNull();
		});

		it("ignores the mouse wheel when enableZoom is false", async () => {
			await bindWith({ enableZoom: false });

			const event = createWheelEvent(-100);
			const preventDefault = mock();
			event.preventDefault = preventDefault;
			boundary.dispatchEvent(event);

			expect(croppie.zoom).toBe(1);
			// The page can still scroll over the cropper
			expect(preventDefault).not.toHaveBeenCalled();
		});

		it("ignores pinch gestures when enableZoom is false", async () => {
			await bindWith({ enableZoom: false });

			boundary.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 150 },
					{ clientX: 200, clientY: 150 },
				]),
			);
			boundary.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 50, clientY: 150 },
					{ clientX: 250, clientY: 150 },
				]),
			);

			expect(croppie.zoom).toBe(1);
		});

		it("still pans when enableZoom is false", async () => {
			await bindWith({ enableZoom: false });
			const before = croppie.get().points.topLeftX;

			simulateDrag(boundary, 100, 100, 130, 100);

			expect(croppie.get().points.topLeftX).not.toBe(before);
		});

		it("setZoom() still works and emits zoom when enableZoom is false", async () => {
			await bindWith({ enableZoom: false });
			const handler = mock();
			croppie.on("zoom", handler);

			croppie.setZoom(2);

			expect(croppie.zoom).toBe(2);
			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toEqual({ zoom: 2, previousZoom: 1 });
		});

		it("the zoom setter still works when enableZoom is false", async () => {
			await bindWith({ enableZoom: false });

			croppie.zoom = 3;

			expect(croppie.zoom).toBe(3);
		});

		it("enableZoom: false wins over showZoomer: true", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				showZoomer: true,
				enableZoom: false,
			});
			await croppie.bind(TINY_PNG);

			expect(container.querySelector(".cr-slider")).toBeNull();
			expect(container.querySelector(".cr-slider-wrap")).toBeNull();
		});
	});
});
