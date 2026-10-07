# Parent validation: cropper size and performance

The compatible production candidate is **9,020 bytes gzip**, down from **9,559 bytes**: **539 bytes / 5.64% smaller**, including CSS. It avoids unnecessary crop-state calculations and repeated slider writes without changing image export. The isolated affine prototype is **4,627 bytes** for its widget, exporter, and required CSS, but it has documented quality and behavior gaps; its complete demonstration is **8,099 bytes**.

The parent independently checked worker changes, rejected two apparently safe optimizations, reproduced the prototype checks, and ran alternating browser measurements. The original baseline is `76540ff3ec7f95b6adae2615f630e80cbc33c523`; the integrated production source is `fa6df92`. Later commits add experiments and evidence only.

## Accepted production changes

| Artifact | Baseline gzip9 | Final gzip9 | Change |
| --- | ---: | ---: | ---: |
| JavaScript | 8,205 | 8,180 | −25 bytes |
| Required CSS | 1,354 | 840 | −514 bytes |
| **Combined** | **9,559** | **9,020** | **−539 bytes** |

CSS now goes through Bun's minifier for both npm and the documentation demo. Constructor-only DOM references stay local, and two pure helpers are module-local. Update snapshots are calculated only when an update subscriber exists. Slider values and spoken percentages are written only when the DOM value differs; changed values and repaired values remain synchronous.

Public methods, types, exports, features, EXIF reporting, input handling, event ordering, proxy receivers, crop coordinates, and output algorithms are preserved in the tested cases. No runtime dependency was added. The new experimental API is separate and is not exported by the production package.

Measurements use Bun **1.4.2**, Node **24.16.0**, and gzip level 9. Each served resource is compressed separately. Emitted JavaScript debug/source-map comments are included; maps and declarations are excluded. The earlier Bun 1.2.15 research measurements are not the release baseline. Exact artifact hashes and all parent summaries are in [parent-validation.json](parent-validation.json).

## What the parent verified

1. **Production checks:** 878 unit/integration tests, lint, type checking, production and documentation builds, package checks, and all seven existing Chromium visual tests pass. Screenshots were not updated. The npm publish dry-run independently reproduces the pre-existing `You cannot publish over the previously published versions: 3.2.0.` error; nothing was published or version-bumped.
2. **Browser correctness:** Chromium 153.0.8010.12, Firefox 155.0, and Playwright WebKit 26.6 pass all eight EXIF orientations, mirrored images, rotation/state round-trips, circle transparency, proxy method calls, superseded/destroyed binds, and 20 replacements with correct object-URL cleanup. Fourteen output hashes per engine match baseline, including 12MP/48MP JPEG and transparent PNG exports at 256 and 2048 pixels.
3. **Additional output checks:** the parent independently reran the focused runtime helper. Sixteen rotated/circular/fractional/letterboxed RGBA hashes, decoded encoded-output hashes, encoded lengths, and draw sequences match baseline within each engine.
4. **Prototype checks:** an independent build reproduces the 4,627-byte widget subtotal and 8,099-byte complete demo. Strict types, 4,969 model assertions, 40 browser scenarios, and 63 pixel comparisons pass. These establish the documented geometry/lifecycle behavior and bounded edge-interpolation agreement, not production quality parity. The parent also reran the photo-quality comparison and visually inspected the resulting aliasing.
5. **Lifecycle accounting:** all four Orca dispatches have explicit outcomes, committed artifacts, and released worker terminals. The original three tasks cover size, runtime, and redesign; the conditional follow-up tests worker export because the parent found substantial blocking on large photos. Their branches and reports remain available.

### Runtime results: less work, no established photo-export speedup

The large-image comparison uses three alternating batches per engine, five warmups and twenty measured runs per image/variant/batch. That is **1,080 measured iterations**, plus warmups, across three images, two builds, and three engines. Each iteration measures image binding, preview readiness, ten frames of synthetic wheel bursts, avatar export, larger export, and a scheduled timer's delay during export. Both builds use identical settings and independently hashed fixtures.

The 12MP and 48MP JPEG workloads are repeatable rescaled versions of the repository garden photograph, not original camera captures. The PNG has transparency. Input fetching and fixture generation are outside measured operations. First-run samples and module-load times are retained in the local raw report; these are fresh-page observations on a warm machine, not cold-device/network measurements.

Representative **48MP medians**, baseline → candidate:

| Engine | Preview ready | 256px JPEG export | 2048px JPEG export |
| --- | ---: | ---: | ---: |
| Chromium | 118.5 → 118.3 ms | 154.9 → 154.9 ms | 64.8 → 65.5 ms |
| Firefox | 117 → 117 ms | 19 → 19 ms | 34 → 35 ms |
| WebKit | 222 → 219 ms | 112 → 111 ms | 31 → 31 ms |

Within-engine frame/export changes are generally within baseline batch variation or timer resolution. Some values worsen; those observations remain in the JSON. A 6→5 ms Firefox result is one timer unit, despite looking like a large percentage. There is **no claimed overall frame-rate, export-speed, or resident-memory improvement**. The expensive output algorithm was deliberately retained.

The parent separately reran the focused synchronous workload, baseline/candidate/candidate/baseline, with 1,000 warmup operations and seven samples of 3,000 operations per page. Without subscribers, small `setZoom()` calls measured **5.0→2.9 ms** in Chromium, **9→5 ms** in Firefox, and **5→3 ms** in WebKit. These are tight-loop processing measurements, not user interaction latency. More directly, 1,000 small changes produce **0 unused `get()` calls and 0 unchanged `aria-valuetext` writes**, versus 1,000 of each at baseline. Subscribed events still receive their required snapshots.

No workers were running CPU-heavy checks during the parent timing runs. This does not make the workstation a controlled laboratory: OS activity, graphics caches, garbage collection, and timer quantization remain. Physical iPhone/Android behavior and native/GPU memory were not measured.

### Conditional worker-export follow-up

The [OffscreenCanvas experiment](offscreen-export.md) reuses the complete production drawing algorithm, with guarded substitutions for canvas creation and ImageBitmap dimensions. It compares native export, bitmap transfer from an already decoded image, and Blob decoding inside a worker. It preserves progressive downsampling. The parent independently reran the complete strict correctness matrix:

| Engine | Exact native/worker comparisons | Failed comparisons |
| --- | ---: | ---: |
| Chromium | 44 / 144 | 100 |
| Firefox | 144 / 144 | 0 |
| WebKit | 64 / 144 | 80 |

All independent EXIF orientation/dimension checks pass; the mismatch is not treated as an orientation workaround. Fractional, circular, transparent and rotated cases expose rendering differences. The experiment's expected exit code is 1 because its equality gate fails. It remains outside production.

A short independent Chromium timing repeat used two warmups and three samples per variant/workload (60 measured exports). For the **reused-source 48MP→256 PNG** case, native export took a median **36.5 ms** with a **34.5 ms** maximum timer gap; the reused Blob worker took **220.7 ms** with a **5.8 ms** gap. This corroborates the worker's larger run: responsiveness can improve while completion becomes slower. This isolated PNG workload differs from the earlier JPEG/gesture/lifecycle profile; their absolute times are not before/after comparisons.

The worker and loader add **1,936 gzip bytes**. With the parent's minified CSS and accepted native build, the measured combined assets total **10,956 bytes** (9,020 + 1,936), before any unimplemented production lifecycle/fallback integration. The parent aligned the experiment's CSS accounting with the integrated build; the worker's historical 11,528-byte snapshot used its own unminified-CSS worktree. Raw recorded history was preserved.

The reused workers retain their realm, not a decoded image. Worker-side source retention, cancellation and production fallback policies were not built or sized. These results reject the tested transparent replacement; they do not establish that every possible worker architecture is slower or unsuitable.

## Assumptions the experiments rejected

| Assumption | Independent evidence | Decision |
| --- | --- | --- |
| Native-private fields are a free internal size reduction | Saves 293 JS gzip bytes, but `new Proxy(cropper, {}).get()` throws in the browser; the baseline works. Existing 870 tests and matching public declarations missed it. | Excluded; regression coverage added. |
| Consumed intermediate canvases can immediately be zeroed without changing output | WebKit's 48MP→256 output changed in 63,518 of 65,536 pixels, max channel difference 43, RGBA RMSE 5.00. A later cleanup strategy also failed fractional/rotated cases. | Both strategies excluded; original downsampling retained. |
| Native high-quality Canvas sampling makes a tiny exporter quality-equivalent | Prototype WebKit single-pass downsampling visibly aliases fine detail. Against the chosen Pillow Lanczos reference, mean RGB error is 10.04, versus 0.44 for progressive native sampling on the same photo. | Prototype stays experimental. This is a test-image comparison, not universal resampler certification. |
| DOMMatrix substantially shrinks the affine implementation | Only two gzip bytes saved in the actual prototype demo bundle, despite a larger standalone-helper saving. | Keep readable tuple math; no runtime performance claim. |
| A sub-5KB widget proves a complete production editor fits the budget | Widget/export/CSS is 4,627 bytes; full demo is 8,099. Coverage constraints, production resampling, circle masking, metadata reporting and compatibility work remain absent. | Report both totals and gaps; no replacement claim. |

Detailed worker evidence: [size](bundle-size.md), [runtime](runtime-performance.md), and [redesign](lean-redesign.md). Failed canvas experiments remain isolated as reproducible patches; they were not integrated into production.

## Reproduction and artifacts

Use the repository-pinned Bun and frozen dependencies. This session provisioned Bun 1.4.2 at `/tmp/croppie-performance-2026-10-06/tools/bun` without changing the global installation. On another machine, provide Bun 1.4.2 through your normal version manager instead of relying on that temporary path.

```sh
export PATH=/tmp/croppie-performance-2026-10-06/tools:$PATH
bun install --frozen-lockfile
bun run build
node scripts/measure-bundle.mjs
python3 tests/performance/fixtures.py
OUTPUT=.cache/performance/final-comparison.json \
  node tests/performance/compare.mjs \
  baseline=.cache/performance/baseline candidate=dist
```

The baseline directory contains `croppie.js` and `croppie.css` built from the baseline commit with the same toolchain. For a fresh reproduction, build that commit in a separate checkout and preserve those two artifacts there first. The parent harness creates its own ephemeral server and never reuses another worktree's port 4173. `VERIFY_ONLY=1` selects correctness-only checks. `CAPTURE=1` writes diagnostic PNGs. `BROWSERS`, `BATCHES`, `WARMUPS`, `RUNS`, and `OUTPUT` customize a documented diagnostic run; final evidence used the defaults.

Full raw samples and baseline/candidate artifacts remain locally in `.cache/performance/`; compact durable summaries and hashes are committed in [parent-validation.json](parent-validation.json). The [prototype README](../lean-cropper/README.md) includes its typed API, independent check commands, limitations, and local demo instructions. Experimental files are excluded from the published package by the existing `files` allowlist. No branch was pushed and no package was published.
