import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(process.env.HYBRID_EVIDENCE || '.cache/hybrid/parent');
await mkdir(output, { recursive: true });
const port = process.env.LEAN_PORT || '42971';
const origin = `http://127.0.0.1:${port}/experiments/lean-cropper`;
const server = spawn('bun', ['experiments/lean-cropper/serve.ts'], {
  cwd: repo, env: { ...process.env, LEAN_PORT: port }, stdio: ['ignore', 'pipe', 'pipe'],
});
let errors = ''; server.stderr.on('data', chunk => { errors += chunk; });
await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error(errors); })]);
const results = [];
let browser;
try {
  for (const name of (process.env.LEAN_BROWSERS || 'chromium,firefox,webkit').split(',')) {
    browser = await ({ chromium, firefox, webkit }[name]).launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(`${origin}/checks/harness.html`);
    await page.evaluate(() => window.ready);
    const model = await page.evaluate(async () => {
      const assert = (ok, message) => { if (!ok) throw new Error(message); };
      const near = (a, b, epsilon = 1e-7) => Math.abs(a - b) <= epsilon;
      let assertions = 0;
      const covered = s => {
        // Native DOMMatrix is independent of the implementation's inverse/constraint helpers.
        const inverse = new DOMMatrix(s.transform).inverse(), v = s.viewport;
        for (const [x, y] of [[v.x,v.y],[v.x+v.width,v.y],[v.x,v.y+v.height],[v.x+v.width,v.y+v.height]]) {
          const p = inverse.transformPoint({x,y});
          assert(Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -1e-7 && p.y >= -1e-7 &&
            p.x <= s.image.width + 1e-7 && p.y <= s.image.height + 1e-7, `Uncovered crop corner: ${JSON.stringify(p)} / ${JSON.stringify(s)}`);
          assertions++;
        }
      };
      const host = document.createElement('div'); host.style.cssText = 'width:480px;height:320px'; document.body.append(host);
      let notifications = 0, policy = 'fill';
      const hybrid = new api.LeanCropper(host, { onChange(s) { notifications++; if (policy === 'fill') covered(s); } });
      window.hybrid = hybrid; window.hybridHost = host;
      const white = document.createElement('canvas'); white.width = 801; white.height = 533;
      white.getContext('2d').fillStyle = '#fff'; white.getContext('2d').fillRect(0,0,801,533);
      const blob = await new Promise(resolve => white.toBlob(resolve)); await hybrid.load(blob); covered(hybrid.getState());
      const validLoad=hybrid.load(blob), invalidLoad=hybrid.load({});
      const loads=await Promise.allSettled([validLoad,invalidLoad]);
      assert(loads[0].status==='fulfilled', 'Invalid input canceled a valid pending load');
      assert(loads[1].status==='rejected'&&loads[1].reason.name==='TypeError', 'Non-Blob input did not reject');
      const createElement = document.createElement;
      let interactiveCanvasAllocations = 0;
      document.createElement = function(tag,...args) {
        if (String(tag).toLowerCase()==='canvas') interactiveCanvasAllocations++;
        return createElement.call(this,tag,...args);
      };
      for (let i = 0; i < 60; i++) {
        hybrid.reset(); hybrid.rotate((i * 137.508) % 360 + .00001);
        if (i % 2) hybrid.flip('horizontal'); if (i % 3) hybrid.flip('vertical');
        hybrid.setAspect([null,1,4/3,9/16][i % 4]);
        hybrid.setViewport({x:20+i%35,y:15+i%20,width:120+i%150,height:80+i%100});
        hybrid.pan(Math.cos(i) * 100000, Math.sin(i) * 100000);
        hybrid.zoom(.000001, {x:37,y:91}); covered(hybrid.getState());
        const minimum = hybrid.getState();
        for (let j=0;j<4;j++) hybrid.zoom(.25, {x:37,y:91});
        const after = hybrid.getState();
        assert(after.transform.every((n,j)=>near(n,minimum.transform[j])), 'Zoom drifts below the coverage minimum');
        const saved = hybrid.getState(); hybrid.reset(); hybrid.setState(JSON.parse(JSON.stringify(saved)));
        assert(hybrid.getState().transform.every((n,j)=>near(n,saved.transform[j])), 'Covered state failed round-trip');
        covered(hybrid.getState());
      }
      document.createElement = createElement;
      assert(interactiveCanvasAllocations===0, 'Interactions unexpectedly rasterized through a new canvas');
      hybrid.setAspect(null); hybrid.reset();
      const s = hybrid.getState();
      hybrid.setState({...s, transform:[.4,.17,.23,.65,-80,25]}); covered(hybrid.getState());
      const before = JSON.stringify(hybrid.getState());
      for (const bad of [()=>hybrid.setCoverage('invalid'), ()=>hybrid.setMask('invalid'), ()=>hybrid.pan(Infinity,0)]) {
        let threw = false; try {bad();} catch {threw=true;} assert(threw, 'Invalid request accepted');
        assert(JSON.stringify(hybrid.getState()) === before, 'Invalid request mutated state');
      }
      policy = 'free'; let count=notifications; hybrid.setCoverage('free'); assert(notifications-count <= 1, 'Duplicate coverage notification');
      hybrid.pan(100000,100000);
      const free = api.toCanvas(hybrid,{width:10});
      assert(free.getContext('2d').getImageData(5,5,1,1).data[3] === 0, 'Free mode must permit empty areas');
      count=notifications; policy='fill'; hybrid.setCoverage('fill'); assert(notifications-count <= 1, 'Duplicate coverage notification'); covered(hybrid.getState());
      hybrid.setAspect(1); hybrid.reset(); hybrid.setMask('circle');
      const circle = api.toCanvas(hybrid,{width:128});
      assert(circle.getContext('2d').getImageData(0,0,1,1).data[3] === 0, 'Circle corner is not transparent');
      assert(circle.getContext('2d').getImageData(64,64,1,1).data[3] === 255, 'Circle center is not covered');
      const savedMask=hybrid.getState(); hybrid.setMask('rect'); hybrid.setState(savedMask);
      assert(hybrid.getState().mask==='circle', 'Mask did not restore');
      const legacy={...hybrid.getState()}; delete legacy.mask; hybrid.setState(legacy);
      assert(hybrid.getState().mask==='rect', 'Missing v1 mask must mean rectangle');
      const bars=api.toCanvas(hybrid,{width:400,height:200});
      assert(bars.width===400&&bars.height===200, 'Requested output dimensions changed');
      const ctx=bars.getContext('2d');
      assert(ctx.getImageData(10,100,1,1).data[3]===0&&ctx.getImageData(390,100,1,1).data[3]===0, 'Output stretched instead of letterboxed');
      assert(ctx.getImageData(200,100,1,1).data[3]===255, 'Letterboxed content disappeared');
      white.width=white.height=1; white.getContext('2d').fillStyle='#fff'; white.getContext('2d').fillRect(0,0,1,1);
      await hybrid.load(await new Promise(resolve=>white.toBlob(resolve))); hybrid.rotate(37); hybrid.zoom(.001); covered(hybrid.getState());
      assert(Math.sqrt(Math.abs(new DOMMatrix(hybrid.getState().transform).a*new DOMMatrix(hybrid.getState().transform).d-new DOMMatrix(hybrid.getState().transform).b*new DOMMatrix(hybrid.getState().transform).c))>64, 'Tiny image was limited below coverage');
      await hybrid.load(blob); hybrid.setAspect(null); hybrid.setViewport({x:60,y:40,width:360,height:240});
      hybrid.setMask('rect');
      return {cornerAssertions:assertions,notifications,interactiveCanvasAllocations,source:'opaque 801x533 + 1x1 PNG',defaultCoverage:'fill'};
    });
    const keyboard = await page.evaluate(() => {
      const original = hybrid.getState(), before = JSON.stringify(original);
      const shortcuts = [{key:'+',ctrlKey:true},{key:'=',ctrlKey:true},{key:'-',metaKey:true},{key:'ArrowLeft',altKey:true},{key:'ArrowUp',ctrlKey:true}];
      for (const target of [hybrid.element, hybrid.element.querySelector('[data-handle="se"]')]) {
        for (const shortcut of shortcuts) {
          const event = new KeyboardEvent('keydown', {...shortcut,bubbles:true,cancelable:true}); target.dispatchEvent(event);
          if (event.defaultPrevented || JSON.stringify(hybrid.getState()) !== before) throw new Error('Browser shortcut was intercepted');
        }
      }
      const zoom = new KeyboardEvent('keydown',{key:'+',shiftKey:true,bubbles:true,cancelable:true});
      hybrid.element.dispatchEvent(zoom);
      if (!zoom.defaultPrevented || JSON.stringify(hybrid.getState()) === before) throw new Error('Shift-plus no longer zooms');
      const viewport = {...hybrid.getState().viewport,x:40}; hybrid.setViewport(viewport);
      const move = new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true,cancelable:true});
      hybrid.element.querySelector('[data-handle="move"]').dispatchEvent(move);
      if (!move.defaultPrevented || Math.abs(hybrid.getState().viewport.x-50)>1e-7) throw new Error('Shift-arrow no longer moves by ten pixels');
      hybrid.setState(original);
      return {reservedShortcuts:10,shiftZoom:true,shiftMove:true};
    });
    await page.evaluate(() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const beforeResize = await page.evaluate(()=>hybrid.getState());
    await page.evaluate(()=>hybridHost.style.width='560px');
    await page.evaluate(() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const resize = await page.evaluate(()=>{
      const s=hybrid.getState(), v=s.viewport, m=new DOMMatrix(s.transform).inverse();
      return {state:s,corners:[[v.x,v.y],[v.x+v.width,v.y],[v.x,v.y+v.height],[v.x+v.width,v.y+v.height]].map(([x,y])=>m.transformPoint({x,y}).toJSON())};
    });
    assert.notEqual(resize.state.stage.width,beforeResize.stage.width);
    for(const p of resize.corners) assert.ok(p.x>=-1e-7&&p.y>=-1e-7&&p.x<=resize.state.image.width+1e-7&&p.y<=resize.state.image.height+1e-7);
    const box = await page.locator('.lc-stage').last().boundingBox();
    const crop = resize.state.viewport;
    const rectScreenshot = await page.screenshot();
    await page.evaluate(()=>hybrid.setMask('circle'));
    const circleScreenshot = await page.screenshot();
    const sample = async image => page.evaluate(async ({image,x,y})=>{
      const pic=new Image(); pic.src='data:image/png;base64,'+image; await pic.decode();
      const canvas=document.createElement('canvas');canvas.width=pic.width;canvas.height=pic.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(pic,0,0);return [...ctx.getImageData(x,y,1,1).data];
    },{image:image.toString('base64'),x:Math.round(box.x+crop.x+crop.width*.16),y:Math.round(box.y+crop.y+crop.height*.08)});
    const rectPixel = await sample(rectScreenshot), circlePixel=await sample(circleScreenshot);
    assert.ok(rectPixel.slice(0,3).every(n=>n>245), `${name}: white rectangle preview ${rectPixel}`);
    assert.ok(circlePixel.slice(0,3).some(n=>n<220), `${name}: outside ellipse not visually masked ${circlePixel}`);
    await page.evaluate(()=>{hybrid.destroy();hybridHost.remove();});
    await page.goto(`${origin}/dist/`); await page.waitForFunction(()=>!document.querySelector('#export').disabled);
    assert.equal(await page.getByLabel('Image coverage').inputValue(),'fill');
    await page.getByLabel('Aspect ratio').selectOption('1.3333333333333333');
    await page.getByLabel('Crop shape').selectOption('circle');
    assert.equal(await page.getByLabel('Aspect ratio').inputValue(),'1');
    assert.equal(await page.getByLabel('Aspect ratio').isDisabled(),true);
    assert.match(await page.locator('#shape-hint').textContent(),/locked to Square/);
    await page.getByLabel('Crop shape').selectOption('ellipse');
    assert.equal(await page.getByLabel('Aspect ratio').isDisabled(),false);
    assert.equal(await page.getByLabel('Aspect ratio').inputValue(),'');
    await page.getByLabel('Aspect ratio').selectOption('1.3333333333333333');
    await page.getByLabel('Crop shape').selectOption('circle');
    assert.equal(await page.getByLabel('Aspect ratio').inputValue(),'1');
    for (const value of ['', '0', '1.5']) {
      await page.getByLabel('Export width (px)').fill(value);
      await page.getByRole('button',{name:'Export PNG',exact:true}).click();
      assert.match(await page.locator('#status').textContent(),/1 pixel or more.*whole number/);
      assert.equal(await page.locator('#export-width').evaluate(el=>el===document.activeElement),true);
      assert.equal(await page.getByRole('button',{name:'Export PNG',exact:true}).isDisabled(),false);
    }
    await page.getByLabel('Export width (px)').fill('320');
    await page.getByRole('button',{name:'Export PNG',exact:true}).click();
    await page.getByRole('link',{name:'Download PNG'}).waitFor();
    const rendered=await page.locator('#result img').evaluate(img=>[img.naturalWidth,img.naturalHeight]);assert.deepEqual(rendered,[320,320]);
    await page.screenshot({path:resolve(output,`${name}-hybrid-demo.png`),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.getByLabel('Aspect ratio').inputValue(),'1');
    assert.equal(await page.getByLabel('Aspect ratio').isDisabled(),true);
    await page.screenshot({path:resolve(output,`${name}-hybrid-mobile.png`),fullPage:true});
    // A file replacement invalidates a pending export instead of displaying stale pixels.
    await page.evaluate(()=>{
      const native=HTMLCanvasElement.prototype.toBlob;
      window.restoreEncoder=()=>{HTMLCanvasElement.prototype.toBlob=native;};
      HTMLCanvasElement.prototype.toBlob=function(callback,...args){
        window.finishPendingExport=()=>new Promise(resolve=>native.call(this,blob=>{callback(blob);queueMicrotask(resolve);},...args));
      };
    });
    await page.getByRole('button',{name:'Export PNG',exact:true}).click();
    await page.waitForFunction(()=>typeof window.finishPendingExport==='function');
    await page.locator('#file').setInputFiles(resolve(repo,'experiments/lean-cropper/checks/fixtures/landmarks.png'));
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('640 × 480 image ready'));
    assert.equal(await page.getByLabel('Aspect ratio').inputValue(),'1');
    assert.equal(await page.getByLabel('Aspect ratio').isDisabled(),true);
    await page.evaluate(async()=>{window.restoreEncoder();await window.finishPendingExport();});
    assert.equal(await page.locator('#result img').count(),0,'Old export reappeared after changing the source');
    assert.ok((await page.locator('#status').textContent()).startsWith('640 × 480 image ready'));
    await page.evaluate(()=>{
      const native=HTMLCanvasElement.prototype.toBlob;
      window.restoreEncoder=()=>{HTMLCanvasElement.prototype.toBlob=native;};
      HTMLCanvasElement.prototype.toBlob=function(callback){window.failPendingExport=()=>callback(null);};
    });
    await page.getByRole('button',{name:'Export PNG',exact:true}).click();
    await page.waitForFunction(()=>typeof window.failPendingExport==='function');
    await page.locator('#file').setInputFiles(resolve(repo,'experiments/lean-cropper/checks/fixtures/orientation-6.jpg'));
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('160 × 240 image ready'));
    assert.equal(await page.getByLabel('Aspect ratio').inputValue(),'1');
    await page.evaluate(async()=>{window.restoreEncoder();window.failPendingExport();await Promise.resolve();await Promise.resolve();});
    assert.ok((await page.locator('#status').textContent()).startsWith('160 × 240 image ready'),'Stale encoding error replaced current status');
    assert.deepEqual(pageErrors,[]);
    results.push({browser:name,version:browser.version(),...model,keyboard,maskPixels:{rectPixel,circlePixel},demoExport:rendered,staleExportSuppressed:true,passed:true});
    await browser.close();browser=undefined;
    console.log(`${name}: fill/free, affine coverage, masks, sizing, restore, resize and demo passed`);
  }
  await writeFile(resolve(output,'hybrid-browser.json'),JSON.stringify(results,null,2)+'\n');
} finally {if(browser)await browser.close();server.kill();}
