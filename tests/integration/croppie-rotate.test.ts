import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import type { CropPoints, CroppieOptions, Rotation } from "../../src/types.ts";
import {
	getLastMockContext,
	restoreCanvasMocks,
	setupCanvasMocks,
} from "../canvas/mocks.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";
import { SMALL_PNG } from "../fixtures/test-image-data-url.ts";

function expectPoints(actual: CropPoints, expected: CropPoints, digits = 9) {
	expect(actual.topLeftX).toBeCloseTo(expected.topLeftX, digits);
	expect(actual.topLeftY).toBeCloseTo(expected.topLeftY, digits);
	expect(actual.bottomRightX).toBeCloseTo(expected.bottomRightX, digits);
	expect(actual.bottomRightY).toBeCloseTo(expected.bottomRightY, digits);
}

describe("Croppie rotate", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;
	let cleanupImageMock: () => void;

	// A 20x10 image, a 100x100 viewport in a 300x300 boundary, zoom up to 100
	function create(overrides: Partial<CroppieOptions> = {}): Croppie {
		croppie = new Croppie(container, {
			viewport: { width: 100, height: 100, type: "square" },
			boundary: { width: 300, height: 300 },
			zoom: { min: 0.1, max: 100 },
			...overrides,
		});
		return croppie;
	}

	function previewTransform(): string {
		return (container.querySelector(".cr-image") as HTMLImageElement).style
			.transform;
	}

	function recordEvents(): Array<{ name: string; payload: unknown }> {
		const events: Array<{ name: string; payload: unknown }> = [];
		for (const name of ["rotate", "update", "zoom"] as const) {
			croppie.on(name, (payload) => events.push({ name, payload }));
		}
		return events;
	}

	beforeEach(() => {
		cleanupImageMock = installImageMock({ width: 20, height: 10 });
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
		cleanupImageMock();
	});

	describe("rotate()", () => {
		it("rotates clockwise by 90 degrees", async () => {
			create();
			await croppie.bind(SMALL_PNG);

			croppie.rotate(90);

			expect(croppie.get().rotation).toBe(90);
		});

		it("reports rotation 0 before and after bind", async () => {
			create();
			expect(croppie.get().rotation).toBe(0);

			await croppie.bind(SMALL_PNG);

			expect(croppie.get().rotation).toBe(0);
		});

		it("accumulates quarter turns", async () => {
			create();
			await croppie.bind(SMALL_PNG);

			croppie.rotate(90);
			croppie.rotate(90);
			expect(croppie.get().rotation).toBe(180);
			croppie.rotate(90);
			expect(croppie.get().rotation).toBe(270);
			croppie.rotate(90);
			expect(croppie.get().rotation).toBe(0);
		});

		it("accepts negative degrees (counter-clockwise)", async () => {
			create();
			await croppie.bind(SMALL_PNG);

			croppie.rotate(-90);
			expect(croppie.get().rotation).toBe(270);
			croppie.rotate(-180);
			expect(croppie.get().rotation).toBe(90);
		});

		it("accepts any multiple of 90", async () => {
			create();
			await croppie.bind(SMALL_PNG);

			croppie.rotate(450);

			expect(croppie.get().rotation).toBe(90);
		});

		it("does nothing, and emits nothing, for a full turn or 0", async () => {
			create();
			await croppie.bind(SMALL_PNG);
			const events = recordEvents();

			croppie.rotate(360);
			croppie.rotate(0);

			expect(croppie.get().rotation).toBe(0);
			expect(events).toEqual([]);
		});

		it("throws a RangeError for degrees that are not a multiple of 90", async () => {
			create();
			await croppie.bind(SMALL_PNG);

			expect(() => croppie.rotate(45)).toThrow(RangeError);
			expect(() => croppie.rotate(Number.NaN)).toThrow(RangeError);
			expect(croppie.get().rotation).toBe(0);
		});

		it("validates the degrees even before an image is bound", () => {
			create();

			expect(() => croppie.rotate(45)).toThrow(RangeError);
		});

		it("is a no-op before an image is bound", () => {
			create();
			const events = recordEvents();

			croppie.rotate(90);

			expect(croppie.get().rotation).toBe(0);
			expect(events).toEqual([]);
		});

		it("is a no-op after destroy()", async () => {
			create();
			await croppie.bind(SMALL_PNG);
			croppie.destroy();

			expect(() => croppie.rotate(90)).not.toThrow();
		});
	});

	describe("events", () => {
		it("emits rotate with the new and previous rotation", async () => {
			create();
			await croppie.bind(SMALL_PNG);
			const handler = mock();
			croppie.on("rotate", handler);

			croppie.rotate(90);
			croppie.rotate(90);

			expect(handler.mock.calls[0]?.[0]).toEqual({
				rotation: 90,
				previousRotation: 0,
			});
			expect(handler.mock.calls[1]?.[0]).toEqual({
				rotation: 180,
				previousRotation: 90,
			});
		});

		it("emits rotate, then update with the rotation in its data", async () => {
			create();
			await croppie.bind(SMALL_PNG);
			const events = recordEvents();

			croppie.rotate(90);

			expect(events.map((e) => e.name)).toEqual(["rotate", "update"]);
			expect(events[1]?.payload).toHaveProperty("rotation", 90);
			expect(events[1]?.payload).toHaveProperty("points");
		});

		it("includes the rotation in the update emitted by bind()", async () => {
			create();
			const handler = mock();
			croppie.on("update", handler);

			await croppie.bind({ url: SMALL_PNG, rotation: 90 });

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toHaveProperty("rotation", 90);
		});
	});

	describe("preview transform", () => {
		it("adds rotate() to the preview transform and removes it again", async () => {
			create();
			await croppie.bind(SMALL_PNG);
			expect(previewTransform()).not.toContain("rotate");

			croppie.rotate(90);
			expect(previewTransform()).toContain("rotate(90deg)");

			croppie.rotate(270);
			expect(previewTransform()).not.toContain("rotate");
		});

		describe("centring (200x100 image in a 400x400 boundary, zoom 1)", () => {
			let cleanupWide: () => void;

			beforeEach(() => {
				cleanupWide = installImageMock({ width: 200, height: 100 });
			});

			afterEach(() => {
				cleanupWide();
			});

			async function bindCentred(): Promise<void> {
				create({ boundary: { width: 400, height: 400 } });
				await croppie.bind({ url: SMALL_PNG, zoom: 1 });
			}

			it("keeps today's transform at rotation 0", async () => {
				await bindCentred();

				expect(previewTransform()).toBe("translate(100px, 150px) scale(1)");
			});

			it("keeps the rotated image centred for 90 (box x 150-250, y 100-300)", async () => {
				await bindCentred();

				croppie.rotate(90);

				expect(previewTransform()).toBe(
					"translate(250px, 100px) scale(1) rotate(90deg)",
				);
			});

			it("keeps the rotated image centred for 180", async () => {
				await bindCentred();

				croppie.rotate(180);

				expect(previewTransform()).toBe(
					"translate(300px, 250px) scale(1) rotate(180deg)",
				);
			});

			it("keeps the rotated image centred for 270", async () => {
				await bindCentred();

				croppie.rotate(270);

				expect(previewTransform()).toBe(
					"translate(150px, 300px) scale(1) rotate(270deg)",
				);
			});
		});
	});

	describe("zoom limits use the displayed dimensions", () => {
		const wide = { width: 100, height: 50, type: "square" as const };

		it("raises the zoom to the new coverage zoom after a quarter turn", async () => {
			create({ viewport: wide });
			await croppie.bind({ url: SMALL_PNG, zoom: 5 }); // coverage of 20x10 is 5

			croppie.rotate(90); // displayed 10x20: coverage is 10

			expect(croppie.zoom).toBeCloseTo(10, 9);
			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			expect(slider.min).toBe("10");
		});

		it("reports the points in the natural frame", async () => {
			create({ viewport: wide });
			await croppie.bind({ url: SMALL_PNG, zoom: 5 });
			expectPoints(croppie.get().points, {
				topLeftX: 0,
				topLeftY: 0,
				bottomRightX: 20,
				bottomRightY: 10,
			});

			croppie.rotate(90);

			expectPoints(croppie.get().points, {
				topLeftX: 7.5,
				topLeftY: 0,
				bottomRightX: 12.5,
				bottomRightY: 10,
			});
		});

		it("emits zoom after update when the zoom had to change", async () => {
			create({ viewport: wide });
			await croppie.bind({ url: SMALL_PNG, zoom: 5 });
			const events = recordEvents();

			croppie.rotate(90);

			expect(events.map((e) => e.name)).toEqual(["rotate", "update", "zoom"]);
			expect(events[2]?.payload).toEqual({ zoom: 10, previousZoom: 5 });
		});

		it("keeps the zoom and emits no zoom event when it already satisfies the new limits", async () => {
			create(); // square viewport
			await croppie.bind({ url: SMALL_PNG, zoom: 20 });
			const events = recordEvents();

			croppie.rotate(90);

			expect(croppie.zoom).toBe(20);
			expect(events.map((e) => e.name)).toEqual(["rotate", "update"]);
		});
	});

	describe("the centre of the viewport stays on the same image pixel", () => {
		it("keeps the natural points of a centred crop through every quarter turn", async () => {
			create();
			await croppie.bind({
				url: SMALL_PNG,
				points: {
					topLeftX: 0,
					topLeftY: 0,
					bottomRightX: 10,
					bottomRightY: 10,
				},
			});
			const before = croppie.get();

			for (const rotation of [90, 180, 270] as const) {
				croppie.rotate(90);
				expect(croppie.get().rotation).toBe(rotation);
				expectPoints(croppie.get().points, before.points);
				expect(croppie.zoom).toBeCloseTo(before.zoom, 9);
			}
		});

		it("keeps the points of an off-centre crop and returns to the start after four turns", async () => {
			create();
			await croppie.bind({
				url: SMALL_PNG,
				points: { topLeftX: 2, topLeftY: 3, bottomRightX: 7, bottomRightY: 8 },
			});
			const before = croppie.get();

			croppie.rotate(90);
			expectPoints(croppie.get().points, before.points);
			croppie.rotate(-90);
			expectPoints(croppie.get().points, before.points);
			for (let i = 0; i < 4; i++) {
				croppie.rotate(90);
			}

			expectPoints(croppie.get().points, before.points);
			expect(croppie.get().rotation).toBe(0);
		});
	});

	describe("bind({ points, rotation })", () => {
		const natural: CropPoints = {
			topLeftX: 2,
			topLeftY: 3,
			bottomRightX: 7,
			bottomRightY: 8,
		};

		it("round-trips natural points with a rotation (worked example)", async () => {
			create();

			await croppie.bind({ url: SMALL_PNG, points: natural, rotation: 90 });

			const data = croppie.get();
			expectPoints(data.points, natural);
			expect(data.rotation).toBe(90);
			expect(data.zoom).toBeCloseTo(20, 9);
			// scale 20, offset (10, 110): (B.w + s*H)/2 + x = 260, (B.h - s*W)/2 + y = 60
			expect(previewTransform()).toBe(
				"translate(260px, 60px) scale(20) rotate(90deg)",
			);
		});

		it("round-trips for every rotation, and re-binding get() reproduces the data", async () => {
			for (const rotation of [0, 90, 180, 270] as Rotation[]) {
				create();
				await croppie.bind({ url: SMALL_PNG, points: natural, rotation });
				const first = croppie.get();
				expectPoints(first.points, natural);
				expect(first.rotation).toBe(rotation);

				await croppie.bind({
					url: SMALL_PNG,
					points: first.points,
					zoom: first.zoom,
					rotation: first.rotation,
				});
				const second = croppie.get();

				expectPoints(second.points, first.points);
				expect(second.zoom).toBeCloseTo(first.zoom, 9);
				expect(second.rotation).toBe(first.rotation);
				croppie.destroy();
				container.replaceChildren();
			}
		});

		it("normalises the rotation", async () => {
			create();
			await croppie.bind({ url: SMALL_PNG, rotation: 450 });
			expect(croppie.get().rotation).toBe(90);

			await croppie.bind({ url: SMALL_PNG, rotation: -90 });
			expect(croppie.get().rotation).toBe(270);
		});

		it("rejects an invalid rotation with a RangeError and keeps the current state", async () => {
			create();
			await croppie.bind({ url: SMALL_PNG, rotation: 90 });

			await expect(
				croppie.bind({ url: SMALL_PNG, rotation: 45 }),
			).rejects.toThrow(RangeError);

			expect(croppie.get().rotation).toBe(90);
		});
	});

	describe("reset()", () => {
		it("restores the rotation given to bind()", async () => {
			create();
			await croppie.bind({ url: SMALL_PNG, rotation: 90 });

			croppie.rotate(90);
			expect(croppie.get().rotation).toBe(180);
			croppie.reset();

			expect(croppie.get().rotation).toBe(90);
		});

		it("restores rotation 0 when bind() had none", async () => {
			create();
			await croppie.bind(SMALL_PNG);

			croppie.rotate(90);
			croppie.reset();

			expect(croppie.get().rotation).toBe(0);
			expect(previewTransform()).not.toContain("rotate");
		});

		it("returns the zoom to the coverage zoom of the restored orientation", async () => {
			create({ viewport: { width: 100, height: 50, type: "square" } });
			await croppie.bind(SMALL_PNG); // coverage 5
			croppie.rotate(90); // coverage 10, zoom raised to 10
			expect(croppie.zoom).toBeCloseTo(10, 9);

			croppie.reset();

			expect(croppie.zoom).toBeCloseTo(5, 9);
		});

		it("emits rotate before update when the rotation changed", async () => {
			create();
			await croppie.bind(SMALL_PNG);
			croppie.rotate(90);
			const events = recordEvents();

			croppie.reset();

			expect(events.map((e) => e.name)).toEqual(["rotate", "update"]);
			expect(events[0]?.payload).toEqual({ rotation: 0, previousRotation: 90 });
		});

		it("emits no rotate event when the rotation did not change", async () => {
			create();
			await croppie.bind(SMALL_PNG);
			const events = recordEvents();

			croppie.reset();

			expect(events.map((e) => e.name)).toEqual(["update"]);
		});
	});

	describe("result()", () => {
		// 20x10 image in a 100x50 viewport; zoom 5 covers it, 10 after a quarter turn
		const wide = { width: 100, height: 50, type: "square" as const };

		beforeEach(() => {
			setupCanvasMocks();
		});

		afterEach(() => {
			restoreCanvasMocks();
		});

		async function resultFor(
			rotation: number,
			size: "original" | "viewport",
		): Promise<HTMLCanvasElement> {
			create({ viewport: wide });
			await croppie.bind({ url: SMALL_PNG, zoom: 5 });
			croppie.rotate(rotation);
			return croppie.result({ type: "canvas", size });
		}

		it("keeps the plain draw call at rotation 0", async () => {
			await resultFor(0, "viewport");

			const ctx = getLastMockContext();
			expect(ctx?.drawImage).toHaveBeenCalledWith(
				expect.anything(),
				0,
				0,
				20,
				10,
				0,
				0,
				100,
				50,
			);
			expect(ctx?.rotate).not.toHaveBeenCalled();
		});

		it("returns the viewport size for size 'viewport' after a quarter turn", async () => {
			const canvas = await resultFor(90, "viewport");

			expect(canvas.width).toBe(100);
			expect(canvas.height).toBe(50);
		});

		it("returns the displayed crop size for size 'original' after a quarter turn", async () => {
			// Viewport 100x50 at zoom 10 spans 10x5 displayed px: the canvas is 10x5
			// (not the 5x10 of the natural-frame crop)
			const canvas = await resultFor(90, "original");

			expect(canvas.width).toBe(10);
			expect(canvas.height).toBe(5);
		});

		it("draws the natural crop 5x10 rotated into the 10x5 canvas", async () => {
			await resultFor(90, "original");

			const ctx = getLastMockContext();
			expect(ctx?.translate).toHaveBeenCalledWith(5, 2.5);
			expect(ctx?.rotate).toHaveBeenCalledWith(Math.PI / 2);
			// Natural source {7.5, 0, 12.5, 10}, drawn into a 5x10 box centred on the origin
			expect(ctx?.drawImage).toHaveBeenCalledWith(
				expect.anything(),
				7.5,
				0,
				5,
				10,
				-2.5,
				-5,
				5,
				10,
			);
		});

		it("draws into a box the size of the viewport after a quarter turn", async () => {
			await resultFor(90, "viewport");

			const ctx = getLastMockContext();
			expect(ctx?.translate).toHaveBeenCalledWith(50, 25);
			expect(ctx?.drawImage).toHaveBeenCalledWith(
				expect.anything(),
				7.5,
				0,
				5,
				10,
				-25,
				-50,
				50,
				100,
			);
		});

		it("rotates by 180 without swapping the output size", async () => {
			const canvas = await resultFor(180, "original");

			expect(canvas.width).toBe(20);
			expect(canvas.height).toBe(10);
			const ctx = getLastMockContext();
			expect(ctx?.rotate).toHaveBeenCalledWith(Math.PI);
			expect(ctx?.drawImage).toHaveBeenCalledWith(
				expect.anything(),
				0,
				0,
				20,
				10,
				-10,
				-5,
				20,
				10,
			);
		});

		it("applies a bind-time rotation to the result", async () => {
			create({ viewport: wide });
			await croppie.bind({ url: SMALL_PNG, rotation: 90 });

			const canvas = await croppie.result({ type: "canvas", size: "original" });

			// Coverage of the displayed 10x20 image in a 100x50 viewport is 10: 10x5 px
			expect(canvas.width).toBe(10);
			expect(canvas.height).toBe(5);
			expect(getLastMockContext()?.rotate).toHaveBeenCalledWith(Math.PI / 2);
		});
	});
});
