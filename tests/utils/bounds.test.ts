import { describe, expect, it } from "bun:test";
import { calculateBounds } from "../../src/utils/bounds.ts";

describe("calculateBounds", () => {
	it("returns symmetric bounds when image is larger than viewport", () => {
		// Image 400x300 at scale 1, viewport 200x150
		const bounds = calculateBounds(400, 300, 1, 200, 150);

		// maxX = (400 - 200) / 2 = 100
		// maxY = (300 - 150) / 2 = 75
		expect(bounds.maxX).toBe(100);
		expect(bounds.minX).toBe(-100);
		expect(bounds.maxY).toBe(75);
		expect(bounds.minY).toBe(-75);
	});

	it("returns zero bounds when scaled image equals viewport", () => {
		// Image 200x150 at scale 1, viewport 200x150
		const bounds = calculateBounds(200, 150, 1, 200, 150);

		expect(bounds.maxX).toBe(0);
		expect(bounds.minX).toBe(0);
		expect(bounds.maxY).toBe(0);
		expect(bounds.minY).toBe(0);
	});

	it("accounts for scale when calculating bounds", () => {
		// Image 400x300 at scale 0.5 = 200x150, viewport 200x150
		const bounds = calculateBounds(400, 300, 0.5, 200, 150);

		expect(bounds.maxX).toBe(0);
		expect(bounds.minX).toBe(0);
		expect(bounds.maxY).toBe(0);
		expect(bounds.minY).toBe(0);
	});

	it("returns zero bounds when scaled image is smaller than viewport", () => {
		// Image 100x100 at scale 1, viewport 200x200
		// This shouldn't happen with enforceMinimumCoverage, but handle gracefully
		const bounds = calculateBounds(100, 100, 1, 200, 200);

		// Image smaller than viewport - center it (bounds = 0)
		expect(bounds.maxX).toBe(0);
		expect(bounds.minX).toBe(0);
		expect(bounds.maxY).toBe(0);
		expect(bounds.minY).toBe(0);
	});

	it("handles non-square viewports correctly", () => {
		// Image 600x400 at scale 1, viewport 200x100
		const bounds = calculateBounds(600, 400, 1, 200, 100);

		// maxX = (600 - 200) / 2 = 200
		// maxY = (400 - 100) / 2 = 150
		expect(bounds.maxX).toBe(200);
		expect(bounds.minX).toBe(-200);
		expect(bounds.maxY).toBe(150);
		expect(bounds.minY).toBe(-150);
	});
});
