// Exploratory comparison: run with the repository's pinned Bun and Playwright.
// No shared server, GPU-memory claims, or timing thresholds. The coordinator runs
// isolated performance validation; this helper explains the work/allocation delta.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, firefox, webkit } from "@playwright/test";

const baseline =
	process.env.BASELINE_REF || "76540ff3ec7f95b6adae2615f630e80cbc33c523";
const browserName = process.env.PROFILE_BROWSER || "chromium";
const outputPath = process.argv[2] || "/tmp/croppie-runtime-profile.json";
const temp = mkdtempSync(join(tmpdir(), "croppie-runtime-profile-"));
execFileSync("tar", ["-x", "-C", temp], {
	input: execFileSync("git", ["archive", baseline, "src"]),
});
const sources = { baseline: temp, candidate: process.cwd() };
// Reproduce rejected cleanup attempts in a temporary copy, never in production source.
const experimentPatch = process.env.PROFILE_CANVAS_PATCH;
if (experimentPatch) {
	const variant = mkdtempSync(join(tmpdir(), "croppie-runtime-variant-"));
	cpSync(resolve("src"), join(variant, "src"), { recursive: true });
	execFileSync("git", ["apply", resolve(experimentPatch)], { cwd: variant });
	sources.candidate = variant;
}
const modules = {};
const sizes = {};
for (const [label, root] of Object.entries(sources)) {
	const entry = join(temp, `${label}.ts`);
	writeFileSync(
		entry,
		`export { Croppie } from ${JSON.stringify(join(root, "src/Croppie.ts"))};\nexport { drawCroppedImage } from ${JSON.stringify(join(root, "src/canvas/draw.ts"))};\n`,
	);
	const built = await Bun.build({
		entrypoints: [entry],
		target: "browser",
		minify: true,
	});
	if (!built.success) throw new Error(String(built.logs));
	modules[`/${label}.js`] = await built.outputs[0].text();
	// Match the public production build, including its sourceMappingURL comment. Use
	// Node's compressors to match the parent measurement (Bun zlib differs slightly).
	const outputDir = join(temp, `public-${label}`);
	execFileSync(
		process.execPath,
		[
			"build",
			"src/index.ts",
			`--outdir=${outputDir}`,
			"--entry-naming=croppie.[ext]",
			"--minify",
			"--sourcemap",
		],
		{ cwd: root },
	);
	sizes[label] = JSON.parse(
		execFileSync(
			"node",
			[
				"--input-type=module",
				"-e",
				`
		import { readFileSync } from 'node:fs';
		import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
		const bytes = readFileSync(process.argv[1]);
		console.log(JSON.stringify({raw:bytes.length,gzip9:gzipSync(bytes,{level:9}).length,brotli11:brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).length}));
	`,
				join(outputDir, "croppie.js"),
			],
			{ encoding: "utf8" },
		),
	);
}
const css = readFileSync(resolve("src/croppie.css"), "utf8");
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const path = new URL(request.url).pathname;
		if (modules[path])
			return new Response(modules[path], {
				headers: { "Content-Type": "text/javascript" },
			});
		return new Response(
			`<!doctype html><style>${css}</style><div id="mount"></div>`,
			{ headers: { "Content-Type": "text/html" } },
		);
	},
});
const browser = await { chromium, firefox, webkit }[browserName].launch();
const report = {
	baseline,
	experimentPatch,
	candidate: execFileSync("git", ["rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim(),
	dirty: execFileSync("git", ["status", "--short"], {
		encoding: "utf8",
	}).trim(),
	bun: Bun.version,
	node: execFileSync("node", ["--version"], { encoding: "utf8" }).trim(),
	playwright: JSON.parse(
		readFileSync("node_modules/@playwright/test/package.json"),
	).version,
	browser: browserName,
	browserVersion: browser.version(),
	platform: process.platform,
	arch: process.arch,
	sizes,
	note: "Exploratory, potentially competing CPU load. Canvas pixels are explicit live dimensions, not measured RSS or GPU memory. Timing excludes instrumentation.",
	runs: [],
};
try {
	// Alternating order limits systematic warm-up/order bias; this is still exploratory.
	for (const label of ["baseline", "candidate", "candidate", "baseline"]) {
		const page = await browser.newPage({
			viewport: { width: 800, height: 600 },
		});
		await page.goto(server.url.href);
		const result = await page.evaluate(
			async ({ label }) => {
				const { Croppie, drawCroppedImage } = await import(`/${label}.js`);
				const fixture = document.createElement("canvas");
				fixture.width = 2048;
				fixture.height = 1536;
				const fixtureContext = fixture.getContext("2d");
				const data = fixtureContext.createImageData(
					fixture.width,
					fixture.height,
				);
				for (let y = 0; y < fixture.height; y++) {
					for (let x = 0; x < fixture.width; x++) {
						const offset = (y * fixture.width + x) * 4;
						data.data[offset] = (x * 31 + y * 17) % 256;
						data.data[offset + 1] = (x ^ y) % 256;
						data.data[offset + 2] = ((x >> 2) ^ (y * 7)) % 256;
						data.data[offset + 3] = (x + y) % 7 ? 255 : 127;
					}
				}
				fixtureContext.putImageData(data, 0, 0);
				const blob = await new Promise((resolve) =>
					fixture.toBlob(resolve, "image/png"),
				);
				fixture.width = fixture.height = 0;
				const imageUrl = URL.createObjectURL(blob);
				const image = new Image();
				image.src = imageUrl;
				await image.decode();
				const mount = document.querySelector("#mount");
				const cropper = new Croppie(mount, {
					viewport: { width: 128, height: 96, type: "square" },
					boundary: { width: 300, height: 250 },
					zoom: { min: 0.01, max: 10, enforceMinimumCoverage: false },
				});
				await cropper.bindFile(blob, { zoom: 1 });
				const boundary = mount.querySelector(".cr-boundary");
				const slider = mount.querySelector(".cr-slider");
				const rect = boundary.getBoundingClientRect();
				const clientX = rect.left + rect.width / 2;
				const clientY = rect.top + rect.height / 2;
				function gesture(kind, count) {
					if (kind === "drag")
						boundary.dispatchEvent(
							new PointerEvent("pointerdown", {
								pointerId: 1,
								button: 0,
								buttons: 1,
								clientX,
								clientY,
							}),
						);
					for (let i = 0; i < count; i++) {
						if (kind === "drag")
							boundary.dispatchEvent(
								new PointerEvent("pointermove", {
									pointerId: 1,
									buttons: 1,
									clientX: clientX + (i % 2),
									clientY,
								}),
							);
						else if (kind === "wheel")
							boundary.dispatchEvent(
								new WheelEvent("wheel", {
									deltaY: i % 2 ? 0.1 : -0.1,
									clientX,
									clientY,
									cancelable: true,
								}),
							);
						else if (kind === "no-op") cropper.setZoom(cropper.zoom);
						else cropper.setZoom(i % 2 ? 1 : 1.001);
					}
					if (kind === "drag")
						boundary.dispatchEvent(
							new PointerEvent("pointerup", {
								pointerId: 1,
								button: 0,
								clientX,
								clientY,
							}),
						);
				}
				const audit = [];
				const observer = new MutationObserver(() => {});
				observer.observe(slider, {
					attributes: true,
					attributeFilter: ["aria-valuetext"],
				});
				const originalGet = cropper.get;
				let gets = 0;
				cropper.get = function () {
					gets++;
					return originalGet.call(this);
				};
				let updates = 0;
				const listener = () => updates++;
				for (const subscribed of [false, true]) {
					if (subscribed) cropper.on("update", listener);
					for (const kind of ["drag", "wheel", "setZoom", "no-op"]) {
						cropper.setZoom(1);
						gets = updates = 0;
						observer.takeRecords();
						gesture(kind, 1000);
						audit.push({
							kind,
							subscribed,
							getCalls: gets,
							updates,
							ariaWrites: observer.takeRecords().length,
						});
					}
				}
				cropper.off("update", listener);
				cropper.get = originalGet;
				observer.disconnect();
				const timings = [];
				for (const subscribed of [false, true]) {
					if (subscribed) cropper.on("update", listener);
					for (const kind of ["drag", "wheel", "setZoom", "no-op"]) {
						gesture(kind, 1000);
						const samples = [];
						for (let round = 0; round < 7; round++) {
							const started = performance.now();
							gesture(kind, 3000);
							samples.push(performance.now() - started);
						}
						timings.push({ kind, subscribed, eventsPerSample: 3000, samples });
					}
				}
				cropper.off("update", listener);
				const frame = {
					topLeftX: 0,
					topLeftY: 0,
					bottomRightX: 2048,
					bottomRightY: 1536,
				};
				const allocation = {
					canvases: 0,
					peakPixels: 0,
					retainedScratchPixels: 0,
					outputPixels: 0,
					drawCalls: [],
				};
				const allocated = new Set();
				const proto = HTMLCanvasElement.prototype;
				const width = Object.getOwnPropertyDescriptor(proto, "width");
				const height = Object.getOwnPropertyDescriptor(proto, "height");
				function record() {
					const pixels = [...allocated].reduce(
						(n, canvas) => n + canvas.width * canvas.height,
						0,
					);
					allocation.peakPixels = Math.max(allocation.peakPixels, pixels);
				}
				for (const [name, descriptor] of [
					["width", width],
					["height", height],
				])
					Object.defineProperty(proto, name, {
						...descriptor,
						set(value) {
							descriptor.set.call(this, value);
							record();
						},
					});
				const getContext = proto.getContext;
				proto.getContext = function (...args) {
					const context = getContext.apply(this, args);
					if (context) {
						allocated.add(this);
						record();
					}
					return context;
				};
				const drawImage = CanvasRenderingContext2D.prototype.drawImage;
				CanvasRenderingContext2D.prototype.drawImage = function (
					source,
					...args
				) {
					allocation.drawCalls.push({
						source:
							source instanceof HTMLCanvasElement
								? [source.width, source.height]
								: "image",
						destination: [this.canvas.width, this.canvas.height],
						args,
					});
					return drawImage.call(this, source, ...args);
				};
				let output;
				try {
					output = drawCroppedImage(image, frame, 128, 96);
				} finally {
					Object.defineProperty(proto, "width", width);
					Object.defineProperty(proto, "height", height);
					proto.getContext = getContext;
					CanvasRenderingContext2D.prototype.drawImage = drawImage;
				}
				allocation.canvases = allocated.size;
				allocation.outputPixels = output.width * output.height;
				allocation.retainedScratchPixels = [...allocated]
					.filter((canvas) => canvas !== output)
					.reduce((n, canvas) => n + canvas.width * canvas.height, 0);
				for (const canvas of allocated) canvas.width = canvas.height = 0;
				allocated.clear();
				async function hashPixels(canvas) {
					const bytes = canvas
						.getContext("2d")
						.getImageData(0, 0, canvas.width, canvas.height).data;
					const digest = await crypto.subtle.digest("SHA-256", bytes);
					return [...new Uint8Array(digest)]
						.map((n) => n.toString(16).padStart(2, "0"))
						.join("");
				}
				const pixels = [];
				for (const rotation of [0, 90, 180, 270]) {
					for (const circle of [false, true]) {
						for (const letterbox of [false, true]) {
							const canvas = drawCroppedImage(
								image,
								letterbox
									? {
											topLeftX: -71.25,
											topLeftY: -109.75,
											bottomRightX: 2176.5,
											bottomRightY: 1711.125,
										}
									: frame,
								129,
								97,
								{ rotation, circle, backgroundColor: "#eae7db" },
							);
							pixels.push({
								rotation,
								circle,
								letterbox,
								hash: await hashPixels(canvas),
							});
							canvas.width = canvas.height = 0;
						}
					}
				}
				cropper.reset();
				const exports = [];
				for (const type of ["canvas", "blob", "base64"]) {
					for (const format of type === "canvas"
						? ["png"]
						: ["png", "jpeg", "webp"]) {
						const samples = [];
						let hash, bytes, mime;
						for (let round = 0; round < 9; round++) {
							const started = performance.now();
							const result = await cropper.result({
								type,
								format,
								quality: 0.92,
							});
							if (round >= 2) samples.push(performance.now() - started);
							if (type === "canvas") {
								hash = await hashPixels(result);
								result.width = result.height = 0;
							} else {
								const blob =
									type === "blob" ? result : await (await fetch(result)).blob();
								bytes = blob.size;
								mime = blob.type;
								const bitmap = await createImageBitmap(blob);
								const canvas = document.createElement("canvas");
								canvas.width = bitmap.width;
								canvas.height = bitmap.height;
								canvas.getContext("2d").drawImage(bitmap, 0, 0);
								hash = await hashPixels(canvas);
								bitmap.close();
								canvas.width = canvas.height = 0;
							}
						}
						exports.push({ type, format, samples, hash, bytes, mime });
					}
				}
				cropper.destroy();
				URL.revokeObjectURL(imageUrl);
				return { audit, timings, allocation, pixels, exports };
			},
			{ label },
		);
		report.runs.push({ label, ...result });
		console.error(
			`${label}: ${result.allocation.retainedScratchPixels} scratch pixels retained; ${result.pixels.length} pixel hashes`,
		);
		await page.close();
	}
} finally {
	await browser.close();
	server.stop(true);
}
const reference = report.runs[0];
report.pixelsIdentical = report.runs.every(
	(run) => JSON.stringify(run.pixels) === JSON.stringify(reference.pixels),
);
report.encodedPixelsIdentical = report.runs.every((run) =>
	run.exports.every(
		(result, i) =>
			result.hash === reference.exports[i].hash &&
			result.bytes === reference.exports[i].bytes,
	),
);
report.drawStepsIdentical = report.runs.every(
	(run) =>
		JSON.stringify(run.allocation.drawCalls) ===
		JSON.stringify(reference.allocation.drawCalls),
);
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
	JSON.stringify({
		outputPath,
		sizes,
		pixelsIdentical: report.pixelsIdentical,
		encodedPixelsIdentical: report.encodedPixelsIdentical,
		drawStepsIdentical: report.drawStepsIdentical,
	}),
);
if (
	!report.pixelsIdentical ||
	!report.encodedPixelsIdentical ||
	!report.drawStepsIdentical
)
	process.exitCode = 1;
