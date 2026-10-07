import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
import type { LeanCropper, Coverage, CropState, Mask, Options } from '../src/core';
import { constrain, initial } from '../src/model';

// Fit roundoff must not turn edge-aligned crops negative during load/reset.
let initializationSeed = 27;
const initializationRandom = () => (initializationSeed = (Math.imul(initializationSeed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
for (let n = 0; n < 20_000; n++) {
  const stage = { width: 1 + Math.floor(initializationRandom() * 1500), height: 1 + Math.floor(initializationRandom() * 1500) };
  const s = constrain(initial({ width: 2400, height: 1600 }, stage, 10 ** (initializationRandom() * 6 - 3)), 'fill');
  assert.ok(s.viewport.x >= 0 && s.viewport.y >= 0 && s.viewport.x + s.viewport.width <= stage.width + 1e-9 && s.viewport.y + s.viewport.height <= stage.height + 1e-9);
}
console.log(JSON.stringify({ passed: true, initializationStates: 20_000, seed: 27 }));

// In-memory assets and an OS-assigned port keep this check independent of shared dist/fixtures.
const bundled = await Bun.build({ entrypoints: [fileURLToPath(new URL('../src/core.ts', import.meta.url))], target: 'browser' });
assert.ok(bundled.success, bundled.logs.join('\n'));
const code = await bundled.outputs[0]!.text();
const css = await Bun.file(new URL('../src/core.css', import.meta.url)).text();
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
  switch (new URL(request.url).pathname) {
    case '/core.js': return new Response(code, { headers: { 'Content-Type': 'text/javascript' } });
    case '/core.css': return new Response(css, { headers: { 'Content-Type': 'text/css' } });
    default: return new Response('<!doctype html><link rel="stylesheet" href="/core.css"><body style="margin:0"><div id="host" style="width:640px;height:480px"></div>', { headers: { 'Content-Type': 'text/html' } });
  }
} });

try {
  for (const name of (process.env.LEAN_BROWSERS || 'chromium,firefox,webkit').split(',')) {
    const launcher = { chromium, firefox, webkit }[name];
    assert.ok(launcher, `Unknown browser ${name}`);
    const browser = await launcher.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
      const errors: string[] = [];
      page.on('pageerror', e => { errors.push(e.message); console.error(`${name}: ${e.message}`); });
      await page.goto(`http://127.0.0.1:${server.port}`);
      const result = await page.evaluate(async () => {
        const path = '/core.js';
        const { LeanCropper: Cropper } = await import(path) as typeof import('../src/core');
        const host = document.querySelector<HTMLElement>('#host')!;
        let assertions = 0, observations = 0, changes = 0, minimalityChecks = 0;
        const check = (condition: unknown, label: string) => { assertions++; if (!condition) throw new Error(label); };
        const same = (a: unknown, b: unknown, label: string) => check(JSON.stringify(a) === JSON.stringify(b), `${label}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
        const close = (a: number, b: number, label: string, epsilon = 1e-6) => check(Math.abs(a - b) <= epsilon, `${label}: ${a} != ${b}`);
        const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const source = (width: number, height: number) => new Blob([
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ef8955"/><path d="M0 0L${width} ${height}" stroke="#182849" stroke-width="2"/></svg>`,
        ], { type: 'image/svg+xml' });
        const inverseCorners = (s: CropState) => {
          const m = new DOMMatrix(s.transform).inverse(), v = s.viewport;
          return [[v.x, v.y], [v.x + v.width, v.y], [v.x, v.y + v.height], [v.x + v.width, v.y + v.height]]
            .map(([x, y]) => m.transformPoint({ x, y }));
        };
        const covered = (s: CropState, label: string) => {
          observations++;
          check(s.transform.every(Number.isFinite), `${label}: finite affine tuple`);
          check(s.mask === 'rect' || s.mask === 'circle', `${label}: normalized mask`);
          const epsilon = Math.max(s.image.width, s.image.height, 1) * 1e-9;
          for (const p of inverseCorners(s)) {
            check(Number.isFinite(p.x) && Number.isFinite(p.y), `${label}: finite inverse`);
            check(p.x >= -epsilon && p.x <= s.image.width + epsilon && p.y >= -epsilon && p.y <= s.image.height + epsilon,
              `${label}: corner ${p.x},${p.y} outside ${s.image.width}x${s.image.height}; ${JSON.stringify(s)}`);
          }
        };
        let last: CropState | undefined;
        const cropper = new Cropper(host, { onChange(s) {
          changes++; last = s;
          same(cropper.getState(), s, 'callback observes the installed state synchronously');
          check(!!cropper.getSource().image.style.transform, 'preview updated before callback');
        } });
        const once = (label: string, action: () => void) => {
          const count = changes; action(); check(changes === count + 1, `${label}: exactly one synchronous callback`);
        };
        const reject = (label: string, action: () => unknown) => {
          const before = cropper.getState(), count = changes;
          let threw = false; try { action(); } catch { threw = true; }
          check(threw, `${label}: rejected`); same(cropper.getState(), before, `${label}: prior state intact`);
          check(changes === count, `${label}: no callback on rejection`);
        };
        const matrixTuple = (m: DOMMatrix): CropState['transform'] => [m.a, m.b, m.c, m.d, m.e, m.f];
        const scale = (s: CropState) => Math.sqrt(Math.abs(s.transform[0] * s.transform[3] - s.transform[1] * s.transform[2]));
        let seed = 0x5eedc0de;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
        const dimensions = [[1, 1], [2, 7], [31, 2000], [4096, 3072], [1200, 43], [720, 1280]] as const;
        const angles = [89.9999999, 90, 90.0000001, 179.9999999, -89.9999999, 270.0000001, 37.25];
        for (const [width, height] of dimensions) {
          const blob = source(width, height);
          await cropper.load(blob);
          check(cropper.getSource().blob === blob, 'load retains original Blob');
          covered(cropper.getState(), `load ${width}x${height}`);
          for (let step = 0; step < 280; step++) {
            const s = cropper.getState(), v = s.viewport;
            const anchor = { x: random() * s.stage.width, y: random() * s.stage.height };
            switch (step % 10) {
              case 0: once('rotate', () => cropper.rotate(step % 20 ? random() * 720 - 360 : angles[(step / 10) % angles.length]!, anchor)); break;
              case 1: once('pan', () => cropper.pan((random() - .5) * 1e20, (random() - .5) * 1e20)); break;
              case 2: once('zoom', () => cropper.zoom(10 ** (random() * 6 - 3), anchor)); break;
              case 3: once('flip', () => cropper.flip(step % 20 ? 'horizontal' : 'vertical')); break;
              case 4: once('aspect', () => cropper.setAspect([null, 1, 16 / 9, 1 / 7, 7][Math.floor(random() * 5)]!)); break;
              case 5: once('viewport', () => cropper.setViewport({ x: anchor.x - 100, y: anchor.y - 100, width: 24 + random() * 1000, height: 24 + random() * 1000 })); break;
              case 6: {
                const restored = { ...s, aspect: null };
                // Independently create general affine states, including reflection and substantial shear.
                const m = new DOMMatrix().translate(v.x + v.width / 2, v.y + v.height / 2)
                  .rotate(random() * 360).skewX(random() * 140 - 70).skewY(random() * 80 - 40)
                  .scale((random() + .1) * (step % 20 ? -1 : 1), random() + .1).translate(-width / 2, -height / 2);
                restored.transform = matrixTuple(m);
                once('restore shear', () => cropper.setState(restored));
                const output = new DOMMatrix(cropper.getState().transform), k = output.a / m.a;
                close(output.b, m.b * k, 'shear/reflection b preserved', Math.max(1, Math.abs(output.b)) * 1e-9);
                close(output.c, m.c * k, 'shear/reflection c preserved', Math.max(1, Math.abs(output.c)) * 1e-9);
                close(output.d, m.d * k, 'shear/reflection d preserved', Math.max(1, Math.abs(output.d)) * 1e-9);
                break;
              }
              case 7: {
                const old = inverseCorners(s);
                const w = 240 + Math.floor(random() * 650), h = 180 + Math.floor(random() * 550);
                host.style.width = `${w}px`; host.style.height = `${h}px`; await frames();
                const resized = cropper.getState(); same(resized.stage, { width: w, height: h }, `ResizeObserver updated stage after ${JSON.stringify(s)}`);
                inverseCorners(resized).forEach((p, i) => {
                  close(p.x, old[i]!.x, 'responsive resize preserves source x'); close(p.y, old[i]!.y, 'responsive resize preserves source y');
                });
                once('restore different stage', () => cropper.setState(s));
                inverseCorners(cropper.getState()).forEach((p, i) => {
                  close(p.x, old[i]!.x, 'responsive restore preserves source x'); close(p.y, old[i]!.y, 'responsive restore preserves source y');
                });
                break;
              }
              case 8: {
                once('minimum zoom', () => cropper.zoom(Number.MIN_VALUE, anchor));
                const minimum = cropper.getState();
                for (let n = 0; n < 6; n++) cropper.zoom(.00001, { x: (random() - .5) * 1e6, y: (random() - .5) * 1e6 });
                same(cropper.getState(), minimum, 'repeated below-minimum zoom does not drift');
                // A genuine limiting edge must fail if we shrink slightly; no solver arithmetic copied here.
                const p = { x: minimum.viewport.x + minimum.viewport.width / 2, y: minimum.viewport.y + minimum.viewport.height / 2 };
                const reduced = new DOMMatrix().translate(p.x, p.y).scale(.9999).translate(-p.x, -p.y).multiply(new DOMMatrix(minimum.transform));
                check(inverseCorners({ ...minimum, transform: matrixTuple(reduced) }).some(q => q.x < -1e-7 || q.y < -1e-7 || q.x > width + 1e-7 || q.y > height + 1e-7), 'minimum is tight');
                minimalityChecks++;
                break;
              }
              case 9: {
                const serialized = JSON.stringify(s); once('serialization', () => cropper.setState(JSON.parse(serialized)));
                same(cropper.getState(), s, 'normalized fill serialization is exact');
                break;
              }
            }
            covered(cropper.getState(), `${width}x${height} step ${step}`);
          }
        }

        host.style.width = '640px'; host.style.height = '480px'; await frames();
        await cropper.load(source(2000, 1400)); cropper.reset(); cropper.zoom(4);
        const anchor = { x: 300, y: 230 };
        let expected = new DOMMatrix(cropper.getState().transform).inverse().transformPoint(anchor);
        cropper.zoom(1.1, anchor);
        let actual = new DOMMatrix(cropper.getState().transform).inverse().transformPoint(anchor);
        close(actual.x, expected.x, 'unconstrained zoom anchor x'); close(actual.y, expected.y, 'unconstrained zoom anchor y');
        expected = actual; cropper.rotate(3.2, anchor);
        actual = new DOMMatrix(cropper.getState().transform).inverse().transformPoint(anchor);
        close(actual.x, expected.x, 'unconstrained rotation anchor x'); close(actual.y, expected.y, 'unconstrained rotation anchor y');
        covered(cropper.getState(), 'unconstrained anchors');

        // Coverage is instance policy, while masks belong to the serializable crop state.
        once('free policy', () => cropper.setCoverage('free'));
        let count = changes; cropper.setCoverage('free'); check(changes === count, 'same coverage is a no-op');
        const freeBefore = cropper.getState(); cropper.pan(1e12, -1e12);
        close(cropper.getState().transform[4], freeBefore.transform[4] + 1e12, 'free pan x');
        close(cropper.getState().transform[5], freeBefore.transform[5] - 1e12, 'free pan y');
        const free = cropper.getState(); check(!('coverage' in free), 'coverage omitted from serialized state');
        once('fill policy', () => cropper.setCoverage('fill')); covered(cropper.getState(), 'switch free to fill');
        once('fill restore', () => cropper.setState(free)); covered(cropper.getState(), 'fill clamps restored free state');
        cropper.setCoverage('free'); cropper.setState(free); same(cropper.getState(), free, 'free restore retains unbounded pan');
        cropper.reset(); cropper.zoom(1e200); close(scale(cropper.getState()), 64, 'free upper zoom limit');
        cropper.zoom(Number.MIN_VALUE); close(scale(cropper.getState()), .001, 'free lower zoom limit');
        cropper.setCoverage('fill'); covered(cropper.getState(), 'coverage after free minimum');

        cropper.reset(); same(cropper.getState().mask, 'rect', 'default mask is rect');
        once('circle mask', () => cropper.setMask('circle'));
        count = changes; cropper.setMask('circle'); check(changes === count, 'same mask is a no-op');
        const circle = cropper.getState(); cropper.setMask('rect'); cropper.setState(circle);
        same(cropper.getState().mask, 'circle', 'mask round-trip');
        cropper.reset(); same(cropper.getState().mask, 'circle', 'reset retains mask');
        await cropper.load(source(321, 199)); same(cropper.getState().mask, 'circle', 'load retains mask');
        const outline = host.querySelector<HTMLElement>('.lc-crop')!;
        same(getComputedStyle(outline).borderRadius, '50%', 'ellipse preview outline');
        for (const button of outline.querySelectorAll('button')) {
          const r = button.getBoundingClientRect();
          check(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === button, `ellipse handle ${button.dataset.handle} remains hit-testable`);
        }
        const legacy = cropper.getState(); delete legacy.mask; cropper.setState(legacy);
        same(cropper.getState().mask, 'rect', 'missing version-1 mask normalizes to rect');
        same(getComputedStyle(outline).borderRadius, '0px', 'rectangle outline restored');
        check(!!last, 'onChange captured snapshots');
        last!.transform[4] = 777777; last!.viewport.width = 777777;
        check(cropper.getState().transform[4] !== 777777 && cropper.getState().viewport.width !== 777777, 'callback snapshots are detached');

        for (const value of [undefined, null, '', 'contain', 0, {}, NaN]) {
          reject('invalid coverage', () => cropper.setCoverage(value as Coverage));
          reject('invalid mask', () => cropper.setMask(value as Mask));
        }
        for (const value of [null, 'ellipse', 0]) reject('invalid restored mask', () => cropper.setState({ ...cropper.getState(), mask: value as Mask }));
        for (const options of [{ coverage: 'contain' }, { coverage: null }, { mask: 'ellipse' }, { mask: null }]) {
          const children = host.childElementCount; let threw = false;
          try { new Cropper(host, options as Options); } catch { threw = true; }
          check(threw && host.childElementCount === children, 'invalid constructor mode leaves DOM untouched');
        }
        reject('invalid pan', () => cropper.pan(Infinity, 0));
        reject('invalid zoom', () => cropper.zoom(NaN));
        reject('invalid rotation', () => cropper.rotate(Infinity));
        reject('derived rotation overflow', () => cropper.rotate(180, { x: Number.MAX_VALUE, y: Number.MAX_VALUE }));
        reject('derived zoom overflow', () => cropper.zoom(64, { x: Number.MAX_VALUE, y: Number.MAX_VALUE }));
        reject('derived viewport overflow', () => cropper.setAspect(Number.MAX_VALUE));
        cropper.setCoverage('free');
        const huge = cropper.getState(); huge.transform[4] = Number.MAX_VALUE; cropper.setState(huge);
        reject('derived pan overflow', () => cropper.pan(Number.MAX_VALUE, 0));
        const unrepresentable = cropper.getState(); unrepresentable.transform = [1e-5, 0, 0, 1e-5, Number.MAX_VALUE, 0];
        cropper.setState(unrepresentable);
        reject('inverse overflow on policy switch', () => cropper.setCoverage('fill'));
        cropper.pan(0, 5); close(cropper.getState().transform[5], 5, 'failed switch retains free policy');
        cropper.reset(); cropper.setCoverage('fill');

        const proxy = new Proxy(cropper, {});
        proxy.setMask('circle'); proxy.rotate(27); proxy.flip('horizontal'); proxy.pan(1e9, -1e9); proxy.zoom(.01);
        covered(proxy.getState(), 'Proxy receivers'); proxy.setCoverage('free'); proxy.setCoverage('fill');
        const original = cropper.getState(), originalSource = cropper.getSource();
        let failed = false; try { await cropper.load(new Blob(['bad image'])); } catch { failed = true; }
        check(failed, 'failed decode rejected'); same(cropper.getState(), original, 'failed load keeps state');
        check(cropper.getSource().image === originalSource.image && cropper.getSource().blob === originalSource.blob, 'failed load keeps original source');
        const slow = cropper.load(source(67, 31)).then(() => 'loaded', e => e.name);
        const finalBlob = source(23, 79); await cropper.load(finalBlob);
        same(await slow, 'AbortError', 'superseded decode cannot install');
        check(cropper.getSource().blob === finalBlob, 'winning load retains original Blob');
        let previousRevoked = false; try { await fetch(originalSource.image.src); } catch { previousRevoked = true; }
        check(previousRevoked, 'successful replacement revokes the previous object URL');
        covered(cropper.getState(), 'winning load');
        const settled = cropper.getState(); cropper.rotate(89.999); cropper.flip('vertical'); cropper.zoom(2); cropper.reset();
        same(cropper.getState(), settled, 'reset restores fit with current mask');
        await frames();
        count = changes;
        const canceled = cropper.load(source(71, 19)).then(() => 'loaded', e => e.name);
        const finalURL = cropper.getSource().image.src;
        proxy.destroy(); proxy.destroy();
        same(await canceled, 'AbortError', 'destroy aborts pending decode');
        check(changes === count, 'destroyed decode cannot callback');
        same(host.childElementCount, 0, 'destroy releases owned DOM');
        let revoked = false; try { await fetch(finalURL); } catch { revoked = true; }
        check(revoked, 'destroy revokes installed object URL');
        let dead = false; try { proxy.setCoverage('free'); } catch { dead = true; } check(dead, 'policy setter rejects destroyed cropper');

        // Leave a fresh instance for real pointer, wheel and keyboard checks outside evaluate.
        const interactive = new Cropper(host, { mask: 'circle' });
        interactive.setCoverage('free'); interactive.setMask('rect'); interactive.setMask('circle'); interactive.setCoverage('fill');
        await interactive.load(source(1, 1));
        check(scale(interactive.getState()) > 64, 'tiny image coverage exceeds old zoom ceiling');
        covered(interactive.getState(), 'tiny image');
        (window as unknown as { coverageCropper: LeanCropper }).coverageCropper = interactive;
        return { assertions, observations, minimalityChecks, seededSteps: dimensions.length * 280, seed: '0x5eedc0de' };
      });

      // These gestures exercise the event paths separately from the API property sequences.
      const state = () => page.evaluate(() => (window as unknown as { coverageCropper: LeanCropper }).coverageCropper.getState());
      const gestureCoverage = async (label: string) => assert.ok(await page.evaluate(() => {
        const s = (window as unknown as { coverageCropper: LeanCropper }).coverageCropper.getState();
        const inv = new DOMMatrix(s.transform).inverse(), v = s.viewport;
        return [[v.x, v.y], [v.x + v.width, v.y], [v.x, v.y + v.height], [v.x + v.width, v.y + v.height]]
          .map(([x, y]) => inv.transformPoint({ x, y })).every(p => p.x >= -1e-8 && p.y >= -1e-8 && p.x <= s.image.width + 1e-8 && p.y <= s.image.height + 1e-8);
      }), `${label} preserves coverage`);
      const minimum = await state();
      await page.mouse.move(35, 35);
      for (let n = 0; n < 8; n++) await page.mouse.wheel(0, 180);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.deepEqual(await state(), minimum, 'wheel attempts below minimum do not drift');
      await page.mouse.down(); await page.mouse.move(610, 455, { steps: 8 }); await page.mouse.up();
      await gestureCoverage('real pan');
      await page.locator('[data-handle=se]').focus(); await page.keyboard.press('Shift+ArrowLeft');
      await gestureCoverage('keyboard corner resize');
      const beforeResize = await state();
      const handle = await page.locator('[data-handle=nw]').boundingBox(); assert.ok(handle);
      await page.mouse.move(handle.x + 12, handle.y + 12); await page.mouse.down();
      await page.mouse.move(handle.x + 42, handle.y + 36, { steps: 3 }); await page.mouse.up();
      assert.notDeepEqual((await state()).viewport, beforeResize.viewport, 'circle corner handle resizes with a real pointer');
      await gestureCoverage('real corner drag');
      await page.locator('[data-handle=move]').focus(); await page.keyboard.press('Shift+ArrowRight');
      await gestureCoverage('keyboard crop move');
      if (name === 'chromium') {
        await page.evaluate(() => (window as unknown as { coverageCropper: LeanCropper }).coverageCropper.reset());
        const session = await page.context().newCDPSession(page);
        const touch = (id: number, x: number, y: number) => ({ id, x, y, radiusX: 3, radiusY: 3 });
        try {
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, 180, 280), touch(2, 420, 280)] });
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, 220, 300), touch(2, 400, 300)] });
          await gestureCoverage('real pinch below minimum');
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, 140, 320), touch(2, 510, 320)] });
          await gestureCoverage('real pinch above minimum');
          await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
          const canceled = await state(); await page.mouse.move(20, 20);
          assert.deepEqual(await state(), canceled, 'canceled pinch stops movement');
        } finally { await session.detach(); }
      }
      await page.evaluate(() => (window as unknown as { coverageCropper: LeanCropper }).coverageCropper.destroy());
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ browser: name, version: browser.version(), passed: true, ...result, realGestureChecks: name === 'chromium' ? 8 : 5 }));
    } finally { await browser.close(); }
  }
} finally { await server.stop(true); }
