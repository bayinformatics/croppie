import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import { installImageMock } from "../fixtures/mock-helpers.ts";
import { SMALL_PNG } from "../fixtures/test-image-data-url.ts";

describe("Croppie through a transparent proxy", () => {
	let root: HTMLDivElement;
	let instance: Croppie;
	let proxy: Croppie;
	let cleanupImageMock: () => void;

	beforeEach(() => {
		cleanupImageMock = installImageMock({ width: 20, height: 10 });
		root = document.createElement("div");
		document.body.appendChild(root);
		instance = new Croppie(root, {
			viewport: { width: 100, height: 100, type: "square" },
			zoom: { min: 0.1, max: 100 },
		});
		proxy = new Proxy(instance, {});
	});

	afterEach(() => {
		instance.destroy();
		root.remove();
		cleanupImageMock();
	});

	it("reads and updates zoom, then destroys through the proxy", async () => {
		expect(proxy.get().zoom).toBe(1);
		expect(proxy.zoom).toBe(1);
		proxy.setZoom(2);
		expect(proxy.zoom).toBe(2);
		proxy.zoom = 3;
		expect(instance.zoom).toBe(3);

		proxy.destroy();
		proxy.destroy();
		expect(root.children).toHaveLength(0);
		expect(proxy.get().zoom).toBe(1);
		await expect(proxy.bind(SMALL_PNG)).rejects.toThrow(
			"bind() called on a destroyed instance",
		);
	});

	it("binds, rotates, resets, and manages event handlers through the proxy", async () => {
		const zoom = mock();
		proxy.on("zoom", zoom);
		await proxy.bind(SMALL_PNG);
		expect(proxy.zoom).toBe(10);

		proxy.setZoom(20);
		proxy.rotate(90);
		expect(proxy.get().rotation).toBe(90);
		proxy.reset();
		expect(proxy.get().rotation).toBe(0);
		expect(proxy.zoom).toBe(10);
		expect(zoom.mock.calls).toEqual([
			[{ zoom: 20, previousZoom: 10 }],
			[{ zoom: 10, previousZoom: 20 }],
		]);

		proxy.off("zoom", zoom);
		proxy.zoom = 15;
		expect(zoom).toHaveBeenCalledTimes(2);
		expect(instance.zoom).toBe(15);
	});
});
