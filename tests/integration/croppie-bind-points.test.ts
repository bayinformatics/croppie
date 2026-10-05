import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import type { CropPoints, PointsArray } from "../../src/types.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";
import {
	fixtureDimensions,
	RED_PNG,
	SMALL_PNG,
} from "../fixtures/test-image-data-url.ts";

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

	describe("string coordinates (v2's get() format)", () => {
		let originalWarn: typeof console.warn;
		let warn: ReturnType<typeof mock>;

		beforeEach(() => {
			originalWarn = console.warn;
			warn = mock();
			console.warn = warn;
		});

		afterEach(() => {
			console.warn = originalWarn;
		});

		it("binds v2-style string points (as v2's get() returned them) like numbers", async () => {
			croppie = createCroppie();

			await croppie.bind({
				url: SMALL_PNG,
				points: ["2", "3", "7", "8"] as unknown as PointsArray,
			});

			expect(warn).not.toHaveBeenCalled();
			expect(croppie.zoom).toBeCloseTo(20, 9);
			const { points } = croppie.get();
			expect(points.topLeftX).toBeCloseTo(2, 9);
			expect(points.topLeftY).toBeCloseTo(3, 9);
			expect(points.bottomRightX).toBeCloseTo(7, 9);
			expect(points.bottomRightY).toBeCloseTo(8, 9);
		});

		it("binds object points with numeric string coordinates like numbers", async () => {
			croppie = createCroppie();

			await croppie.bind({
				url: SMALL_PNG,
				points: {
					topLeftX: "2",
					topLeftY: "3",
					bottomRightX: "7",
					bottomRightY: "8",
				} as unknown as CropPoints,
			});

			expect(warn).not.toHaveBeenCalled();
			expect(croppie.zoom).toBeCloseTo(20, 9);
			expect(croppie.get().points.topLeftX).toBeCloseTo(2, 9);
		});

		it("still warns about and ignores points that are not numbers", async () => {
			croppie = createCroppie();

			await croppie.bind({
				url: SMALL_PNG,
				points: ["abc", "3", "7", "8"] as unknown as PointsArray,
			});

			expect(warn).toHaveBeenCalledTimes(1);
			// The coverage zoom of a 10x10 image in a 100x100 viewport
			expect(croppie.zoom).toBeCloseTo(10, 9);
		});

		for (const value of ["2px", "0x2"]) {
			it(`warns about and ignores a coordinate string that is not a decimal number (${value})`, async () => {
				croppie = createCroppie();

				await croppie.bind({
					url: SMALL_PNG,
					points: [value, "3", "7", "8"] as unknown as PointsArray,
				});

				expect(warn).toHaveBeenCalledTimes(1);
				expect(croppie.zoom).toBeCloseTo(10, 9);
			});
		}
	});

	describe("malformed points", () => {
		let originalWarn: typeof console.warn;
		let warn: ReturnType<typeof mock>;

		beforeEach(() => {
			// Real fixture sizes, so a transform or slider range left over from the first
			// image (10x10) shows against the second (2x2)
			cleanupImageMock();
			cleanupImageMock = installImageMock(fixtureDimensions);
			originalWarn = console.warn;
			warn = mock();
			console.warn = warn;
		});

		afterEach(() => {
			console.warn = originalWarn;
		});

		/** What a bind leaves behind, as plain values */
		function observe() {
			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			return {
				zoom: croppie.zoom,
				points: croppie.get().points,
				sliderMin: slider.min,
				sliderValue: slider.value,
				src: preview.src,
				transform: preview.style.transform,
			};
		}

		const MALFORMED: Array<[string, unknown]> = [
			["an array of 3 entries", [0, 0, 100]],
			["an empty array", []],
			["a NaN coordinate", [Number.NaN, 0, 1, 1]],
			["a zero-width rect", [1, 0, 1, 1]],
		];

		for (const [label, points] of MALFORMED) {
			it(`warns once and binds the new image with default framing for ${label}`, async () => {
				croppie = createCroppie();
				// A framed first image: zoom 20, off center
				await croppie.bind({ url: SMALL_PNG, points: [2, 3, 7, 8] });

				await croppie.bind({ url: RED_PNG, points: points as PointsArray });
				const ignored = observe();
				// The same image bound without points
				await croppie.bind(RED_PNG);

				expect(warn).toHaveBeenCalledTimes(1);
				expect(ignored).toEqual(observe());
				// A 2x2 image covers the 100x100 viewport at a zoom of 50
				expect(ignored.zoom).toBeCloseTo(50, 9);
				expect(ignored.sliderMin).toBe("50");
			});
		}

		it("emits one update for a bind whose malformed points are ignored, with nothing half-applied", async () => {
			croppie = createCroppie();
			await croppie.bind({ url: SMALL_PNG, points: [2, 3, 7, 8] });
			const onUpdate = mock();
			croppie.on("update", onUpdate);

			await croppie.bind({
				url: RED_PNG,
				points: [0, 0, 10] as unknown as PointsArray,
			});

			expect(warn).toHaveBeenCalledTimes(1);
			expect(onUpdate).toHaveBeenCalledTimes(1);
			expect(onUpdate.mock.calls[0]?.[0]).toEqual(croppie.get());
		});

		it("treats a bind with malformed points as the last bind: it supersedes one still loading", async () => {
			// The 10x10 image loads after 20ms, the 2x2 one at once
			cleanupImageMock();
			cleanupImageMock = installImageMock(fixtureDimensions, {
				delay: (src) => (src === SMALL_PNG ? 20 : 0),
			});
			croppie = createCroppie();

			const slow = croppie.bind({ url: SMALL_PNG, zoom: 30 });
			await croppie.bind({
				url: RED_PNG,
				points: [] as unknown as PointsArray,
			});
			await slow;

			expect(warn).toHaveBeenCalledTimes(1);
			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.src).toBe(RED_PNG);
			expect(croppie.zoom).toBeCloseTo(50, 9);
		});
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
