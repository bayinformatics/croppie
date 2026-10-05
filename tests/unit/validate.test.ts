import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { CroppieOptions } from "../../src/types.ts";
import { validateOptions } from "../../src/utils/validate.ts";

function options(overrides: Partial<CroppieOptions> = {}): CroppieOptions {
	return {
		viewport: { width: 200, height: 200, type: "square" },
		...overrides,
	};
}

describe("validateOptions", () => {
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

	describe("valid options", () => {
		it("accepts the minimal options", () => {
			expect(() => validateOptions(options())).not.toThrow();
			expect(warn).not.toHaveBeenCalled();
		});

		it("accepts a full configuration", () => {
			expect(() =>
				validateOptions(
					options({
						boundary: { width: 300, height: 300 },
						zoom: { min: 0.5, max: 5, enforceMinimumCoverage: false },
					}),
				),
			).not.toThrow();
			expect(warn).not.toHaveBeenCalled();
		});

		it("accepts a partial zoom config", () => {
			expect(() =>
				validateOptions(options({ zoom: { max: 5 } })),
			).not.toThrow();
			expect(() =>
				validateOptions(options({ zoom: { min: 2 } })),
			).not.toThrow();
		});

		it("accepts min equal to max", () => {
			expect(() =>
				validateOptions(options({ zoom: { min: 2, max: 2 } })),
			).not.toThrow();
		});
	});

	describe("viewport", () => {
		const invalid = [0, -10, Number.NaN, Number.POSITIVE_INFINITY];

		for (const width of invalid) {
			it(`throws a RangeError for viewport width ${width}`, () => {
				expect(() =>
					validateOptions(
						options({ viewport: { width, height: 100, type: "square" } }),
					),
				).toThrow(RangeError);
				expect(() =>
					validateOptions(
						options({ viewport: { width, height: 100, type: "square" } }),
					),
				).toThrow(/viewport\.width/);
			});
		}

		for (const height of invalid) {
			it(`throws a RangeError for viewport height ${height}`, () => {
				expect(() =>
					validateOptions(
						options({ viewport: { width: 100, height, type: "square" } }),
					),
				).toThrow(/viewport\.height/);
			});
		}

		it("prefixes errors with the package name", () => {
			expect(() =>
				validateOptions(
					options({ viewport: { width: 0, height: 100, type: "square" } }),
				),
			).toThrow(/^\[@bayinformatics\/croppie\]/);
		});
	});

	describe("boundary", () => {
		it("throws a RangeError for a non-positive or non-finite width", () => {
			for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
				expect(() =>
					validateOptions(options({ boundary: { width, height: 300 } })),
				).toThrow(/boundary\.width/);
			}
		});

		it("throws a RangeError for a non-positive or non-finite height", () => {
			for (const height of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
				expect(() =>
					validateOptions(options({ boundary: { width: 300, height } })),
				).toThrow(/boundary\.height/);
			}
		});

		it("warns, without throwing, when the boundary is narrower than the viewport", () => {
			expect(() =>
				validateOptions(options({ boundary: { width: 150, height: 300 } })),
			).not.toThrow();
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0]?.[0]).toContain("boundary");
		});

		it("warns, without throwing, when the boundary is shorter than the viewport", () => {
			expect(() =>
				validateOptions(options({ boundary: { width: 300, height: 150 } })),
			).not.toThrow();
			expect(warn).toHaveBeenCalledTimes(1);
		});

		it("does not warn when the boundary equals the viewport", () => {
			validateOptions(options({ boundary: { width: 200, height: 200 } }));

			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("zoom", () => {
		for (const min of [0, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			it(`throws a RangeError for zoom.min ${min}`, () => {
				expect(() => validateOptions(options({ zoom: { min } }))).toThrow(
					RangeError,
				);
				expect(() => validateOptions(options({ zoom: { min } }))).toThrow(
					/zoom\.min/,
				);
			});
		}

		for (const max of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			it(`throws a RangeError for zoom.max ${max}`, () => {
				expect(() => validateOptions(options({ zoom: { max } }))).toThrow(
					/zoom\.max/,
				);
			});
		}

		it("throws a RangeError when min is greater than max", () => {
			expect(() =>
				validateOptions(options({ zoom: { min: 5, max: 2 } })),
			).toThrow(RangeError);
			expect(() =>
				validateOptions(options({ zoom: { min: 5, max: 2 } })),
			).toThrow(/zoom\.min.*zoom\.max/);
		});

		it("compares a lone min against the default max (10)", () => {
			expect(() => validateOptions(options({ zoom: { min: 20 } }))).toThrow(
				RangeError,
			);
		});

		it("compares a lone max against the default min (0.1)", () => {
			expect(() => validateOptions(options({ zoom: { max: 0.05 } }))).toThrow(
				RangeError,
			);
		});
	});
});
