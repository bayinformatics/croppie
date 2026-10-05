# @bayinformatics/croppie

[![npm version](https://img.shields.io/npm/v/@bayinformatics/croppie.svg)](https://www.npmjs.com/package/@bayinformatics/croppie)
[![npm downloads](https://img.shields.io/npm/dm/@bayinformatics/croppie.svg)](https://www.npmjs.com/package/@bayinformatics/croppie)
[![license](https://img.shields.io/npm/l/@bayinformatics/croppie.svg)](LICENSE)
[![ci](https://github.com/bayinformatics/croppie/actions/workflows/ci.yml/badge.svg)](https://github.com/bayinformatics/croppie/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/bayinformatics/croppie/branch/main/graph/badge.svg)](https://codecov.io/gh/bayinformatics/croppie)

A modern, TypeScript-first image cropper for the web. Fork of [Foliotek/Croppie](https://github.com/Foliotek/Croppie).

**Live demo: https://bayinformatics.github.io/croppie/**

## Highlights

- 🦕 **ES Modules** - ESM-first, tree-shakeable, no UMD/IIFE wrappers
- 📘 **TypeScript** - Full type definitions included
- 🔧 **Modern APIs** - Pointer Events + touch gestures, no polyfills
- 📱 **Mobile First** - Touch and gesture support built in
- 🧪 **Tested** - Unit, integration, and visual regression (Playwright)

## Why This Fork?

The original Croppie has been largely inactive for years. This fork modernizes the codebase, keeps types first-class, and aligns the API with modern tooling.

## Installation

```bash
# npm
npm install @bayinformatics/croppie

# pnpm
pnpm add @bayinformatics/croppie

# bun
bun add @bayinformatics/croppie
```

## Compatibility

This is an **ESM-only** package for **Node 20 or newer**. It works with modern bundlers like Vite, Webpack, Rollup, Next.js, and Bun.

**Breaking Change in v3:** v2 shipped UMD (AMD, CommonJS and a global); v3 is ES modules only.

```diff
- const Croppie = require('croppie')
+ import Croppie from '@bayinformatics/croppie'
```

CommonJS `require()` works natively on **Node 20.19+ and 22.12+**, which can load an ES module from CommonJS, through the package's `default` export condition. The result is the module namespace:

```js
const { Croppie } = require('@bayinformatics/croppie')
// or: const Croppie = require('@bayinformatics/croppie').default
```

Older runtimes and bundlers that cannot `require()` an ES module should use a dynamic `import()`:

```js
(async () => {
  const { default: Croppie } = await import('@bayinformatics/croppie')
  // use Croppie here
})()
```

**For `<script>` tag usage without a bundler, this fork is not for you** — use the original [Croppie v2.x](https://github.com/Foliotek/Croppie) instead.

## Quick Start

```typescript
import Croppie from '@bayinformatics/croppie'
import '@bayinformatics/croppie/croppie.css'

const cropper = new Croppie(document.getElementById('cropper')!, {
  viewport: { width: 200, height: 200, type: 'circle' }
})

// Load an image
await cropper.bind({ url: 'photo.jpg' })

// Get the cropped result
const blob = await cropper.result({ type: 'blob' })
```

The stylesheet is also available as `@bayinformatics/croppie/style.css`, an alias of `croppie.css`.

## API

### Constructor

```typescript
new Croppie(element: HTMLElement, options: CroppieOptions)
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `viewport` | `{ width, height, type }` | Required | Crop area dimensions and shape (`'circle'` or `'square'`) |
| `boundary` | `{ width, height }` | viewport + 100px | Container dimensions |
| `showZoomer` | `boolean` | `true` | Show zoom slider |
| `mouseWheelZoom` | `boolean \| 'ctrl'` | `true` | Enable scroll zoom (optionally require Ctrl key) |
| `enableZoom` | `boolean` | `true` | Let the user zoom with the slider, wheel and pinch. `false` removes all three (the slider is not rendered even with `showZoomer`); `setZoom()` and `zoom =` still work |
| `zoom` | `{ min?, max?, enforceMinimumCoverage? }` | `{ max: 10 }`, `min` per image | Zoom limits and coverage enforcement. When `min` is not set, the minimum is the zoom at which the image just covers the viewport, so a large photo can zoom out further than 0.1; with `enforceMinimumCoverage: false` it is `min(0.1, the zoom at which the whole image fits)`. A configured `min` is a floor. The effective minimum never exceeds `max` |
| `customClass` | `string` | — | Extra class for the container |
| `enableExif` | `boolean` | `false` | Reserved for v2 compatibility (not implemented) |
| `enableResize` | `boolean` | `false` | Reserved for v2 compatibility (not implemented) |
| `enableOrientation` | `boolean` | `false` | Deprecated v2 option (no-op) |

Invalid options throw a `RangeError` from the constructor: a viewport or boundary dimension, `zoom.min` or `zoom.max` that is not a positive finite number, or `zoom.min` greater than `zoom.max`. A boundary smaller than the viewport only logs a warning.

> **Known limitations:** `enableExif` and `rotate()` are not implemented yet ([#21](https://github.com/bayinformatics/croppie/issues/21), [#20](https://github.com/bayinformatics/croppie/issues/20)).

### Methods

#### `bind(options: BindOptions | string): Promise<void>`

Load an image into the cropper.

```typescript
// Simple URL
await cropper.bind('photo.jpg')

// With options
await cropper.bind({
  url: 'photo.jpg',
  zoom: 1.5,
  points: { topLeftX: 0, topLeftY: 0, bottomRightX: 200, bottomRightY: 200 }
})
```

`points` can be an object (`{ topLeftX, topLeftY, bottomRightX, bottomRightY }`) or the v2-style array `[x1, y1, x2, y2]`. Malformed points (an array without exactly 4 entries, a coordinate that is not a number, a rect without width or height) are ignored with a console warning, and the image gets its default framing.

`bind()` rejects with an error for an image that has no intrinsic size (0×0, for example an SVG without width and height). If you call `bind()` again before the previous image has loaded, the last call wins and the earlier one resolves without applying anything. The exception is a `bindFile()` rejected because it was given something that is not a File or Blob: it changes nothing and supersedes nothing. Malformed `points` do not make `bind()` fail (see above), so such a bind still wins like any other. A `bind()` that is still loading when you call `destroy()` also resolves silently. `bind()` emits one `update` when it completes.

Note: initial `points` are applied on bind — the transform is derived so the
viewport shows the requested region. Aspect-matched points round-trip exactly
through `get()` while the derived zoom stays within `zoom.min`/`zoom.max`;
mismatched-aspect points are cover-fit and center-preserved at the applied
(clamped) zoom.

#### `bindFile(file: File | Blob): Promise<void>`

Load an image from a File input.

```typescript
const input = document.querySelector('input[type="file"]')
input.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) await cropper.bindFile(file)
})
```

#### `result(options: ResultOptions)`

Get the cropped result. The return type follows `options.type`:

```typescript
result(options: ResultOptions & { type: 'blob' }): Promise<Blob>
result(options: ResultOptions & { type: 'base64' }): Promise<string>
result(options: ResultOptions & { type: 'canvas' }): Promise<HTMLCanvasElement>
result(options: ResultOptions): Promise<Blob | string | HTMLCanvasElement>  // type only known at runtime
```

```typescript
// Get as Blob (for uploading)
const blob = await cropper.result({ type: 'blob', format: 'png' })

// Get as base64 (for preview)
const base64 = await cropper.result({ type: 'base64', format: 'jpeg', quality: 0.9 })

// Get as Canvas (for further manipulation)
const canvas = await cropper.result({ type: 'canvas' })

// Custom output size
const blob = await cropper.result({
  type: 'blob',
  size: { width: 400, height: 400 }
})
```

#### `get(): CroppieData`

Get current crop data (points and zoom).

#### `setZoom(value: number): void`

Set the zoom level programmatically. The value is clamped to the zoom limits and the image zooms about the viewport center; a numeric string is converted, and a non-finite value or a blank or non-numeric string is ignored. Emits `update` and `zoom` when the clamped zoom changed.

#### `zoom: number`

Getter and setter for the current zoom level. Setting it clamps to the zoom limits, like `setZoom()`.

#### `reset(): void`

Re-centres the image and returns the zoom to the coverage zoom (the smallest zoom at which the image covers the viewport, clamped to the zoom limits). Emits `update`. Does nothing before an image is bound.

#### `on(event, handler): void` / `off(event, handler): void`

Subscribe to or unsubscribe from [events](#events).

#### `rotate(degrees): void`

Present for v2 compatibility but **not implemented**: it logs a warning and does nothing ([#20](https://github.com/bayinformatics/croppie/issues/20)).

#### `destroy(): void`

Clean up and remove the cropper. It is safe to call more than once. Afterwards `bind()`, `bindFile()` and `result()` reject with a `... called on a destroyed instance` error, and `setZoom()`, `zoom =` and `reset()` do nothing.

### Result Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `'blob' \| 'base64' \| 'canvas'` | Required | Output type |
| `size` | `{ width, height } \| 'viewport' \| 'original'` | `'viewport'` | Output size. `'original'` is the viewport area at image resolution. An `'original'` or custom size is scaled down, keeping its shape, to at most 16,777,216 px (4096×4096) and 16,384 px a side, so the canvas stays within what browsers can allocate (iOS Safari draws nothing on a larger one), then rounded to whole pixels. A size of another shape than the viewport keeps the proportions, with transparent or `backgroundColor` bars |
| `format` | `'png' \| 'jpeg' \| 'webp'` | `'png'` | Output format for blob/base64 |
| `quality` | `number` | `0.92` | JPEG/WebP quality (0-1) |
| `circle` | `boolean` | `viewport.type === 'circle'` | Apply circular mask |
| `backgroundColor` | `string` | — | Fill background for transparent images |

### Events

```typescript
cropper.on('update', (data) => {
  console.log('Crop changed:', data.points, data.zoom)
})

cropper.on('zoom', ({ zoom, previousZoom }) => {
  console.log(`Zoom: ${previousZoom} → ${zoom}`)
})
```

`update` carries the same data as `get()`; `zoom` carries `{ zoom, previousZoom }`. Within one change `update` fires first, then `zoom`. Nothing is emitted when nothing changed (for example a zoom request that is clamped to the current zoom, or a drag the bounds absorb entirely).

| Source | `update` | `zoom` |
|--------|----------|--------|
| `bind()` completes | once, with the initial data | no |
| Dragging the image | only when the (clamped) position changed | no |
| Slider, mouse wheel, pinch, `setZoom()`, `zoom =` | only when the clamped zoom changed | only when the clamped zoom changed |
| `reset()` | always | only when the zoom changed |

Zooming keeps the point under the cursor (mouse wheel), between the fingers (pinch) or at the viewport centre (slider, `setZoom()`) fixed. One mouse-wheel notch (100px, or 3 lines for a mouse that scrolls by lines) zooms by ×1.1; trackpad scrolling zooms proportionally to the scroll distance. A second finger touching down ends a drag, so a pinch does not also pan; when the fingers of a pinch lift until one is left, that finger pans again.

### Zoom and accessibility

- The zoom slider has the accessible name "Zoom" and announces its value as a percentage (`aria-valuetext`, for example "150%"). Keyboard focus shows a visible ring in every browser.
- If the image is zoomed out so far that it no longer covers the viewport (`enforceMinimumCoverage: false`), `result()` keeps the image's proportions: the image is drawn at its true scale, and the rest of the output is transparent or `backgroundColor`. `get().points` stays clamped to the image.
- A `'circle'` viewport that is not square is an ellipse, in the overlay and in the output mask.

## Theming

The colours are CSS custom properties, set on `:root` by `croppie.css`. Override them anywhere in your own stylesheet:

```css
.my-cropper {
  --croppie-boundary-bg: #202020;
  --croppie-slider-start: #0ea5e9;
  --croppie-slider-end: #7dd3fc;
}
```

| Property | Default | Used for |
|----------|---------|----------|
| `--croppie-boundary-bg` | `#1a1a2e` (`#0f0f1a` in dark mode) | Background of the crop area |
| `--croppie-slider-start` / `--croppie-slider-end` | `#4f46e5` / `#818cf8` | Zoom slider gradient |
| `--croppie-slider-thumb` | `#ffffff` | Slider thumb |
| `--croppie-slider-shadow`, `--croppie-slider-shadow-hover`, `--croppie-slider-shadow-focus` | translucent indigo | Slider thumb glow in its normal, hover and focus states |

Dark mode: `--croppie-boundary-bg` switches to `#0f0f1a` under `@media (prefers-color-scheme: dark)` and under `[data-theme="dark"]` (for DaisyUI and similar frameworks).

## Migrating from Croppie v2

### Quick Reference

| v2 (Original) | v3 (This Fork) |
|---------------|----------------|
| `$('#el').croppie({...})` | `new Croppie(element, {...})` |
| `croppie.bind(url)` | `await croppie.bind(url)` |
| `croppie.bind({ url, points: [x1,y1,x2,y2] })` | `await croppie.bind({ url, points: [x1,y1,x2,y2] })` (an object `{topLeftX, topLeftY, bottomRightX, bottomRightY}` also works) |
| `enforceBoundary` | `zoom: { enforceMinimumCoverage }` |
| `minZoom` / `maxZoom` | `zoom: { min, max }` |
| `croppie.result({...}).then(cb)` | `const result = await croppie.result({...})` |
| `$el.on('update', cb)` | `croppie.on('update', cb)` |
| `import 'croppie/croppie.css'` | `import '@bayinformatics/croppie/croppie.css'` |

### Key Differences from Croppie v2

- v2 shipped UMD (AMD/CommonJS/global); v3 is ESM-only.
- v2 `bind()` points/relative points are fully supported; v3 applies points on bind with cover-fit + center preservation within `zoomConfig` bounds (v2's width-only-scale/top-left-anchor quirk, [Foliotek/Croppie#767](https://github.com/Foliotek/Croppie/issues/767), is intentionally not replicated).
- v2 rotation works with `enableOrientation`; v3 `rotate()` is not yet implemented.
- v2 supported `<script>` tag usage; v3 requires a bundler.

### Detailed Changes

```diff
- import Croppie from 'croppie'
+ import Croppie from '@bayinformatics/croppie'

- import 'croppie/croppie.css'
+ import '@bayinformatics/croppie/croppie.css'

// result() now returns a Promise for all types
- cropper.result({ type: 'canvas' }).then(canvas => {})
+ const canvas = await cropper.result({ type: 'canvas' })

// Zoom limits moved into the zoom option
- minZoom: 0.5, maxZoom: 3, enforceBoundary: true
+ zoom: { min: 0.5, max: 3, enforceMinimumCoverage: true }

// Points: the array form still works; an object is also accepted
points: [x1, y1, x2, y2]
points: { topLeftX, topLeftY, bottomRightX, bottomRightY }
```

## Framework Examples

### Stimulus (Hotwire)

```typescript
import { Controller } from '@hotwired/stimulus'
import Croppie from '@bayinformatics/croppie'

export default class extends Controller {
  static targets = ['input', 'preview']

  croppie?: Croppie

  connect() {
    this.croppie = new Croppie(this.previewTarget, {
      viewport: { width: 200, height: 200, type: 'circle' }
    })
  }

  async selectFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) await this.croppie?.bindFile(file)
  }

  async crop() {
    return this.croppie?.result({ type: 'blob' })
  }

  disconnect() {
    this.croppie?.destroy()
  }
}
```

### React

```tsx
import { useRef, useEffect } from 'react'
import Croppie from '@bayinformatics/croppie'

function ImageCropper({ src, onCrop }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const croppieRef = useRef<Croppie | null>(null)

  useEffect(() => {
    if (containerRef.current) {
      croppieRef.current = new Croppie(containerRef.current, {
        viewport: { width: 200, height: 200, type: 'circle' }
      })
      croppieRef.current.bind(src)
    }
    return () => croppieRef.current?.destroy()
  }, [src])

  const handleCrop = async () => {
    const blob = await croppieRef.current?.result({ type: 'blob' })
    onCrop(blob)
  }

  return (
    <div>
      <div ref={containerRef} />
      <button onClick={handleCrop}>Crop</button>
    </div>
  )
}
```

## Development

```bash
# Install dependencies (use the Bun version in .bun-version)
bun install --frozen-lockfile

# Run the tests
bun run test

# Lint and type-check (sources, tests and Playwright config)
bun run lint
bun run typecheck

# Build for production (cleans dist/ first)
bun run build

# Watch build into dist/ (run `bun run build` before committing)
bun run dev

# Visual regression tests (Playwright, against the built bundle)
bun run test:visual

# Check the packed package with publint and Are the Types Wrong?
bun run check:package
```

`dist/` and the demo bundle in `docs/` are committed and CI checks that they match a fresh build under the pinned Bun version, so rebuild them (`bun run build && bun run build:docs`) in the last commit of a change that touches `src/`. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

Visual regression runs in CI using Playwright against test fixtures in `tests/visual/`.

## License

MIT - See [LICENSE](./LICENSE)

Original work Copyright (c) 2015 Foliotek Inc.
Modified work Copyright (c) 2026 Bay Informatics

## Credits

This project is a fork of [Croppie](https://github.com/Foliotek/Croppie) by Foliotek. Thanks to the original authors for their work!
