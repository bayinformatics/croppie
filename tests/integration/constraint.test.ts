import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { SMALL_PNG } from "../fixtures/test-image-data-url.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";

describe("Croppie boundary constraints", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;
	let cleanupImageMock: () => void;

	beforeEach(() => {
		cleanupImageMock = installImageMock();
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
		cleanupImageMock();
	});

	describe("constraint behavior", () => {
		it("initializes with valid crop points after bind", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
				boundary: { width: 300, height: 300 },
			});

			await croppie.bind({ url: SMALL_PNG });

			// After bind, crop points should be valid (non-negative)
			const data = croppie.get();
			expect(data.points.topLeftX).toBeGreaterThanOrEqual(0);
			expect(data.points.topLeftY).toBeGreaterThanOrEqual(0);
		});

		it("maintains valid crop points after zoom changes", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
				boundary: { width: 300, height: 300 },
			});

			await croppie.bind({ url: SMALL_PNG });

			// Change zoom multiple times
			croppie.setZoom(5);
			const dataAfterZoomIn = croppie.get();
			expect(dataAfterZoomIn.points.topLeftX).toBeGreaterThanOrEqual(0);
			expect(dataAfterZoomIn.points.topLeftY).toBeGreaterThanOrEqual(0);

			croppie.setZoom(croppie.zoom * 0.5);
			const dataAfterZoomOut = croppie.get();
			expect(dataAfterZoomOut.points.topLeftX).toBeGreaterThanOrEqual(0);
			expect(dataAfterZoomOut.points.topLeftY).toBeGreaterThanOrEqual(0);
		});

		it("maintains valid crop points after reset", async () => {
			croppie = new Croppie(container, {
				viewport: { width: 200, height: 200, type: "square" },
				boundary: { width: 300, height: 300 },
			});

			await croppie.bind({ url: SMALL_PNG });
			croppie.setZoom(5);
			croppie.reset();

			const data = croppie.get();
			expect(data.points.topLeftX).toBeGreaterThanOrEqual(0);
			expect(data.points.topLeftY).toBeGreaterThanOrEqual(0);
		});
	});
});
