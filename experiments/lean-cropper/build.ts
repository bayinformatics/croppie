import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url)), out = join(root, 'dist');
await mkdir(out, { recursive: true });
async function bundle(entry: string, name: string) {
  const result = await Bun.build({ entrypoints: [join(root, entry)], target: 'browser', minify: true });
  if (!result.success || result.outputs.length !== 1) throw new Error(result.logs.join('\n'));
  await writeFile(join(out, name), await result.outputs[0]!.text());
}
await bundle('src/core.ts', 'core.js');
await bundle('src/export.ts', 'export.js');
await bundle('src/exif.ts', 'exif.js');
await bundle('src/demo.ts', 'demo.js');
// Quality oracle only; not requested by the widget/demo or included in runtime totals.
await bundle('../../src/canvas/draw.ts', 'production-export.js');
for (const name of ['core.css', 'demo.css']) await bundle(`src/${name}`, name);
for (const name of ['index.html', 'sample.svg']) await writeFile(join(out, name), await readFile(join(root, name)));
const measurement = Bun.spawnSync(['node', join(root, 'measure.mjs')], { env: { ...process.env, LEAN_BUN_VERSION: Bun.version }, stdout: 'inherit', stderr: 'inherit' });
if (measurement.exitCode) throw new Error('Size measurement failed');
