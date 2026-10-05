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
    private effectiveMinZoom;
    private eventHandlers;
    private cleanupFns;
    private destroyed;
    private bindGeneration;
    constructor(element: HTMLElement, options: CroppieOptions);
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
     */
    bind(options: BindOptions | string): Promise<void>;
    /**
     * Loads and applies an image for a bind that claimed `generation`, with the `points` that
     * `bind()` resolved from `bindOptions` before claiming it (`undefined` when malformed). If
     * the instance was destroyed or a newer bind started meanwhile, resolves without applying
     * or emitting anything, and without surfacing a load error nobody is waiting for any more.
     */
    private load;
    /**
     * Binds a File or Blob to the cropper. Anything else (such as the `undefined` of an
     * empty file input) rejects with a `TypeError` before anything changes, so it does not
     * cancel a bind that is still loading.
     */
    bindFile(file: File | Blob): Promise<void>;
    /**
     * Gets the current cropped result. The return type follows `options.type`:
     * `"blob"` gives a `Blob`, `"base64"` a data URL string and `"canvas"` the canvas.
     *
     * The image keeps its proportions at every `size`: a size of another shape than the
     * viewport centres the crop and leaves the rest transparent (or `backgroundColor`). With
     * `size: "original"`, a crop zoomed out past the image is scaled down to at most the area
     * of the image part it shows or 4096x4096 px, whichever is larger.
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
     * viewport centre. Emits `update` then `zoom` only when the clamped zoom changed.
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
     * @param anchor - Offset from the boundary centre to keep fixed (default: the viewport centre)
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
     * Whether a bind that claimed `generation` was destroyed or superseded in the meantime
     */
    private isStaleBind;
    /**
     * Resolves the effective minimum zoom for an image (see `resolveMinZoom`) and syncs
     * the slider's `min`, so the slider range is never inverted.
     *
     * @returns The zoom at which the image covers the viewport
     */
    private updateZoomLimits;
    /**
     * The smallest zoom at which `image` covers the viewport: where `bind()` starts by default
     * and `reset()` returns to.
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
