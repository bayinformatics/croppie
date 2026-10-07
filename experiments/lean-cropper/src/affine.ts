/** CSS/Canvas order; maps browser-oriented source pixels to stage CSS pixels. */
export type Matrix = [number, number, number, number, number, number];
export type Point = { x: number; y: number };

export function point(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function unproject(m: Matrix, p: Point): Point {
  const d = m[0] * m[3] - m[1] * m[2], x = p.x - m[4], y = p.y - m[5];
  return { x: (m[3] * x - m[2] * y) / d, y: (m[0] * y - m[1] * x) / d };
}

/** Left-compose a linear map around a stage-space anchor. */
export function around(m: Matrix, a: number, b: number, c: number, d: number, p: Point): Matrix {
  const x = m[4] - p.x, y = m[5] - p.y;
  return [a * m[0] + c * m[1], b * m[0] + d * m[1],
    a * m[2] + c * m[3], b * m[2] + d * m[3],
    a * x + c * y + p.x, b * x + d * y + p.y];
}

export function translate(m: Matrix, x: number, y: number): Matrix {
  return [m[0], m[1], m[2], m[3], m[4] + x, m[5] + y];
}
