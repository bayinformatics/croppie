import { describe, expect, it } from "bun:test";
import type { TransformState } from "../../src/types.ts";
import { CENTER_ANCHOR, zoomAboutAnchor } from "../../src/utils/transform.ts";

function state(x: number, y: number, scale: number): TransformState {
	return { x, y, scale };
}

describe("zoomAboutAnchor", () => {
	describe("about the center", () => {
		it("keeps a centered image centered", () => {
			const result = zoomAboutAnchor(state(0, 0, 1), 2, CENTER_ANCHOR);

			expect(result.x).toBe(0);
			expect(result.y).toBe(0);
			expect(result.scale).toBe(2);
		});

		it("uses the center as the default anchor", () => {
			expect(zoomAboutAnchor(state(50, -20, 1), 2)).toEqual(
				zoomAboutAnchor(state(50, -20, 1), 2, CENTER_ANCHOR),
			);
		});

		it("scales the offset from the center by the zoom ratio", () => {
			const result = zoomAboutAnchor(state(50, -20, 1), 2, CENTER_ANCHOR);

			expect(result.x).toBeCloseTo(100, 9);
			expect(result.y).toBeCloseTo(-40, 9);
			expect(result.scale).toBe(2);
		});
	});

	describe("about an off-center anchor", () => {
		it("moves the image toward the anchor when zooming in", () => {
			const result = zoomAboutAnchor(state(0, 0, 1), 1.1, { x: 50, y: 0 });

			expect(result.x).toBeCloseTo(-5, 9);
			expect(result.y).toBeCloseTo(0, 9);
		});

		it("keeps the image point under the anchor fixed", () => {
			const states = [state(0, 0, 1), state(50, -20, 2), state(-30, 15, 0.5)];
			const anchors = [
				{ x: 0, y: 0 },
				{ x: 50, y: -40 },
				{ x: -75, y: 20 },
			];
			const scales = [0.25, 1, 1.1, 3, 10];

			for (const before of states) {
				for (const anchor of anchors) {
					for (const scale of scales) {
						const after = zoomAboutAnchor(before, scale, anchor);

						// Image coordinate (from the image center) under the anchor
						expect((anchor.x - after.x) / after.scale).toBeCloseTo(
							(anchor.x - before.x) / before.scale,
							9,
						);
						expect((anchor.y - after.y) / after.scale).toBeCloseTo(
							(anchor.y - before.y) / before.scale,
							9,
						);
					}
				}
			}
		});

		it("is reversible: zooming in then out returns the original offset", () => {
			const anchor = { x: 40, y: -25 };
			const before = state(12, 34, 1.5);

			const zoomedIn = zoomAboutAnchor(before, 4, anchor);
			const back = zoomAboutAnchor(zoomedIn, 1.5, anchor);

			expect(back.x).toBeCloseTo(12, 9);
			expect(back.y).toBeCloseTo(34, 9);
			expect(back.scale).toBe(1.5);
		});
	});

	describe("invalid current scale", () => {
		it("leaves x and y untouched when the scale is not positive", () => {
			for (const scale of [0, -1, Number.NaN]) {
				const result = zoomAboutAnchor(state(7, 9, scale), 2, { x: 50, y: 50 });

				expect(result.x).toBe(7);
				expect(result.y).toBe(9);
				expect(result.scale).toBe(2);
			}
		});
	});

	it("does not mutate its input", () => {
		const before = state(10, 20, 1);

		zoomAboutAnchor(before, 3, { x: 5, y: 5 });

		expect(before).toEqual({ x: 10, y: 20, scale: 1 });
	});
});
