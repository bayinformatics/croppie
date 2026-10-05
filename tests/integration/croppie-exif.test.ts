import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import type { CroppieOptions, Rotation } from "../../src/types.ts";
import { buildJpegHeader } from "../fixtures/exif-jpeg.js";
import { installImageMock } from "../fixtures/mock-helpers.ts";
import { SMALL_PNG } from "../fixtures/test-image-data-url.ts";

function jpegBlob(orientation: number): Blob {
	return new Blob([buildJpegHeader(orientation)], { type: "image/jpeg" });
}

function jpegDataUrl(orientation: number): string {
	let binary = "";
	for (const byte of buildJpegHeader(orientation)) {
		binary += String.fromCharCode(byte);
	}
	return `data:image/jpeg;base64,${btoa(binary)}`;
}

describe("Croppie EXIF orientation", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;
	let cleanupImageMock: () => void;
	let originalWarn: typeof console.warn;
	let warn: ReturnType<typeof mock>;

	function create(options: Partial<CroppieOptions> = {}): Croppie {
		croppie = new Croppie(container, {
			viewport: { width: 100, height: 100, type: "square" },
			boundary: { width: 300, height: 300 },
			zoom: { min: 0.1, max: 100 },
			...options,
		});
		return croppie;
	}

	beforeEach(() => {
		cleanupImageMock = installImageMock({ width: 20, height: 10 });
		container = document.createElement("div");
		document.body.appendChild(container);
		originalWarn = console.warn;
		warn = mock();
		console.warn = warn;
	});

	afterEach(() => {
		console.warn = originalWarn;
		croppie?.destroy();
		container.remove();
		cleanupImageMock();
	});

	describe("enableExif", () => {
		it("exposes the tag of a JPEG bound with bindFile() as get().orientation", async () => {
			create({ enableExif: true });

			await croppie.bindFile(jpegBlob(6));

			expect(croppie.get().orientation).toBe(6);
		});

		it("never rotates because of the tag: the browser already oriented the pixels", async () => {
			create({ enableExif: true });

			await croppie.bindFile(jpegBlob(6));

			expect(croppie.get().rotation).toBe(0);
			expect(
				(container.querySelector(".cr-image") as HTMLImageElement).style
					.transform,
			).not.toContain("rotate");
		});

		it("reads a JPEG data URL passed to bind()", async () => {
			create({ enableExif: true });

			await croppie.bind(jpegDataUrl(8));

			expect(croppie.get().orientation).toBe(8);
			expect(croppie.get().rotation).toBe(0);
		});

		it("reports 1 for an image without an orientation tag", async () => {
			create({ enableExif: true });

			await croppie.bind(SMALL_PNG);

			expect(croppie.get().orientation).toBe(1);
		});

		it("does not read the tag when enableExif is off", async () => {
			create();

			await croppie.bindFile(jpegBlob(6));

			expect(croppie.get().orientation).toBeUndefined();
		});

		it("does not read remote URLs", async () => {
			create({ enableExif: true });

			await croppie.bind("https://example.com/photo.jpg");

			expect(croppie.get().orientation).toBeUndefined();
		});

		it("includes the orientation in the update event data", async () => {
			create({ enableExif: true });
			const handler = mock();
			croppie.on("update", handler);

			await croppie.bindFile(jpegBlob(3));

			expect(handler.mock.calls[0]?.[0]).toHaveProperty("orientation", 3);
		});

		it("keeps the tag informational: rotate() does not change it", async () => {
			create({ enableExif: true });
			await croppie.bindFile(jpegBlob(6));

			croppie.rotate(90);

			expect(croppie.get().orientation).toBe(6);
			expect(croppie.get().rotation).toBe(90);
		});

		it("forgets the previous image's tag on the next bind", async () => {
			create({ enableExif: true });
			await croppie.bindFile(jpegBlob(6));

			await croppie.bind("https://example.com/other.jpg");

			expect(croppie.get().orientation).toBeUndefined();
		});

		it("does not warn when the file has no conflicting explicit orientation", async () => {
			create({ enableExif: true });

			await croppie.bindFile(jpegBlob(6));

			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("bind({ orientation })", () => {
		const cases: Array<[number, Rotation]> = [
			[1, 0],
			[3, 180],
			[6, 90],
			[8, 270],
		];

		for (const [orientation, rotation] of cases) {
			it(`maps orientation ${orientation} to a ${rotation} degree rotation`, async () => {
				create();

				await croppie.bind({ url: SMALL_PNG, orientation });

				expect(croppie.get().rotation).toBe(rotation);
			});
		}

		it("keeps the explicit override out of get().orientation (a separate, informational field)", async () => {
			create({ enableExif: true });

			await croppie.bind({ url: SMALL_PNG, orientation: 6 });

			// The PNG carries no tag, so the informational field says so (1), not 6
			expect(croppie.get().orientation).toBe(1);
			expect(croppie.get().rotation).toBe(90);
		});

		for (const orientation of [2, 4, 5, 7]) {
			it(`warns about and ignores the mirrored orientation ${orientation}`, async () => {
				create();

				await croppie.bind({ url: SMALL_PNG, orientation });

				expect(croppie.get().rotation).toBe(0);
				expect(warn).toHaveBeenCalledTimes(1);
				expect(String(warn.mock.calls[0]?.[0])).toContain("orientation");
			});
		}

		it("warns about and ignores values outside 1-8", async () => {
			create();

			await croppie.bind({ url: SMALL_PNG, orientation: 9 });

			expect(croppie.get().rotation).toBe(0);
			expect(warn).toHaveBeenCalledTimes(1);
		});

		it("lets an explicit rotation win over an orientation", async () => {
			create();

			await croppie.bind({ url: SMALL_PNG, rotation: 180, orientation: 6 });

			expect(croppie.get().rotation).toBe(180);
		});

		it("restores the orientation-derived rotation on reset()", async () => {
			create();
			await croppie.bind({ url: SMALL_PNG, orientation: 6 });

			croppie.rotate(90);
			croppie.reset();

			expect(croppie.get().rotation).toBe(90);
		});

		it("warns about a possible double rotation when the file still carries its own tag", async () => {
			create({ enableExif: true });

			await croppie.bind({ url: jpegDataUrl(6), orientation: 6 });

			// The explicit value wins, but the browser already shows this file upright
			expect(croppie.get().rotation).toBe(90);
			expect(croppie.get().orientation).toBe(6);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(String(warn.mock.calls[0]?.[0])).toContain("EXIF");
		});

		it("does not warn about a double rotation for a file whose tag is 1", async () => {
			create({ enableExif: true });

			await croppie.bind({ url: jpegDataUrl(1), orientation: 6 });

			expect(croppie.get().rotation).toBe(90);
			expect(warn).not.toHaveBeenCalled();
		});
	});
});
