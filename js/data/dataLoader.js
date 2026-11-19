/* هماهنگ‌کنندهٔ دریافت داده: Manifest → (IndexedDB | دانلود) → Web Worker → Validate → Cache.
   Dataset جدید فقط وقتی جایگزین Cache می‌شود که کاملاً Validate شده باشد؛ وگرنه Cache سالم قبلی دست‌نخورده می‌ماند. */
import {DATASETS, PROCESSORS} from "./dataRegistry.js";
import {getDataset, putDataset} from "./dataCache.js";
import {APP_BASE, MANIFEST_URL, MANIFEST_TIMEOUT_MS, DOWNLOAD_TIMEOUT_MS, VENDOR, USE_SECURE_BACKEND} from "../core/constants.js";
import {loadVendor} from "../core/vendor.js";
import {fetchSecureFile, fetchSecureManifest, fetchSecureData, putSecureData, peekManifest, isAdmin} from "../auth/auth.js";
import {encodeEnvelope, decodeEnvelope, FORMAT} from "./compactStore.js";

const timed = ms => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return {signal: c.signal, done: () => clearTimeout(t)}; };
const err = (code, message, details) => Object.assign(new Error(message), {code, details});

export async function fetchManifest(){
  if (USE_SECURE_BACKEND) { try{ const m = await fetchSecureManifest(); return m && m.datasets ? m : null; }catch{ return null; } }
  const t = timed(MANIFEST_TIMEOUT_MS);
  try{ const r = await fetch(MANIFEST_URL, {cache: "no-store", signal: t.signal}); if(!r.ok) return null;
    const m = await r.json(); return m && typeof m === "object" && m.datasets && typeof m.datasets === "object" ? m : null;
  }catch{ return null; }finally{ t.done(); }
}
const fileUrl = def => new URL(def.file, APP_BASE).href;
const fingerprintOf = (h, len) => ({etag: h.get("etag") || "", lastModified: h.get("last-modified") || "", length: Number(h.get("content-length")) || len || 0});
async function headFingerprint(def){
  const t = timed(MANIFEST_TIMEOUT_MS);
  try{ const r = await fetch(fileUrl(def), {method: "HEAD", cache: "no-store", signal: t.signal}); return r.ok ? fingerprintOf(r.headers) : null; }
  catch{ return null; }finally{ t.done(); }
}
const fpChanged = (a, b) => a.etag && b.etag ? a.etag !== b.etag : a.lastModified && b.lastModified ? a.lastModified !== b.lastModified : (a.length && b.length ? a.length !== b.length : false);

async function download(def, entry, reload){
  const tag = entry?.hash?.slice(0, 16) || entry?.version || "";
  const url = fileUrl(def) + (tag ? "?v=" + encodeURIComponent(tag) : "") + (reload ? (tag ? "&" : "?") + "r=" + Date.now() : "");
  const t = timed(DOWNLOAD_TIMEOUT_MS); let r;
  try{ r = await fetch(url, {cache: reload ? "reload" : "no-cache", signal: t.signal}); }
  catch(e){ throw err("NETWORK", e?.name === "AbortError" ? "زمان دریافت فایل به پایان رسید." : "دسترسی به فایل ممکن نیست. اتصال را بررسی کنید (یا صفحه را با سرور محلی/Static Hosting باز کنید، نه file://). مسیر: " + def.file); }
  finally{ t.done(); }
  if(!r.ok) throw err("HTTP", `فایل پیدا نشد (${r.status}): ${def.file}`);
  const buffer = await r.arrayBuffer();
  return {buffer, fingerprint: fingerprintOf(r.headers, buffer.byteLength), size: buffer.byteLength};
}

const WORKER_TIMEOUT_MS = 240000;   // خواندن Excelِ بزرگ (≈۱۲ مگابایت) در Worker
let seq = 0;
function runInWorker(job){
  return new Promise((resolve, reject) => {
    let w; const id = ++seq;
    try{ w = new Worker(new URL("./dataWorker.js", import.meta.url), {type: "module"}); }
    catch(e){ return reject(err("WORKER_FAILED", "Web Worker در این مرورگر در دسترس نیست.", String(e))); }
    const kill = setTimeout(() => { w.terminate(); reject(err("WORKER_FAILED", "Worker پاسخ نداد.")); }, WORKER_TIMEOUT_MS);
    const end = () => { clearTimeout(kill); w.terminate(); };
    w.onmessage = ({data}) => { if(data.id !== id) return;
      if(data.type === "stage") return job.onStage?.(data.stage);
      end(); data.type === "done" ? resolve(data) : reject(err(data.error.code, data.error.message, data.error.details)); };
    w.onerror = ev => { end(); reject(err("WORKER_FAILED", "اجرای Worker شکست خورد.", ev?.message)); };
    w.postMessage({id, buffer: job.buffer, processorId: job.processorId, xlsxUrls: VENDOR.xlsx, ctx: job.ctx});   // بدون transfer تا fallback ممکن بماند
  });
}
async function runOnMain(job){
  let XLSX; try{ XLSX = await loadVendor("xlsx", "XLSX"); }catch(e){ throw err("LIB_FAILED", "بارگذاری کتابخانهٔ خواندن Excel ممکن نشد (vendor/ و CDN).", String(e?.message || e)); }
  const {runPipeline} = await import("./pipeline.js");
  return runPipeline({buffer: job.buffer, XLSX, processorId: job.processorId, ctx: job.ctx, onStage: job.onStage});
}
async function processBuffer(job){
  try{ return {...(await runInWorker(job)), via: "worker"}; }
  catch(e){ if(e.code !== "WORKER_FAILED" && e.code !== "LIB_FAILED") throw e;
    console.warn("[data] Worker شکست خورد؛ پردازش روی Main Thread", e.message, e.details || "");
    return {...(await runOnMain(job)), via: "main"}; }
}

export async function getProcessorVersion(id){ const m = PROCESSORS[DATASETS[id].processor]; return m ? (await import(m)).version : 0; }
/** رکورد Cache فقط اگر با نسخهٔ فعلی پردازشگر سازگار باشد */
export async function getCachedRecord(id){
  const rec = await getDataset(id);
  return rec && rec.processorVersion === await getProcessorVersion(id) && rec.processedData?.rows?.length ? rec : null;
}

/* حالت قدیمیِ بدون Backend (فایل Excel کنار برنامه؛ USE_SECURE_BACKEND=false) — بدون تغییر منطق.
   force=false: باز شدن برنامه — فقط Manifest. force=true: کلید «به‌روزرسانی» — علاوه بر Manifest، اثرانگشت HTTP (HEAD) برای Manifest فراموش‌شده.
 *  خروجی: {status: unchanged|updated|rejected|offline|error, record, problems[], warnings[], via, downloaded} */
async function syncStatic(id, {force = false, onStage} = {}){
  const def = DATASETS[id], stale = await getDataset(id), procVer = await getProcessorVersion(id);
  const cached = stale && stale.processorVersion === procVer && stale.processedData?.rows?.length ? stale : null;
  const manifest = await fetchManifest(), entry = manifest?.datasets?.[id] || null;
  let need = false, fp = null;
  if(!cached) need = true;
  /* Manifest قدیمی (فایل عوض شده ولی build-manifest اجرا نشده) که قبلاً شناسایی شده: به آن اعتماد نمی‌کنیم و به‌جای دانلود مجدد در هر بار باز شدن،
     فقط اثرانگشت HTTP فایل سنجیده می‌شود. به‌محض اصلاح Manifest (hash تازه)، این حالت خودکار پایان می‌یابد. */
  const manifestKnownStale = !!(cached && entry?.hash && cached.metadata?.staleManifestHash === entry.hash);
  if(cached && entry && (entry.hash || entry.version) && !manifestKnownStale){
    const same = entry.hash && cached.hash ? entry.hash === cached.hash : entry.version === cached.version;
    if(!same) need = true; }
  if(!need && cached && (force || !entry || manifestKnownStale)){
    fp = await headFingerprint(def);
    if(fp && cached.metadata?.fingerprint && fpChanged(fp, cached.metadata.fingerprint)) need = true; }
  if(!need) return {status: manifest || fp ? "unchanged" : "offline", record: cached, problems: [], warnings: [], downloaded: false};

  const ctx = {previousRecords: (cached || stale)?.metadata?.records || 0, allowCountChange: !!entry?.allowCountChange};
  const job = buffer => ({buffer, processorId: def.processor, ctx, onStage}), warnings = []; let staleManifestHash = "";
  try{
    let dl = await download(def, entry, false), res = await processBuffer(job(dl.buffer));
    if(entry?.hash && res.hash && res.hash !== entry.hash){          // نسخهٔ قدیمی در CDN/Cache مرورگر؟ یک بار بدون Cache تلاش مجدد
      dl = await download(def, entry, true); res = await processBuffer(job(dl.buffer));
      if(res.hash !== entry.hash){ staleManifestHash = entry.hash; warnings.push("فایل جدید اعمال شد، ولی manifest.json قدیمی است. دستور  node tools/build-manifest.mjs  را اجرا و manifest را منتشر کنید."); }
    }
    const {fatal, suspect} = res.report;
    if(fatal.length || (suspect.length && cached)) return {status: "rejected", record: cached, problems: [...fatal, ...suspect], warnings, downloaded: true, via: res.via};
    warnings.push(...suspect);
    if(cached && res.hash && res.hash === cached.hash){              // محتوا یکسان؛ فقط اثرانگشت تازه می‌شود
      const rec = {...cached, version: entry?.version || cached.version, metadata: {...cached.metadata, fingerprint: dl.fingerprint, staleManifestHash}};
      await putDataset(rec); return {status: "unchanged", record: rec, problems: [], warnings, downloaded: true, via: res.via}; }
    const rec = {datasetId: id, version: entry?.version || "auto-" + String(res.hash || Date.now()).slice(0, 8), hash: res.hash, processorVersion: res.processorVersion,
      processedData: res.processed,
      metadata: {records: res.processed.rows.length, period: res.processed.period, sheetName: res.sheetName, fileSize: dl.size, fingerprint: dl.fingerprint, stats: res.report.stats, source: def.file, manifestVersion: manifest?.version || "", staleManifestHash}};
    await putDataset(rec);
    return {status: "updated", record: rec, problems: [], warnings, downloaded: true, via: res.via};
  }catch(e){
    return {status: cached ? (e.code === "NETWORK" ? "offline" : "rejected") : "error", record: cached, problems: [e.message || String(e)], warnings, downloaded: false, code: e.code};
  }
}

/* ====================== حالت امن (Google Apps Script) ======================
   نسخهٔ واقعی فایل (srcTag) از Manifest می‌آید. اگر «داده فشردهٔ» تازه روی سرور باشد، فقط همان (کوچک) دریافت می‌شود:
   بدون کتابخانهٔ XLSX، بدون Worker و بدون پردازش. در غیر این صورت (فقط تا اولین بازشدن توسط مدیر) Excel خوانده می‌شود، و اگر کاربر مدیر باشد
   خروجی همان پردازشگرها به‌صورت JSON فشرده در Drive خصوصی منتشر می‌شود. */
const rec2 = (id, def, v) => ({datasetId: id, version: v.version, hash: v.hash, processorVersion: v.processorVersion, processedData: v.processed,
  metadata: {records: v.processed.rows.length, period: v.processed.period, sheetName: v.sheetName, fileSize: v.fileSize,
    fingerprint: {etag: v.version, lastModified: "", length: v.fileSize || 0}, stats: v.stats, source: def.file, manifestVersion: v.manifestVersion || "", staleManifestHash: ""}});
const isFresh = (entry, tag, procVer) => !!(entry?.data && entry.data.srcTag === tag && entry.data.pv === procVer);

/** آیا برای این Dataset «داده فشردهٔ تازه» روی سرور هست؟ (برای تصمیم پیش‌دریافت در پس‌زمینه؛ بدون درخواست شبکه) */
export async function fastReady(id){
  const m = peekManifest(), entry = m?.datasets?.[id];
  return !!entry && isFresh(entry, entry.srcTag, await getProcessorVersion(id));
}

const publishing = new Map();
/** انتشار داده فشرده (فقط مدیر). خروجی: Promise<{ok, reason?}> — هرگز reject نمی‌شود */
export function publishRecord(id, rec){
  if(!isAdmin() || !rec?.processedData?.rows?.length) return Promise.resolve({ok: false, reason: "skip"});
  const key = id + "|" + rec.version;
  if(publishing.has(key)) return publishing.get(key);
  const p = (async () => {
    try{
      const env = await encodeEnvelope({datasetId: id, srcTag: rec.version, processorVersion: rec.processorVersion, hash: rec.hash, fileSize: rec.metadata?.fileSize || 0,
        sheetName: rec.metadata?.sheetName || "", stats: rec.metadata?.stats || null, processed: rec.processedData});
      if(!env) return {ok: false, reason: "lossy"};            // سریال‌سازی بدون‌افت ممکن نیست → روش قبلی برای بقیهٔ کاربران
      await putSecureData({dataset: id, srcTag: rec.version, pv: rec.processorVersion, hash: rec.hash, enc: env.enc, data: env.data, records: rec.processedData.rows.length});
      return {ok: true};
    }catch(e){ console.warn("[data] انتشار نسخهٔ فشرده ناموفق:", e.message); return {ok: false, reason: e.code || "error", message: e.message}; }
    finally{ publishing.delete(key); }
  })();
  publishing.set(key, p); return p;
}

async function loadCompact(id, def, entry, procVer, manifest){
  const r = await fetchSecureData(id);
  if(r.meta?.srcTag !== entry.srcTag || r.meta?.pv !== procVer) throw err("STALE", "داده فشرده با نسخهٔ فعلی فایل هم‌خوان نیست.");
  const env = await decodeEnvelope({enc: r.meta.enc, data: r.data});
  if(env.format !== FORMAT || env.datasetId !== id || env.processorVersion !== procVer || env.srcTag !== entry.srcTag || !env.processed?.rows?.length)
    throw err("BAD_COMPACT", "ساختار داده فشرده نامعتبر است.");
  return rec2(id, def, {version: entry.srcTag, hash: env.hash, processorVersion: procVer, processed: env.processed, sheetName: env.sheetName, fileSize: env.fileSize, stats: env.stats, manifestVersion: manifest.version});
}

async function syncSecure(id, {force = false, onStage} = {}){
  const def = DATASETS[id], stale = await getDataset(id), procVer = await getProcessorVersion(id);
  const cached = stale && stale.processorVersion === procVer && stale.processedData?.rows?.length ? stale : null;
  const manifest = await fetchManifest(), entry = manifest?.datasets?.[id] || null;
  if(!manifest) return {status: cached ? "offline" : "error", record: cached, problems: cached ? [] : ["اتصال به سرور برقرار نشد."], warnings: [], downloaded: false, code: "NETWORK"};
  if(!entry) return {status: cached ? "unchanged" : "error", record: cached, problems: cached ? [] : ["فایل داده روی سرور پیدا نشد: " + def.file], warnings: [], downloaded: false};
  const tag = entry.srcTag || entry.version, fresh = isFresh(entry, tag, procVer);

  if(cached && cached.version === tag){            // نسخهٔ محلی دقیقاً همین فایل است: هیچ دانلودی لازم نیست
    const publish = !fresh && isAdmin() ? publishRecord(id, cached) : null;
    return {status: "unchanged", record: cached, problems: [], warnings: [], downloaded: false, publish};
  }
  if(fresh){                                       // مسیر سریع: فقط JSON فشرده
    try{
      const rec = await loadCompact(id, def, entry, procVer, manifest);
      const same = cached && cached.hash && rec.hash === cached.hash;
      await putDataset(same ? {...cached, version: rec.version} : rec);
      return {status: same ? "unchanged" : "updated", record: same ? {...cached, version: rec.version} : rec, problems: [], warnings: [], downloaded: true, via: "compact"};
    }catch(e){ console.warn("[data] مسیر سریع ناموفق؛ خواندن Excel", e.message); }
  }
  /* مسیر کامل: Excel → Worker → Validate (همان کد قبلی) */
  const ctx = {previousRecords: (cached || stale)?.metadata?.records || 0, allowCountChange: !!entry?.allowCountChange};
  const warnings = [];
  try{
    const dl = await fetchSecureFile(def.file.includes("150") ? "150.xlsx" : "1520.xlsx"), version = dl.tag || tag;
    const res = await processBuffer({buffer: dl.buffer, processorId: def.processor, ctx, onStage});
    const {fatal, suspect} = res.report;
    if(fatal.length || (suspect.length && cached)) return {status: "rejected", record: cached, problems: [...fatal, ...suspect], warnings, downloaded: true, via: res.via};
    warnings.push(...suspect);
    const same = !!(cached && res.hash && res.hash === cached.hash);
    let rec;
    if(same) rec = {...cached, version};
    else rec = rec2(id, def, {version, hash: res.hash, processorVersion: res.processorVersion, processed: res.processed, sheetName: res.sheetName, fileSize: dl.buffer.byteLength, stats: res.report.stats, manifestVersion: manifest.version});
    await putDataset(rec);
    return {status: same ? "unchanged" : "updated", record: rec, problems: [], warnings, downloaded: true, via: res.via, publish: isAdmin() ? publishRecord(id, rec) : null};
  }catch(e){
    return {status: cached ? (e.code === "NETWORK" ? "offline" : "rejected") : "error", record: cached, problems: [e.message || String(e)], warnings, downloaded: false, code: e.code};
  }
}

export async function syncDataset(id, opts = {}){
  if(!USE_SECURE_BACKEND) return syncStatic(id, opts);
  if(opts.force) { try{ await fetchSecureManifest({fresh: true}); }catch{} }   // کلید «به‌روزرسانی»: دور زدن کش کوتاه‌مدت سرور
  return syncSecure(id, opts);
}
