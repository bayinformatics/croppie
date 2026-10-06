/**
 * Test image data URLs for testing
 */

import type { Dimensions } from "./mock-helpers.ts";

// 1x1 transparent PNG
export const TINY_PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// 2x2 red PNG
export const RED_PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVQIW2P4z8DwHwwYGBgYAAf3Af9jT7j3AAAAAElFTkSuQmCC";

// 10x10 blue PNG for testing
export const SMALL_PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5ADwX/CX7cAAAAAElFTkSuQmCC";

// Invalid/broken data URL for error testing
export const INVALID_DATA_URL = "data:image/png;base64,INVALID";

// Simple test image URL (external)
export const EXTERNAL_URL = "https://example.com/test.png";

/** Natural dimensions of the image fixtures above, keyed by data URL. */
export const FIXTURE_DIMENSIONS: Record<string, Dimensions> = {
	[TINY_PNG]: { width: 1, height: 1 },
	[RED_PNG]: { width: 2, height: 2 },
	[SMALL_PNG]: { width: 10, height: 10 },
};

/** Resolver for `installImageMock`: the natural dimensions of a fixture src, if known. */
export function fixtureDimensions(src: string): Dimensions | undefined {
	return FIXTURE_DIMENSIONS[src];
}
