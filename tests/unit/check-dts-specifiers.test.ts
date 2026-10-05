import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../../scripts/check-dts-specifiers.mjs");

describe("scripts/check-dts-specifiers.mjs", () => {
	let project: string;

	/** Runs a copy of the script from `<project>/scripts`, as `check:package` runs it. */
	function check() {
		const result = spawnSync(
			"node",
			[join(project, "scripts/check-dts-specifiers.mjs")],
			{
				encoding: "utf8",
			},
		);
		return {
			status: result.status,
			output: `${result.stdout}${result.stderr}`,
		};
	}

	function declaration(name: string, content: string) {
		writeFileSync(join(project, "dist", name), content);
	}

	beforeEach(() => {
		// A space and a non-ASCII character: URL.pathname keeps both percent-encoded
		project = mkdtempSync(join(tmpdir(), "croppie dts é "));
		mkdirSync(join(project, "scripts"));
		mkdirSync(join(project, "dist"));
		copyFileSync(SCRIPT, join(project, "scripts/check-dts-specifiers.mjs"));
	});

	afterEach(() => {
		rmSync(project, { recursive: true, force: true });
	});

	it("passes when every relative specifier has an extension", () => {
		declaration(
			"a.d.ts",
			'import type { B } from "./b.js";\nexport type A = B;\n',
		);
		declaration("b.d.ts", "export type B = string;\n");

		const { status, output } = check();

		expect(output).toContain("2 declaration files");
		expect(status).toBe(0);
	});

	it("names the file and line of an extensionless relative specifier", () => {
		declaration(
			"a.d.ts",
			'export type A = string;\nexport * from "../types";\n',
		);

		const { status, output } = check();

		expect(output).toContain('dist/a.d.ts:2: "../types" has no file extension');
		expect(status).toBe(1);
	});

	it("fails when dist has no declaration files", () => {
		const { status, output } = check();

		expect(output).toContain("no .d.ts files in dist/");
		expect(status).toBe(1);
	});
});
