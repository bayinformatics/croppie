import type { BindOptions, CroppieData, CroppieEventHandler, CroppieEvents, CroppieOptions, ResultOptions } from "./types.js";
/**
 * Modern, TypeScript-first image cropper.
 *
 * @example
 * ```ts
 * const croppie = new Croppie(element, {
 *   viewport: { width: 200, height: 200, type: 'circle' }
 * })
 *
 * await croppie.bind({ url: 'image.jpg' })
 * const blob = await croppie.result({ type: 'blob' })
 * ```
 */
export declare class Croppie {
    private readonly element;
    private readonly options;
    private container;
    private boundaryEl;
    private viewportEl;
    private overlayEl;
    private previewEl;
    private sliderEl;
    private image;
    private transform;
    /**
     * `options.zoom` with its defaults applied: `min` as given (undefined when unset, then the
     * minimum is per image), `max` and `enforceMinimumCoverage` defaulted. An explicit
     * `undefined` counts as unset.
     */
    private readonly zoomConfig;
    /**
     * The lowest zoom the user may reach: resolved per image on bind (see `resolveMinZoom`);
     * before that, the configured or default minimum, capped at `zoom.max`.
     */
    private effectiveMinZoom;
    /**
     * The zoom at which the bound image just covers the viewport, stored with the zoom limits
     * by `updateZoomLimits()`: where `bind()` starts by default and `reset()` returns to.
     */
    private coverage;
    private eventHandlers;
    private cleanupFns;
    private destroyed;
    private bindGeneration;
    /** The transform before any image is bound, and again after `destroy()`. */
    private static initialTransform;
    constructor(element: HTMLElement, givenOptions: CroppieOptions);
    /**
     * Creates all DOM elements
     */
    private createElements;
    /**
     * Attaches drag and zoom event handlers
     */
    private attachEventHandlers;
    /**
     * Loads an image into the cropper.
     *
     * Malformed `points` (an array without exactly 4 entries, a coordinate that is not a
     * number, a rect without width or height) are ignored with a console warning, and the
     * image gets its default framing.
     *
     * Only the newest bind applies its image. A bind that a later `bind()` or `bindFile()`
     * supersedes while it loads rejects with a `DOMException` named `AbortError`
     * ("bind() was superseded by a later bind() call"), and so does one whose instance is
     * destroyed meanwhile ("instance destroyed during bind()"). A call on a destroyed instance
     * rejects at once without superseding anything.
     */
    bind(options: BindOptions | string): Promise<void>;
    /**
     * The asynchronous part of every bind, for the bind that claimed `generation` (`bind()`
     * and `bindFile()` validate their arguments before claiming it, so a call they reject
     * supersedes nothing): produces the image URL (`bindFile()` reads it from the file), loads
     * the image, then hands it to `apply`.
     *
     * Only the newest bind applies anything. Once a later bind claimed a generation, or the
     * instance was destroyed, the next step rejects with an `AbortError` instead, whether it
     * succeeded or failed: the caller learns that its image was not applied, and a load error
     * nobody waits for any more is not reported as such.
     *
     * @param generation - The generation the bind claimed
     * @param produceUrl - Gives the URL of the image to load
     * @param apply - Applies the loaded image; runs only while the bind is the newest
     */
    private runBind;
    /**
     * Settles like `step` while the bind that claimed `generation` is still the newest, and
     * rejects with an `AbortError` once it is not (see `runBind()`).
     */
    private whileNewest;
    /**
     * Throws an `AbortError` `DOMException` if the instance was destroyed or a later bind
     * claimed a generation after the bind that claimed `generation`.
     */
    private assertNewestBind;
    /**
     * Applies a loaded image with the bind's `bindOptions` (zoom, points) and the `points`
     * resolved from them before the bind claimed its generation (`undefined` when malformed).
     *
     * @throws Error if the image has no intrinsic size
     */
    private load;
    /**
     * Binds a File or Blob to the cropper. Anything else (such as the `undefined` of an
     * empty file input) rejects with a `TypeError` before anything changes, so it does not
     * cancel a bind that is still loading. Like `bind()`, it rejects with an `AbortError`
     * when a later bind supersedes it or the instance is destroyed while the file loads.
     */
    bindFile(file: File | Blob): Promise<void>;
    /**
     * Gets the current cropped result. The return type follows `options.type`:
     * `"blob"` gives a `Blob`, `"base64"` a data URL string and `"canvas"` the canvas.
     *
     * The image keeps its proportions at every `size`: a size of another shape than the
     * viewport centers the crop and leaves the rest transparent (or `backgroundColor`). An
     * `"original"` or custom size is scaled down, keeping its shape, to at most 16,777,216 px
     * (4096x4096) and 16,384 px a side, so the canvas stays within what browsers can allocate
     * (iOS Safari draws nothing on a larger one), and rounded to whole pixels. A custom
     * width or height that is not a positive finite number rejects with a `RangeError`.
     */
    result(options: ResultOptions & {
        type: "blob";
    }): Promise<Blob>;
    result(options: ResultOptions & {
        type: "base64";
    }): Promise<string>;
    result(options: ResultOptions & {
        type: "canvas";
    }): Promise<HTMLCanvasElement>;
    result(options: ResultOptions): Promise<Blob | string | HTMLCanvasElement>;
    /**
     * Gets the current crop data
     */
    get(): CroppieData;
    /**
     * Gets the current zoom level
     */
    get zoom(): number;
    /**
     * Sets the zoom level, exactly like `setZoom()`
     */
    set zoom(value: number);
    /**
     * Sets the zoom level, clamped to the effective zoom limits. Zooms about the
     * viewport center. Emits `update` then `zoom` only when the clamped zoom changed.
     * A numeric string (such as a range input's `value`) is converted to a number;
     * a value that is then not finite, a blank string included, is ignored.
     */
    setZoom(value: number): void;
    /**
     * The single path for every zoom change (setZoom, slider, wheel, pinch).
     *
     * Clamps the request to the effective limits, zooms about `anchor` so the image point
     * under it stays put, re-clamps the position, syncs the slider and emits `update`
     * then `zoom`. Nothing is emitted when the clamped zoom did not change. When an `update`
     * listener zooms again, that nested call emits the final `zoom` and this one emits none,
     * so `zoom` never reports a value that has already been replaced.
     *
     * @param requested - Requested zoom level; not clamped by the caller
     * @param anchor - Offset from the boundary center to keep fixed (default: the viewport center)
     * @returns Whether the zoom changed, in which case `update` was emitted
     */
    private applyZoom;
    /**
     * Rotates the image by 90 degree increments
     */
    rotate(degrees: 90 | 180 | 270 | -90): void;
    /**
     * Re-centers the image and returns to the coverage zoom (clamped to the zoom limits).
     *
     * The zoom goes through the same path as `setZoom()`, so the events follow the same
     * contract: `update` then `zoom` when the zoom changed, `update` alone when only the
     * position did, and no stale `zoom` when an `update` listener zooms again.
     */
    reset(): void;
    /**
     * Destroys the cropper and cleans up
     */
    destroy(): void;
    /**
     * Registers an event handler
     */
    on<K extends keyof CroppieEvents>(event: K, handler: CroppieEventHandler<K>): void;
    /**
     * Removes an event handler
     */
    off<K extends keyof CroppieEvents>(event: K, handler: CroppieEventHandler<K>): void;
    /**
     * Throws if the instance was destroyed, naming the method that was called
     */
    private assertNotDestroyed;
    /**
     * Resolves the effective minimum zoom for an image (see `resolveMinZoom`), stores it with
     * the image's coverage zoom (the one place both are computed), and syncs the slider's
     * `min`, so the slider range is never inverted.
     *
     * @returns The zoom at which the image covers the viewport
     */
    private updateZoomLimits;
    /**
     * The smallest zoom at which `image` covers the viewport (computed for
     * `updateZoomLimits()`, which stores it as `coverage`).
     */
    private coverageZoom;
    /**
     * Updates the CSS transform on the preview element
     */
    private updateTransform;
    /**
     * Updates the slider value to match current zoom, and its spoken value ("150%")
     */
    private updateSlider;
    /**
     * Constrains the current position to keep the image covering the viewport
     */
    private constrainPosition;
    /**
     * Calculates the crop points based on current transform, clamped to the image
     */
    private getPoints;
    /**
     * The viewport rectangle in image pixels, NOT clamped to the image: it extends past the
     * image when the user zoomed out further than the image covers. `result()` renders this
     * frame so the output keeps the image's proportions.
     */
    private getViewportRect;
    /**
     * Emits an update event
     */
    private emitUpdate;
    /**
     * Emits an event to all registered handlers
     */
    private emitEvent;
}
