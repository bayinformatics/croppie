import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { createPinchZoomHandler } from "../../src/input/zoom.ts";
import type { ZoomAnchor } from "../../src/utils/transform.ts";
import {
	createTouchEvent,
	installImageMock,
	mockElementRect,
} from "../fixtures/mock-helpers.ts";

type Finger = { clientX: number; clientY: number; target?: EventTarget };

describe("pinch: only fingers that went down on the element count", () => {
	let element: HTMLDivElement;
	let image: HTMLImageElement;
	let elsewhere: HTMLDivElement;
	let currentZoom: number;
	let requestZoom: ReturnType<typeof mock>;

	function touch(type: string, ...fingers: Finger[]): void {
		element.dispatchEvent(createTouchEvent(type, fingers));
	}

	beforeEach(() => {
		element = document.createElement("div");
		image = document.createElement("img");
		element.appendChild(image);
		elsewhere = document.createElement("div");
		document.body.append(element, elsewhere);
		mockElementRect(element, { left: 0, top: 0, width: 300, height: 300 });

		currentZoom = 1;
		requestZoom = mock((zoom: number, _anchor: ZoomAnchor) => {
			currentZoom = zoom;
		});
		createPinchZoomHandler(element, () => currentZoom, requestZoom);
	});

	afterEach(() => {
		element.remove();
		elsewhere.remove();
	});

	it("a finger resting elsewhere does not turn a one-finger pan into a pinch", () => {
		const thumb = { clientX: 150, clientY: 700, target: elsewhere };

		touch("touchstart", thumb, { clientX: 150, clientY: 150 });
		touch("touchmove", thumb, { clientX: 150, clientY: 90 });

		expect(requestZoom).not.toHaveBeenCalled();
	});

	it("two fingers pinch while another rests elsewhere, measured and anchored on the two", () => {
		const thumb = { clientX: 150, clientY: 700, target: elsewhere };

		// One finger on the image, one on the element itself, 100px apart
		touch(
			"touchstart",
			thumb,
			{ clientX: 150, clientY: 150, target: image },
			{ clientX: 250, clientY: 150 },
		);
		// 200px apart; the right finger slides off the element but is still part of the pinch
		touch(
			"touchmove",
			thumb,
			{ clientX: 120, clientY: 150, target: image },
			{ clientX: 320, clientY: 150 },
		);

		const [zoom, anchor] = requestZoom.mock.calls.at(-1) ?? [];
		expect(zoom).toBeCloseTo(2, 9);
		// Midpoint (220, 150) is 70px right of the element center (150, 150)
		expect(anchor).toEqual({ x: 70, y: 0 });
	});
});

describe("pinch: a zoom change mid-gesture is kept, not overwritten", () => {
	const SMALL = "data:image/png;base64,SMALL";
	const PHOTO = "data:image/png;base64,PHOTO";
	let container: HTMLDivElement;
	let croppie: Croppie;
	let boundary: HTMLElement;
	let cleanupImageMock: () => void;

	/** Two fingers `spread` px apart about the boundary center. */
	function pinch(type: string, spread: number): void {
		boundary.dispatchEvent(
			createTouchEvent(type, [
				{ clientX: 150 - spread / 2, clientY: 100 },
				{ clientX: 150 + spread / 2, clientY: 100 },
			]),
		);
	}

	beforeEach(async () => {
		// The 200x100 viewport is covered at zoom 0.5 by SMALL and at 0.05 by PHOTO
		cleanupImageMock = installImageMock((src) =>
			src === PHOTO
				? { width: 4000, height: 3000 }
				: { width: 400, height: 300 },
		);
		container = document.createElement("div");
		document.body.appendChild(container);
		croppie = new Croppie(container, {
			viewport: { width: 200, height: 100, type: "square" },
			boundary: { width: 300, height: 200 },
			zoom: { max: 1.5 },
		});
		await croppie.bind(SMALL);
		boundary = container.querySelector(".cr-boundary") as HTMLElement;
		mockElementRect(boundary, { left: 0, top: 0, width: 300, height: 200 });
	});

	afterEach(() => {
		croppie.destroy();
		container.remove();
		cleanupImageMock();
	});

	const actions: Record<string, () => unknown> = {
		"bind()": () => croppie.bind(PHOTO),
		"reset()": () => croppie.reset(),
		"setZoom()": () => croppie.setZoom(0.7),
	};

	for (const [name, action] of Object.entries(actions)) {
		it(`${name} while two fingers are down: the pinch carries on from the new zoom`, async () => {
			pinch("touchstart", 100); // zoom 0.5
			pinch("touchmove", 400); // asks for 2, clamped to the 1.5 maximum
			// The clamp is not a change from elsewhere: still measured from the start
			pinch("touchmove", 200);
			expect(croppie.zoom).toBeCloseTo(1, 9);

			await action();
			const zoom = croppie.zoom;
			expect(zoom).not.toBeCloseTo(1, 9);

			pinch("touchmove", 200); // the fingers have not moved
			expect(croppie.zoom).toBeCloseTo(zoom, 9);

			pinch("touchmove", 220); // 10% further apart
			expect(croppie.zoom).toBeCloseTo(zoom * 1.1, 9);
		});
	}
});
