import type { CustomProjectConfig } from "lost-pixel";
import { pathToFileURL } from "node:url";

export const config: CustomProjectConfig = {
	// Test the documentation page
	pageShots: {
		pages: [{ path: "/docs/index.html", name: "docs-demo" }],
		baseUrl: pathToFileURL(process.cwd()).href,
	},

	// Generate baseline images on first run
	generateOnly: process.env.LOST_PIXEL_GENERATE === "true",

	// Where to store baseline images
	imagePathBaseline: ".lostpixel/baseline",
	imagePathCurrent: ".lostpixel/current",
	imagePathDifference: ".lostpixel/difference",

	// Threshold for pixel differences (0-1)
	threshold: 0.1,

	// Browser configuration
	browser: "chromium",

	// Wait for fonts and images to load
	waitBeforeScreenshot: 1000,

	// Mask dynamic content if needed
	mask: [],
};
