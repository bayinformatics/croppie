// Experiment only: an explicit local Blob or an already decoded HTMLImageElement.
// This loader never fetches an image URL and never applies an EXIF transform.
export function createExportWorker() {
  const started = performance.now();
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const pending = new Map();
  let nextId = 0;
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  worker.onmessage = ({ data }) => {
    if (data.ready) {
      readyResolve({ ...data, startupMs: performance.now() - started });
      return;
    }
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if (data.error) job.reject(new Error(data.error));
    else job.resolve(data);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Worker failed");
    readyReject(error);
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  };
  return {
    ready,
    async run(source, spec) {
      const support = await ready;
      if (!support.supported) throw new Error(support.reason);
      const inputStarted = performance.now();
      const isBlob = source instanceof Blob;
      // The element has already been oriented by its decoder. No rotation is added.
      const input = isBlob ? source : await createImageBitmap(source);
      const bitmapCreateMs = performance.now() - inputStarted;
      const id = ++nextId;
      const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      const dispatched = performance.now();
      let postMessageMs;
      try {
        worker.postMessage({ id, input, isBlob, spec }, isBlob ? [] : [input]);
        postMessageMs = performance.now() - dispatched;
      } catch (error) {
        pending.delete(id);
        if (!isBlob) input.close();
        throw error;
      }
      const result = await response;
      const roundTripMs = performance.now() - dispatched;
      return {
        ...result,
        bitmapCreateMs,
        postMessageMs,
        roundTripMs,
        // Includes queueing, input transfer/clone and result Blob return; not pure copy time.
        dispatchAndReturnMs: roundTripMs - result.workerTotalMs,
      };
    },
    close() {
      worker.terminate();
      for (const job of pending.values()) job.reject(new Error("Worker closed"));
      pending.clear();
    },
  };
}
