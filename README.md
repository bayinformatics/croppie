# @bayinformatics/croppie

[![npm version](https://img.shields.io/npm/v/@bayinformatics/croppie.svg)](https://www.npmjs.com/package/@bayinformatics/croppie)
[![npm downloads](https://img.shields.io/npm/dm/@bayinformatics/croppie.svg)](https://www.npmjs.com/package/@bayinformatics/croppie)
[![license](https://img.shields.io/npm/l/@bayinformatics/croppie.svg)](LICENSE)
[![ci](https://github.com/bayinformatics/croppie/actions/workflows/ci.yml/badge.svg)](https://github.com/bayinformatics/croppie/actions/workflows/ci.yml)

A modern, TypeScript-first image cropper for the web. Fork of [Foliotek/Croppie](https://github.com/Foliotek/Croppie).

## Highlights

- 🦕 **ES Modules** - ESM-first, tree-shakeable, no UMD/IIFE wrappers
- 📘 **TypeScript** - Full type definitions included
- 🔧 **Modern APIs** - Pointer Events + touch gestures, no polyfills
- 📱 **Mobile First** - Touch and gesture support built in
- 🧪 **Tested** - Unit, integration, and visual regression (Lost Pixel)

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

This is an **ESM-only** package. It works with modern bundlers like Vite, Webpack, Rollup, Next.js, and Bun.

**Breaking Change in v3:** CommonJS `require()` is not supported in most environments. Node 22+ can load ESM from CJS with the experimental `--experimental-require-module` flag, but bundlers and older Node versions will still fail. If you need CommonJS, continue using [Croppie v2.x](https://github.com/Foliotek/Croppie).

```diff
- const Croppie = require('croppie')
+ import Croppie from '@bayinformatics/croppie'
```

If you are using CommonJS, use dynamic `import()`:

```js
(async () => {
  const { default: Croppie } = await import('@bayinformatics/croppie')
  // use Croppie here
})()
```

Node 22+ can also load ESM from CJS with `--experimental-require-module`:

```bash
node --experimental-require-module your-script.cjs
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
| `zoom` | `{ min, max, enforceMinimumCoverage? }` | `{ min: 0.1, max: 10 }` | Zoom limits and coverage enforcement |
| `customClass` | `string` | — | Extra class for the container |
| `enableExif` | `boolean` | `false` | Reserved for v2 compatibility (not implemented) |
| `enableResize` | `boolean` | `false` | Reserved for v2 compatibility (not implemented) |
| `enableOrientation` | `boolean` | `false` | Deprecated v2 option (no-op) |

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

Note: initial `points` are accepted but not yet applied (planned).

#### `bindFile(file: File | Blob): Promise<void>`

Load an image from a File input.

```typescript
const input = document.querySelector('input[type="file"]')
input.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  await cropper.bindFile(file)
})
```

#### `result(options: ResultOptions): Promise<Blob | string | HTMLCanvasElement>`

Get the cropped result.

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

Set the zoom level programmatically.

#### `reset(): void`

Reset to initial state.

#### `destroy(): void`

Clean up and remove the cropper.

### Result Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `'blob' \| 'base64' \| 'canvas'` | Required | Output type |
| `size` | `{ width, height } \| 'viewport' \| 'original'` | `'viewport'` | Output size |
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

## Migrating from Croppie v2

### Quick Reference

| v2 (Original) | v3 (This Fork) |
|---------------|----------------|
| `$('#el').croppie({...})` | `new Croppie(element, {...})` |
| `croppie.bind(url)` | `await croppie.bind(url)` |
| `croppie.bind({ url, points: [x1,y1,x2,y2] })` | `await croppie.bind({ url, points: {topLeftX, topLeftY, bottomRightX, bottomRightY} })` |
| `croppie.result({...}).then(cb)` | `const result = await croppie.result({...})` |
| `$el.on('update', cb)` | `croppie.on('update', cb)` |
| `import 'croppie/croppie.css'` | `import '@bayinformatics/croppie/croppie.css'` |

### Key Differences from Croppie v2

- v2 shipped UMD (AMD/CommonJS/global); v3 is ESM-only.
- v2 `bind()` points/relative points are fully supported; v3 accepts points but does not apply them yet.
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

// Points format changed
- points: [x1, y1, x2, y2]
+ points: { topLeftX, topLeftY, bottomRightX, bottomRightY }
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
  const croppieRef = useRef<Croppie>()

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
# Install dependencies
bun install

# Run dev server with watch
bun run dev

# Run tests
bun test

# Build for production
bun run build

# Lint
bun run lint
```

Visual regression runs in CI using Lost Pixel against `docs/index.html`.

## License

MIT - See [LICENSE](./LICENSE)

Original work Copyright (c) 2015 Foliotek Inc.
Modified work Copyright (c) 2026 Bay Informatics

## Credits

This project is a fork of [Croppie](https://github.com/Foliotek/Croppie) by Foliotek. Thanks to the original authors for their work!
