// Packs the package with Bun, the same tarball that gets published, and runs Are the Types
// Wrong? on it. The tarball goes to a temporary directory that is removed when the check ends.
// Run by `check:package`.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "croppie-pack-"));

function run(command, args) {
	const result = spawnSync(command, args, { stdio: "inherit" });
	if (result.error) throw result.error;
	return result.status ?? 1;
}

let status;
try {
	status = run("bun", ["pm", "pack", "--destination", directory, "--quiet"]);
	if (status === 0) {
		const tarball = readdirSync(directory).find((name) =>
			name.endsWith(".tgz"),
		);
		if (!tarball) {
			console.error("check-types-wrong: bun pm pack did not write a tarball");
			status = 1;
		} else {
			status = run("attw", [join(directory, tarball), "--profile", "esm-only"]);
		}
	}
} finally {
	rmSync(directory, { recursive: true, force: true });
}
process.exit(status);
