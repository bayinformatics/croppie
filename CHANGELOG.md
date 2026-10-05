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
- `enableZoom` option (default `true`): `false` removes the slider, mouse wheel and pinch zoom; `setZoom()` and `zoom =` still work. With `enableZoom: false` a pinch over the cropper zooms the page instead of doing nothing.
- `rotate(degrees)` rotates the image clockwise by any multiple of 90 (closes #20); `bind({ rotation })` sets the initial rotation, `get()` returns `rotation`, `reset()` restores the bind-time rotation, and a `rotate` event is emitted. `points` stay in the natural frame and `result()` renders the rotated image. New `Rotation` type.
- `enableExif` now reads the EXIF Orientation tag of JPEGs bound as data URLs (including `bindFile()`) and reports it as `get().orientation` (closes #21); it never rotates pixels, because browsers already display such images upright. `bind({ orientation })` is an explicit override mapped to a rotation. New `readJpegOrientation()` export for bytes you fetched yourself.
- `result()` is typed by its output type: `"blob"` returns `Promise<Blob>`, `"base64"` `Promise<string>`, `"canvas"` `Promise<HTMLCanvasElement>` (a generic overload remains for runtime-only types).
- The zoom slider has `aria-label="Zoom"` and a percentage `aria-valuetext` (set from its creation, so it is never announced as a raw value), and a visible keyboard focus ring in Firefox as well as WebKit browsers.

### Changed

- The minimum supported Node version is 20 (`engines.node` is `>=20`; 3.1.0 declared `>=18`). Raising it to Node 22 is deferred to 4.0.
- Development uses Bun 1.4.2, pinned in `.bun-version` and read by CI.
- Updated dev dependencies: TypeScript 7.0.2, Biome 2.5.15, Playwright 1.63.0, happy-dom 20.14.5, `@types/bun` 1.4.2; added `publint` and `@arethetypeswrong/cli`.
- Type declarations import with `.js` specifiers (`./Croppie.js`), which resolve under `node16` and `bundler` module resolution.
- Declaration maps are no longer shipped; they pointed at sources that are not part of the package.
- The package `homepage` is the live demo, and `CHANGELOG.md` is included in the published files.
- Visual regression baselines are stored per platform (`chromium-linux`, `chromium-darwin`).
- Zooming (slider, mouse wheel, pinch, `setZoom()`) keeps the point under the viewport centre, the cursor or the finger midpoint fixed, instead of always zooming about the image centre, so the image no longer drifts after a pan.
- Mouse wheel zoom is multiplicative: ×1.1 per notch (100px, or 3 lines for a mouse that scrolls by lines), scaled by `deltaY` and `deltaMode` and capped at one notch per event (it was a fixed ±0.1 step).
- Event contract: `bind()` now emits one `update`; `setZoom()` and `zoom =` emit `zoom`; `reset()` emits `zoom` when the zoom changed; `zoom` and `update` are emitted only when the clamped value actually changed; `update` fires before `zoom`. A drag that the bounds fully absorb no longer emits `update`. A `zoom` event is never emitted for a zoom that an `update` listener already replaced: only the final change is reported. See the Events table in the README.
- `enableOrientation` no longer logs a warning (rotation is always available); `rotate()` accepts any multiple of 90 instead of only 90, 180, 270 and -90.
- `zoom.initial` is deprecated: it never had an effect (use `bind({ url, zoom })`).
- A second touch ends an active drag, and a finger put down while another finger is down on the cropper never starts one (fingers resting elsewhere on the page do not count), so a pinch, also one resumed with a replacement finger, takes over instead of also panning. When the fingers of a pinch lift until one is left on the cropper, that finger pans again, from its next move and without a jump.
- The default `zoom.min` is now per image when it is not configured: the zoom at which the image covers the viewport, so a large photo (coverage below 0.1) can zoom out to fit instead of stopping at 0.1. Users who set `zoom.min` see no change. The effective minimum is capped at `zoom.max`, so a small image no longer produces an inverted slider.
- `result({ size: 'original' })` returns the viewport area at integer image resolution (with `enforceMinimumCoverage: false`, the letterboxed frame). An `'original'` or custom size is scaled down, keeping its shape, to at most 16,777,216 px (4096×4096) and 16,384 px a side, so it stays within what browsers can allocate for a canvas (iOS Safari draws a larger one blank and `toBlob()` gives `null`); every output size keeps the image's proportions: a size of another shape than the viewport centres the crop between transparent (or `backgroundColor`) bars, and a circle mask stays a circle.
- `result()` renders with high-quality image smoothing, and a `'circle'` viewport that is not square is clipped to an ellipse (output and overlay). The image is drawn with its edges on whole pixels, so a letterboxed result has no blurred half-pixel seam next to the bars.

### Fixed

- The transform computed from `bind({ points })` now derives from the zoom after it has been clamped to the zoom limits (#23).
- `bind({ points })` accepts v2's string coordinates (as v2's `get()` returned them) instead of ignoring them with a warning. Only plain decimal strings count (such as `"12.50"` or `"-3"`); a string such as `"50px"` or `"0x10"` is still ignored with a warning.
- Stale `dist/*.js` files from v3.0.0 (about 28 unused tsc outputs) and declaration maps are no longer committed or shipped in the package.
- `bun test` no longer tries to run the Playwright specs.
- `setZoom(NaN)` (or any non-finite value, or a blank or non-numeric string; a numeric string, such as a range input's `value`, is still converted) is ignored instead of corrupting the transform, and every zoom input goes through one code path with one clamp.
- `bind({ zoom })` with a non-finite zoom (`NaN`, `±Infinity`, a blank or non-numeric string) starts at the coverage zoom instead of leaving a `NaN` transform that no later zoom could repair.
- A 0×0 image (for example an SVG without a size) is rejected by `bind()` with a clear error instead of producing an `Infinity` zoom range.
- Viewport and boundary dimensions and `zoom.min`/`zoom.max` may be numeric strings (such as data attribute values), as `setZoom()` and `bind({ zoom })` already accept: they are converted to numbers, so a `"200"` viewport gets a 300px default boundary instead of `"200100"`.
- Invalid options throw a `RangeError` from the constructor (non-positive or non-finite viewport, boundary or zoom limits, a blank or non-numeric string among them, a configured `zoom.min` greater than `zoom.max`). A lone `zoom.max` below 0.1 is accepted: the per-image minimum is capped at it, and so is the slider's minimum before the first bind.
- A zoom option given as `undefined` (for example `zoom: { max: props.maxZoom }` with the prop unset) gets its default instead of turning every zoom, point and slider value into `NaN`.
- `bind()`, `bindFile()` and `result()` on a destroyed instance reject with a clear error, `setZoom()`, `zoom =` and `reset()` do nothing, `get()` and `zoom` report zeroed points and the initial zoom of 1, and `destroy()` is idempotent. Overlapping binds: only the newest applies its image and fulfills; an earlier `bind()` or `bindFile()` still loading rejects with a `DOMException` named `AbortError` (`bind() was superseded by a later bind() call`), also when the later bind then fails to load, and a bind still loading when the instance is destroyed rejects the same way (`instance destroyed during bind()`) instead of applying an image to a dead instance. `bindFile()` with something that is not a File or Blob (such as the `undefined` of an empty file input) rejects with a `TypeError` without superseding a bind that is still loading.
- Error messages from failed image loads no longer embed the whole data URL.
- The preview image is requested in the same CORS mode as the image `result()` crops, so the browser can reuse the image it already loaded when the response is cacheable, instead of requesting the URL again in another mode.
- `result()` rejects a custom `size` whose width or height is not a positive finite number with a `RangeError` (`NaN` gave a 0-wide canvas and a misleading encoding error), and rounds a fractional custom size to whole pixels.
- `result()` frees the canvas of a `'blob'` or `'base64'` result as soon as it is encoded instead of leaving its memory to garbage collection (iOS caps canvas memory).
- Dragging tracks the pointer that started it: moves from other pointers are ignored, `lostpointercapture` ends the drag, a new press of the same pointer after a lost `pointerup` starts a fresh drag (so does the first finger of a new touch, also after a mouse drag whose `pointerup` was lost), and pointer capture is guarded so dragging still works where it is missing or throws.
- Dragging moves the image from where it currently is, so a zoom (wheel, pinch, slider, `setZoom()`), `rotate()` or `reset()` made while the button is held is no longer undone by the next pointer move, and moving back after dragging against an edge moves the image straight away.
- Dragging inside a CSS-scaled ancestor (`transform: scale()`, `zoom`) keeps the image under the pointer instead of lagging behind or overshooting it, as wheel and pinch zoom already did.
- Pinch zoom only counts fingers that went down on the cropper: a finger resting elsewhere on the page (a thumb, the zoom slider, another cropper) no longer turns a one-finger pan into pan plus zoom, and no longer blocks a two-finger pinch.
- A `bind()`, `bindFile()`, `reset()` or `setZoom()` that lands during a pinch is no longer overwritten by the next finger move; the pinch carries on from the new zoom.
- A third finger that lands and lifts during a pinch no longer stops the two fingers still down from zooming.
- The `LICENSE` file now has the standard MIT header, so GitHub detects the license.

### Internal

- Integration suites for `bind`, `zoom` and `result` (65 tests) are no longer skipped; the image and canvas mocks resolve fixture dimensions and a 2D context, `src/canvas/draw.ts` is covered, and tests are formatted, linted and type-checked.
- Tests pin `result()`'s quality, circle and `backgroundColor` handling, `loadImage()`'s `crossOrigin` for remote URLs, and the re-clamp after `rotate()`.
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
