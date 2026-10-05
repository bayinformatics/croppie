import { describe, expect, it } from "bun:test";
import {
	capCanvasSize,
	DEFAULT_MAX_ZOOM,
	DEFAULT_MIN_ZOOM,
	MAX_CANVAS_AREA,
	MAX_CANVAS_SIDE,
	type MinZoomInput,
	resolveMinZoom,
} from "../../src/utils/limits.ts";

// 4032x3024 photo in a 200x200 viewport
const PHOTO = { coverage: 200 / 3024, contain: 200 / 4032 };

function input(overrides: Partial<MinZoomInput>): MinZoomInput {
	return {
		configuredMin: undefined,
		max: 10,
		coverage: 1,
		contain: 0.5,
		enforceMinimumCoverage: true,
		...overrides,
	};
}

describe("zoom defaults", () => {
	it("keeps the documented defaults", () => {
		expect(DEFAULT_MIN_ZOOM).toBe(0.1);
		expect(DEFAULT_MAX_ZOOM).toBe(10);
	});
});

describe("resolveMinZoom", () => {
	describe("with coverage enforced (default)", () => {
		const cases: Array<{
			name: string;
			given: Partial<MinZoomInput>;
			expected: number;
		}> = [
			{
				name: "an unset min resolves to the coverage zoom",
				given: { coverage: 0.5 },
				expected: 0.5,
			},
			{
				name: "an unset min lets a large photo zoom out below 0.1 (coverage 0.0661)",
				given: { coverage: PHOTO.coverage, contain: PHOTO.contain },
				expected: PHOTO.coverage,
			},
			{
				name: "a configured min above the coverage zoom wins",
				given: { configuredMin: 0.5, coverage: 0.2 },
				expected: 0.5,
			},
			{
				name: "the coverage zoom wins over a lower configured min",
				given: { configuredMin: 0.1, coverage: 0.5 },
				expected: 0.5,
			},
			{
				name: "a configured min of 0.1 is honoured for a large photo",
				given: { configuredMin: 0.1, coverage: PHOTO.coverage },
				expected: 0.1,
			},
			{
				name: "the result is capped at max (a 1x1 image needs 100x but max is 10)",
				given: { coverage: 100, max: 10 },
				expected: 10,
			},
			{
				name: "a configured min above max is capped at max",
				given: { configuredMin: 20, coverage: 1, max: 10 },
				expected: 10,
			},
		];

		for (const { name, given, expected } of cases) {
			it(name, () => {
				expect(resolveMinZoom(input(given))).toBeCloseTo(expected, 9);
			});
		}
	});

	describe("with coverage not enforced", () => {
		const cases: Array<{
			name: string;
			given: Partial<MinZoomInput>;
			expected: number;
		}> = [
			{
				name: "an unset min is the default 0.1 when the image fits above it",
				given: { contain: 0.5 },
				expected: 0.1,
			},
			{
				name: "an unset min follows the contain zoom when it is below 0.1",
				given: { contain: PHOTO.contain },
				expected: PHOTO.contain,
			},
			{
				name: "a configured min is used as given",
				given: { configuredMin: 0.5, coverage: 2, contain: 0.3 },
				expected: 0.5,
			},
			{
				name: "a configured min below the contain zoom is still used",
				given: { configuredMin: 0.01, contain: 0.3 },
				expected: 0.01,
			},
			{
				name: "the result is capped at max",
				given: { configuredMin: 5, max: 2 },
				expected: 2,
			},
		];

		for (const { name, given, expected } of cases) {
			it(name, () => {
				expect(
					resolveMinZoom(input({ ...given, enforceMinimumCoverage: false })),
				).toBeCloseTo(expected, 9);
			});
		}
	});

	it("never exceeds max, so the slider range is never inverted", () => {
		for (const coverage of [0.01, 0.5, 5, 100, 1000]) {
			for (const max of [0.5, 1, 10]) {
				for (const enforceMinimumCoverage of [true, false]) {
					expect(
						resolveMinZoom(input({ coverage, max, enforceMinimumCoverage })),
					).toBeLessThanOrEqual(max);
				}
			}
		}
	});
});

describe("capCanvasSize", () => {
	it("only rounds a size within the caps", () => {
		expect(capCanvasSize(200.4, 99.6)).toEqual({ width: 200, height: 100 });
		expect(capCanvasSize(4096, 4096)).toEqual({ width: 4096, height: 4096 });
	});

	it("scales a size over the area cap down to it, keeping its shape", () => {
		expect(capCanvasSize(6048, 6048)).toEqual({ width: 4096, height: 4096 });
		expect(capCanvasSize(8192, 4096)).toEqual({ width: 5793, height: 2896 });
	});

	it("caps each side at 16,384 px", () => {
		expect(capCanvasSize(20000, 100)).toEqual({ width: 16384, height: 82 });
		expect(capCanvasSize(100, 40000)).toEqual({ width: 41, height: 16384 });
	});

	it("rounds down when rounding to the nearest pixel would exceed the area cap", () => {
		// 9158.93 x 1831.79 rounds to 9159 x 1832 = 16,779,288 px
		const size = capCanvasSize(40320, 8064);

		expect(size).toEqual({ width: 9158, height: 1831 });
		expect(size.width * size.height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
	});

	it("never returns a side below 1 px", () => {
		expect(capCanvasSize(0.2, 0.2)).toEqual({ width: 1, height: 1 });
		expect(capCanvasSize(1_000_000, 1)).toEqual({ width: 16384, height: 1 });
	});

	it("exposes the caps", () => {
		expect(MAX_CANVAS_AREA).toBe(4096 * 4096);
		expect(MAX_CANVAS_SIDE).toBe(16384);
	});
});
