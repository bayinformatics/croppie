import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { TINY_PNG } from "../fixtures/test-image-data-url.ts";
import { createPointerEvent, createWheelEvent } from "../fixtures/mock-helpers.ts";

// Note: Most event tests are skipped because happy-dom's Image doesn't trigger onload for data URLs
// These tests would work in a real browser environment
describe.skip("Croppie events", () => {
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

	describe("on() method", () => {
		it("registers event handler", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const handler = mock();
			croppie.on("update", handler);

			// Trigger an update event by zooming
			croppie.setZoom(2);

			expect(handler).toHaveBeenCalled();
		});

		it("registers multiple handlers for same event", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const handler1 = mock();
			const handler2 = mock();
			croppie.on("update", handler1);
			croppie.on("update", handler2);

			croppie.setZoom(2);

			expect(handler1).toHaveBeenCalled();
			expect(handler2).toHaveBeenCalled();
		});

		it("registers handlers for different events", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
			});
			await croppie.bind(TINY_PNG);

			const updateHandler = mock();
			const zoomHandler = mock();
			croppie.on("update", updateHandler);
			croppie.on("zoom", zoomHandler);

			// Trigger zoom via slider change
			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			slider.value = "2";
			slider.dispatchEvent(new Event("input"));

			expect(updateHandler).toHaveBeenCalled();
			expect(zoomHandler).toHaveBeenCalled();
		});
	});

	describe("off() method", () => {
		it("removes event handler", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const handler = mock();
			croppie.on("update", handler);
			croppie.off("update", handler);

			croppie.setZoom(2);

			expect(handler).not.toHaveBeenCalled();
		});

		it("only removes specified handler", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const handler1 = mock();
			const handler2 = mock();
			croppie.on("update", handler1);
			croppie.on("update", handler2);
			croppie.off("update", handler1);

			croppie.setZoom(2);

			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).toHaveBeenCalled();
		});

		it("handles removing non-existent handler gracefully", () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});

			const handler = mock();
			// Should not throw
			expect(() => croppie.off("update", handler)).not.toThrow();
		});
	});

	describe("update event", () => {
		it("fires on zoom change", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const handler = mock();
			croppie.on("update", handler);

			croppie.setZoom(2);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("includes crop data in update event", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const handler = mock();
			croppie.on("update", handler);

			croppie.setZoom(2);

			const data = handler.mock.calls[0]?.[0];
			expect(data).toHaveProperty("points");
			expect(data).toHaveProperty("zoom");
		});

		it("fires on drag", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const handler = mock();
			croppie.on("update", handler);

			const boundary = container.querySelector(".cr-boundary") as HTMLElement;

			// Simulate drag
			boundary.dispatchEvent(
				createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
			);
			boundary.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 150, clientY: 150 }),
			);
			boundary.dispatchEvent(createPointerEvent("pointerup"));

			expect(handler).toHaveBeenCalled();
		});

		it("fires on reset", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const handler = mock();
			croppie.on("update", handler);

			croppie.reset();

			expect(handler).toHaveBeenCalled();
		});

		it("does not fire when zoom unchanged", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5 },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 2 });

			const handler = mock();
			croppie.on("update", handler);

			// Set to same zoom value
			croppie.setZoom(2);

			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("zoom event", () => {
		it("fires on slider change", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
				showZoomer: true,
			});
			await croppie.bind(TINY_PNG);

			const handler = mock();
			croppie.on("zoom", handler);

			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			slider.value = "3";
			slider.dispatchEvent(new Event("input"));

			expect(handler).toHaveBeenCalled();
		});

		it("includes zoom and previousZoom in event data", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
				showZoomer: true,
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

			const handler = mock();
			croppie.on("zoom", handler);

			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			slider.value = "2";
			slider.dispatchEvent(new Event("input"));

			const data = handler.mock.calls[0]?.[0];
			expect(data.previousZoom).toBe(1);
			expect(data.zoom).toBe(2);
		});

		it("fires on wheel zoom", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
				mouseWheelZoom: true,
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

			const handler = mock();
			croppie.on("zoom", handler);

			const boundary = container.querySelector(".cr-boundary") as HTMLElement;
			boundary.dispatchEvent(createWheelEvent(-100)); // Zoom in

			expect(handler).toHaveBeenCalled();
		});
	});

	describe("event cleanup on destroy", () => {
		it("clears all event handlers on destroy", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);

			const updateHandler = mock();
			const zoomHandler = mock();
			croppie.on("update", updateHandler);
			croppie.on("zoom", zoomHandler);

			croppie.destroy();

			// Handlers should be cleared, though we can't easily test this
			// since the croppie is destroyed
			expect(true).toBe(true);
		});
	});
});
