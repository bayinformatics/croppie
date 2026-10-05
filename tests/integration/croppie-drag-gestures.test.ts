import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import {
	createPointerEvent,
	createWheelEvent,
	installImageMock,
	type MockRect,
	mockElementRect,
} from "../fixtures/mock-helpers.ts";
import { TINY_PNG } from "../fixtures/test-image-data-url.ts";

describe("Croppie drag gestures", () => {
	// 400x300 image at zoom 1, 100x100 viewport centred in a 300x300 boundary
	let container: HTMLDivElement;
	let croppie: Croppie;
	let boundary: HTMLElement;
	let cleanupImageMock: () => void;

	beforeEach(async () => {
		cleanupImageMock = installImageMock({ width: 400, height: 300 });
		container = document.createElement("div");
		document.body.appendChild(container);
		croppie = new Croppie(container, {
			viewport: { width: 100, height: 100, type: "square" },
			boundary: { width: 300, height: 300 },
			zoom: { min: 0.1, max: 10 },
		});
		await croppie.bind({ url: TINY_PNG, zoom: 1 });
		boundary = container.querySelector(".cr-boundary") as HTMLElement;
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
		cleanupImageMock();
	});

	const pointer = (type: string, clientX: number, clientY: number) =>
		boundary.dispatchEvent(createPointerEvent(type, { clientX, clientY }));

	describe("zoom or rotation during a drag", () => {
		// The boundary is unscaled at client (0, 0), so the viewport spans client x 100..200
		beforeEach(() => {
			mockElementRect(boundary, { left: 0, top: 0, width: 300, height: 300 });
		});

		/** The image x (rotation 0) under a client x. */
		function imageXUnder(clientX: number): number {
			const { points, zoom } = croppie.get();
			return points.topLeftX + (clientX - 100) / zoom;
		}

		it("keeps the grabbed point under the cursor after a wheel zoom at the cursor", () => {
			pointer("pointerdown", 100, 150);
			pointer("pointermove", 120, 150);
			expect(imageXUnder(120)).toBeCloseTo(150, 6);

			boundary.dispatchEvent(
				createWheelEvent(-100, { clientX: 120, clientY: 150 }),
			);
			expect(croppie.zoom).toBeCloseTo(1.1, 9);
			pointer("pointermove", 121, 150);

			expect(imageXUnder(121)).toBeCloseTo(150, 6);
		});

		it("keeps a setZoom() made during a drag", () => {
			pointer("pointerdown", 100, 150);
			pointer("pointermove", 120, 150);
			croppie.setZoom(2);
			const centre = imageXUnder(150);

			pointer("pointermove", 121, 150);

			// One more client pixel at zoom 2 is half an image pixel
			expect(imageXUnder(150)).toBeCloseTo(centre - 0.5, 6);
		});

		it("keeps a slider zoom made during a drag", () => {
			pointer("pointerdown", 100, 150);
			pointer("pointermove", 120, 150);
			const slider = container.querySelector(".cr-slider") as HTMLInputElement;
			slider.value = "2";
			slider.dispatchEvent(new Event("input"));
			const centre = imageXUnder(150);

			pointer("pointermove", 121, 150);

			expect(imageXUnder(150)).toBeCloseTo(centre - 0.5, 6);
		});
	});

	describe("CSS-scaled boundary", () => {
		// Laid out at 300x300 but displayed at half size, so the viewport spans client x 50..100
		const halfSize: MockRect = {
			left: 0,
			top: 0,
			width: 150,
			height: 150,
			offsetWidth: 300,
			offsetHeight: 300,
		};

		/** The image x (rotation 0) under a client x of the half-size boundary. */
		function imageXUnder(clientX: number): number {
			const { points, zoom } = croppie.get();
			return points.topLeftX + ((clientX - 50) * 2) / zoom;
		}

		it("keeps the grabbed point under the cursor, like the wheel anchor does", () => {
			mockElementRect(boundary, halfSize);
			const grabbed = imageXUnder(60);

			pointer("pointerdown", 60, 75);
			pointer("pointermove", 70, 75);
			expect(imageXUnder(70)).toBeCloseTo(grabbed, 6);

			boundary.dispatchEvent(
				createWheelEvent(-100, { clientX: 70, clientY: 75 }),
			);
			expect(imageXUnder(70)).toBeCloseTo(grabbed, 6);
		});
	});
});
