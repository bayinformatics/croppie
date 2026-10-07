import { around, translate, type Point } from './affine';
import { center, clamp, copy, finite, fitRect, initial, reframe, resizeRect, validate, type Corner, type CropState, type Rect, type Size } from './model';
export type { Matrix, Point } from './affine';
export type { CropState, Rect, Size } from './model';

export interface Options {
  aspect?: number | null;
  onChange?: (state: CropState) => void;
}
export interface Source { image: HTMLImageElement; blob: Blob }
type Drag = { mode: 'pan' | 'move' | Corner; start: Point; rect: Rect };

/** Native-image experiment. Requires core.css and a host with a nonzero width/height. */
export class LeanCropper {
  readonly element = document.createElement('div');
  private crop = document.createElement('div');
  private state?: CropState;
  private source?: Source;
  private url?: string;
  private dead = false;
  private events = new AbortController();
  private loading?: AbortController;
  private observer: ResizeObserver;
  private pointers = new Map<number, Point>();
  private drag?: Drag;

  constructor(host: HTMLElement, private options: Options = {}) {
    if (options.aspect != null && (!finite(options.aspect) || options.aspect <= 0)) throw new Error('Invalid aspect');
    const el = this.element;
    el.className = 'lc-stage'; el.tabIndex = 0;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Image editor. Arrow keys pan; plus and minus zoom.');
    this.crop.className = 'lc-crop';
    for (const [mode, label] of [['nw', 'Resize crop from top left'], ['ne', 'Resize crop from top right'],
      ['sw', 'Resize crop from bottom left'], ['se', 'Resize crop from bottom right'], ['move', 'Move crop rectangle']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.handle = mode; button.setAttribute('aria-label', `${label}. Use arrow keys.`);
      button.title = label!; button.textContent = mode === 'move' ? 'Move crop' : '';
      this.crop.append(button);
    }
    el.append(this.crop); host.append(el);
    const signal = this.events.signal;
    el.addEventListener('pointerdown', this.down, { signal });
    el.addEventListener('pointermove', this.move, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, this.up as EventListener, { signal });
    el.addEventListener('wheel', this.wheel, { passive: false, signal });
    el.addEventListener('keydown', this.key, { signal });
    this.observer = new ResizeObserver(() => {
      const size = this.size();
      if (this.state && size.width && size.height && (size.width !== this.state.stage.width || size.height !== this.state.stage.height)) {
        this.clearGesture(); this.state = reframe(this.state, size); this.render();
      }
    });
    this.observer.observe(el);
  }

  private alive() { if (this.dead) throw new Error('Cropper is destroyed'); }
  private current() { this.alive(); if (!this.state) throw new Error('Load an image first'); return this.state; }
  private size(): Size { return { width: this.element.clientWidth, height: this.element.clientHeight }; }
  private local(e: MouseEvent): Point {
    const r = this.element.getBoundingClientRect(), s = this.size();
    return { x: (e.clientX - r.left) * s.width / r.width, y: (e.clientY - r.top) * s.height / r.height };
  }
  private render() {
    const s = this.current(), v = s.viewport;
    this.source!.image.style.transform = `matrix(${s.transform.join(',')})`;
    Object.assign(this.crop.style, { left: `${v.x}px`, top: `${v.y}px`, width: `${v.width}px`, height: `${v.height}px` });
    this.element.classList.add('lc-loaded');
    this.options.onChange?.(copy(s));
  }

  /** Retains the original encoded Blob; stale/failed loads never replace a good image. */
  async load(input: Blob | string): Promise<CropState> {
    this.alive(); this.loading?.abort();
    const request = this.loading = new AbortController();
    let url: string | undefined;
    try {
      let blob: Blob;
      if (typeof input === 'string') {
        const response = await fetch(input, { signal: request.signal });
        if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
        blob = await response.blob();
      } else blob = input;
      request.signal.throwIfAborted();
      url = URL.createObjectURL(blob);
      const image = new Image();
      image.className = 'lc-image'; image.alt = ''; image.draggable = false;
      image.src = url; await image.decode(); request.signal.throwIfAborted();
      const size = this.size();
      if (!size.width || !size.height || !image.naturalWidth || !image.naturalHeight) throw new Error('Image and visible host need nonzero dimensions');
      image.style.width = `${image.naturalWidth}px`; image.style.height = `${image.naturalHeight}px`;
      this.clearGesture(); this.source?.image.remove();
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = url; this.source = { image, blob }; this.element.prepend(image);
      this.state = initial({ width: image.naturalWidth, height: image.naturalHeight }, size, this.options.aspect ?? null);
      this.render(); return this.getState();
    } catch (error) { if (url && url !== this.url) URL.revokeObjectURL(url); throw error; }
  }

  getState(): CropState { return copy(this.current()); }
  /** Borrowed source; do not change its image element or src. */
  getSource(): Source { this.current(); return { ...this.source! }; }
  setState(state: CropState) {
    const s = this.current(); validate(state, s.image);
    this.clearGesture(); this.state = reframe(state, s.stage); this.render();
  }
  reset() {
    const s = this.current(); this.clearGesture();
    this.state = initial(s.image, s.stage, s.aspect); this.render();
  }
  pan(x: number, y: number) {
    const s = this.current(); if (!finite(x, y)) throw new Error('Invalid pan');
    s.transform = translate(s.transform, x, y); this.render();
  }
  private zoomMatrix(factor: number, anchor: Point) {
    const s = this.current();
    if (!finite(factor, anchor.x, anchor.y) || factor <= 0) throw new Error('Invalid zoom');
    const scale = Math.sqrt(Math.abs(s.transform[0] * s.transform[3] - s.transform[1] * s.transform[2]));
    const k = clamp(scale * factor, .001, 64) / scale;
    s.transform = around(s.transform, k, 0, 0, k, anchor);
  }
  zoom(factor: number, anchor = center(this.current().viewport)) { this.zoomMatrix(factor, anchor); this.render(); }
  /** Clockwise degrees in stage space. */
  rotate(degrees: number, anchor = center(this.current().viewport)) {
    const s = this.current(); if (!finite(degrees, anchor.x, anchor.y)) throw new Error('Invalid rotation');
    const r = (degrees % 360) * Math.PI / 180, a = Math.cos(r), b = Math.sin(r);
    s.transform = around(s.transform, a, b, -b, a, anchor); this.render();
  }
  /** Reflection in the stage's horizontal/vertical axes around the crop center. */
  flip(axis: 'horizontal' | 'vertical') {
    const s = this.current();
    if (axis !== 'horizontal' && axis !== 'vertical') throw new Error('Invalid flip');
    s.transform = around(s.transform, axis === 'horizontal' ? -1 : 1, 0, 0, axis === 'vertical' ? -1 : 1, center(s.viewport)); this.render();
  }
  setViewport(rect: Rect) { const s = this.current(); s.viewport = fitRect(rect, s.stage, s.aspect); this.render(); }
  setAspect(aspect: number | null) {
    const s = this.current(), p = center(s.viewport), v = fitRect(s.viewport, s.stage, aspect);
    s.viewport = fitRect({ ...v, x: p.x - v.width / 2, y: p.y - v.height / 2 }, s.stage, aspect);
    s.aspect = aspect; this.render();
  }

  private clearGesture() {
    for (const id of this.pointers.keys()) if (this.element.hasPointerCapture(id)) this.element.releasePointerCapture(id);
    this.pointers.clear(); this.drag = undefined;
  }
  private down = (e: PointerEvent) => {
    if (!this.state || e.button !== 0 || this.pointers.size >= 2 || (this.pointers.size && this.drag?.mode !== 'pan')) return;
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');
    const p = this.local(e);
    if (!this.pointers.size) this.drag = { mode: (handle?.dataset.handle as Drag['mode']) || 'pan', start: p, rect: { ...this.state.viewport } };
    this.pointers.set(e.pointerId, p); this.element.setPointerCapture(e.pointerId);
    (handle || this.element).focus({ preventScroll: true }); e.preventDefault();
  };
  private move = (e: PointerEvent) => {
    const old = this.pointers.get(e.pointerId);
    if (!old || !this.drag || !this.state) return;
    const before = [...this.pointers.values()], p = this.local(e);
    this.pointers.set(e.pointerId, p);
    const s = this.state, drag = this.drag;
    if (this.pointers.size === 2) {
      const after = [...this.pointers.values()];
      const mid = (p: Point[]) => ({ x: (p[0]!.x + p[1]!.x) / 2, y: (p[0]!.y + p[1]!.y) / 2 });
      const distance = (p: Point[]) => Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
      const a = mid(before), b = mid(after), d = distance(before);
      if (d > 1 && distance(after) > 1) this.zoomMatrix(distance(after) / d, a);
      s.transform = translate(s.transform, b.x - a.x, b.y - a.y);
    } else if (drag.mode === 'pan') s.transform = translate(s.transform, p.x - old.x, p.y - old.y);
    else if (drag.mode === 'move') s.viewport = fitRect({ ...drag.rect, x: drag.rect.x + p.x - drag.start.x, y: drag.rect.y + p.y - drag.start.y }, s.stage, s.aspect);
    else s.viewport = resizeRect(drag.rect, drag.mode, p.x - drag.start.x, p.y - drag.start.y, s.stage, s.aspect);
    this.render();
  };
  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size) this.drag = undefined;
  };
  private wheel = (e: WheelEvent) => {
    if (!this.state) return; e.preventDefault();
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.state.stage.height : 1);
    this.zoom(Math.exp(-clamp(delta, -200, 200) * .002), this.local(e));
  };
  private key = (e: KeyboardEvent) => {
    if (!this.state) return;
    const k = e.key, n = e.shiftKey ? 10 : 1;
    const dx = k === 'ArrowLeft' ? -n : k === 'ArrowRight' ? n : 0;
    const dy = k === 'ArrowUp' ? -n : k === 'ArrowDown' ? n : 0;
    const handle = (e.target as HTMLElement).dataset.handle;
    if (dx || dy) {
      if (handle === 'move') this.setViewport({ ...this.state.viewport, x: this.state.viewport.x + dx, y: this.state.viewport.y + dy });
      else if (handle) { this.state.viewport = resizeRect(this.state.viewport, handle as Corner, dx, dy, this.state.stage, this.state.aspect); this.render(); }
      else this.pan(dx, dy);
    } else if (k === '+' || k === '=' || k === '-') this.zoom(k === '-' ? 1 / 1.1 : 1.1);
    else return;
    e.preventDefault();
  };

  destroy() {
    if (this.dead) return;
    this.dead = true; this.loading?.abort(); this.events.abort(); this.observer.disconnect(); this.clearGesture();
    this.element.remove(); if (this.url) URL.revokeObjectURL(this.url);
    this.state = undefined; this.source = undefined; this.url = undefined;
  }
}
