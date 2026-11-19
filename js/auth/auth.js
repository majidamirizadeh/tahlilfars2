/**
 * Auth client for Google Apps Script backend.
 * Token فقط در sessionStorage (همان تب) نگه داشته می‌شود؛ هرگز در localStorage/IndexedDB.
 * با خروج، انقضا یا نامعتبر شدن نشست، داده‌های کش‌شدهٔ IndexedDB هم پاک می‌شود.
 */
import { API_BASE } from "../core/constants.js";
import { clearAllDatasets } from "../data/dataCache.js";

const TOKEN_KEY = "tf_session_token";
const USER_KEY = "tf_session_user";
const EXP_KEY = "tf_session_exp";
const MANIFEST_MEMO_MS = 30000;

let manifestMemo = null;   // {m, at}

const safeGet = k => { try { return sessionStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };
const safeDel = k => { try { sessionStorage.removeItem(k); } catch {} };

export function getToken() { return safeGet(TOKEN_KEY) || ""; }

export function getUser() {
  try { return JSON.parse(safeGet(USER_KEY) || "null"); } catch { return null; }
}

/** انقضای محلی نشست: بدون تماس شبکه، نشستِ از‌مدت‌افتاده را همان لحظه نامعتبر می‌داند */
function expired() {
  const exp = Number(safeGet(EXP_KEY) || 0);
  return exp > 0 && exp <= Date.now();
}

export function isLoggedIn() { return !!getToken() && !!getUser() && !expired(); }
/** نشست قدیمی/منقضی که هنوز چیزی از آن در مرورگر مانده است */
export function hasSessionResidue() { return !!(safeGet(TOKEN_KEY) || safeGet(USER_KEY)) && !isLoggedIn(); }

export function isAdmin() {
  const u = getUser();
  return !!u && u.role === "admin" && isLoggedIn();
}

function setSession(token, user, expiresInSec) {
  safeSet(TOKEN_KEY, token);
  safeSet(USER_KEY, JSON.stringify(user));
  if (expiresInSec) safeSet(EXP_KEY, String(Date.now() + Number(expiresInSec) * 1000 - 30000));
}

export function clearSession() {
  safeDel(TOKEN_KEY); safeDel(USER_KEY); safeDel(EXP_KEY);
  manifestMemo = null;
}

/** پایان نشست: توکن و داده‌های کش‌شده پاک می‌شود؛ سپس رویداد tf-session-ended (برنامه صفحه را بارگذاری مجدد می‌کند) */
let ending = null;
export function endSession(reason = "expired", { notify = true } = {}) {
  clearSession();
  if (ending) return ending;
  ending = (async () => {
    try { await clearAllDatasets(); } catch {}
    ending = null;
    if (notify) window.dispatchEvent(new CustomEvent("tf-session-ended", { detail: { reason } }));
  })();
  return ending;
}

async function api(action, body = {}, { timeoutMs = 60000 } = {}) {
  if (!API_BASE) throw new Error("آدرس Backend تنظیم نشده است (API_BASE).");
  const payload = { action, ...body };
  const token = getToken();
  if (token) payload.token = token;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },   // درخواست ساده؛ بدون preflight
      body: JSON.stringify(payload),
      redirect: "follow",
      cache: "no-store",
      signal: ctl.signal
    });
  } catch (e) {
    throw Object.assign(new Error(e?.name === "AbortError" ? "زمان پاسخ سرور به پایان رسید." : "اتصال به سرور برقرار نشد."), { code: "NETWORK" });
  } finally { clearTimeout(timer); }
  if (!r.ok) throw Object.assign(new Error("خطای شبکه: " + r.status), { code: "NETWORK" });
  let data;
  try { data = await r.json(); } catch { throw Object.assign(new Error("پاسخ نامعتبر از سرور."), { code: "BAD_RESPONSE" }); }
  if (!data.ok) {
    if (data.code === "UNAUTHORIZED" && token) endSession("expired");
    throw Object.assign(new Error(data.error || "خطا"), { code: data.code });
  }
  return data;
}

const memoManifest = m => { if (m && m.datasets) manifestMemo = { m, at: Date.now() }; return m; };
export const peekManifest = () => (manifestMemo && Date.now() - manifestMemo.at < MANIFEST_MEMO_MS ? manifestMemo.m : null);

/** Apps Script را هم‌زمان با نمایش صفحهٔ ورود بیدار می‌کند (Cold start هنگام زدن «ورود» حس نشود) */
export function warmUp() {
  try { fetch(API_BASE, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "ping" }), cache: "no-store" }).catch(() => {}); } catch {}
}

export async function login(username, password) {
  const data = await api("login", { username, password });
  setSession(data.token, { username: data.username, role: data.role }, data.expiresIn);
  memoManifest(data.manifest);
  return data;
}

export async function logout() {
  try { await Promise.race([api("logout"), new Promise(r => setTimeout(r, 3000))]); } catch (_) {}
  await endSession("logout", { notify: false });
}

export async function me() { return api("me"); }

export async function listUsers() { return api("listusers"); }
export async function createUser(username, password, role = "user") { return api("createuser", { username, password, role }); }
export async function changePassword(username, password) {
  const data = await api("changepassword", { username, password });
  if (data.token) safeSet(TOKEN_KEY, data.token);   // رمز خودِ مدیر عوض شده: نشست قبلی باطل و توکن جدید جایگزین می‌شود
  return data;
}
export async function deleteUser(username) { return api("deleteuser", { username }); }

async function b64ToBuffer(b64) {
  try { return await (await fetch("data:application/octet-stream;base64," + b64)).arrayBuffer(); }   // دیکد بومی؛ بسیار سریع‌تر از حلقهٔ atob
  catch {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
}

/** Excel خام: {buffer, tag} — tag همان نسخهٔ واقعی فایلی است که تحویل داده شد */
export async function fetchSecureFile(name) {
  const data = await api("getfile", { name }, { timeoutMs: 180000 });
  return { buffer: await b64ToBuffer(data.data), tag: data.tag || "" };
}

/** Manifest + اعتبارسنجی نشست در یک درخواست (bootstrap). fresh=true: دور زدن کش ۶۰ثانیه‌ای سرور */
export async function fetchSecureManifest({ fresh = false } = {}) {
  if (!fresh) { const m = peekManifest(); if (m) return m; }
  const d = await api("bootstrap", { fresh });
  if (d.role && getUser() && d.role !== getUser().role) safeSet(USER_KEY, JSON.stringify({ ...getUser(), role: d.role }));
  return memoManifest(d.manifest);
}

/** داده فشردهٔ پردازش‌شده: {meta, data(base64)} */
export async function fetchSecureData(dataset) { return api("getdata", { dataset }, { timeoutMs: 120000 }); }
/** فقط مدیر */
export async function putSecureData(payload) { const d = await api("putdata", payload, { timeoutMs: 180000 }); manifestMemo = null; return d; }
