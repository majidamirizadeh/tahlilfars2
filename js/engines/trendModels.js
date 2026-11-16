/* مدل‌های پیش‌بینی سری زمانی ماهانه (تب «روند») + آزمون خارج از نمونه + معیارهای خطا.
   فقط توابع خالص و بدون DOM. هر مدلی که اینجا فهرست شده واقعاً پیاده‌سازی شده است؛ مدل‌هایی که داده‌ٔ کافی ندارند اجرا نمی‌شوند
   و دلیل «غیرقابل اجرا» در خروجی ارزیابی می‌آید. تنظیمات از رجیستری (گروه «trend») خوانده می‌شود. */
import {get as S} from "../settings/settings.js";

export const sum = a => a.reduce((s, v) => s + v, 0);
export const mean = a => a.length ? sum(a)/a.length : 0;
export const sd = a => { if(a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a.map(v => (v - m)**2))/(a.length - 1)); };
export const median = a => { if(!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1] + s[m])/2; };
const rng = h => Array.from({length:h}, (_, i) => i);
const SEASON = 12;

export function ols(y){
  const n = y.length, mx = (n - 1)/2, my = mean(y); let sxy = 0, sxx = 0;
  for(let i = 0; i < n; i++){ sxy += (i - mx)*(y[i] - my); sxx += (i - mx)**2; }
  const b = sxx ? sxy/sxx : 0; return {a:my - b*mx, b, n};
}
/** حل دستگاه خطی کوچک با حذف گاوسی (محوربندی جزئی)؛ null اگر منفرد باشد */
function solve(A, B){
  const n = B.length, M = A.map((r, i) => [...r, B[i]]);
  for(let c = 0; c < n; c++){
    let p = c; for(let r = c + 1; r < n; r++) if(Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if(Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
    for(let r = 0; r < n; r++) if(r !== c){ const f = M[r][c]/M[c][c]; for(let k = c; k <= n; k++) M[r][k] -= f*M[c][k]; }
  }
  return M.map((r, i) => r[n]/r[i]);
}

/* ───────── روش‌ها ───────── */
function holtCore(y, phi){
  const n = y.length; let best = null;
  const b0 = n >= 3 ? (y[2] - y[0])/2 : y[1] - y[0];
  for(const al of [.1, .2, .3, .4, .5, .6, .7, .8, .9]) for(const be of [.05, .1, .2, .3, .5]){
    let l = y[0], b = b0, sse = 0;
    for(let t = 1; t < n; t++){ const p = l + phi*b; sse += (y[t] - p)**2; const l2 = al*y[t] + (1 - al)*p; b = be*(l2 - l) + (1 - be)*phi*b; l = l2; }
    if(!best || sse < best.sse) best = {sse, l, b, al, be};
  }
  return best;
}
function sesCore(y){
  let best = null;
  for(let al = .05; al < .96; al += .05){ let l = y[0], sse = 0; for(let t = 1; t < y.length; t++){ const e = y[t] - l; sse += e*e; l += al*e; } if(!best || sse < best.sse) best = {sse, l, al}; }
  return best;
}
function hwCore(y){
  const m = SEASON, n = y.length;
  const l0 = mean(y.slice(0, m)), b0 = (mean(y.slice(m, 2*m)) - l0)/m; let best = null;
  for(const al of [.1, .3, .5, .7]) for(const be of [.05, .1, .3]) for(const ga of [.1, .3, .5]){
    let l = l0, b = b0, sse = 0; const s = y.slice(0, m).map(v => v - l0);
    for(let t = m; t < n; t++){ const p = l + b + s[t % m]; sse += (y[t] - p)**2; const l2 = al*(y[t] - s[t % m]) + (1 - al)*(l + b); b = be*(l2 - l) + (1 - be)*b; s[t % m] = ga*(y[t] - l2) + (1 - ga)*s[t % m]; l = l2; }
    if(!best || sse < best.sse) best = {sse, l, b, s: [...s], al, be, ga};
  }
  return best;
}
const diff = z => z.slice(1).map((v, i) => v - z[i]);
function arFit(z, p){
  const n = z.length, N = n - p, k = p + 1; if(N < k + 2) return null;
  const A = Array.from({length:k}, () => Array(k).fill(0)), B = Array(k).fill(0);
  for(let t = p; t < n; t++){ const x = [1, ...Array.from({length:p}, (_, j) => z[t - 1 - j])]; for(let i = 0; i < k; i++){ B[i] += x[i]*z[t]; for(let j = 0; j < k; j++) A[i][j] += x[i]*x[j]; } }
  const w = solve(A, B); if(!w) return null;
  let sse = 0; for(let t = p; t < n; t++){ let e = z[t] - w[0]; for(let j = 0; j < p; j++) e -= w[1 + j]*z[t - 1 - j]; sse += e*e; }
  return {c:w[0], phi:w.slice(1), sse, N, p};
}
function arimaCore(y){
  let best = null;
  for(const d of [0, 1]) for(const p of [1, 2]){
    const z = d ? diff(y) : y, f = arFit(z, p); if(!f) continue;
    if(d === 0 && sum(f.phi.map(Math.abs)) >= 1) continue;          /* شرط ساده پایداری AR */
    const mse = Math.max(f.sse/f.N, 1e-9), score = Math.log(mse) + (p + 1)*Math.log(f.N)/f.N;
    if(!best || score < best.score) best = {...f, d, score};
  }
  return best;
}

export const METHODS = {
  linear:{t:"روند خطی (رگرسیون OLS)", en:"Linear Trend", min:() => 3,
    run:(y, h) => { const f = ols(y); return rng(h).map(i => f.a + f.b*(y.length + i)); }},
  ma:{t:"میانگین متحرک", en:"Moving Average", min:() => 2,
    run:(y, h) => { const k = Math.min(Math.max(2, S("trend.maWindow")), y.length), m = mean(y.slice(-k)); return rng(h).map(() => m); }},
  wma:{t:"میانگین متحرک وزنی", en:"Weighted Moving Average", min:() => 2,
    run:(y, h) => { const k = Math.min(Math.max(2, S("trend.maWindow")), y.length), w = rng(k).map(i => i + 1), v = y.slice(-k), m = sum(v.map((x, i) => x*w[i]))/sum(w); return rng(h).map(() => m); }},
  ses:{t:"هموارسازی نمایی ساده", en:"Simple Exponential Smoothing", min:() => 3,
    run:(y, h) => { const f = sesCore(y); return rng(h).map(() => f.l); }},
  holt:{t:"هولت (روند خطی)", en:"Holt's Linear Trend", min:() => 4,
    run:(y, h) => { const f = holtCore(y, 1); return rng(h).map(i => f.l + (i + 1)*f.b); }},
  dholt:{t:"هولت با روند میرا", en:"Damped Holt", min:() => 4,
    run:(y, h) => { const phi = .9, f = holtCore(y, phi); return rng(h).map(i => { let s = 0; for(let k = 1; k <= i + 1; k++) s += Math.pow(phi, k); return f.l + s*f.b; }); }},
  snaive:{t:"فصلی ساده", en:"Seasonal Naive", min:() => SEASON,
    run:(y, h) => { const n = y.length; return rng(h).map(i => y[n - SEASON + (i % SEASON)]); }},
  hw:{t:"هولت-وینترز (جمعی)", en:"Holt-Winters (Additive)", min:() => Math.max(2*SEASON, S("trend.seasonalMin")),
    run:(y, h) => { const f = hwCore(y), n = y.length; return rng(h).map(i => f.l + (i + 1)*f.b + f.s[(n + i) % SEASON]); }},
  arima:{t:"ARIMA(p,d,0) با عرض از مبدأ", en:"ARIMA", min:() => Math.max(10, S("trend.arimaMin")),
    run:(y, h) => {
      const f = arimaCore(y); if(!f) throw new Error("ARIMA برازش نشد");
      const z = f.d ? diff(y) : y.slice(), out = [];
      for(let i = 0; i < h; i++){ let v = f.c; for(let j = 0; j < f.p; j++) v += f.phi[j]*z[z.length - 1 - j]; z.push(v); out.push(v); }
      if(!f.d) return out; let acc = y[y.length - 1]; return out.map(d => acc += d);
    }}
};
export const METHOD_IDS = Object.keys(METHODS);
/* پارامترهای برازش‌شده (برای نمایش در مستندات/ارزیابی) */
export const fitInfo = {ses:sesCore, holt:y => holtCore(y, 1), dholt:y => holtCore(y, .9), hw:hwCore, arima:arimaCore};

/* ───────── معیارهای خطا و آزمون خارج از نمونه ───────── */
/** MAE, RMSE, MAPE (صفرها حذف می‌شوند)، sMAPE (فقط زوج‌های هر دو صفر حذف می‌شوند)؛ درصدها 0..∞ */
export function errorMetrics(act, pred){
  const n = act.length; if(!n) return null;
  const e = act.map((a, i) => a - pred[i]);
  const mae = mean(e.map(Math.abs)), rmse = Math.sqrt(mean(e.map(x => x*x)));
  const pe = act.map((a, i) => a !== 0 ? Math.abs(e[i])/Math.abs(a)*100 : null).filter(v => v != null);
  const se = act.map((a, i) => (Math.abs(a) + Math.abs(pred[i])) > 0 ? 200*Math.abs(e[i])/(Math.abs(a) + Math.abs(pred[i])) : null).filter(v => v != null);
  return {n, mae, rmse, mape:pe.length ? mean(pe) : null, mapeN:pe.length, smape:se.length ? mean(se) : null, errs:e};
}
export const MIN_TEST = 2;
/** آزمون «مبدأ غلتان»: برای t از t0 تا n-1، مدل با y[0..t) برازش و یک گام جلوتر پیش‌بینی می‌شود. run(ySlice,h,moy0) → آرایهٔ پیش‌بینی */
export function backtest(run, minN, y, moy0, allowNeg = false){
  const n = y.length, t0 = Math.max(minN, Math.ceil(n/2));
  if(n < minN) return {ok:false, reason:`نیازمند حداقل ${minN} ماه تاریخچه (اکنون ${n})`};
  if(n - t0 < MIN_TEST) return {ok:false, reason:`برای آزمون خارج از نمونه حداقل ${MIN_TEST} نقطهٔ آزمون لازم است؛ با ${n} ماه فقط ${Math.max(0, n - t0)} نقطه باقی می‌ماند`};
  const act = [], pred = [];
  try{ for(let t = t0; t < n; t++){ let p = run(y.slice(0, t), 1, moy0)[0]; if(!isFinite(p)) throw 0; if(!allowNeg) p = Math.max(0, p); act.push(y[t]); pred.push(p); } }
  catch(e){ return {ok:false, reason:"برازش مدل روی این سری ناموفق بود"}; }
  return {ok:true, ...errorMetrics(act, pred), act, pred};
}
const better = (a, b) => !b || (a.smape ?? 1e9) < (b.smape ?? 1e9) - 1e-9 || (Math.abs((a.smape ?? 1e9) - (b.smape ?? 1e9)) <= 1e-9 && a.rmse < b.rmse);
/** ارزیابی همهٔ نامزدها {id:{run,min}}؛ بهترین بر اساس کمترین sMAPE خارج از نمونه (تساوی با RMSE) */
export function evaluate(cands, y, moy0, allowNeg = false){
  const results = {}; let best = null;
  for(const id in cands){ const c = cands[id], r = backtest(c.run, c.min, y, moy0, allowNeg); results[id] = r; if(r.ok && better(r, best && results[best])) best = id; }
  return {results, best};
}
const Z = c => { const p = (1 + Math.min(.999, Math.max(.5, c/100)))/2, t = Math.sqrt(-2*Math.log(1 - p)); return t - (2.515517 + .802853*t + .010328*t*t)/(1 + 1.432788*t + .189269*t*t + .001308*t**3); };
export const zOf = Z;

const stdCands = () => { const o = {}; for(const id of METHOD_IDS) o[id] = {run:METHODS[id].run, min:METHODS[id].min()}; return o; };

/** پیش‌بینی یک سری: method = "auto" یا شناسهٔ مدل. خروجی شامل بازهٔ پیش‌بینی (σ از خطاهای یک‌گام خارج از نمونه × √افق)، ارزیابی همهٔ مدل‌ها و سطح اتکا. */
export function forecastSeries(y, h, method, moy0, {allowNeg = false, extra = null, prefer = null} = {}){
  const n = y.length, cands = {...stdCands(), ...(extra || {})};
  if(n < 2) return {fc:rng(h).map(() => y[0] || 0), lo:rng(h).map(() => y[0] || 0), hi:rng(h).map(() => y[0] || 0), method:"linear", eval:null, sigma:0, rel:{level:"none", msg:"برای پیش‌بینی حداقل ۲ ماه داده لازم است؛ پیش‌بینی قابل اتکا نیست."}};
  const ev = n >= 4 ? evaluate(cands, y, moy0, allowNeg) : {results:{}, best:null};
  let id = method, note = null;
  if(id === "auto" && prefer && ev.best && ev.best !== prefer.id && ev.results[prefer.id]?.ok && ev.results[prefer.id].smape <= ev.results[ev.best].smape*prefer.tol + 1e-9){ id = prefer.id; note = `«${prefer.t}» به‌دلیل خطای قابل‌مقایسه با بهترین مدل (حداکثر ${Math.round((prefer.tol - 1)*100)}٪ بیشتر) و آگاهی از ساختار اجزا ترجیح داده شد.`; }
  else if(id === "auto"){ id = ev.best || (n >= 3 ? "linear" : "ma"); if(!ev.best) note = "داده برای انتخاب خودکار مبتنی بر آزمون خارج از نمونه کافی نیست؛ روند خطی به‌عنوان مدل پایه استفاده شد."; }
  else if(cands[id] && n < cands[id].min){ const was = id; id = ev.best || (n >= 3 ? "linear" : "ma"); note = `«${METHODS[was]?.t || was}» با ${n} ماه داده قابل اجرا نیست؛ به «${METHODS[id]?.t || id}» تبدیل شد.`; }
  const cd = cands[id] || cands.linear, raw = cd.run(y, h, moy0), neg = allowNeg;
  const fc = raw.map(v => neg ? v : Math.max(0, v));
  const myEval = ev.results[id] || (n >= 4 ? backtest(cd.run, cd.min, y, moy0, neg) : {ok:false});
  let sigma, sigmaSrc;
  if(myEval.ok && myEval.errs.length >= MIN_TEST){ sigma = Math.sqrt(mean(myEval.errs.map(e => e*e))); sigmaSrc = "oos"; }
  else { const f = ols(y); sigma = sd(y.map((v, i) => v - (f.a + f.b*i))) || sd(y); sigmaSrc = "insample"; }
  const z = Z(S("trend.confidence"));
  const lo = fc.map((v, i) => neg ? v - z*sigma*Math.sqrt(i + 1) : Math.max(0, v - z*sigma*Math.sqrt(i + 1))), hi = fc.map((v, i) => v + z*sigma*Math.sqrt(i + 1));
  const minB = S("trend.minBacktest"), nTest = myEval.ok ? myEval.n : 0;
  let rel;
  if(n < minB || !myEval.ok) rel = {level:"none", msg:`تاریخچه (${n} ماه) برای ارزیابی خارج از نمونه کافی نیست؛ پیش‌بینی قابل اتکا نیست و فقط راهنماست.`};
  else if(n < 12 || nTest < 3 || (myEval.smape ?? 0) > 25) rel = {level:"low", msg:`اتکای محدود: تاریخچه ${n} ماه و ${nTest} نقطهٔ آزمون${(myEval.smape ?? 0) > 25 ? " و خطای بالا" : ""}؛ الگوی فصلی قابل تخمین نیست.`};
  else rel = {level:"ok", msg:"اتکای قابل‌قبول (آزمون خارج از نمونه با تعداد نقاط کافی)."};
  return {fc, lo, hi, method:id, eval:{...ev, chosen:myEval}, sigma, sigmaSrc, rel, note, n, nTest};
}
