# Offscreen export experiment

Run the isolated comparison from the repository root with the existing frozen dependencies:

```sh
OFFSCREEN_FIXTURES=/Users/matthewstingel/orca/workspaces/croppie/performance-and-size/.cache/performance/images \
  /tmp/croppie-performance-2026-10-06/tools/bun experiments/offscreen-export/run.mjs
```

The command builds into `results/assets/`, starts its own loopback server on an ephemeral
port, runs installed Chromium/Firefox/WebKit sequentially, writes raw JSON, and stops the
server. It needs no package/config changes and makes no external image requests.
**Exit 1 means a correctness/platform/measurement gate failed.** A recorded negative
experiment is intentional; the equality criterion is never relaxed.

Set `OFFSCREEN_PHASE=correctness`, `timing`, or `build` to run just that phase;
`OFFSCREEN_BROWSERS=chromium,firefox,webkit` selects engines. Defaults are four warmups
and ten measured samples per variant; `OFFSCREEN_WARMUPS` and `OFFSCREEN_REPEATS`
override them. `OFFSCREEN_OUTPUT=/tmp/my-offscreen-run` preserves the checked-in evidence.

The five timing variants are native, cold/reused image-transfer worker, and cold/reused
Blob-decode worker. Native and image-transfer start from the same fully decoded
HTMLImageElement; Blob-decode deliberately measures a new decode on every request.
A reused worker retains its module/realm, **not a decoded source**. An image transfer uses
`createImageBitmap(element)` on the main thread and transfers its ownership; a Blob is
cloned into the worker and decoded there. Neither input path fetches a source URL.

`build.mjs` adapts production `src/canvas/draw.ts` with five count-guarded substitutions
(two canvas constructors, the source/return types, and the two natural-dimension reads).
The complete repeated-halving, caps, smoothing, intersection, rounding, aspect handling,
rotation, mask and fill logic remains. There are no zero-sized canvas resets. The build
emits the adapted source for inspection and hashes the inputs. This text transformation
is an experiment maintenance seam: review production changes before reusing it.

Read [the report](../reports/offscreen-export.md) for the strict pixel failures,
responsiveness/latency tradeoffs, full byte accounting, commands and limitations.
