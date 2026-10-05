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

	/** The DOMException messages of a bind that will not apply its image. */
	const SUPERSEDED = "bind() was superseded by a later bind() call";
	const DESTROYED = "instance destroyed during bind()";

	/**
	 * Settles `pending` and checks that it rejected with an AbortError carrying `message`.
	 * Call it as soon as the bind starts: a superseded bind rejects right away, and an
	 * unobserved rejection fails the test.
	 */
	async function expectAbort(
		pending: Promise<void>,
		message: string,
	): Promise<void> {
		const error = await pending.then(
			() => "fulfilled",
			(caught: unknown) => caught,
		);
		expect(error).toBeInstanceOf(DOMException);
		expect((error as DOMException).name).toBe("AbortError");
		expect((error as DOMException).message).toBe(message);
	}

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
		it("rejects with an AbortError without applying the image", async () => {
			create();
			const handler = mock();
			croppie.on("update", handler);

			const pending = croppie.bind(SMALL_PNG);
			croppie.destroy();

			await expectAbort(pending, DESTROYED);
			expect(container.querySelector(".croppie-container")).toBeNull();
			expect(croppie.get().points).toEqual({
				topLeftX: 0,
				topLeftY: 0,
				bottomRightX: 0,
				bottomRightY: 0,
			});
			expect(handler).not.toHaveBeenCalled();
		});

		it("rejects with an AbortError, not the load error, when the abandoned load fails", async () => {
			cleanupImageMock();
			cleanupImageMock = installImageMock(fixtureDimensions, { delay: 10 });
			create();

			// Not a data: or http URL, so the mock fires onerror
			const pending = croppie.bind("not-a-valid-source");
			croppie.destroy();

			await expectAbort(pending, DESTROYED);
		});

		it("rejects bindFile() with an AbortError when destroyed while the file is read", async () => {
			create();

			const pending = croppie.bindFile(new Blob(["x"], { type: "image/png" }));
			croppie.destroy();

			await expectAbort(pending, DESTROYED);
		});
	});

	describe("overlapping binds", () => {
		it("lets the last bind win even if it loads first", async () => {
			create();
			const handler = mock();
			croppie.on("update", handler);

			// A is slow (20ms) and started first; B is instant and started second
			const a = croppie.bind({ url: SMALL_PNG, zoom: 2 });
			const aborted = expectAbort(a, SUPERSEDED);
			const b = croppie.bind({ url: TINY_PNG, zoom: 3 });
			await b;
			await aborted;

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(croppie.zoom).toBe(3);
			expect(preview.src).toBe(TINY_PNG);
			// Only B applied and emitted
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("rejects the superseded bind with an AbortError; only the newest fulfills", async () => {
			create();

			const a = croppie.bind({ url: SMALL_PNG, zoom: 2 });
			const aborted = expectAbort(a, SUPERSEDED);
			const b = croppie.bind({ url: TINY_PNG, zoom: 3 });

			await aborted;
			await expect(b).resolves.toBeUndefined();
		});

		it("rejects an earlier bind with an AbortError when the later one fails to load", async () => {
			create();
			const handler = mock();
			croppie.on("update", handler);

			const a = croppie.bind({ url: SMALL_PNG, zoom: 2 });
			const aborted = expectAbort(a, SUPERSEDED);
			// Not a data: or http URL, so the mock fires onerror
			const b = croppie.bind("not-a-valid-source");

			await expect(b).rejects.toThrow();
			await aborted;
			expect(handler).not.toHaveBeenCalled();
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
			const aborted = expectAbort(file, SUPERSEDED);
			const later = croppie.bind({ url: TINY_PNG, zoom: 3 });
			await later;
			await aborted;

			const preview = container.querySelector(".cr-image") as HTMLImageElement;
			expect(preview.src).toBe(TINY_PNG);
			expect(croppie.zoom).toBe(3);
		});
	});
});
