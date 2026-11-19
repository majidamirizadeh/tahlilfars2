/* موتور «روند و پیش‌بینی» (تب روند): مدل‌سازی داده‌های گزارش ۱۵۰، فیلتر/تجمیع، پیش‌بینی و برداشت‌های مبتنی بر پیش‌بینی.
   فقط توابع خالص (بدون DOM). مدل‌های پیش‌بینی و آزمون خارج از نمونه در trendModels.js است. همهٔ آستانه‌ها از رجیستری تنظیمات (گروه «تحلیل روند و پیش‌بینی») خوانده می‌شود.
   «درآمد خالص» در این تب = مجموع ردیف‌های «جمع کل درآمد» فایل؛ تخفیفات دوباره کسر نمی‌شود. موتورهای دیگر (metrics/finance/…) تغییر نمی‌کنند. */
import {registerGroup, registerSetting, get as S} from "../settings/settings.js";
import {METHODS, METHOD_IDS, forecastSeries, zOf, ols, mean, sd, median, sum} from "./trendModels.js";
export {METHODS, METHOD_IDS};

/* ───────────── تنظیمات ───────────── */
registerGroup({id:"trend", label:"تحلیل روند و پیش‌بینی (تب روند)", order:7.5});
const sec = (title, note="") => ({section:title, sectionNote:note});
registerSetting({id:"trend.horizon", group:"trend", ...sec("پیش‌بینی","اعمال روی تب «روند». افق «۰» یعنی تا پایان همان سال شمسی."),
  label:"افق پیش‌فرض پیش‌بینی (ماه؛ ۰ = تا پایان سال)", default:3, min:0, max:12, step:1, unit:"ماه"});
registerSetting({id:"trend.confidence", group:"trend", section:"پیش‌بینی", label:"سطح اطمینان بازهٔ پیش‌بینی", default:80, min:50, max:99, step:1, unit:"٪"});
registerSetting({id:"trend.band", group:"trend", section:"پیش‌بینی", label:"نمایش بازهٔ عدم‌قطعیت روی نمودار", type:"bool", default:true});
registerSetting({id:"trend.trainFull", group:"trend", section:"پیش‌بینی", label:"آموزش مدل روی کل تاریخچه (مستقل از بازهٔ نمایش). اگر خاموش باشد فقط ماه‌های بازهٔ انتخابی در برازش می‌آیند", type:"bool", default:true});
registerSetting({id:"trend.minBacktest", group:"trend", section:"پیش‌بینی", label:"حداقل ماه‌های تاریخچه برای «قابل اتکا» شمردن پیش‌بینی", default:6, min:4, max:36, step:1, unit:"ماه"});
registerSetting({id:"trend.maWindow", group:"trend", section:"پیش‌بینی", label:"پنجرهٔ میانگین متحرک (ساده و وزنی)", default:3, min:2, max:12, step:1, unit:"ماه"});
registerSetting({id:"trend.seasonalMin", group:"trend", section:"پیش‌بینی", label:"حداقل ماه‌های تاریخچه برای هولت-وینترز (کمتر از ۲۴ پذیرفته نمی‌شود)", default:24, min:24, max:60, step:1, unit:"ماه"});
registerSetting({id:"trend.arimaMin", group:"trend", section:"پیش‌بینی", label:"حداقل ماه‌های تاریخچه برای ARIMA", default:12, min:10, max:60, step:1, unit:"ماه"});
registerSetting({id:"trend.uncertainHigh", group:"trend", section:"پیش‌بینی", label:"آستانهٔ «عدم‌قطعیت بالا» (نیم‌پهنای بازه نسبت به مقدار پیش‌بینی، در آخر افق)", default:30, min:5, max:200, step:5, unit:"٪"});
registerSetting({id:"trend.components", group:"trend", section:"پیش‌بینی", label:"روش «ترکیبی از اجزا» برای درآمد خالص در انتخاب خودکار شرکت کند (جمع پیش‌بینی اجزا؛ فصل گرم با منطق ماه‌های صدور)", type:"bool", default:true});
registerSetting({id:"trend.excludePartial", group:"trend", section:"پیش‌بینی", label:"ماه آخرِ ناقص (پایان گزارش وسط ماه) در برازش پیش‌بینی نیاید", type:"bool", default:true});
registerSetting({id:"trend.outlierZ", group:"trend", section:"پیش‌بینی", label:"آستانهٔ تشخیص داده پرت (امتیاز Z مقاوم؛ ۰ = خاموش)", default:3.5, min:0, max:10, step:.5});
registerSetting({id:"trend.hotFrom", group:"trend", ...sec("فصل گرم","مبلغ «فصل گرم» فقط در این ماه‌ها صورت‌حساب می‌شود؛ در داده‌ٔ ۱۴۰۵ تا مهر هم مبلغ دارد (صدور با یک ماه تأخیر)."),
  label:"آغاز فصل گرم (شمارهٔ ماه)", default:3, min:1, max:12, step:1});
registerSetting({id:"trend.hotTo", group:"trend", section:"فصل گرم", label:"پایان فصل گرم (شمارهٔ ماه)", default:7, min:1, max:12, step:1});
registerSetting({id:"trend.compareTop", group:"trend", ...sec("نمایش",""), label:"تعداد پیش‌فرض سری در نمودارهای مقایسه (برترین‌ها)", default:6, min:2, max:12, step:1});
registerSetting({id:"trend.tableRtl", group:"trend", section:"نمایش", label:"جهت جدول‌های تب روند: روشن = راست‌چین، خاموش = چپ‌چین", type:"bool", default:true});
registerSetting({id:"trend.tariffPct", group:"trend", ...sec("سناریوی تعرفه و مالیات (فقط در پیش‌بینی)","اثر روی ماه‌های پیش‌بینی از «تاریخ اعمال» به بعد؛ داده‌های واقعی دست‌نخورده می‌ماند. ۰ = بدون سناریو. افزایش تعرفه روی همهٔ اجزای درآمد (آب‌بها، فاضلاب، مازاد ظرفیت، فصل گرم، سایر و پایهٔ مالیات) و وصول اثر می‌گذارد؛ درصد وصول و مصرف ثابت می‌ماند."),
  label:"افزایش تعرفه آب‌بها", default:0, min:-50, max:300, step:.5, unit:"٪"});
registerSetting({id:"trend.tariffYear", group:"trend", section:"سناریوی تعرفه و مالیات (فقط در پیش‌بینی)", label:"سال شمسی اعمال تعرفه جدید", default:1406, min:1400, max:1450, step:1});
registerSetting({id:"trend.tariffMonth", group:"trend", section:"سناریوی تعرفه و مالیات (فقط در پیش‌بینی)", label:"ماه اعمال تعرفه جدید (۱ تا ۱۲)", default:1, min:1, max:12, step:1});
registerSetting({id:"trend.taxPct", group:"trend", section:"سناریوی تعرفه و مالیات (فقط در پیش‌بینی)", label:"افزایش مالیات (نسبی؛ فقط روی جزء مالیات، روی تعرفه جدید هم‌افزایی دارد)", default:0, min:-50, max:300, step:.5, unit:"٪"});
registerSetting({id:"trend.taxYear", group:"trend", section:"سناریوی تعرفه و مالیات (فقط در پیش‌بینی)", label:"سال شمسی اعمال مالیات جدید", default:1406, min:1400, max:1450, step:1});
registerSetting({id:"trend.taxMonth", group:"trend", section:"سناریوی تعرفه و مالیات (فقط در پیش‌بینی)", label:"ماه اعمال مالیات جدید (۱ تا ۱۲)", default:1, min:1, max:12, step:1});
registerSetting({id:"trend.anim", group:"trend", section:"نمایش", label:"انیمیشن رسم نمودارها", type:"bool", default:true});
registerSetting({id:"trend.rtl", group:"trend", section:"نمایش", label:"محور زمان نمودارها از راست به چپ (مطابق جهت فارسی)", type:"bool", default:true});

/* ───────────── ثابت‌ها ───────────── */
export const MONTH_NAMES = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
/* سه شاخص اصلی تب + اجزای درآمد (فقط برای بخش جزئیات درآمد) */
export const METRICS = {
  consumption:{t:"مصرف", k:"vol", c:"#0A6CFF"},
  income:{t:"درآمد خالص", full:"درآمد خالص (جمع کل درآمد)", k:"money", c:"#FF6A00"},
  collection:{t:"وصول", k:"money", c:"#00B85C"},
  ratio:{t:"درصد وصول", full:"درصد وصول (وصول ÷ درآمد خالص)", k:"pct", c:"#E6007E"},
  water:{t:"آب‌بها", k:"money", c:"#0A6CFF"}, sewage:{t:"فاضلاب‌بها", k:"money", c:"#9B30FF"}, excess:{t:"مازاد ظرفیت", k:"money", c:"#FF6A00"},
  hot:{t:"فصل گرم", k:"money", c:"#FF1F3D"}, tax:{t:"مالیات بر ارزش افزوده", k:"money", c:"#00B8D4"}, other:{t:"سایر (آبونمان، تبصره‌ها و …)", k:"money", c:"#FFC400"}
};
export const MAIN = ["consumption", "income", "collection", "ratio"];
export const PARTS = ["water", "sewage", "excess", "hot", "tax", "other"];
export const MONEY_UNITS = [{id:"rial",t:"ریال",d:1},{id:"mrial",t:"میلیون ریال",d:1e6},{id:"brial",t:"میلیارد ریال",d:1e9},{id:"mtoman",t:"میلیون تومان",d:1e7},{id:"btoman",t:"میلیارد تومان",d:1e10}];
export const VOL_UNITS = [{id:"m3",t:"متر مکعب",d:1},{id:"km3",t:"هزار متر مکعب",d:1e3},{id:"mm3",t:"میلیون متر مکعب",d:1e6}];
export const METHOD_T = {auto:"خودکار (کمترین خطای خارج از نمونه)", parts:"ترکیبی از اجزای درآمد", hot:"منطق ماه‌های صدور فصل گرم", ...Object.fromEntries(METHOD_IDS.map(k => [k, METHODS[k].t]))};

/* ───────────── تقویم شمسی روی کد ماه (140507) ───────────── */
export const mName = (code, withYear) => MONTH_NAMES[+String(code).slice(4)-1] + (withYear ? " " + String(code).slice(0,4) : "");
export function addMonths(code, k){
  let y = +String(code).slice(0,4), m = +String(code).slice(4) + k;
  while(m > 12){ m -= 12; y++; } while(m < 1){ m += 12; y--; }
  return String(y) + String(m).padStart(2,"0");
}
export const monthLen = m => m <= 6 ? 31 : m <= 11 ? 30 : 29;
/** آیا ماه آخر گزارش کامل است؟ (روز پایان بازه نسبت به طول ماه) — از تاریخ همین فایل خوانده می‌شود */
export function periodInfo(model){
  const to = String(model.period?.to || ""), m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(to);
  const last = model.months[model.months.length-1];
  if(!m) return {partial:false, frac:1, day:0, len:0};
  const day = +m[3], mon = +m[2], len = monthLen(mon), same = String(m[1])+String(mon).padStart(2,"0") === last;
  return {partial: same && day < len, frac: same ? Math.min(1, day/len) : 1, day, len, month: mon};
}

/* ───────────── مدل ───────────── */
const cache = new WeakMap();
const zeros = n => new Array(n).fill(0);
const add = (a, b) => { for(let i = 0; i < a.length; i++) a[i] += b[i] || 0; };
/** رکوردها را با ارجاع به امور/شهر/کاربری آماده می‌کند (یک‌بار برای هر Dataset) */
export function prepare(p){
  if(cache.has(p)) return cache.get(p);
  const recs = p.rows.map(r => ({par:p.pars[r.p].id, parT:p.pars[r.p].t, city:p.cities[r.c].id, cityT:p.cities[r.c].t, cityPar:p.pars[r.p].id,
    bt:p.bts[r.b].id, btT:p.bts[r.b].t, armed:p.bts[r.b].armed, rural:p.cities[r.c].rural, it:r.it}));
  const model = {months:p.months, title:p.title, period:p.period, recs, stats:p.stats || {},
    pars:p.pars.map(x=>({id:x.id,t:x.t})), cities:p.cities.map(c=>({id:c.id,t:c.t,par:p.pars[c.p].id,rural:c.rural})), bts:p.bts.map(b=>({id:b.id,t:b.t,armed:b.armed}))};
  cache.set(p, model); return model;
}
/** فیلتر: armed(with|without|only) · settlement(all|city|rural) · pars/cities/bts (Set؛ خالی = همه) */
export function filterRecs(model, f){
  return model.recs.filter(r =>
    (f.armed === "with" || r.armed === (f.armed === "only")) &&
    (f.settlement === "all" || r.rural === (f.settlement === "rural")) &&
    (!f.pars?.size || f.pars.has(r.par)) && (!f.cities?.size || f.cities.has(r.city)) && (!f.bts?.size || f.bts.has(r.bt)));
}
const KEYS = ["income","net","collection","consumption","water","sewage","excess","hot","tax","other","discount"];
export function sumItems(recs, M){
  const o = {}; KEYS.forEach(k => o[k] = zeros(M));
  for(const r of recs) for(const k of KEYS) add(o[k], r.it[k]);
  o.ratio = o.income.map((v, i) => v > 0 ? o.collection[i]/v*100 : 0);   /* درصد وصول = وصول ÷ جمع کل درآمد (٪) */
  return o;
}
export function groupBy(recs, dim, M){
  const m = new Map(), tk = dim === "par" ? "parT" : dim === "city" ? "cityT" : "btT";
  for(const r of recs){ const id = r[dim]; let g = m.get(id); if(!g) m.set(id, g = {id, name:r[tk], recs:[], par:r.par}); g.recs.push(r); }
  for(const g of m.values()){ g.it = sumItems(g.recs, M); g.n = g.recs.length; }
  return m;
}
export const seriesOf = (it, id) => id === "ratio" ? it.income.map((v,i) => v > 0 ? it.collection[i]/v*100 : 0) : it[id];
export function over(it, id, a, b){
  const s = k => { let t = 0; for(let i = a; i <= b; i++) t += it[k][i] || 0; return t; };
  return id === "ratio" ? (s("income") > 0 ? s("collection")/s("income")*100 : 0) : s(id);
}
export const pctChange = (cur, prev) => prev ? (cur - prev)/Math.abs(prev)*100 : null;


/* ───────────── پیش‌بینی (لایهٔ داده‌محور روی trendModels) ───────────── */
/** «فصل گرم»: فقط ماه‌های صدور مبلغ دارند؛ ماه‌های دیگر صفر. ماه صدور با مقدار همان ماه در سال قبل (اگر هست) یا روند همان سال برآورد می‌شود. */
function forecastHot(y, codes, h){
  const hf = S("trend.hotFrom"), ht = S("trend.hotTo"), inHot = c => { const m = +String(c).slice(4); return hf <= ht ? (m >= hf && m <= ht) : (m >= hf || m <= ht); };
  const last = codes[codes.length-1], pos = new Map(codes.map((c, i) => [c, i]));
  const obs = y.map((v, i) => ({c:codes[i], v, i})).filter(o => inHot(o.c) && o.v > 0), vals = obs.map(o => o.v), mu = mean(vals);
  const fc = [];
  for(let k = 1; k <= h; k++){
    const code = addMonths(last, k); let v = 0;
    if(inHot(code)){
      const py = pos.get(addMonths(code, -12));
      if(py != null && y[py] > 0) v = y[py];
      else{ const yr = code.slice(0, 4), cur = obs.filter(o => o.c.slice(0, 4) === yr);
        if(cur.length >= 2){ const f = ols(cur.map(o => o.v)); v = Math.max(0, f.a + f.b*(+code.slice(4) - +cur[0].c.slice(4))); }
        else if(cur.length === 1) v = cur[0].v; else v = mu; }
    }
    fc.push(v);
  }
  return {fc};
}
/** پیش‌بینی ترکیبی: هر جزء جدا (فصل گرم با منطق خودش، بقیه خودکار) و جمع نتایج؛ t = تعداد ماه‌های آموزش */
function composeParts(parts, codes, t, hh){
  const cs = codes.slice(0, t), moy0 = +cs[0].slice(4), fc = Array(hh).fill(0);
  PARTS.forEach((k, j) => { const ys = parts[j].slice(0, t), r = k === "hot" ? forecastHot(ys, cs, hh) : forecastSeries(ys, hh, "auto", moy0, {allowNeg:true}); r.fc.forEach((v, i) => { fc[i] += v; }); });
  return fc;
}

/* ───── سناریوی تعرفه/مالیات: ضریب ماهانه روی خروجی مدل (فقط ماه‌های پیش‌بینی ≥ تاریخ اعمال) ───── */
const ym = (y, m) => String(Math.round(y)) + String(Math.round(m)).padStart(2, "0");
export function scenarioInfo(){
  const tp = S("trend.tariffPct")/100, xp = S("trend.taxPct")/100; if(!tp && !xp) return null;
  return {tp, xp, tf:ym(S("trend.tariffYear"), S("trend.tariffMonth")), xf:ym(S("trend.taxYear"), S("trend.taxMonth"))};
}
function scenarioFactors(it, id, refIdx, codes){
  const sc = scenarioInfo(); if(!sc) return null;
  const ft = c => sc.tp && c >= sc.tf ? 1 + sc.tp : 1, fx = c => sc.xp && c >= sc.xf ? 1 + sc.xp : 1;
  if(PARTS.includes(id)) return codes.map(c => id === "tax" ? ft(c)*fx(c) : ft(c));
  if(id !== "income" && id !== "collection") return null;
  const a = Math.max(0, refIdx - 2), w = {}; let tot = 0;
  for(const k of PARTS){ let v = 0; for(let i = a; i <= refIdx; i++) v += it[k][i] || 0; w[k] = Math.max(0, v); tot += w[k]; }
  if(!tot) return null;
  return codes.map(c => PARTS.reduce((t, k) => t + w[k]/tot*(k === "tax" ? ft(c)*fx(c) : ft(c)), 0));
}
const memo = new WeakMap();
/** پیش‌بینی h ماه یک شاخص از it (سری‌های ماهانهٔ تجمیع‌شده).
 *  o = {method:"auto"|شناسهٔ مدل|"parts", a, b}؛ بازهٔ آموزش: کل تاریخچه (تنظیم trainFull) یا [a,b].
 *  خروجی: {fc, lo, hi, method, eval, rel, sigma, note, origin (اندیس آخرین ماه واقعی)، refIdx/ref (آخرین ماه کامل آموزش)، uncert (نیم‌پهنا/مقدار در آخر افق)، uncertHigh} */
export function forecastMetric(it, id, model, h, o = {}){
  const M = model.months.length, method = o.method || "auto", a = o.a ?? 0, b = o.b ?? M - 1, full = S("trend.trainFull");
  const key = [id, h, method, full ? "f" : a + "-" + b, S("trend.components"), S("trend.excludePartial"), S("trend.confidence"), S("trend.maWindow"), S("trend.hotFrom"), S("trend.hotTo"), S("trend.minBacktest"), S("trend.seasonalMin"), S("trend.arimaMin")].join("|");
  /* هر سری تجمیع‌شده حافظهٔ مستقل دارد؛ کلیدهای نمایشی مشترک نباید پیش‌بینی گروه دیگری را بازگردانند. */
  const holder = it; let mm = memo.get(holder); if(!mm) memo.set(holder, mm = new Map()); if(mm.size > 4000) mm.clear(); const fk = key + "|" + [S("trend.tariffPct"), S("trend.tariffYear"), S("trend.tariffMonth"), S("trend.taxPct"), S("trend.taxYear"), S("trend.taxMonth")].join(","); if(mm.has(fk)) return mm.get(fk);
  const tr0 = full ? 0 : a; let tr1 = full ? M - 1 : b, cut = 0;
  const pi = periodInfo(model);
  if(S("trend.excludePartial") && pi.partial && tr1 === M - 1 && tr1 - tr0 >= 3){ tr1--; cut = 1; }
  const codes = model.months.slice(tr0, tr1 + 1), moy0 = +codes[0].slice(4), y = (it[id] || []).slice(tr0, tr1 + 1), H = h + cut;
  let extra = null, m = method;
  if(id === "income" && S("trend.components") && y.length >= 4 && (m === "auto" || m === "parts")){
    const parts = PARTS.map(k => it[k].slice(tr0, tr1 + 1));
    extra = {parts:{run:(ys, hh) => composeParts(parts, codes, ys.length, hh), min:4}};
  } else if(m === "parts") m = "auto";
  const r = forecastSeries(y, H, m, moy0, {extra, allowNeg:id === "other", prefer:extra ? {id:"parts", tol:1.15, t:METHOD_T.parts} : null});
  if(id === "hot" && m === "auto"){   /* فصل گرم: فقط ماه‌های صدور مبلغ دارند؛ منطق اختصاصی (همان منطق روش «ترکیبی از اجزا») */
    const hf = forecastHot(y, codes, H).fc;
    r.lo = r.lo.map((v, i) => Math.max(0, v + hf[i] - r.fc[i])); r.hi = r.hi.map((v, i) => Math.max(0, v + hf[i] - r.fc[i])); r.fc = hf; r.method = "hot";
  }
  if(cut){ r.fc = r.fc.slice(cut); r.lo = r.lo.slice(cut); r.hi = r.hi.slice(cut); r.note = ((r.note ? r.note + " " : "") + `ماه آخر (${mName(model.months[M-1])}) ناقص بود و در برازش نیامد.`).trim(); }
  const n = r.fc.length, lastFc = r.fc[n-1] || 0, uncert = n ? (r.hi[n-1] - r.lo[n-1])/2/Math.max(Math.abs(lastFc), 1e-9) : 0;
  const out = {...r, origin:tr1 + cut, refIdx:tr1, ref:y[y.length-1] ?? 0, partialCut:!!cut, uncert, uncertHigh:uncert*100 > S("trend.uncertainHigh"), trainFrom:tr0, trainTo:tr1};
  const fcodes = Array.from({length:out.fc.length}, (_, i) => addMonths(model.months[out.origin], i + 1)), fac = scenarioFactors(it, id, out.refIdx, fcodes);
  if(fac && fac.some(f => f !== 1)){ out.fc = out.fc.map((v, i) => v*fac[i]); out.lo = out.lo.map((v, i) => v*fac[i]); out.hi = out.hi.map((v, i) => v*fac[i]); out.scen = fac; }
  mm.set(fk, out); return out;
}
/** تعداد ماه‌های باقی‌ماندهٔ سال شمسی پس از ماه اندیس i */
export const monthsLeftInYear = (model, i) => 12 - (+model.months[i].slice(4));
/** پیش‌بینی پایان سال: جمع واقعی سال جاری تا مبدأ + جمع پیش‌بینی ماه‌های باقی‌مانده (بازه: جمع کران‌ها، محافظه‌کارانه) */
export function yearEnd(it, id, model, o = {}){
  const M = model.months.length, origin0 = (S("trend.trainFull") ? M - 1 : (o.b ?? M - 1)), left = monthsLeftInYear(model, origin0);
  if(left <= 0) return null;
  const r = forecastMetric(it, id, model, left, o), yr = model.months[r.origin].slice(0, 4);
  let ytd = 0; for(let i = 0; i <= r.origin; i++) if(model.months[i].slice(0, 4) === yr) ytd += it[id][i] || 0;
  return {r, left, year:yr, ytd, total:ytd + sum(r.fc), lo:ytd + sum(r.lo), hi:ytd + sum(r.hi)};
}
/** نقاط پرت منفرد (جهش‌های تک‌ماهه) با امتیاز Z مقاوم روی تفاضل مرتبه دوم؛ اندیس‌های نسبی را برمی‌گرداند */
export function outliers(y){
  const z = S("trend.outlierZ"); if(!z || y.length < 6) return [];
  const e = []; for(let t = 1; t < y.length - 1; t++) e.push(y[t] - (y[t-1] + y[t+1])/2);
  const med = median(e), mad = median(e.map(v => Math.abs(v - med)))*1.4826; if(!mad) return [];
  const out = []; e.forEach((v, i) => { if(Math.abs(v - med)/mad > z) out.push(i + 1); }); return out;
}

/* ───────────── قالب‌بندی و کیفیت داده ───────────── */
export const fmtFa = (v, d = 0) => (v == null || !isFinite(v)) ? "—" : Number(v).toLocaleString("fa-IR", {maximumFractionDigits:d, minimumFractionDigits:0});
/** کیفیت داده (روی کل داده، مستقل از فیلتر) */
export function dataQuality(model){
  const M = model.months.length; let negInc = 0, negCol = 0, bigRatio = 0, mismatch = 0, noInc = 0;
  for(const r of model.recs){
    const inc = r.it.income, col = r.it.collection;
    for(let i = 0; i < M; i++){
      if(inc[i] < 0) negInc++; if(col[i] < 0) negCol++;
      if(inc[i] > 0 && col[i] > 5*inc[i]) bigRatio++;
      if(inc[i] <= 0 && col[i] > 0) noInc++;
      if(inc[i] > 1e6 && r.it.other[i] < -0.05*inc[i]) mismatch++;
    }
  }
  const pi = periodInfo(model), items = [];
  if(pi.partial) items.push({sev:"warn", t:`ماه آخر (${mName(model.months[M-1])}) ناقص است: گزارش تا روز ${fmtFa(pi.day)} از ${fmtFa(pi.len)} روز. مقایسه ماه آخر با ماه‌های کامل گمراه‌کننده است.`});
  if(negInc) items.push({sev:"warn", t:`${fmtFa(negInc)} مقدار «جمع درآمد» منفی (ردیف×ماه) — احتمالاً اصلاحیه/برگشتی.`});
  if(negCol) items.push({sev:"warn", t:`${fmtFa(negCol)} مقدار «وصولی» منفی (ردیف×ماه).`});
  if(noInc) items.push({sev:"info", t:`${fmtFa(noInc)} مورد (ردیف×ماه) وصولی مثبت با درآمد صفر/منفی؛ در درصد وصول ردیف‌های ریز اثر می‌گذارد، در سطح امور معمولاً خنثی می‌شود.`});
  if(bigRatio) items.push({sev:"info", t:`${fmtFa(bigRatio)} مورد (ردیف×ماه) وصولی بیش از ۵ برابر درآمد (وصول مطالبات معوق).`});
  if(mismatch) items.push({sev:"info", t:`${fmtFa(mismatch)} مورد (ردیف×ماه) که «سایر» (درآمد − اجزا) بیش از ۵٪ درآمد منفی است؛ یعنی جمع کل درآمد با اجزای شناخته‌شده نمی‌خواند.`});
  const nt = model.stats?.noTotal; if(nt){ let tot = 0; for(const r of model.recs) for(let i = 0; i < M; i++) tot += r.it.income[i] || 0;
    items.push({sev:"info", t:`${fmtFa(nt)} رکورد (امور×شهر×کاربری) اجزای درآمد دارند ولی ردیف «جمع کل درآمد» در فایل ندارند؛ طبق منطق فایل درآمد آن‌ها صفر محسوب شد و در جمع درآمد نیامده است (مجموع اجزای آن‌ها ≈ ${fmtFa(model.stats.noTotalAmt/1e9, 2)} میلیارد ریال، ${fmtFa(model.stats.noTotalAmt/Math.max(1, tot)*100, 3)}٪ درآمد کل).`}); }
  return items;
}

/* ───────────── برداشت‌های توصیفی (فقط از خروجی مدل پیش‌بینی) ───────────── */
const trendWord = d => d == null ? "نامشخص" : d > 3 ? "صعودی" : d < -3 ? "نزولی" : "تقریباً ثابت";
/** جمع‌بندی اتکای پیش‌بینی‌ها: بدترین سطح بین شاخص‌ها */
export function reliabilitySummary(res){
  const order = {none:0, low:1, ok:2}, list = Object.values(res).filter(Boolean);
  if(!list.length) return null;
  return list.reduce((w, r) => order[r.rel.level] < order[w.rel.level] ? r : w).rel;
}
/** res = {metric: forecastMetric(...)}, fmt(metric,v)/unit(metric) از UI، ents = [{name, ref, fc1, fcH, uncert, level}] برای امور، ye = {income, collection} (yearEnd) */
export function forecastInsights({model, res, H, fmt, unit, ents, entMetric, ye, a, b}){
  const L = [], conf = S("trend.confidence");
  for(const m of MAIN){
    const r = res[m]; if(!r || !r.fc.length) continue;
    const nm = METRICS[m].t, ref = r.ref, f1 = r.fc[0], fH = r.fc[r.fc.length-1], refCode = model.months[r.refIdx], m1 = mName(addMonths(model.months[r.origin], 1), true), mH = mName(addMonths(model.months[r.origin], r.fc.length), true);
    const isR = m === "ratio", d1 = isR ? f1 - ref : pctChange(f1, ref), dH = isR ? fH - ref : pctChange(fH, ref), tag = r.rel.level === "ok" ? "" : r.rel.level === "none" ? " <em>(قابل اتکا نیست)</em>" : " <em>(اتکای محدود)</em>";
    const inBand = ref >= r.lo[0] && ref <= r.hi[0];
    const tone = r.rel.level === "none" ? "warn" : (m === "consumption" ? "info" : dH != null && dH < -3 ? "crit" : dH != null && dH > 3 ? "good" : "info");
    L.push({tone, html:`<b>${nm}</b>${tag}: پیش‌بینی ${m1} برابر <b>${fmt(m, f1)} ${unit(m)}</b> (${d1 == null ? "—" : (d1 >= 0 ? "افزایش " : "کاهش ") + fmtFa(Math.abs(d1), isR ? 1 : 0) + (isR ? " واحد درصد" : "٪")} نسبت به ${mName(refCode, true)}${inBand ? "؛ در محدودهٔ نوسان معمول مدل، یعنی تغییر معنادار آماری نیست" : ""}). تا ${mH} به <b>${fmt(m, fH)}</b> می‌رسد؛ روند آینده <b>${trendWord(dH)}</b> (${dH == null ? "—" : (dH >= 0 ? "افزایش " : "کاهش ") + fmtFa(Math.abs(dH), isR ? 1 : 0) + (isR ? " واحد درصد" : "٪")} نسبت به آخرین دوره). مدل: ${METHOD_T[r.method] || r.method}${r.eval?.chosen?.ok && r.eval.chosen.smape != null ? `، خطای خارج از نمونه (sMAPE) ≈ ${fmtFa(r.eval.chosen.smape)}٪` : ""}.`});
    if(r.uncertHigh) L.push({tone:"warn", html:`<b>عدم‌قطعیت بالا — ${nm}</b>: نیم‌پهنای بازهٔ ${fmtFa(conf)}٪ در ${mH} برابر ${fmtFa(r.uncert*100)}٪ مقدار پیش‌بینی است (از ${fmt(m, r.lo[r.lo.length-1])} تا ${fmt(m, r.hi[r.hi.length-1])} ${unit(m)}).`});
  }
  const ri = res.income, rc = res.collection;
  if(ri && rc && ri.fc.length && rc.fc.length){
    const si = sum(ri.fc), sc = sum(rc.fc);
    if(si > 0) L.push({tone:sc/si*100 < 70 ? "crit" : sc/si*100 < 85 ? "warn" : "good", html:`مجموع پیش‌بینی وصول در ${fmtFa(ri.fc.length)} ماه آینده <b>${fmt("collection", sc)} ${unit("collection")}</b> در برابر پیش‌بینی درآمد خالص <b>${fmt("income", si)} ${unit("income")}</b> است؛ یعنی نسبت وصول به درآمد ≈ <b>${fmtFa(sc/si*100, 1)}٪</b>.`});
  }
  for(const [id, e] of Object.entries(ye || {})){
    if(!e) continue;
    L.push({tone:"info", html:`پیش‌بینی پایان سال ${e.year} — <b>${METRICS[id].t}</b>: <b>${fmt(id, e.total)} ${unit(id)}</b> (واقعی تا ${mName(model.months[e.r.origin])}: ${fmt(id, e.ytd)} + پیش‌بینی ${fmtFa(e.left)} ماه باقی‌مانده)؛ بازهٔ محافظه‌کارانه ${fmt(id, e.lo)} تا ${fmt(id, e.hi)}.`});
  }
  if(ents && ents.length > 1){
    const nm = METRICS[entMetric].t, ok = ents.filter(e => e.ref > 0 && e.fc1 != null);
    const dec = [...ok].sort((x, y) => pctChange(x.fc1, x.ref) - pctChange(y.fc1, y.ref)).slice(0, 3).filter(e => pctChange(e.fc1, e.ref) < -3);
    const inc = [...ok].sort((x, y) => pctChange(y.fc1, y.ref) - pctChange(x.fc1, x.ref)).slice(0, 3).filter(e => pctChange(e.fc1, e.ref) > 3);
    const lst = arr => arr.map(e => { const d = pctChange(e.fc1, e.ref); return `<b>${e.name.replace(/^امور\s*/, "")}</b> (${d >= 0 ? "افزایش " : "کاهش "}${fmtFa(Math.abs(d))}٪)`; }).join("، ");
    if(dec.length) L.push({tone:"crit", html:`بیشترین کاهش پیش‌بینی‌شدهٔ ${nm} در ماه بعد (نسبت به آخرین دوره واقعی): ${lst(dec)}.`});
    if(inc.length) L.push({tone:"good", html:`بیشترین افزایش پیش‌بینی‌شدهٔ ${nm} در ماه بعد: ${lst(inc)}.`});
    const unc = ents.filter(e => e.uncertHigh).sort((x, y) => y.uncert - x.uncert);
    if(unc.length) L.push({tone:"warn", html:`${fmtFa(unc.length)} امور از ${fmtFa(ents.length)} مورد پیش‌بینی ${nm} با عدم‌قطعیت بالا دارند (نیم‌پهنای بازه بیش از ${fmtFa(S("trend.uncertainHigh"))}٪)؛ پرنوسان‌ترین: ${unc.slice(0, 3).map(e => `<b>${e.name.replace(/^امور\s*/, "")}</b>`).join("، ")}.`});
  }
  return L;
}
