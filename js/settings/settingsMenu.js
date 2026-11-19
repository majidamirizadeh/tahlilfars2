/* منوی همبرگری تنظیمات — به‌صورت خودکار از رجیستری settings.js ساخته می‌شود.
   هر تنظیم/هشدار/شاخص جدیدی که با registerSetting / registerThreshold / registerAlertRule ثبت شود، خودش اینجا ظاهر می‌شود. */
import {schema, get, set, reset, resetAll, isModified, modifiedCount, onChange} from "./settings.js";
import {isAdmin, getUser, listUsers, createUser, changePassword, deleteUser} from "../auth/auth.js";

const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const faN = n => Number(n).toLocaleString("fa-IR");
const KEEP_OPEN = new Set(); /* دیفالت همه گروه‌ها بسته */

export function initSettingsMenu({button, getOptions=()=>[], beforeOpen=null}){
  let root = null, open = false, defsById = new Map();

  function itemHtml(d){
    const label = `<span class="st-label">${esc(d.label)}${d.desc?`<small>${esc(d.desc)}</small>`:""}</span>`;
    let ctl;
    if(d.type==="bool"){
      ctl = `<label class="rp-switch"><input type="checkbox" data-st-input="${d.id}" ${get(d.id)?"checked":""}><span class="rp-track"></span></label>`;
    }else if(d.type==="list"){
      const cur = new Set(get(d.id));
      const opts = [...new Set([...getOptions(d.id), ...cur])];
      ctl = `<div class="st-chips">${opts.map(o=>`<button type="button" class="st-chip ${cur.has(o)?"on":""}" data-st-list="${d.id}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
    }else{
      ctl = `<input type="number" class="st-num" dir="ltr" data-st-input="${d.id}" value="${get(d.id)}" min="${d.min??""}" max="${d.max??""}" step="${d.step}" inputmode="decimal">${d.unit?`<span class="st-unit">${esc(d.unit)}</span>`:""}`;
    }
    return `<div class="st-item ${d.type==="list"?"st-item-list":""} ${isModified(d.id)?"modified":""}" data-st-item="${d.id}">${label}<div class="st-ctl">${ctl}<button type="button" class="st-reset" data-st-reset="${d.id}" title="بازگردانی به پیش‌فرض" aria-label="بازگردانی به پیش‌فرض">↺</button></div></div>`;
  }

  function adminHtml(){
    if(!isAdmin()) return "";
    return `<details class="st-group adm-group" open>
      <summary><span>مدیریت کاربران</span><em class="st-badge">مدیر</em></summary>
      <div class="st-section adm-section">
        <p class="st-note">ایجاد و حذف حساب‌های کاربری سامانه. دسترسی این بخش فقط برای مدیر فعال است.</p>
        <form class="adm-create" data-adm-form>
          <label>نام کاربری<input name="username" type="text" minlength="2" maxlength="60" autocomplete="off" required></label>
          <label>رمز عبور اولیه<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
          <label>نقش حساب<select name="role"><option value="user">کاربر عادی</option><option value="admin">مدیر</option></select></label>
          <button type="submit" class="adm-primary">ایجاد کاربر</button>
        </form>
        <p class="adm-message" data-adm-message role="status" aria-live="polite"></p>
        <div class="adm-list-head"><b>کاربران ثبت‌شده</b><button type="button" class="adm-refresh" data-adm-refresh>به‌روزرسانی فهرست</button></div>
        <div class="adm-users" data-adm-users><p class="st-note">در حال دریافت فهرست کاربران…</p></div>
      </div>
    </details>`;
  }

  function build(){
    defsById = new Map();
    const body = schema().map(({group,sections})=>{
      sections.forEach(s=>s.items.forEach(d=>defsById.set(d.id,d)));
      const n = sections.reduce((a,s)=>a+s.items.filter(d=>isModified(d.id)).length,0);
      return `<details class="st-group" data-st-group="${group.id}" ${KEEP_OPEN.has(group.id)?"open":""}>
        <summary><span>${esc(group.label)}</span><em class="st-badge" ${n?"":"hidden"}>${faN(n)} تغییر</em></summary>
        ${sections.map(s=>`<div class="st-section">${s.title?`<h4>${esc(s.title)}</h4>`:""}${s.note?`<p class="st-note">${esc(s.note)}</p>`:""}${s.items.map(itemHtml).join("")}</div>`).join("")}
      </details>`;
    }).join("");
    return `<div class="st-backdrop" data-st="close"></div>
      <aside class="st-panel" role="dialog" aria-label="تنظیمات">
        <header><h2>تنظیمات آستانه‌ها و هشدارها</h2><button type="button" class="st-close" data-st="close" aria-label="بستن">×</button></header>
        <p class="st-intro">تغییرات بلافاصله در تب‌های تحلیل و خروجی اعمال و در همین مرورگر ذخیره می‌شوند.</p>
        <div class="st-body">${adminHtml()}${body}</div>
        <footer><span class="st-total"></span><button type="button" class="st-resetall" data-st="resetall">بازگردانی همه به پیش‌فرض</button></footer>
      </aside>`;
  }

  /* به‌روزرسانی سبک بدون ساخت دوباره (تا فوکوس و اسکرول حفظ شود) */
  function paint(){
    if(!root || !root.querySelector(".st-body")) return;
    try{
      root.querySelectorAll("[data-st-item]").forEach(el=>el.classList.toggle("modified", isModified(el.dataset.stItem)));
      root.querySelectorAll("[data-st-group]").forEach(g=>{
        const n = [...g.querySelectorAll("[data-st-item]")].filter(el=>isModified(el.dataset.stItem)).length;
        const b = g.querySelector(".st-badge"); if(b){ b.hidden = !n; b.textContent = faN(n)+" تغییر"; }
      });
      const t = modifiedCount();
      const total = root.querySelector(".st-total"); if(total) total.textContent = t ? `${faN(t)} تنظیم تغییر کرده` : "همه مقادیر پیش‌فرض‌اند";
      const ra = root.querySelector(".st-resetall"); if(ra) ra.disabled = !t;
    }catch(err){ console.error("settings paint", err); }
  }
  function syncInputs(){
    if(!root) return;
    try{
      root.querySelectorAll("[data-st-input]").forEach(inp=>{
        if(document.activeElement===inp) return;
        const v = get(inp.dataset.stInput);
        if(inp.type==="checkbox") inp.checked = !!v; else inp.value = v;
      });
      root.querySelectorAll("[data-st-list]").forEach(b=>b.classList.toggle("on", (get(b.dataset.stList)||[]).includes(b.dataset.v)));
    }catch(err){ console.error("settings sync", err); }
  }

  function show(){
    if(!root){ root = document.createElement("div"); root.id = "settingsRoot"; document.body.appendChild(root); bind(); }
    const keepOpen = new Set([...root.querySelectorAll("details[open]")].map(d=>d.dataset.stGroup));
    root.innerHTML = build();
    keepOpen.forEach(id=>root.querySelector(`[data-st-group="${id}"]`)?.setAttribute("open",""));
    paint();
    if(isAdmin()) loadAdminUsers();
    root.classList.add("open"); open = true; button.setAttribute("aria-expanded","true");
    document.body.classList.add("settings-open");
  }
  function hide(){ if(!root) return; root.classList.remove("open"); open = false; button.setAttribute("aria-expanded","false"); document.body.classList.remove("settings-open"); }

  let timer = null;
  function adminMessage(message, kind="ok"){
    const el=root?.querySelector("[data-adm-message]");
    if(!el) return;
    el.textContent=message;
    el.dataset.kind=kind;
  }
  function renderAdminUsers(users){
    const target=root?.querySelector("[data-adm-users]");
    if(!target) return;
    const me=getUser()?.username;
    if(!Array.isArray(users) || !users.length){
      target.innerHTML='<p class="st-note">کاربری ثبت نشده است.</p>';
      return;
    }
    target.innerHTML=`<div class="adm-user-list">${users.map(u=>{
      const self=u.username===me;
      const role=u.role==="admin"?"مدیر":"کاربر";
      const created=u.created?new Date(u.created).toLocaleDateString("fa-IR"):"—";
      const protectedUser=u.username==="00"||self;
      return `<div class="adm-user-row">
        <div class="adm-user-info"><b dir="auto">${esc(u.username)}</b><span>${role} · ${u.active?"فعال":"غیرفعال"} · ${created}</span></div>
        ${protectedUser?'<span class="adm-protected">حساب جاری</span>':`<div class="adm-actions"><button type="button" class="adm-resetpass" data-adm-pass="${esc(u.username)}">تغییر رمز</button><button type="button" class="adm-delete" data-adm-delete="${esc(u.username)}">حذف</button></div>`}
      </div>`;
    }).join("")}</div>`;
  }
  async function loadAdminUsers(){
    const target=root?.querySelector("[data-adm-users]");
    if(!target||!isAdmin()) return;
    target.innerHTML='<p class="st-note">در حال دریافت فهرست کاربران…</p>';
    try{
      const data=await listUsers();
      renderAdminUsers(data.users||[]);
    }catch(err){
      target.innerHTML='<p class="adm-error">دریافت فهرست کاربران ناموفق بود.</p>';
      adminMessage(err.message||"خطا در دریافت کاربران","err");
    }
  }

  function bind(){
    root.addEventListener("submit", async e=>{
      const form=e.target.closest("[data-adm-form]");
      if(!form) return;
      e.preventDefault();
      if(!isAdmin()){ adminMessage("دسترسی غیرمجاز","err"); return; }
      const fd=new FormData(form);
      const username=String(fd.get("username")||"").trim();
      const password=String(fd.get("password")||"");
      const role=String(fd.get("role")||"user");
      const submit=form.querySelector('button[type="submit"]');
      submit.disabled=true;
      adminMessage("در حال ایجاد کاربر…");
      try{
        await createUser(username,password,role);
        form.reset();
        adminMessage("کاربر «"+username+"» با موفقیت ایجاد شد.","ok");
        await loadAdminUsers();
      }catch(err){
        adminMessage(err.message||"ایجاد کاربر انجام نشد.","err");
      }finally{ submit.disabled=false; }
    });
    root.addEventListener("click", async e=>{
      const pass=e.target.closest("[data-adm-pass]");
      if(pass){
        const username=pass.dataset.admPass;
        if(!isAdmin()||!username) return;
        const password=prompt("رمز عبور جدید برای «"+username+"» (حداقل ۸ کاراکتر):");
        if(password===null) return;
        if(password.length<8){ adminMessage("رمز عبور باید حداقل ۸ کاراکتر باشد.","err"); return; }
        pass.disabled=true;
        try{
          await changePassword(username,password);
          adminMessage("رمز عبور «"+username+"» تغییر کرد.","ok");
        }catch(err){
          adminMessage(err.message||"تغییر رمز انجام نشد.","err");
        }finally{ pass.disabled=false; }
        return;
      }
      const del=e.target.closest("[data-adm-delete]");
      if(del){
        const username=del.dataset.admDelete;
        if(!isAdmin()||!username) return;
        if(!confirm("کاربر «"+username+"» حذف شود؟ این عملیات قابل بازگشت نیست.")) return;
        del.disabled=true;
        adminMessage("در حال حذف کاربر…");
        try{
          await deleteUser(username);
          adminMessage("کاربر «"+username+"» حذف شد.","ok");
          await loadAdminUsers();
        }catch(err){
          adminMessage(err.message||"حذف کاربر انجام نشد.","err");
          del.disabled=false;
        }
        return;
      }
      if(e.target.closest("[data-adm-refresh]")){ loadAdminUsers(); return; }
    });
    root.addEventListener("click", e=>{
      /* جلوگیری از بسته/باز شدن تصادفی details وقتی روی کنترل کلیک می‌شود */
      if(e.target.closest("[data-st-input], .st-ctl, .rp-switch, .st-chip, .st-reset, .st-num")) e.stopPropagation();
      const t = e.target.closest("[data-st],[data-st-reset],[data-st-list]"); if(!t) return;
      if(t.dataset.st==="close") return hide();
      if(t.dataset.st==="resetall"){ if(confirm("همه تنظیمات به مقدار پیش‌فرض برگردد؟")){ resetAll(); syncInputs(); paint(); } return; }
      if(t.dataset.stReset){ reset(t.dataset.stReset); syncInputs(); paint(); return; }
      if(t.dataset.stList){
        const id = t.dataset.stList, cur = new Set(get(id)||[]);
        cur.has(t.dataset.v) ? cur.delete(t.dataset.v) : cur.add(t.dataset.v);
        set(id,[...cur]); syncInputs(); paint();
      }
    });
    const commit = inp => {
      const id = inp.dataset.stInput; if(!id) return;
      try{
        if(inp.type==="checkbox") set(id, !!inp.checked);
        else if(inp.value!=="" && Number.isFinite(Number(inp.value))) set(id, Number(inp.value));
        paint();
      }catch(err){ console.error("settings commit", err); }
    };
    /* فقط برای number: input با تاخیر؛ برای checkbox فقط change تا از دوباره‌کاری و سفیدشدن جلوگیری شود */
    root.addEventListener("input", e=>{
      const inp=e.target.closest("[data-st-input]"); if(!inp || inp.type==="checkbox") return;
      clearTimeout(timer); timer=setTimeout(()=>commit(inp),350);
    });
    root.addEventListener("change", e=>{
      const inp=e.target.closest("[data-st-input]"); if(!inp) return;
      e.stopPropagation();
      clearTimeout(timer);
      commit(inp);
      if(inp.type!=="checkbox"){ try{ inp.value = get(inp.dataset.stInput); }catch{} }
    });
  }

  button.addEventListener("click", async ()=>{
    if(open) return hide();
    if(beforeOpen){ try{ await beforeOpen(); }catch(err){ console.error("settings beforeOpen", err); } }   /* ثبت تنظیمات موتورهایی که Lazy Load می‌شوند */
    show();
  });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape" && open) hide(); });
  onChange(()=>{ if(open){ syncInputs(); paint(); } });
  return {show, hide};
}
