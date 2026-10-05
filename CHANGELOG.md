# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.0] - Unreleased

### Added

- `bind({ points })` is now applied when the image loads, with `points` given as an object or as `[x1, y1, x2, y2]`; `get()` returns the same points back (#19, #23). Malformed points (an array without exactly 4 entries, a coordinate that is not a number, a rect without width or height) are ignored with a console warning, and the image gets its default framing.
- A `default` condition in the package `exports` map, so `require("@bayinformatics/croppie")` works natively on Node 20.19+ and 22.12+ (it loads the ES module).
- A `./package.json` export.
- `"sideEffects": ["./dist/croppie.css"]`, so bundlers keep the stylesheet import and can tree-shake everything else.
- Type declarations for the `./croppie.css` and `./style.css` exports, so `import '@bayinformatics/croppie/croppie.css'` type-checks under TypeScript 7, whose default `noUncheckedSideEffectImports` rejected it (TS2882).
- `typecheck` (type-checks sources and tests) and `check:package` (publint + Are the Types Wrong?, plus a check that every relative import in the type declarations has a `.js` extension) scripts.

### Changed

- The minimum supported Node version is 20 (`engines.node` is `>=20`; 3.1.0 declared `>=18`). Raising it to Node 22 is deferred to 4.0.
- Development uses Bun 1.4.2, pinned in `.bun-version` and read by CI.
- Updated dev dependencies: TypeScript 7.0.2, Biome 2.5.15, Playwright 1.63.0, happy-dom 20.14.5, `@types/bun` 1.4.2; added `publint` and `@arethetypeswrong/cli`.
- Type declarations import with `.js` specifiers (`./Croppie.js`), which resolve under `node16` and `bundler` module resolution.
- Declaration maps are no longer shipped; they pointed at sources that are not part of the package.
- The package `homepage` is the live demo, and `CHANGELOG.md` is included in the published files.
- Visual regression baselines are stored per platform (`chromium-linux`, `chromium-darwin`).

### Fixed

- The transform computed from `bind({ points })` now derives from the zoom after it has been clamped to the zoom limits (#23).
- `bind({ points })` accepts v2's string coordinates (as v2's `get()` returned them) instead of ignoring them with a warning. Only plain decimal strings count (such as `"12.50"` or `"-3"`); a string such as `"50px"` or `"0x10"` is still ignored with a warning.
- Stale `dist/*.js` files from v3.0.0 (about 28 unused tsc outputs) and declaration maps are no longer committed or shipped in the package.
- `bun test` no longer tries to run the Playwright specs.
- The preview image is requested in the same CORS mode as the image `result()` crops, so the browser can reuse the image it already loaded when the response is cacheable, instead of requesting the URL again in another mode.
- The `LICENSE` file now has the standard MIT header, so GitHub detects the license.

### Internal

- Integration suites for `bind`, `zoom` and `result` (65 tests) are no longer skipped; the image and canvas mocks resolve fixture dimensions and a 2D context, `src/canvas/draw.ts` is covered, and tests are formatted, linted and type-checked.
- Tests pin `result()`'s quality, circle and `backgroundColor` handling and `loadImage()`'s `crossOrigin` for remote URLs.
- CI: a composite setup action, least-privilege `permissions`, `cancel-in-progress` for pull requests (runs on `main` always finish), current major versions of all actions, `check:package` in the build job, and CI runs for pull requests against any base branch.
- Publishing first verifies the tag against `package.json` on every run (a release must be tagged `v<version>`, and a manual run must be started on that tag), then runs lint, typecheck, tests, build and `check:package`, and clears `dist/` before downloading the built artifact.
- Playwright replaced Lost Pixel for visual regression (#16), with an HTML report and `forbidOnly` on CI, and no retries, so a flaky screenshot fails instead of passing on a second try.
- Committed `dist/` and `docs/` bundles are checked for parity with a fresh build in CI, under the pinned Bun version.
- Dependabot for the `bun` and `github-actions` ecosystems (#18, #22).
- Added `CONTRIBUTING.md`, `SECURITY.md`, issue forms and a pull request template.

## [3.1.0] - 2026-01-05

### Added

- Boundary constraints: the image stays within the viewport bounds during drag, zoom, `bind()` and `reset()`, so a crop can no longer contain empty space (#12).

### Changed

- Demo image and the size badge on the demo page.

## [3.0.2] - 2025-12-24

Includes the untagged 3.0.1.

### Added

- `zoom.enforceMinimumCoverage` (default `true`) to prevent zooming out below the zoom at which the image covers the viewport.
- Test coverage for the `Croppie` class.

### Fixed

- Whitespace in the demo's code blocks.

### Internal

- CI workflow with lint, test and build jobs; publishing to npm and GitHub Packages with provenance, plus a `workflow_dispatch` trigger.

## [3.0.0] - 2025-12-24

First release of `@bayinformatics/croppie`, a TypeScript-first fork of [Foliotek/Croppie](https://github.com/Foliotek/Croppie), published to npm and with a demo page on GitHub Pages.

[3.2.0]: https://github.com/bayinformatics/croppie/compare/v3.1.0...HEAD
[3.1.0]: https://github.com/bayinformatics/croppie/compare/v3.0.2...v3.1.0
[3.0.2]: https://github.com/bayinformatics/croppie/compare/v3.0.0...v3.0.2
[3.0.0]: https://github.com/bayinformatics/croppie/releases/tag/v3.0.0
