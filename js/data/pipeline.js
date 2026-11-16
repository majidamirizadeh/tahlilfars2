/* Pipeline: parse Excel → process → validate → hash */
export async function runPipeline({ buffer, XLSX, processorId, ctx, onStage }) {
  onStage?.("parse");
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });

  onStage?.("process");
  // Processor modules export process + validate + version
  const procMap = {
    "1520": "./processors/report1520.js",
    "150": "./processors/report150.js"
  };
  const modPath = procMap[processorId];
  if (!modPath) throw { code: "UNKNOWN_PROCESSOR", message: "Processor not found: " + processorId };

  const mod = await import(modPath);
  const processed = mod.process(raw, ctx);
  const report = mod.validate ? mod.validate(processed, raw, ctx) : { fatal: [], suspect: [], stats: {} };

  onStage?.("hash");
  // Simple content hash from row count + first/last values for change detection
  const hashInput = JSON.stringify({
    rows: processed.rows?.length || 0,
    period: processed.period,
    sample: (processed.rows || []).slice(0, 3).map(r => r.area || r[0])
  });
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    hash = ((hash << 5) - hash) + hashInput.charCodeAt(i);
    hash |= 0;
  }
  const hashStr = (hash >>> 0).toString(16).padStart(8, "0");

  return {
    processed,
    report,
    hash: hashStr,
    processorVersion: mod.version || 1,
    sheetName
  };
}
