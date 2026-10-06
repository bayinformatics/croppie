import { describe, expect, it } from "bun:test";
import type { CropPoints, Rotation } from "../../src/types.ts";
import {
	exifOrientationToRotation,
	naturalRectToRotated,
	normalizeRotation,
	rotatedRectToNatural,
	rotateOffset,
	swapDims,
} from "../../src/utils/rotation.ts";

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

function rect(
	topLeftX: number,
	topLeftY: number,
	bottomRightX: number,
	bottomRightY: number,
): CropPoints {
	return { topLeftX, topLeftY, bottomRightX, bottomRightY };
}

describe("normalizeRotation", () => {
	const cases: Array<[number, Rotation]> = [
		[0, 0],
		[90, 90],
		[180, 180],
		[270, 270],
		[360, 0],
		[450, 90],
		[720, 0],
		[-90, 270],
		[-180, 180],
		[-270, 90],
		[-360, 0],
	];

	for (const [input, expected] of cases) {
		it(`maps ${input} to ${expected}`, () => {
			expect(normalizeRotation(input)).toBe(expected);
		});
	}

	it("never returns negative zero", () => {
		expect(Object.is(normalizeRotation(-360), 0)).toBe(true);
		expect(Object.is(normalizeRotation(-0), 0)).toBe(true);
	});

	for (const bad of [
		45,
		91,
		0.5,
		-45,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	]) {
		it(`throws a RangeError for ${bad}`, () => {
			expect(() => normalizeRotation(bad)).toThrow(RangeError);
			expect(() => normalizeRotation(bad)).toThrow(/multiple of 90/);
		});
	}
});

describe("swapDims", () => {
	it("keeps the dimensions for 0 and 180", () => {
		expect(swapDims(200, 100, 0)).toEqual([200, 100]);
		expect(swapDims(200, 100, 180)).toEqual([200, 100]);
	});

	it("swaps the dimensions for 90 and 270", () => {
		expect(swapDims(200, 100, 90)).toEqual([100, 200]);
		expect(swapDims(200, 100, 270)).toEqual([100, 200]);
	});
});

describe("rotateOffset", () => {
	it("is the identity for 0", () => {
		expect(rotateOffset(3, 5, 0)).toEqual([3, 5]);
	});

	it("rotates clockwise in y-down coordinates: R(90)(x, y) = (-y, x)", () => {
		expect(rotateOffset(3, 5, 90)).toEqual([-5, 3]);
		// Right of the center ends up below it
		expect(rotateOffset(1, 0, 90)).toEqual([0, 1]);
	});

	it("R(180)(x, y) = (-x, -y)", () => {
		expect(rotateOffset(3, 5, 180)).toEqual([-3, -5]);
	});

	it("R(270)(x, y) = (y, -x)", () => {
		expect(rotateOffset(3, 5, 270)).toEqual([5, -3]);
	});

	it("composes: two quarter turns are a half turn, four are the identity", () => {
		const [x1, y1] = rotateOffset(3, 5, 90);
		expect(rotateOffset(x1, y1, 90)).toEqual(rotateOffset(3, 5, 180));

		let point: [number, number] = [3, 5];
		for (let i = 0; i < 4; i++) {
			point = rotateOffset(point[0], point[1], 90);
		}
		expect(point[0]).toBeCloseTo(3, 12);
		expect(point[1]).toBeCloseTo(5, 12);
	});
});

describe("rect maps", () => {
	// A 200x100 natural image and a rectangle inside it
	const W = 200;
	const H = 100;
	const natural = rect(10, 20, 60, 50);

	describe("naturalRectToRotated", () => {
		it("copies the rectangle for 0", () => {
			expect(naturalRectToRotated(natural, W, H, 0)).toEqual(natural);
		});

		it("maps 90 clockwise: { H - brY, tlX, H - tlY, brX }", () => {
			expect(naturalRectToRotated(natural, W, H, 90)).toEqual(
				rect(50, 10, 80, 60),
			);
		});

		it("maps 180: { W - brX, H - brY, W - tlX, H - tlY }", () => {
			expect(naturalRectToRotated(natural, W, H, 180)).toEqual(
				rect(140, 50, 190, 80),
			);
		});

		it("maps 270: { tlY, W - brX, brY, W - tlX }", () => {
			expect(naturalRectToRotated(natural, W, H, 270)).toEqual(
				rect(20, 140, 50, 190),
			);
		});

		it("matches the worked example: 20x10 image, points {2,3,7,8} at 90 -> {2,2,7,7}", () => {
			expect(naturalRectToRotated(rect(2, 3, 7, 8), 20, 10, 90)).toEqual(
				rect(2, 2, 7, 7),
			);
		});

		it("does not mutate its input", () => {
			const input = rect(10, 20, 60, 50);
			naturalRectToRotated(input, W, H, 90);
			expect(input).toEqual(rect(10, 20, 60, 50));
		});
	});

	describe("rotatedRectToNatural", () => {
		it("copies the rectangle for 0", () => {
			expect(rotatedRectToNatural(natural, W, H, 0)).toEqual(natural);
		});

		it("undoes the 90 mapping", () => {
			expect(rotatedRectToNatural(rect(50, 10, 80, 60), W, H, 90)).toEqual(
				natural,
			);
		});

		it("undoes the 180 mapping (it is its own inverse)", () => {
			expect(rotatedRectToNatural(rect(140, 50, 190, 80), W, H, 180)).toEqual(
				natural,
			);
		});

		it("undoes the 270 mapping", () => {
			expect(rotatedRectToNatural(rect(20, 140, 50, 190), W, H, 270)).toEqual(
				natural,
			);
		});
	});

	describe("round trips", () => {
		const sizes: Array<[number, number]> = [
			[200, 100],
			[100, 200],
			[64, 64],
			[1, 1],
			[4032, 3024],
		];
		const rectsFor = (w: number, h: number): CropPoints[] => [
			rect(0, 0, w, h),
			rect(0, 0, w / 2, h / 4),
			rect(w / 4, h / 3, (3 * w) / 4, (2 * h) / 3),
			rect(w - 1, h - 1, w, h),
		];

		it("inverse(forward(rect)) is the rect, for every rotation, size and rect", () => {
			for (const [w, h] of sizes) {
				for (const r of ROTATIONS) {
					for (const input of rectsFor(w, h)) {
						const there = naturalRectToRotated(input, w, h, r);
						const back = rotatedRectToNatural(there, w, h, r);
						expect(back.topLeftX).toBeCloseTo(input.topLeftX, 9);
						expect(back.topLeftY).toBeCloseTo(input.topLeftY, 9);
						expect(back.bottomRightX).toBeCloseTo(input.bottomRightX, 9);
						expect(back.bottomRightY).toBeCloseTo(input.bottomRightY, 9);
					}
				}
			}
		});

		it("forward(inverse(rect)) is the rect, for rectangles in the displayed frame", () => {
			for (const [w, h] of sizes) {
				for (const r of ROTATIONS) {
					const [dw, dh] = swapDims(w, h, r);
					for (const displayed of rectsFor(dw, dh)) {
						const natural = rotatedRectToNatural(displayed, w, h, r);
						const back = naturalRectToRotated(natural, w, h, r);
						expect(back.topLeftX).toBeCloseTo(displayed.topLeftX, 9);
						expect(back.topLeftY).toBeCloseTo(displayed.topLeftY, 9);
						expect(back.bottomRightX).toBeCloseTo(displayed.bottomRightX, 9);
						expect(back.bottomRightY).toBeCloseTo(displayed.bottomRightY, 9);
					}
				}
			}
		});

		it("maps into the displayed frame: the result fits inside swapDims(W, H, r)", () => {
			for (const [w, h] of sizes) {
				for (const r of ROTATIONS) {
					const [dw, dh] = swapDims(w, h, r);
					const mapped = naturalRectToRotated(rect(0, 0, w, h), w, h, r);
					expect(mapped).toEqual(rect(0, 0, dw, dh));
				}
			}
		});
	});

	describe("against the point maps (independent check)", () => {
		// N -> D, from the C.1 table: a clockwise quarter turn of the image
		function mapPoint(
			px: number,
			py: number,
			w: number,
			h: number,
			r: Rotation,
		): [number, number] {
			switch (r) {
				case 90:
					return [h - py, px];
				case 180:
					return [w - px, h - py];
				case 270:
					return [py, w - px];
				default:
					return [px, py];
			}
		}

		it("equals the bounding box of the mapped corners", () => {
			const w = 200;
			const h = 100;
			const input = rect(10, 20, 60, 50);

			for (const r of ROTATIONS) {
				const corners = [
					mapPoint(input.topLeftX, input.topLeftY, w, h, r),
					mapPoint(input.bottomRightX, input.topLeftY, w, h, r),
					mapPoint(input.topLeftX, input.bottomRightY, w, h, r),
					mapPoint(input.bottomRightX, input.bottomRightY, w, h, r),
				];
				const xs = corners.map(([x]) => x);
				const ys = corners.map(([, y]) => y);

				expect(naturalRectToRotated(input, w, h, r)).toEqual(
					rect(
						Math.min(...xs),
						Math.min(...ys),
						Math.max(...xs),
						Math.max(...ys),
					),
				);
			}
		});
	});
});

describe("exifOrientationToRotation", () => {
	it("maps the pure rotations", () => {
		expect(exifOrientationToRotation(1)).toBe(0);
		expect(exifOrientationToRotation(3)).toBe(180);
		expect(exifOrientationToRotation(6)).toBe(90);
		expect(exifOrientationToRotation(8)).toBe(270);
	});

	it("returns undefined for mirrored orientations", () => {
		for (const orientation of [2, 4, 5, 7]) {
			expect(exifOrientationToRotation(orientation)).toBeUndefined();
		}
	});

	it("returns undefined for values outside 1-8", () => {
		for (const orientation of [0, 9, -1, 1.5, Number.NaN]) {
			expect(exifOrientationToRotation(orientation)).toBeUndefined();
		}
	});
});
