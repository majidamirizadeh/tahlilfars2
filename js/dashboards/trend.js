/* نمودارهای SVG بدون وابستگی برای تب «روند» (کار آفلاین، چاپ‌پذیر، تست‌پذیر).
   هر نمودار یک «spec» ساده است؛ paint(slot) آن را با عرض واقعی کادر می‌کشد (بدون کوچک‌شدن فونت در موبایل).
   • ts: سری زمانی چندمحوره — داده واقعی (خط پر) / پیش‌بینی (خط‌چین + مارکر توخالی) / بازهٔ عدم‌قطعیت (باند)، نشانگر پایان داده واقعی،
     مخفی/نمایش سری (spec.hidden)، حلقهٔ داده پرت، انیمیشن رسم (SMIL؛ با prefers-reduced-motion و تنظیم «انیمیشن» خاموش می‌شود).
   • bars: میلهٔ انباشته/گروهی با انیمیشن رشد.
   جهت زمان: rtl=true ← قدیمی‌ترین ماه سمت راست. Tooltip/زوم/Brush در trend.js با spec.geo پیاده‌سازی شده است. */
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const fa = (v, d = 0) => (v == null || !isFinite(v)) ? "—" : Number(v).toLocaleString("fa-IR", {maximumFractionDigits:d, minimumFractionDigits:0});
/* پالت پررنگ و کاملاً متمایز (نئونی/اشباع) برای سری‌ها */
export const PALETTE = ["#0A6CFF", "#FF2D55", "#00C853", "#FF9100", "#AA00FF", "#00B8D4", "#FFD600", "#F50057", "#64DD17", "#2962FF", "#FF6D00", "#00BFA5"];
/* رنگ هر سال شمسی (ثابت برای همان سال؛ سال‌های بعدی خودکار رنگ بعدی را می‌گیرند) */
const YEAR_COL = ["#0A6CFF", "#FF6A00", "#00B85C", "#9B30FF", "#E6007E", "#00B8D4"];
export const yearColor = y => YEAR_COL[(((+y - 1405) % YEAR_COL.length) + YEAR_COL.length) % YEAR_COL.length];
const faYear = y => String(y).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
/** لایهٔ تمایز سال‌ها: زمینهٔ رنگی هر سال + خط جداکنندهٔ سال + برچسب سال (زیر محور) */
function yearLayer(years, ctr, bw, rtl, top, ih, H){
  if(!years || !years.length) return {under:"", over:""};
  const gs = []; years.forEach((y, i) => { const l = gs[gs.length - 1]; if(l && l.y === y) l.i1 = i; else gs.push({y, i0:i, i1:i}); });
  let under = "", over = "";
  gs.forEach((g, k) => {
    const xa = ctr(g.i0), xb = ctr(g.i1), l = Math.min(xa, xb) - bw/2, r = Math.max(xa, xb) + bw/2, col = yearColor(g.y);
    under += `<rect x="${l.toFixed(1)}" y="${top}" width="${(r - l).toFixed(1)}" height="${ih}" class="tc-yb" style="fill:${col}"/>`;
    if(k > 0){ const e = (rtl ? r : l).toFixed(1); over += `<line x1="${e}" x2="${e}" y1="${top}" y2="${H - 2}" class="tc-ys" style="stroke:${col}"/>`; }
    over += `<rect x="${(l + 2).toFixed(1)}" y="${H - 19}" width="${Math.max(2, r - l - 4).toFixed(1)}" height="3" rx="1.5" style="fill:${col}"/>` + T((l + r)/2, H - 4, faYear(g.y), "tc-yr", `text-anchor="middle" style="fill:${col}"`);
  });
  return {under, over};
}
const motionOK = () => { try{ return !matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){ return true; } };

function niceScale(min, max, n = 4){
  if(!isFinite(min) || !isFinite(max)) return {min:0, max:1, step:.25, ticks:[0, .25, .5, .75, 1]};
  if(min === max){ max = min + (Math.abs(min) || 1); }
  const span = max - min, raw = span/n, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw/mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10)*mag;
  const lo = Math.floor(min/step)*step, hi = Math.ceil(max/step)*step, ticks = [];
  for(let v = lo; v <= hi + step/2; v += step) ticks.push(+v.toFixed(10));
  return {min:lo, max:hi, step, ticks};
}
const step2d = s => s >= 1 ? 0 : s >= .1 ? 1 : 2;
const T = (x, y, txt, cls = "", extra = "") => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="tc-t ${cls}" ${extra}>${esc(txt)}</text>`;
const pathOf = pts => "M" + pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");

/** کلیپ انیمیشنی (آشکارسازی تدریجی) — dir: "x" (از ابتدای محور زمان) یا "up" (رشد از خط پایه) */
function revealClip(id, dir, box, rtl){
  const {x, y, w, h} = box, dur = ".95s", sp = 'calcMode="spline" keyTimes="0;1" keySplines=".25 .1 .25 1" fill="freeze"';
  if(dir === "up") return `<clipPath id="${id}"><rect x="${x}" y="${y + h}" width="${w}" height="0"><animate attributeName="y" from="${y + h}" to="${y}" dur="${dur}" ${sp}/><animate attributeName="height" from="0" to="${h}" dur="${dur}" ${sp}/></rect></clipPath>`;
  return `<clipPath id="${id}"><rect x="${rtl ? x + w : x}" y="${y}" width="0" height="${h}">${rtl ? `<animate attributeName="x" from="${x + w}" to="${x}" dur="${dur}" ${sp}/>` : ""}<animate attributeName="width" from="0" to="${w}" dur="${dur}" ${sp}/></rect></clipPath>`;
}

/* ───── سری زمانی چندمحوره (حداکثر سه محور: L مبلغ، R حجم، P درصد) ───── */
function ts(sp, W, animate){
  const compact = !!sp.compact, H = sp.height || (compact ? 210 : 320), rtl = sp.rtl !== false, n = sp.labels.length, nAct = sp.nAct ?? n, hid = sp.hidden || new Set();
  const labs = compact && sp.short ? sp.short : sp.labels, rotate = !compact && n > 9, hasYears = !!(sp.years && sp.years.length);
  const bandOn = sp.band === "single" ? sp.series.filter(s => !hid.has(s.id)).length === 1 : !!sp.band;
  const vis = sp.series.filter(s => !hid.has(s.id)), used = ["L", "R", "P"].filter(ax => vis.some(s => (s.axis || "L") === ax)), prim = used[0] || "L";
  const AX = compact ? 42 : W < 520 ? 58 : 74, rightAx = used.filter(ax => (ax === prim) === rtl), leftAx = used.filter(ax => !rightAx.includes(ax));
  const m = {t:compact ? 12 : 30, b:(rotate ? 58 : compact ? 22 : 36) + (hasYears ? 20 : 0), l:leftAx.length ? leftAx.length*AX : 12, r:rightAx.length ? rightAx.length*AX : 12};
  const iw = W - m.l - m.r, ih = H - m.t - m.b, bw = iw/Math.max(1, n), X = i => rtl ? W - m.r - (i + .5)*bw : m.l + (i + .5)*bw;
  const sc = {}, Y = {};
  for(const ax of used){
    const vals = [];
    vis.filter(s => (s.axis || "L") === ax).forEach(s => { [s.act, s.fc].forEach(a => (a || []).forEach(v => { if(v != null && isFinite(v)) vals.push(v); })); if(bandOn && s.fc) [s.lo, s.hi].forEach(a => (a || []).forEach(v => { if(v != null && isFinite(v)) vals.push(v); })); });
    if(!vals.length) vals.push(0, 1);
    let lo = Math.min(...vals), hi = Math.max(...vals); if(sp.zero !== false) lo = Math.min(0, lo);
    if(lo < 0 && -lo < (hi - lo)*.03) lo = 0;   /* مقدار منفی ناچیز (نویز/تعدیل) محور را به زیر صفر نبرد */
    sc[ax] = niceScale(lo, hi, compact ? 3 : 4); Y[ax] = v => m.t + ih - (v - sc[ax].min)/(sc[ax].max - sc[ax].min)*ih;
  }
  let g = "";
  const yl = hasYears ? yearLayer(sp.years, X, bw, rtl, m.t, ih, H) : {under:"", over:""};
  g += yl.under;
  sc[prim]?.ticks.forEach(t => { const y = Y[prim](t); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="tc-grid"/>`; });
  const colOf = ax => { const vs = vis.filter(s => (s.axis || "L") === ax); return vs.length === 1 ? vs[0].color : "var(--ink-3)"; };
  const drawAx = (ax, side, k) => {
    const f = sp.axes?.[ax]?.fmt || (v => fa(v, step2d(sc[ax].step))), col = colOf(ax), x = side === "r" ? W - m.r + 6 + k*AX : m.l - 6 - k*AX, anc = side === "r" ? "start" : "end";
    let o = sc[ax].ticks.map(t => T(x, Y[ax](t) + 4, f(t), "tc-ax", `text-anchor="${anc}" style="fill:${col}"`)).join("");
    if(used.length > 1){ const lx = side === "r" ? W - m.r + k*AX + 1 : m.l - k*AX - 1; o += `<line x1="${lx}" x2="${lx}" y1="${m.t}" y2="${m.t + ih}" style="stroke:${col}" stroke-width="2" opacity=".55"/>`; }
    const un = sp.axes?.[ax]?.unit; if(un && !compact){ const cx = side === "r" ? W - m.r + k*AX + AX - 9 : m.l - k*AX - AX + 11, cy = m.t + ih/2; o += `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" transform="rotate(${side === "r" ? 90 : -90} ${cx.toFixed(1)} ${cy.toFixed(1)})" text-anchor="middle" class="tc-t tc-axt" style="fill:${col}">${esc(un)}</text>`; }
    return o; };
  rightAx.forEach((ax, k) => { g += drawAx(ax, "r", k); }); leftAx.forEach((ax, k) => { g += drawAx(ax, "l", k); });
  /* ناحیهٔ پیش‌بینی + نشانگر پایان داده واقعی */
  const hasFc = nAct < n && vis.some(s => (s.fc || []).some(v => v != null));
  if(nAct < n){
    const xm = X(nAct - 1), x1 = rtl ? m.l : W - m.r, rx = Math.min(xm, x1), rw = Math.abs(x1 - xm);
    g += `<rect x="${rx.toFixed(1)}" y="${m.t}" width="${rw.toFixed(1)}" height="${ih}" class="tc-fcbg"/>`
      + `<line x1="${xm.toFixed(1)}" x2="${xm.toFixed(1)}" y1="${m.t}" y2="${m.t + ih}" class="tc-mark"/>`
      + (compact ? "" : T(xm + (rtl ? -6 : 6), m.t + 12, "آخرین داده واقعی", "tc-marklbl", `text-anchor="${rtl ? "end" : "start"}"`)
      + (hasFc ? T(xm + (rtl ? 6 : -6), m.t + 12, "شروع پیش‌بینی", "tc-fclbl", `text-anchor="${rtl ? "start" : "end"}"`) : ""));
  }
  (sp.refLines || []).forEach(r => { const ax = r.axis || prim; if(!Y[ax]) return; const y = Y[ax](r.y); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" class="tc-ref" stroke="${r.color || "#A8322C"}"/>` + T(rtl ? m.l + 4 : W - m.r - 4, y - 4, r.label, "tc-reflbl", `text-anchor="${rtl ? "start" : "end"}" style="fill:${r.color || "#A8322C"}"`); });
  const stepL = Math.max(1, Math.ceil(n/Math.max(1, iw/(rotate ? 30 : compact ? 24 : 62))));
  labs.forEach((lb, i) => { if(i % stepL) return; const x = X(i), y = H - m.b + 16; g += rotate ? T(x, y, lb, "tc-ax", `text-anchor="end" transform="rotate(-35 ${x.toFixed(1)} ${y})"`) : T(x, y, lb, "tc-ax", 'text-anchor="middle"'); });
  g += yl.over;
  /* سری‌ها (داخل کلیپ انیمیشنی) */
  const single = vis.length === 1;
  let body = "";
  vis.forEach(s => {
    const ax = s.axis || "L", y = Y[ax], col = s.color, w = s.width || (sp.thin ? 1.8 : compact ? 2.4 : 3), dots = sp.dots ?? (!compact && nAct <= 18 && vis.length <= 4), glow = `style="filter:drop-shadow(0 0 ${compact ? 2 : 3.5}px ${col}b0)"`;
    const act = []; (s.act || []).forEach((v, i) => { if(v != null && isFinite(v)) act.push([X(i), y(v), i]); });
    let o = `<g class="tc-s" data-sid="${esc(s.id)}">`;
    if(bandOn && s.fc && s.lo && s.hi && act.length){ const base = act[act.length - 1], pts = [[base[0], base[1], base[1]]]; s.fc.forEach((v, i) => { if(v != null) pts.push([X(nAct + i), y(s.hi[i]), y(s.lo[i])]); });
      if(pts.length > 1) o += `<path class="tc-band" style="fill:${col}" d="M${pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L")}L${[...pts].reverse().map(p => p[0].toFixed(1) + "," + p[2].toFixed(1)).join("L")}Z"/>`; }
    if(single && sp.area !== false && act.length > 1){ const y0 = y(Math.max(0, sc[ax].min)); o += `<path d="${pathOf(act)}L${act[act.length - 1][0].toFixed(1)},${y0.toFixed(1)}L${act[0][0].toFixed(1)},${y0.toFixed(1)}Z" fill="${col}" opacity=".12"/>`; }
    if(act.length > 1) o += `<path d="${pathOf(act)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" class="tc-line" ${glow}/>`;
    if(dots) act.forEach(p => { o += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${col}" stroke="#fff" stroke-width="1.2"/>`; });
    else if(act.length) { const p = act[act.length - 1]; o += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${compact ? 3 : 3.8}" fill="${col}" stroke="#fff" stroke-width="1"/>`; }
    if(!compact && s.annotations?.length) s.annotations.forEach(a => { const v = (s.act || [])[a.i]; if(v == null || !isFinite(v)) return; const y0 = Math.max(m.t + 10, y(v) - 12); o += T(X(a.i), y0, a.text, "tc-growth", `text-anchor="middle" style="fill:${col}"`); });
    if(s.fc && act.length){ const base = act[act.length - 1], fp = [[base[0], base[1]]]; s.fc.forEach((v, i) => { if(v != null && isFinite(v)) fp.push([X(nAct + i), y(v)]); });
      if(fp.length > 1){ o += `<path d="${pathOf(fp)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="${compact ? "5 4" : "7 5"}" stroke-linecap="round" class="tc-fline" ${glow}/>`;
        if(!compact && sp.fcDots !== false && fp.length <= 16) fp.slice(1).forEach(p => { o += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.8" fill="var(--panel)" stroke="${col}" stroke-width="2"/>`; }); } }
    (s.out || []).forEach(i => { const v = (s.act || [])[i]; if(v != null) o += `<circle cx="${X(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="8.5" class="tc-out"><title>نقطهٔ پرت احتمالی</title></circle>`; });
    body += o + "</g>";
  });
  const cid = "cp-" + String(sp.id).replace(/[^\w-]/g, "");
  const defs = animate ? revealClip(cid, "x", {x:m.l - 10, y:0, w:iw + 20, h:H}, rtl) : "";
  g += animate ? `<g clip-path="url(#${cid})">${body}</g>` : body;
  g += `<line class="tc-xh" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" style="display:none"/>`
     + `<rect class="tc-brush" x="0" y="${m.t}" width="0" height="${ih}" style="display:none"/>`
     + `<rect class="tc-hit${sp.pick ? " tc-pick" : ""}" data-hit="${esc(sp.id)}" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/>`;
  sp.geo = {W, H, m, n, nAct, rtl, bw, iw, ih};
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(sp.aria || "نمودار روند")}"><defs>${defs}</defs>${g}</svg>`;
}

/* ───── دونات ───── */
function donut(sp, W, animate){
  const H = sp.height || 260, items = (sp.items || []).filter(i => i.value > 0), tot = items.reduce((s, i) => s + i.value, 0);
  if(!tot) return `<div class="tc-empty">داده‌ای برای نمایش نیست.</div>`;
  const cx = W/2, cy = H/2, R = Math.min(W, H)/2 - 10, th = R*.38, r = R - th/2, C = 2*Math.PI*r;
  let off = 0, g = "", lb = "";
  items.forEach(it => {
    const len = it.value/tot*C, gap = items.length > 1 ? Math.min(2.5, len*.25) : 0, dash = Math.max(.1, len - gap), da = `${dash.toFixed(2)} ${(C - dash).toFixed(2)}`;
    g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${it.color}" stroke-width="${th.toFixed(1)}" stroke-dasharray="${da}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})" class="tc-slice" data-tip="${esc(it.tip || "")}" style="filter:drop-shadow(0 0 3px ${it.color}90)">`
      + (animate ? `<animate attributeName="stroke-dasharray" from="0 ${C.toFixed(2)}" to="${da}" dur=".9s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".25 .1 .25 1"/>` : "") + `</circle>`;
    if(it.value/tot >= .06){ const ang = (off + len/2)/C*2*Math.PI - Math.PI/2; lb += T(cx + r*Math.cos(ang), cy + r*Math.sin(ang) + 4, fa(it.value/tot*100, 0) + "٪", "tc-dl", 'text-anchor="middle"'); }
    off += len;
  });
  const c = sp.center; if(c) lb += T(cx, cy - 2, c.t1 || "", "tc-donut-v", 'text-anchor="middle"') + T(cx, cy + 17, c.t2 || "", "tc-ax", 'text-anchor="middle"');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(sp.aria || "نمودار دونات")}">${g}${lb}</svg>`;
}

/* ───── میله‌ای گروهی/انباشته ───── */
function bars(sp, W, animate){
  const H = sp.height || 300, rtl = sp.rtl !== false, n = sp.labels.length, hid = sp.hidden || new Set(), rotate = n > 9, hasYears = !!(sp.years && sp.years.length), m = {t:22, b:(rotate ? 58 : 36) + (hasYears ? 20 : 0), l:rtl ? 12 : 64, r:rtl ? 64 : 12};
  const ser = sp.series.filter(s => !hid.has(s.id)), ns = Math.max(1, ser.length), iw = W - m.l - m.r, ih = H - m.t - m.b;
  let hi = 0, lo = 0;
  for(let i = 0; i < n; i++){ if(sp.stacked){ let p = 0, q = 0; ser.forEach(s => { const v = s.values[i] || 0; v >= 0 ? p += v : q += v; }); hi = Math.max(hi, p); lo = Math.min(lo, q); } else ser.forEach(s => { const v = s.values[i] || 0; hi = Math.max(hi, v); lo = Math.min(lo, v); }); }
  const sc = niceScale(lo, hi), Y = v => m.t + ih - (v - sc.min)/(sc.max - sc.min)*ih, bw = iw/Math.max(1, n), X0 = i => rtl ? W - m.r - (i + 1)*bw : m.l + i*bw;
  let g = "", body = "";
  const yl = hasYears ? yearLayer(sp.years, i => X0(i) + bw/2, bw, rtl, m.t, ih, H) : {under:"", over:""}; g += yl.under;
  sc.ticks.forEach(t => { const y = Y(t); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="tc-grid"/>` + T(rtl ? W - m.r + 6 : m.l - 6, y + 4, sp.fmtAxis ? sp.fmtAxis(t) : fa(t, step2d(sc.step)), "tc-ax", `text-anchor="${rtl ? "start" : "end"}"`); });
  if(sp.unit) g += T(rtl ? W - m.r + 6 : m.l - 6, m.t - 8, sp.unit, "tc-axt", `text-anchor="${rtl ? "start" : "end"}"`);
  const gw = bw*.72, one = sp.stacked ? gw : gw/ns;
  for(let i = 0; i < n; i++){
    let pos = 0, neg = 0;
    ser.forEach((s, k) => {
      const v = s.values[i] || 0, x = X0(i) + (bw - gw)/2 + (sp.stacked ? 0 : (rtl ? (ns - 1 - k) : k)*one);
      let y0, y1; if(sp.stacked){ if(v >= 0){ y0 = Y(pos); y1 = Y(pos + v); pos += v; } else { y0 = Y(neg); y1 = Y(neg + v); neg += v; } } else { y0 = Y(0); y1 = Y(v); }
      body += `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${Math.max(1, one - (sp.stacked ? 0 : 2)).toFixed(1)}" height="${Math.max(.5, Math.abs(y0 - y1)).toFixed(1)}" fill="${s.color}" rx="${sp.stacked ? 0 : 3}"/>`;
    });
    if(i % Math.max(1, Math.ceil(n/Math.max(1, iw/(rotate ? 30 : 66)))) === 0){ const x = X0(i) + bw/2, y = H - m.b + 16; g += rotate ? T(x, y, sp.labels[i], "tc-ax", `text-anchor="end" transform="rotate(-35 ${x.toFixed(1)} ${y})"`) : T(x, y, sp.labels[i], "tc-ax", 'text-anchor="middle"'); }
  }
  g += yl.over;
  const cid = "cb-" + String(sp.id).replace(/[^\w-]/g, "");
  const defs = animate ? revealClip(cid, "up", {x:m.l, y:m.t - 2, w:iw, h:ih + 4}, rtl) : "";
  g += animate ? `<g clip-path="url(#${cid})">${body}</g>` : body;
  let hit = ""; for(let i = 0; i < n; i++) hit += `<rect x="${X0(i).toFixed(1)}" y="${m.t}" width="${bw.toFixed(1)}" height="${ih}" class="tc-hit"${sp.tip ? ` data-tip="${esc(sp.tip(i))}"` : ""}/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(sp.aria || "نمودار میله‌ای")}"><defs>${defs}</defs>${g}${hit}</svg>`;
}

/* ───── اسپارک‌لاین درون‌خطی (کارت) ───── */
export function spark(values, {w = 96, h = 26, color = "#25406A", fcFrom = null, rtl = true} = {}){
  const v = values.map(x => x == null || !isFinite(x) ? null : x), vv = v.filter(x => x != null); if(vv.length < 2) return "";
  const mn = Math.min(...vv), mx = Math.max(...vv), span = mx - mn || 1, n = v.length, X = i => rtl ? w - 3 - i*(w - 6)/(n - 1) : 3 + i*(w - 6)/(n - 1), Y = x => h - 3 - (x - mn)/span*(h - 6);
  const pts = v.map((x, i) => x == null ? null : [X(i), Y(x), i]).filter(Boolean), cut = fcFrom == null ? pts.length : pts.findIndex(p => p[2] >= fcFrom);
  const act = cut < 0 ? pts : pts.slice(0, Math.max(cut, 1)), fc = cut < 0 ? [] : pts.slice(Math.max(cut - 1, 0));
  const d = a => "M" + a.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L"), last = act[act.length - 1];
  return `<svg class="tc-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d(act)}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>${fc.length > 1 ? `<path d="${d(fc)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="3 2.5" opacity=".75"/>` : ""}<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.6" fill="${color}"/></svg>`;
}

const DRAW = {ts, bars, donut};
export const specs = new Map();
/* سری‌ها و tooltip کارت‌ها می‌توانند تابع build داشته باشند؛ محاسبهٔ سنگین (پیش‌بینی) فقط هنگام رسم همان نمودار اجرا می‌شود. */
function resolveSpec(sp){ if(sp.build){ const b = sp.build; sp.build = null; Object.assign(sp, b()); } }
export function paint(slot, replay, width){
  const sp = specs.get(slot.dataset.chart); if(!sp) return;
  const W = Math.max(260, Math.floor(width ?? (slot.clientWidth || 600)));
  const animate = !!sp.anim && !sp._painted && motionOK() || (replay && sp.anim && motionOK());
  try{ resolveSpec(sp); slot.innerHTML = DRAW[sp.type](sp, W, animate); slot.dataset.w = W; sp._painted = true; }catch(e){ console.error("chart", sp.type, e); slot.innerHTML = `<div class="tc-empty">نمودار رسم نشد.</div>`; }
  slot.removeAttribute("data-pending");
}
/* رسم مرحله‌ای: نمودارهای زیر صفحه یکی‌یکی و در فریم‌های جدا رسم می‌شوند تا صفحه قفل نشود. */
const queue = []; let pumping = false;
function pump(){
  pumping = false; const t0 = performance.now();
  while(queue.length){
    const el = queue.shift(); el._tcq = false;
    if(el.isConnected && el.hasAttribute("data-pending")) paint(el);
    if(performance.now() - t0 > 10) break;
  }
  if(queue.length){ pumping = true; requestAnimationFrame(pump); }
}
function enqueue(el){ if(el._tcq) return; el._tcq = true; queue.push(el); if(!pumping){ pumping = true; requestAnimationFrame(pump); } }
let chartObserver = null, printBound = false;
function ensureChartObserver(){
  if(!printBound){ printBound = true; window.addEventListener("beforeprint", () => document.querySelectorAll("[data-chart][data-pending]").forEach(el => paint(el))); }
  if(chartObserver || !("IntersectionObserver" in window)) return;
  chartObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const el = entry.target;
      if(!el.isConnected){ chartObserver.unobserve(el); return; }
      if(entry.isIntersecting){ chartObserver.unobserve(el); enqueue(el); }
    });
  }, {root:null, rootMargin:"500px 0px", threshold:0});
}
export function paintAll(root, onlyChanged = false){
  const slots = [...root.querySelectorAll("[data-chart]")];
  /* ۱) همهٔ اندازه‌گیری‌ها یک‌جا (یک layout)، ۲) سپس نوشتن؛ خواندن و نوشتن مخلوط هر بار layout اجباری می‌ساخت. */
  const vh = window.innerHeight || 700;
  const info = slots.map(el => { const r = el.getBoundingClientRect(); return {el, w:Math.max(260, Math.floor(el.clientWidth || 600)), shown:el.getClientRects().length > 0, top:r.top, bottom:r.bottom, hasSvg:!!el.querySelector("svg")}; });
  if(!onlyChanged){ queue.length = 0; chartObserver?.disconnect(); }
  const hasIO = "IntersectionObserver" in window; if(hasIO) ensureChartObserver();
  info.forEach(({el, w, shown, top, bottom, hasSvg}) => {
    if(onlyChanged && hasSvg && +el.dataset.w === w) return;
    if(!hasIO){ paint(el, false, w); return; }
    if(!shown){ chartObserver.observe(el); return; }               /* داخل بخش بسته: هنگام بازشدن رسم می‌شود */
    if(top < vh && bottom > 0) paint(el, false, w);                 /* داخل دید: همین حالا */
    else if(bottom >= -500 && top <= vh + 500) enqueue(el);         /* نزدیک دید: در فریم‌های بعدی */
    else chartObserver.observe(el);                                 /* دور: هنگام نزدیک‌شدن */
  });
}
/** کادر جای‌نگهدار نمودار؛ spec در رجیستری ذخیره می‌شود. تا رسم‌شدن، ارتفاع همان نمودار رزرو است (بدون پرش صفحه). */
export function slot(id, spec, cls = ""){ specs.set(id, {...spec, id}); const h = spec.height || (spec.compact ? 210 : 320); return `<div class="tc-slot ${cls}" data-chart="${esc(id)}" data-pending style="min-height:${h}px"></div>`; }
/** اندیس نزدیک‌ترین ماه برای مختصات اشاره‌گر (clientX) روی یک نمودار ts؛ null اگر هندسه نیست */
export function indexAt(slotEl, sp, clientX){
  const svg = slotEl.querySelector("svg"), g = sp.geo; if(!svg || !g) return null;
  const r = svg.getBoundingClientRect(), x = (clientX - r.left)*(g.W/Math.max(1, r.width));
  const k = g.rtl ? (g.W - g.m.r - x)/g.bw : (x - g.m.l)/g.bw;
  return Math.max(0, Math.min(g.n - 1, Math.floor(k)));
}
/** مختصات x مرکز ماه i در فضای svg */
export const xOf = (sp, i) => { const g = sp.geo; return g.rtl ? g.W - g.m.r - (i + .5)*g.bw : g.m.l + (i + .5)*g.bw; };
