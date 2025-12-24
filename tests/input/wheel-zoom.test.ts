import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { createWheelZoomHandler } from "../../src/input/zoom.ts";
import { createWheelEvent } from "../fixtures/mock-helpers.ts";
import type { ZoomConfig } from "../../src/types.ts";

describe("Wheel Zoom Handler", () => {
	let element: HTMLDivElement;
	let currentZoom: number;
	let getZoom: () => number;
	let setZoom: ReturnType<typeof mock>;
	let config: ZoomConfig;

	beforeEach(() => {
		element = document.createElement("div");
		document.body.appendChild(element);

		currentZoom = 1;
		getZoom = () => currentZoom;
		setZoom = mock((zoom: number) => {
			currentZoom = zoom;
		});

		config = { min: 0.5, max: 3 };
	});

	afterEach(() => {
		element.remove();
	});

	describe("initialization", () => {
		it("returns a cleanup function", () => {
			const cleanup = createWheelZoomHandler(
				element,
				getZoom,
				setZoom,
				config,
			);
			expect(typeof cleanup).toBe("function");
		});
	});

	describe("wheel zoom", () => {
		it("zooms out on scroll down (positive deltaY)", () => {
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(100)); // Scroll down

			// Should decrease zoom by 0.1
			expect(setZoom).toHaveBeenCalledWith(0.9);
		});

		it("zooms in on scroll up (negative deltaY)", () => {
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(-100)); // Scroll up

			// Should increase zoom by 0.1
			expect(setZoom).toHaveBeenCalledWith(1.1);
		});

		it("clamps zoom to minimum", () => {
			currentZoom = 0.55; // Just above min
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(100)); // Try to zoom out

			// Should be clamped to min (0.5)
			expect(setZoom).toHaveBeenCalledWith(0.5);
		});

		it("clamps zoom to maximum", () => {
			currentZoom = 2.95; // Just below max
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(-100)); // Try to zoom in

			// Should be clamped to max (3)
			expect(setZoom).toHaveBeenCalledWith(3);
		});

		it("does not call setZoom when at minimum and scrolling down", () => {
			currentZoom = 0.5; // At min
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(100)); // Try to zoom out

			expect(setZoom).not.toHaveBeenCalled();
		});

		it("does not call setZoom when at maximum and scrolling up", () => {
			currentZoom = 3; // At max
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(-100)); // Try to zoom in

			expect(setZoom).not.toHaveBeenCalled();
		});

		it("calls onChange callback with new and previous zoom", () => {
			const onChange = mock();
			createWheelZoomHandler(element, getZoom, setZoom, config, { onChange });

			element.dispatchEvent(createWheelEvent(-100)); // Zoom in

			expect(onChange).toHaveBeenCalledWith(1.1, 1);
		});

		it("does not call onChange when zoom unchanged", () => {
			currentZoom = 3; // At max
			const onChange = mock();
			createWheelZoomHandler(element, getZoom, setZoom, config, { onChange });

			element.dispatchEvent(createWheelEvent(-100)); // Try to zoom in

			expect(onChange).not.toHaveBeenCalled();
		});

		it("prevents default on wheel events", () => {
			createWheelZoomHandler(element, getZoom, setZoom, config);

			const event = createWheelEvent(-100);
			const preventDefault = mock();
			event.preventDefault = preventDefault;

			element.dispatchEvent(event);

			expect(preventDefault).toHaveBeenCalled();
		});
	});

	describe("requireCtrl mode", () => {
		it("ignores wheel events without ctrl when requireCtrl is true", () => {
			createWheelZoomHandler(element, getZoom, setZoom, config, undefined, true);

			element.dispatchEvent(createWheelEvent(-100)); // No ctrl

			expect(setZoom).not.toHaveBeenCalled();
		});

		it("responds to wheel events with ctrl when requireCtrl is true", () => {
			createWheelZoomHandler(element, getZoom, setZoom, config, undefined, true);

			element.dispatchEvent(createWheelEvent(-100, { ctrlKey: true }));

			expect(setZoom).toHaveBeenCalledWith(1.1);
		});

		it("responds to wheel events without ctrl when requireCtrl is false", () => {
			createWheelZoomHandler(element, getZoom, setZoom, config, undefined, false);

			element.dispatchEvent(createWheelEvent(-100));

			expect(setZoom).toHaveBeenCalledWith(1.1);
		});

		it("responds to wheel events when requireCtrl is not specified", () => {
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(-100));

			expect(setZoom).toHaveBeenCalledWith(1.1);
		});

		it("does not call onChange when ctrl not pressed in requireCtrl mode", () => {
			const onChange = mock();
			createWheelZoomHandler(
				element,
				getZoom,
				setZoom,
				config,
				{ onChange },
				true,
			);

			element.dispatchEvent(createWheelEvent(-100)); // No ctrl

			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe("multiple wheel events", () => {
		it("accumulates zoom changes", () => {
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(-100)); // Zoom in
			expect(currentZoom).toBeCloseTo(1.1, 5);

			element.dispatchEvent(createWheelEvent(-100)); // Zoom in again
			expect(currentZoom).toBeCloseTo(1.2, 5);

			element.dispatchEvent(createWheelEvent(-100)); // Zoom in again
			expect(currentZoom).toBeCloseTo(1.3, 5);
		});

		it("stops at bounds", () => {
			config = { min: 1, max: 1.25 };
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(-100)); // +0.1 = 1.1
			element.dispatchEvent(createWheelEvent(-100)); // +0.1 = 1.2
			element.dispatchEvent(createWheelEvent(-100)); // +0.1 = 1.25 (clamped)
			element.dispatchEvent(createWheelEvent(-100)); // stays at 1.25

			expect(currentZoom).toBeCloseTo(1.25, 5);
		});
	});

	describe("cleanup", () => {
		it("removes wheel event listener", () => {
			const onChange = mock();
			const cleanup = createWheelZoomHandler(element, getZoom, setZoom, config, {
				onChange,
			});

			cleanup();

			element.dispatchEvent(createWheelEvent(-100));

			expect(setZoom).not.toHaveBeenCalled();
			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe("edge cases", () => {
		it("handles zero deltaY", () => {
			createWheelZoomHandler(element, getZoom, setZoom, config);

			// Zero deltaY means no scroll - should be ignored
			element.dispatchEvent(createWheelEvent(0));

			expect(setZoom).not.toHaveBeenCalled();
		});

		it("handles very small config range", () => {
			config = { min: 1, max: 1.05 };
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(-100)); // Try to zoom in by 0.1

			// Should be clamped to max (1.05)
			expect(setZoom).toHaveBeenCalledWith(1.05);
		});

		it("handles large deltaY values", () => {
			createWheelZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(createWheelEvent(10000)); // Large scroll down

			// Should still only decrease by 0.1
			expect(setZoom).toHaveBeenCalledWith(0.9);
		});
	});
});
