import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createDragHandler } from "../../src/input/drag.ts";
import type { TransformState } from "../../src/types.ts";
import { createPointerEvent } from "../fixtures/mock-helpers.ts";

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
			transformState = { x: 10, y: 20, scale: 1.5, rotation: 0 };
			const onStart = mock();
			createDragHandler(element, getTransform, setTransform, { onStart });

			element.dispatchEvent(createPointerEvent("pointerdown"));

			expect(onStart).toHaveBeenCalledWith({
				x: 10,
				y: 20,
				scale: 1.5,
				rotation: 0,
			});
		});

		it("captures pointer", () => {
			const setPointerCapture = mock();
			element.setPointerCapture = setPointerCapture;

			createDragHandler(element, getTransform, setTransform);
			element.dispatchEvent(
				createPointerEvent("pointerdown", { pointerId: 42 }),
			);

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
			transformState = { x: 20, y: 30, scale: 1, rotation: 0 };
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
			expect(onMove).toHaveBeenCalledWith({
				x: 50,
				y: 75,
				scale: 1,
				rotation: 0,
			});
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

			element.dispatchEvent(
				createPointerEvent("pointerdown", { pointerId: 42 }),
			);
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
			element.dispatchEvent(createPointerEvent("lostpointercapture"));

			expect(onStart).not.toHaveBeenCalled();
			expect(onMove).not.toHaveBeenCalled();
			expect(onEnd).not.toHaveBeenCalled();
		});

		it("removes the lostpointercapture listener", () => {
			const onEnd = mock();
			const cleanup = createDragHandler(element, getTransform, setTransform, {
				onEnd,
			});

			element.dispatchEvent(createPointerEvent("pointerdown"));
			cleanup();
			element.dispatchEvent(createPointerEvent("lostpointercapture"));

			expect(onEnd).not.toHaveBeenCalled();
		});
	});

	describe("pointer id tracking", () => {
		function start(onEnd = mock(), onStart = mock()) {
			createDragHandler(element, getTransform, setTransform, {
				onStart,
				onEnd,
			});
			element.dispatchEvent(
				createPointerEvent("pointerdown", {
					pointerId: 1,
					clientX: 100,
					clientY: 100,
				}),
			);
			return { onStart, onEnd };
		}

		it("ignores moves from another pointer", () => {
			start();

			element.dispatchEvent(
				createPointerEvent("pointermove", {
					pointerId: 2,
					clientX: 150,
					clientY: 150,
				}),
			);

			expect(setTransform).not.toHaveBeenCalled();
		});

		it("keeps following the active pointer", () => {
			start();

			element.dispatchEvent(
				createPointerEvent("pointermove", {
					pointerId: 1,
					clientX: 130,
					clientY: 100,
				}),
			);

			expect(setTransform).toHaveBeenCalledWith(30, 0);
		});

		it("ignores pointerup from another pointer", () => {
			const { onEnd } = start();

			element.dispatchEvent(createPointerEvent("pointerup", { pointerId: 2 }));

			expect(onEnd).not.toHaveBeenCalled();
			expect(element.style.cursor).toBe("grabbing");
			// Still dragging with the original pointer
			element.dispatchEvent(
				createPointerEvent("pointermove", {
					pointerId: 1,
					clientX: 120,
					clientY: 100,
				}),
			);
			expect(setTransform).toHaveBeenCalledWith(20, 0);
		});

		it("ignores pointercancel from another pointer", () => {
			const { onEnd } = start();

			element.dispatchEvent(
				createPointerEvent("pointercancel", { pointerId: 2 }),
			);

			expect(onEnd).not.toHaveBeenCalled();
		});

		it("ends the drag when a second pointer goes down (pinch takes over)", () => {
			const { onEnd, onStart } = start();

			element.dispatchEvent(
				createPointerEvent("pointerdown", { pointerId: 2 }),
			);

			expect(onEnd).toHaveBeenCalledTimes(1);
			expect(onStart).toHaveBeenCalledTimes(1);
			expect(element.style.cursor).toBe("grab");
			expect(element.releasePointerCapture).toHaveBeenCalledWith(1);

			// Neither finger pans any more
			for (const pointerId of [1, 2]) {
				element.dispatchEvent(
					createPointerEvent("pointermove", {
						pointerId,
						clientX: 200,
						clientY: 200,
					}),
				);
			}
			expect(setTransform).not.toHaveBeenCalled();
		});

		it("does not end twice when the first finger lifts after the second ended the drag", () => {
			const { onEnd } = start();

			element.dispatchEvent(
				createPointerEvent("pointerdown", { pointerId: 2 }),
			);
			element.dispatchEvent(createPointerEvent("pointerup", { pointerId: 1 }));
			element.dispatchEvent(createPointerEvent("pointerup", { pointerId: 2 }));

			expect(onEnd).toHaveBeenCalledTimes(1);
		});

		it("starts a new drag after the previous one ended", () => {
			const { onStart } = start();
			element.dispatchEvent(createPointerEvent("pointerup", { pointerId: 1 }));

			element.dispatchEvent(
				createPointerEvent("pointerdown", { pointerId: 3 }),
			);

			expect(onStart).toHaveBeenCalledTimes(2);
		});

		it("releases capture for the active pointer only", () => {
			start();

			element.dispatchEvent(createPointerEvent("pointerup", { pointerId: 2 }));
			expect(element.releasePointerCapture).not.toHaveBeenCalled();

			element.dispatchEvent(createPointerEvent("pointerup", { pointerId: 1 }));
			expect(element.releasePointerCapture).toHaveBeenCalledTimes(1);
			expect(element.releasePointerCapture).toHaveBeenCalledWith(1);
		});
	});

	describe("lost pointer capture", () => {
		it("ends the drag when the active pointer loses capture", () => {
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, { onEnd });
			element.dispatchEvent(
				createPointerEvent("pointerdown", { pointerId: 1 }),
			);

			element.dispatchEvent(
				createPointerEvent("lostpointercapture", { pointerId: 1 }),
			);

			expect(onEnd).toHaveBeenCalledTimes(1);
			expect(element.style.cursor).toBe("grab");
			// The capture is already gone, so there is nothing to release
			expect(element.releasePointerCapture).not.toHaveBeenCalled();
		});

		it("ignores lostpointercapture from another pointer", () => {
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, { onEnd });
			element.dispatchEvent(
				createPointerEvent("pointerdown", { pointerId: 1 }),
			);

			element.dispatchEvent(
				createPointerEvent("lostpointercapture", { pointerId: 2 }),
			);

			expect(onEnd).not.toHaveBeenCalled();
		});

		it("ignores the lostpointercapture that follows a normal pointerup", () => {
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, { onEnd });
			element.dispatchEvent(
				createPointerEvent("pointerdown", { pointerId: 1 }),
			);
			element.dispatchEvent(createPointerEvent("pointerup", { pointerId: 1 }));

			// Browsers fire lostpointercapture after the capture is released
			element.dispatchEvent(
				createPointerEvent("lostpointercapture", { pointerId: 1 }),
			);

			expect(onEnd).toHaveBeenCalledTimes(1);
		});
	});

	describe("pointer capture support", () => {
		it("starts a drag when setPointerCapture is missing", () => {
			Object.assign(element, { setPointerCapture: undefined });
			const onStart = mock();
			createDragHandler(element, getTransform, setTransform, { onStart });

			element.dispatchEvent(
				createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
			);
			element.dispatchEvent(
				createPointerEvent("pointermove", { clientX: 140, clientY: 100 }),
			);

			expect(onStart).toHaveBeenCalledTimes(1);
			expect(setTransform).toHaveBeenCalledWith(40, 0);
		});

		it("starts a drag when setPointerCapture throws", () => {
			element.setPointerCapture = mock(() => {
				throw new DOMException("no such pointer", "NotFoundError");
			});
			const onStart = mock();
			createDragHandler(element, getTransform, setTransform, { onStart });

			element.dispatchEvent(createPointerEvent("pointerdown"));

			expect(onStart).toHaveBeenCalledTimes(1);
			expect(element.style.cursor).toBe("grabbing");
		});

		it("ends the drag when releasePointerCapture is missing", () => {
			Object.assign(element, { releasePointerCapture: undefined });
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, { onEnd });

			element.dispatchEvent(createPointerEvent("pointerdown"));
			element.dispatchEvent(createPointerEvent("pointerup"));

			expect(onEnd).toHaveBeenCalledTimes(1);
			expect(element.style.cursor).toBe("grab");
		});

		it("ends the drag when releasePointerCapture throws", () => {
			element.releasePointerCapture = mock(() => {
				throw new DOMException("not captured", "NotFoundError");
			});
			const onEnd = mock();
			createDragHandler(element, getTransform, setTransform, { onEnd });

			element.dispatchEvent(createPointerEvent("pointerdown"));
			element.dispatchEvent(createPointerEvent("pointerup"));

			expect(onEnd).toHaveBeenCalledTimes(1);
		});
	});

	describe("complete drag workflow", () => {
		it("performs a full drag operation", () => {
			const onStart = mock();
			const onMove = mock();
			const onEnd = mock();

			transformState = { x: 100, y: 50, scale: 2, rotation: 0 };

			createDragHandler(element, getTransform, setTransform, {
				onStart,
				onMove,
				onEnd,
			});

			// Start drag at (200, 200)
			element.dispatchEvent(
				createPointerEvent("pointerdown", { clientX: 200, clientY: 200 }),
			);
			expect(onStart).toHaveBeenCalledWith({
				x: 100,
				y: 50,
				scale: 2,
				rotation: 0,
			});

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
