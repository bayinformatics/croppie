import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const out = fileURLToPath(new URL('./dist/', import.meta.url));
const files = ['core.js', 'export.js', 'exif.js', 'core.css', 'demo.js', 'demo.css', 'index.html', 'sample.svg', 'core-dommatrix.js', 'demo-dommatrix.js', 'affine.js', 'affine-dommatrix.js'];
const sizes = {};
for (const name of files) {
  const b = await readFile(join(out, name));
  sizes[name] = { raw: b.length, gzip9: gzipSync(b, { level: 9 }).length };
}
const total = names => ({ files: names, raw: names.reduce((n, f) => n + sizes[f].raw, 0), gzip9: names.reduce((n, f) => n + sizes[f].gzip9, 0) });
const evidence = { bun: process.env.LEAN_BUN_VERSION || 'see build command', node: process.version, zlib: process.versions.zlib, maps: false, sizes,
  totals: { library: total(['core.js', 'export.js', 'core.css']),
    libraryWithMetadata: total(['core.js', 'export.js', 'core.css', 'exif.js']),
    fullDemo: total(['demo.js', 'core.css', 'demo.css', 'index.html', 'sample.svg']),
    fullDemoWithoutSample: total(['demo.js', 'core.css', 'demo.css', 'index.html']),
    nativeDemo: total(['demo-dommatrix.js', 'core.css', 'demo.css', 'index.html', 'sample.svg']) } };
await writeFile(join(out, 'sizes.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
