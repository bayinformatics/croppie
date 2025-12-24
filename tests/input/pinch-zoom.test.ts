import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { createPinchZoomHandler } from "../../src/input/zoom.ts";
import { createTouchEvent } from "../fixtures/mock-helpers.ts";
import type { ZoomConfig } from "../../src/types.ts";

describe("Pinch Zoom Handler", () => {
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
			const cleanup = createPinchZoomHandler(element, getZoom, setZoom, config);
			expect(typeof cleanup).toBe("function");
		});
	});

	describe("touch start", () => {
		it("ignores single touch", () => {
			createPinchZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(
				createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]),
			);

			// No zoom change on single touch
			expect(setZoom).not.toHaveBeenCalled();
		});

		it("initializes on two-finger touch", () => {
			const onChange = mock();
			createPinchZoomHandler(element, getZoom, setZoom, config, { onChange });

			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);

			// Just starting - no zoom change yet
			expect(setZoom).not.toHaveBeenCalled();
		});
	});

	describe("pinch gestures", () => {
		it("zooms in when fingers spread apart", () => {
			createPinchZoomHandler(element, getZoom, setZoom, config);

			// Start with fingers 100px apart
			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);

			// Move fingers to 200px apart (2x scale)
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 50, clientY: 100 },
					{ clientX: 250, clientY: 100 },
				]),
			);

			// Should zoom to 2x
			expect(setZoom).toHaveBeenCalledWith(2);
		});

		it("zooms out when fingers pinch together", () => {
			currentZoom = 2;
			createPinchZoomHandler(element, getZoom, setZoom, config);

			// Start with fingers 200px apart
			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 50, clientY: 100 },
					{ clientX: 250, clientY: 100 },
				]),
			);

			// Move fingers to 100px apart (0.5x scale)
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);

			// Should zoom to 1x (2 * 0.5)
			expect(setZoom).toHaveBeenCalledWith(1);
		});

		it("clamps zoom to maximum", () => {
			currentZoom = 2;
			createPinchZoomHandler(element, getZoom, setZoom, config);

			// Start with fingers 100px apart
			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);

			// Spread to 500px (5x scale would give 10x zoom)
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 0, clientY: 100 },
					{ clientX: 500, clientY: 100 },
				]),
			);

			// Should be clamped to max (3)
			expect(setZoom).toHaveBeenCalledWith(3);
		});

		it("clamps zoom to minimum", () => {
			currentZoom = 1;
			createPinchZoomHandler(element, getZoom, setZoom, config);

			// Start with fingers 200px apart
			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 50, clientY: 100 },
					{ clientX: 250, clientY: 100 },
				]),
			);

			// Pinch to 20px (0.1x scale would give 0.1x zoom)
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 145, clientY: 100 },
					{ clientX: 165, clientY: 100 },
				]),
			);

			// Should be clamped to min (0.5)
			expect(setZoom).toHaveBeenCalledWith(0.5);
		});

		it("calculates diagonal distance correctly", () => {
			createPinchZoomHandler(element, getZoom, setZoom, config);

			// Start with fingers in diagonal (100, 100) to (200, 200) = distance ~141.42
			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 200 },
				]),
			);

			// Move to double the diagonal distance
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 50, clientY: 50 },
					{ clientX: 250, clientY: 250 },
				]),
			);

			// Distance doubled, so zoom should be 2x
			expect(setZoom).toHaveBeenCalledWith(2);
		});
	});

	describe("callbacks", () => {
		it("calls onChange with new and previous zoom", () => {
			const onChange = mock();
			createPinchZoomHandler(element, getZoom, setZoom, config, { onChange });

			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);

			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 50, clientY: 100 },
					{ clientX: 250, clientY: 100 },
				]),
			);

			expect(onChange).toHaveBeenCalledWith(2, 1);
		});

		it("does not call onChange when zoom unchanged", () => {
			currentZoom = 3; // At max
			const onChange = mock();
			createPinchZoomHandler(element, getZoom, setZoom, config, { onChange });

			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);

			// Try to zoom in further (would exceed max)
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 0, clientY: 100 },
					{ clientX: 300, clientY: 100 },
				]),
			);

			// setZoom should NOT be called since zoom didn't actually change (clamped = current)
			expect(setZoom).not.toHaveBeenCalled();
			// onChange should not be called since zoom didn't change
			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe("touch end", () => {
		it("resets pinch tracking on touch end", () => {
			createPinchZoomHandler(element, getZoom, setZoom, config);

			// Start pinch
			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);

			// End pinch
			element.dispatchEvent(createTouchEvent("touchend", []));

			// Try to move - should be ignored since pinch was reset
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 50, clientY: 100 },
					{ clientX: 250, clientY: 100 },
				]),
			);

			// No zoom change since initialDistance was reset
			expect(setZoom).not.toHaveBeenCalled();
		});

		it("allows new pinch gesture after touch end", () => {
			createPinchZoomHandler(element, getZoom, setZoom, config);

			// First pinch
			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);
			element.dispatchEvent(createTouchEvent("touchend", []));

			// Second pinch
			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 50, clientY: 100 },
					{ clientX: 250, clientY: 100 },
				]),
			);

			expect(setZoom).toHaveBeenCalledWith(2);
		});
	});

	describe("single finger handling", () => {
		it("ignores single-finger touch move", () => {
			createPinchZoomHandler(element, getZoom, setZoom, config);

			element.dispatchEvent(
				createTouchEvent("touchmove", [{ clientX: 200, clientY: 200 }]),
			);

			expect(setZoom).not.toHaveBeenCalled();
		});

		it("ignores touch move without prior two-finger start", () => {
			createPinchZoomHandler(element, getZoom, setZoom, config);

			// Two finger move without two finger start
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 50, clientY: 100 },
					{ clientX: 250, clientY: 100 },
				]),
			);

			expect(setZoom).not.toHaveBeenCalled();
		});
	});

	describe("cleanup", () => {
		it("removes all touch event listeners", () => {
			const onChange = mock();
			const cleanup = createPinchZoomHandler(element, getZoom, setZoom, config, {
				onChange,
			});

			cleanup();

			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 50, clientY: 100 },
					{ clientX: 250, clientY: 100 },
				]),
			);

			expect(setZoom).not.toHaveBeenCalled();
			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe("continuous pinch", () => {
		it("tracks zoom changes during continuous pinch", () => {
			createPinchZoomHandler(element, getZoom, setZoom, config);

			// Start with 100px distance
			element.dispatchEvent(
				createTouchEvent("touchstart", [
					{ clientX: 100, clientY: 100 },
					{ clientX: 200, clientY: 100 },
				]),
			);

			// First move: 150px (1.5x from initial)
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 75, clientY: 100 },
					{ clientX: 225, clientY: 100 },
				]),
			);
			expect(setZoom).toHaveBeenLastCalledWith(1.5);

			// Second move: 200px (2x from initial)
			element.dispatchEvent(
				createTouchEvent("touchmove", [
					{ clientX: 50, clientY: 100 },
					{ clientX: 250, clientY: 100 },
				]),
			);
			expect(setZoom).toHaveBeenLastCalledWith(2);
		});
	});
});
