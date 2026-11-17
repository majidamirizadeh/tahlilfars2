/* ابزار تست مرورگر: سرور Static با شمارندهٔ درخواست + «شیم» XLSX/Lucide (CDN در محیط تست در دسترس نیست).
   فایل «xlsx» تست در واقع JSON همان آرایهٔ خام شیت است؛ پس زنجیرهٔ واقعی Manifest→Worker→Validate→IndexedDB→Engines→UI تست می‌شود (نه خود XLSX.read). */
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css",".json":"application/json",".png":"image/png",".woff2":"font/woff2",".xlsx":"application/octet-stream"};
export const XLSX_SHIM = `var XLSX={};(function(X){X.version="shim";X.read=function(buf){var t=new TextDecoder().decode(new Uint8Array(buf));var o;try{o=JSON.parse(t)}catch(e){throw new Error("not a workbook")}return {SheetNames:["Report"],Sheets:{Report:{raw:o}}}};X.utils={sheet_to_json:function(s){return s.raw}};})(XLSX);`;
export const LUCIDE_SHIM = `window.lucide={createIcons:function(){}};`;
export const sha = b => crypto.createHash("sha256").update(b).digest("hex");
export async function startServer(root, {shims = true} = {}) {
  const overrides = new Map(), log = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"); let p = decodeURIComponent(u.pathname); if (p === "/") p = "/index.html";
    log.push({method: req.method, path: p});
    const send = (status, body, headers = {}) => { res.writeHead(status, {"cache-control": "no-cache", ...headers}); res.end(req.method === "HEAD" ? undefined : body); };
    const ov = overrides.get(p);
    if (ov) { const body = Buffer.from(ov.body ?? ""); return send(ov.status || 200, body, {"content-type": MIME[path.extname(p)] || "application/octet-stream", etag: '"' + sha(body).slice(0, 16) + '"', "content-length": body.length}); }
    if (shims && p === "/vendor/xlsx/xlsx.full.min.js") return send(200, XLSX_SHIM, {"content-type": MIME[".js"]});
    if (shims && p === "/vendor/lucide/lucide.min.js") return send(200, LUCIDE_SHIM, {"content-type": MIME[".js"]});
    let f = path.join(root, p); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");   // مانند Static Hosting
    if (!f.startsWith(root) || !fs.existsSync(f)) return send(404, "not found");
    const body = fs.readFileSync(f);
    send(200, body, {"content-type": MIME[path.extname(f)] || "application/octet-stream", etag: '"' + sha(body).slice(0, 16) + '"', "content-length": body.length});
  });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  return {url: "http://127.0.0.1:" + srv.address().port, overrides, log, close: () => srv.close(), resetLog: () => (log.length = 0),
    count: re => log.filter(l => re.test(l.path)).length};
}
export const manifestFor = files => { const datasets = {}; for (const [id, f] of Object.entries(files)) datasets[id] = {file: f.file, version: f.version, hash: sha(f.body), size: f.body.length}; return JSON.stringify({version: "test", datasets}); };
/* باز کردن یک نما در ناوبری ادغام‌شده (تحلیل = مصرف+مالی · دفتر درآمد = نقشه/آمار + رتبه‌بندی)؛ روی ساختار قدیمی (تب‌های جدا) هم کار می‌کند */
export async function openView(page, view) {
  if (!(await page.$("#analysisTabs"))) return page.click(`.ribbon-item[data-view="${view}"]`);
  if (view === "anomaly" || view === "finance") { await page.click(".ribbon-item[data-group=analysis]"); return page.click(`#analysisTabs [data-sub="${view}"]`); }
  if (view === "analytics") { await page.click(".ribbon-item[data-group=home]"); return page.click('#mapModeTabs .map-mode-tab[data-mode="ranking"]'); }
  await page.click(`.ribbon-item[data-view="${view}"]`);
  if (view === "home" && (await page.evaluate(() => document.body.classList.contains("analytics-view")))) await page.click('#mapModeTabs .map-mode-tab[data-mode="stats"]');
}
