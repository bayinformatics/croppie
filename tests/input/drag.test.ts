import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { createDragHandler } from "../../src/input/drag.ts";
import { createPointerEvent } from "../fixtures/mock-helpers.ts";
import type { TransformState } from "../../src/types.ts";

describe("Drag Handler", () => {
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

	describe("initialization", () => {
		it("sets cursor to grab on element", () => {
			createDragHandler(element, getTransform, setTransform);
			expect(element.style.cursor).toBe("grab");
		});

		it("sets touch-action to none", () => {
			createDragHandler(element, getTransform, setTransform);
			expect(element.style.touchAction).toBe("none");
		});

		it("returns a cleanup function", () => {
			const cleanup = createDragHandler(element, getTransform, setTransform);
			expect(typeof cleanup).toBe("function");
		});
	});

	describe("pointer down", () => {
		it("ignores right clicks", () => {
			const onStart = mock();
			createDragHandler(element, getTransform, setTransform, { onStart });

			element.dispatchEvent(createPointerEvent("pointerdown", { button: 2 }));

			expect(onStart).not.toHaveBeenCalled();
		});

		it("ignores middle clicks", () => {
			const onStart = mock();
			createDragHandler(element, getTransform, setTransform, { onStart });

			element.dispatchEvent(createPointerEvent("pointerdown", { button: 1 }));

			expect(onStart).not.toHaveBeenCalled();
		});

		it("responds to left clicks", () => {
			const onStart = mock();
			createDragHandler(element, getTransform, setTransform, { onStart });

			element.dispatchEvent(createPointerEvent("pointerdown", { button: 0 }));

			expect(onStart).toHaveBeenCalled();
		});

		it("changes cursor to grabbing on drag start", () => {
			createDragHandler(element, getTransform, setTransform);

			element.dispatchEvent(createPointerEvent("pointerdown"));

			expect(element.style.cursor).toBe("grabbing");
		});

		it("calls onStart callback with current transform", () => {
			transformState = { x: 10, y: 20, scale: 1.5 };
			const onStart = mock();
			createDragHandler(element, getTransform, setTransform, { onStart });

			element.dispatchEvent(createPointerEvent("pointerdown"));

			expect(onStart).toHaveBeenCalledWith({ x: 10, y: 20, scale: 1.5 });
		});

		it("captures pointer", () => {
			const setPointerCapture = mock();
			element.setPointerCapture = setPointerCapture;

			createDragHandler(element, getTransform, setTransform);
			element.dispatchEvent(createPointerEvent("pointerdown", { pointerId: 42 }));

			expect(setPointerCapture).toHaveBeenCalledWith(42);
		});
	});

	describe("pointer move", () => {
		it("does not update transform when not dragging", () => {
			createDragHandler(element, getTransform, setTransform);

			element.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 150, clientY: 150 }),
			);

			expect(setTransform).not.toHaveBeenCalled();
		});

		it("updates transform based on drag delta", () => {
			createDragHandler(element, getTransform, setTransform);

			// Start drag at (100, 100)
			element.dispatchEvent(
				createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
			);

			// Move to (150, 175)
			element.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 150, clientY: 175 }),
			);

			// Delta is (50, 75), starting from (0, 0)
			expect(setTransform).toHaveBeenCalledWith(50, 75);
		});

		it("accumulates delta from start position", () => {
			transformState = { x: 20, y: 30, scale: 1 };
			createDragHandler(element, getTransform, setTransform);

			element.dispatchEvent(
				createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
			);

			element.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 200, clientY: 250 }),
			);

			// Delta (100, 150) + initial (20, 30) = (120, 180)
			expect(setTransform).toHaveBeenCalledWith(120, 180);
		});

		it("handles negative drag movement", () => {
			createDragHandler(element, getTransform, setTransform);

			element.dispatchEvent(
				createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
			);

			element.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 50, clientY: 25 }),
			);

			expect(setTransform).toHaveBeenCalledWith(-50, -75);
		});

		it("calls onMove callback with current transform", () => {
			const onMove = mock();
			createDragHandler(element, getTransform, setTransform, { onMove });

			element.dispatchEvent(createPointerEvent("pointerdown"));
			element.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 150, clientY: 150 }),
			);

			expect(onMove).toHaveBeenCalled();
		});

		it("calls onMove with updated transform state", () => {
			const onMove = mock();
			createDragHandler(element, getTransform, setTransform, { onMove });

			element.dispatchEvent(
				createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
			);
			element.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 150, clientY: 175 }),
			);

			// After setTransform, transformState is now (50, 75)
			expect(onMove).toHaveBeenCalledWith({ x: 50, y: 75, scale: 1 });
		});
	});

	describe("pointer up", () => {
		it("does nothing when not dragging", () => {
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, { onEnd });

			element.dispatchEvent(createPointerEvent("pointerup"));

			expect(onEnd).not.toHaveBeenCalled();
		});

		it("changes cursor back to grab", () => {
			createDragHandler(element, getTransform, setTransform);

			element.dispatchEvent(createPointerEvent("pointerdown"));
			expect(element.style.cursor).toBe("grabbing");

			element.dispatchEvent(createPointerEvent("pointerup"));
			expect(element.style.cursor).toBe("grab");
		});

		it("calls onEnd callback", () => {
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, { onEnd });

			element.dispatchEvent(createPointerEvent("pointerdown"));
			element.dispatchEvent(createPointerEvent("pointerup"));

			expect(onEnd).toHaveBeenCalled();
		});

		it("releases pointer capture", () => {
			const releasePointerCapture = mock();
			element.releasePointerCapture = releasePointerCapture;

			createDragHandler(element, getTransform, setTransform);

			element.dispatchEvent(createPointerEvent("pointerdown", { pointerId: 42 }));
			element.dispatchEvent(createPointerEvent("pointerup", { pointerId: 42 }));

			expect(releasePointerCapture).toHaveBeenCalledWith(42);
		});

		it("stops responding to move events after up", () => {
			createDragHandler(element, getTransform, setTransform);

			element.dispatchEvent(
				createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
			);
			element.dispatchEvent(createPointerEvent("pointerup"));

			setTransform.mockClear();

			element.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 200, clientY: 200 }),
			);

			expect(setTransform).not.toHaveBeenCalled();
		});
	});

	describe("pointer cancel", () => {
		it("behaves like pointer up", () => {
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, { onEnd });

			element.dispatchEvent(createPointerEvent("pointerdown"));
			element.dispatchEvent(createPointerEvent("pointercancel"));

			expect(onEnd).toHaveBeenCalled();
			expect(element.style.cursor).toBe("grab");
		});
	});

	describe("cleanup", () => {
		it("removes all event listeners", () => {
			const onStart = mock();
			const onMove = mock();
			const onEnd = mock();

			const cleanup = createDragHandler(element, getTransform, setTransform, {
				onStart,
				onMove,
				onEnd,
			});

			cleanup();

			element.dispatchEvent(createPointerEvent("pointerdown"));
			element.dispatchEvent(createPointerEvent("pointermove"));
			element.dispatchEvent(createPointerEvent("pointerup"));

			expect(onStart).not.toHaveBeenCalled();
			expect(onMove).not.toHaveBeenCalled();
			expect(onEnd).not.toHaveBeenCalled();
		});
	});

	describe("complete drag workflow", () => {
		it("performs a full drag operation", () => {
			const onStart = mock();
			const onMove = mock();
			const onEnd = mock();

			transformState = { x: 100, y: 50, scale: 2 };

			createDragHandler(element, getTransform, setTransform, {
				onStart,
				onMove,
				onEnd,
			});

			// Start drag at (200, 200)
			element.dispatchEvent(
				createPointerEvent("pointerdown", { clientX: 200, clientY: 200 }),
			);
			expect(onStart).toHaveBeenCalledWith({ x: 100, y: 50, scale: 2 });

			// Move to (250, 300)
			element.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 250, clientY: 300 }),
			);
			expect(setTransform).toHaveBeenCalledWith(150, 150);

			// Move again to (300, 350)
			element.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 300, clientY: 350 }),
			);
			expect(setTransform).toHaveBeenCalledWith(200, 200);

			// End drag
			element.dispatchEvent(createPointerEvent("pointerup"));
			expect(onEnd).toHaveBeenCalled();
		});
	});
});
