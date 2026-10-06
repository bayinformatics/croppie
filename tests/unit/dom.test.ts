import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	anchorFromClientPoint,
	createElement,
	getTransformValues,
	setTransform,
} from "../../src/utils/dom.ts";
import {
	installGetComputedStyleMock,
	mockElementRect,
} from "../fixtures/mock-helpers.ts";

describe("DOM utilities", () => {
	describe("createElement", () => {
		it("creates element with specified tag", () => {
			const div = createElement("div");
			expect(div.tagName).toBe("DIV");
		});

		it("creates different element types", () => {
			const span = createElement("span");
			const canvas = createElement("canvas");
			const img = createElement("img");

			expect(span.tagName).toBe("SPAN");
			expect(canvas.tagName).toBe("CANVAS");
			expect(img.tagName).toBe("IMG");
		});

		it("applies className when provided", () => {
			const div = createElement("div", { className: "test-class" });
			expect(div.className).toBe("test-class");
		});

		it("applies multiple classes via className", () => {
			const div = createElement("div", { className: "class-one class-two" });
			expect(div.classList.contains("class-one")).toBe(true);
			expect(div.classList.contains("class-two")).toBe(true);
		});

		it("sets single attribute", () => {
			const div = createElement("div", {
				attributes: { "data-test": "value" },
			});
			expect(div.getAttribute("data-test")).toBe("value");
		});

		it("sets multiple attributes", () => {
			const input = createElement("input", {
				attributes: {
					type: "text",
					placeholder: "Enter text",
					"aria-label": "Test input",
				},
			});

			expect(input.getAttribute("type")).toBe("text");
			expect(input.getAttribute("placeholder")).toBe("Enter text");
			expect(input.getAttribute("aria-label")).toBe("Test input");
		});

		it("applies inline styles", () => {
			const div = createElement("div", {
				styles: {
					width: "100px",
					height: "50px",
				},
			});

			expect(div.style.width).toBe("100px");
			expect(div.style.height).toBe("50px");
		});

		it("applies multiple styles including transform", () => {
			const div = createElement("div", {
				styles: {
					position: "absolute",
					top: "0px",
					left: "0px",
					transform: "scale(2)",
				},
			});

			expect(div.style.position).toBe("absolute");
			expect(div.style.top).toBe("0px");
			expect(div.style.left).toBe("0px");
			expect(div.style.transform).toBe("scale(2)");
		});

		it("combines className, attributes, and styles", () => {
			const div = createElement("div", {
				className: "my-element",
				attributes: { id: "test-id", role: "button" },
				styles: { cursor: "pointer", opacity: "0.5" },
			});

			expect(div.className).toBe("my-element");
			expect(div.id).toBe("test-id");
			expect(div.getAttribute("role")).toBe("button");
			expect(div.style.cursor).toBe("pointer");
			expect(div.style.opacity).toBe("0.5");
		});

		it("works with no options", () => {
			const div = createElement("div");
			expect(div).toBeInstanceOf(HTMLDivElement);
			expect(div.className).toBe("");
		});

		it("works with empty options object", () => {
			const div = createElement("div", {});
			expect(div).toBeInstanceOf(HTMLDivElement);
		});

		it("returns properly typed elements", () => {
			const canvas = createElement("canvas");
			expect(canvas).toBeInstanceOf(HTMLCanvasElement);

			const input = createElement("input");
			expect(input).toBeInstanceOf(HTMLInputElement);

			const img = createElement("img");
			expect(img).toBeInstanceOf(HTMLImageElement);
		});
	});

	describe("getTransformValues", () => {
		let element: HTMLDivElement;
		let cleanupMock: () => void;

		beforeEach(() => {
			cleanupMock = installGetComputedStyleMock();
			element = document.createElement("div");
			document.body.appendChild(element);
		});

		afterEach(() => {
			element.remove();
			cleanupMock();
		});

		it("returns defaults when no transform is set", () => {
			const values = getTransformValues(element);

			expect(values.x).toBe(0);
			expect(values.y).toBe(0);
			expect(values.scale).toBe(1);
		});

		it("returns defaults when transform is none", () => {
			element.style.transform = "none";
			const values = getTransformValues(element);

			expect(values.x).toBe(0);
			expect(values.y).toBe(0);
			expect(values.scale).toBe(1);
		});

		it("extracts translation from translate transform", () => {
			element.style.transform = "translate(50px, 100px)";
			const values = getTransformValues(element);

			expect(values.x).toBe(50);
			expect(values.y).toBe(100);
		});

		it("extracts scale from scale transform", () => {
			element.style.transform = "scale(2)";
			const values = getTransformValues(element);

			expect(values.scale).toBeCloseTo(2, 5);
		});

		it("extracts combined translate and scale", () => {
			element.style.transform = "translate(25px, 75px) scale(1.5)";
			const values = getTransformValues(element);

			expect(values.x).toBeCloseTo(25, 5);
			expect(values.y).toBeCloseTo(75, 5);
			expect(values.scale).toBeCloseTo(1.5, 5);
		});

		it("handles negative translations", () => {
			element.style.transform = "translate(-30px, -60px)";
			const values = getTransformValues(element);

			expect(values.x).toBeCloseTo(-30, 5);
			expect(values.y).toBeCloseTo(-60, 5);
		});

		it("handles fractional values", () => {
			element.style.transform = "translate(10.5px, 20.25px) scale(0.75)";
			const values = getTransformValues(element);

			expect(values.x).toBeCloseTo(10.5, 5);
			expect(values.y).toBeCloseTo(20.25, 5);
			expect(values.scale).toBeCloseTo(0.75, 5);
		});

		it("handles zero scale", () => {
			element.style.transform = "scale(0)";
			const values = getTransformValues(element);

			expect(values.scale).toBe(0);
		});
	});

	describe("setTransform", () => {
		let element: HTMLDivElement;

		beforeEach(() => {
			element = document.createElement("div");
			document.body.appendChild(element);
		});

		afterEach(() => {
			element.remove();
		});

		it("appends rotate() when a rotation is given", () => {
			setTransform(element, 1, 2, 3, 90);

			expect(element.style.transform).toBe(
				"translate(1px, 2px) scale(3) rotate(90deg)",
			);
		});

		it("supports every quarter turn", () => {
			for (const rotation of [90, 180, 270] as const) {
				setTransform(element, 0, 0, 1, rotation);

				expect(element.style.transform).toBe(
					`translate(0px, 0px) scale(1) rotate(${rotation}deg)`,
				);
			}
		});

		it("leaves the string unchanged for rotation 0", () => {
			setTransform(element, 1, 2, 3, 0);

			expect(element.style.transform).toBe("translate(1px, 2px) scale(3)");
		});

		it("leaves the string unchanged when the rotation is omitted", () => {
			setTransform(element, 1, 2, 3);
			const omitted = element.style.transform;
			setTransform(element, 1, 2, 3, 0);

			expect(omitted).toBe("translate(1px, 2px) scale(3)");
			expect(element.style.transform).toBe(omitted);
		});

		it("sets transform with translation and scale", () => {
			setTransform(element, 100, 200, 1.5);

			expect(element.style.transform).toBe(
				"translate(100px, 200px) scale(1.5)",
			);
		});

		it("sets transform with zero values", () => {
			setTransform(element, 0, 0, 1);

			expect(element.style.transform).toBe("translate(0px, 0px) scale(1)");
		});

		it("sets transform with negative values", () => {
			setTransform(element, -50, -25, 0.5);

			expect(element.style.transform).toBe(
				"translate(-50px, -25px) scale(0.5)",
			);
		});

		it("sets transform with fractional values", () => {
			setTransform(element, 10.5, 20.75, 1.25);

			expect(element.style.transform).toBe(
				"translate(10.5px, 20.75px) scale(1.25)",
			);
		});

		it("overwrites existing transform", () => {
			element.style.transform = "rotate(45deg)";
			setTransform(element, 30, 40, 2);

			expect(element.style.transform).toBe("translate(30px, 40px) scale(2)");
		});

		it("works with very large values", () => {
			setTransform(element, 10000, 20000, 10);

			expect(element.style.transform).toBe(
				"translate(10000px, 20000px) scale(10)",
			);
		});

		it("works with very small scale values", () => {
			setTransform(element, 0, 0, 0.001);

			expect(element.style.transform).toBe("translate(0px, 0px) scale(0.001)");
		});
	});

	describe("setTransform and getTransformValues roundtrip", () => {
		let element: HTMLDivElement;
		let cleanupMock: () => void;

		beforeEach(() => {
			cleanupMock = installGetComputedStyleMock();
			element = document.createElement("div");
			document.body.appendChild(element);
		});

		afterEach(() => {
			element.remove();
			cleanupMock();
		});

		it("roundtrips basic values", () => {
			setTransform(element, 100, 200, 1.5);
			const values = getTransformValues(element);

			expect(values.x).toBeCloseTo(100, 5);
			expect(values.y).toBeCloseTo(200, 5);
			expect(values.scale).toBeCloseTo(1.5, 5);
		});

		it("roundtrips zero translation", () => {
			setTransform(element, 0, 0, 2);
			const values = getTransformValues(element);

			expect(values.x).toBeCloseTo(0, 5);
			expect(values.y).toBeCloseTo(0, 5);
			expect(values.scale).toBeCloseTo(2, 5);
		});

		it("roundtrips negative values", () => {
			setTransform(element, -75, -125, 0.8);
			const values = getTransformValues(element);

			expect(values.x).toBeCloseTo(-75, 5);
			expect(values.y).toBeCloseTo(-125, 5);
			expect(values.scale).toBeCloseTo(0.8, 5);
		});

		it("roundtrips multiple transformations", () => {
			const testCases = [
				{ x: 0, y: 0, scale: 1 },
				{ x: 50, y: 100, scale: 2 },
				{ x: -25, y: 75, scale: 0.5 },
				{ x: 1000, y: -500, scale: 3 },
			];

			for (const { x, y, scale } of testCases) {
				setTransform(element, x, y, scale);
				const values = getTransformValues(element);

				expect(values.x).toBeCloseTo(x, 5);
				expect(values.y).toBeCloseTo(y, 5);
				expect(values.scale).toBeCloseTo(scale, 5);
			}
		});
	});

	describe("anchorFromClientPoint", () => {
		let element: HTMLDivElement;

		beforeEach(() => {
			element = document.createElement("div");
			document.body.appendChild(element);
		});

		afterEach(() => {
			element.remove();
		});

		it("returns the center when the element has no layout box", () => {
			expect(anchorFromClientPoint(element, 120, 80)).toEqual({ x: 0, y: 0 });
		});

		it("returns the center when only one dimension is empty", () => {
			mockElementRect(element, { left: 0, top: 0, width: 200, height: 0 });

			expect(anchorFromClientPoint(element, 120, 80)).toEqual({ x: 0, y: 0 });
		});

		it("returns the center when a coordinate is not finite", () => {
			mockElementRect(element, { left: 10, top: 20, width: 200, height: 100 });

			expect(anchorFromClientPoint(element, Number.NaN, 70)).toEqual({
				x: 0,
				y: 0,
			});
			expect(anchorFromClientPoint(element, 110, Number.NaN)).toEqual({
				x: 0,
				y: 0,
			});
			expect(
				anchorFromClientPoint(element, Number.POSITIVE_INFINITY, 70),
			).toEqual({ x: 0, y: 0 });
			// A property a hand-built event does not have reads as undefined
			expect(
				anchorFromClientPoint(element, undefined as unknown as number, 70),
			).toEqual({ x: 0, y: 0 });
		});

		it("returns the offset from the element center", () => {
			mockElementRect(element, { left: 10, top: 20, width: 200, height: 100 });

			// The center is at client (110, 70)
			expect(anchorFromClientPoint(element, 110, 70)).toEqual({ x: 0, y: 0 });
			expect(anchorFromClientPoint(element, 210, 120)).toEqual({
				x: 100,
				y: 50,
			});
			expect(anchorFromClientPoint(element, 10, 20)).toEqual({
				x: -100,
				y: -50,
			});
		});

		it("converts a CSS-scaled element back to layout pixels", () => {
			// Laid out at 300x300 but displayed at half size (rect 150x150)
			mockElementRect(element, {
				left: 0,
				top: 0,
				width: 150,
				height: 150,
				offsetWidth: 300,
				offsetHeight: 300,
			});

			// 25px right of the displayed center (75, 75) is 50px in layout pixels
			expect(anchorFromClientPoint(element, 100, 75)).toEqual({ x: 50, y: 0 });
			expect(anchorFromClientPoint(element, 75, 125)).toEqual({ x: 0, y: 100 });
		});

		it("treats a missing layout size as unscaled", () => {
			mockElementRect(element, {
				left: 0,
				top: 0,
				width: 200,
				height: 200,
				offsetWidth: 0,
				offsetHeight: 0,
			});

			expect(anchorFromClientPoint(element, 150, 100)).toEqual({ x: 50, y: 0 });
		});
	});
});
