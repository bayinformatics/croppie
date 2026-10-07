# Lean affine cropper experiment

The working browser-native prototype is committed as **`520fbaafe358bcb233a08c22b961d0b88e2ef4eb`**, based on `76540ff3ec7f95b6adae2615f630e80cbc33c523`. It implements image loading, pan, anchored wheel and two-pointer pinch zoom, arbitrary-angle rotation, screen-axis horizontal/vertical flips, movable/resizable fixed/free-aspect crop rectangles, state restore, reset/destroy, and Canvas/Blob export. Its code and tests stay under `experiments/lean-cropper/`; production code, root configuration, production tests, and other workers' files were not changed.

**The complete demo costs 8,099 bytes gzip9, not 5 KB.** That includes the control panel, HTML, both stylesheets, exporter, and sample image. The embeddable widget/exporter/required-CSS subtotal is 4,627 bytes gzip9, but it is not the complete demonstrated product. The redesigned geometry works; production-quality parity does not: large single-pass downsampling is materially worse in WebKit and Firefox, and image coverage safeguards are absent.

[Open the API and run instructions](../lean-cropper/README.md) · [Recorded machine-readable evidence](../lean-cropper/recorded/verification.json) · [Desktop screenshot](../lean-cropper/recorded/demo-desktop.png) · [Mobile screenshot](../lean-cropper/recorded/demo-mobile.png)

## Reproduce

From the repository root, using the existing frozen dependency installation:

```sh
export PATH=/tmp/croppie-performance-2026-10-06/tools:$PATH
bun experiments/lean-cropper/build.ts
bun experiments/lean-cropper/serve.ts
```

Open `http://127.0.0.1:4197/experiments/lean-cropper/dist/`. The server binds localhost, does not reuse an existing server, and never uses port 4173. `LEAN_PORT` selects another unused port. Stop this manual server before the automated browser checks, which own their server lifecycle.

```sh
export PATH=/tmp/croppie-performance-2026-10-06/tools:$PATH
node_modules/.bin/tsc -p experiments/lean-cropper/tsconfig.json
python3 experiments/lean-cropper/checks/make-fixtures.py
bun experiments/lean-cropper/checks/model.check.ts
node experiments/lean-cropper/checks/browser.check.mjs
python3 experiments/lean-cropper/checks/quality.py
```

Build first. No dependency update is needed; a fresh installation must use `bun install --frozen-lockfile`. Tests use the existing Playwright 1.63.0 and Pillow 10.4.0 environment. The `.check.mjs`/`.check.ts` names keep browser-only checks out of root Bun test discovery. Generated fixtures, build outputs, and screenshots live only under this experiment and are ignored by Git. `checks/record.mjs` can refresh the committed evidence after a complete run.

## Model and component boundaries

The [typed core](../lean-cropper/src/core.ts) stores a versioned state containing oriented image dimensions, stage dimensions, a six-number affine tuple, the viewport rectangle, and its aspect constraint. The tuple maps source coordinates to stage CSS pixels. For `[a,b,c,d,e,f]`, `x' = a*x + c*y + e`, `y' = b*x + d*y + f`. Rotations, flips, and zoom left-compose around a stage-space anchor; pan adds translation. Pinch uses the old midpoint as the zoom anchor and adds the midpoint's translation, avoiding the common drift when both fingers move.

The image element's CSS transform is that exact matrix with a top-left origin. [Canvas export](../lean-cropper/src/export.ts) uses the same image and matrix, followed by crop translation and output scaling. For output scales `sx` and `sy`, Canvas receives `[sx*a, sy*b, sx*c, sy*d, sx*(e-v.x), sy*(f-v.y)]`. No rotated-image bounding-box approximation or Croppie-style axis-aligned `points` are used. A rotated crop corresponds to four inverse-transformed corners in source space.

`getState()`/`onChange` return detached values. `setState()` validates version, dimensions, invertibility, finite numbers, crop bounds, and aspect; it expects the caller to load the same source, with dimensions serving only as a basic check. Restoring onto a different stage uniformly fits the saved stage and preserves the selected source region. Responsive resize uses the same operation. It can leave margins after repeated layout changes; reset refits the current stage.

The core imports neither exporter nor metadata code. The exporter has a type-only core import and can be omitted entirely. Its generated ESM has no runtime imports. The demo statically bundles the core, exporter, and control handlers once. A metadata reader was unnecessary: no runtime EXIF parser, worker, WASM, decoder library, or loader is shipped. TS source supplies types; the experiment does not publish a package or generate a declaration bundle.

`load(Blob)` retains the actual original Blob. URL loads fetch a Blob under normal CORS rules. The resulting object URL is used by the same native image in both preview and export; there is no intermediate preview raster. Browser natural dimensions account for orientation ([HTML specification](https://html.spec.whatwg.org/multipage/embedded-content.html#dom-img-naturalwidth)), and the image explicitly uses `image-orientation: from-image`. There is no second EXIF transform. All eight EXIF orientations were checked against Pillow's independently oriented output, not against another use of the cropper's own math.

## Exact size accounting

Measured with **Bun 1.4.2**, **Node v24.16.0**, and **zlib 1.3.1-e00f703** on macOS arm64. JS and CSS use the pinned Bun build/minify path. HTML and SVG are copied without a special markup minifier. `measure.mjs` uses Node `gzipSync(bytes, {level: 9})`; totals are sums of separately compressed response bodies. Source maps are neither generated nor included. The recorded JSON contains the SHA-256 of each measured artifact.

Complete running demo (no standalone-library double counting):

| Response/component | Raw bytes | gzip9 bytes |
| --- | ---: | ---: |
| `demo.js` — core, gestures, exporter, control handlers | 12,392 | 4,711 |
| `core.css` — required preview/crop/handle styling | 1,363 | 579 |
| `demo.css` — control panel and responsive page styling | 2,752 | 1,153 |
| `index.html` — labeled inputs/buttons, instructions, page | 2,812 | 1,237 |
| `sample.svg` — original default artwork | 806 | 419 |
| **Complete demo total** | **20,125** | **8,099** |
| **Complete demo excluding only sample content** | **19,319** | **7,680** |

Independently importable embedding artifacts:

| Component | Raw bytes | gzip9 bytes |
| --- | ---: | ---: |
| `core.js` — state, image loading, DOM crop handles, gestures, lifecycle | 9,258 | 3,479 |
| `export.js` — Canvas/Blob export, cap and scratch cleanup | 922 | 569 |
| `core.css` — required styling | 1,363 | 579 |
| **Widget + exporter + required CSS** | **11,543** | **4,627** |

There are **0 bytes** of additional metadata readers, worker scripts, WASM, runtime loaders, runtime dependencies, or fetched fonts. Tooling, test-only fixtures/reference images, and recorded evidence are not requested by the demo and are excluded from browser payload. Bundling `core.js` separately alongside `demo.js` would be redundant and is not the demonstrated loading graph.

The parent-reported baseline production library was 9,559 gzip9 bytes (8,205 JS + 1,354 CSS, maps excluded). That figure is a contextual library measurement, **not a feature-equivalent speed/size comparison** with this experiment. The prototype omits production safeguards and quality work, and the complete standalone demo has a different UI envelope. No production reduction percentage is claimed here.

### DOMMatrix measured instead of assumed

[A native DOMMatrix variant](../lean-cropper/bench/dom-affine.ts) implements the same operations and is swapped into the actual core/demo build by a build-only plugin. Both variants were exercised in all three browsers and produced matching transforms within `1e-6`.

| Build | Tuple arithmetic raw / gzip9 | DOMMatrix raw / gzip9 |
| --- | ---: | ---: |
| Standalone affine helpers | 446 / 267 | 429 / 223 |
| Full core | 9,258 / 3,479 | 9,301 / 3,476 |
| Full demo JS | 12,392 / 4,711 | 12,435 / 4,709 |

DOMMatrix saves 44 compressed bytes in the isolated helper but only **2 bytes in the actual demo bundle**. There is no meaningful payload reason to choose it here. The numeric implementation remains because it also runs unchanged in the DOM-free model checks. Runtime throughput/allocation differences were not benchmarked or claimed.

## Verification evidence

Recorded at `2026-10-07T02:45:07.895Z` (October 6 local time), on macOS arm64:

| Browser engine | Playwright-reported version | Functional scenario groups | Pixel comparisons |
| --- | --- | ---: | ---: |
| Chromium | 153.0.8010.12 | 14 | 21 |
| Firefox | 155.0 | 13 | 21 |
| WebKit | 26.6 | 13 | 21 |
| **Total** | | **40 passed** | **63 passed** |

Strict TypeScript checking passes. The DOM-free model check passes **4,969 assertions**, including **400 seeded arbitrary transforms** and **60 crop-resize combinations**. Browser groups cover:

1. Serialized transform/viewport state round-trip after rotation, reflection, pan, and crop resize; detached copies; invalid-state rejection; responsive reframe and restore.
2. Real mouse pan, anchored wheel zoom, free/fixed crop handles, keyboard pan/resize/move, and real Chromium multi-touch anchored pinch/cancellation. Firefox/WebKit multi-touch was not tested.
3. CSS screenshot vs Canvas output at 37.25°, −28.75° with horizontal reflection, 123.4° with both reflections, and after a stage resize with a 52.3° vertical reflection.
4. EXIF 1–8 preview/export/reference agreement; a 2400×1600 detail image displayed at one tenth scale and exported at original size; real 1600px/5120px JPEG loading plus PNG/JPEG export.
5. Failed/superseded loads, reset, destroy during load, idempotent destroy, invalid export sizes, transparent/flattened empty areas, live returned canvases, released Blob scratch canvases, and desktop/390px mobile demo interactions. No page errors occurred.

The 63 pixel comparisons comprise 24 independent EXIF/Pillow checks, 24 corresponding CSS/Canvas checks, 12 arbitrary-angle/resize comparisons, and 3 full-resolution detail checks. The detail output is **pixel-identical** to the original fixture in all engines despite the 10× smaller preview. EXIF comparisons have mean absolute RGB error 0 in Chromium/Firefox and 0.0864/255 in WebKit, with no channel error above 20.

CSS preview and high-quality Canvas export do not promise identical interpolation. The initial 4% limit on pixels with >20-channel differences failed the rotated Firefox/WebKit edge cases. Inspection localized all such differences to a two-pixel neighborhood of image edges. The final comparison explicitly tests raw mean error ≤2.5/255, large-difference fraction ≤6%, Gaussian-blurred mean error <0.8/255, and **zero >20 errors outside that edge neighborhood**. Independent EXIF/detail checks retain their stricter thresholds. This establishes bounded geometric agreement, not pixel-identical filtering at every scale.

| Engine | Worst rotated/resize raw mean error (/255) | Worst blurred mean error (/255) | Worst >20-channel pixel fraction |
| --- | ---: | ---: | ---: |
| Chromium | 0.0109 | 0.0109 | 0.0058% |
| Firefox | 1.9542 | 0.6166 | 4.4537% |
| WebKit | 1.9183 | 0.5579 | 5.2593% |

No local exploratory timing is presented as a conclusive performance result. Timing samples are deliberately excluded from the committed evidence; the parent owns isolated baseline/candidate timing validation.

## Measured export quality failure

The exporter sets `imageSmoothingQuality='high'` and draws the original image in one pass. The quality check reduces the existing 5120px-wide garden photo to **320×182** and compares each engine's result with Pillow Lanczos. A separate **test-only** progressive native Canvas reference halves dimensions until the final pass; it is not included in shipped code or claimed as production parity.

| Engine | Direct Canvas mean RGB error | Direct PSNR | Progressive Canvas mean RGB error | Progressive PSNR |
| --- | ---: | ---: | ---: | ---: |
| Chromium | 4.6721 | 31.2887 dB | 3.2217 | 34.9427 dB |
| Firefox | 11.6904 | 22.9034 dB | 3.4483 | 34.5167 dB |
| WebKit | 10.0438 | 24.1809 dB | 0.4401 | 49.9642 dB |

The WebKit single-pass result visibly aliases fine detail. Its measured error is much larger than the progressive native reference; preserving the original source does **not** by itself solve final downsampling quality. This one-photo comparison does not certify a preferred resampler, but it rejects the assumption that the tiny exporter already matches production quality. The demo and API documentation disclose the gap.

![WebKit comparison: Pillow Lanczos on the left, direct native export in the middle, progressive native Canvas on the right](../lean-cropper/recorded/webkit-downsample-comparison.png)

## Boundaries and attribution

1. **Geometry/compatibility:** unrestricted image pan and independent crop movement; no enforced coverage/minimum zoom, rotation coverage compensation, circular mask, snapping, undo history, or legacy Croppie API/events. State describes matrix + viewport, not legacy points. No production replacement recommendation.
2. **Quality/formats:** no progressive resampler, metadata preservation, HDR/ICC/wide-gamut guarantee, HEIC/RAW fallback, or animated-frame policy. Empty PNG regions are transparent unless flattened. Native encoder format fallback remains browser behavior. Explicitly supplying both output dimensions can stretch the crop.
3. **Lifecycle/resources:** fetch cancellation, stale-load protection, URL cleanup, ResizeObserver cleanup, reset, and destroy are implemented. Decoding itself is not cancelable; there is no input-byte budget, decode-memory budget, tiled export, or memory benchmark. Output caps are 8,192 per side and **16,777,216 total pixels**, not a Safari/iOS memory-safety guarantee. Returned canvases remain alive; private Blob canvases are zeroed after encoding. Demo concurrent exports/file changes and BFCache restoration are not comprehensively tested. Consumer callbacks must not throw or mutate the borrowed source element.
4. **Accessibility/browser support:** native labels/buttons, focus indicators, status text, keyboard input, and responsive layout work in the tested flows. No screen-reader, high-contrast, localization, or physical-touch-device audit. Very small crops can overlap handle targets. Initial load needs a visible sized host. Tests use desktop Playwright at device scale 1; real Safari/iOS/Android, old browsers, and rotated/skewed ancestor CSS transforms remain unvalidated.
5. **Authorship/scope:** all prototype implementation, sample SVG, and fixture-generation logic were newly authored; no third-party implementation was copied. Existing repository garden JPEGs are read only by tests and are not shipped with the demo. Playwright, Pillow, Bun, and Node are build/test tools, not browser runtime dependencies. Root repository licensing applies. No production files, root build/package configuration, parent measurements, or other worker reports changed.

The experiment demonstrates a small, coherent affine API and original-source export path. It does not demonstrate a full, production-quality cropper under 5 KB gzip; the recorded payload and quality failures remain part of the result.
