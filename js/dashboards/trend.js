/* تب «روند»: روند تاریخی، مقایسهٔ امور/شهرها و پیش‌بینی مصرف، درآمد خالص (= جمع ردیف‌های «جمع کل درآمد»، بدون کسر دوبارهٔ تخفیف)، وصول و درصد وصول.
   داده: data/150.xlsx (همان مسیر دیتای تحلیل فارس). تاریخ و روز سپری‌شدهٔ سال از عنوان همین فایل خوانده می‌شود.
   چیدمان: کنترل‌ها ← نمودار ترکیبی (شاخص‌های انتخابی، پیش‌بینی روشن) ← مقایسهٔ امورها (نمودارهای جدا کنار هم) ← مقایسهٔ شهرهای امور انتخابی
   ← جزئیات درآمد (پیش‌فرض بسته: روند اجزا، ستونی عددی/درصدی، دونات، جدول بر اساس سطح انتخابی) ← برداشت‌ها ← مستندات. */
import {scopeButtonsHtml, ARMED_ORDER, SETTLEMENT_ORDER, nextOf} from "../filters/scopeFilters.js";
import {get as S} from "../settings/settings.js";
import {METRICS, MAIN, PARTS, MONEY_UNITS, VOL_UNITS, METHOD_T, mName, addMonths, periodInfo, prepare, filterRecs, sumItems, groupBy, pctChange, over, scenarioInfo,
  forecastMetric, yearEnd, outliers, dataQuality, forecastInsights, reliabilitySummary, monthsLeftInYear, fmtFa as fa} from "../engines/trendEngine.js";
import {docsHtml, evalTableHtml} from "../engines/trendDocs.js";
import {slot, paint, paintAll, specs, spark, indexAt, xOf, yearColor} from "./trendCharts.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const ui = {armed:"without", settlement:"all", pars:[], cities:[], bts:[], a:0, b:null, metrics:["consumption", "income", "collection"], method:"auto", h:null, unit:"brial", vunit:"km3", fcOn:true, bandOn:null,
  pickOpen:{}, openDrop:null, revMode:"num", revMeasure:"income", revDonutYear:null, yearsOff:[], yMetrics:["consumption"]};
const PRICE_META = {t:"قیمت آب فروش‌رفته", k:"money", c:"#00B8D4"};
const DISPLAY_METRICS = [...MAIN, "price"];
const metricMeta = k => k === "price" ? PRICE_META : METRICS[k];
let docsLazy = null, ctxNow = null, bound = false, resizeObs = null, tipEl = null, drag = null, lastTable = null;
const sel = k => new Set(ui[k]);
const toggleIn = (arr, v) => { const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); };
function sanitize(model){
  const ok = (arr, list) => arr.filter(id => list.some(x => x.id === id));
  ui.pars = ok(ui.pars, model.pars); ui.cities = ok(ui.cities, model.cities); ui.bts = ok(ui.bts, model.bts);
  const M = model.months.length; if(ui.b == null || ui.b >= M) ui.b = M - 1; if(ui.a > ui.b) ui.a = 0; if(ui.a < 0) ui.a = 0;
  ui.metrics = DISPLAY_METRICS.filter(m => ui.metrics.includes(m)); if(!ui.metrics.length) ui.metrics = ["income"];
  /* مقایسه سال‌ها فقط یک شاخص فعال دارد؛ انتخاب قدیمی/نامعتبر نیز به یک شاخص نرمال می‌شود. */
  ui.yMetrics = [DISPLAY_METRICS.includes(ui.yMetrics?.[0]) ? ui.yMetrics[0] : "consumption"];
  ui.yearsOff = [...new Set((ui.yearsOff || []).map(String))].filter(y => model.months.some(c => String(c).slice(0, 4) === y));
}
const SEV = {warn:"⚠", info:"ℹ", crit:"●", good:"✔"};
const tipHtml = (title, rows) => `<b>${esc(title)}</b>` + rows.map(r => `<span>${r[2] ? `<i style="background:${r[2]}"></i>` : ""}${esc(r[0])}: <strong>${esc(r[1])}</strong></span>`).join("");
function dropBtn(kind, label, panelHtml, active, clearTitle){
  return `<div class="filter-pair"><div class="filter-btn-wrap">
    <button type="button" class="filter-dropdown-btn ${ui.openDrop === kind ? "open" : ""}" data-tr-toggle="${kind}" aria-haspopup="listbox" aria-expanded="${ui.openDrop === kind}"><span>${esc(label)}</span><i data-lucide="chevron-down" class="chev"></i></button>
    <div class="filter-dropdown ${kind === "bt" ? "usage-dropdown" : ""} ${ui.openDrop === kind ? "" : "hidden"}" data-tr-panel="${kind}" role="listbox">${panelHtml}</div></div>
    <button type="button" class="clear-btn ${active ? "active" : ""}" data-tr-clear="${kind}" title="${clearTitle}" aria-label="${clearTitle}" ${active ? "" : "disabled"}><i data-lucide="eraser"></i></button></div>`;
}
const pill = (name, opts, cur, title) => `<label class="tr-pill"><span>${title}</span><select class="fin-pill" data-tr="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
const seg = (name, opts, cur, title) => `<div class="tr-seg" role="group" aria-label="${title}">${opts.map(([v, t, c]) => `<button type="button" class="${String(cur) === String(v) ? "on" : ""}" data-tr-seg="${name}" data-v="${esc(v)}" aria-pressed="${String(cur) === String(v)}">${c ? `<i style="background:${c}"></i>` : ""}${esc(t)}</button>`).join("")}</div>`;
const tog = (name, label, on) => `<label class="tr-tog"><input type="checkbox" data-tr-tog="${name}" ${on ? "checked" : ""}><span>${label}</span></label>`;
const AXIS = {money:"L", vol:"R", pct:"P", price:"Q"};
const sum1 = (arr, a, b) => { let t = 0; for(let i = a; i <= b; i++) t += arr[i] || 0; return t; };
/* زیرمجموعهٔ هر امور روی همان آرایهٔ فیلترشده فقط یک‌بار ساخته می‌شود. */
const parSubsetMemo = new WeakMap();
function byPar(recs, pid){
  let cache = parSubsetMemo.get(recs); if(!cache) parSubsetMemo.set(recs, cache = new Map());
  if(!cache.has(pid)) cache.set(pid, recs.filter(r => r.par === pid));
  return cache.get(pid);
}
const dateFa = (y, m) => fa(y).replace(/٬/g, "") + "/" + fa(m).padStart(2, "۰");

export function renderTrend({data, onSettings}){
  const container = document.getElementById("viewContainer"); if(!container) return;
  rrToken++; clearTimeout(pickTimer); rrAfter.length = 0;      /* هر رندر تازه، رندرهای در صف را بی‌اثر می‌کند */
  document.querySelectorAll("body > [data-tr-panel]").forEach(el => el.remove());
  const model = prepare(data), M = model.months.length; sanitize(model); specs.clear();
  ctxNow = {data, onSettings};
  const un = MONEY_UNITS.find(u => u.id === ui.unit) || MONEY_UNITS[2], vu = VOL_UNITS.find(u => u.id === ui.vunit) || VOL_UNITS[1];
  const kd = k => k === "price" ? "money" : METRICS[k].k, scale = (k, v) => k === "price" ? v : kd(k) === "money" ? v/un.d : kd(k) === "vol" ? v/vu.d : v, sc = (k, arr) => arr.map(v => v == null ? null : scale(k, v));
  const fmt = (k, v) => { if(v == null || !isFinite(v)) return "—"; const x = scale(k, v), ax = Math.abs(x); return kd(k) === "pct" ? fa(x, 1) : fa(x, ax >= 100 ? 0 : ax >= 10 ? 1 : 2); };
  const unit = k => k === "price" ? "ریال/مترمکعب" : kd(k) === "money" ? un.t : kd(k) === "vol" ? vu.t : "٪";
  const axes = {L:{unit:un.t}, R:{unit:vu.t}, P:{unit:"٪ (درصد وصول)", fmt:v => fa(v, 0) + "٪"}, Q:{unit:"ریال/مترمکعب", fmt:v => fa(v, 0)}};
  const a = ui.a, b = ui.b, rtl = S("trend.rtl"), anim = S("trend.anim"), pi = periodInfo(model), mets = ui.metrics, bandOn = ui.bandOn == null ? S("trend.band") : ui.bandOn;
  const trainFull = S("trend.trainFull"), origin0 = trainFull ? M - 1 : b, left = monthsLeftInYear(model, origin0);
  const hSet = ui.h == null ? S("trend.horizon") : ui.h, H = hSet === 0 ? (left > 0 ? left : 3) : hSet;

  const recs = filterRecs(model, {armed:ui.armed, settlement:ui.settlement, pars:sel("pars"), cities:sel("cities"), bts:sel("bts")});
  const recsScope = filterRecs(model, {armed:ui.armed, settlement:ui.settlement, bts:sel("bts")});   /* مقایسه‌ها: مستقل از انتخاب امور/شهر */
  const it = sumItems(recs, M), scopeKey = [ui.armed, ui.settlement, ui.bts.join(",")].join("~"), ckTop = "T|" + scopeKey + "|" + ui.pars.join(",") + "|" + ui.cities.join(",");
  const methodNow = ui.method, fo = ck => ({method:methodNow, a, b, ck});

  /* ── کنترل‌ها ── */
  const parPanel = `<div class="dropdown-list">${model.pars.map(p => `<button type="button" class="dropdown-item ${ui.pars.includes(p.id) ? "selected" : ""}" data-tr-pick="par" data-v="${esc(p.id)}">${esc(p.t.replace(/^امور\s*/, ""))}</button>`).join("")}</div>`;
  const btPanel = `<div class="usage-grid">${model.bts.filter(x => ui.armed === "with" || x.armed === (ui.armed === "only")).map(x => `<button type="button" class="usage-item ${ui.bts.includes(x.id) ? "selected" : ""}" data-tr-pick="bt" data-v="${esc(x.id)}">${esc(x.t)}</button>`).join("")}</div>`;
  const cityList = ui.pars.length === 1 ? model.cities.filter(c => c.par === ui.pars[0] && (ui.settlement === "all" || c.rural === (ui.settlement === "rural"))) : [];
  const cityBox = ui.pars.length === 1 ? `<div class="citysub-inline"><div class="citysub-head"><span>شهر و بخش‌های <b>${esc((model.pars.find(p => p.id === ui.pars[0])?.t || "").replace(/^امور\s*/, ""))}</b></span>
    <button type="button" class="clear-btn ${ui.cities.length ? "active" : ""}" data-tr-clear="city" title="حذف انتخاب شهر/بخش" aria-label="حذف انتخاب شهر/بخش" ${ui.cities.length ? "" : "disabled"}><i data-lucide="eraser"></i></button></div>
    <div class="citysub-chips">${cityList.map(c => `<button type="button" class="citysub-chip ${ui.cities.includes(c.id) ? "selected" : ""}" data-tr-city="${esc(c.id)}">${esc(c.t)}</button>`).join("") || `<span class="fin-fempty">شهری نیست</span>`}</div></div>` : "";
  const monthOpts = model.months.map((c, i) => [i, mName(c, true)]);
  const parLabel = ui.pars.length === 1 ? model.pars.find(p => p.id === ui.pars[0]).t.replace(/^امور\s*/, "") : ui.pars.length ? fa(ui.pars.length) + " امور" : "همه امور";
  const btLabel = ui.bts.length === 1 ? model.bts.find(x => x.id === ui.bts[0]).t : ui.bts.length ? fa(ui.bts.length) + " کاربری" : "فیلتر کاربری";
  const crumbs = [`<button type="button" data-tr-crumb="all">استان</button>`];
  if(ui.pars.length) crumbs.push(`<button type="button" data-tr-crumb="par">${esc(parLabel)}</button>`);
  if(ui.cities.length) crumbs.push(`<button type="button" data-tr-crumb="city">${ui.cities.length === 1 ? esc(model.cities.find(c => c.id === ui.cities[0])?.t) : fa(ui.cities.length) + " شهر"}</button>`);
  if(ui.bts.length) crumbs.push(`<span>${esc(btLabel)}</span>`);
  const posPct = i => (M > 1 ? (rtl ? 1 - i/(M - 1) : i/(M - 1)) : 0)*100, tickStep = Math.max(1, Math.ceil(M/12));
  const full = a === 0 && b === M - 1;
  const rangeHtml = `<div class="tr-rangebox"><div class="tr-range" data-tr-range data-m="${M}" data-a="${a}" data-b="${b}" dir="ltr">
      <div class="tr-rtrack"><div class="tr-rfill" style="left:${Math.min(posPct(a), posPct(b))}%;width:${Math.abs(posPct(a) - posPct(b))}%"></div>
        <button type="button" class="tr-rh" data-h="a" role="slider" aria-label="ابتدای بازهٔ نمایش" aria-valuemin="0" aria-valuemax="${M - 1}" aria-valuenow="${a}" aria-valuetext="${esc(mName(model.months[a], true))}" style="left:${posPct(a)}%"></button>
        <button type="button" class="tr-rh" data-h="b" role="slider" aria-label="انتهای بازهٔ نمایش" aria-valuemin="0" aria-valuemax="${M - 1}" aria-valuenow="${b}" aria-valuetext="${esc(mName(model.months[b], true))}" style="left:${posPct(b)}%"></button></div>
      <div class="tr-rticks">${model.months.map((c, i) => i % tickStep ? "" : `<span style="left:${posPct(i)}%">${esc(mName(c))}</span>`).join("")}</div></div>
    <div class="tr-rsel">${pill("a", monthOpts, a, "از ماه")}${pill("b", monthOpts, b, "تا ماه")}<button type="button" class="tr-set" data-tr-zoomreset ${full ? "disabled" : ""} title="نمایش کل بازهٔ داده"><i data-lucide="maximize"></i><span>کل بازه</span></button></div></div>`;
  /* سناریوی تعرفه/مالیات (فقط پیش‌بینی) — وضعیت در نوار کنترل دیده می‌شود */
  const scen = scenarioInfo();
  const fcCodes = a >= 0 ? Array.from({length:H}, (_, i) => addMonths(model.months[trainFull ? M - 1 : b], i + 1)) : [];
  let scenChip;
  if(scen){
    const parts = [];
    if(scen.tp) parts.push(`تعرفه ${scen.tp > 0 ? "+" : ""}${fa(scen.tp*100, 1)}٪ از ${dateFa(scen.tf.slice(0, 4), +scen.tf.slice(4))}`);
    if(scen.xp) parts.push(`مالیات ${scen.xp > 0 ? "+" : ""}${fa(scen.xp*100, 1)}٪ از ${dateFa(scen.xf.slice(0, 4), +scen.xf.slice(4))}`);
    const reach = fcCodes.some(c => (scen.tp && c >= scen.tf) || (scen.xp && c >= scen.xf));
    scenChip = `<button type="button" class="tr-scen ${reach ? "" : "off"}" data-tr-settings title="سناریوی تعرفه/مالیات در تنظیمات روند قابل تغییر است"><i data-lucide="trending-up"></i><span>سناریو: ${esc(parts.join(" · "))}${reach ? "" : " — خارج از افق فعلی (افق را ۱۲ ماه کنید)"}</span></button>`;
  } else scenChip = `<button type="button" class="tr-scen off" data-tr-settings title="تعرفه آب‌بها و مالیات را در تنظیمات روند وارد کنید"><i data-lucide="trending-up"></i><span>سناریوی تعرفه/مالیات: غیرفعال (تنظیم)</span></button>`;
  const controls = `<section class="map-filters-bar card tr-filterbar tr-ctl">
    <div class="tr-ctl-top">${scopeButtonsHtml({armed:ui.armed, settlement:ui.settlement}, "data-tr-scope")}
    <div class="filters-row filters-row-area">${dropBtn("par", parLabel, parPanel, !!ui.pars.length, "حذف انتخاب امور")}${dropBtn("bt", btLabel, btPanel, !!ui.bts.length, "حذف انتخاب کاربری")}</div></div>
    ${cityBox}
    <div class="tr-ctl-row"><div class="tr-ctl-g"><span class="tr-ctl-l">افق پیش‌بینی</span>${seg("h", [["3", "۳ ماه"], ["6", "۶ ماه"], ["12", "۱۲ ماه"], ["0", "تا پایان سال"]], String(hSet), "افق")}</div>
      ${pill("method", Object.entries(METHOD_T).filter(([k]) => k !== "hot"), ui.method, "روش پیش‌بینی")}
      <div class="tr-ctl-g tr-togs">${tog("fc", "نمایش پیش‌بینی", ui.fcOn)}${tog("band", "بازهٔ عدم‌قطعیت", bandOn)}</div>
      ${pill("unit", MONEY_UNITS.map(u => [u.id, u.t]), ui.unit, "واحد مبلغ")}${pill("vunit", VOL_UNITS.map(u => [u.id, u.t]), ui.vunit, "واحد مصرف")}
      <div class="tr-ctl-g"><span class="tr-ctl-l">سناریو</span>${scenChip}</div></div>
    ${rangeHtml}
    <nav class="tr-crumbs" aria-label="مسیر">${crumbs.join('<i aria-hidden="true">‹</i>')}</nav>
  </section>`;
  const head = `<header class="tr-head"><div><h2>روند و پیش‌بینی مصرف، درآمد و وصول</h2>
    <p class="tr-sub">فایل <b>150.xlsx</b> · بازهٔ گزارش <b>${esc(model.period.from)}</b> تا <b>${esc(model.period.to)}</b> · ${fa(model.period.yearDay)} روز از سال · ${fa(M)} ماه · درآمد خالص = «جمع کل درآمد» فایل (تخفیف دوباره کسر نمی‌شود) · درصد وصول = وصول ÷ درآمد خالص</p></div>
    <button type="button" class="tr-set" data-tr-settings title="تنظیمات این تب (افق و اطمینان پیش‌بینی، فصل گرم، سناریوی تعرفه و مالیات، جهت جدول …)"><i data-lucide="sliders-horizontal"></i><span>تنظیمات روند</span></button></header>`;
  const partialBanner = pi.partial ? `<div class="tr-warn" role="note">⚠ ماه آخر (${mName(model.months[M-1])}) ناقص است: گزارش تا روز ${fa(pi.day)} از ${fa(pi.len)}. ${S("trend.excludePartial") ? "در برازش پیش‌بینی نیامده است؛ " : ""}مقایسهٔ این ماه با ماه‌های کامل کاهش کاذب نشان می‌دهد.</div>` : "";
  const rootCls = "tr-root " + (S("trend.tableRtl") ? "tr-tbl-r" : "tr-tbl-l");
  if(!recs.length){
    container.innerHTML = `<div class="${rootCls}">${head}${controls}<section class="card empty"><h3>داده‌ای در این محدوده نیست</h3><p>فیلترها را تغییر دهید یا پاک کنید.</p></section></div>`;
    bind(container); return finish(container);
  }

  /* ── پیش‌بینی چهار شاخص (آموزش روی کل تاریخچه یا طبق تنظیم) ── */
  const res = {}; for(const m of MAIN) res[m] = forecastMetric(it, m, model, H, fo(ckTop));
  const forecastMets = mets.filter(m => MAIN.includes(m));
  const origin = res[forecastMets[0] || "consumption"].origin, fcShow = ui.fcOn && forecastMets.length > 0 && origin === b, nAct = b - a + 1;
  const priceFull = it.water.map((v, i) => it.consumption[i] > 0 ? v / it.consumption[i] : null);
  const priceAnnotations = full => {
    const out = [];
    for(let i = a; i <= b; i++){
      const v = full[i], prev = i > 0 ? full[i - 1] : null;
      if(v != null && prev != null && prev > 0 && v > prev){ const d = pctChange(v, prev); if(d != null) out.push({i:i-a, text:`▲${fa(d, 0)}٪`}); }
      const y = String(model.months[i]).slice(0, 4), isYearEnd = i === M - 1 || String(model.months[i + 1]).slice(0, 4) !== y;
      if(isYearEnd && v != null){ let py = -1; for(let j = 0; j < M; j++) if(String(model.months[j]).slice(0, 4) === String(+y - 1)) py = j;
        if(py >= 0 && full[py] > 0){ const d = pctChange(v, full[py]); if(d != null) out.push({i:i-a, text:`سالانه ${d >= 0 ? "▲" : "▼"}${fa(Math.abs(d), 0)}٪`}); }
      }
    }
    return out;
  };
  const codesAct = model.months.slice(a, b + 1), fcC = Array.from({length:H}, (_, i) => addMonths(model.months[origin], i + 1)), codesAll = [...codesAct, ...(fcShow ? fcC : [])];
  const labels = codesAll.map(c => mName(c)), short = codesAll.map(c => fa(+c.slice(4))), years = codesAll.map(c => c.slice(0, 4)), labelsFull = codesAll.map(c => mName(c, true));
  const yearSet = [...new Set(years)];
  const isPartial = i => pi.partial && a + i === M - 1;
  const mkSeries = (m, ent, r, o = {}) => { const raw = ent.slice(a, b + 1);
    return {id:o.id || m, name:o.name || metricMeta(m).t, color:o.color || metricMeta(m).c, axis:AXIS[kd(m)], act:sc(m, raw), fc:fcShow && r ? sc(m, r.fc) : null, lo:fcShow && r ? sc(m, r.lo) : null, hi:fcShow && r ? sc(m, r.hi) : null,
      out:o.out ? outliers(raw).filter(i => !isPartial(i)) : [], raw, ent, rraw:r, m, width:o.width}; };
  const mkPriceSeries = (ent, o = {}) => { const raw = ent.slice(a, b + 1); return {id:o.id || "price", name:o.name || PRICE_META.t, color:o.color || PRICE_META.c, axis:"Q", act:sc("price", raw), fc:null, lo:null, hi:null, out:[], raw, ent, rraw:null, m:"price", width:o.width, annotations:priceAnnotations(ent)}; };
  const delta = (m, v, prev) => { if(prev == null || !isFinite(prev) || (m !== "ratio" && !prev)) return ""; const d = m === "ratio" ? v - prev : pctChange(v, prev); return d == null ? "" : ` (${d >= 0 ? "▲" : "▼"} ${fa(Math.abs(d), m === "ratio" ? 1 : 0)}${m === "ratio" ? " واحد" : "٪"} نسبت به ماه قبل)`; };
  const tipFor = (list, ttlFn) => i => { const isFc = i >= nAct, j = i - nAct, rows = [];
    list.forEach(s => { const u = unit(s.m);
      if(!isFc){ const v = s.raw[i], prev = a + i > 0 ? s.ent[a + i - 1] : null; rows.push([s.name, `${fmt(s.m, v)} ${u}${delta(s.m, v, prev)}${s.out?.includes(i) ? " — نقطهٔ پرت" : ""}`, s.color]); }
      else if(s.rraw){ rows.push([s.name + " (پیش‌بینی)", `${fmt(s.m, s.rraw.fc[j])} ${u}`, s.color]); if(bandOn) rows.push(["بازه " + fa(S("trend.confidence")) + "٪", `${fmt(s.m, s.rraw.lo[j])} تا ${fmt(s.m, s.rraw.hi[j])}`]); } });
    return tipHtml(ttlFn(i, isFc), rows); };
  const baseSpec = {labels, short, years, nAct, off:a, axes, rtl};
  const ttl = (i, f) => labelsFull[i] + (f ? " — پیش‌بینی" : isPartial(i) ? " (ماه ناقص)" : "");

  /* سال جاری و سال‌های فعال (خاموش/روشن) — محور فشرده می‌شود تا جای خالی نماند */
  const curYear = yearSet.length ? yearSet[yearSet.length - 1] : null;
  const activeYears = yearSet.filter(y => y === curYear || !ui.yearsOff.includes(y));
  const yearOn = (i) => { const y = years[i]; return !y || y === curYear || !ui.yearsOff.includes(y); };
  const keepIdx = [];
  for(let i = 0; i < nAct; i++) if(yearOn(i)) keepIdx.push(i);
  const nActVis = keepIdx.length;
  for(let i = nAct; i < codesAll.length; i++) keepIdx.push(i);
  const pack = arr => keepIdx.map(i => (arr || [])[i] ?? null);
  const labelsVis = pack(labels), shortVis = pack(short), yearsVis = pack(years), labelsFullVis = pack(labelsFull);
  const baseSpecVis = {labels:labelsVis, short:shortVis, years:yearsVis, nAct:nActVis, off:0, axes, rtl};
  const ttlVis = (i, f) => (labelsFullVis[i] || "") + (f ? " — پیش‌بینی" : (keepIdx[i] != null && isPartial(keepIdx[i]) ? " (ماه ناقص)" : ""));
  const cumUntil = (ent, g) => {
    if(g == null || g < 0) return 0;
    const gi = Math.min(a + g, M - 1);
    const yr = String(model.months[gi]).slice(0, 4);
    let t = 0;
    for(let i = 0; i <= g && a + i < M; i++) if(String(model.months[a + i]).slice(0, 4) === yr) t += ent[a + i] || 0;
    return t;
  };
  const tipForVis = (list) => i => {
    const isFc = i >= nActVis, j = i - nActVis, rows = [];
    list.forEach(s => {
      const u = unit(s.m), isR = s.m === "ratio";
      if(!isFc){
        const gi = keepIdx[i], v = s.rawFull ? s.rawFull[gi] : s.raw[i];
        const prev = gi > 0 && s.ent ? s.ent[a + gi - 1] : null;
        rows.push([s.name, `${fmt(s.m, v)} ${u}${delta(s.m, v, prev)}${s.out?.includes(gi) ? " — نقطهٔ پرت" : ""}`, s.color]);
        if(!isR && s.ent && s.m !== "price") rows.push(["جمع از ابتدای سال", `${fmt(s.m, cumUntil(s.ent, gi))} ${u}`]);
      } else if(s.rraw){
        rows.push([s.name + " (پیش‌بینی)", `${fmt(s.m, s.rraw.fc[j])} ${u}`, s.color]);
        if(bandOn) rows.push(["بازه " + fa(S("trend.confidence")) + "٪", `${fmt(s.m, s.rraw.lo[j])} تا ${fmt(s.m, s.rraw.hi[j])}`]);
        if(!isR && s.ent){
          const ytd = cumUntil(s.ent, nAct - 1);
          let fcSum = 0; for(let k = 0; k <= j; k++) fcSum += s.rraw.fc[k] || 0;
          rows.push(["جمع تا این ماه (واقعی سال + پیش‌بینی)", `${fmt(s.m, ytd + fcSum)} ${u}`]);
          let fcAll = 0; for(let k = 0; k < s.rraw.fc.length; k++) fcAll += s.rraw.fc[k] || 0;
          rows.push(["جمع تا پایان افق پیش‌بینی", `${fmt(s.m, ytd + fcAll)} ${u}`]);
        }
      }
    });
    return tipHtml(ttlVis(i, isFc), rows);
  };

  /* ── ۱) نمودار ترکیبی شاخص‌های انتخابی (اولین نمودار؛ پیش‌بینی به‌طور پیش‌فرض روشن) ── */
  const combS = mets.map(m => {
    const s = m === "price" ? mkPriceSeries(priceFull) : mkSeries(m, it[m], res[m], {out:mets.length === 1});
    s.rawFull = s.raw;
    s.act = pack(s.act);
    s.raw = pack(s.raw);
    s.out = (s.out || []).map(gi => keepIdx.indexOf(gi)).filter(x => x >= 0);
    if(s.annotations) s.annotations = s.annotations.map(x => { const i = keepIdx.indexOf(x.i); return i >= 0 ? {...x, i} : null; }).filter(Boolean);
    return s;
  });
  const combChart = slot("comb", {...baseSpecVis, type:"ts", series:combS, band:bandOn ? "single" : false, height:380, anim, zoom:true, hk:"comb", aria:"روند ترکیبی شاخص‌های انتخابی", tip:tipForVis(combS)});
  const chips = `<div class="tr-mchips" role="group" aria-label="شاخص‌های نمودار (انتخاب ترکیبی)">${DISPLAY_METRICS.map(m => `<button type="button" class="tr-mchip ${mets.includes(m) ? "on" : ""}" style="--c:${metricMeta(m).c}" data-tr-m="${m}" data-tr-hl="comb" data-sid="${m}" aria-pressed="${mets.includes(m)}"><i></i>${esc(metricMeta(m).t)} <small>${esc(unit(m))}</small></button>`).join("")}</div>`;
  const dlK = (m, cur, pv) => { if(pv == null || !isFinite(pv) || (m !== "ratio" && !pv)) return ""; const d = m === "ratio" ? cur - pv : pctChange(cur, pv); return d == null ? "" : ` <em class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${fa(Math.abs(d), m === "ratio" ? 1 : 0)}${m === "ratio" ? " واحد" : "٪"}</em>`; };
  /* پایان‌سال پیش‌بینی‌شده برای شاخص‌های جمع‌پذیر (سال جاری) */
  const yeMap = {};
  for(const m of MAIN){ if(m !== "ratio") yeMap[m] = ui.fcOn ? yearEnd(it, m, model, fo(ckTop)) : null; }
  /* باکس‌های شاخص به تفکیک سال (نه جمع کل بازه) */
  const yearRanges = yearSet.map(y => {
    const idxs = []; for(let i = a; i <= b; i++) if(String(model.months[i]).slice(0, 4) === y) idxs.push(i);
    return {y, idxs, from: idxs[0], to: idxs[idxs.length - 1]};
  }).filter(yr => yr.idxs.length);
  const kpi = yearRanges.map(yr => {
    const yLabel = fa(yr.y).replace(/٬/g, "");
    const cells = MAIN.map(m => {
      const r = res[m], isR = m === "ratio";
      let tot = 0; for(const i of yr.idxs) tot += (it[m][i] || 0);
      if(isR && yr.idxs.length) tot = tot / yr.idxs.length;
      const last = it[m][yr.to], prev = yr.to > 0 ? it[m][yr.to - 1] : null;
      const isLastYear = yr.y === curYear;
      const f1 = isLastYear && r.origin === b ? r.fc[0] : null;
      const ye = isLastYear ? yeMap[m] : null;
      return `<div class="tr-kpi-y ${mets.includes(m) ? "on" : ""}" style="--c:${METRICS[m].c}" data-tr-m="${m}"><span class="tr-kl"><i style="background:${METRICS[m].c}"></i>${METRICS[m].t}<small>${esc(unit(m))}</small></span>
        <b class="tr-kv">${fmt(m, tot)}<small>${isR ? "میانگین سال" : "جمع واقعی تاکنون"}</small></b>
        <span class="tr-kd">آخرین ماه: <b>${fmt(m, last)}</b>${dlK(m, last, prev)}</span>
        ${f1 != null ? `<span class="tr-kd">پیش‌بینی ماه بعد: <b>${fmt(m, f1)}</b>${dlK(m, f1, last)}</span>` : ""}
        ${ye ? `<span class="tr-kd">جمع تا پایان سال (با پیش‌بینی): <b>${fmt(m, ye.total)}</b> <small>از ${fmt(m, ye.lo)} تا ${fmt(m, ye.hi)}</small></span>` : ""}</div>`;
    }).join("");
    return `<div class="tr-kpi-year"><div class="tr-kpi-year-h" style="border-color:${yearColor(yr.y)}"><i style="background:${yearColor(yr.y)}"></i>سال ${yLabel}</div><div class="tr-kpi-year-g">${cells}</div></div>`;
  }).join("");
  const relCls = {none:"crit", low:"warn", ok:"good"}, relTxt = {ok:"اتکای قابل‌قبول", low:"اتکای محدود", none:"قابل اتکا نیست"};
  const mlines = `<ul class="tr-mlines">${forecastMets.map(m => { const r = res[m]; return `<li><i style="background:${METRICS[m].c}"></i><b>${esc(METRICS[m].t)}</b> <span class="tr-badge tr-b-${relCls[r.rel.level]}">${relTxt[r.rel.level]}</span> مدل: <b>${esc(METHOD_T[r.method] || r.method)}</b>${r.eval?.chosen?.ok && r.eval.chosen.smape != null ? ` · sMAPE ≈ <b>${fa(r.eval.chosen.smape, 1)}٪</b>` : ""}</li>`; }).join("")}</ul>`;
  const r0 = res[forecastMets[0] || "consumption"];
  const trainLine = forecastMets.length ? `<p class="tr-sub">آموزش مدل روی ${fa(r0.trainTo - r0.trainFrom + 1)} ماه (${esc(mName(model.months[r0.trainFrom], true))} تا ${esc(mName(model.months[r0.trainTo], true))})${!fcShow && ui.fcOn ? " · پیش‌بینی فقط وقتی «تا ماه» آخرین ماه داده باشد روی نمودار می‌آید." : ""}</p>` : `<p class="tr-sub">قیمت آب فروش‌رفته شاخصی مشتق‌شده است؛ برای آن پیش‌بینی انجام نمی‌شود.</p>`;
  const yrLeg = `<div class="tr-yrleg" role="group" aria-label="نمایش/مخفی سال‌ها"><span class="tr-yrleg-l">سال‌ها:</span>${yearSet.map(y => {
    const isCur = y === curYear, off = !isCur && ui.yearsOff.includes(y);
    return `<button type="button" class="tr-yrbtn ${off ? "off" : "on"}" data-tr-year="${esc(y)}" ${isCur ? "disabled title=\"سال جاری همیشه روشن است\"" : `title="${off ? "روشن کردن" : "خاموش کردن"} سال ${fa(y).replace(/٬/g, "")}"`} aria-pressed="${!off}"><i style="background:${yearColor(y)}"></i>${fa(y).replace(/٬/g, "")}${isCur ? " (جاری)" : ""}</button>`;
  }).join("")}<span class="tr-yrleg-hint">— سال جاری همیشه روشن؛ خاموش/روشن روی همه نمودارها اعمال می‌شود</span></div>`;
  const combHelp = `<p class="tr-hint">برای بزرگ‌نمایی روی نمودار بکشید؛ دوبار کلیک = کل بازه. خط پر = داده واقعی · خط‌چین با نقطهٔ توخالی = پیش‌بینی${bandOn && mets.length === 1 && mets[0] !== "price" ? ` · ناحیهٔ رنگی = بازهٔ عدم‌قطعیت ${fa(S("trend.confidence"))}٪` : ""}. هر شاخص محور مستقل و هم‌رنگ خودش را دارد: مبلغ ← ${esc(un.t)}، مصرف ← ${esc(vu.t)}، درصد وصول ← ٪، قیمت آب فروش‌رفته ← ریال/مترمکعب. برچسب‌های ▲ درصد تغییر ماهانه و «سالانه» تغییر پایان سال نسبت به پایان سال قبل‌اند.</p>`;
  const relAll = forecastMets.length ? reliabilitySummary(Object.fromEntries(forecastMets.map(m => [m, res[m]]))) : {level:"ok", msg:""};
  const relBanner = relAll.level !== "ok" ? `<div class="tr-warn ${relAll.level === "none" ? "tr-warn-crit" : ""}" role="note"><b>${relAll.level === "none" ? "پیش‌بینی‌ها قابل اتکا نیستند." : "اتکای پیش‌بینی‌ها محدود است."}</b> ${esc(relAll.msg)}</div>` : "";

  /* ── کارت نمودار کوچک (نمودار جدا برای هر امور/شهر/جزء) ── */
  /* ser می‌تواند تابع باشد: پیش‌بینی و ساخت سری‌ها تا لحظهٔ رسم همان نمودار به تعویق می‌افتد، پس کارت‌های دور از دید اصلاً محاسبه نمی‌شوند. */
  const smCard = (cid, title, sub, ser, {pick, on, h = 215} = {}) => {
    /* همه کارت‌ها دقیقاً همان سال‌های روشن نمودار اصلی را نمایش می‌دهند؛ افق پیش‌بینی حفظ می‌شود. */
    const build = () => { const visSer = (typeof ser === "function" ? ser() : ser).map(s => { const x = {...s, rawFull:s.raw, act:pack(s.act), raw:pack(s.raw), out:(s.out || []).map(i => keepIdx.indexOf(i)).filter(i => i >= 0)}; if(x.annotations) x.annotations = x.annotations.map(v => { const i = keepIdx.indexOf(v.i); return i >= 0 ? {...v, i} : null; }).filter(Boolean); return x; }); return {series:visSer, tip:tipForVis(visSer)}; };
    const c = slot(cid, {...baseSpecVis, type:"ts", compact:true, height:h, band:false, anim:false, zoom:false, pick:!!pick, aria:title, build});
    return `<article class="tr-mcard ${on ? "on" : ""}" ${pick ? `data-tr-card="${esc(pick)}" tabindex="0" role="button" aria-pressed="${!!on}" aria-label="${esc(title)} — انتخاب"` : ""}><div class="tr-mch"><b title="${esc(title)}">${esc(title)}</b>${on ? `<span class="tr-sel">انتخاب‌شده</span>` : ""}<small>${sub}</small></div>${c}</article>`; };
  const entSeries = (g, ck, withForecast = true) => mets.map(m => m === "price" ? mkPriceSeries(g.it.water.map((v, i) => g.it.consumption[i] > 0 ? v / g.it.consumption[i] : null)) : mkSeries(m, g.it[m], fcShow && withForecast ? forecastMetric(g.it, m, model, H, fo(ck)) : null));
  const subOf = g => {
    const m = mets[0], currentYear = String(model.months[M - 1]).slice(0, 4);
    let yStart = M - 1;
    while(yStart > 0 && String(model.months[yStart - 1]).slice(0, 4) === currentYear) yStart--;
    const total = k => sum1(g.it[k] || [], yStart, M - 1);
    const income = total("income"), consumption = total("consumption");
    const v = m === "price" ? (consumption > 0 ? total("water") / consumption : null)
      : m === "ratio" ? (income > 0 ? total("collection") / income * 100 : 0)
      : total(m);
    return esc(metricMeta(m).t) + " تا " + esc(mName(model.months[M - 1], true)) + ": <b>" + fmt(m, v) + "</b> " + esc(unit(m));
  };
  const nameOf = g => g.name.replace(/^امور\s*/, "");

  /* ── ۲) مقایسهٔ امورها: نمودارهای جدا، کنار هم ── */
  const parGroups = [...groupBy(recsScope, "par", M).values()].sort((x, y) => sum1(y.it.income, a, b) - sum1(x.it.income, a, b));
  const parCards = ui.pars.length ? "" : parGroups.map(g => smCard("sm-par-" + g.id, nameOf(g), subOf(g), () => entSeries(g, `P|${scopeKey}|${g.id}`), {pick:"par:" + g.id, on:false})).join("");
  /* وقتی امور انتخاب شده، مقایسهٔ همهٔ امور جمع می‌شود و فقط شهرهای همان امور نمایش داده می‌شود */
  const parSec = ui.pars.length ? "" : `<section class="tr-sec" id="tr-par-sec"><div class="tr-sec-h"><h3>مقایسهٔ روند همهٔ امورها <small>${fa(parGroups.length)} امور · نمودار جدا برای هر امور</small></h3>
    <p class="tr-sub">هر کارت روند همان شاخص‌های انتخابی بالا (با پیش‌بینی) را برای یک امور نشان می‌دهد و مقیاس محور هر کارت مستقل است؛ امورها بر اساس درآمد خالص بازهٔ نمایش مرتب شده‌اند. با کلیک روی هر نمودار، همان امور انتخاب می‌شود و مقایسهٔ شهرهای آن زیر همین بخش باز می‌شود. نیروی مسلح، شهر/روستا و کاربری اعمال می‌شود.</p></div>
    <div class="tr-sm">${parCards}</div></section>`;

  /* ── ۳) مقایسهٔ شهرهای امور (انتخاب‌شده از فیلتر یا با کلیک روی نمودار امور) ── */
  const citySec = ui.pars.length ? ui.pars.map(pid => {
    const par = model.pars.find(p => p.id === pid), grp = [...groupBy(byPar(recsScope, pid), "city", M).values()].sort((x, y) => sum1(y.it.income, a, b) - sum1(x.it.income, a, b));
    const cards = grp.map(g => smCard("sm-city-" + g.id, g.name, subOf(g), () => entSeries(g, `C|${scopeKey}|${g.id}`), {pick:"city:" + g.id, on:ui.cities.includes(g.id)})).join("");
    return `<section class="tr-sec" id="tr-city-sec"><div class="tr-sec-h"><h3>مقایسهٔ روند شهرها و بخش‌های امور ${esc(par.t.replace(/^امور\s*/, ""))} <small>${fa(grp.length)} مورد</small></h3>
      <p class="tr-sub">برای هر شهر/بخش یک نمودار جدا. با کلیک روی یک شهر، جزئیات درآمد (پایین صفحه) در سطح همان شهر و به تفکیک کاربری نشان داده می‌شود؛ کلیک دوباره انتخاب را برمی‌دارد.</p></div>
      ${cards ? `<div class="tr-sm">${cards}</div>` : `<div class="tr-card"><p class="tr-hint">برای این امور با فیلتر فعلی شهر/بخشی نیست.</p></div>`}</section>`; }).join("")
    : `<section class="tr-sec" id="tr-city-sec"><div class="tr-card"><p class="tr-hint"><b>مقایسهٔ شهرها:</b> یک امور را از فیلتر «همه امور» انتخاب کنید یا روی نمودار یکی از امورهای بالا بزنید تا نمودارهای جدای شهرها و بخش‌های همان امور اینجا باز شود.</p></div></section>`;

  /* ── ۴) جزئیات درآمد (پیش‌فرض بسته؛ محتوا فقط هنگام باز بودن ساخته می‌شود) ── */
  let revBody = "";
  const lvlNames = ui.cities.length ? ui.cities.map(id => model.cities.find(c => c.id === id)?.t).join("، ") : ui.pars.length ? ui.pars.map(id => nameOf({name:model.pars.find(p => p.id === id).t})).join("، ") : "";
  const lvlText = ui.cities.length ? "شهر/بخش: " + lvlNames : ui.pars.length ? "امور: " + lvlNames : "کل استان";
  if(ui.pickOpen.rev){
    const visibleActualIdx = keepIdx.filter(i => i < nAct);
    const partSer = PARTS.map(k => ({id:k, name:METRICS[k].t, color:METRICS[k].c, raw:visibleActualIdx.map(i => it[k][a + i] || 0)}));
    const donutYears = [...new Set(model.months.map(c => String(c).slice(0, 4)))];
    if(!donutYears.includes(String(ui.revDonutYear))) ui.revDonutYear = donutYears[donutYears.length - 1];
    const donutIdx = model.months.map((c, i) => String(c).slice(0, 4) === String(ui.revDonutYear) ? i : -1).filter(i => i >= 0);
    const visibleLabels = visibleActualIdx.map(i => labels[i]), visibleYears = visibleActualIdx.map(i => years[i]), visibleFullLabels = visibleActualIdx.map(i => labelsFull[i]);
    const monTot = visibleLabels.map((_, i) => partSer.reduce((t, s) => t + Math.max(0, s.raw[i] || 0), 0));
    const pct = ui.revMode === "pct", barSer = partSer.map(s => ({...s, values:s.raw.map((v, i) => pct ? (monTot[i] ? Math.max(0, v)/monTot[i]*100 : 0) : scale("income", v))}));
    const barLab = visibleLabels, barYears = visibleYears;
    const compChart = slot("comp", {type:"bars", stacked:true, labels:barLab, years:barYears, series:barSer, rtl, height:320, anim, unit:pct ? "٪" : un.t, fmtAxis:pct ? v => fa(v, 0) + "٪" : null, aria:"ترکیب ماهانهٔ درآمد",
      tip:i => tipHtml(visibleFullLabels[i], [...partSer.map(s => [s.name, `${fa(scale("income", s.raw[i]), 1)} ${un.t} (${fa(monTot[i] ? s.raw[i]/monTot[i]*100 : 0, 1)}٪)`, s.color]), ["جمع اجزا", `${fa(scale("income", monTot[i]), 1)} ${un.t}`]])});
    const dTot = PARTS.map(k => ({id:k, name:METRICS[k].t, color:METRICS[k].c, v:donutIdx.reduce((t, i) => t + (it[k][i] || 0), 0)})), dSum = dTot.reduce((t, s) => t + Math.max(0, s.v), 0);
    const donutChart = slot("donut", {type:"donut", height:270, anim, aria:"سهم اجزای درآمد", items:dTot.map(s => ({id:s.id, value:s.v, color:s.color, tip:`${s.name}: ${fa(scale("income", s.v), 1)} ${un.t} (${fa(dSum ? s.v/dSum*100 : 0, 1)}٪)`})), center:{t1:fa(scale("income", dSum), 0), t2:un.t}});
    const dLeg = `<ul class="tr-dleg">${dTot.map(s => `<li style="--c:${s.color}"><i></i><span>${esc(s.name)}</span><b>${fa(scale("income", s.v), 1)}</b><em>${fa(dSum ? s.v/dSum*100 : 0, 1)}٪</em></li>`).join("")}</ul>`;
    const partCards = PARTS.map(k => smCard("pt-" + k, METRICS[k].t, `<b>${fmt(k, it[k][b])}</b> ${esc(un.t)}`, () => [mkSeries(k, it[k], fcShow ? forecastMetric(it, k, model, H, fo(ckTop)) : null)], {h:190})).join("");
    /* جدول بر اساس سطح انتخابی: استان ← امورها · امور ← شهرها · شهر ← کاربری‌ها (همهٔ ماه‌ها) */
    let pool, dim, rowKind;
    if(ui.cities.length){ pool = recs; dim = "bt"; rowKind = "کاربری"; } else if(ui.pars.length === 1){ pool = byPar(recsScope, ui.pars[0]); dim = "city"; rowKind = "شهر/بخش"; }
    else if(ui.pars.length > 1){ pool = recsScope.filter(r => ui.pars.includes(r.par)); dim = "par"; rowKind = "امور"; } else { pool = recsScope; dim = "par"; rowKind = "امور"; }
    const mk = ui.revMeasure, mm = [["income", "درآمد خالص (جمع کل درآمد)"], ...PARTS.map(k => [k, METRICS[k].t])], mkT = mm.find(x => x[0] === mk)?.[1] || mm[0][1];
    const rows = [...groupBy(pool, dim, M).values()].map(g => ({name:dim === "par" ? nameOf(g) : g.name, arr:g.it[mk]})).sort((x, y) => y.arr.reduce((s, v) => s + v, 0) - x.arr.reduce((s, v) => s + v, 0));
    const totArr = it[mk], totSum = totArr.reduce((s, v) => s + v, 0) || 1, allMonths = model.months;
    const trow = (name, arr, strong) => { const t = arr.reduce((s, v) => s + v, 0); return `<tr class="${strong ? "tr-tot" : ""}"><th scope="row">${esc(name)}</th>${arr.map(v => `<td>${fmt("income", v)}</td>`).join("")}<td><b>${fmt("income", t)}</b></td><td>${fa(t/totSum*100, 1)}٪</td></tr>`; };
    const gapTot = PARTS.reduce((t, k) => t + it[k].reduce((s, v) => s + v, 0), 0) - it.income.reduce((s, v) => s + v, 0);
    lastTable = {head:[rowKind + " — " + mkT + " (ریال)", ...allMonths.map(c => mName(c, true)), "جمع", "سهم از کل (٪)"], rows:[...rows, {name:"جمع " + lvlText, arr:totArr}].map(r => { const t = r.arr.reduce((s, v) => s + v, 0); return [r.name, ...r.arr.map(Math.round), Math.round(t), +(t/totSum*100).toFixed(1)]; }), name:`${dim}-${mk}`};
    const table = `<div class="tr-table-tools"><span class="tr-sub">سطح: <span class="tr-lvl">${esc(lvlText)}</span> · ردیف‌ها: ${esc(rowKind)} · ستون‌ها: همهٔ ${fa(allMonths.length)} ماه داده (مستقل از بازهٔ نمایش) · واحد: ${esc(un.t)}</span>
      ${pill("revMeasure", mm, mk, "شاخص جدول")}<button type="button" class="tr-set" data-tr-csv><i data-lucide="download"></i><span>خروجی CSV</span></button></div>
      <div class="tr-table-wrap"><table class="tr-table tr-rev"><thead><tr><th>${esc(rowKind)}</th>${allMonths.map(c => `<th>${esc(mName(c, true))}</th>`).join("")}<th>جمع</th><th>سهم</th></tr></thead><tbody>
      ${rows.map(r => trow(r.name, r.arr)).join("")}${trow("جمع " + lvlText, totArr, true)}</tbody></table></div>
      ${mk === "income" && Math.abs(gapTot) > 1 ? `<p class="tr-hint">یادداشت: مجموع اجزای رکوردهای فاقد ردیف «جمع کل درآمد» (${fa(scale("income", gapTot), 1)} ${esc(un.t)}) در درآمد خالص نیامده است؛ تخفیفات دوباره کسر نشده است.</p>` : ""}`;
    revBody = `<div class="tr-subh"><h4>سطح انتخابی: <span class="tr-lvl">${esc(lvlText)}</span></h4>${scen ? `<span class="tr-sub">${scenChip}</span>` : ""}</div>
      <section class="tr-sec"><div class="tr-sec-h"><h3>روند اجزای درآمد <small>${esc(un.t)} · نمودار جدا برای هر جزء${scen ? " · پیش‌بینی با سناریوی تعرفه/مالیات" : ""}</small></h3></div><div class="tr-sm">${partCards}</div></section>
      <section class="tr-sec"><div class="tr-card"><div class="tr-subh"><h4>ترکیب ماهانهٔ درآمد</h4>${seg("revMode", [["num", "عددی"], ["pct", "درصدی"]], ui.revMode, "حالت نمایش")}</div>${compChart}</div></section>
      <section class="tr-sec"><div class="tr-card"><div class="tr-subh"><h4>سهم اجزا در درآمد — سال ${fa(ui.revDonutYear)}</h4>${pill("revDonutYear", donutYears.map(y => [y, fa(y)]), ui.revDonutYear, "سال نمودار دونات")}</div><div class="tr-donut-box">${donutChart}${dLeg}</div></div></section>
      <section class="tr-sec"><div class="tr-card">${table}</div></section>`;
  }
  const revSec = `<details class="tr-revd" data-pk="rev" ${ui.pickOpen.rev ? "open" : ""}><summary>جزئیات درآمد <small>روند اجزا · ستونی عددی/درصدی · دونات · جدول بر اساس سطح (استان/امور/شهر)</small></summary>${revBody}</details>`;

  /* ── مقایسه سال‌ها روی هم (فقط یک شاخص؛ محور ماه ۱–۱۲) ── */
  ui.yMetrics = [DISPLAY_METRICS.includes(ui.yMetrics?.[0]) ? ui.yMetrics[0] : (mets[0] || "consumption")];
  const yMets = ui.yMetrics;
  const moLabels = Array.from({length:12}, (_, i) => fa(i + 1));
  const yCmpSeries = [];
  yMets.forEach((m, mi) => {
    activeYears.forEach(y => {
      const act = Array.from({length:12}, () => null), src = m === "price" ? priceFull : it[m];
      for(let i = 0; i < M; i++){
        const code = String(model.months[i]), yy = code.slice(0, 4), mm = +code.slice(4);
        if(yy === y && mm >= 1 && mm <= 12) act[mm - 1] = src[i] == null ? null : scale(m, src[i]);
      }
      yCmpSeries.push({
        id: `yc-${m}-${y}`, name: `${metricMeta(m).t} ${fa(y).replace(/٬/g, "")}`,
        color: yearColor(y), axis: m === "price" ? "Q" : AXIS[kd(m)], act, fc: null, lo: null, hi: null,
        out: [], raw: act, ent: act, rraw: null, m, width: mi === 0 ? 2.8 : 2.2
      });
    });
  });
  const yCmpChart = slot("ycmp", {
    type: "ts", labels: moLabels, short: moLabels, years: moLabels.map(() => ""), nAct: 12, off: 0,
    series: yCmpSeries, axes, rtl, height: 320, anim, zoom: false, band: false, hk: "ycmp",
    aria: "مقایسه شاخص‌ها در سال‌های مختلف (روی هم)",
    tip: i => tipHtml(`ماه ${moLabels[i]}`, yCmpSeries.map(s => {
      const v = s.act[i];
      return [s.name, v == null || !isFinite(v) ? "—" : `${fa(v, Math.abs(v) >= 100 ? 0 : 1)} ${unit(s.m)}`, s.color];
    }))
  });
  const yChips = `<div class="tr-mchips" role="group" aria-label="انتخاب شاخص مقایسه سال‌ها">${DISPLAY_METRICS.map(m => `<button type="button" class="tr-mchip ${yMets[0] === m ? "on" : ""}" style="--c:${metricMeta(m).c}" data-tr-ym="${m}" aria-pressed="${yMets[0] === m}"><i></i>${esc(metricMeta(m).t)}</button>`).join("")}</div>`;
  const yearCmpSec = `<section class="tr-sec" id="tr-ycmp-sec"><div class="tr-sec-h"><h3>مقایسه شاخص‌ها در سال‌های مختلف <small>یک شاخص در هر بار · ماه ۱ تا ۱۲</small></h3>
    <p class="tr-sub">هر سال یک خط جدا با رنگ خودش؛ محور افقی ماه‌های سال است. سال‌های خاموش‌شده در دکمه‌های زیر نمودار اصلی اینجا هم اعمال می‌شوند.</p></div>
    <div class="tr-card">${yChips}${yCmpChart}${yrLeg}</div></section>`;

  /* ── مقایسه کاربری‌ها (پیش‌فرض جمع‌شده) ── */
  const btGroups = [...groupBy(recs, "bt", M).values()].sort((x, y) => sum1(y.it.income, a, b) - sum1(x.it.income, a, b));
  /* جزئیات کاربری پیش‌فرض بسته است؛ تا زمان بازشدن، نه کارتی ساخته می‌شود و نه پیش‌بینی‌ای اجرا. */
  const btCards = ui.pickOpen.bt ? btGroups.map(g => smCard("sm-bt-" + g.id, g.name, subOf(g), () => entSeries(g, `B|${scopeKey}|${g.id}`), {h: 200})).join("") : "";
  const btSec = `<details class="tr-revd" data-pk="bt" ${ui.pickOpen.bt ? "open" : ""}><summary>مقایسه کاربری‌ها <small>${fa(btGroups.length)} کاربری · پیش‌فرض جمع‌شده · با فیلتر سال/امور/شهر هماهنگ</small></summary>
    <div class="tr-sec"><p class="tr-sub">هر کارت روند شاخص‌های انتخابی را برای یک کاربری نشان می‌دهد. با تغییر فیلتر امور، شهر یا سال، این بخش هم به‌روز می‌شود.</p>
    ${!ui.pickOpen.bt ? "" : btCards ? `<div class="tr-sm">${btCards}</div>` : `<div class="tr-card"><p class="tr-hint">کاربری‌ای در این محدوده نیست.</p></div>`}</div></details>`;

  /* ── برداشت‌های توصیفی (فقط از خروجی مدل) ── */
  /* برداشت‌های تفصیلی امور فقط وقتی پنل آن باز است به پیش‌بینی تک‌تک امور نیاز دارد. */
  const ents = ui.pickOpen.ins ? parGroups.map(g => { const r = forecastMetric(g.it, forecastMets[0] || "consumption", model, H, fo(`P|${scopeKey}|${g.id}`)); return {name:g.name, ref:r.ref, fc1:r.fc[0], fcH:r.fc[r.fc.length - 1], uncert:r.uncert, uncertHigh:r.uncertHigh, level:r.rel.level}; }) : [];
  const ye = {income:yearEnd(it, "income", model, fo(ckTop)), collection:yearEnd(it, "collection", model, fo(ckTop))};
  const ins = forecastInsights({model, res, H, fmt, unit, ents, entMetric:forecastMets[0] || "consumption", ye, a, b});
  const insHtml = `<ul class="tr-ins">${ins.map(x => `<li class="tr-t-${x.tone}"><i>${SEV[x.tone] || "ℹ"}</i><span>${x.html}</span></li>`).join("")}</ul>`;
  const dq = dataQuality(model), dqHtml = dq.length ? `<ul class="tr-dq">${dq.map(x => `<li class="tr-dq-${x.sev}"><i>${SEV[x.sev] || "ℹ"}</i>${esc(x.t)}</li>`).join("")}</ul>` : `<p class="tr-hint">✔ مورد مشکوکی یافت نشد.</p>`;
  const mDoc = forecastMets[0] || "consumption", rM = res[mDoc];
  /* مستندات فقط هنگام بازشدن ساخته می‌شود و درجا اضافه می‌شود (بدون رندر دوبارهٔ کل تب و تکرار انیمیشن نمودارها). */
  const docsBody = () => `
      <h4>ارزیابی مدل‌ها روی داده فعلی (${esc(METRICS[mDoc].t)})</h4>${evalTableHtml(rM.eval, rM.method, METRICS[mDoc].t, {div:kd(mDoc) === "money" ? un.d : kd(mDoc) === "vol" ? vu.d : 1, unit:unit(mDoc)})}
      ${docsHtml()}
      <h4>کیفیت داده</h4>${dqHtml}`;
  docsLazy = docsBody;
  const insSec = `<details class="tr-revd" data-pk="ins" ${ui.pickOpen.ins ? "open" : ""}><summary>برداشت‌های پیش‌بینی <small>فقط بر اساس خروجی مدل</small></summary>
    <div class="tr-card">${ins.length ? insHtml : `<p class="tr-hint">پیش‌بینی‌ای برای برداشت وجود ندارد.</p>`}</div></details>`;

  container.innerHTML = `<div class="${rootCls}">${head}${partialBanner}${controls}
    <section class="tr-sec"><div class="tr-sec-h"><h3>روند و پیش‌بینی شاخص‌های انتخابی <small>انتخاب ترکیبی؛ ${esc(lvlText)}</small></h3></div>
      <div class="tr-kpis">${kpi}</div>${relBanner}
      <div class="tr-card">${chips}${combChart}${yrLeg}${combHelp}${mlines}${trainLine}</div></section>
    ${yearCmpSec}
    ${parSec}${citySec}
    ${btSec}
    ${revSec}
    ${insSec}
    <details class="tr-help tr-docs" data-pk="docs" ${ui.pickOpen.docs ? "open" : ""}><summary>روش‌های پیش‌بینی، مبانی علمی و نحوه محاسبه</summary>${ui.pickOpen.docs ? docsBody() : ""}</details>
  </div>`;
  bind(container); finish(container);
}

function finish(container){
  paintAll(container);
  if(window.lucide) lucide.createIcons();
  /* تغییر اندازه فقط نمودارهایی را دوباره رسم می‌کند که عرض واقعی‌شان عوض شده است. */
  if(!resizeObs && "ResizeObserver" in window){ let t = 0; resizeObs = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { const r = document.querySelector(".tr-root"); if(r) paintAll(r, true); }, 120); }); }
  resizeObs?.disconnect(); const r = container.querySelector(".tr-root"); if(r) resizeObs?.observe(r);
}

/* ───── تعامل ───── */
/* رندر یک فریم بعد انجام می‌شود تا نشانگر «در حال به‌روزرسانی» اول دیده شود؛ رندرهای پشت‌سرهم یکی می‌شوند و کارهای پس از رندر (after) بعد از آخرین رندر اجرا می‌شوند. */
let rrToken = 0, pickTimer = 0; const rrAfter = [];
const rerender = after => {
  if(!ctxNow) return; if(after) rrAfter.push(after);
  const y = window.scrollY, tok = ++rrToken; document.querySelector(".tr-root")?.classList.add("tr-busy");
  requestAnimationFrame(() => setTimeout(() => {
    if(tok !== rrToken || !ctxNow) return;
    const todo = rrAfter.splice(0); renderTrend(ctxNow); window.scrollTo(0, y); todo.forEach(fn => { try{ fn(); }catch(e){ console.error(e); } });
  }, 0));
};
function setDrop(root, kind){
  const wasOpen = ui.openDrop === kind; ui.openDrop = wasOpen ? null : kind;
  document.querySelectorAll("body > [data-tr-panel]").forEach(el => el.classList.add("hidden"));
  root.querySelectorAll("[data-tr-toggle]").forEach(b => { const on = b.dataset.trToggle === ui.openDrop; b.classList.toggle("open", on); b.setAttribute("aria-expanded", on); });
  if(wasOpen) return;
  const panel = root.querySelector(`[data-tr-panel="${kind}"]`) || document.querySelector(`body > [data-tr-panel="${kind}"]`), btn = root.querySelector(`[data-tr-toggle="${kind}"]`); if(!panel || !btn) return;
  if(panel.parentElement !== document.body) document.body.appendChild(panel);
  panel.classList.remove("hidden");
  const r = btn.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, mg = 8, dw = Math.min(panel.scrollWidth || 320, vw - mg*2);
  panel.style.maxHeight = Math.min(360, vh - mg*2) + "px"; panel.style.width = dw + "px";
  let left = Math.max(mg, Math.min(r.right - dw, vw - dw - mg)), top = r.bottom + 6; const ph = panel.offsetHeight || 300; if(top + ph > vh - mg) top = Math.max(mg, r.top - ph - 6);
  panel.style.left = left + "px"; panel.style.top = top + "px";
}
function csv(){
  if(!lastTable) return; const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob(["﻿" + [lastTable.head, ...lastTable.rows].map(r => r.map(q).join(",")).join("\r\n")], {type:"text/csv;charset=utf-8"}), url = URL.createObjectURL(blob), el = document.createElement("a");
  el.href = url; el.download = `trend-income-${lastTable.name}.csv`; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function showTip(e){
  const t = e.target.closest?.("[data-tip]"); if(!tipEl){ tipEl = document.createElement("div"); tipEl.className = "tc-tip"; tipEl.hidden = true; document.body.appendChild(tipEl); }
  if(!t){ tipEl.hidden = true; return; }
  placeTip(t.getAttribute("data-tip"), e.touches ? e.touches[0] : e);
}
function placeTip(html, p){
  if(!tipEl){ tipEl = document.createElement("div"); tipEl.className = "tc-tip"; tipEl.hidden = true; document.body.appendChild(tipEl); }
  tipEl.innerHTML = html; tipEl.hidden = false;
  const w = tipEl.offsetWidth, hh = tipEl.offsetHeight; let x = p.clientX - w - 14, y = p.clientY - hh - 12;
  if(x < 6) x = Math.min(innerWidth - w - 6, p.clientX + 14); if(y < 6) y = p.clientY + 16;
  tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
}
const hideTip = () => { if(tipEl) tipEl.hidden = true; document.querySelectorAll(".tc-xh").forEach(l => { l.style.display = "none"; }); };
/* نمودار ts: tooltip هم‌زمان با خط راهنما */
function tsHover(e){
  const hit = e.target.closest?.(".tc-hit[data-hit]"); if(!hit) return false;
  const slotEl = hit.closest("[data-chart]"), sp = specs.get(slotEl.dataset.chart); if(!sp?.tip) return true;
  const i = indexAt(slotEl, sp, e.clientX); if(i == null) return true;
  const xh = slotEl.querySelector(".tc-xh"); if(xh){ const x = xOf(sp, i); xh.setAttribute("x1", x); xh.setAttribute("x2", x); xh.style.display = ""; }
  placeTip(sp.tip(i), e); return true;
}
/* Brush روی نمودار: انتخاب بازه برای بزرگ‌نمایی */
function brushStart(e){
  const hit = e.target.closest?.(".tc-hit[data-hit]"); if(!hit || e.button > 0) return;
  const slotEl = hit.closest("[data-chart]"), sp = specs.get(slotEl.dataset.chart); if(!sp?.zoom) return;
  const i0 = indexAt(slotEl, sp, e.clientX); if(i0 == null || i0 >= sp.nAct) return;
  drag = {type:"brush", slotEl, sp, i0, i1:i0, x0:e.clientX, moved:false};
}
function brushMove(e){
  const d = drag; if(!d || d.type !== "brush") return false;
  const i1 = Math.min(d.sp.nAct - 1, indexAt(d.slotEl, d.sp, e.clientX) ?? d.i0); d.i1 = i1; if(Math.abs(e.clientX - d.x0) > 6) d.moved = true;
  const g = d.sp.geo, br = d.slotEl.querySelector(".tc-brush"); if(br && d.moved){ const xa = xOf(d.sp, d.i0), xb = xOf(d.sp, i1), x = Math.min(xa, xb) - g.bw/2, w = Math.abs(xb - xa) + g.bw; br.setAttribute("x", x); br.setAttribute("width", w); br.style.display = ""; }
  return true;
}
function brushEnd(){
  const d = drag; drag = null; if(!d || d.type !== "brush") return;
  d.slotEl.querySelector(".tc-brush")?.style && (d.slotEl.querySelector(".tc-brush").style.display = "none");
  if(!d.moved || d.i0 === d.i1) return;
  const lo = Math.min(d.i0, d.i1), hi = Math.max(d.i0, d.i1); ui.a = d.sp.off + lo; ui.b = d.sp.off + hi; hideTip(); rerender();
}
/* اسلایدر دودستگیرهٔ بازه */
function rangeIdx(box, clientX, M, rtl){ const r = box.querySelector(".tr-rtrack").getBoundingClientRect(); let f = (clientX - r.left)/Math.max(1, r.width); f = Math.max(0, Math.min(1, f)); if(rtl) f = 1 - f; return Math.round(f*(M - 1)); }
function rangeSet(box, a, b, M, rtl){
  const pos = i => (M > 1 ? (rtl ? 1 - i/(M - 1) : i/(M - 1)) : 0)*100;
  box.dataset.a = a; box.dataset.b = b; box.querySelector(".tr-rfill").style.cssText = `left:${Math.min(pos(a), pos(b))}%;width:${Math.abs(pos(a) - pos(b))}%`;
  [["a", a], ["b", b]].forEach(([k, v]) => { const h = box.querySelector(`.tr-rh[data-h="${k}"]`); h.style.left = pos(v) + "%"; h.setAttribute("aria-valuenow", v); });
}
function rangeDown(e){
  const box = e.target.closest?.("[data-tr-range]"); if(!box) return;
  const M = +box.dataset.m, rtl = S("trend.rtl"), idx = rangeIdx(box, e.clientX, M, rtl), a = +box.dataset.a, b = +box.dataset.b;
  const which = e.target.closest(".tr-rh")?.dataset.h || (Math.abs(idx - a) <= Math.abs(idx - b) ? "a" : "b");
  drag = {type:"range", box, M, rtl, which, a, b}; e.preventDefault(); rangeMove(e);
}
function rangeMove(e){
  const d = drag; if(!d || d.type !== "range") return false;
  let i = rangeIdx(d.box, e.clientX, d.M, d.rtl); if(d.which === "a") d.a = Math.min(i, d.b); else d.b = Math.max(i, d.a);
  rangeSet(d.box, d.a, d.b, d.M, d.rtl); return true;
}
function rangeEnd(){ const d = drag; drag = null; if(!d || d.type !== "range") return; if(d.a !== ui.a || d.b !== ui.b){ ui.a = d.a; ui.b = d.b; rerender(); } }
function selectCard(spec){
  const [kind, id] = spec.split(":");
  if(kind === "par"){ const was = ui.pars.length === 1 && ui.pars[0] === id; ui.pars = was ? [] : [id]; ui.cities = []; rerender(was ? null : () => document.getElementById("tr-city-sec")?.scrollIntoView({behavior:"smooth", block:"start"})); }
  else { ui.cities = ui.cities.length === 1 && ui.cities[0] === id ? [] : [id]; rerender(); }
}
function bind(container){
  const root = container.querySelector(".tr-root"); if(!root) return;
  root.addEventListener("change", e => {
    const tg = e.target.closest("[data-tr-tog]"); if(tg){ const k = tg.dataset.trTog; if(k === "fc") ui.fcOn = tg.checked; else if(k === "band") ui.bandOn = tg.checked; return rerender(); }
    const el = e.target.closest("[data-tr]"); if(!el) return; const k = el.dataset.tr, v = el.value;
    if(k === "a" || k === "b"){ ui[k] = +v; if(ui.a > ui.b){ if(k === "a") ui.b = ui.a; else ui.a = ui.b; } }
    else ui[k] = v;
    rerender();
  });
  root.addEventListener("click", e => {
    const t = e.target;
    const yr = t.closest("[data-tr-year]"); if(yr && !yr.disabled){ const y = yr.dataset.trYear; if(ui.yearsOff.includes(y)) ui.yearsOff = ui.yearsOff.filter(x => x !== y); else ui.yearsOff = [...ui.yearsOff, y]; return rerender(); }
    const ym = t.closest("[data-tr-ym]"); if(ym){ const m = ym.dataset.trYm; if(DISPLAY_METRICS.includes(m) && ui.yMetrics[0] !== m){ ui.yMetrics = [m]; return rerender(); } }
    const mc = t.closest("[data-tr-m]"); if(mc){ const m = mc.dataset.trM; if(ui.metrics.includes(m)){ if(ui.metrics.length > 1) ui.metrics = ui.metrics.filter(x => x !== m); } else ui.metrics = [...ui.metrics, m]; return rerender(); }
    const sg = t.closest("[data-tr-seg]"); if(sg){ const k = sg.dataset.trSeg, v = sg.dataset.v; if(k === "h") ui.h = +v; else if(k === "revMode") ui.revMode = v; return rerender(); }
    const sc = t.closest("[data-tr-scope]"); if(sc){ const k = sc.dataset.trScope; if(k === "armed") ui.armed = nextOf(ARMED_ORDER, ui.armed); else ui.settlement = nextOf(SETTLEMENT_ORDER, ui.settlement); ui.openDrop = null; return rerender(); }
    const tgl = t.closest("[data-tr-toggle]"); if(tgl){ e.stopPropagation(); return setDrop(root, tgl.dataset.trToggle); }
    const cl = t.closest("[data-tr-clear]"); if(cl && !cl.disabled){ const k = cl.dataset.trClear; if(k === "par"){ ui.pars = []; ui.cities = []; } else if(k === "bt") ui.bts = []; else ui.cities = []; ui.openDrop = null; return rerender(); }
    const cb = t.closest("[data-tr-city]"); if(cb){ toggleIn(ui.cities, cb.dataset.trCity); return rerender(); }
    const cr = t.closest("[data-tr-crumb]"); if(cr){ const k = cr.dataset.trCrumb; if(k === "all"){ ui.pars = []; ui.cities = []; ui.bts = []; } else if(k === "par"){ ui.cities = []; ui.bts = []; } else if(k === "city") ui.bts = []; return rerender(); }
    const cd = t.closest("[data-tr-card]"); if(cd) return selectCard(cd.dataset.trCard);
    if(t.closest("[data-tr-zoomreset]") && !t.closest("[data-tr-zoomreset]").disabled){ ui.a = 0; ui.b = null; return rerender(); }
    if(t.closest("[data-tr-csv]")) return csv();
    if(t.closest("[data-tr-settings]")) return ctxNow?.onSettings?.();
  });
  root.addEventListener("keydown", e => { const cd = e.target.closest?.("[data-tr-card]"); if(cd && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); selectCard(cd.dataset.trCard); } });
  root.addEventListener("toggle", e => { const d = e.target; const k = d?.dataset?.pk; if(!k || ui.pickOpen[k] === d.open) return; ui.pickOpen[k] = d.open; if(k === "docs"){ if(d.open && docsLazy && !d.querySelector("h4")) d.insertAdjacentHTML("beforeend", docsLazy()); return; } if(k === "rev" || k === "bt" || k === "ins") rerender(); }, true);
  root.addEventListener("dblclick", e => { if(e.target.closest(".tc-hit[data-hit]")){ const sp = specs.get(e.target.closest("[data-chart]")?.dataset.chart); if(sp?.zoom){ ui.a = 0; ui.b = null; hideTip(); rerender(); } } });
  root.addEventListener("pointerdown", e => { rangeDown(e); brushStart(e); });
  root.addEventListener("pointermove", e => { if(drag){ return; } if(!tsHover(e)) showTip(e); });
  root.addEventListener("pointerleave", hideTip);
  root.addEventListener("touchstart", e => { if(!e.target.closest(".tc-hit[data-hit]")) showTip(e); }, {passive:true});
  root.addEventListener("mouseover", e => { const lg = e.target.closest?.("[data-tr-hl]"); if(!lg) return; document.querySelectorAll("[data-chart]").forEach(s => { const sp = specs.get(s.dataset.chart); if(sp?.hk !== lg.dataset.trHl) return; s.classList.add("tc-dim"); s.querySelectorAll(".tc-s").forEach(g => g.classList.toggle("tc-hl", g.dataset.sid === lg.dataset.sid)); }); });
  root.addEventListener("mouseout", e => { if(!e.target.closest?.("[data-tr-hl]")) return; root.querySelectorAll(".tc-dim").forEach(s => s.classList.remove("tc-dim")); });
  root.addEventListener("keydown", e => {
    const h = e.target.closest?.(".tr-rh"); if(!h) return; const box = h.closest("[data-tr-range]"), M = +box.dataset.m, rtl = S("trend.rtl"); let a = +box.dataset.a, b = +box.dataset.b;
    const dir = ({ArrowLeft:rtl ? 1 : -1, ArrowRight:rtl ? -1 : 1, ArrowUp:1, ArrowDown:-1})[e.key], k = h.dataset.h; if(!dir && e.key !== "Home" && e.key !== "End") return; e.preventDefault();
    let v = k === "a" ? a : b; v = e.key === "Home" ? 0 : e.key === "End" ? M - 1 : v + dir; v = Math.max(0, Math.min(M - 1, v));
    if(k === "a") a = Math.min(v, b); else b = Math.max(v, a); ui.a = a; ui.b = b; rerender(() => document.querySelector(`.tr-rh[data-h="${k}"]`)?.focus());
  });
  if(bound) return; bound = true;
  document.addEventListener("pointermove", e => { if(!drag || !document.body.classList.contains("trend-view")) return; rangeMove(e) || brushMove(e); });
  document.addEventListener("pointerup", () => { if(!drag) return; drag.type === "range" ? rangeEnd() : brushEnd(); });
  document.addEventListener("pointercancel", () => { if(drag){ document.querySelectorAll(".tc-brush").forEach(b => { b.style.display = "none"; }); drag = null; } });
  document.addEventListener("click", e => {
    if(!document.body.classList.contains("trend-view") || !ctxNow) return;
    const pk = e.target.closest("[data-tr-pick]");
    if(pk){ e.stopPropagation(); const k = pk.dataset.trPick, v = pk.dataset.v; if(k === "par"){ toggleIn(ui.pars, v); ui.cities = []; } else toggleIn(ui.bts, v);
      /* انتخاب چندتایی: ظاهر دکمه فوراً عوض می‌شود و رندر سنگین بعد از ۲۵۰ms سکون یک‌بار انجام می‌شود */
      pk.classList.toggle("selected", (k === "par" ? ui.pars : ui.bts).includes(v));
      document.querySelector(".tr-root")?.classList.add("tr-busy"); clearTimeout(pickTimer);
      pickTimer = setTimeout(() => { const keep = ui.openDrop; rerender(() => { if(keep){ const r = document.querySelector(".tr-root"); if(r){ ui.openDrop = null; setDrop(r, keep); } } }); }, 250); return; }
    if(!e.target.closest("[data-tr-panel],[data-tr-toggle]") && ui.openDrop){ ui.openDrop = null; document.querySelectorAll("[data-tr-panel]").forEach(p => p.classList.add("hidden")); document.querySelectorAll("[data-tr-toggle]").forEach(b => { b.classList.remove("open"); b.setAttribute("aria-expanded", "false"); }); }
    if(!e.target.closest("[data-tip],.tc-hit") && tipEl) tipEl.hidden = true;
  });
}
export function leaveTrend(){ rrToken++; clearTimeout(pickTimer); rrAfter.length = 0; document.querySelectorAll("body > [data-tr-panel]").forEach(el => el.remove()); ui.openDrop = null; drag = null; if(tipEl) tipEl.hidden = true; resizeObs?.disconnect(); }
