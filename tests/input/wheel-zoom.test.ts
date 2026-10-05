import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	createWheelZoomHandler,
	WHEEL_FACTOR_PER_NOTCH,
	wheelZoomFactor,
} from "../../src/input/zoom.ts";
import type { ZoomAnchor } from "../../src/utils/transform.ts";
import { createWheelEvent, mockElementRect } from "../fixtures/mock-helpers.ts";

describe("wheelZoomFactor", () => {
	it("is 1.1 for one scroll-up notch", () => {
		expect(WHEEL_FACTOR_PER_NOTCH).toBe(1.1);
		expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0 })).toBeCloseTo(1.1, 9);
	});

	it("is the inverse for one scroll-down notch", () => {
		expect(wheelZoomFactor({ deltaY: 100, deltaMode: 0 })).toBeCloseTo(
			1 / 1.1,
			9,
		);
		expect(wheelZoomFactor({ deltaY: 100, deltaMode: 0 })).toBeCloseTo(
			0.90909,
			5,
		);
	});

	it("scales smoothly with the delta (trackpad)", () => {
		expect(wheelZoomFactor({ deltaY: -50, deltaMode: 0 })).toBeCloseTo(
			1.04881,
			5,
		);
		expect(wheelZoomFactor({ deltaY: -10, deltaMode: 0 })).toBeCloseTo(
			1.1 ** 0.1,
			9,
		);
	});

	it("treats a line delta as 16px per line", () => {
		expect(wheelZoomFactor({ deltaY: -3, deltaMode: 1 })).toBeCloseTo(
			1.0468,
			4,
		);
		expect(wheelZoomFactor({ deltaY: -3, deltaMode: 1 })).toBeCloseTo(
			1.1 ** 0.48,
			9,
		);
	});

	it("caps a page delta (800px) at one notch", () => {
		expect(wheelZoomFactor({ deltaY: -1, deltaMode: 2 })).toBeCloseTo(1.1, 9);
	});

	it("caps a large delta at one notch per event", () => {
		expect(wheelZoomFactor({ deltaY: 10000, deltaMode: 0 })).toBeCloseTo(
			0.90909,
			5,
		);
		expect(wheelZoomFactor({ deltaY: -10000, deltaMode: 0 })).toBeCloseTo(
			1.1,
			9,
		);
	});

	it("is 1 for no delta", () => {
		expect(wheelZoomFactor({ deltaY: 0, deltaMode: 0 })).toBe(1);
	});
});

describe("Wheel Zoom Handler", () => {
	let element: HTMLDivElement;
	let currentZoom: number;
	let getZoom: () => number;
	let requestZoom: ReturnType<typeof mock>;

	function lastRequest(): { zoom: number; anchor: ZoomAnchor } {
		const call = requestZoom.mock.calls.at(-1);
		return { zoom: call?.[0] as number, anchor: call?.[1] as ZoomAnchor };
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
			const cleanup = createWheelZoomHandler(element, getZoom, requestZoom);
			expect(typeof cleanup).toBe("function");
		});
	});

	describe("wheel zoom", () => {
		it("requests a 1.1x zoom on scroll up (negative deltaY)", () => {
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(createWheelEvent(-100));

			expect(requestZoom).toHaveBeenCalledTimes(1);
			expect(lastRequest().zoom).toBeCloseTo(1.1, 9);
		});

		it("requests a 1/1.1 zoom on scroll down (positive deltaY)", () => {
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(createWheelEvent(100));

			expect(lastRequest().zoom).toBeCloseTo(0.90909, 5);
		});

		it("scales a partial notch", () => {
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(createWheelEvent(-50));

			expect(lastRequest().zoom).toBeCloseTo(1.04881, 5);
		});

		it("reads line-mode deltas", () => {
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(createWheelEvent(-3, { deltaMode: 1 }));

			expect(lastRequest().zoom).toBeCloseTo(1.0468, 4);
		});

		it("caps a large delta at one notch", () => {
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(createWheelEvent(10000));

			expect(lastRequest().zoom).toBeCloseTo(0.90909, 5);
		});

		it("is multiplicative: each notch scales the current zoom", () => {
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(createWheelEvent(-100));
			expect(currentZoom).toBeCloseTo(1.1, 9);
			element.dispatchEvent(createWheelEvent(-100));
			expect(currentZoom).toBeCloseTo(1.21, 9);
			element.dispatchEvent(createWheelEvent(-100));
			expect(currentZoom).toBeCloseTo(1.331, 9);
		});

		it("does not clamp: the owner applies the zoom limits", () => {
			currentZoom = 3;
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(createWheelEvent(-100));

			expect(lastRequest().zoom).toBeCloseTo(3.3, 9);
		});

		it("prevents default on wheel events", () => {
			createWheelZoomHandler(element, getZoom, requestZoom);

			const event = createWheelEvent(-100);
			const preventDefault = mock();
			event.preventDefault = preventDefault;

			element.dispatchEvent(event);

			expect(preventDefault).toHaveBeenCalled();
		});
	});

	describe("anchor", () => {
		it("passes the cursor position as an offset from the element centre", () => {
			mockElementRect(element, { left: 0, top: 0, width: 300, height: 300 });
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(
				createWheelEvent(-100, { clientX: 200, clientY: 150 }),
			);

			expect(lastRequest().anchor).toEqual({ x: 50, y: 0 });
		});

		it("accounts for the element's position on the page", () => {
			mockElementRect(element, { left: 100, top: 40, width: 300, height: 300 });
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(
				createWheelEvent(-100, { clientX: 250, clientY: 140 }),
			);

			expect(lastRequest().anchor).toEqual({ x: 0, y: -50 });
		});

		it("falls back to the centre when the element has no layout box", () => {
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(
				createWheelEvent(-100, { clientX: 200, clientY: 150 }),
			);

			expect(lastRequest().anchor).toEqual({ x: 0, y: 0 });
		});
	});

	describe("requireCtrl mode", () => {
		it("ignores wheel events without ctrl when requireCtrl is true", () => {
			createWheelZoomHandler(element, getZoom, requestZoom, {
				requireCtrl: true,
			});

			element.dispatchEvent(createWheelEvent(-100)); // No ctrl

			expect(requestZoom).not.toHaveBeenCalled();
		});

		it("does not prevent default without ctrl when requireCtrl is true", () => {
			createWheelZoomHandler(element, getZoom, requestZoom, {
				requireCtrl: true,
			});

			const event = createWheelEvent(-100);
			const preventDefault = mock();
			event.preventDefault = preventDefault;
			element.dispatchEvent(event);

			expect(preventDefault).not.toHaveBeenCalled();
		});

		it("responds to wheel events with ctrl when requireCtrl is true", () => {
			createWheelZoomHandler(element, getZoom, requestZoom, {
				requireCtrl: true,
			});

			element.dispatchEvent(createWheelEvent(-100, { ctrlKey: true }));

			expect(lastRequest().zoom).toBeCloseTo(1.1, 9);
		});

		it("responds without ctrl when requireCtrl is false", () => {
			createWheelZoomHandler(element, getZoom, requestZoom, {
				requireCtrl: false,
			});

			element.dispatchEvent(createWheelEvent(-100));

			expect(lastRequest().zoom).toBeCloseTo(1.1, 9);
		});

		it("responds when options are not given", () => {
			createWheelZoomHandler(element, getZoom, requestZoom);

			element.dispatchEvent(createWheelEvent(-100));

			expect(lastRequest().zoom).toBeCloseTo(1.1, 9);
		});
	});

	describe("cleanup", () => {
		it("removes the wheel event listener", () => {
			const cleanup = createWheelZoomHandler(element, getZoom, requestZoom);

			cleanup();
			element.dispatchEvent(createWheelEvent(-100));

			expect(requestZoom).not.toHaveBeenCalled();
		});
	});

	describe("edge cases", () => {
		it("ignores zero deltaY without preventing default", () => {
			createWheelZoomHandler(element, getZoom, requestZoom);

			const event = createWheelEvent(0);
			const preventDefault = mock();
			event.preventDefault = preventDefault;

			element.dispatchEvent(event);

			expect(requestZoom).not.toHaveBeenCalled();
			expect(preventDefault).not.toHaveBeenCalled();
		});
	});
});
