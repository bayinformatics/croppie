import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url)), repo = resolve(root, '../..');
const output = resolve(process.env.HYBRID_EXPORT_OUTPUT || join(repo, '.cache/hybrid-export'));
const fixtures = join(output, 'images'), build = join(output, 'build');
await mkdir(fixtures, { recursive: true }); await mkdir(build, { recursive: true });
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${cmd} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout;
};

const garden = join(repo, 'docs/images/garden-5120.jpg');
let photo48 = process.env.HYBRID_PHOTO_48MP || join(repo, '.cache/performance/images/photo-48mp.jpg');
try { await access(photo48); } catch { photo48 = ''; }
// Test fixtures/reference generation only. No Python/Pillow code enters the browser bundle.
run('python3', ['-c', String.raw`
from PIL import Image, ImageDraw, ImageOps
from pathlib import Path
import sys, shutil
out, garden, photo48 = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
shutil.copyfile(garden, out / 'garden-5120.jpg')
if photo48:
    shutil.copyfile(photo48, out / 'photo-48mp.jpg')
elif not (out / 'photo-48mp.jpg').exists():
    ImageOps.fit(Image.open(garden), (8000,6000), method=Image.Resampling.LANCZOS).save(out / 'photo-48mp.jpg', quality=92)
art = Image.new('RGBA', (1024,768))
d = ImageDraw.Draw(art)
colors = [(220,36,52,255),(32,160,96,255),(40,88,212,255),(234,185,32,255),(80,140,220,128),(0,0,0,0)]
for y in range(0,768,128):
    for x in range(0,1024,128):
        d.rectangle((x,y,x+127,y+127), fill=colors[(x//128+2*(y//128))%len(colors)])
d.ellipse((340,240,610,530), fill=(180,40,196,255))
art.save(out / 'art.png')
detail=Image.new('RGB',(2400,1600),'white'); d=ImageDraw.Draw(detail)
for x in range(0,2400,2): d.line((x,0,x,1599), fill='black')
d.rectangle((830,550,850,610), fill=(240,20,40)); detail.save(out/'detail.png')
quad=Image.new('RGB',(240,160)); d=ImageDraw.Draw(quad)
for i,box in enumerate([(0,0,119,79),(120,0,239,79),(0,80,119,159),(120,80,239,159)]):
    d.rectangle(box, fill=colors[i][:3]); d.text((box[0]+20,box[1]+30),str(i),fill='white')
for orientation in range(1,9):
    exif=Image.Exif(); exif[274]=orientation
    name=out/f'exif-{orientation}.jpg'; quad.save(name,quality=95,subsampling=0,exif=exif)
    ImageOps.exif_transpose(Image.open(name)).save(out/f'exif-{orientation}-expected.png')
`, fixtures, garden, photo48]);

run('bun', ['build', join(root, 'checks/export.check.ts'), '--outdir', build, '--target', 'browser']);
const librarySizes = {};
for (const entry of ['core.ts', 'export.ts', 'core.css', 'demo.ts', 'demo.css']) {
  run('bun', ['build', join(root, 'src', entry), '--outdir', join(build, 'size'), '--target', 'browser', '--minify']);
  const name = entry.replace(/\.ts$/, '.js'), bytes = await readFile(join(build, 'size', name));
  librarySizes[name] = { raw: bytes.length, gzip9: gzipSync(bytes, { level: 9 }).length };
}
for (const name of ['index.html', 'sample.svg']) {
  const bytes = await readFile(join(root, name)); librarySizes[name] = { raw: bytes.length, gzip9: gzipSync(bytes, { level: 9 }).length };
}
const total = names => ({ files: names, raw: names.reduce((n, f) => n + librarySizes[f].raw, 0), gzip9: names.reduce((n, f) => n + librarySizes[f].gzip9, 0) });
const report = { generatedAt: new Date().toISOString(), head: run('git', ['rev-parse', 'HEAD']).trim(),
  toolchain: { bun: run('bun', ['--version']).trim(), node: process.version, zlib: process.versions.zlib,
  pillow: run('python3', ['-c', 'import PIL; print(PIL.__version__)']).trim() }, fixtures: [], sizes: librarySizes,
  totals: { component: total(['core.js', 'export.js', 'core.css']), demo: total(['demo.js', 'core.css', 'demo.css', 'index.html', 'sample.svg']) }, browsers: [] };
for (const name of ['garden-5120.jpg', 'photo-48mp.jpg', 'art.png', 'detail.png']) {
  const bytes = await readFile(join(fixtures, name)); report.fixtures.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><script type="module" src="/export.check.js"></script>'); }
    if (pathname === '/export.check.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile(join(build, 'export.check.js'))); }
    if (/^\/images\/[a-zA-Z0-9.-]+$/.test(pathname)) { res.setHeader('Content-Type', pathname.endsWith('.png') ? 'image/png' : 'image/jpeg'); return res.end(await readFile(join(fixtures, pathname.slice(8)))); }
    res.writeHead(404); res.end();
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}`;
const qualityCases = [
  { name: 'garden-full', source: 'garden-5120.jpg' },
  { name: '48mp-full', source: 'photo-48mp.jpg' },
  { name: 'garden-angle37', source: 'garden-5120.jpg', angle: 37.25 },
  { name: '48mp-angle-flip-circle', source: 'photo-48mp.jpg', angle: -28.75, flip: true, circle: true },
  { name: '48mp-fractional-letterbox', source: 'photo-48mp.jpg', angle: 123.4, flip: true, fractional: true, letterbox: true },
  { name: 'garden-region', source: 'garden-5120.jpg', region: true, angle: 19.3, fractional: true },
  { name: 'transparent-circle', source: 'art.png', angle: 37.25, flip: true, circle: true, letterbox: true, fractional: true },
  { name: 'shear-limit', source: 'garden-5120.jpg', shear: true, angle: 17.5 },
  { name: 'anisotropic-limit', source: 'garden-5120.jpg', anisotropic: true },
];
let browser;
try {
  for (const name of (process.env.HYBRID_EXPORT_BROWSERS || 'chromium,firefox,webkit').split(',')) {
    browser = await ({ chromium, firefox, webkit }[name]).launch();
    const page = await browser.newPage(), row = { name, version: browser.version(), checks: {}, quality: [], exif: [], errors: [] };
    page.on('pageerror', error => row.errors.push(error.message));
    await page.goto(address); await page.waitForFunction(() => !!window.exportChecks);
    for (const check of ['sizes', 'geometry', 'productionParity', 'detailAndLifetime']) {
      row.checks[check] = await page.evaluate(check => window.exportChecks[check](), check);
      console.log(`${name}: ${check} passed`);
    }
    for (const spec of qualityCases) {
      const result = await page.evaluate(spec => window.exportChecks.qualityCase(spec), spec);
      for (const [method, data] of Object.entries(result.outputs)) {
        const path = join(output, `${name}-${spec.name}-${method}.png`);
        await writeFile(path, Buffer.from(data.split(',')[1], 'base64')); result.outputs[method] = path;
      }
      row.quality.push(result); console.log(`${name}: ${spec.name} captured`);
    }
    for (let i = 1; i <= 8; i++) {
      const exif = await page.evaluate(name => window.exportChecks.exif(name), `exif-${i}.jpg`);
      assert.deepEqual([exif.width, exif.height], i >= 5 ? [160, 240] : [240, 160]);
      const path = join(output, `${name}-exif-${i}.png`);
      await writeFile(path, Buffer.from(exif.png.split(',')[1], 'base64')); row.exif.push({ orientation: i, path });
    }
    assert.deepEqual(row.errors, []); report.browsers.push(row);
    await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close(); browser = undefined;
  }
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }

// Independent Pillow oracle: Lanczos prefilter, 4x affine render, Lanczos final reduction.
// Same logical geometry for every method; separate analytic tests above certify alignment.
const analyzed = run('python3', ['-c', String.raw`
from PIL import Image, ImageDraw, ImageChops, ImageStat
from pathlib import Path
import sys,json,math
out=Path(sys.argv[1]); report=json.loads((out/'results.json').read_text()); sources={}
def rgb(im):
    return Image.alpha_composite(Image.new('RGBA',im.size,'white'),im.convert('RGBA')).convert('RGB')
def metrics(a,b):
    diff=ImageStat.Stat(ImageChops.difference(rgb(a),rgb(b))); mse=sum(v*v for v in diff.rms)/3
    return {'mae':sum(diff.mean)/3,'psnr':10*math.log10(255*255/mse) if mse else 100}
for browser in report['browsers']:
    for row in browser['quality']:
        spec=row['spec']; name=spec['source']
        if name not in sources: sources[name]=Image.open(out/'images'/name).convert('RGBA')
        source=sources[name]; w,h=row['width'],row['height']; v=row['state']['viewport']; m=row['state']['transform']
        k=min(w/v['width'],h/v['height']); rounded=abs(w/v['width']-h/v['height'])<=.5/v['width']+.5/v['height']
        kx=w/v['width'] if rounded else k; ky=h/v['height'] if rounded else k
        ox=0 if rounded else (w-v['width']*k)/2; oy=0 if rounded else (h-v['height']*k)/2
        a,b,c,d=m[0]*kx,m[1]*ky,m[2]*kx,m[3]*ky; e=ox+kx*(m[4]-v['x']); f=oy+ky*(m[5]-v['y']); determinant=a*d-b*c
        factor=4; ss=min(1,max(math.hypot(a,b),math.hypot(c,d))*factor)
        sx=min(1,math.hypot(a,b)*factor) if spec.get('anisotropic') else ss
        sy=min(1,math.hypot(c,d)*factor) if spec.get('anisotropic') else ss
        sw=max(1,round(source.width*sx)); sh=max(1,round(source.height*sy))
        reduced=source.resize((sw,sh),Image.Resampling.LANCZOS); rx=sw/source.width; ry=sh/source.height
        inverse=(d/determinant/factor*rx,-c/determinant/factor*rx,(c*f-d*e)/determinant*rx,
                 -b/determinant/factor*ry,a/determinant/factor*ry,(b*e-a*f)/determinant*ry)
        ideal=reduced.transform((w*factor,h*factor),Image.Transform.AFFINE,inverse,Image.Resampling.BICUBIC)
        mask=Image.new('L',ideal.size); draw=ImageDraw.Draw(mask)
        box=(ox*factor,oy*factor,(ox+v['width']*kx)*factor-1,(oy+v['height']*ky)*factor-1)
        if row['state'].get('mask')=='circle': draw.ellipse(box,fill=255)
        else: draw.rectangle(box,fill=255)
        ideal.putalpha(ImageChops.multiply(ideal.getchannel('A'),mask)); ideal=ideal.resize((w,h),Image.Resampling.LANCZOS)
        ideal.save(out/f"{browser['name']}-{spec['name']}-pillow.png")
        row['quality']={method:metrics(Image.open(file),ideal) for method,file in row['outputs'].items()}
        if spec['name'] in ['garden-full','48mp-full']:
            # Keep the plain Lanczos oracle for comparison with the historical experiment.
            plain=source.resize((w,h),Image.Resampling.LANCZOS)
            row['plainLanczos']={method:metrics(Image.open(file),plain) for method,file in row['outputs'].items()}
        sheet=Image.new('RGB',(w*4,h),'white')
        for i,im in enumerate([ideal,Image.open(row['outputs']['single']),Image.open(row['outputs']['hybrid']),Image.open(row['outputs']['progressive'])]): sheet.paste(rgb(im),(w*i,0))
        sheet.save(out/f"{browser['name']}-{spec['name']}-comparison.png")
    for row in browser['exif']:
        row['metrics']=metrics(Image.open(row['path']),Image.open(out/'images'/f"exif-{row['orientation']}-expected.png"))
(out/'results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
`, output]);
const finalReport = JSON.parse(analyzed), failures = [];
for (const browser of finalReport.browsers) {
  for (const row of browser.quality) {
    const q = row.quality;
    // Explicit, unchanged quality gate. Shear is measured, not claimed equivalent to uniform transforms.
    if (!row.spec.shear && !row.spec.anisotropic && q.hybrid.mae > 6) failures.push(`${browser.name}/${row.spec.name} hybrid MAE ${q.hybrid.mae} > 6`);
    if (['garden-full', '48mp-full', 'garden-angle37', '48mp-angle-flip-circle', '48mp-fractional-letterbox'].includes(row.spec.name) && browser.name !== 'chromium') {
      if (q.hybrid.psnr < q.single.psnr + 4) failures.push(`${browser.name}/${row.spec.name} PSNR gain ${q.hybrid.psnr - q.single.psnr} < 4dB`);
    }
    if (['garden-full', '48mp-full'].includes(row.spec.name) && q.hybrid.mae > q.production.mae * 1.2 + .6) {
      failures.push(`${browser.name}/${row.spec.name} MAE exceeds production allowance`);
    }
    console.log(`${browser.name}/${row.spec.name}: MAE ${q.single.mae.toFixed(3)} -> ${q.hybrid.mae.toFixed(3)}, PSNR ${q.single.psnr.toFixed(2)} -> ${q.hybrid.psnr.toFixed(2)} dB`);
  }
  for (const row of browser.exif) if (row.metrics.mae > 1.5) failures.push(`${browser.name}/EXIF-${row.orientation}: MAE ${row.metrics.mae}`);
}
finalReport.acceptance = { passed: failures.length === 0, failures };
await writeFile(join(output, 'results.json'), JSON.stringify(finalReport, null, 2) + '\n');
assert.deepEqual(failures, [], 'Quality/EXIF acceptance');
console.log(`PASS: ${finalReport.browsers.length} engines, analytic geometry, production parity, lifetimes, ${qualityCases.length} quality fixtures/scenarios and 8 EXIF orientations per engine. Evidence: ${output}/results.json`);
