# Hybrid cropper experiment

A small, browser-native cropper with arbitrary-angle rotation, flips, fill/free coverage, responsive crop resizing, circle/ellipse masks, saved state, and progressive Canvas export. This is an experimental interface; the published Croppie API is unchanged.

| Browser assets | gzip9 bytes |
| --- | ---: |
| Widget, quality exporter, required CSS | **6,188** |
| With optional JPEG EXIF reporting | **6,785** |
| Complete demo: controls, HTML, styles and sample SVG | **10,232** |

Measured with Bun 1.4.2 and Node 24.16.0, summing separately compressed responses. No workers, WASM, runtime dependencies, fetched fonts, or source maps are required. `build.ts` writes a fresh size report to ignored `dist/sizes.json`.

## Run

From the repository root, use the Bun version in `.bun-version`:

```sh
bun install --frozen-lockfile
bun experiments/lean-cropper/build.ts
bun experiments/lean-cropper/serve.ts
```

Open **http://127.0.0.1:4197/experiments/lean-cropper/dist/**. Set `LEAN_PORT` to use another port. The local server serves only built assets and the allowlisted test resources.

Choose **Circle** in the demo to select and lock Square automatically. **Ellipse** keeps the aspect ratio editable. Browser shortcuts pass through; ordinary arrow keys pan, +/− zoom, and focused crop handles move/resize with arrows. Shift uses 10-pixel steps.

## Interface

```ts
import { LeanCropper } from './src/core';
import { toBlob, toCanvas } from './src/export';
import './src/core.css';

const cropper = new LeanCropper(host, {
  aspect: 1, coverage: 'fill', mask: 'circle',
  onChange(state) { /* detached snapshot after a synchronous update */ },
});
await cropper.load(file); // Blob/File or a URL fetched with normal CORS rules
cropper.rotate(37.25);   // clockwise delta around the crop center
cropper.flip('horizontal');
cropper.zoom(1.2, { x: 150, y: 90 });
cropper.pan(20, -10);
cropper.setViewport({ x: 80, y: 60, width: 240, height: 240 });
const saved = cropper.getState();
cropper.setState(JSON.parse(JSON.stringify(saved)));
const blob = await toBlob(cropper, { width: 512 }); // PNG by default
const canvas = toCanvas(cropper, { width: 512 }); // caller owns this canvas
cropper.reset();
cropper.destroy();
```

`setAspect(number | null)`, `setCoverage('fill' | 'free')`, and `setMask('rect' | 'circle')` change the crop policy. At this lower level, `circle` means the ellipse inscribed in the viewport; aspect 1 makes it circular. The host must have visible, nonzero dimensions before loading.

Optional JPEG tag reporting reuses the production parser. Import `readBlobOrientation(file)` or `readJpegOrientation(bytes)` from `./src/exif`. Native decoding handles visual orientation once; the helpers only report the tag and are absent from core/export/demo bundles.

## Contracts

- **State:** version 1 contains oriented image/stage dimensions, a six-number source-to-stage affine transform, viewport, aspect, and optional mask. Missing masks restore as rectangle. Dimensions check basic compatibility, not image identity. Original image data is not serialized.
- **Coverage:** fill inverse-projects crop corners and constrains zoom/pan, including rotation and reflection. Free permits transparent edges. Coverage is instance policy, so restored state obeys the current policy. Resize/restore uniformly fit the saved stage; reset retains aspect/mask. New images use the constructor aspect and retain mask/coverage.
- **Export:** source-region progressive downsampling uses the original image. One output dimension preserves aspect; two differing-aspect dimensions contain-fit with transparent/background bars. Positive finite sizes are validated, rounded and capped proportionally to 16,384 per side / 16,777,216 pixels. JPEG/background/quality options are supported.
- **Lifetime:** failed or superseded loads preserve the previous good image; destroy prevents stale installation. Object URLs and listeners are cleaned up. `getSource()` exposes a borrowed image and original Blob; do not mutate them. Returned canvases stay alive. Private Blob-output canvases are cleared after encoding; intermediate canvases are left to collection because early resets changed WebKit output.
- **Events:** state, DOM and `onChange` update synchronously. Snapshots are detached. Invalid derived geometry rejects before installation. Callback exceptions propagate after the state has committed; they do not roll it back.

## Verify

Checks need the installed Playwright browsers and Python 3 with Pillow. Build first; every browser runner owns its server. Choose ports different from any open manual demo.

```sh
node_modules/.bin/tsc -p experiments/lean-cropper/tsconfig.json
bun experiments/lean-cropper/checks/model.check.ts
bun experiments/lean-cropper/checks/coverage.check.ts
node experiments/lean-cropper/checks/export.check.mjs
node experiments/lean-cropper/checks/server.check.mjs
python3 experiments/lean-cropper/checks/make-fixtures.py
LEAN_PORT=42972 LEAN_EVIDENCE=.cache/hybrid/common node experiments/lean-cropper/checks/browser.check.mjs
LEAN_EVIDENCE=.cache/hybrid/common python3 experiments/lean-cropper/checks/quality.py
LEAN_PORT=42971 node experiments/lean-cropper/checks/hybrid.check.mjs
```

`LEAN_BROWSERS=chromium` narrows coverage/common/hybrid checks; `HYBRID_EXPORT_BROWSERS` narrows exporter checks. Fixtures, bundles and generated evidence are ignored. `production-export.js` is a test oracle and is not requested by the demo.

Validation covers independent geometry checks, 20,000 initialization cases, real gestures, lifecycle races, EXIF 1–8, Circle behavior, server isolation, and image-quality comparisons in Chromium, Firefox and WebKit. Full-photo 5120px and 48MP exports match the actual production renderer within each browser. The 48MP fixture is a resized repository photograph, not original camera detail.

## Limits and research

There is no legacy Croppie adapter, undo/snapping, published package entry, metadata/profile preservation, tiled output, or total decode-memory budget. Strong imported shear/nonuniform scale can alias. Chromium single-pass export is sharper on some photos; quality validation covers the uniform scale/rotation/reflection produced by the controls. Physical phones, assistive technology, high contrast, and rotated/skewed ancestors remain unvalidated.

The [research archive](https://github.com/bayinformatics/croppie/tree/bf2183b59937217c971442441d9aad09f2357934/experiments) preserves the full reports, raw measurements, screenshots, and rejected approaches. This branch contains the implementation and reproducible checks. Runtime code, sample SVG, and fixture logic were authored in this repository; production resampling/EXIF behavior is reused under its license.
