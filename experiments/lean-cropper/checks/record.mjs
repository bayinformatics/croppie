import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url)), out = join(root, 'recorded');
const json = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
const sizes = await json('dist/sizes.json'), browsers = await json('evidence/browser-results.json');
const pixels = await json('evidence/pixel-results.json'), quality = await json('evidence/quality-results.json');
if (browsers.length !== 3 || pixels.length !== 63 || pixels.some(p => !p.passed)) throw new Error('Full passing verification required before recording');
const model = spawnSync('bun', [join(root, 'checks/model.check.ts')], { encoding: 'utf8' });
if (model.status) throw new Error(model.stderr);
const artifactSHA256 = {};
for (const name of Object.keys(sizes.sizes)) artifactSHA256[name] = createHash('sha256').update(await readFile(join(root, 'dist', name))).digest('hex');
const record = { baseline: '76540ff3ec7f95b6adae2615f630e80cbc33c523', recordedAt: new Date().toISOString(), host: `${process.platform}-${process.arch}`,
  sizes, artifactSHA256, model: JSON.parse(model.stdout),
  browsers: browsers.map(({ timingsExploratory, ...browser }) => browser), pixels, quality,
  note: 'Functional and image-quality evidence only. Concurrent local load/export timings are deliberately excluded; no production-parity or speedup claim.' };
await mkdir(out, { recursive: true });
await writeFile(join(out, 'verification.json'), JSON.stringify(record, null, 2) + '\n');
for (const [from, to] of [['chromium-demo-desktop.png', 'demo-desktop.png'], ['chromium-demo-mobile.png', 'demo-mobile.png'], ['webkit-downsample-comparison.png', 'webkit-downsample-comparison.png']]) {
  await copyFile(join(root, 'evidence', from), join(out, to));
}
console.log(`Recorded ${browsers.reduce((n, b) => n + b.checks.length, 0)} browser scenarios and ${pixels.length} pixel comparisons in ${out}`);
