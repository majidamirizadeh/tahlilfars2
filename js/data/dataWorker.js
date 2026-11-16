/* Web Worker for Excel processing - keeps main thread responsive */
self.onmessage = async (ev) => {
  const { id, buffer, processorId, xlsxUrls, ctx } = ev.data;
  try {
    // Load XLSX from provided URLs
    let XLSX = null;
    for (const url of (xlsxUrls || [])) {
      try {
        importScripts(url);
        XLSX = self.XLSX;
        if (XLSX) break;
      } catch (_) {}
    }
    if (!XLSX) throw { code: "LIB_FAILED", message: "XLSX library not available in worker" };

    // Dynamic import of pipeline (module worker)
    const { runPipeline } = await import("./pipeline.js");
    const result = await runPipeline({
      buffer,
      XLSX,
      processorId,
      ctx,
      onStage: (stage) => self.postMessage({ id, type: "stage", stage })
    });
    self.postMessage({ id, type: "done", ...result });
  } catch (e) {
    self.postMessage({
      id,
      type: "error",
      error: { code: e.code || "WORKER_ERROR", message: e.message || String(e), details: e.details }
    });
  }
};
