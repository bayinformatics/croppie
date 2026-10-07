import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { brotliCompressSync, gzipSync } from "node:zlib";

// Pass every artifact required by the selected feature set, including deferred chunks.
// Separate HTTP resources are compressed separately. Source maps are not runtime assets.
const paths = process.argv.slice(2);
if (paths.length === 0) paths.push("dist/croppie.js", "dist/croppie.css");
const files = await Promise.all(
	paths.map(async (path) => {
		const bytes = await readFile(path);
		return {
			path,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			raw: bytes.length,
			gzip: gzipSync(bytes, { level: 9 }).length,
			brotli: brotliCompressSync(bytes).length,
		};
	}),
);
const total = files.reduce(
	(sum, file) => ({
		raw: sum.raw + file.raw,
		gzip: sum.gzip + file.gzip,
		brotli: sum.brotli + file.brotli,
	}),
	{ raw: 0, gzip: 0, brotli: 0 },
);
console.log(JSON.stringify({ node: process.version, files, total }, null, 2));
