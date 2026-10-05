import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import type {
	CropPoints,
	CroppieOptions,
	PointsArray,
} from "../../src/types.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";
import { SMALL_PNG } from "../fixtures/test-image-data-url.ts";

const PHOTO = "https://example.com/photo.jpg"; // 400x300

// PHOTO and every data URL (SMALL_PNG)
const DIMENSIONS = { width: 400, height: 300 };

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

	beforeEach(() => {
		mounted = [];
		cleanupImageMock = installImageMock(DIMENSIONS);
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

	describe("bind({ points })", () => {
		it("binds v2-style string points (as v2's get() returned them) like numbers", async () => {
			const { croppie } = mount();

			await croppie.bind({
				url: PHOTO,
				points: ["100", "50", "200", "150"] as unknown as PointsArray,
			});

			expect(warn).not.toHaveBeenCalled();
			expect(croppie.zoom).toBeCloseTo(1, 9);
			const { points } = croppie.get();
			expect(points.topLeftX).toBeCloseTo(100, 9);
			expect(points.topLeftY).toBeCloseTo(50, 9);
			expect(points.bottomRightX).toBeCloseTo(200, 9);
			expect(points.bottomRightY).toBeCloseTo(150, 9);
		});

		it("binds object points with numeric string coordinates like numbers", async () => {
			const { croppie } = mount();

			await croppie.bind({
				url: PHOTO,
				points: {
					topLeftX: "100",
					topLeftY: "50",
					bottomRightX: "200",
					bottomRightY: "150",
				} as unknown as CropPoints,
			});

			expect(warn).not.toHaveBeenCalled();
			expect(croppie.zoom).toBeCloseTo(1, 9);
			expect(croppie.get().points.topLeftX).toBeCloseTo(100, 9);
		});

		it("still warns about and ignores points that are not numbers", async () => {
			const { croppie } = mount();

			await croppie.bind({
				url: PHOTO,
				points: ["abc", "50", "200", "150"] as unknown as PointsArray,
			});

			expect(warn).toHaveBeenCalledTimes(1);
			expect(croppie.zoom).toBeCloseTo(COVERAGE_ZOOM, 9);
		});
	});

	describe("preview image", () => {
		it("loads a remote image in the loader's CORS mode, so the browser can reuse it", async () => {
			const { croppie, root } = mount();

			await croppie.bind(PHOTO);

			expect(preview(root).crossOrigin).toBe("anonymous");
			expect(preview(root).src).toBe(PHOTO);
		});

		it("gives a data URL no CORS mode, like the loader", async () => {
			const { croppie, root } = mount();

			await croppie.bind(SMALL_PNG);

			expect(preview(root).crossOrigin).toBeNull();
		});
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
});
