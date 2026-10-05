import { describe, expect, test } from "bun:test";
import type { PointsArray } from "../../src/types.ts";
import {
	calculateTransformFromPoints,
	intersectFrame,
	normalizePoints,
	pointsToArray,
} from "../../src/utils/points.ts";

describe("normalizePoints", () => {
	test("converts array format to object", () => {
		const result = normalizePoints([10, 20, 110, 120]);
		expect(result).toEqual({
			topLeftX: 10,
			topLeftY: 20,
			bottomRightX: 110,
			bottomRightY: 120,
		});
	});

	test("passes through object format unchanged", () => {
		const input = {
			topLeftX: 10,
			topLeftY: 20,
			bottomRightX: 110,
			bottomRightY: 120,
		};
		const result = normalizePoints(input);
		expect(result).toEqual(input);
	});

	test("returns undefined for undefined input", () => {
		expect(normalizePoints(undefined)).toBeUndefined();
	});

	test("throws error for array with wrong length", () => {
		expect(() =>
			normalizePoints([10, 20, 110] as unknown as PointsArray),
		).toThrow("PointsArray must have exactly 4 elements");
		expect(() => normalizePoints([10, 20] as unknown as PointsArray)).toThrow(
			"PointsArray must have exactly 4 elements",
		);
		expect(() => normalizePoints([] as unknown as PointsArray)).toThrow(
			"PointsArray must have exactly 4 elements",
		);
	});
});

describe("normalizePoints with decimal string coordinates", () => {
	// v2's get() returned toFixed() strings; anything else that is not a plain decimal number
	// becomes NaN, which calculateTransformFromPoints rejects (bind() warns and ignores it)
	const REJECTED = ["50px", "0x10", "0b1", "1,5", "", " ", "Infinity", "1e"];
	const ACCEPTED: Array<[string, number]> = [
		["12.50", 12.5],
		["-3", -3],
		[".5", 0.5],
		["5.", 5],
		["1e2", 100],
		["0.0", 0],
		[" 7 ", 7],
	];

	function topLeftX(value: string): number | undefined {
		return normalizePoints([value, 0, 1, 1] as unknown as PointsArray)
			?.topLeftX;
	}

	for (const value of REJECTED) {
		test(`turns ${JSON.stringify(value)} into NaN`, () => {
			expect(topLeftX(value)).toBeNaN();
		});
	}

	for (const [value, expected] of ACCEPTED) {
		test(`parses ${JSON.stringify(value)} as ${expected}`, () => {
			expect(topLeftX(value)).toBe(expected);
		});
	}

	test("rejects a long run of digits followed by junk in linear time", () => {
		// A regex where the digits can be split between two quantifiers backtracks
		// quadratically on this input (CodeQL js/polynomial-redos)
		const hostile = `${"9".repeat(30_000)}x`;

		const start = performance.now();
		const value = topLeftX(hostile);
		const elapsed = performance.now() - start;

		expect(value).toBeNaN();
		expect(elapsed).toBeLessThan(200);
	});
});

describe("pointsToArray", () => {
	test("converts object to array format", () => {
		const result = pointsToArray({
			topLeftX: 10,
			topLeftY: 20,
			bottomRightX: 110,
			bottomRightY: 120,
		});
		expect(result).toEqual([10, 20, 110, 120]);
	});
});

describe("calculateTransformFromPoints", () => {
	test("reproduces matching-aspect points exactly", () => {
		// 10x10 image, 100x100 viewport, rect {2,3,7,8}:
		// pw = ph = 5 -> scale = 100/5 = 20; center (4.5, 5.5) vs image center (5, 5)
		const t = calculateTransformFromPoints(
			{ topLeftX: 2, topLeftY: 3, bottomRightX: 7, bottomRightY: 8 },
			10,
			10,
			100,
			100,
		);
		expect(t).toBeDefined();
		expect(t?.scale).toBeCloseTo(20, 9);
		expect(t?.x).toBeCloseTo(10, 9);
		expect(t?.y).toBeCloseTo(-10, 9);
	});

	test("preserves the rect center on a non-square image", () => {
		// 20x10 image, 100x100 viewport, rect {0,2,10,8}:
		// pw=10 ph=6 -> cover scale = max(100/10, 100/6) = 100/6; center (5,5) vs image center (10,5)
		const t = calculateTransformFromPoints(
			{ topLeftX: 0, topLeftY: 2, bottomRightX: 10, bottomRightY: 8 },
			20,
			10,
			100,
			100,
		);
		expect(t).toBeDefined();
		expect(t?.scale).toBeCloseTo(100 / 6, 9);
		expect(t?.x).toBeCloseTo((100 / 6) * (10 - 5), 9);
		expect(t?.y).toBeCloseTo(0, 9);
	});

	test("cover-fits mismatched-aspect rects around their center", () => {
		// 10x10 image, 100x50 viewport, rect {2,3,8,8}:
		// pw=6 ph=5 -> cover scale = max(100/6, 50/5) = 100/6; center (5, 5.5) vs image center (5, 5)
		const t = calculateTransformFromPoints(
			{ topLeftX: 2, topLeftY: 3, bottomRightX: 8, bottomRightY: 8 },
			10,
			10,
			100,
			50,
		);
		expect(t).toBeDefined();
		expect(t?.scale).toBeCloseTo(100 / 6, 9);
		expect(t?.x).toBeCloseTo(0, 9);
		expect(t?.y).toBeCloseTo(-50 / 6, 9);
	});

	test("returns undefined for zero-width and zero-height rects", () => {
		expect(
			calculateTransformFromPoints(
				{ topLeftX: 5, topLeftY: 5, bottomRightX: 5, bottomRightY: 8 },
				10,
				10,
				100,
				100,
			),
		).toBeUndefined();
		expect(
			calculateTransformFromPoints(
				{ topLeftX: 5, topLeftY: 5, bottomRightX: 8, bottomRightY: 5 },
				10,
				10,
				100,
				100,
			),
		).toBeUndefined();
	});

	test("returns undefined for non-finite coordinates", () => {
		expect(
			calculateTransformFromPoints(
				{ topLeftX: NaN, topLeftY: 0, bottomRightX: 1, bottomRightY: 1 },
				10,
				10,
				100,
				100,
			),
		).toBeUndefined();
		expect(
			calculateTransformFromPoints(
				{ topLeftX: 0, topLeftY: Infinity, bottomRightX: 1, bottomRightY: 1 },
				10,
				10,
				100,
				100,
			),
		).toBeUndefined();
	});

	test("clamps scale to max bounds and re-centers at the applied scale", () => {
		// 10x10 image, 100x100 viewport, rect {2,3,7,8}: cover scale 20 clamped to 10;
		// translation must be derived from the CLAMPED scale (10 * (5 - 4.5), 10 * (5 - 5.5))
		const t = calculateTransformFromPoints(
			{ topLeftX: 2, topLeftY: 3, bottomRightX: 7, bottomRightY: 8 },
			10,
			10,
			100,
			100,
			{ min: 0.1, max: 10 },
		);
		expect(t).toBeDefined();
		expect(t?.scale).toBeCloseTo(10, 9);
		expect(t?.x).toBeCloseTo(5, 9);
		expect(t?.y).toBeCloseTo(-5, 9);
	});

	test("clamps scale up to min bounds with translation at the applied scale", () => {
		// 10x10 image, 100x50 viewport, rect {1,3,7,8}: cover scale 100/6 raised to 20;
		// translation at scale 20: (20 * (5 - 4), 20 * (5 - 5.5))
		const t = calculateTransformFromPoints(
			{ topLeftX: 1, topLeftY: 3, bottomRightX: 7, bottomRightY: 8 },
			10,
			10,
			100,
			50,
			{ min: 20, max: 100 },
		);
		expect(t).toBeDefined();
		expect(t?.scale).toBeCloseTo(20, 9);
		expect(t?.x).toBeCloseTo(20, 9);
		expect(t?.y).toBeCloseTo(-10, 9);
	});
});

describe("intersectFrame", () => {
	test("leaves a frame inside the image unchanged", () => {
		const frame = {
			topLeftX: 10,
			topLeftY: 20,
			bottomRightX: 60,
			bottomRightY: 70,
		};

		expect(intersectFrame(frame, 400, 300)).toEqual(frame);
	});

	test("clamps a frame that extends past the image on every side", () => {
		expect(
			intersectFrame(
				{
					topLeftX: -300,
					topLeftY: -350,
					bottomRightX: 700,
					bottomRightY: 650,
				},
				400,
				300,
			),
		).toEqual({
			topLeftX: 0,
			topLeftY: 0,
			bottomRightX: 400,
			bottomRightY: 300,
		});
	});

	test("gives a rectangle without area for a frame that misses the image", () => {
		const inside = intersectFrame(
			{ topLeftX: 500, topLeftY: 0, bottomRightX: 600, bottomRightY: 100 },
			400,
			300,
		);

		expect(inside.bottomRightX - inside.topLeftX).toBe(0);
	});
});
