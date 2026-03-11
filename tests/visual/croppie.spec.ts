import { test, expect } from "@playwright/test";

const BASE = "/tests/visual/fixtures/test-page.html";

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
