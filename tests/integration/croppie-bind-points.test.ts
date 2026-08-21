import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { SMALL_PNG } from "../fixtures/test-image-data-url.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";

describe("Croppie bind({ points })", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;
	let cleanupImageMock: () => void;

	beforeEach(() => {
		cleanupImageMock = installImageMock({ width: 10, height: 10 });
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
		cleanupImageMock();
	});

	function createCroppie(): Croppie {
		return new Croppie(container, {
			viewport: { width: 100, height: 100, type: "square" },
			boundary: { width: 300, height: 300 },
			// Headroom above the default max of 10 for the round-trip zoom of 20
			zoom: { min: 0.1, max: 100 },
		});
	}

	it("round-trips object-form points through get()", async () => {
		croppie = createCroppie();

		await croppie.bind({
			url: SMALL_PNG,
			points: { topLeftX: 2, topLeftY: 3, bottomRightX: 7, bottomRightY: 8 },
		});

		const data = croppie.get();
		expect(data.points.topLeftX).toBeCloseTo(2, 9);
		expect(data.points.topLeftY).toBeCloseTo(3, 9);
		expect(data.points.bottomRightX).toBeCloseTo(7, 9);
		expect(data.points.bottomRightY).toBeCloseTo(8, 9);
		expect(croppie.zoom).toBeCloseTo(20, 9);
	});

	it("round-trips array-form points identically", async () => {
		croppie = createCroppie();

		await croppie.bind({ url: SMALL_PNG, points: [2, 3, 7, 8] });

		const data = croppie.get();
		expect(data.points.topLeftX).toBeCloseTo(2, 9);
		expect(data.points.topLeftY).toBeCloseTo(3, 9);
		expect(data.points.bottomRightX).toBeCloseTo(7, 9);
		expect(data.points.bottomRightY).toBeCloseTo(8, 9);
		expect(croppie.zoom).toBeCloseTo(20, 9);
	});

	it("clamps out-of-bounds rects into the image", async () => {
		croppie = createCroppie();

		await croppie.bind({ url: SMALL_PNG, points: [-5, -5, 5, 5] });

		const data = croppie.get();
		expect(data.points.topLeftX).toBeGreaterThanOrEqual(0);
		expect(data.points.topLeftY).toBeGreaterThanOrEqual(0);
		expect(data.points.bottomRightX).toBeLessThanOrEqual(10);
		expect(data.points.bottomRightY).toBeLessThanOrEqual(10);
	});

	it("falls back to centered coverage under default zoom bounds", async () => {
		croppie = new Croppie(container, {
			viewport: { width: 100, height: 100, type: "square" },
			boundary: { width: 300, height: 300 },
		});

		// Cover-fit zoom for {2,3,7,8} is 20, above the default max of 10:
		// the bind must stay centered on the full image, not drift
		await croppie.bind({ url: SMALL_PNG, points: [2, 3, 7, 8] });

		const data = croppie.get();
		expect(data.points.topLeftX).toBeCloseTo(0, 9);
		expect(data.points.topLeftY).toBeCloseTo(0, 9);
		expect(data.points.bottomRightX).toBeCloseTo(10, 9);
		expect(data.points.bottomRightY).toBeCloseTo(10, 9);
		expect(croppie.zoom).toBeCloseTo(10, 9);
	});

	it("contains the requested rect when zoom clamps without collapsing bounds", async () => {
		croppie = new Croppie(container, {
			viewport: { width: 100, height: 50, type: "square" },
			boundary: { width: 300, height: 300 },
		});

		// Cover-fit zoom for {1,3,7,8} at 100x50 viewport is ~16.7 > default max 10;
		// after clamping, the visible region must still contain the requested rect
		await croppie.bind({ url: SMALL_PNG, points: [1, 3, 7, 8] });

		const data = croppie.get();
		expect(data.points.topLeftY).toBeCloseTo(3, 9);
		expect(data.points.bottomRightY).toBeCloseTo(8, 9);
		expect(data.points.topLeftX).toBeGreaterThanOrEqual(0);
		expect(data.points.bottomRightX).toBeLessThanOrEqual(10);
	});

	describe("warning behavior", () => {
		let originalWarn: typeof console.warn;

		beforeEach(() => {
			originalWarn = console.warn;
		});

		afterEach(() => {
			console.warn = originalWarn;
		});

		it("does not warn for valid points", async () => {
			croppie = createCroppie();
			const warn = mock();
			console.warn = warn;

			await croppie.bind({
				url: SMALL_PNG,
				points: { topLeftX: 2, topLeftY: 3, bottomRightX: 7, bottomRightY: 8 },
			});

			expect(warn).not.toHaveBeenCalled();
		});

		it("warns once and ignores a zero-width rect", async () => {
			croppie = createCroppie();
			const warn = mock();
			console.warn = warn;

			await croppie.bind({
				url: SMALL_PNG,
				points: { topLeftX: 5, topLeftY: 5, bottomRightX: 5, bottomRightY: 8 },
			});

			expect(warn).toHaveBeenCalledTimes(1);
			const data = croppie.get();
			// Falls back to the default centered coverage of the full image
			expect(data.points.topLeftX).toBeCloseTo(0, 9);
			expect(data.points.topLeftY).toBeCloseTo(0, 9);
			expect(data.points.bottomRightX).toBeCloseTo(10, 9);
			expect(data.points.bottomRightY).toBeCloseTo(10, 9);
		});
	});
});
