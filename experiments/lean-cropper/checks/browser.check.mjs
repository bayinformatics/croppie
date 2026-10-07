import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../', import.meta.url)), repo = resolve(root, '../..');
const evidence = process.env.LEAN_EVIDENCE ? resolve(process.env.LEAN_EVIDENCE) : join(root, 'evidence'); await mkdir(evidence, { recursive: true });
const port = process.env.LEAN_PORT || '4197', base = `http://127.0.0.1:${port}/experiments/lean-cropper`;
const server = spawn('bun', [join(root, 'serve.ts')], { cwd: repo, env: { ...process.env, LEAN_PORT: port }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = ''; server.stderr.on('data', data => { serverLog += data; });
const timeout = setTimeout(() => server.kill(), 10000);
await Promise.race([
  once(server.stdout, 'data'),
  once(server, 'exit').then(([code]) => { throw new Error(`Dedicated server exited (${code}): ${serverLog}`); }),
]);
clearTimeout(timeout);
const comparisons = [], results = [];
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
const png = async (path, dataURL) => writeFile(path, Buffer.from(dataURL.split(',')[1], 'base64'));
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
let browser;
try {
  for (const name of (process.env.LEAN_BROWSERS || 'chromium,firefox,webkit').split(',')) {
    browser = await ({ chromium, firefox, webkit }[name]).launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 950 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const stats = { browser: name, version: browser.version(), checks: [], timingsExploratory: [] };
    const check = async (label, action) => { await action(); stats.checks.push(label); console.log(`${name}: ${label}`); };
    await page.goto(`${base}/checks/harness.html`);
    await page.waitForFunction(() => !!window.ready); await page.evaluate(() => window.ready);
    const state = () => page.evaluate(() => lc.getState());
    const saveComparison = async label => {
      await page.evaluate(() => document.body.classList.add('compare')); await frames(page);
      const actual = join(evidence, `${name}-${label}-preview.png`), expected = join(evidence, `${name}-${label}-export.png`);
      const s = await state(), box = await page.locator('.lc-stage').boundingBox();
      await page.screenshot({ path: actual, clip: { x: box.x + s.viewport.x, y: box.y + s.viewport.y, width: s.viewport.width, height: s.viewport.height } });
      await png(expected, await page.evaluate(() => api.toCanvas(lc, { background: '#fff' }).toDataURL()));
      comparisons.push({ name: `${name}/${label}/CSS-vs-Canvas`, actual, expected });
      await page.evaluate(() => document.body.classList.remove('compare'));
    };
    await check('state round-trip, copy isolation, invalid-state rejection', async () => {
      const before = await state();
      const after = await page.evaluate(() => {
        const saved = lc.getState(); lc.rotate(37.25); lc.flip('horizontal'); lc.pan(27, -14);
        lc.setViewport({ x: 75, y: 88, width: 410, height: 257 });
        const transformed = JSON.stringify(lc.getState()); lc.reset(); lc.setState(JSON.parse(transformed));
        if (JSON.stringify(lc.getState()) !== transformed) throw new Error('Transformed state failed round-trip');
        lc.setState(JSON.parse(JSON.stringify(saved)));
        const isolated = lc.getState(); isolated.transform[4] = 999; isolated.viewport.x = 999;
        let rejected = 0;
        for (const edit of [s => s.transform.fill(0), s => s.transform[0] = NaN, s => s.image.width++, s => s.viewport.x = -1]) {
          const s = lc.getState(); edit(s); try { lc.setState(s); } catch { rejected++; }
        }
        return { state: lc.getState(), rejected };
      });
      assert.deepEqual(after.state, before); assert.equal(after.rejected, 4);
    });
    for (const [label, degrees, flips] of [['angle37', 37.25, []], ['horizontal-flip', -28.75, ['horizontal']], ['both-flips', 123.4, ['horizontal', 'vertical']]]) {
      await check(`CSS/export agreement: ${label}`, async () => {
        await page.evaluate(({ degrees, flips }) => {
          lc.reset(); lc.setViewport({ x: 96, y: 80, width: 360, height: 240 }); lc.zoom(1.2); lc.rotate(degrees);
          for (const flip of flips) lc.flip(flip);
        }, { degrees, flips });
        await saveComparison(label);
      });
    }
    await check('mouse pan and anchored wheel zoom', async () => {
      await page.evaluate(() => lc.reset());
      const before = await state(), box = await page.locator('.lc-stage').boundingBox();
      await page.mouse.move(box.x + 590, box.y + 430); await page.mouse.down();
      await page.mouse.move(box.x + 628, box.y + 444, { steps: 3 }); await page.mouse.up();
      const moved = await state(); near(moved.transform[4], before.transform[4] + 38); near(moved.transform[5], before.transform[5] + 14);
      const anchor = { x: 223, y: 177 };
      const previous = await page.evaluate(p => new DOMMatrix(lc.getState().transform).inverse().transformPoint(p).toJSON(), anchor);
      await page.mouse.move(box.x + anchor.x, box.y + anchor.y); await page.mouse.wheel(0, -100); await frames(page);
      const next = await page.evaluate(p => new DOMMatrix(lc.getState().transform).inverse().transformPoint(p).toJSON(), anchor);
      near(previous.x, next.x); near(previous.y, next.y); assert.notEqual((await state()).transform[0], moved.transform[0]);
    });
    await check('free/fixed corner drag, keyboard resize, keyboard pan', async () => {
      await page.evaluate(() => { lc.reset(); lc.setViewport({ x: 100, y: 90, width: 300, height: 220 }); });
      const handle = page.locator('[data-handle=se]'), box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 25); await page.mouse.up();
      let s = await state(); near(s.viewport.width, 335); near(s.viewport.height, 245);
      await page.evaluate(() => lc.setAspect(4 / 3));
      await handle.focus(); await page.keyboard.press('Shift+ArrowRight');
      s = await state(); near(s.viewport.width / s.viewport.height, 4 / 3);
      const before = s.transform;
      await page.locator('.lc-stage').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
      s = await state(); near(s.transform[4], before[4] + 1); near(s.transform[5], before[5] + 10);
      await page.locator('[data-handle=move]').focus(); const oldX = s.viewport.x; await page.keyboard.press('ArrowLeft');
      near((await state()).viewport.x, oldX - 1);
    });
    if (name === 'chromium') await check('real multi-touch anchored pinch and cancellation', async () => {
      await page.evaluate(() => { lc.setAspect(null); lc.reset(); });
      const box = await page.locator('.lc-stage').boundingBox(), session = await page.context().newCDPSession(page);
      const p = { x: 240, y: 280 }, previous = await page.evaluate(p => new DOMMatrix(lc.getState().transform).inverse().transformPoint(p).toJSON(), p);
      const touch = (id, x, y) => ({ id, x: box.x + x, y: box.y + y, radiusX: 3, radiusY: 3 });
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, 150, 280), touch(2, 330, 280)] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, 150, 310), touch(2, 410, 310)] });
      const next = await page.evaluate(p => new DOMMatrix(lc.getState().transform).inverse().transformPoint(p).toJSON(), { x: 280, y: 310 });
      near(previous.x, next.x, .05); near(previous.y, next.y, .05);
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await session.detach();
      const before = await state(); await page.mouse.move(box.x + 200, box.y + 150); assert.deepEqual(await state(), before);
    });
    await check('responsive stage and restore preserve source crop', async () => {
      await page.evaluate(() => { lc.setAspect(null); lc.reset(); lc.rotate(52.3); lc.flip('vertical'); window.saved = lc.getState(); });
      const corners = () => page.evaluate(() => {
        const s = lc.getState(), m = new DOMMatrix(s.transform).inverse(), v = s.viewport;
        return [[v.x, v.y], [v.x + v.width, v.y + v.height]].map(([x, y]) => m.transformPoint({ x, y }).toJSON());
      });
      const old = await corners();
      await page.locator('#host').evaluate(el => { el.style.width = '800px'; el.style.height = '560px'; }); await frames(page);
      await page.evaluate(() => lc.setState(window.saved));
      const now = await corners(); for (let i = 0; i < 2; i++) { near(old[i].x, now[i].x); near(old[i].y, now[i].y); }
      await page.evaluate(() => lc.setViewport({ x: 110, y: 90, width: 440, height: 280 })); await saveComparison('resized-stage');
      await page.locator('#host').evaluate(el => { el.style.width = '640px'; el.style.height = '480px'; }); await frames(page);
    });
    await check('EXIF orientations 1–8: browser preview, export, independent Pillow reference', async () => {
      for (let orientation = 1; orientation <= 8; orientation++) {
        const details = await page.evaluate(async orientation => {
          const response = await fetch(`./fixtures/orientation-${orientation}.jpg`), blob = await response.blob();
          const s = await lc.load(blob); lc.setState({ ...s, transform: [1, 0, 0, 1, 0, 0], viewport: { x: 0, y: 0, ...s.image } });
          return { sameBlob: lc.getSource().blob === blob, image: s.image,
            tag: await api.readBlobOrientation(blob),
            byteTag: api.readJpegOrientation(new Uint8Array(await blob.arrayBuffer())),
            png: api.toCanvas(lc).toDataURL() };
        }, orientation);
        assert.ok(details.sameBlob); assert.equal(details.tag, orientation); assert.equal(details.byteTag, orientation);
        assert.deepEqual(details.image, orientation >= 5 ? { width: 160, height: 240 } : { width: 240, height: 160 });
        const actual = join(evidence, `${name}-orientation-${orientation}.png`), expected = join(root, `checks/fixtures/orientation-${orientation}-expected.png`);
        await png(actual, details.png); comparisons.push({ name: `${name}/EXIF-${orientation}/Pillow`, actual, expected, maxMean: 1.5, maxLarge: .001 });
        await saveComparison(`orientation-${orientation}`);
      }
    });
    await check('original full-resolution detail survives a 10× preview reduction', async () => {
      const encoded = await page.evaluate(async () => {
        const s = await lc.load('./fixtures/detail.png');
        lc.setState({ ...s, transform: [.1, 0, 0, .1, 0, 0], viewport: { x: 0, y: 0, width: 240, height: 160 } });
        return api.toCanvas(lc, { width: 2400 }).toDataURL();
      });
      const actual = join(evidence, `${name}-detail.png`); await png(actual, encoded);
      comparisons.push({ name: `${name}/full-resolution-source`, actual, expected: join(root, 'checks/fixtures/detail.png'), maxMean: .01, maxLarge: 0 });
    });
    await check('real 1600px/5120px JPEG load and PNG/JPEG export', async () => {
      for (const width of [1600, 5120]) {
        const measured = await page.evaluate(async width => {
          const start = performance.now(), response = await fetch(`/docs/images/garden-${width}.jpg`), blob = await response.blob();
          const s = await lc.load(blob), loaded = performance.now();
          lc.setViewport({ x: 100, y: 80, width: 400, height: 260 }); lc.rotate(13.7); lc.flip('vertical');
          const png = await api.toBlob(lc, { width: 1200 }), jpeg = await api.toBlob(lc, { width: 800, type: 'image/jpeg', background: 'white' });
          const decoded = new Image(), url = URL.createObjectURL(png); decoded.src = url; await decoded.decode(); URL.revokeObjectURL(url);
          return { sourceWidth: s.image.width, originalBlob: lc.getSource().blob === blob, compressedBytes: blob.size,
            pngBytes: png.size, jpegType: jpeg.type, output: [decoded.naturalWidth, decoded.naturalHeight], loadMs: loaded - start, exportMs: performance.now() - loaded };
        }, width);
        assert.equal(measured.sourceWidth, width); assert.ok(measured.originalBlob); assert.deepEqual(measured.output, [1200, 780]); assert.equal(measured.jpegType, 'image/jpeg');
        stats.timingsExploratory.push(measured);
      }
      const quality = await page.evaluate(() => {
        const s = lc.getState();
        lc.setState({ ...s, transform: [.1, 0, 0, .1, 0, 0], viewport: { x: 0, y: 0, width: s.image.width / 10, height: s.image.height / 10 } });
        const hybrid = api.toCanvas(lc, { width: 320 });
        const direct = document.createElement('canvas'); direct.width = hybrid.width; direct.height = hybrid.height;
        const ctx = direct.getContext('2d'); ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(lc.getSource().image, 0, 0, direct.width, direct.height);
        const production = api.drawCroppedImage(lc.getSource().image,
          {topLeftX:0,topLeftY:0,bottomRightX:s.image.width,bottomRightY:s.image.height}, hybrid.width, hybrid.height);
        return { direct: direct.toDataURL(), hybrid: hybrid.toDataURL(), production: production.toDataURL(), width: hybrid.width, height: hybrid.height };
      });
      await png(join(evidence, `${name}-downsample-direct.png`), quality.direct);
      await png(join(evidence, `${name}-downsample-hybrid.png`), quality.hybrid);
      await png(join(evidence, `${name}-downsample-production.png`), quality.production);
      stats.downsampleDimensions = [quality.width, quality.height];
    });
    await check('failed/racing loads, reset, canvas lifetime, destroy', async () => {
      const outcomes = await page.evaluate(async () => {
        const original = lc.getState(), url = lc.getSource().image.src;
        let badRejected = false; try { await lc.load(new Blob(['broken'], { type: 'image/jpeg' })); } catch { badRejected = true; }
        const retained = JSON.stringify(lc.getState()) === JSON.stringify(original) && lc.getSource().image.src === url;
        const a = lc.load('./fixtures/landmarks.png').then(() => 'loaded', e => e.name);
        const b = lc.load('./fixtures/orientation-6.jpg'); await b; const stale = await a;
        lc.reset(); const reset = lc.getState(); lc.rotate(72.25); lc.flip('horizontal'); lc.zoom(1.4); lc.reset();
        const resets = JSON.stringify(reset) === JSON.stringify(lc.getState());
        const canvas = api.toCanvas(lc, { width: 100 });
        const nativeToBlob = HTMLCanvasElement.prototype.toBlob; let scratch;
        HTMLCanvasElement.prototype.toBlob = function(...args) { scratch = this; return nativeToBlob.apply(this, args); };
        try { await api.toBlob(lc, { width: 50 }); } finally { HTMLCanvasElement.prototype.toBlob = nativeToBlob; }
        const scratchFreed = scratch.width === 0 && scratch.height === 0;
        lc.pan(10000, 10000);
        const transparent = api.toCanvas(lc, { width: 10 }).getContext('2d').getImageData(0, 0, 1, 1).data[3] === 0;
        const filled = api.toCanvas(lc, { width: 10, background: '#fff' }).getContext('2d').getImageData(0, 0, 1, 1).data;
        const whiteBackground = [...filled].every(v => v === 255); lc.reset();
        const capped = api.toCanvas(lc, { width: 6000, height: 6000 });
        const oversized = capped.width === 4096 && capped.height === 4096;
        capped.width = capped.height = 0;
        const host = document.createElement('div'); host.style.cssText = 'width:300px;height:200px'; document.body.append(host);
        const other = new api.LeanCropper(host), loading = other.load('./fixtures/landmarks.png').then(() => 'loaded', e => e.name);
        other.destroy(); other.destroy(); const aborted = await loading;
        let destroyedThrows = false; try { other.getState(); } catch { destroyedThrows = true; }
        const empty = host.childElementCount === 0; host.remove();
        return { badRejected, retained, stale, resets, oversized, canvasWidth: canvas.width, scratchFreed, transparent, whiteBackground, aborted, destroyedThrows, empty };
      });
      assert.deepEqual(outcomes, { badRejected: true, retained: true, stale: 'AbortError', resets: true, oversized: true, canvasWidth: 100, scratchFreed: true, transparent: true, whiteBackground: true, aborted: 'AbortError', destroyedThrows: true, empty: true });
    });
    await check('DOMMatrix alternative agrees with numeric affine implementation', async () => {
      const delta = await page.evaluate(async () => {
        const { LeanCropper: Native } = await import('../dist/core-dommatrix.js');
        const host = document.createElement('div'); host.style.cssText = 'width:640px;height:480px'; document.body.append(host);
        const other = new Native(host, {coverage:'free'}); await other.load('./fixtures/orientation-6.jpg');
        lc.reset(); other.setState(lc.getState());
        for (const cropper of [lc, other]) { cropper.rotate(43.29); cropper.flip('vertical'); cropper.zoom(1.3, { x: 155, y: 224 }); cropper.pan(-12, 33); }
        const error = Math.max(...lc.getState().transform.map((v, i) => Math.abs(v - other.getState().transform[i])));
        other.destroy(); host.remove(); return error;
      }); near(delta, 0);
    });
    await check('working desktop/mobile demo and labeled native controls', async () => {
      await page.goto(`${base}/dist/`); await page.waitForFunction(() => !document.querySelector('#export').disabled);
      const rotation = page.getByRole('slider', { name: /Rotation angle/ });
      await rotation.focus(); await page.keyboard.press('ArrowRight'); assert.equal(await rotation.inputValue(), '0.1');
      await rotation.evaluate(el => { el.value = '37.2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.getByRole('button', { name: 'Flip horizontal', exact: true }).click();
      await page.getByLabel('Aspect ratio').selectOption('1');
      await page.getByRole('button', { name: 'Export PNG', exact: true }).click(); await page.getByRole('link', { name: 'Download PNG' }).waitFor();
      await page.screenshot({ path: join(evidence, `${name}-demo-desktop.png`), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 }); await frames(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: join(evidence, `${name}-demo-mobile.png`), fullPage: true });
    });
    assert.deepEqual(errors, []); stats.pageErrors = errors; results.push(stats);
    await browser.close(); browser = undefined;
  }
  await writeFile(join(evidence, 'comparisons.json'), JSON.stringify(comparisons, null, 2));
  await writeFile(join(evidence, 'browser-results.json'), JSON.stringify(results, null, 2));
  const pixels = spawnSync('python3', [join(root, 'checks/pixels.py'), join(evidence, 'comparisons.json')], { encoding: 'utf8' });
  await writeFile(join(evidence, 'pixel-results.json'), pixels.stdout);
  if (pixels.status) { console.log(pixels.stdout); throw new Error(`Pixel agreement failed: ${pixels.stderr}`); }
  const pixelResults = JSON.parse(pixels.stdout);
  for (const browser of results) {
    const rows = pixelResults.filter(row => row.name.startsWith(browser.browser + '/'));
    console.log(`${browser.browser}: ${rows.length} pixel comparisons; max RGB MAE ${Math.max(...rows.map(r => r.meanAbsoluteRGB)).toFixed(4)}; off-edge errors ${rows.reduce((n, r) => n + r.offEdgeErrors, 0)}`);
  }
  console.log(`Passed ${results.reduce((n, r) => n + r.checks.length, 0)} browser scenarios and ${comparisons.length} independent pixel comparisons.`);
} finally { await browser?.close(); server.kill(); }
