import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";
import { TINY_PNG } from "../fixtures/test-image-data-url.ts";

/**
 * bindFile() hands the browser the file through an object URL. A base64 data URL of a large
 * photo is a string of tens of megabytes that WebKit pays for on every repaint, so dragging
 * a 48 MP photo took ~600 ms per frame in Safari.
 */
describe("Croppie bindFile object URLs", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;
	let cleanupImageMock: () => void;
	let revoke: ReturnType<typeof spyOn>;

	const photo = () => new Blob(["photo"], { type: "image/jpeg" });
	const preview = () =>
		container.querySelector(".cr-image") as HTMLImageElement;

	function create(): Croppie {
		croppie = new Croppie(container, {
			viewport: { width: 100, height: 100, type: "square" },
			boundary: { width: 300, height: 300 },
		});
		return croppie;
	}

	beforeEach(() => {
		// Every image, object URLs included, loads as a 400x300 photo
		cleanupImageMock = installImageMock({ width: 400, height: 300 });
		container = document.createElement("div");
		document.body.appendChild(container);
		revoke = spyOn(URL, "revokeObjectURL");
	});

	afterEach(() => {
		revoke.mockRestore();
		croppie?.destroy();
		container.remove();
		cleanupImageMock();
	});

	it("shows the file through an object URL, not a base64 data URL", async () => {
		create();

		await croppie.bindFile(photo());

		expect(preview().src.startsWith("blob:")).toBe(true);
	});

	it("keeps the object URL alive while its image is bound", async () => {
		create();

		await croppie.bindFile(photo());

		expect(revoke).not.toHaveBeenCalled();
	});

	it("revokes a file's object URL when another image replaces it", async () => {
		create();
		await croppie.bindFile(photo());
		const first = preview().src;

		await croppie.bind(TINY_PNG);

		expect(revoke).toHaveBeenCalledWith(first);
	});

	it("revokes the previous file's object URL when a new file replaces it", async () => {
		create();
		await croppie.bindFile(photo());
		const first = preview().src;

		await croppie.bindFile(photo());

		expect(revoke).toHaveBeenCalledTimes(1);
		expect(revoke).toHaveBeenCalledWith(first);
		expect(preview().src).not.toBe(first);
	});

	it("revokes the object URL on destroy()", async () => {
		create();
		await croppie.bindFile(photo());
		const url = preview().src;

		croppie.destroy();

		expect(revoke).toHaveBeenCalledWith(url);
	});

	it("revokes the object URL of a file superseded before it loads", async () => {
		create();
		const created = spyOn(URL, "createObjectURL");

		// Observed at once: the superseded bind rejects as soon as the later bind starts
		const file = croppie.bindFile(photo()).then(
			() => undefined,
			(caught: unknown) => caught,
		);
		const later = croppie.bind(TINY_PNG);
		await later;
		const error = await file;

		const url = created.mock.results[0]?.value as string;
		created.mockRestore();
		expect((error as DOMException).name).toBe("AbortError");
		expect(revoke).toHaveBeenCalledWith(url);
		expect(preview().src).toBe(TINY_PNG);
	});

	it("revokes the object URL of a file that fails to load and keeps the old image", async () => {
		cleanupImageMock();
		// Files load as 0x0, which bind rejects; the data URL keeps its size
		cleanupImageMock = installImageMock((src) =>
			src.startsWith("blob:") ? undefined : { width: 400, height: 300 },
		);
		create();
		await croppie.bind(TINY_PNG);
		const created = spyOn(URL, "createObjectURL");

		await expect(croppie.bindFile(photo())).rejects.toThrow();

		const url = created.mock.results[0]?.value as string;
		created.mockRestore();
		expect(revoke).toHaveBeenCalledWith(url);
		expect(preview().src).toBe(TINY_PNG);
	});
});
