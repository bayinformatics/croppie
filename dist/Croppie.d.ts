import type { BindFileOptions, BindOptions, CroppieData, CroppieEventHandler, CroppieEvents, CroppieOptions, ResultOptions } from "./types.js";
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
    /** The rotation `bind()` started with; `reset()` returns to it. */
    private initialRotation;
    /** The EXIF Orientation tag of the bound image (only read with `enableExif`); informational. */
    private exifOrientation;
    /** The object URL `bindFile()` made for the bound image; revoked once nothing shows it. */
    private objectUrl;
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
     * A `rotation` that is not a multiple of 90 rejects before anything changes, so it
     * neither half-applies the new image nor cancels a bind that is still loading.
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
     * The rotation a bind starts with: the validated `rotation` option; else the rotation an
     * explicit `orientation` (EXIF 1-8) stands for; else 0. Mirrored or out-of-range
     * orientations cannot be expressed as a rotation, so they are ignored with a warning.
     *
     * @throws RangeError if `bindOptions.rotation` is not a multiple of 90
     */
    private resolveBindRotation;
    /**
     * The asynchronous part of every bind, for the bind that claimed `generation` (`bind()`
     * and `bindFile()` validate their arguments before claiming it, so a call they reject
     * supersedes nothing): produces the image URL (`bindFile()` reads it from the file), loads
     * the image, then hands it and its URL to `apply`.
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
     * Applies a loaded image with the bind's `bindOptions` (its URL, zoom and points), and the
     * `rotation` and (natural-frame) `points` resolved from them before the bind claimed its
     * generation (`points` is `undefined` when malformed).
     *
     * @throws Error if the image has no intrinsic size
     */
    private load;
    /**
     * Binds a File or Blob to the cropper, with the same `options` as `bind()` except `url`:
     * `rotation`, `orientation`, `points` and `zoom` apply exactly as there (an invalid
     * `rotation` rejects with a `RangeError` before anything changes; malformed `points` are
     * ignored with a warning), so a file can be bound back with the data `get()` returned.
     *
     * Anything else than a File or Blob (such as the `undefined` of an empty file input)
     * rejects with a `TypeError` before anything changes, so it does not cancel a bind that is
     * still loading. Like `bind()`, it rejects with an `AbortError` when a later bind
     * supersedes it or the instance is destroyed while the file loads.
     */
    bindFile(file: File | Blob, options?: BindFileOptions): Promise<void>;
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
     * Rotates the image clockwise by `degrees`, any multiple of 90 (negative turns
     * counter-clockwise). The image pixel under the viewport center stays there, unless the
     * rotated image would then no longer cover the viewport; then the image moves the least
     * needed.
     *
     * Emits `rotate`, then `update`, then `zoom` if the zoom had to change: the zoom limits are
     * recomputed for the rotated image, so with a non-square viewport a quarter turn may raise
     * the zoom to the new minimum. As with `setZoom()`, when an `update` listener zooms again,
     * only its final zoom is reported. Rotating by a full turn or 0, before an image is bound or
     * after `destroy()` does nothing. `points` in `get()` stay in the natural frame.
     * Calling it while the user is dragging is not special-cased.
     *
     * @param degrees - Clockwise rotation in degrees
     * @throws RangeError if `degrees` is not a finite multiple of 90
     */
    rotate(degrees: number): void;
    /**
     * Restores the rotation `bind()` started with, re-centers the image and returns to the
     * coverage zoom of that rotation (clamped to the zoom limits).
     *
     * Emits `rotate` when the rotation changed, then `update`, then `zoom` when the zoom
     * changed. As with `setZoom()`, when an `update` listener zooms again, only its final zoom
     * is reported.
     */
    reset(): void;
    /**
     * Shows the rotation, position and zoom that `rotate()` or `reset()` settled, then emits
     * their events in the documented order: `rotate` when the rotation changed, `update`, and
     * `zoom` when the settled zoom differs from `previousZoom`.
     *
     * Like `applyZoom()`, the `zoom` event is decided from the zoom settled here, before any
     * listener runs: when a listener zooms again, its nested call already emitted the final
     * zoom and this one emits none, so `zoom` never reports a value that was already replaced.
     */
    private commitTurn;
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
     * Revokes the object URL of a bound file, if there is one
     */
    private revokeObjectUrl;
    /**
     * Resolves the effective minimum zoom for the bound image shown at `rotation` (see
     * `resolveMinZoom`), stores it with the coverage zoom of the image as displayed (the one
     * place both are computed), and syncs the slider's `min`, so the slider range is never
     * inverted.
     *
     * @returns The zoom at which the displayed image covers the viewport
     */
    private updateZoomLimits;
    /**
     * The dimensions of the image as displayed: the natural size, swapped for a quarter turn.
     *
     * @param rotation - Defaults to the current rotation
     */
    private displayedSize;
    /**
     * Updates the CSS transform on the preview element.
     *
     * The `<img>` keeps its natural size with transform-origin 0 0, so the transform is
     * `translate(tx, ty) scale(s) rotate(r)`. The rotation is about the displayed image's
     * center, which sits at `(x, y)` from the boundary center, so
     * `(tx, ty) = (B.w/2 + x, B.h/2 + y) - s * R(r)(W/2, H/2)`, with `R` from `rotateOffset()`.
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
     * Calculates the crop points based on current transform, clamped to the image, in the
     * natural frame (the pixel space of the image as decoded): the displayed-frame rectangle
     * is clamped to the displayed image and then mapped back through the rotation.
     */
    private getPoints;
    /**
     * The viewport rectangle in the DISPLAYED frame (the image after rotation), in image
     * pixels and NOT clamped to the image: it extends past the image when the user zoomed out
     * further than the image covers. With `(Dw, Dh)` the displayed dimensions:
     * `topLeft = (Dw/2 - (x + vw/2) / s, Dh/2 - (y + vh/2) / s)` and `bottomRight = topLeft +
     * (vw, vh) / s`.
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
