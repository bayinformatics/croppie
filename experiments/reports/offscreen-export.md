# OffscreenCanvas export experiment — rejected for general integration

**Keep this experiment isolated.** Exact decoded-pixel equality fails in Chromium and
WebKit even though the complete production crop/downsample algorithm is retained.
Firefox passes the tested cases, but its result does not satisfy the three-engine gate.
The recorded timing improvements in some paths do not override these failures.

Measured October 6, 2026 (America/Denver), October 7 UTC, in the coordinator-granted
quiet window. Production source HEAD: `1708e6f854ccdd8b038754292d4e7cb151fb0a7f`.
`src/canvas/draw.ts` is unchanged from baseline
`76540ff3ec7f95b6adae2615f630e80cbc33c523`; SHA-256:
`f7e4c1a5623175d7174c0d05545876d2817d598f44178dbb2990e6ac53e93a85`.
Only `experiments/offscreen-export/**` and this report were added. No production integration.
Experiment and raw evidence commit: `4208c37`.

## Reproduce and inspect

From this worktree root with the existing frozen dependencies:

```sh
# Actual correctness run: exit 1, preserving the negative pixel results.
OFFSCREEN_PHASE=correctness /tmp/croppie-performance-2026-10-06/tools/bun experiments/offscreen-export/run.mjs

# Actual timing run: exit 0; four warmups + ten samples for every variant/workload.
OFFSCREEN_PHASE=timing /tmp/croppie-performance-2026-10-06/tools/bun experiments/offscreen-export/run.mjs

# Build/byte accounting only, without overwriting retained evidence.
OFFSCREEN_PHASE=build OFFSCREEN_OUTPUT=/tmp/croppie-offscreen-build \
  /tmp/croppie-performance-2026-10-06/tools/bun experiments/offscreen-export/run.mjs
```

The default fixture path is
`/Users/matthewstingel/orca/workspaces/croppie/performance-and-size/.cache/performance/images`.
Override it with `OFFSCREEN_FIXTURES=/absolute/path`. Use
`OFFSCREEN_OUTPUT=/tmp/offscreen-repeat` to keep a rerun separate from the recorded JSON.
The runner creates an ephemeral-port loopback server and closes it after the run.
Browser requests outside that origin are rejected; none occurred. The native caller
receives an already decoded local Blob image; the worker loader never fetches an image URL.

| Evidence | Correctness | Timing |
| --- | --- | --- |
| Chromium | [raw cases](../offscreen-export/results/chromium.correctness.json) | [raw warmups, samples and summaries](../offscreen-export/results/chromium.timing.json) |
| Firefox | [raw cases](../offscreen-export/results/firefox.correctness.json) | [raw warmups, samples and summaries](../offscreen-export/results/firefox.timing.json) |
| WebKit | [raw cases](../offscreen-export/results/webkit.correctness.json) | [raw warmups, samples and summaries](../offscreen-export/results/webkit.timing.json) |

[Build manifest](../offscreen-export/results/build.json) records source hashes,
the exact substitutions and every runtime asset's hash/size. The generated adapted
`results/assets/adapted-draw.ts` is inspectable after any build; generated assets are ignored.
The [runner](../offscreen-export/run.mjs), [browser harness](../offscreen-export/harness.mjs),
[loader](../offscreen-export/loader.mjs), and [worker](../offscreen-export/worker.ts)
contain the complete experiment.

## Algorithm and input boundaries

The worker imports production `drawCroppedImage` through a test-only Bun build plugin.
The native reference imports the original source without that plugin. The guarded
substitutions are:

| Original | Worker adaptation | Required occurrences |
| --- | --- | ---: |
| `document.createElement("canvas")` | `new OffscreenCanvas(1, 1)` | 2 |
| `image: HTMLImageElement,` | `image: ImageBitmap,` | 1 |
| `): HTMLCanvasElement {` | `): OffscreenCanvas {` | 1 |
| `image.naturalWidth` | `image.width` | 1 |
| `image.naturalHeight` | `image.height` | 1 |

Everything else in the draw source remains: repeated halving, canvas caps, high-quality
smoothing, intersection, rounding, aspect-preserving bars, rotation, ellipse clipping and
background fill. The worker encodes the result with `convertToBlob({type: "image/png"})`;
native uses production `canvasToBlob(canvas, "png")`. No canvas is zeroed, either during
downsampling or after rendering. The transferred/decoded input bitmap closes only after
encoding finishes. Intermediate canvases are left to the browser's normal lifetime rules.

This is a brittle text adaptation, not a supported abstraction: count guards catch changed
tokens, while the recorded hashes and pixel tests are needed to review semantic source
changes. No parallel alternative geometry implementation or new framework was introduced.

| Variant | Input work included in measured export | Worker lifetime |
| --- | --- | --- |
| Native | Same already decoded HTMLImageElement, draw, PNG encode | None |
| Image cold | `createImageBitmap(element)` on main thread, transferable bitmap dispatch, draw, PNG encode | New worker per export, including ready handshake |
| Image reused | Same bitmap creation/transfer on every export | Reused worker realm; no retained source |
| Blob cold | Clone known local Blob, `createImageBitmap(blob)` inside worker, draw, PNG encode | New worker per export, including ready handshake |
| Blob reused | Same Blob clone/decode on every export | Reused worker realm; no retained source |

Native image decode is outside export timing and separately recorded as `nativeDecodeMs`.
The Blob variants deliberately pay another decode. Cold means a new worker realm, with
the browser process and engine caches already warm; it is not a machine-cold load.

Browsers apply EXIF during decoding. No manual EXIF rotation or mirror operation is added;
user crop rotation remains independent. All eight EXIF orientations, including 2/4/5/7,
passed an independent quadrant-color oracle at full size and after an additional 90°
crop rotation. Their natural dimensions also matched 400×240 (1–4) or 240×400 (5–8).
The color oracle's <10-channel JPEG color tolerance only identifies quadrant labels;
**pixel equality uses zero tolerance across every RGBA channel**.

## Correctness result

Each engine ran 72 cases against both worker input paths: 144 native/worker comparisons.
Native and worker PNG Blobs were independently decoded through HTMLImageElement into
same-size canvases; every RGBA byte was compared, with differing pixels/channels, maximum
delta, first difference, dimensions and decoded SHA-256 retained. Encoded hashes were
not used as an equality substitute. Both worker input paths produced identical decoded
outputs to each other for every case within each engine. All actual output MIME types
were `image/png`; no fallback or unsupported API was observed.

| Engine | Exact comparisons | Failed comparisons | Gate |
| --- | ---: | ---: | --- |
| Chromium 153.0.8010.12 | 44 / 144 | 100 | FAIL |
| Firefox 155.0 | 144 / 144 | 0 | PASS on this matrix |
| WebKit 26.6 | 64 / 144 | 80 | FAIL |

Coverage comprises:

1. 12MP and 48MP photos at 256×256 and 2048×2048: full-frame letterbox, centered square,
   fractional/out-of-bounds frame, circle with alpha, circle with background, and
   fractional-frame rotations 90°, 180° and 270° (32 cases).
2. Transparent PNG at both sizes with those same eight crop variants (16 cases), including
   partially transparent source pixels and transparent output bars.
3. EXIF 1–8: full output, full output plus 90° rotation, and fractional circle (24 cases).
   The orientation oracle passes, while the fractional circle still exposes rendering
   differences in Chromium for 1–8 and WebKit for 5–8.

Representative failures, the same for image and Blob worker inputs:

| Engine / case | Different pixels | Maximum RGBA channel delta |
| --- | ---: | ---: |
| Chromium, 48MP full-letterbox → 256 | 34,680 / 65,536 | 1 |
| Chromium, 48MP fractional-bars → 2048 | 2,710,592 / 4,194,304 | 32 |
| Chromium, 48MP circle-background → 256 | 28,343 / 65,536 | 93 |
| WebKit, 48MP fractional-bars → 2048 | 102,790 / 4,194,304 | 2 |
| WebKit, transparent square → 256 | 1,578 / 65,536 | 255 |

A 255-channel delta at low-alpha edges does not mean the entire opaque image changed by
255. It is still a strict failure. Backend rendering/encoding differences were not
isolated further; no unproven root cause or workaround is claimed.

## Total latency and main-thread responsiveness

Timing uses the centered square frame with side `min(naturalWidth, naturalHeight)`, PNG
output, and the same decoded source repeatedly. For each photo/size, five variants run
in forward/reverse order on alternating rounds. Each receives four warmups and ten timed
samples: **600 measured exports and 240 warmup exports** across the three engines.
Correctness and timing use separate browser runs, sequential engines, and identical
hashed implementation sources. Timing completed without API errors.

This does **not** reproduce the parent's ~154.9 ms JPEG avatar profile: that profile creates
a Croppie instance, binds, renders gestures and resets on every iteration, and uses JPEG
quality 0.9 for photos. This bounded test isolates the export module, retains its source
across samples, and uses lossless PNG. Absolute numbers from the two workloads should
not be compared as a before/after speedup.

Median total export time, milliseconds, including cold-worker startup when applicable:

| Engine | Input → square output | Native | Image cold | Image reused | Blob cold | Blob reused |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Chromium | 12MP → 256 | 10.1 | 69.1 | 65.6 | 67.6 | 64.5 |
| Chromium | 12MP → 2048 | 123.7 | 174.9 | 170.4 | 174.1 | 170.5 |
| Chromium | 48MP → 256 | 36.3 | 219.0 | 215.3 | 219.9 | 220.0 |
| Chromium | 48MP → 2048 | 155.5 | 325.4 | 324.6 | 325.5 | 319.2 |
| Firefox | 12MP → 256 | 8.5 | 16.0 | 9.0 | 49.5 | 45.0 |
| Firefox | 12MP → 2048 | 142.0 | 148.5 | 143.5 | 184.0 | 177.0 |
| Firefox | 48MP → 256 | 24.0 | 28.5 | 22.0 | 135.0 | 127.0 |
| Firefox | 48MP → 2048 | 160.0 | 172.0 | 159.5 | 284.0 | 275.5 |
| WebKit | 12MP → 256 | 5.5 | 10.0 | 6.0 | 70.0 | 64.5 |
| WebKit | 12MP → 2048 | 131.0 | 136.0 | 132.0 | 191.5 | 187.0 |
| WebKit | 48MP → 256 | 9.0 | 12.0 | 10.0 | 195.0 | 187.5 |
| WebKit | 48MP → 2048 | 156.5 | 149.0 | 225.5 | 338.5 | 336.0 |

A recursive 4 ms timer and requestAnimationFrame run during each export and through the
first callbacks after completion. Total export latency stops at Blob receipt, before that
observation tail. The next table is the **median of each export's longest timer gap**,
not total time or first-timer delay. Idle median maximum gaps were about 5.1–5.7 ms in
Chromium, 7 ms in Firefox, and 9–10 ms in WebKit.

| Engine | Input → square output | Native | Image cold | Image reused | Blob cold | Blob reused |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Chromium | 12MP → 256 | 8.3 | 37.5 | 34.4 | 5.2 | 5.3 |
| Chromium | 12MP → 2048 | 16.8 | 38.1 | 35.6 | 5.8 | 5.4 |
| Chromium | 48MP → 256 | 34.1 | 106.1 | 103.1 | 5.6 | 5.7 |
| Chromium | 48MP → 2048 | 41.7 | 107.4 | 104.4 | 5.6 | 5.7 |
| Firefox | 12MP → 256 | 6.0 | 7.0 | 6.0 | 36.0 | 36.5 |
| Firefox | 12MP → 2048 | 7.0 | 7.0 | 7.0 | 35.0 | 35.0 |
| Firefox | 48MP → 256 | 21.0 | 7.0 | 6.0 | 105.5 | 102.0 |
| Firefox | 48MP → 2048 | 22.0 | 7.0 | 7.0 | 114.5 | 110.0 |
| WebKit | 12MP → 256 | 6.0 | 5.0 | 5.0 | 9.0 | 9.0 |
| WebKit | 12MP → 2048 | 131.0 | 10.0 | 10.0 | 10.0 | 10.0 |
| WebKit | 48MP → 256 | 9.0 | 5.0 | 5.0 | 10.0 | 10.0 |
| WebKit | 48MP → 2048 | 156.5 | 10.0 | 91.0 | 10.0 | 10.0 |

For the 48MP → 256 workload, median maximum rAF gaps were:

| Engine | Native | Image cold | Image reused | Blob cold | Blob reused |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium | 33.3 | 83.3 | 100.0 | 16.7 | 16.8 |
| Firefox | 16.7 | 16.7 | 16.7 | 100.0 | 100.0 |
| WebKit | 17.0 | 17.0 | 17.0 | 19.0 | 19.0 |

Chromium's image-transfer path spends about 103 ms creating the bitmap on the main
thread; moving the draw into a worker does not remove that cost. Blob decoding in its
worker preserves responsiveness but raises total latency substantially. Firefox's
image-transfer path improves responsiveness; its Blob-decode path still coincides with
~102 ms main-thread gaps despite the decode API being called inside the worker. The
browser's internal scheduling was not profiled, so a worker API call alone is not evidence
that all associated browser work avoids the main thread. WebKit's reused image-worker
2048px regression is retained in the tables rather than discarded.

### Startup, decode/transfer and stage accounting

Median stages for 48MP → 256, in ms. `Create` is main-thread `createImageBitmap(element)`;
`Decode` is worker `createImageBitmap(blob)`. `Dispatch+return` is main-thread round-trip
duration minus worker duration, including queueing, input clone/transfer and output Blob
return. It does not isolate a pure byte-copy cost. Median stages need not sum to the
median total. Deferred canvas work may occur during encode rather than `drawMs`.

| Chromium | Startup | Create | Decode | Draw | Encode | postMessage call | Dispatch+return |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Native | — | — | — | 33.35 | 2.75 | — | — |
| Image cold | 2.80 | 103.05 | 0.00 | 110.85 | 2.40 | 0.10 | 0.50 |
| Image reused | 0.00 | 103.00 | 0.00 | 108.25 | 2.25 | 0.05 | 0.15 |
| Blob cold | 3.15 | 0.00 | 104.95 | 109.90 | 2.20 | 0.00 | 0.10 |
| Blob reused | 0.00 | 0.00 | 105.05 | 112.95 | 2.35 | 0.00 | 0.10 |

| Firefox | Startup | Create | Decode | Draw | Encode | postMessage call | Dispatch+return |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Native | — | — | — | 20.50 | 3.00 | — | — |
| Image cold | 5.50 | 0.00 | 0.00 | 19.00 | 3.00 | 0.00 | 1.00 |
| Image reused | 0.00 | 0.00 | 0.00 | 20.00 | 3.00 | 0.00 | 0.00 |
| Blob cold | 5.50 | 0.00 | 108.50 | 17.50 | 3.00 | 0.00 | 0.00 |
| Blob reused | 0.00 | 0.00 | 107.00 | 17.50 | 3.00 | 0.00 | -0.50 |

| WebKit | Startup | Create | Decode | Draw | Encode | postMessage call | Dispatch+return |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Native | — | — | — | 0.00 | 9.00 | — | — |
| Image cold | 3.00 | 0.00 | 0.00 | 1.00 | 6.50 | 1.00 | 3.00 |
| Image reused | 0.00 | 0.00 | 0.00 | 0.00 | 6.50 | 3.00 | 4.00 |
| Blob cold | 3.00 | 0.00 | 178.00 | 0.00 | 11.50 | 0.00 | 1.00 |
| Blob reused | 0.00 | 0.00 | 175.00 | 0.00 | 12.00 | 0.00 | 0.00 |

Timer quantization makes zero mean below resolution, not free. Subtracting separately
quantized main/worker durations can produce small negative dispatch/return estimates;
the raw -0.50 ms Firefox value is retained, not interpreted as negative execution time.
Raw files also preserve first-task delay, callback counts, every warmup/sample, and
median/min/max/p95. With ten samples, nearest-rank p95 is the maximum, not a stable tail
estimate. Cold workers often let the first timer run before bitmap creation blocks later;
first-task delay alone would conceal that stall.

## Complete byte accounting

Each HTTP resource is compressed separately using **Node v24.16.0 `gzipSync` level 9**,
then sizes are summed. Bun 1.4.2 minifies the JS; production CSS is copied as the package
build does. The production JS build includes its source-map reference comment; the map
itself is not a runtime resource. No CSS is needed for the isolated export module.

| Runtime resource | Raw bytes | gzip9 bytes |
| --- | ---: | ---: |
| Full native `croppie.js` | 24,266 | 8,238 |
| Full native `croppie.css` | 4,257 | 1,354 |
| Worker loader | 1,096 | 608 |
| Worker, including the complete adapted draw algorithm | 2,924 | 1,328 |
| **Full native JS + CSS + worker + loader** | **32,543** | **11,528** |

Native JS+CSS alone is 28,523 raw / 9,592 gzip9 bytes **in this runtime worktree**;
the worker experiment adds 4,020 raw / 1,936 gzip9 bytes. These are not substituted for
the parent's separately optimized native-build numbers.

For completeness, isolated native-export JS is 2,455 raw / 1,131 gzip9; the standalone
worker+loader subset is 4,020 / 1,936, with zero CSS. That subset has no cropper UI or
interaction lifecycle and is **not a sub-5KB widget claim**. The benchmark browser
harness itself is 6,394 / 2,864; the complete benchmark runtime (native-export module,
loader, worker, harness; zero CSS) is 12,869 / 5,931. Fixtures, source maps, build runner
and retained JSON are test inputs/tooling, not runtime widget assets.

## Exact fixture and tool metadata

| Local fixture | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `photo-12mp.jpg` | 4000×3000 | 4,244,657 | `138044d384489e2d8a11cd4eb125ea20ac3de1c1465cbb14c1fb41f64735eb18` |
| `photo-48mp.jpg` | 8000×6000 | 11,006,443 | `694d490c6411aced1d979e340a82ad53f075c125a1b392ee6c192342512fc7dc` |
| `transparent.png` | 1600×1200 | 9,875 | `174c216d215a724c4a2d208d0f0dc793c26fffff45be0599f6b0ccdf338df16d` |

Photos are the parent's rescaled repository garden photograph, not a claim of native
48MP camera detail. EXIF inputs are generated per engine: a 400×240 canvas has red,
green, yellow, blue quadrants clockwise from top-left, encodes JPEG at quality 1, then
the existing `tests/fixtures/exif-jpeg.js` inserts one orientation APP1 segment. Each
resulting Blob's exact hash, byte count and dimensions are retained in that engine's
`fixtures` array. Browser JPEG encoding can produce different bytes across engines;
comparisons are strictly within the same engine/input.

Host: Apple M5 Max, macOS/Darwin 25.6.0, arm64, 18 logical CPUs, 137,438,953,472 bytes RAM.
Tools: Bun 1.4.2, Node v24.16.0, Playwright 1.63.0. Installed headless browser defaults:
Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6; executable paths are in every JSON.
Viewport 800×600, device scale factor 1. Correctness ran 03:03:10–03:04:08 UTC;
timing ran 03:04:35–03:07:24 UTC. No dependency install or package configuration change.

## Limits and disposition

1. Strict cross-engine acceptance fails; no production integration or relaxed pixel
   tolerance is justified. API presence was sufficient on these three installed engines,
   but platform availability is not a pixel-equivalence guarantee.
2. This tests PNG output and one already-bound-source workload. JPEG/WebP encoding,
   browser restarts, physical mobile Safari/Android, other color profiles, and full
   Croppie interaction/bind lifecycle are not covered by this experiment.
3. Cold/reused worker timings include fresh bitmap creation or Blob decoding per request.
   A persistent decoded worker source, invalidation, cancellation, concurrent requests
   and a production fallback lifecycle were deliberately not built or sized as a product.
4. Desktop quiet-window results still include OS activity, browser caches, GC and timer
   quantization. No resident/GPU memory, physical-input latency, battery or FPS claim is
   made. Width-reset cleanup was not introduced.
5. Source hashes, 72-case/144-comparison counts per engine, all eight independent EXIF
   orientation/dimension checks, actual PNG MIME, 600 sample/240 warmup counts and empty
   API/network-error arrays were audited after the runs; module syntax checks passed.
   The negative equality verdict is the completed experiment result.
