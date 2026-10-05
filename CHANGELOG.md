# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.0] - Unreleased

### Added

- `bind({ points })` is now applied when the image loads, with `points` given as an object or as `[x1, y1, x2, y2]`; `get()` returns the same points back (#19, #23).
- A `default` condition in the package `exports` map, so `require("@bayinformatics/croppie")` works natively on Node 22.12+ (it loads the ES module).
- A `./package.json` export.
- `"sideEffects": ["./dist/croppie.css"]`, so bundlers keep the stylesheet import and can tree-shake everything else.
- `typecheck` (type-checks sources and tests) and `check:package` (publint + Are the Types Wrong?) scripts.
- `enableZoom` option (default `true`): `false` removes the slider, mouse wheel and pinch zoom; `setZoom()` and `zoom =` still work.
- `rotate(degrees)` rotates the image clockwise by any multiple of 90 (closes #20); `bind({ rotation })` sets the initial rotation, `get()` returns `rotation`, `reset()` restores the bind-time rotation, and a `rotate` event is emitted. `points` stay in the natural frame and `result()` renders the rotated image. New `Rotation` type.
- `enableExif` now reads the EXIF Orientation tag of JPEGs bound as data URLs (including `bindFile()`) and reports it as `get().orientation` (closes #21); it never rotates pixels, because browsers already display such images upright. `bind({ orientation })` is an explicit override mapped to a rotation. New `readJpegOrientation()` export for bytes you fetched yourself.
- `result()` is typed by its output type: `"blob"` returns `Promise<Blob>`, `"base64"` `Promise<string>`, `"canvas"` `Promise<HTMLCanvasElement>` (a generic overload remains for runtime-only types).
- The zoom slider has `aria-label="Zoom"` and a percentage `aria-valuetext`, and a visible keyboard focus ring in Firefox as well as WebKit browsers.

### Changed

- The minimum supported Node version is 22 (`engines.node` is `>=22`).
- Development uses Bun 1.4.2, pinned in `.bun-version` and read by CI.
- Updated dev dependencies: TypeScript 7.0.2, Biome 2.5.15, Playwright 1.63.0, happy-dom 20.14.5, `@types/bun` 1.4.2; added `publint` and `@arethetypeswrong/cli`.
- Type declarations import with `.js` specifiers (`./Croppie.js`), which resolve under `node16` and `bundler` module resolution.
- Declaration maps are no longer shipped; they pointed at sources that are not part of the package.
- The package `homepage` is the live demo, and `CHANGELOG.md` is included in the published files.
- Visual regression baselines are stored per platform (`chromium-linux`, `chromium-darwin`).
- Zooming (slider, mouse wheel, pinch, `setZoom()`) keeps the point under the viewport centre, the cursor or the finger midpoint fixed, instead of always zooming about the image centre, so the image no longer drifts after a pan.
- Mouse wheel zoom is multiplicative: ×1.1 per 100px notch, scaled by `deltaY` and `deltaMode` and capped at one notch per event (it was a fixed ±0.1 step).
- Event contract: `bind()` now emits one `update`; `setZoom()` and `zoom =` emit `zoom`; `reset()` emits `zoom` when the zoom changed; `zoom` and `update` are emitted only when the clamped value actually changed; `update` fires before `zoom`. A drag that the bounds fully absorb no longer emits `update`. See the Events table in the README.
- `enableOrientation` no longer logs a warning (rotation is always available); `rotate()` accepts any multiple of 90 instead of only 90, 180, 270 and -90.
- A second touch ends an active drag, so a pinch takes over instead of also panning.
- The default `zoom.min` is now per image when it is not configured: the zoom at which the image covers the viewport, so a large photo (coverage below 0.1) can zoom out to fit instead of stopping at 0.1. Users who set `zoom.min` see no change. The effective minimum is capped at `zoom.max`, so a small image no longer produces an inverted slider.
- `result({ size: 'original' })` returns the viewport area at integer image resolution, and with `enforceMinimumCoverage: false` the letterboxed frame; all output sizes keep the image's proportions instead of stretching it over the output.
- `result()` renders with high-quality image smoothing, and a `'circle'` viewport that is not square is clipped to an ellipse (output and overlay).

### Fixed

- The transform computed from `bind({ points })` now derives from the zoom after it has been clamped to the zoom limits (#23).
- Stale `dist/*.js` files from v3.0.0 (about 28 unused tsc outputs) and declaration maps are no longer committed or shipped in the package.
- `bun test` no longer tries to run the Playwright specs.
- `setZoom(NaN)` (or any non-finite value) is ignored instead of corrupting the transform, and every zoom input goes through one code path with one clamp.
- A 0×0 image (for example an SVG without a size) is rejected by `bind()` with a clear error instead of producing an `Infinity` zoom range.
- Invalid options throw a `RangeError` from the constructor (non-positive or non-finite viewport, boundary or zoom limits, `zoom.min` greater than `zoom.max`).
- `bind()`, `bindFile()` and `result()` on a destroyed instance reject with a clear error, `setZoom()`, `zoom =` and `reset()` do nothing, and `destroy()` is idempotent. Overlapping `bind()` calls resolve to the last one, and a bind that is still loading when the instance is destroyed no longer applies an image to a dead instance.
- Error messages from failed image loads no longer embed the whole data URL.
- Dragging tracks the pointer that started it: moves from other pointers are ignored, `lostpointercapture` ends the drag, and pointer capture is guarded so dragging still works where it is missing or throws.
- The `LICENSE` file now has the standard MIT header, so GitHub detects the license.

### Internal

- Integration suites for `bind`, `zoom` and `result` (65 tests) are no longer skipped; the image and canvas mocks resolve fixture dimensions and a 2D context, `src/canvas/draw.ts` is covered, and tests are formatted, linted and type-checked.
- CI: a composite setup action, least-privilege `permissions`, `cancel-in-progress`, current major versions of all actions, `check:package` in the build job, and CI runs for pull requests against any base branch.
- Publishing runs lint, typecheck, tests, build and `check:package` first, verifies that the release tag matches `package.json`, and clears `dist/` before downloading the built artifact.
- Playwright replaced Lost Pixel for visual regression (#16), with an HTML report, retries and `forbidOnly` on CI.
- Committed `dist/` and `docs/` bundles are checked for parity with a fresh build in CI, under the pinned Bun version.
- Dependabot for the `bun` and `github-actions` ecosystems (#18, #22).
- Added `CONTRIBUTING.md`, `SECURITY.md`, issue forms and a pull request template.

## [3.1.0] - 2026-01-05

### Added

- Boundary constraints: the image stays within the viewport bounds during drag, zoom, `bind()` and `reset()`, so a crop can no longer contain empty space (#12).

### Changed

- Demo image and the size badge in the README.

## [3.0.2] - 2025-12-24

Includes the untagged 3.0.1.

### Added

- `zoom.enforceMinimumCoverage` (default `true`) to prevent zooming out below the zoom at which the image covers the viewport.
- Test coverage for the `Croppie` class.

### Fixed

- Whitespace in the demo's code blocks.

### Internal

- CI workflow with lint, test, build and security checks; publishing to npm and GitHub Packages with provenance, plus a `workflow_dispatch` trigger.

## [3.0.0] - 2025-12-24

First release of `@bayinformatics/croppie`, a TypeScript-first fork of [Foliotek/Croppie](https://github.com/Foliotek/Croppie), published to npm and with a demo page on GitHub Pages.

[3.2.0]: https://github.com/bayinformatics/croppie/compare/v3.1.0...HEAD
[3.1.0]: https://github.com/bayinformatics/croppie/compare/v3.0.2...v3.1.0
[3.0.2]: https://github.com/bayinformatics/croppie/compare/v3.0.0...v3.0.2
[3.0.0]: https://github.com/bayinformatics/croppie/releases/tag/v3.0.0
