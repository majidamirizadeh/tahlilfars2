/* نسخهٔ فشردهٔ «داده پردازش‌شده» (خروجی همان پردازشگرهای موجود): JSON + gzip.
   هیچ محاسبه/منطقی اینجا نیست؛ فقط سریال‌سازی بدون‌افت. اگر رفت‌وبرگشت JSON دقیقاً همان شیء را برنگرداند، انتشار انجام نمی‌شود
   (کاربران به روش قبلی—خواندن Excel—برمی‌گردند)، پس نتیجهٔ تحلیل‌ها هرگز تغییر نمی‌کند. */
export const FORMAT = 1;

const MARK = "\u0001tf";   // نشانهٔ مقادیری که JSON استاندارد از دست می‌دهد: -0، NaN، ±Infinity، Date، undefined در آرایه
let usedMarks = false;

function replacer(key, v) {
  const orig = this[key];
  if (orig instanceof Date) { usedMarks = true; return {[MARK]: "d", v: Number.isNaN(orig.getTime()) ? null : orig.toISOString()}; }
  if (typeof orig === "number") {
    if (Object.is(orig, -0)) { usedMarks = true; return {[MARK]: "z"}; }
    if (Number.isNaN(orig)) { usedMarks = true; return {[MARK]: "n"}; }
    if (orig === Infinity) { usedMarks = true; return {[MARK]: "i"}; }
    if (orig === -Infinity) { usedMarks = true; return {[MARK]: "m"}; }
  }
  if (orig === undefined && Array.isArray(this)) { usedMarks = true; return {[MARK]: "u"}; }
  return v;
}
function reviver(key, v) {
  if (v && typeof v === "object" && MARK in v) {
    switch (v[MARK]) {
      case "d": return v.v === null ? new Date(NaN) : new Date(v.v);
      case "z": return -0; case "n": return NaN; case "i": return Infinity; case "m": return -Infinity; case "u": return undefined;
    }
  }
  return v;
}

/** برابری ساختاری سخت‌گیرانه (Object.is برای عددها؛ ویژگی undefined با ویژگی غایب یکسان) */
export function sameStructure(a, b) {
  if (Object.is(a, b)) return true;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!sameStructure(a[i], b[i])) return false; return true; }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!sameStructure(a[k], b[k])) return false;
  return true;
}

const hasStreams = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function" && typeof Response === "function" && typeof Blob === "function";
async function pipeBytes(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
function bytesToB64(bytes) {
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function b64ToBytes(b64) {
  try { return new Uint8Array(await (await fetch("data:application/octet-stream;base64," + b64)).arrayBuffer()); }
  catch { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
}

/** envelope → {enc, data(base64)} یا null اگر بدون‌افت سریال‌سازی نشود */
export async function encodeEnvelope(envelope) {
  usedMarks = false;
  const text = JSON.stringify({...envelope, format: FORMAT}, replacer);
  const marks = usedMarks;
  const back = JSON.parse(text, marks ? reviver : undefined);
  if (!sameStructure({...envelope, format: FORMAT}, back)) return null;
  const body = marks ? text.replace(/^\{/, '{"markers":true,') : text;
  const utf8 = new TextEncoder().encode(body);
  if (hasStreams()) { try { return {enc: "gzip", data: bytesToB64(await pipeBytes(utf8, new CompressionStream("gzip")))}; } catch {} }
  return {enc: "json", data: bytesToB64(utf8)};
}

/** پاسخ سرور → envelope */
export async function decodeEnvelope({enc, data}) {
  let bytes = await b64ToBytes(data);
  if (enc === "gzip") {
    if (!hasStreams()) throw Object.assign(new Error("مرورگر از gzip پشتیبانی نمی‌کند."), {code: "NO_GZIP"});
    bytes = await pipeBytes(bytes, new DecompressionStream("gzip"));
  }
  const text = new TextDecoder().decode(bytes);
  const markers = /^\{"markers":true,/.test(text);
  const out = JSON.parse(text, markers ? reviver : undefined);
  if (markers) delete out.markers;
  return out;
}
