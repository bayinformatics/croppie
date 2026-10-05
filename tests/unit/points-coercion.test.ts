import { describe, expect, test } from "bun:test";
import type { CropPoints, PointsArray } from "../../src/types.ts";
import {
	calculateTransformFromPoints,
	normalizePoints,
} from "../../src/utils/points.ts";

// Croppie v2's get() returned its points as strings (toFixed), which apps stored and replay
const V2_ARRAY = ["50", "50", "150", "150"] as unknown as PointsArray;
const V2_OBJECT = {
	topLeftX: "50",
	topLeftY: "50",
	bottomRightX: "150",
	bottomRightY: "150",
} as unknown as CropPoints;

const EXPECTED: CropPoints = {
	topLeftX: 50,
	topLeftY: 50,
	bottomRightX: 150,
	bottomRightY: 150,
};

describe("normalizePoints with string coordinates (v2 format)", () => {
	test("parses a v2 string array into numbers", () => {
		expect(normalizePoints(V2_ARRAY)).toEqual(EXPECTED);
	});

	test("parses an object with numeric strings into numbers", () => {
		expect(normalizePoints(V2_OBJECT)).toEqual(EXPECTED);
	});

	test("parses decimals and mixed number/string arrays", () => {
		const mixed = [10, "20.5", 110, "120.25"] as unknown as PointsArray;

		expect(normalizePoints(mixed)).toEqual({
			topLeftX: 10,
			topLeftY: 20.5,
			bottomRightX: 110,
			bottomRightY: 120.25,
		});
	});

	test("turns a non-numeric string into NaN, which the transform rejects", () => {
		const junk = ["abc", "50", "150", "150"] as unknown as PointsArray;

		const points = normalizePoints(junk);

		expect(points?.topLeftX).toBeNaN();
		expect(
			calculateTransformFromPoints(points as CropPoints, 200, 200, 100, 100),
		).toBeUndefined();
	});

	test("gives v2 string points the same transform as the numbers", () => {
		const fromStrings = calculateTransformFromPoints(
			normalizePoints(V2_ARRAY) as CropPoints,
			200,
			200,
			100,
			100,
		);
		const fromNumbers = calculateTransformFromPoints(
			EXPECTED,
			200,
			200,
			100,
			100,
		);

		expect(fromStrings).toBeDefined();
		expect(fromStrings).toEqual(fromNumbers);
	});

	test("still rejects a string array of the wrong length", () => {
		expect(() =>
			normalizePoints(["50", "50", "150"] as unknown as PointsArray),
		).toThrow("PointsArray must have exactly 4 elements");
	});
});
