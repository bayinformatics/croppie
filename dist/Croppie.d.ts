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
    /** The rotation `bind()` started with; `reset()` returns to it. */
    private initialRotation;
    /** The EXIF Orientation tag of the bound image (only read with `enableExif`); informational. */
    private exifOrientation;
    /** The object URL `bindFile()` made for the bound image; revoked once nothing shows it. */
    private objectUrl;
    private zoomConfig;
    /** `options.zoom.min` as given; undefined when unset (then the minimum is per image). */
    private configuredMinZoom;
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
     * Loads an image into the cropper
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
     * Loads and applies an image for a bind that claimed `generation`. If the instance was
     * destroyed or a newer bind started meanwhile, resolves without applying or emitting
     * anything, and without surfacing a load error nobody is waiting for any more.
     */
    private load;
    /**
     * Binds a File or Blob to the cropper
     */
    bindFile(file: File | Blob): Promise<void>;
    /**
     * Gets the current cropped result. The return type follows `options.type`:
     * `"blob"` gives a `Blob`, `"base64"` a data URL string and `"canvas"` the canvas.
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
     * Sets the zoom level
     */
    set zoom(value: number);
    /**
     * Sets the zoom level, clamped to the effective zoom limits. Zooms about the
     * viewport center. Emits `update` then `zoom` only when the clamped zoom changed;
     * a non-finite value is ignored.
     */
    setZoom(value: number): void;
    /**
     * The single path for every zoom change (setZoom, slider, wheel, pinch).
     *
     * Clamps the request to the effective limits, zooms about `anchor` so the image point
     * under it stays put, re-clamps the position, syncs the slider and emits `update`
     * then `zoom`. Nothing is emitted when the clamped zoom did not change.
     *
     * @param requested - Requested zoom level; not clamped by the caller
     * @param anchor - Offset from the boundary center to keep fixed (default: the viewport center)
     */
    private applyZoom;
    /**
     * Rotates the image clockwise by `degrees`, any multiple of 90 (negative turns
     * counter-clockwise). The image pixel under the viewport center stays there.
     *
     * Emits `rotate`, then `update`, then `zoom` if the zoom had to change: the zoom limits are
     * recomputed for the rotated image, so with a non-square viewport a quarter turn may raise
     * the zoom to the new minimum. Rotating by a full turn or 0, before an image is bound or
     * after `destroy()` does nothing. `points` in `get()` stay in the natural frame.
     * Calling it while the user is dragging is not special-cased.
     *
     * @param degrees - Clockwise rotation in degrees
     * @throws RangeError if `degrees` is not a finite multiple of 90
     */
    rotate(degrees: number): void;
    /**
     * Resets the cropper to initial state
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
     * Revokes the object URL of a bound file, if there is one
     */
    private revokeObjectUrl;
    /**
     * Whether a bind that claimed `generation` was destroyed or superseded in the meantime
     */
    private isStaleBind;
    /**
     * Resolves the effective minimum zoom for an image shown at `rotation` (see
     * `resolveMinZoom`) and syncs the slider's `min`, so the slider range is never inverted.
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
     * `(tx, ty) = (B.w/2 + x, B.h/2 + y) - s * R(r)(W/2, H/2)`, written out per rotation.
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
