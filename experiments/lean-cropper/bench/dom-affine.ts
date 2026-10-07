// Equivalent native implementation, included only in the size comparison build.
import type { Matrix, Point } from '../src/affine';
export type { Matrix, Point } from '../src/affine';
const tuple = (m: DOMMatrix): Matrix => [m.a, m.b, m.c, m.d, m.e, m.f];
export function point(m: Matrix, p: Point): Point { return new DOMMatrix(m).transformPoint(p); }
export function unproject(m: Matrix, p: Point): Point { return new DOMMatrix(m).inverse().transformPoint(p); }
export function around(m: Matrix, a: number, b: number, c: number, d: number, p: Point): Matrix {
  return tuple(new DOMMatrix([a, b, c, d, p.x - a * p.x - c * p.y, p.y - b * p.x - d * p.y]).multiply(new DOMMatrix(m)));
}
export function translate(m: Matrix, x: number, y: number): Matrix { return tuple(new DOMMatrix().translate(x, y).multiply(new DOMMatrix(m))); }
