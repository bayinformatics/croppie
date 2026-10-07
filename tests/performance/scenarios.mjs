// These functions execute inside the browser via Playwright's page.evaluate.
export async function measure({ variant, image, warmups, runs }) {
	const importStart = performance.now();
	const { default: Croppie } = await import(`/build/${variant}/croppie.js`);
	const moduleLoadMs = performance.now() - importStart;
	const blob = await fetch(`/images/${image}`).then((response) =>
		response.blob(),
	);
	const frame = () => new Promise(requestAnimationFrame);
	const samples = [];
	let firstRun;
	for (let run = -warmups; run < runs; run++) {
		const host = document.createElement("div");
		document.body.append(host);
		const cropper = new Croppie(host, {
			viewport: { width: 256, height: 256 },
			boundary: { width: 400, height: 400 },
		});
		const start = performance.now();
		await cropper.bindFile(blob);
		const bindMs = performance.now() - start;
		await host.querySelector("img").decode();
		await frame();
		await frame();
		const readyMs = performance.now() - start;
		const boundary = host.querySelector(".cr-boundary");
		const rect = boundary.getBoundingClientRect();
		const intervals = [];
		let previous = await frame();
		const gestureStart = performance.now();
		// Repeatable stress workload; this is not a physical touch/trackpad benchmark.
		for (let tick = 0; tick < 10; tick++) {
			for (let event = 0; event < 20; event++) {
				boundary.dispatchEvent(
					new WheelEvent("wheel", {
						deltaY: tick % 2 ? 10 : -10,
						clientX: rect.x + rect.width / 2,
						clientY: rect.y + rect.height / 2,
						cancelable: true,
						bubbles: true,
					}),
				);
			}
			const next = await frame();
			intervals.push(next - previous);
			previous = next;
		}
		const gestureMs = performance.now() - gestureStart;
		cropper.reset();
		const timing = {};
		for (const [label, size] of [
			["avatar", 256],
			["large", 2048],
		]) {
			const begin = performance.now();
			const ping = new Promise((resolve) =>
				setTimeout(() => resolve(performance.now() - begin), 0),
			);
			const result = await cropper.result({
				type: "blob",
				format: image.endsWith(".png") ? "png" : "jpeg",
				quality: 0.9,
				size: { width: size, height: size },
			});
			timing[`${label}Ms`] = performance.now() - begin;
			timing[`${label}TimerDelayMs`] = await ping;
			if (!(result.size > 0)) throw new Error("Empty export");
		}
		cropper.destroy();
		host.remove();
		const sample = { bindMs, readyMs, gestureMs, intervals, ...timing };
		if (run === -warmups) firstRun = sample;
		if (run >= 0) samples.push(sample);
	}
	return { moduleLoadMs, firstRun, samples };
}

export async function verify({ variant }) {
	const { default: Croppie } = await import(`/build/${variant}/croppie.js`);
	const { injectExifOrientation } = await import("/exif-jpeg.js");
	const assert = (condition, message) => {
		if (!condition) throw new Error(message);
	};
	const source = document.createElement("canvas");
	source.width = 400;
	source.height = 200;
	const ctx = source.getContext("2d");
	const colors = ["#ff0000", "#00ff00", "#ffff00", "#0000ff"];
	for (const [i, x, y] of [
		[0, 0, 0],
		[1, 200, 0],
		[2, 200, 100],
		[3, 0, 100],
	]) {
		ctx.fillStyle = colors[i];
		ctx.fillRect(x, y, 200, 100);
	}
	const jpeg = await new Promise((resolve) =>
		source.toBlob(resolve, "image/jpeg", 1),
	);
	const bytes = new Uint8Array(await jpeg.arrayBuffer());
	source.width = source.height = 0;
	const expected = [
		[0, 1, 2, 3],
		[1, 0, 3, 2],
		[2, 3, 0, 1],
		[3, 2, 1, 0],
		[0, 3, 2, 1],
		[3, 0, 1, 2],
		[2, 1, 0, 3],
		[1, 2, 3, 0],
	];
	const rgb = [
		[255, 0, 0],
		[0, 255, 0],
		[255, 255, 0],
		[0, 0, 255],
	];
	const hash = async (canvas) => {
		const data = canvas
			.getContext("2d")
			.getImageData(0, 0, canvas.width, canvas.height).data;
		const digest = await crypto.subtle.digest("SHA-256", data);
		return Array.from(new Uint8Array(digest), (n) =>
			n.toString(16).padStart(2, "0"),
		).join("");
	};
	const checkPixels = (canvas, order) => {
		const context = canvas.getContext("2d");
		for (const [i, x, y] of [
			[0, 50, 50],
			[1, 150, 50],
			[2, 150, 150],
			[3, 50, 150],
		]) {
			const actual = context.getImageData(x, y, 1, 1).data;
			assert(
				rgb[order[i]].every((channel, j) => Math.abs(channel - actual[j]) < 25),
				`Wrong quadrant ${i}: ${actual}`,
			);
		}
	};
	const outputHashes = {};
	for (let orientation = 1; orientation <= 8; orientation++) {
		const blob = new Blob([injectExifOrientation(bytes, orientation)], {
			type: "image/jpeg",
		});
		const host = document.createElement("div");
		document.body.append(host);
		const cropper = new Croppie(host, {
			viewport: { width: 200, height: 200 },
			boundary: { width: 300, height: 300 },
			enableExif: true,
		});
		await cropper.bindFile(blob);
		const proxy = new Proxy(cropper, {});
		assert(proxy.get().orientation === orientation, "Proxy receiver changed");
		proxy.setZoom(cropper.zoom);
		assert(cropper.get().orientation === orientation, "EXIF reporting changed");
		assert(cropper.get().rotation === 0, "EXIF double rotation");
		const preview = host.querySelector("img");
		assert(
			preview.naturalWidth === (orientation >= 5 ? 200 : 400),
			"Wrong oriented width",
		);
		let canvas = await cropper.result({ type: "canvas" });
		checkPixels(canvas, expected[orientation - 1]);
		canvas.width = canvas.height = 0;
		cropper.rotate(90);
		canvas = await cropper.result({ type: "canvas" });
		const order = expected[orientation - 1];
		checkPixels(canvas, [order[3], order[0], order[1], order[2]]);
		const before = await hash(canvas);
		canvas.width = canvas.height = 0;
		const state = cropper.get();
		await cropper.bindFile(blob, state);
		canvas = await cropper.result({ type: "canvas" });
		assert((await hash(canvas)) === before, "State round-trip changed pixels");
		outputHashes[`exif${orientation}`] = before;
		canvas.width = canvas.height = 0;
		canvas = await cropper.result({ type: "canvas", circle: true });
		assert(
			canvas.getContext("2d").getImageData(0, 0, 1, 1).data[3] === 0,
			"Circle corner must be transparent",
		);
		canvas.width = canvas.height = 0;
		const first = cropper.bindFile(blob);
		const second = cropper.bindFile(blob);
		const settled = await Promise.allSettled([first, second]);
		assert(
			settled[0].status === "rejected" &&
				settled[0].reason.name === "AbortError",
			"Superseded bind did not abort",
		);
		assert(settled[1].status === "fulfilled", "Newest bind failed");
		const pending = cropper.bindFile(blob);
		cropper.destroy();
		const abandoned = await Promise.allSettled([pending]);
		assert(
			abandoned[0].status === "rejected" &&
				abandoned[0].reason.name === "AbortError",
			"Destroyed bind did not abort",
		);
		host.remove();
	}
	// Hash downsampled real-image fixtures too; a faster but different output is visible.
	for (const image of ["photo-12mp.jpg", "photo-48mp.jpg", "transparent.png"]) {
		const host = document.createElement("div");
		document.body.append(host);
		const cropper = new Croppie(host, {
			viewport: { width: 256, height: 256 },
		});
		const blob = await fetch(`/images/${image}`).then((response) =>
			response.blob(),
		);
		await cropper.bindFile(blob);
		for (const size of [256, 2048]) {
			const canvas = await cropper.result({
				type: "canvas",
				size: { width: size, height: size },
			});
			outputHashes[`${image}/${size}`] = await hash(canvas);
			canvas.width = canvas.height = 0;
		}
		cropper.destroy();
		host.remove();
	}
	// A long-lived editor must release obsolete Blob URLs during repeated replacement.
	const liveUrls = new Set();
	const createUrl = URL.createObjectURL;
	const revokeUrl = URL.revokeObjectURL;
	URL.createObjectURL = (blob) => {
		const url = createUrl(blob);
		liveUrls.add(url);
		return url;
	};
	URL.revokeObjectURL = (url) => {
		liveUrls.delete(url);
		revokeUrl(url);
	};
	const host = document.createElement("div");
	document.body.append(host);
	const cropper = new Croppie(host, { viewport: { width: 256, height: 256 } });
	try {
		const blob = await fetch("/images/photo-48mp.jpg").then((response) =>
			response.blob(),
		);
		for (let replacement = 0; replacement < 20; replacement++) {
			await cropper.bindFile(blob);
			assert(liveUrls.size === 1, "Obsolete object URL retained");
		}
		cropper.destroy();
		assert(liveUrls.size === 0, "Object URL retained after destroy");
	} finally {
		cropper.destroy();
		host.remove();
		URL.createObjectURL = createUrl;
		URL.revokeObjectURL = revokeUrl;
	}
	return {
		orientations: 8,
		replacements: 20,
		outputHashes,
		remainingCroppers: document.querySelectorAll(".croppie-container").length,
	};
}
