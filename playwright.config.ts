import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests/visual",
	snapshotPathTemplate:
		"{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
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
