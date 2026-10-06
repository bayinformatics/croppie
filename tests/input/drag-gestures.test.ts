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

		transformState = { x: 0, y: 0, scale: 1, rotation: 0 };
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

	/** A touch pointer event; Chromium marks only the first finger of a touch as primary. */
	function touch(
		type: string,
		pointerId: number,
		clientX: number,
		isPrimary: boolean,
	) {
		pointer(type, {
			pointerType: "touch",
			pointerId,
			clientX,
			clientY: 200,
			isPrimary,
		});
	}

	describe("position changes during a drag", () => {
		it("keeps a change made between two moves (a zoom about the cursor)", () => {
			createDragHandler(element, getTransform, setTransform);
			pointer("pointerdown", { clientX: 100, clientY: 100 });
			pointer("pointermove", { clientX: 110, clientY: 105 });

			// A wheel zoom at the cursor moved the image while the button is held
			transformState = { x: 40, y: -20, scale: 2, rotation: 0 };
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

	describe("touch", () => {
		// The page outside the element: the handler never sees what happens there
		let elsewhere: HTMLDivElement;

		beforeEach(() => {
			elsewhere = document.createElement("div");
			document.body.appendChild(elsewhere);
		});

		afterEach(() => {
			elsewhere.remove();
		});

		/** A thumb rests on the page outside the element, so no finger put down later is primary. */
		function restThumbElsewhere() {
			elsewhere.dispatchEvent(
				createPointerEvent("pointerdown", {
					pointerType: "touch",
					pointerId: 1,
					isPrimary: true,
				}),
			);
		}

		it("pans with a finger on the element while another finger rests elsewhere on the page", () => {
			createDragHandler(element, getTransform, setTransform);
			restThumbElsewhere();

			touch("pointerdown", 2, 100, false);
			touch("pointermove", 2, 130, false);

			expect(setTransform).toHaveBeenLastCalledWith(30, 0);
		});

		it("never pans with a second finger on the element, also while a thumb rests elsewhere", () => {
			createDragHandler(element, getTransform, setTransform);
			restThumbElsewhere();

			touch("pointerdown", 2, 100, false); // starts a pan
			touch("pointerdown", 3, 200, false); // second finger on the element: a pinch
			touch("pointermove", 2, 90, false);
			touch("pointermove", 3, 220, false);
			// Finger 2 keeps the capture, so its pointerup reaches the element wherever it lifts
			expect(element.releasePointerCapture).not.toHaveBeenCalled();

			touch("pointerup", 2, 90, false);
			touch("pointerdown", 4, 150, false); // put back while finger 3 is down: still a pinch
			touch("pointermove", 4, 170, false);
			expect(setTransform).not.toHaveBeenCalled();

			// Both fingers lifted from the element: the next one pans, though the thumb still rests
			touch("pointerup", 3, 220, false);
			touch("pointerup", 4, 170, false);
			touch("pointerdown", 5, 100, false);
			touch("pointermove", 5, 125, false);
			expect(setTransform).toHaveBeenLastCalledWith(25, 0);
		});

		it("stops counting a finger that was canceled or lost its capture", () => {
			createDragHandler(element, getTransform, setTransform);
			restThumbElsewhere();

			touch("pointerdown", 2, 100, false);
			touch("pointerdown", 3, 200, false);
			touch("pointercancel", 2, 100, false);
			touch("lostpointercapture", 3, 200, false); // its pointerup may not reach the element
			touch("pointerdown", 4, 150, false);
			touch("pointermove", 4, 160, false);

			expect(setTransform).toHaveBeenLastCalledWith(10, 0);
		});

		it("pans with a fresh touch after a finger's pointerup was lost", () => {
			createDragHandler(element, getTransform, setTransform);

			touch("pointerdown", 2, 100, true);
			touch("pointerdown", 3, 200, false);
			// Finger 2's pointerup was lost; finger 3 lifts normally
			touch("pointerup", 3, 200, false);
			// No finger is down anywhere, so the next one is primary
			touch("pointerdown", 4, 100, true);
			touch("pointermove", 4, 140, true);

			expect(setTransform).toHaveBeenLastCalledWith(40, 0);
		});

		it("pans with a new first finger after the panning finger's pointerup was lost", () => {
			const onStart = mock();
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, {
				onStart,
				onEnd,
			});

			touch("pointerdown", 2, 100, true);
			touch("pointermove", 2, 110, true); // x = 10
			// Finger 2's pointerup was lost: no finger is down, so the next one is primary
			touch("pointerdown", 3, 200, true);
			touch("pointermove", 3, 230, true);

			expect(setTransform).toHaveBeenLastCalledWith(40, 0);
			expect(onEnd).toHaveBeenCalledTimes(1);
			expect(onStart).toHaveBeenCalledTimes(2);
		});

		it("pans with a first touch after a mouse drag whose pointerup was lost", () => {
			// Without pointer capture a mouseup outside the element never reaches it
			element.setPointerCapture = mock(() => {
				throw new Error("capture unavailable");
			});
			createDragHandler(element, getTransform, setTransform);

			pointer("pointerdown", { clientX: 100, clientY: 100 }); // the mouse
			pointer("pointermove", { clientX: 110, clientY: 100 }); // x = 10
			touch("pointerdown", 2, 200, true);
			touch("pointermove", 2, 230, true);

			expect(setTransform).toHaveBeenLastCalledWith(40, 0);
		});

		it("does not pan with a finger put down while another is down on the element, but pans with the next touch", () => {
			const onStart = mock();
			createDragHandler(element, getTransform, setTransform, { onStart });

			touch("pointerdown", 2, 140, true); // first finger: starts a pan
			touch("pointerdown", 3, 220, false); // second finger: a pinch, the pan ends
			touch("pointerup", 3, 230, false); // second finger lifted, the first stays
			touch("pointerdown", 4, 210, false); // a replacement finger resumes the pinch
			touch("pointermove", 4, 180, false);

			expect(onStart).toHaveBeenCalledTimes(1);
			expect(setTransform).not.toHaveBeenCalled();
			expect(element.style.cursor).toBe("grab");

			// All fingers lifted: the first finger of the next touch pans again
			touch("pointerup", 2, 140, true);
			touch("pointerup", 4, 180, false);
			touch("pointerdown", 5, 100, true);
			touch("pointermove", 5, 130, true);

			expect(setTransform).toHaveBeenCalledTimes(1);
			expect(setTransform).toHaveBeenLastCalledWith(30, 0);
		});

		it("resumes the pan with the first finger when the second finger lifts", () => {
			const onStart = mock();
			createDragHandler(element, getTransform, setTransform, { onStart });

			touch("pointerdown", 2, 100, true); // A pans
			touch("pointermove", 2, 110, true); // x = 10
			touch("pointerdown", 3, 200, false); // B lands: a pinch, the pan ends
			touch("pointermove", 2, 150, true); // a pinch move does not pan
			touch("pointerup", 3, 200, false); // B lifts, A is the only finger left

			// A's next move is the new starting point: the image does not jump
			touch("pointermove", 2, 160, true);
			expect(transformState.x).toBe(10);

			touch("pointermove", 2, 175, true);
			expect(transformState.x).toBe(25);
			expect(onStart).toHaveBeenCalledTimes(2);
		});

		it("resumes the pan with the second finger when the first finger lifts", () => {
			createDragHandler(element, getTransform, setTransform);

			touch("pointerdown", 2, 100, true);
			touch("pointerdown", 3, 200, false);
			touch("pointerup", 2, 100, true);
			touch("pointermove", 3, 210, false); // the new starting point
			touch("pointermove", 3, 230, false);

			expect(setTransform).toHaveBeenLastCalledWith(20, 0);
		});

		it("does not pan when the first finger of a pinch is lifted and replaced", () => {
			createDragHandler(element, getTransform, setTransform);

			touch("pointerdown", 2, 140, true);
			touch("pointerdown", 3, 220, false);
			touch("pointerup", 2, 140, true); // the primary finger lifted
			touch("pointerdown", 5, 120, false);
			touch("pointermove", 5, 100, false);

			expect(setTransform).not.toHaveBeenCalled();
		});
	});

	describe("same pointer pressed again", () => {
		it("starts a fresh drag when the pointerup was lost", () => {
			const onStart = mock();
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, {
				onStart,
				onEnd,
			});
			pointer("pointerdown", { clientX: 100, clientY: 100 });
			pointer("pointermove", { clientX: 110, clientY: 100 }); // x = 10

			// Released in another window: the next press arrives without an up or a move
			pointer("pointerdown", { clientX: 300, clientY: 300 });
			pointer("pointermove", { clientX: 310, clientY: 305 });

			expect(transformState).toMatchObject({ x: 20, y: 5 });
			expect(onEnd).toHaveBeenCalledTimes(1);
			expect(onStart).toHaveBeenCalledTimes(2);
			// The pointer stays captured for the new drag
			expect(element.setPointerCapture).toHaveBeenCalledTimes(2);
			expect(element.releasePointerCapture).not.toHaveBeenCalled();
		});

		it("ends the drag when the same pointer goes down with another button", () => {
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, { onEnd });
			pointer("pointerdown", { clientX: 100, clientY: 100 });
			pointer("pointermove", { clientX: 110, clientY: 100 });

			// The left button's pointerup was lost, then the right button is pressed
			pointer("pointerdown", { button: 2, clientX: 200, clientY: 200 });
			pointer("pointermove", { clientX: 250, clientY: 200 });

			expect(onEnd).toHaveBeenCalledTimes(1);
			expect(setTransform).toHaveBeenCalledTimes(1);
			expect(element.style.cursor).toBe("grab");
		});
	});
});
