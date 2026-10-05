// Fails when a type declaration in dist/ imports or re-exports a relative module without a
// file extension (e.g. "../types" instead of "../types.js"). Such a specifier does not
// resolve under `node16`/`nodenext` module resolution, so TypeScript users of the package
// would get `any` for the missing types. Run by `check:package`.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname: that keeps %20 and other escapes in the path (and the
// leading slash of a Windows drive path), so dist/ would not be found
const root = fileURLToPath(new URL("../dist/", import.meta.url));

// The module specifier of `from "..."`, `import "..."`, `import("...")` and `require("...")`
const SPECIFIER =
	/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'])(\.{1,2}\/[^"']*)\1/g;
const EXTENSION = /\.(?:js|mjs|cjs|json)$/;

function declarationFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return declarationFiles(path);
		return entry.name.endsWith(".d.ts") ? [path] : [];
	});
}

const files = declarationFiles(root);
if (files.length === 0) {
	console.error("check-dts-specifiers: no .d.ts files in dist/ (run the build first)");
	process.exit(1);
}

const problems = [];
for (const file of files) {
	const lines = readFileSync(file, "utf8").split("\n");
	lines.forEach((line, index) => {
		for (const match of line.matchAll(SPECIFIER)) {
			const specifier = match[2];
			if (!EXTENSION.test(specifier)) {
				problems.push(
					`dist/${relative(root, file)}:${index + 1}: "${specifier}" has no file extension`,
				);
			}
		}
	});
}

if (problems.length > 0) {
	console.error(
		"check-dts-specifiers: relative specifiers in type declarations need an extension (.js):",
	);
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}
console.log(
	`check-dts-specifiers: ${files.length} declaration files, every relative specifier has an extension`,
);
