import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests/visual",
	snapshotPathTemplate:
		"{testDir}/__screenshots__/{projectName}-{platform}/{testFilePath}/{arg}{ext}",
	forbidOnly: !!process.env.CI,
	// No retries, on CI either: a flaky pixel test must fail, not pass on a second try
	retries: 0,
	reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
	use: {
		trace: "retain-on-failure",
	},
	expect: {
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.01,
		},
	},
	projects: [
		{
			name: "chromium",
			use: {
				browserName: "chromium",
				viewport: { width: 800, height: 600 },
				deviceScaleFactor: 1,
			},
		},
	],
	webServer: {
		command: "bun tests/visual/serve.ts",
		port: 4173,
		reuseExistingServer: !process.env.CI,
	},
});
