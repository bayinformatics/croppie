import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";
import {
	fixtureDimensions,
	SMALL_PNG,
	TINY_PNG,
} from "../fixtures/test-image-data-url.ts";

describe("Croppie lifecycle", () => {
	let container: HTMLDivElement;
	let croppie: Croppie;
	let cleanupImageMock: () => void;

	function create(
		zoom = { min: 0.1, max: 100, enforceMinimumCoverage: false },
	) {
		croppie = new Croppie(container, {
			viewport: { width: 100, height: 100, type: "square" },
			zoom,
		});
		return croppie;
	}

	beforeEach(() => {
		// SMALL_PNG loads slowly, TINY_PNG immediately: lets binds overlap
		cleanupImageMock = installImageMock(fixtureDimensions, {
			delay: (src) => (src === SMALL_PNG ? 20 : 0),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		croppie?.destroy();
		container.remove();
		cleanupImageMock();
	});

	describe("after destroy()", () => {
		it("rejects bind() with a clear error", async () => {
			create().destroy();

			await expect(croppie.bind(SMALL_PNG)).rejects.toThrow(/destroyed/);
			await expect(croppie.bind(SMALL_PNG)).rejects.toThrow(
				"[@bayinformatics/croppie] bind() called on a destroyed instance",
			);
		});

		it("rejects bindFile() naming the method", async () => {
			create().destroy();

			await expect(
				croppie.bindFile(new Blob(["x"], { type: "image/png" })),
			).rejects.toThrow("bindFile() called on a destroyed instance");
		});

		it("rejects result() naming the method", async () => {
			create().destroy();

			await expect(croppie.result({ type: "canvas" })).rejects.toThrow(
				"result() called on a destroyed instance",
			);
		});

		it("makes setZoom(), the zoom setter and reset() harmless no-ops", async () => {
			create();
			await croppie.bind({ url: SMALL_PNG, zoom: 2 });
			croppie.destroy();

			expect(() => croppie.setZoom(3)).not.toThrow();
			expect(() => {
				croppie.zoom = 4;
			}).not.toThrow();
			expect(() => croppie.reset()).not.toThrow();
		});

		it("emits nothing from setZoom() and reset()", async () => {
			create();
			await croppie.bind({ url: SMALL_PNG, zoom: 2 });
			const handler = mock();
			croppie.on("update", handler);
			croppie.on("zoom", handler);
			croppie.destroy();

			croppie.setZoom(3);
			croppie.reset();

			expect(handler).not.toHaveBeenCalled();
		});

		it("can be called twice", () => {
			create();

			croppie.destroy();

			expect(() => croppie.destroy()).not.toThrow();
			expect(container.querySelector(".croppie-container")).toBeNull();
		});

		it("keeps working accessors: get() returns empty points and on()/off() do not throw", async () => {
			create();
			await croppie.bind({ url: SMALL_PNG, zoom: 2 });
			croppie.destroy();

			expect(croppie.get().points).toEqual({
				topLeftX: 0,
				topLeftY: 0,
				bottomRightX: 0,
				bottomRightY: 0,
			});
			const handler = mock();
			expect(() => croppie.on("update", handler)).not.toThrow();
			expect(() => croppie.off("update", handler)).not.toThrow();
		});
	});

	describe("destroy() while a bind is in flight", () => {
		it("resolves without applying the image", async () => {
			create();
			const handler = mock();
			croppie.on("update", handler);

			const pending = croppie.bind(SMALL_PNG);
			croppie.destroy();

			await expect(pending).resolves.toBeUndefined();
			expect(container.querySelector(".croppie-container")).toBeNull();
			expect(croppie.get().points).toEqual({
				topLeftX: 0,
				topLeftY: 0,
				bottomRightX: 0,
				bottomRightY: 0,
			});
			expect(handler).not.toHaveBeenCalled();
		});

		it("does not surface a load error of an abandoned bind", async () => {
			cleanupImageMock();
			cleanupImageMock = installImageMock(fixtureDimensions, { delay: 10 });
			create();

			// Not a data: or http URL, so the mock fires onerror
			const pending = croppie.bind("not-a-valid-source");
			croppie.destroy();

			await expect(pending).resolves.toBeUndefined();
		});

		it("resolves bindFile() silently when destroyed while the file is read", async () => {
			create();

			const pending = croppie.bindFile(new Blob(["x"], { type: "image/png" }));
			croppie.destroy();

			await expect(pending).resolves.toBeUndefined();
		});
	});

	describe("overlapping binds", () => {
		it("lets the last bind win even if it loads first", async () => {
			create();
			const handler = mock();
			croppie.on("update", handler);

			// A is slow (20ms) and started first; B is instant and started second
			const a = croppie.bind({ url: SMALL_PNG, zoom: 2 });
			const b = croppie.bind({ url: TINY_PNG, zoom: 3 });
			await Promise.all([a, b]);

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(croppie.zoom).toBe(3);
			expect(preview.src).toBe(TINY_PNG);
			// Only B applied and emitted
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("resolves the superseded bind silently instead of rejecting", async () => {
			create();

			const a = croppie.bind({ url: SMALL_PNG, zoom: 2 });
			const b = croppie.bind({ url: TINY_PNG, zoom: 3 });

			await expect(a).resolves.toBeUndefined();
			await expect(b).resolves.toBeUndefined();
		});

		it("applies sequential binds one after the other", async () => {
			create();
			const handler = mock();
			croppie.on("update", handler);

			await croppie.bind({ url: SMALL_PNG, zoom: 2 });
			await croppie.bind({ url: TINY_PNG, zoom: 3 });

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(croppie.zoom).toBe(3);
			expect(preview.src).toBe(TINY_PNG);
			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("lets a later bind() supersede a bindFile() that is still reading", async () => {
			create();

			const file = croppie.bindFile(new Blob(["x"], { type: "image/png" }));
			const later = croppie.bind({ url: TINY_PNG, zoom: 3 });
			await Promise.all([file, later]);

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.src).toBe(TINY_PNG);
			expect(croppie.zoom).toBe(3);
		});
	});
});
