/* پردازشگر دیتاست «گزارش ۱۵۰ / ۱۵۰۷» (تحلیل روند): Read → Normalize → Validate. بدون Business Logic و بدون DOM.
   ورودی: ماتریس خام شیت (عنوان در ردیف اول، سرستون‌ها شامل GroupTitle و ستون‌های ماه مثل 140501).
   خروجی (processed): {rows:[{p,c,b,it:{income,net,...}}], pars, cities, bts, months, title, period, headerRow}
   هر ردیف = یک ترکیب (امور × شهر × کاربری) با سری ماهانهٔ هر شاخص؛ یعنی جمع‌زدن و فیلتر در مرورگر سریع است.
   تاریخ و تعداد روز سپری‌شده از سال از عنوانِ همین فایل خوانده می‌شود (مستقل از گزارش ۱۵۲۰). */
import {extractPeriod} from "../dataProcessor.js";
export const version = 2;   /* با تغییر منطق نگاشت/نرمال‌سازی این عدد را بالا ببرید تا Cache قدیمی باطل شود */

/* نگاشت GroupTitle گزارش به شاخص‌ها */
export const GROUPS = {
  income: "جمع کل درآمد", collection: "وصولی", consumption: "مصرف", water: "آب بهاء",
  sewage: "خدمات دفع فاضلاب", excess: "مازاد ظرفیت", hot: "فصل گرم", tax: "مالیات بر ارزش افزوده",
  discount: ["تخفیفات آب", "تخفیفات فاضلاب"], burst: ["تخفیف ترکیدگی"]
};
/* آیتم‌هایی که در «سایر» قرار می‌گیرند */
export const OTHER_PARTS = ["آبونمان آب", "تبصره 2", "تبصره 3 آب", "بند 76 قانون بودجه", "ماده 7", "آبونمان فاضلاب", "تبصره 3 فاضلاب"];
/* کاربری‌های نیروی مسلح (BranchTypeTitle) */
export const ARMED_TITLES = ["ارتش", "سپاه", "نیروی انتظامی", "انتظامیه", "نیروهای مسلح"];
export const METRIC_KEYS = ["income", "net", "collection", "consumption", "water", "sewage", "excess", "hot", "tax", "other", "discount"];
const NEED = ["GroupTitle", "BranchTypeCode", "BranchTypeTitle", "CityCode", "CityTitle", "MothercityCode", "MothercityTitle"];

const norm = s => String(s == null ? "" : s).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ء/g, "").replace(/[‌\s]+/g, "");
const NG = {}; for (const k in GROUPS) NG[k] = [].concat(GROUPS[k]).map(norm);
const NB = GROUPS.burst.map(norm), NO = OTHER_PARTS.map(norm), ARM = new Set(ARMED_TITLES.map(norm));
const zeros = n => new Array(n).fill(0);
const addTo = (a, b) => { for (let i = 0; i < a.length; i++) a[i] += b[i] || 0; };
const toNum = v => { if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٬,،\s]/g, "")); return Number.isFinite(n) ? n : 0; };

function findHeader(raw){
  for (let i = 0; i < Math.min(raw.length, 15); i++) {
    const cells = (raw[i] || []).map(c => String(c ?? "").trim());
    if (cells.includes("GroupTitle")) return {i, cells};
  }
  throw new Error("ستون GroupTitle (سرستون گزارش ۱۵۰) پیدا نشد؛ فایل با قالب این گزارش نمی‌خواند.");
}

export function process(raw){
  const {i: headerRow, cells} = findHeader(raw);
  const ix = {}; for (const n of NEED) { ix[n] = cells.indexOf(n); if (ix[n] < 0) throw new Error("ستون ضروری پیدا نشد: " + n); }
  const mi = cells.map((c, j) => /^\d{6}$/.test(c.replace(/\.0+$/, "")) ? j : -1).filter(j => j >= 0);
  if (!mi.length) throw new Error("ستون ماه (مانند 140501) پیدا نشد.");
  const months = mi.map(j => cells[j].replace(/\.0+$/, "")), M = months.length;
  const title = String(raw[0]?.[0] ?? raw.slice(0, headerRow).flat().find(x => x) ?? "");
  const period = extractPeriod(title);

  const parIx = new Map(), cityIx = new Map(), btIx = new Map(), pars = [], cities = [], bts = [], recs = new Map();
  let bad = 0, rowsRead = 0;
  for (let r = headerRow + 1; r < raw.length; r++) {
    const row = raw[r]; if (!row) continue;
    const g = row[ix.GroupTitle]; if (g == null || g === "") continue;
    rowsRead++;
    const pc = String(row[ix.MothercityCode]), cc = String(row[ix.CityCode]), bc = String(row[ix.BranchTypeCode]);
    if (!parIx.has(pc)) { parIx.set(pc, pars.length); pars.push({id: pc, t: String(row[ix.MothercityTitle]).trim()}); }
    if (!cityIx.has(cc)) { cityIx.set(cc, cities.length); cities.push({id: cc, t: String(row[ix.CityTitle]).trim(), p: parIx.get(pc), rural: /^بخش/.test(String(row[ix.CityTitle]).trim())}); }
    if (!btIx.has(bc)) { btIx.set(bc, bts.length); bts.push({id: bc, t: String(row[ix.BranchTypeTitle]).trim(), armed: ARM.has(norm(row[ix.BranchTypeTitle]))}); }
    const key = parIx.get(pc) + "|" + cityIx.get(cc) + "|" + btIx.get(bc);
    let rec = recs.get(key); if (!rec) recs.set(key, rec = {p: parIx.get(pc), c: cityIx.get(cc), b: btIx.get(bc), raw: {}});
    const gk = norm(g); const v = mi.map(j => { const x = toNum(row[j]); if (x === 0 && row[j] != null && row[j] !== "" && !/^[\s0۰,.-]+$/.test(String(row[j]))) bad++; return x; });
    if (!rec.raw[gk]) rec.raw[gk] = zeros(M); addTo(rec.raw[gk], v);
  }

  const rows = []; let noTotal = 0, noTotalAmt = 0; const sumArr = a => a.reduce((x, y) => x + y, 0);
  for (const rec of recs.values()) {
    const get = k => { const o = zeros(M); for (const g of NG[k]) if (rec.raw[g]) addTo(o, rec.raw[g]); return o; };
    const it = {water: get("water"), sewage: get("sewage"), excess: get("excess"), hot: get("hot"), tax: get("tax"), consumption: get("consumption"), collection: get("collection")};
    const core = zeros(M); ["water", "sewage", "excess", "hot", "tax"].forEach(k => addTo(core, it[k]));
    const oth = zeros(M); for (const g of NO) if (rec.raw[g]) addTo(oth, rec.raw[g]);
    /* درآمد = دقیقاً ردیف(های) «جمع کل درآمد» فایل؛ هرگز از جمع اجزا بازسازی نمی‌شود. رکورد بدون ردیف جمع، درآمد صفر دارد و در آمار گزارش می‌شود. */
    const hasTotal = NG.income.some(g => rec.raw[g]);
    it.income = get("income");
    it.other = hasTotal ? it.income.map((v, i) => v - core[i]) : zeros(M);
    if (!hasTotal && (core.some(v => v) || oth.some(v => v))) { noTotal++; noTotalAmt += sumArr(core) + sumArr(oth); }
    const bur = zeros(M); for (const g of NB) if (rec.raw[g]) addTo(bur, rec.raw[g]);
    it.discount = get("discount").map((v, i) => Math.abs(v) + Math.abs(bur[i] || 0));          /* تخفیفات: قدر مطلق آب/فاضلاب + ترکیدگی */
    it.net = it.income.map((v, i) => v - it.discount[i]);                                      /* درآمد خالص = جمع درآمد − تخفیفات */
    rows.push({p: rec.p, c: rec.c, b: rec.b, it});
  }
  return {rows, pars, cities, bts, months, title, period, headerRow, stats: {sourceRows: rowsRead, badCells: bad, noTotal, noTotalAmt}};
}

/** {fatal, suspect, stats} — fatal: همیشه Reject · suspect: اگر Dataset سالم قبلی هست Reject، وگرنه فقط هشدار */
export function validate(processed, raw, ctx = {}){
  const fatal = [], suspect = [], {rows, months, period, stats} = processed;
  if (!rows.length) fatal.push("هیچ رکوردی در فایل پیدا نشد.");
  else if (rows.length < 10) suspect.push(`تعداد ترکیب‌های امور×شهر×کاربری بسیار کم است (${rows.length}).`);
  if (!rows.some(r => r.it.income.some(v => v > 0))) suspect.push("جمع کل درآمد در همهٔ ماه‌ها صفر است؛ نگاشت GroupTitle را بررسی کنید.");
  if (!rows.some(r => r.it.collection.some(v => v > 0))) suspect.push("هیچ مقدار «وصولی» در فایل پیدا نشد.");
  const sorted = [...months].sort(); if (sorted.join() !== months.join()) suspect.push("ستون‌های ماه به‌ترتیب زمانی نیستند.");
  if (stats.badCells && stats.badCells / Math.max(1, stats.sourceRows * months.length) > 0.01) suspect.push(`${stats.badCells} سلول عددی نامعتبر.`);
  if (!period.from || !period.to || !Number.isFinite(period.days) || period.days <= 0) suspect.push("بازهٔ تاریخ گزارش (از/تا) در عنوان فایل پیدا یا معتبر نیست.");
  const prev = ctx.previousRecords;
  if (prev > 0 && !ctx.allowCountChange) { const ratio = rows.length / prev;
    if (ratio < 0.5 || ratio > 2) suspect.push(`تعداد رکوردها نسبت به نسخهٔ قبل غیرعادی است (${prev} ← ${rows.length}). اگر عمدی است در manifest مقدار allowCountChange=true بگذارید.`); }
  return {fatal, suspect, stats: {records: rows.length, areas: processed.pars.length, cities: processed.cities.length, usages: processed.bts.length}};
}
