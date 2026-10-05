import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";

describe("Croppie", () => {
	let container: HTMLDivElement;
	let croppie: Croppie | null = null;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		croppie?.destroy();
		croppie = null;
		container.remove();
	});

	test("creates DOM structure", () => {
		croppie = new Croppie(container, {
			viewport: { width: 200, height: 200, type: "square" },
		});

		expect(container.querySelector(".croppie-container")).not.toBeNull();
		expect(container.querySelector(".cr-boundary")).not.toBeNull();
		expect(container.querySelector(".cr-viewport")).not.toBeNull();
	});

	test("creates zoom slider when showZoomer is true", () => {
		croppie = new Croppie(container, {
			viewport: { width: 200, height: 200, type: "square" },
			showZoomer: true,
		});

		expect(container.querySelector(".cr-slider")).not.toBeNull();
	});

	test("hides zoom slider when showZoomer is false", () => {
		croppie = new Croppie(container, {
			viewport: { width: 200, height: 200, type: "square" },
			showZoomer: false,
		});

		expect(container.querySelector(".cr-slider")).toBeNull();
	});

	test("destroy removes all elements", () => {
		croppie = new Croppie(container, {
			viewport: { width: 200, height: 200, type: "square" },
		});

		croppie.destroy();
		croppie = null;

		expect(container.querySelector(".croppie-container")).toBeNull();
	});

	describe("option validation", () => {
		test("throws a RangeError for a zero-width viewport", () => {
			expect(
				() =>
					new Croppie(container, {
						viewport: { width: 0, height: 100, type: "square" },
					}),
			).toThrow(RangeError);
		});

		test("throws a RangeError when zoom.min is greater than zoom.max", () => {
			expect(
				() =>
					new Croppie(container, {
						viewport: { width: 100, height: 100, type: "square" },
						zoom: { min: 5, max: 2 },
					}),
			).toThrow(RangeError);
		});

		test("does not create any DOM when the options are invalid", () => {
			expect(
				() =>
					new Croppie(container, {
						viewport: { width: 0, height: 0, type: "circle" },
					}),
			).toThrow();

			expect(container.querySelector(".croppie-container")).toBeNull();
		});
	});
});
