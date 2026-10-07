import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { Croppie } from "../../src/Croppie.ts";
import type { CroppieData } from "../../src/types.ts";
import { installImageMock, simulateDrag } from "../fixtures/mock-helpers.ts";
import { TINY_PNG } from "../fixtures/test-image-data-url.ts";

describe("Croppie update work", () => {
	let host: HTMLDivElement;
	let cropper: Croppie;
	let restoreImage: () => void;
	let get: ReturnType<typeof spyOn<Croppie, "get">>;

	beforeEach(() => {
		restoreImage = installImageMock({ width: 400, height: 300 });
		host = document.createElement("div");
		document.body.appendChild(host);
		cropper = new Croppie(host, {
			viewport: { width: 100, height: 100, type: "square" },
			zoom: { min: 0.1, max: 10 },
		});
		get = spyOn(cropper, "get");
	});

	afterEach(() => {
		get.mockRestore();
		cropper.destroy();
		host.remove();
		restoreImage();
	});

	it("keeps state and DOM synchronous without calculating unused payloads", async () => {
		await cropper.bind({ url: TINY_PNG, zoom: 1 });
		cropper.setZoom(2);
		const boundary = host.querySelector<HTMLElement>(".cr-boundary");
		if (!boundary) throw new Error("Missing boundary");
		simulateDrag(boundary, 100, 100, 110, 100);
		expect(cropper.zoom).toBe(2);
		expect(host.querySelector<HTMLElement>(".cr-image")?.style.transform).toBe(
			"translate(-290px, -200px) scale(2)",
		);
		cropper.rotate(90);
		cropper.reset();
		expect(get).not.toHaveBeenCalled();
		expect(cropper.get()).toEqual({
			points: {
				topLeftX: 50,
				topLeftY: 0,
				bottomRightX: 350,
				bottomRightY: 300,
			},
			zoom: 1 / 3,
			rotation: 0,
		});
	});

	it("stops calculating payloads after the last listener is removed", async () => {
		await cropper.bind({ url: TINY_PNG, zoom: 1 });
		const listener = mock();
		cropper.on("update", listener);
		cropper.setZoom(2);
		expect(get).toHaveBeenCalledTimes(1);
		cropper.off("update", listener);
		cropper.setZoom(3);
		expect(get).toHaveBeenCalledTimes(1);
		cropper.on("update", listener);
		cropper.setZoom(4);
		expect(get).toHaveBeenCalledTimes(2);
		expect(listener.mock.calls.map(([data]) => data.zoom)).toEqual([2, 4]);
	});

	it("calculates one shared snapshot per event with synchronous reentry", async () => {
		await cropper.bind({ url: TINY_PNG, zoom: 1 });
		const snapshots: CroppieData[] = [];
		const order: string[] = [];
		cropper.on("update", (data) => {
			snapshots.push(data);
			order.push(`first:${data.zoom}`);
			if (data.zoom === 2) cropper.setZoom(3);
		});
		cropper.on("update", (data) => {
			snapshots.push(data);
			order.push(`second:${data.zoom}`);
		});
		cropper.on("zoom", ({ zoom }) => order.push(`zoom:${zoom}`));
		cropper.setZoom(2);
		expect(get).toHaveBeenCalledTimes(2);
		expect(order).toEqual([
			"first:2",
			"first:3",
			"second:3",
			"zoom:3",
			"second:2",
		]);
		expect(snapshots[0]).toBe(snapshots[3]);
		expect(snapshots[1]).toBe(snapshots[2]);
		expect(cropper.zoom).toBe(3);
	});

	it("observes listeners added or removed during the preceding rotate event", async () => {
		await cropper.bind({ url: TINY_PNG, zoom: 1 });
		const listener = mock();
		cropper.on("rotate", ({ rotation }) => {
			if (rotation === 90) cropper.on("update", listener);
			else cropper.off("update", listener);
		});
		cropper.rotate(90);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener.mock.calls[0]?.[0].rotation).toBe(90);
		cropper.rotate(90);
		expect(get).toHaveBeenCalledTimes(1);
	});
});
