import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import type { CroppieOptions } from "../../src/types.ts";
import { restoreCanvasMocks, setupCanvasMocks } from "../canvas/mocks.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";

const PHOTO = "https://example.com/photo.jpg"; // 400x300

/** A number option given as a string, as read from a data attribute. */
function str(value: string): number {
	return value as unknown as number;
}

describe("Croppie options given as numeric strings (data attributes)", () => {
	let container: HTMLDivElement;
	let croppie: Croppie | null;
	let cleanupImageMock: () => void;

	function create(options: Partial<CroppieOptions> = {}): Croppie {
		croppie = new Croppie(container, {
			viewport: { width: str("200"), height: str("200"), type: "square" },
			...options,
		});
		return croppie;
	}

	beforeEach(() => {
		croppie = null;
		cleanupImageMock = installImageMock({ width: 400, height: 300 });
		container = document.createElement("div");
		document.body.appendChild(container);
		setupCanvasMocks();
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
		restoreCanvasMocks();
		cleanupImageMock();
	});

	it("derives the default boundary from a string-sized viewport as numbers", () => {
		create();

		const boundary = container.querySelector(".cr-boundary") as HTMLElement;
		// 200 + 100, not "200" + 100
		expect(boundary.style.width).toBe("300px");
		expect(boundary.style.height).toBe("300px");
	});

	it("gives numeric points and zoom from get() with a string-sized viewport", async () => {
		await create().bind({ url: PHOTO, zoom: 1 });

		const { points, zoom } = croppie?.get() ?? { points: null, zoom: null };

		expect(zoom).toBe(1);
		expect(points).toEqual({
			topLeftX: 100,
			topLeftY: 50,
			bottomRightX: 300,
			bottomRightY: 250,
		});
	});

	it("renders a viewport-sized result with a string-sized viewport", async () => {
		await create().bind({ url: PHOTO, zoom: 1 });

		const canvas = await croppie?.result({ type: "canvas" });

		expect(canvas?.width).toBe(200);
		expect(canvas?.height).toBe(200);
	});

	it("accepts string boundary sizes and zoom limits, whitespace included", async () => {
		create({
			boundary: { width: str("320"), height: str(" 300 ") },
			zoom: { min: str("0.5"), max: str(" 5 "), enforceMinimumCoverage: false },
		});
		await croppie?.bind({ url: PHOTO, zoom: 1 });

		croppie?.setZoom(50);
		expect(croppie?.zoom).toBe(5);
		croppie?.setZoom(0.01);
		expect(croppie?.zoom).toBe(0.5);

		const boundary = container.querySelector(".cr-boundary") as HTMLElement;
		expect(boundary.style.width).toBe("320px");
		const slider = container.querySelector(".cr-slider") as HTMLInputElement;
		expect(slider.max).toBe("5");
	});

	for (const value of ["", " ", "abc"]) {
		it(`rejects viewport.width ${JSON.stringify(value)} with a RangeError`, () => {
			expect(() =>
				create({
					viewport: { width: str(value), height: 200, type: "square" },
				}),
			).toThrow(RangeError);
		});

		it(`rejects zoom.max ${JSON.stringify(value)} with a RangeError`, () => {
			expect(() => create({ zoom: { max: str(value) } })).toThrow(/zoom\.max/);
		});
	}
});
