import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createPinchZoomHandler } from "../../src/input/zoom.ts";
import type { ZoomAnchor } from "../../src/utils/transform.ts";
import { createTouchEvent, mockElementRect } from "../fixtures/mock-helpers.ts";

type Finger = { clientX: number; clientY: number };

describe("Pinch Zoom Handler", () => {
	let element: HTMLDivElement;
	let currentZoom: number;
	let getZoom: () => number;
	let requestZoom: ReturnType<typeof mock>;

	function lastRequest(): { zoom: number; anchor: ZoomAnchor } {
		const call = requestZoom.mock.calls.at(-1);
		return { zoom: call?.[0] as number, anchor: call?.[1] as ZoomAnchor };
	}

	function touch(type: string, ...fingers: Finger[]): void {
		element.dispatchEvent(createTouchEvent(type, fingers));
	}

	beforeEach(() => {
		element = document.createElement("div");
		document.body.appendChild(element);

		currentZoom = 1;
		getZoom = () => currentZoom;
		// The handler only proposes a zoom; this stands in for the owner applying it
		requestZoom = mock((zoom: number, _anchor: ZoomAnchor) => {
			currentZoom = zoom;
		});
	});

	afterEach(() => {
		element.remove();
	});

	describe("initialization", () => {
		it("returns a cleanup function", () => {
			const cleanup = createPinchZoomHandler(element, getZoom, requestZoom);
			expect(typeof cleanup).toBe("function");
		});
	});

	describe("touch start", () => {
		it("ignores single touch", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch("touchstart", { clientX: 100, clientY: 100 });

			expect(requestZoom).not.toHaveBeenCalled();
		});

		it("requests nothing on a two-finger start", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);

			expect(requestZoom).not.toHaveBeenCalled();
		});
	});

	describe("pinch gestures", () => {
		it("requests a larger zoom when fingers spread apart", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);
			// 100px -> 200px apart
			touch(
				"touchmove",
				{ clientX: 50, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);

			expect(lastRequest().zoom).toBeCloseTo(2, 9);
		});

		it("requests a smaller zoom when fingers pinch together", () => {
			currentZoom = 2;
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 50, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);
			// 200px -> 100px apart
			touch(
				"touchmove",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);

			expect(lastRequest().zoom).toBeCloseTo(1, 9);
		});

		it("does not clamp: the owner applies the zoom limits", () => {
			currentZoom = 2;
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);
			// 100px -> 500px apart (5x)
			touch(
				"touchmove",
				{ clientX: 0, clientY: 100 },
				{ clientX: 500, clientY: 100 },
			);

			expect(lastRequest().zoom).toBeCloseTo(10, 9);
		});

		it("does not clamp a pinch toward a tiny zoom", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 50, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);
			// 200px -> 20px apart
			touch(
				"touchmove",
				{ clientX: 145, clientY: 100 },
				{ clientX: 165, clientY: 100 },
			);

			expect(lastRequest().zoom).toBeCloseTo(0.1, 9);
		});

		it("measures diagonal distance", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 200 },
			);
			// Double the diagonal distance
			touch(
				"touchmove",
				{ clientX: 50, clientY: 50 },
				{ clientX: 250, clientY: 250 },
			);

			expect(lastRequest().zoom).toBeCloseTo(2, 9);
		});

		it("scales the zoom captured at the start, not the latest request", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);
			touch(
				"touchmove",
				{ clientX: 75, clientY: 100 },
				{ clientX: 225, clientY: 100 },
			);
			expect(lastRequest().zoom).toBeCloseTo(1.5, 9);

			touch(
				"touchmove",
				{ clientX: 50, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);
			expect(lastRequest().zoom).toBeCloseTo(2, 9);
		});
	});

	describe("anchor", () => {
		it("anchors at the finger midpoint, relative to the element centre", () => {
			mockElementRect(element, { left: 0, top: 0, width: 300, height: 300 });
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 150, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);
			touch(
				"touchmove",
				{ clientX: 100, clientY: 100 },
				{ clientX: 300, clientY: 100 },
			);

			// Midpoint (200, 100) is 50px right of and 50px above the centre (150, 150)
			expect(lastRequest().anchor).toEqual({ x: 50, y: -50 });
		});

		it("follows the midpoint as the fingers move", () => {
			mockElementRect(element, { left: 0, top: 0, width: 300, height: 300 });
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 100, clientY: 150 },
				{ clientX: 200, clientY: 150 },
			);
			touch(
				"touchmove",
				{ clientX: 150, clientY: 150 },
				{ clientX: 250, clientY: 150 },
			);

			// Same distance, midpoint moved from 150 to 200
			expect(lastRequest().anchor).toEqual({ x: 50, y: 0 });
			expect(lastRequest().zoom).toBeCloseTo(1, 9);
		});

		it("falls back to the centre when the element has no layout box", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);
			touch(
				"touchmove",
				{ clientX: 50, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);

			expect(lastRequest().anchor).toEqual({ x: 0, y: 0 });
		});
	});

	describe("touch end", () => {
		it("resets pinch tracking on touch end", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);
			touch("touchend");

			// Ignored: the pinch was reset
			touch(
				"touchmove",
				{ clientX: 50, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);

			expect(requestZoom).not.toHaveBeenCalled();
		});

		it("resets pinch tracking on touch cancel", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);
			touch("touchcancel");

			touch(
				"touchmove",
				{ clientX: 50, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);

			expect(requestZoom).not.toHaveBeenCalled();
		});

		it("allows a new pinch gesture after touch end", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);
			touch("touchend");

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);
			touch(
				"touchmove",
				{ clientX: 50, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);

			expect(lastRequest().zoom).toBeCloseTo(2, 9);
		});
	});

	describe("single finger handling", () => {
		it("ignores single-finger touch move", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch("touchmove", { clientX: 200, clientY: 200 });

			expect(requestZoom).not.toHaveBeenCalled();
		});

		it("ignores touch move without a prior two-finger start", () => {
			createPinchZoomHandler(element, getZoom, requestZoom);

			touch(
				"touchmove",
				{ clientX: 50, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);

			expect(requestZoom).not.toHaveBeenCalled();
		});
	});

	describe("cleanup", () => {
		it("removes all touch event listeners", () => {
			const cleanup = createPinchZoomHandler(element, getZoom, requestZoom);

			cleanup();

			touch(
				"touchstart",
				{ clientX: 100, clientY: 100 },
				{ clientX: 200, clientY: 100 },
			);
			touch(
				"touchmove",
				{ clientX: 50, clientY: 100 },
				{ clientX: 250, clientY: 100 },
			);
			touch("touchcancel");

			expect(requestZoom).not.toHaveBeenCalled();
		});
	});
});
