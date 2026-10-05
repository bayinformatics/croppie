import { expect, test } from "@playwright/test";
import type { Croppie } from "../../src/Croppie.ts";

const BASE = "/tests/visual/fixtures/test-page.html";

/** The test page exposes its cropper as `window.croppie`. */
type TestPageWindow = Window & { croppie: Croppie };

function ready(page: import("@playwright/test").Page) {
	return page.waitForSelector('body[data-ready="true"]', { timeout: 10_000 });
}

test("circle viewport", async ({ page }) => {
	await page.goto(`${BASE}?viewport=circle`);
	await ready(page);
	await expect(page.locator("#croppie-mount")).toHaveScreenshot(
		"circle-viewport.png",
	);
});

test("square viewport", async ({ page }) => {
	await page.goto(`${BASE}?viewport=square`);
	await ready(page);
	await expect(page.locator("#croppie-mount")).toHaveScreenshot(
		"square-viewport.png",
	);
});

test("zoomed in", async ({ page }) => {
	await page.goto(`${BASE}?viewport=square&zoom=1.5`);
	await ready(page);
	await expect(page.locator("#croppie-mount")).toHaveScreenshot(
		"zoomed-in.png",
	);
});

test("without slider", async ({ page }) => {
	await page.goto(`${BASE}?viewport=circle&zoomer=false`);
	await ready(page);
	await expect(page.locator("#croppie-mount")).toHaveScreenshot(
		"no-slider.png",
	);
});

test("rotated 90 degrees", async ({ page }) => {
	await page.goto(`${BASE}?viewport=square&image=corners&rotate=90`);
	await ready(page);
	await expect(page.locator("#croppie-mount")).toHaveScreenshot(
		"rotated-90.png",
	);
});

type Rgba = [number, number, number, number];

/** The pixels of the cropped result at the given points of the output canvas. */
async function resultPixels(
	page: import("@playwright/test").Page,
	points: Array<[number, number]>,
): Promise<Rgba[]> {
	return page.evaluate(async (at) => {
		const croppie = (window as unknown as TestPageWindow).croppie;
		const canvas: HTMLCanvasElement = await croppie.result({ type: "canvas" });
		const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
		return at.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
	}, points) as Promise<Rgba[]>;
}

function expectColour(
	actual: Rgba,
	expected: [number, number, number],
	tolerance: number,
) {
	for (let channel = 0; channel < 3; channel++) {
		expect(
			Math.abs((actual[channel] ?? 0) - (expected[channel] ?? 0)),
		).toBeLessThanOrEqual(tolerance);
	}
}

const RED: [number, number, number] = [255, 0, 0];
const GREEN: [number, number, number] = [0, 255, 0];
const YELLOW: [number, number, number] = [255, 255, 0];
const BLUE: [number, number, number] = [0, 0, 255];

test("result() after rotate(90) is rotated clockwise", async ({ page }) => {
	// 400x400 image at coverage 0.5 in a 200x200 viewport: each 100px block is 50px wide
	await page.goto(`${BASE}?viewport=square&image=corners&rotate=90`);
	await ready(page);

	const [topLeft, topRight, bottomRight, bottomLeft] = await resultPixels(
		page,
		[
			[25, 25],
			[175, 25],
			[175, 175],
			[25, 175],
		],
	);

	// Clockwise: TL red -> TR, TR green -> BR, BR yellow -> BL, BL blue -> TL
	expectColour(topLeft as Rgba, BLUE, 8);
	expectColour(topRight as Rgba, RED, 8);
	expectColour(bottomRight as Rgba, GREEN, 8);
	expectColour(bottomLeft as Rgba, YELLOW, 8);
});

test("EXIF orientation 6 is reported, not applied a second time", async ({
	page,
}) => {
	// A 400x200 JPEG stored sideways with tag 6: the browser displays it as 200x400
	await page.goto(
		`${BASE}?viewport=square&image=quadrants&w=400&h=200&exif=6&enableExif=true`,
	);
	await ready(page);

	const state = await page.evaluate(() => {
		const data = (window as unknown as TestPageWindow).croppie.get();
		const preview = document.querySelector(".cr-image") as HTMLImageElement;
		return {
			orientation: data.orientation,
			rotation: data.rotation,
			naturalWidth: preview.naturalWidth,
			naturalHeight: preview.naturalHeight,
		};
	});
	expect(state.orientation).toBe(6);
	expect(state.rotation).toBe(0);
	// The browser applied the tag: the dimensions are the displayed ones
	expect(state.naturalWidth).toBe(200);
	expect(state.naturalHeight).toBe(400);

	// The result shows the displayed image: stored TL red is rotated to the top right, so the
	// top left is the stored bottom-left blue. A second rotation would put green there.
	const [topLeft, topRight, bottomRight, bottomLeft] = await resultPixels(
		page,
		[
			[50, 50],
			[150, 50],
			[150, 150],
			[50, 150],
		],
	);
	expectColour(topLeft as Rgba, BLUE, 24);
	expectColour(topRight as Rgba, RED, 24);
	expectColour(bottomRight as Rgba, GREEN, 24);
	expectColour(bottomLeft as Rgba, YELLOW, 24);

	// The preview shows the same thing: the top-left block of the displayed image is blue
	// (dimmed by the overlay outside the viewport, so check which channel dominates)
	const box = await page.locator(".cr-image").boundingBox();
	if (!box) throw new Error("preview has no box");
	const screenshot = await page.screenshot();
	const pixel = await page.evaluate(
		async ({ base64, x, y }) => {
			const image = new Image();
			image.src = `data:image/png;base64,${base64}`;
			await image.decode();
			const canvas = document.createElement("canvas");
			canvas.width = image.width;
			canvas.height = image.height;
			const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
			ctx.drawImage(image, 0, 0);
			return Array.from(ctx.getImageData(x, y, 1, 1).data);
		},
		{
			base64: screenshot.toString("base64"),
			x: Math.round(box.x + box.width * 0.25),
			y: Math.round(box.y + box.height * 0.125),
		},
	);
	const [r = 0, g = 0, b = 0] = pixel;
	expect(b).toBeGreaterThan(r + 60);
	expect(b).toBeGreaterThan(g + 60);
});
