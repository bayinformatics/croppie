import { describe, expect, it } from "bun:test";
import { readJpegOrientation as readFromPublicApi } from "../../src/index.ts";
import {
	readDataUrlOrientation,
	readJpegOrientation,
} from "../../src/utils/exif.ts";
import {
	buildExifApp1,
	buildJfifApp0,
	buildJpegHeader,
	buildXmpApp1,
	injectExifOrientation,
} from "../fixtures/exif-jpeg.js";
import { SMALL_PNG, TINY_PNG } from "../fixtures/test-image-data-url.ts";

function toDataUrl(bytes: Uint8Array, mime = "image/jpeg"): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return `data:${mime};base64,${btoa(binary)}`;
}

function concat(...parts: Uint8Array[]): Uint8Array {
	const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

const SOI = Uint8Array.of(0xff, 0xd8);
const SOS = Uint8Array.of(0xff, 0xda);

describe("readJpegOrientation", () => {
	describe("orientation values", () => {
		for (const orientation of [1, 3, 6, 8]) {
			it(`reads ${orientation} in big-endian (MM) EXIF`, () => {
				expect(readJpegOrientation(buildJpegHeader(orientation))).toBe(
					orientation,
				);
			});

			it(`reads ${orientation} in little-endian (II) EXIF`, () => {
				expect(
					readJpegOrientation(
						buildJpegHeader(orientation, { littleEndian: true }),
					),
				).toBe(orientation);
			});
		}

		for (const orientation of [2, 4, 5, 7]) {
			it(`reports the mirrored value ${orientation} as is`, () => {
				expect(readJpegOrientation(buildJpegHeader(orientation))).toBe(
					orientation,
				);
			});
		}

		it("returns 1 for the out-of-range values 0 and 9", () => {
			expect(readJpegOrientation(buildJpegHeader(0))).toBe(1);
			expect(readJpegOrientation(buildJpegHeader(9))).toBe(1);
			expect(readJpegOrientation(buildJpegHeader(65535))).toBe(1);
		});
	});

	describe("segment layout", () => {
		it("finds the EXIF segment after a JFIF APP0", () => {
			expect(readJpegOrientation(buildJpegHeader(6, { jfifFirst: true }))).toBe(
				6,
			);
		});

		it("skips an XMP APP1 that comes before the EXIF APP1", () => {
			const jpeg = concat(SOI, buildXmpApp1(), buildExifApp1(8), SOS);

			expect(readJpegOrientation(jpeg)).toBe(8);
		});

		it("skips JFIF and XMP together", () => {
			const jpeg = concat(
				SOI,
				buildJfifApp0(),
				buildXmpApp1(),
				buildExifApp1(3, { littleEndian: true }),
				SOS,
			);

			expect(readJpegOrientation(jpeg)).toBe(3);
		});

		it("skips 0xFF fill bytes before a marker", () => {
			const jpeg = concat(
				SOI,
				Uint8Array.of(0xff, 0xff),
				buildExifApp1(6),
				SOS,
			);

			expect(readJpegOrientation(jpeg)).toBe(6);
		});

		it("skips standalone markers (RSTn and TEM) that have no length", () => {
			const jpeg = concat(
				SOI,
				Uint8Array.of(0xff, 0xd3),
				Uint8Array.of(0xff, 0x01),
				buildExifApp1(6),
				SOS,
			);

			expect(readJpegOrientation(jpeg)).toBe(6);
		});

		it("works on a Uint8Array view with a byte offset into a larger buffer", () => {
			const jpeg = buildJpegHeader(6);
			const buffer = new Uint8Array(jpeg.length + 10);
			buffer.set(jpeg, 7);

			expect(readJpegOrientation(buffer.subarray(7, 7 + jpeg.length))).toBe(6);
		});

		it("reads the tag of a JPEG with an EXIF segment injected after its SOI", () => {
			const original = concat(
				SOI,
				buildJfifApp0(),
				SOS,
				Uint8Array.of(1, 2, 3),
			);

			expect(readJpegOrientation(injectExifOrientation(original, 6))).toBe(6);
		});
	});

	describe("input that carries no orientation", () => {
		it("returns 1 for a JPEG without an EXIF segment", () => {
			expect(readJpegOrientation(concat(SOI, buildJfifApp0(), SOS))).toBe(1);
		});

		it("returns 1 for an XMP-only APP1", () => {
			expect(readJpegOrientation(concat(SOI, buildXmpApp1(), SOS))).toBe(1);
		});

		it("returns 1 for a non-JPEG (PNG signature)", () => {
			const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

			expect(readJpegOrientation(png)).toBe(1);
		});

		it("returns 1 for empty and tiny input", () => {
			expect(readJpegOrientation(new Uint8Array(0))).toBe(1);
			expect(readJpegOrientation(Uint8Array.of(0xff))).toBe(1);
			expect(readJpegOrientation(SOI)).toBe(1);
		});

		it("returns 1 when start-of-scan comes before any EXIF segment", () => {
			// A late EXIF segment inside the image data must not be picked up
			const jpeg = concat(SOI, SOS, buildExifApp1(6));

			expect(readJpegOrientation(jpeg)).toBe(1);
		});

		it("returns 1 when the end-of-image marker comes first", () => {
			const jpeg = concat(SOI, Uint8Array.of(0xff, 0xd9), buildExifApp1(6));

			expect(readJpegOrientation(jpeg)).toBe(1);
		});

		it("returns 1 when IFD0 has no Orientation entry", () => {
			const segment = buildExifApp1(6);
			// Turn the tag 0x0112 at offset 20 into 0x0110 (Model)
			segment[21] = 0x10;

			expect(readJpegOrientation(concat(SOI, segment, SOS))).toBe(1);
		});

		it("returns 1 for an unknown TIFF byte order", () => {
			const segment = buildExifApp1(6);
			segment[10] = 0x58;
			segment[11] = 0x58;

			expect(readJpegOrientation(concat(SOI, segment, SOS))).toBe(1);
		});

		it("returns 1 for a wrong TIFF magic number", () => {
			const segment = buildExifApp1(6);
			segment[13] = 0x2b;

			expect(readJpegOrientation(concat(SOI, segment, SOS))).toBe(1);
		});
	});

	describe("malformed and hostile input", () => {
		it("returns 1, without throwing, for a segment length below 2", () => {
			const jpeg = concat(SOI, Uint8Array.of(0xff, 0xe1, 0x00, 0x00), SOS);

			expect(readJpegOrientation(jpeg)).toBe(1);
		});

		it("never throws on a truncated file, and only reads the tag once it is complete", () => {
			const full = buildJpegHeader(6);

			for (let length = 0; length <= full.length; length++) {
				const result = readJpegOrientation(full.subarray(0, length));

				expect([1, 6]).toContain(result);
			}
			// Cut anywhere before the Orientation value (at offset 30 with the SOI)
			for (let length = 0; length < 32; length++) {
				expect(readJpegOrientation(full.subarray(0, length))).toBe(1);
			}
			expect(readJpegOrientation(full)).toBe(6);
		});

		it("does not read past a segment that claims more bytes than the file has", () => {
			const segment = buildExifApp1(6);
			new DataView(segment.buffer).setUint16(2, 0xffff);

			expect(readJpegOrientation(concat(SOI, segment))).toBeGreaterThanOrEqual(
				1,
			);
		});

		it("does not follow an IFD offset that points outside the segment", () => {
			const segment = buildExifApp1(6);
			new DataView(segment.buffer).setUint32(14, 0x7fffffff);

			expect(readJpegOrientation(concat(SOI, segment, SOS))).toBe(1);
		});

		it("does not trust an entry count that runs past the segment", () => {
			const segment = buildExifApp1(6);
			// 0x0112 sits in the first entry, but claim 60000 entries and break that one
			new DataView(segment.buffer).setUint16(18, 60000);
			segment[21] = 0x00;

			expect(readJpegOrientation(concat(SOI, segment, SOS))).toBe(1);
		});

		it("only scans the first 256 KiB", () => {
			// EXIF after 300 KiB of JFIF-like APPn padding segments is never reached
			const padding = new Uint8Array(4 + 65531);
			padding.set([0xff, 0xe2, 0xff, 0xfd]);
			const jpeg = concat(
				SOI,
				padding,
				padding,
				padding,
				padding,
				padding,
				buildExifApp1(6),
				SOS,
			);

			expect(jpeg.length).toBeGreaterThan(300 * 1024);
			expect(readJpegOrientation(jpeg)).toBe(1);
		});

		it("never throws on random bytes", () => {
			// A small deterministic generator, so a failure is reproducible
			let seed = 12345;
			const next = () => {
				seed = (seed * 1664525 + 1013904223) % 4294967296;
				return seed;
			};

			for (let i = 0; i < 300; i++) {
				const bytes = new Uint8Array(next() % 200);
				for (let j = 0; j < bytes.length; j++) {
					bytes[j] = next() & 0xff;
				}
				if (i % 2 === 0 && bytes.length >= 2) {
					bytes[0] = 0xff;
					bytes[1] = 0xd8;
				}

				const result = readJpegOrientation(bytes);

				expect(result).toBeGreaterThanOrEqual(1);
				expect(result).toBeLessThanOrEqual(8);
			}
		});
	});

	it("is part of the public API", () => {
		expect(readFromPublicApi).toBe(readJpegOrientation);
	});
});

describe("readDataUrlOrientation", () => {
	it("reads the orientation of a base64 JPEG data URL", () => {
		expect(readDataUrlOrientation(toDataUrl(buildJpegHeader(6)))).toBe(6);
		expect(
			readDataUrlOrientation(
				toDataUrl(buildJpegHeader(8, { littleEndian: true })),
			),
		).toBe(8);
	});

	it("returns 1 for a PNG data URL (not a JPEG, so nothing to read)", () => {
		expect(readDataUrlOrientation(TINY_PNG)).toBe(1);
		expect(readDataUrlOrientation(SMALL_PNG)).toBe(1);
	});

	it("returns undefined for a URL that is not a data URL", () => {
		expect(readDataUrlOrientation("https://example.com/photo.jpg")).toBe(
			undefined,
		);
		expect(readDataUrlOrientation("blob:https://example.com/abc")).toBe(
			undefined,
		);
		expect(readDataUrlOrientation("/photo.jpg")).toBe(undefined);
	});

	it("returns undefined for a data URL that is not base64", () => {
		expect(readDataUrlOrientation("data:image/jpeg,%FF%D8%FF")).toBe(undefined);
		expect(readDataUrlOrientation("data:text/plain;charset=utf-8,hi")).toBe(
			undefined,
		);
	});

	it("returns undefined for a malformed data URL or invalid base64", () => {
		expect(readDataUrlOrientation("data:image/jpeg;base64")).toBe(undefined);
		expect(readDataUrlOrientation("data:image/jpeg;base64,@@@not-base64")).toBe(
			undefined,
		);
		expect(readDataUrlOrientation("")).toBe(undefined);
	});

	it("only decodes a prefix of a very large data URL", () => {
		// 42 bytes encode to 56 base64 characters without "=" padding, so more base64
		// can follow without breaking the stream
		const header = toDataUrl(concat(buildJpegHeader(6), new Uint8Array(2)));
		const huge = `${header}${"A".repeat(5 * 1024 * 1024)}`;
		const started = performance.now();

		const orientation = readDataUrlOrientation(huge);

		expect(orientation).toBe(6);
		expect(performance.now() - started).toBeLessThan(500);
	});
});
