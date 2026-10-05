import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import type { CropPoints, CroppieOptions } from "../../src/types.ts";
import { jpegDataUrl } from "../fixtures/exif-jpeg.js";
import { installImageMock } from "../fixtures/mock-helpers.ts";

const PHOTO = "https://example.com/photo.jpg"; // 400x300
const SLOW = "https://example.com/slow.jpg"; // 600x600, loads after 20ms

function dimensions(src: string): { width: number; height: number } {
	if (src === SLOW) return { width: 600, height: 600 };
	// PHOTO and every other image (such as the JPEG data URLs below)
	return { width: 400, height: 300 };
}

// A 400x300 image in a 100x100 viewport covers it at a zoom of 1/3
const COVERAGE_ZOOM = 1 / 3;

describe("Croppie bind and zoom inputs", () => {
	let mounted: Array<{ croppie: Croppie; root: HTMLDivElement }>;
	let cleanupImageMock: () => void;
	let originalWarn: typeof console.warn;
	let warn: ReturnType<typeof mock>;

	function mount(options: Partial<CroppieOptions> = {}) {
		const root = document.createElement("div");
		document.body.appendChild(root);
		const croppie = new Croppie(root, {
			viewport: { width: 100, height: 100, type: "square" },
			boundary: { width: 300, height: 300 },
			...options,
		});
		mounted.push({ croppie, root });
		return { croppie, root };
	}

	function preview(root: HTMLElement): HTMLImageElement {
		return root.querySelector(".cr-image") as HTMLImageElement;
	}

	function slider(root: HTMLElement): HTMLInputElement {
		return root.querySelector(".cr-slider") as HTMLInputElement;
	}

	/** Everything a user can observe: the data, the rendered transform and the slider. */
	function observe({ croppie, root }: { croppie: Croppie; root: HTMLElement }) {
		return {
			data: croppie.get(),
			transform: preview(root).style.transform,
			slider: {
				min: slider(root).min,
				max: slider(root).max,
				value: slider(root).value,
			},
		};
	}

	function expectFinitePoints(points: CropPoints): void {
		expect(Object.values(points).every(Number.isFinite)).toBe(true);
	}

	beforeEach(() => {
		mounted = [];
		cleanupImageMock = installImageMock(dimensions, {
			delay: (src) => (src === SLOW ? 20 : 0),
		});
		originalWarn = console.warn;
		warn = mock();
		console.warn = warn;
	});

	afterEach(() => {
		console.warn = originalWarn;
		for (const { croppie, root } of mounted) {
			croppie.destroy();
			root.remove();
		}
		cleanupImageMock();
	});

	describe("zoom options given as undefined", () => {
		it("treats zoom: { max: undefined } as the default max of 10", async () => {
			// A wrapper forwarding an optional prop: zoom: { max: props.maxZoom }
			const { croppie, root } = mount({ zoom: { max: undefined } });
			expect(slider(root).max).toBe("10");

			await croppie.bind(PHOTO);

			expect(croppie.zoom).toBeCloseTo(COVERAGE_ZOOM, 9);
			expectFinitePoints(croppie.get().points);
			croppie.setZoom(50);
			expect(croppie.zoom).toBe(10);
			expect(preview(root).style.transform).not.toContain("NaN");
		});

		it("behaves exactly like unset options when every field is undefined", async () => {
			const unset = mount();
			const undefinedFields = mount({
				zoom: {
					min: undefined,
					max: undefined,
					enforceMinimumCoverage: undefined,
				},
			});
			expect(observe(undefinedFields)).toEqual(observe(unset));

			for (const { croppie } of [unset, undefinedFields]) {
				await croppie.bind(PHOTO);
			}
			expect(observe(undefinedFields)).toEqual(observe(unset));

			for (const { croppie } of [unset, undefinedFields]) {
				croppie.setZoom(50);
			}
			expect(observe(undefinedFields)).toEqual(observe(unset));

			for (const { croppie } of [unset, undefinedFields]) {
				croppie.setZoom(0.01);
			}
			expect(observe(undefinedFields)).toEqual(observe(unset));
		});
	});

	describe("bind({ zoom }) that is not a finite number", () => {
		const nonFinite = [
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		];

		for (const zoom of nonFinite) {
			it(`ignores zoom ${zoom} and starts at the coverage zoom`, async () => {
				// Coverage not enforced, so the coverage zoom is neither the min (0.1) nor the max
				const { croppie, root } = mount({
					zoom: { enforceMinimumCoverage: false },
				});

				await croppie.bind({ url: PHOTO, zoom });

				expect(croppie.zoom).toBeCloseTo(COVERAGE_ZOOM, 9);
				const { points } = croppie.get();
				expect(points.topLeftX).toBeCloseTo(50, 9);
				expect(points.topLeftY).toBeCloseTo(0, 9);
				expect(points.bottomRightX).toBeCloseTo(350, 9);
				expect(points.bottomRightY).toBeCloseTo(300, 9);
				expect(preview(root).style.transform).not.toContain("NaN");
			});
		}

		it("stays usable after bind({ zoom: NaN }): setZoom() and the points work", async () => {
			const { croppie, root } = mount();
			await croppie.bind({ url: PHOTO, zoom: Number.NaN });

			croppie.setZoom(2);

			expect(croppie.zoom).toBe(2);
			const { points } = croppie.get();
			expect(points.topLeftX).toBeCloseTo(175, 9);
			expect(points.topLeftY).toBeCloseTo(125, 9);
			expect(points.bottomRightX).toBeCloseTo(225, 9);
			expect(points.bottomRightY).toBeCloseTo(175, 9);
			expect(preview(root).style.transform).not.toContain("NaN");
		});

		it("still converts a numeric string zoom, like setZoom()", async () => {
			const { croppie } = mount();

			await croppie.bind({ url: PHOTO, zoom: "2" as unknown as number });

			expect(croppie.zoom).toBe(2);
		});
	});

	describe("numeric strings for setZoom() and zoom =", () => {
		it("converts a numeric string passed to setZoom(), such as a range input's value", async () => {
			const { croppie, root } = mount();
			await croppie.bind(PHOTO);
			const onZoom = mock();
			croppie.on("zoom", onZoom);

			croppie.setZoom("1.5" as unknown as number);

			expect(croppie.zoom).toBe(1.5);
			expect(onZoom).toHaveBeenCalledTimes(1);
			expect(slider(root).value).toBe("1.5");
		});

		it("converts a numeric string assigned to the zoom property", async () => {
			const { croppie } = mount();
			await croppie.bind(PHOTO);

			croppie.zoom = "2" as unknown as number;

			expect(croppie.zoom).toBe(2);
		});

		it("still ignores a string that is not a number", async () => {
			const { croppie } = mount();
			await croppie.bind(PHOTO);
			const onUpdate = mock();
			croppie.on("update", onUpdate);

			croppie.setZoom("abc" as unknown as number);
			croppie.zoom = "1.5x" as unknown as number;

			expect(croppie.zoom).toBeCloseTo(COVERAGE_ZOOM, 9);
			expectFinitePoints(croppie.get().points);
			expect(onUpdate).not.toHaveBeenCalled();
		});
	});

	describe("the double-rotation warning of bind({ orientation })", () => {
		const doubleRotationWarnings = () =>
			warn.mock.calls.filter((call) =>
				String(call[0]).includes("rotated twice"),
			);

		it("does not fire when an explicit rotation overrides the orientation", async () => {
			const { croppie } = mount({ enableExif: true });

			await croppie.bind({ url: jpegDataUrl(6), orientation: 6, rotation: 0 });

			expect(croppie.get().rotation).toBe(0);
			expect(warn).not.toHaveBeenCalled();
		});

		it("does not fire when get() is restored into bind() for a tagged file", async () => {
			const { croppie } = mount({ enableExif: true });
			const url = jpegDataUrl(6);
			await croppie.bind(url);
			const saved = croppie.get();

			await croppie.bind({ url, ...saved });

			expect(saved.orientation).toBe(6);
			expect(croppie.get().rotation).toBe(0);
			expect(warn).not.toHaveBeenCalled();
		});

		it("does not fire for orientation 1, which turns nothing", async () => {
			const { croppie } = mount({ enableExif: true });

			await croppie.bind({ url: jpegDataUrl(6), orientation: 1 });

			expect(croppie.get().rotation).toBe(0);
			expect(warn).not.toHaveBeenCalled();
		});

		it("does not fire next to the warning that a mirrored orientation is ignored", async () => {
			const { croppie } = mount({ enableExif: true });

			await croppie.bind({ url: jpegDataUrl(6), orientation: 5 });

			expect(croppie.get().rotation).toBe(0);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(String(warn.mock.calls[0]?.[0])).toContain("Ignoring");
		});

		it("still fires when the orientation's turn is applied on top of the file's tag", async () => {
			const { croppie } = mount({ enableExif: true });

			await croppie.bind({ url: jpegDataUrl(6), orientation: 3 });

			expect(croppie.get().rotation).toBe(180);
			expect(doubleRotationWarnings()).toHaveLength(1);
		});
	});

	describe("bindFile() with something that is not a File or Blob", () => {
		const invalid: Array<[string, unknown]> = [
			["undefined (an empty file input)", undefined],
			["null", null],
			["a URL string", "photo.jpg"],
			["a plain object", {}],
		];

		for (const [label, value] of invalid) {
			it(`rejects ${label} with a TypeError without canceling a bind that is still loading`, async () => {
				const { croppie, root } = mount();

				const good = croppie.bind({ url: SLOW, zoom: 2 });
				const error = await croppie
					.bindFile(value as Blob)
					.catch((caught: unknown) => caught);
				await good;

				expect(error).toBeInstanceOf(TypeError);
				expect((error as Error).message).toContain(
					"bindFile() expects a File or Blob",
				);
				expect(preview(root).src).toBe(SLOW);
				expect(croppie.zoom).toBe(2);
			});
		}
	});

	describe("string zoom values: blank and non-numeric strings are ignored", () => {
		// [value, zoom after setZoom()/zoom = from 2, zoom after bind()]. A blank string is not
		// a number, although Number("") and Number(" ") are 0
		const CASES: Array<[string, number, number]> = [
			["", 2, COVERAGE_ZOOM],
			[" ", 2, COVERAGE_ZOOM],
			["abc", 2, COVERAGE_ZOOM],
			["1.5", 1.5, 1.5],
		];

		for (const [value, afterSet, afterBind] of CASES) {
			const label = JSON.stringify(value);
			const bindStart =
				afterBind === COVERAGE_ZOOM ? "the coverage zoom" : afterBind;

			it(`setZoom(${label}) leaves the zoom at ${afterSet}`, async () => {
				const { croppie } = mount();
				await croppie.bind({ url: PHOTO, zoom: 2 });

				croppie.setZoom(value as unknown as number);

				expect(croppie.zoom).toBe(afterSet);
			});

			it(`zoom = ${label} leaves the zoom at ${afterSet}`, async () => {
				const { croppie } = mount();
				await croppie.bind({ url: PHOTO, zoom: 2 });

				croppie.zoom = value as unknown as number;

				expect(croppie.zoom).toBe(afterSet);
			});

			it(`bind({ zoom: ${label} }) starts at ${bindStart}`, async () => {
				// Coverage not enforced, so the coverage zoom is not the minimum zoom that 0 clamps to
				const { croppie } = mount({ zoom: { enforceMinimumCoverage: false } });

				await croppie.bind({ url: PHOTO, zoom: value as unknown as number });

				expect(croppie.zoom).toBeCloseTo(afterBind, 9);
			});
		}
	});

	describe("zoom events when an update listener zooms again", () => {
		/** Caps the zoom at 2 from an update listener and records the zoom events. */
		async function mountCapped() {
			const instance = mount();
			const { croppie } = instance;
			await croppie.bind(PHOTO);
			croppie.setZoom(1.95);
			const zoomEvents: Array<{ zoom: number; previousZoom: number }> = [];
			croppie.on("zoom", (event) => zoomEvents.push(event));
			croppie.on("update", (data) => {
				if (data.zoom > 2) croppie.setZoom(2);
			});
			return { ...instance, zoomEvents };
		}

		it("emits one zoom event, ending at the zoom the listener settled on", async () => {
			const { croppie, zoomEvents } = await mountCapped();

			croppie.setZoom(3);

			expect(croppie.zoom).toBe(2);
			expect(zoomEvents).toHaveLength(1);
			expect(zoomEvents[0]?.zoom).toBe(2);
		});

		it("does the same for the slider", async () => {
			const { croppie, root, zoomEvents } = await mountCapped();

			slider(root).value = "3";
			slider(root).dispatchEvent(new Event("input"));

			expect(croppie.zoom).toBe(2);
			expect(zoomEvents).toHaveLength(1);
			expect(zoomEvents[0]?.zoom).toBe(2);
			expect(slider(root).value).toBe("2");
		});
	});

	describe("touch-action of the boundary", () => {
		function boundary(root: HTMLElement): HTMLElement {
			return root.querySelector(".cr-boundary") as HTMLElement;
		}

		it("leaves pinch-zoom to the browser when enableZoom is false", () => {
			const { root } = mount({ enableZoom: false });

			expect(boundary(root).style.touchAction).toBe("pinch-zoom");
		});

		it("keeps every touch gesture for the cropper by default", () => {
			const { root } = mount();

			expect(boundary(root).style.touchAction).toBe("none");
		});
	});
});
