import assert from 'node:assert/strict';
import { around, point, translate, unproject, type Matrix } from '../src/affine';
import { copy, initial, reframe, resizeRect, validate, type Corner } from '../src/model';

let assertions = 0;
const close = (a: number, b: number, tolerance = 1e-7) => { assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`); assertions++; };
const stage = { width: 640, height: 480 }, image = { width: 2400, height: 1600 };
const original = initial(image, stage, 4 / 3);
validate(original, image);
assert.deepEqual(JSON.parse(JSON.stringify(original)), original); assertions++;
const detached = copy(original); detached.transform[0] = 99; detached.viewport.x = 99;
assert.notEqual(detached.transform[0], original.transform[0]); assert.notEqual(detached.viewport.x, original.viewport.x); assertions += 2;
let seed = 517;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
for (let n = 0; n < 400; n++) {
  const angle = random() * Math.PI * 2, scale = .03 + random() * 4, flipX = n % 2 ? -1 : 1, flipY = n % 3 ? 1 : -1;
  const m: Matrix = [Math.cos(angle) * scale * flipX, Math.sin(angle) * scale * flipX,
    -Math.sin(angle) * scale * flipY, Math.cos(angle) * scale * flipY, random() * 640, random() * 480];
  const source = { x: random() * image.width, y: random() * image.height };
  const restored = unproject(m, point(m, source)); close(restored.x, source.x); close(restored.y, source.y);
  const anchor = { x: random() * 640, y: random() * 480 }, before = unproject(m, anchor), k = .2 + random() * 2;
  const after = point(around(m, k, 0, 0, k, anchor), before); close(after.x, anchor.x); close(after.y, anchor.y);
  const state = { ...copy(original), transform: translate(m, 21, -17) };
  const serialized = JSON.parse(JSON.stringify(state)); validate(serialized, image);
  const reframed = reframe(serialized, { width: 333, height: 777 });
  const returned = reframe(reframed, stage);
  const v = state.viewport, nv = reframed.viewport;
  for (const [x, y] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const a = unproject(m, { x: v.x + v.width * x!, y: v.y + v.height * y! });
    // Compare corresponding crop/source points using the translated transform as well.
    const a2 = unproject(state.transform, { x: v.x + v.width * x!, y: v.y + v.height * y! });
    const b = unproject(reframed.transform, { x: nv.x + nv.width * x!, y: nv.y + nv.height * y! });
    assert.ok(Number.isFinite(a.x)); close(a2.x, b.x); close(a2.y, b.y);
  }
  // Fitting into a different stage can letterbox; its inverse fit need not restore scale.
  validate(returned, image);
}
for (const corner of ['nw', 'ne', 'sw', 'se'] as Corner[]) for (const aspect of [null, 1, 16 / 9]) for (const delta of [-1000, -30, 0, 50, 1000]) {
  const rect = resizeRect({ x: 120, y: 100, width: 240, height: 180 }, corner, delta, -delta / 2, stage, aspect);
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= stage.width + 1e-9 && rect.y + rect.height <= stage.height + 1e-9);
  assert.ok(rect.width > 0 && rect.height > 0); assertions += 2;
  if (aspect) close(rect.width / rect.height, aspect);
}
for (const mutate of [
  (s: typeof original) => { s.transform[0] = NaN; },
  (s: typeof original) => { s.transform = [0, 0, 0, 0, 0, 0]; },
  (s: typeof original) => { s.viewport.width = -1; },
  (s: typeof original) => { s.viewport.x = 999; },
  (s: typeof original) => { s.aspect = 7; },
  (s: typeof original) => { s.image.width = 5; },
]) { const s = copy(original); mutate(s); assert.throws(() => validate(s, image)); assertions++; }
console.log(JSON.stringify({ passed: true, assertions, seededTransforms: 400, resizeCombinations: 60 }));
