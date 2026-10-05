import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import {
	createPointerEvent,
	createWheelEvent,
	installImageMock,
	simulateDrag,
} from "../fixtures/mock-helpers.ts";
import { TINY_PNG } from "../fixtures/test-image-data-url.ts";

describe("Croppie events", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;
	let cleanupImageMock: () => void;

	beforeEach(() => {
		cleanupImageMock = installImageMock({ width: 400, height: 300 });
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
		cleanupImageMock();
	});

	describe("on() method", () => {
		it("registers event handler", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

			const handler = mock();
			croppie.on("update", handler);

			// Trigger an update event by zooming
			croppie.setZoom(2);

			expect(handler).toHaveBeenCalled();
		});

		it("registers multiple handlers for same event", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

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
				zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

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
				zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

			const handler = mock();
			croppie.on("update", handler);

			croppie.setZoom(2);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("includes crop data in update event", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
			});
			await croppie.bind({ url: TINY_PNG, zoom: 1 });

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

	describe("event contract", () => {
		// 400x300 image in a 100x100 viewport: coverage zoom is 1/3
		async function bindAt(zoom?: number): Promise<void> {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
				zoom: { min: 0.1, max: 10 },
			});
			await croppie.bind(
				zoom === undefined ? TINY_PNG : { url: TINY_PNG, zoom },
			);
		}

		function recordEvents(): string[] {
			const order: string[] = [];
			croppie.on("update", () => order.push("update"));
			croppie.on("zoom", () => order.push("zoom"));
			return order;
		}

		it("setZoom() emits one zoom event with the previous zoom", async () => {
			await bindAt(1);
			const handler = mock();
			croppie.on("zoom", handler);

			croppie.setZoom(2);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toEqual({ zoom: 2, previousZoom: 1 });
		});

		it("the zoom setter emits one zoom event", async () => {
			await bindAt(1);
			const handler = mock();
			croppie.on("zoom", handler);

			croppie.zoom = 3;

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toEqual({ zoom: 3, previousZoom: 1 });
		});

		it("emits nothing when the clamped zoom did not change", async () => {
			await bindAt(3);
			const order = recordEvents();

			croppie.setZoom(3);
			croppie.setZoom(3);
			croppie.zoom = 3;

			expect(order).toEqual([]);
		});

		it("emits nothing when a request is clamped to the current zoom", async () => {
			await bindAt(10);
			const order = recordEvents();

			croppie.setZoom(500); // clamped to the max of 10, where it already is

			expect(order).toEqual([]);
		});

		it("emits nothing for a slider input with an unchanged value", async () => {
			await bindAt(1);
			const order = recordEvents();
			const slider = container.querySelector(".cr-slider") as HTMLInputElement;

			slider.value = "1";
			slider.dispatchEvent(new Event("input"));

			expect(order).toEqual([]);
		});

		it("emits update then zoom for one zoom change", async () => {
			await bindAt(1);
			const order = recordEvents();

			croppie.setZoom(2);

			expect(order).toEqual(["update", "zoom"]);
		});

		it("reset() after a zoom change emits update then zoom with the previous zoom", async () => {
			await bindAt(1);
			croppie.setZoom(2);
			const order = recordEvents();
			const zoomHandler = mock();
			croppie.on("zoom", zoomHandler);

			croppie.reset();

			expect(order).toEqual(["update", "zoom"]);
			expect(zoomHandler.mock.calls[0]?.[0].previousZoom).toBe(2);
			expect(zoomHandler.mock.calls[0]?.[0].zoom).toBeCloseTo(1 / 3, 9);
		});

		it("reset() without a zoom change emits update only", async () => {
			await bindAt(); // starts at the coverage zoom, which reset() returns to
			const order = recordEvents();

			croppie.reset();

			expect(order).toEqual(["update"]);
		});

		it("bind() emits exactly one update to a handler registered before it", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			const handler = mock();
			const zoomHandler = mock();
			croppie.on("update", handler);
			croppie.on("zoom", zoomHandler);

			await croppie.bind({ url: TINY_PNG });

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toHaveProperty("points");
			expect(handler.mock.calls[0]?.[0]).toHaveProperty("zoom");
			expect(zoomHandler).not.toHaveBeenCalled();
		});

		it("setZoom(NaN) is a no-op", async () => {
			await bindAt(2);
			const order = recordEvents();

			croppie.setZoom(Number.NaN);

			expect(croppie.zoom).toBe(2);
			expect(order).toEqual([]);
		});
	});

	describe("drag updates", () => {
		// 400x300 image at its coverage zoom (1/3) in a 100x100 viewport: the image is
		// 133.3 x 100, so the pan range is x in [-16.7, 16.7] and y is locked to 0
		async function bindCovered(): Promise<HTMLElement> {
			croppie = new Croppie(container, {
				viewport: { width: 100, height: 100, type: "square" },
			});
			await croppie.bind(TINY_PNG);
			return container.querySelector(".cr-boundary") as HTMLElement;
		}

		it("emits no update for a fully clamped vertical drag", async () => {
			const boundary = await bindCovered();
			const handler = mock();
			croppie.on("update", handler);

			simulateDrag(boundary, 100, 100, 100, 160);

			expect(handler).not.toHaveBeenCalled();
		});

		it("emits update only while the clamped position changes", async () => {
			const boundary = await bindCovered();
			const handler = mock();
			croppie.on("update", handler);

			boundary.dispatchEvent(
				createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
			);
			// x: 10 (moved), 16.7 (moved, clamped), then 16.7 again (no change)
			for (const clientX of [110, 120, 130]) {
				boundary.dispatchEvent(
					createPointerEvent("pointermove", { clientX, clientY: 100 }),
				);
			}
			boundary.dispatchEvent(createPointerEvent("pointerup"));

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("a second pointer going down ends the pan", async () => {
			const boundary = await bindCovered();
			const handler = mock();
			croppie.on("update", handler);

			boundary.dispatchEvent(
				createPointerEvent("pointerdown", {
					pointerId: 1,
					clientX: 100,
					clientY: 100,
				}),
			);
			boundary.dispatchEvent(
				createPointerEvent("pointerdown", { pointerId: 2 }),
			);
			boundary.dispatchEvent(
				createPointerEvent("pointermove", {
					pointerId: 1,
					clientX: 110,
					clientY: 100,
				}),
			);

			expect(handler).not.toHaveBeenCalled();
		});
	});
});
