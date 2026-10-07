# Lean cropper experiment

Run this from the repository root with the existing frozen dependencies:

```sh
export PATH=/tmp/croppie-performance-2026-10-06/tools:$PATH
bun experiments/lean-cropper/build.ts
bun experiments/lean-cropper/serve.ts
```

Open **http://127.0.0.1:4197/experiments/lean-cropper/dist/**. `LEAN_PORT` can choose another unused port; this experiment never uses the production test server on 4173. The default sample is original SVG artwork; the file input accepts browser-decodable images. There are no network fonts, frameworks, runtime packages, workers, or WASM.

This is an API/design experiment from baseline `76540ff3ec7f95b6adae2615f630e80cbc33c523`, not a Croppie-compatible release. The complete demo is **8,099 gzip9 bytes**, including its HTML, controls, two stylesheets, and sample image. The widget, exporter, and required widget CSS alone are **4,627 gzip9 bytes**. They do not include the demo's file/rotation/flip/aspect/export control panel. See [the report](../reports/lean-redesign.md) for exact accounting, measured quality failures, and browser evidence.

## Typed source API

```ts
import { LeanCropper, type CropState } from './src/core';
import { toCanvas, toBlob } from './src/export';
import './src/core.css';

// Give the host an explicit, nonzero width and height.
const cropper = new LeanCropper(host, {
  aspect: 4 / 3, // null (the default) allows independent width/height
  onChange(state) { /* detached snapshot; synchronous */ },
});

await cropper.load(file); // Blob/File, or a URL fetched with normal CORS rules
cropper.pan(20, -10); // stage CSS pixels
cropper.zoom(1.2, { x: 150, y: 90 }); // factor; stage-space anchor
cropper.rotate(37.25); // clockwise delta, around current crop center
cropper.flip('horizontal'); // screen-axis reflection, around crop center
cropper.flip('vertical');
cropper.setAspect(null);
cropper.setViewport({ x: 80, y: 60, width: 320, height: 240 });

const saved: CropState = cropper.getState();
cropper.setState(JSON.parse(JSON.stringify(saved)));
const canvas = toCanvas(cropper, { width: 1200 }); // caller owns this canvas
const blob = await toBlob(cropper, {
  width: 1200, type: 'image/jpeg', quality: .9, background: '#fff',
});
cropper.reset(); // reset image/crop, retaining the current aspect choice
cropper.destroy(); // idempotent; removes owned DOM/listeners/observer/object URL
```

`src/export.ts` imports only **types** from the core. Loading `core.js` never loads export code. `export.js` is independently importable and accepts an object exposing `getState()` and `getSource()`. The demo bundles both once in `demo.js`; do not additionally load the standalone core/export builds into that page.

The source files are TypeScript; generated JavaScript is ESM. This experiment does not publish a package or declaration bundle. Import the TS source for static types.

## State contract

```ts
interface CropState {
  version: 1;
  image: { width: number; height: number };
  stage: { width: number; height: number };
  transform: [number, number, number, number, number, number];
  viewport: { x: number; y: number; width: number; height: number };
  aspect: number | null;
}
```

The affine tuple `[a,b,c,d,e,f]` maps **browser-oriented decoded source coordinates** into **stage CSS pixels**:

```text
x' = a*x + c*y + e
y' = b*x + d*y + f
```

CSS uses that exact tuple in `matrix(...)` with a top-left transform origin. Canvas left-composes crop translation and output scaling. No axis-aligned Croppie `points` are claimed to represent a rotated crop. The source-space crop is generally a four-corner polygon obtained by inverse-transforming the viewport corners.

`getState()` and `onChange` return detached copies. `setState()` checks version, image dimensions, finite/invertible geometry, viewport bounds, and aspect consistency. It assumes the caller has loaded the corresponding source; dimensions are not an image identity check. The Blob is deliberately not serialized. If the stage size differs, restore uniformly fits the saved stage into the current stage, preserving the selected source region. `ResizeObserver` uses the same operation; repeated layout changes may leave extra margins. `reset()` refits the current stage.

`setViewport()` clamps the rectangle to the stage, with a nominal 24px minimum. In fixed-aspect mode width drives height; a requested height should set width to `height * aspect`. `setAspect()` centers the new rectangle before clamping. The crop and image are independently movable. Image pan is unrestricted, and zoom clamps the area-equivalent scale to `.001…64`; image coverage is not enforced.

## Original image and orientation

`load()` retains the supplied Blob itself; URL inputs are fetched into a Blob. Its object URL backs the same `HTMLImageElement` in CSS and Canvas. Preview never replaces the source with a smaller raster. Browser orientation handling runs once, before the user transform. There is no EXIF parser, manual orientation matrix, `createImageBitmap` orientation override, data-URL rewriting, or metadata reader in the runtime.

The browser supplies orientation-adjusted natural dimensions ([HTML image specification](https://html.spec.whatwg.org/multipage/embedded-content.html#dom-img-naturalwidth)). `getSource()` exposes the original Blob and a **borrowed** image element for the exporter; consumers must not mutate its `src`, dimensions, or styling. A failed or superseded load keeps the previous good image. Destroy or a newer load aborts fetches and prevents stale decoded images from installing. Browser image decoding itself is not cancelable here.

Canvas encoding does not preserve source EXIF, ICC, or other metadata. PNG defaults to transparent gaps; use `background` to flatten them. A single provided width or height preserves crop aspect after rounding; providing both deliberately stretches to that output rectangle. Output is limited to 8,192 pixels per side and 16,777,216 total pixels; that is a guard, not a mobile-memory guarantee. `toCanvas()` leaves its result alive. `toBlob()` zeroes its private scratch canvas only after encoding completes (or throws).

## Reproduce verification

The build was measured with Bun 1.4.2 and Node 24.16.0 (`zlib` 1.3.1-e00f703). Existing root Playwright is 1.63.0; fixture/reference generation uses Python 3 and Pillow 10.4.0. If dependencies need installing on a fresh checkout, use the existing lockfile with `bun install --frozen-lockfile`; do not update it.

```sh
export PATH=/tmp/croppie-performance-2026-10-06/tools:$PATH
node_modules/.bin/tsc -p experiments/lean-cropper/tsconfig.json
bun experiments/lean-cropper/build.ts
python3 experiments/lean-cropper/checks/make-fixtures.py
bun experiments/lean-cropper/checks/model.check.ts
node experiments/lean-cropper/checks/browser.check.mjs
python3 experiments/lean-cropper/checks/quality.py
```

The browser script starts and stops its own server on 4197, and fails if the port is occupied. Stop a manually started demo first. `LEAN_BROWSERS=chromium` selects a shorter diagnostic run; the recorded evidence uses Chromium, Firefox, and WebKit. Browser checks use `.check.mjs`, so root `bun test` does not accidentally run them. All generated assets, fixtures, screenshots, and traces remain under this directory and are ignored by Git. [Recorded evidence](recorded/verification.json) and selected screenshots are committed separately from the generated directories.

The browser checks cover real mouse pan/wheel, keyboard crop controls, a real Chromium multi-touch pinch/cancel, arbitrary angles with horizontal/vertical flips, stage resize and serialized-state restore, EXIF 1–8 against independently oriented Pillow references, original-resolution detail, real 1600px/5120px JPEG load and PNG/JPEG output, transparency, concurrent/failed loads, reset/destroy, scratch cleanup, and mobile layout. Synthetic event support is not a substitute for physical phone testing; Firefox/WebKit multi-touch was not tested.

## Limits that matter

1. **Quality:** one native Canvas sampling pass is visibly worse than progressive downsampling for the tested 5120px→320px photo, especially in WebKit and Firefox. `imageSmoothingQuality='high'` does not establish quality parity. No worker/WASM or production resampler is included.
2. **Geometry/UI:** no image coverage constraint, automatic rotation compensation, undo/redo, circular mask, snap lines, or legacy Croppie events/options/points. Corner handles can overlap on very small crops; labeled width/height fields remain available. Source-space shear is accepted by the affine state, but there is no shear control.
3. **Lifecycle/memory:** requires a visible, sized host for initial load; no background decoder cancellation, tiled export, file-size cap, explicit decode-memory budget, or resource-use benchmark. Demo download URLs are reclaimed on replacement/unload. Back-forward cache handling is coded but not specifically tested. Simultaneous demo exports/file changes have no transactional UI policy.
4. **Accessibility:** native labels/buttons, keyboard pan/zoom/crop, focus indicators, and a status region exist. No assistive-technology audit, high-contrast audit, localization, or touch-target certification; screen-reader instructions and announcements need production design.
5. **Browsers/formats:** tested desktop Playwright builds at device scale 1, including a 390px layout. No real Safari/iOS/Android testing, old-browser fallbacks, HEIC/RAW guarantees, animated-frame policy, HDR/wide-gamut guarantees, or support for rotated/skewed ancestor CSS transforms. Decode/resample/color behavior remains browser-dependent.

All runtime code and sample SVG were authored for this experiment; no third-party implementation was copied. Existing `docs/images/garden-*.jpg` assets are only referenced by tests. Root repository licensing continues to apply.
