import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createDragHandler } from "../../src/input/drag.ts";
import type { TransformState } from "../../src/types.ts";
import {
	createPointerEvent,
	mockElementRect,
} from "../fixtures/mock-helpers.ts";

describe("Drag Handler gestures", () => {
	let element: HTMLDivElement;
	let transformState: TransformState;
	let getTransform: () => TransformState;
	let setTransform: ReturnType<typeof mock>;

	beforeEach(() => {
		element = document.createElement("div");
		document.body.appendChild(element);

		// Mock pointer capture methods (not implemented in happy-dom)
		element.setPointerCapture = mock();
		element.releasePointerCapture = mock();

		transformState = { x: 0, y: 0, scale: 1 };
		getTransform = () => transformState;
		setTransform = mock((x: number, y: number) => {
			transformState.x = x;
			transformState.y = y;
		});
	});

	afterEach(() => {
		element.remove();
	});

	function pointer(type: string, options: Partial<PointerEventInit> = {}) {
		element.dispatchEvent(createPointerEvent(type, options));
	}

	describe("position changes during a drag", () => {
		it("keeps a change made between two moves (a zoom about the cursor)", () => {
			createDragHandler(element, getTransform, setTransform);
			pointer("pointerdown", { clientX: 100, clientY: 100 });
			pointer("pointermove", { clientX: 110, clientY: 105 });

			// A wheel zoom at the cursor moved the image while the button is held
			transformState = { x: 40, y: -20, scale: 2 };
			pointer("pointermove", { clientX: 113, clientY: 109 });

			// Only the movement since the previous move is added
			expect(setTransform).toHaveBeenLastCalledWith(43, -16);
		});

		it("continues from the position setTransform clamped to", () => {
			// The bounds stop the image at x = 20
			setTransform = mock((x: number, y: number) => {
				transformState.x = Math.min(x, 20);
				transformState.y = y;
			});
			createDragHandler(element, getTransform, setTransform);
			pointer("pointerdown", { clientX: 100, clientY: 100 });
			pointer("pointermove", { clientX: 150, clientY: 100 }); // 50, clamped to 20

			// Moving back moves the image back right away
			pointer("pointermove", { clientX: 140, clientY: 100 });

			expect(transformState.x).toBe(10);
		});
	});

	describe("CSS-scaled element", () => {
		it("moves by layout pixels when the element is displayed at half size", () => {
			// Laid out at 300x300 but displayed at 150x150: a client pixel is two layout pixels
			mockElementRect(element, {
				left: 0,
				top: 0,
				width: 150,
				height: 150,
				offsetWidth: 300,
				offsetHeight: 300,
			});
			createDragHandler(element, getTransform, setTransform);

			pointer("pointerdown", { clientX: 50, clientY: 50 });
			pointer("pointermove", { clientX: 60, clientY: 45 });

			expect(setTransform).toHaveBeenLastCalledWith(20, -10);
		});

		it("moves by layout pixels when the element is displayed at double size", () => {
			mockElementRect(element, {
				left: 0,
				top: 0,
				width: 600,
				height: 400,
				offsetWidth: 300,
				offsetHeight: 200,
			});
			createDragHandler(element, getTransform, setTransform);

			pointer("pointerdown", { clientX: 100, clientY: 100 });
			pointer("pointermove", { clientX: 110, clientY: 130 });
			pointer("pointermove", { clientX: 90, clientY: 140 });

			expect(setTransform).toHaveBeenLastCalledWith(-5, 20);
		});
	});
});
