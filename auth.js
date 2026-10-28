/* ===================================================================
   Anmeldung und Konto
   - Wird als erstes Skript geladen und lädt danach die App-Skripte (Liste in index.html → <template id="appScripts">).
   - Nicht angemeldet: links die App als Vorschau (leerer Chat mit Agenten-Leiste, Eingabefeld, Kacheln „Leicht“) –
     nicht bedienbar; rechts das Anmeldefenster: E-Mail, Passwort, „Code senden“ → 6 Kacheln für den Code.
     Nach dem Anmelden wird die Vorschau groß und die App öffnet „Neuer Chat“.
   - Angemeldet: alles, was die App im Browser speichert (Einstellungen, API-Keys, Aufgaben, Kalender, Tags,
     Darstellung …), wird ins Konto übertragen und beim Start von dort geladen. Chats und Dokumente speichert der
     Server ohnehin je Konto (/api/chats, /api/docs).
   =================================================================== */
(() => {
  const root = document.documentElement;
  const USER_KEY = 'auth.user';      // nur ein Merker fürs schnelle Starten – angemeldet ist man über das Cookie
  const DIRTY_KEY = 'auth.dirty';    // geänderte Schlüssel, die noch nicht im Konto sind (übersteht das Schließen)
  const FRESH_KEY = 'auth.fresh';    // gerade angemeldet → nach dem Laden „Neuer Chat“ öffnen (sessionStorage)
  // nicht ins Konto: Anmeldung selbst, Zwischenspeicher von Chats/Dokumenten (liegen im Konto), Spotify (gehört zum Gerät)
  const LOCAL_ONLY = /^(auth\.|chats\.v1$|docs\.v1$|spotify\.)/;
  const synced = (k) => typeof k === 'string' && !LOCAL_ONLY.test(k);

  const ls = window.localStorage;
  const S = Storage.prototype;
  const rawSet = S.setItem, rawRemove = S.removeItem, rawGet = S.getItem;
  const lsGet = (k) => { try { return rawGet.call(ls, k); } catch { return null; } };
  const lsSet = (k, v) => { try { rawSet.call(ls, k, v); } catch {} };
  const lsDel = (k) => { try { rawRemove.call(ls, k); } catch {} };
  const lsKeys = () => { const out = []; try { for (let i = 0; i < ls.length; i++) out.push(ls.key(i)); } catch {} return out; };

  let user = null;
  try { user = JSON.parse(lsGet(USER_KEY) || 'null'); } catch {}
  let locked = !user;

  /* ---------- fetch: gesperrt → /api-Anfragen der App warten einfach (die App wird nach dem Anmelden neu geladen);
     angemeldet → läuft die Sitzung ab (401), geht es zurück zur Anmeldung ---------- */
  const nativeFetch = window.fetch.bind(window);
  const apiPath = (input) => { try { return new URL(typeof input === 'string' ? input : input?.url || '', location.href).pathname; } catch { return ''; } };
  let expiring = false;
  window.fetch = (input, init) => {
    const p = apiPath(input);
    const isApi = p.startsWith('/api/') && !p.startsWith('/api/auth/');
    if (isApi && locked) return new Promise(() => {});
    const req = nativeFetch(input, init);
    if (!isApi) return req;
    return req.then((r) => {
      if (r.status === 401 && !expiring) r.clone().json().then((j) => { if (j?.auth) sessionEnded(); }).catch(() => {});
      return r;
    });
  };

  /* ---------- Browser-Speicher ↔ Konto ---------- */
  const dirty = new Set((() => { try { return JSON.parse(lsGet(DIRTY_KEY) || '[]'); } catch { return []; } })());
  let applying = false, pushT = 0, pushing = null;
  const keepDirty = () => lsSet(DIRTY_KEY, JSON.stringify([...dirty]));
  S.setItem = function (k, v) {
    rawSet.call(this, k, v); // wirft wie gewohnt, wenn der Speicher voll ist
    if (this === ls && !locked && !applying && synced(k)) mark(k);
  };
  S.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === ls && !locked && !applying && synced(k)) mark(k);
  };
  function mark(k) { dirty.add(String(k)); keepDirty(); clearTimeout(pushT); pushT = setTimeout(push, 1200); }
  function payload() {
    const set = {}, del = [];
    for (const k of dirty) { const v = lsGet(k); if (v == null) del.push(k); else set[k] = v; }
    return { set, del };
  }
  async function push(beacon) {
    clearTimeout(pushT);
    if (locked || !dirty.size) return;
    if (pushing && !beacon) { await pushing.catch(() => {}); if (!dirty.size) return; }
    const sent = [...dirty];
    const data = payload();
    const body = JSON.stringify(data);
    const run = nativeFetch('/api/account/storage', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: beacon && body.length < 60000 })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        // nur, was sich seitdem nicht wieder geändert hat
        sent.forEach((k) => { if (k in data.set ? lsGet(k) === data.set[k] : lsGet(k) == null) dirty.delete(k); });
        keepDirty();
      });
    if (!beacon) pushing = run.finally(() => { pushing = null; });
    return run.catch(() => { if (!beacon) pushT = setTimeout(push, 8000); });
  }
  window.addEventListener('pagehide', () => push(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push(true); });

  // Stand aus dem Konto in den Browser übernehmen (das Konto zählt; nur noch nicht gesendete Änderungen bleiben)
  function applyAccount(data) {
    applying = true;
    try {
      for (const k of lsKeys()) if (synced(k) && !(k in data) && !dirty.has(k)) lsDel(k);
      for (const [k, v] of Object.entries(data)) if (!dirty.has(k) && lsGet(k) !== v) lsSet(k, v);
    } finally { applying = false; }
  }
  function clearAccount() {
    applying = true;
    for (const k of lsKeys()) if (k !== 'auth.lastEmail') lsDel(k); // E-Mail fürs nächste Anmelden bleibt stehen
    applying = false;
    dirty.clear();
  }
  function sessionEnded() {
    if (expiring) return;
    expiring = true;
    clearAccount();
    location.reload();
  }

  /* ---------- App-Skripte nacheinander laden ---------- */
  function loadApp() {
    const tpl = document.getElementById('appScripts');
    const srcs = [...(tpl?.content.querySelectorAll('script[src]') || [])].map((s) => s.getAttribute('src'));
    let last = null;
    for (const src of srcs) {
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // Reihenfolge wie im HTML
      document.body.append(s);
      last = s;
    }
    return new Promise((res) => { if (!last) res(); last?.addEventListener('load', res); last?.addEventListener('error', res); });
  }
  // Anmeldebildschirm erst zeigen, wenn die Vorschau fertig aufgebaut ist (Skripte, Schrift, Hunde) – dann sauber einblenden
  function reveal(appLoaded) {
    const wait = Promise.all([appLoaded, document.fonts?.ready].filter(Boolean)).then(() => new Promise((r) => setTimeout(r, 120)));
    Promise.race([wait, new Promise((r) => setTimeout(r, 2500))])
      .then(() => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('auth-ready'))));
  }

  /* ---------- Start ---------- */
  async function boot() {
    if (!locked) {
      try {
        if (dirty.size) await push();
        const r = await nativeFetch('/api/account/storage', { cache: 'no-store' });
        if (r.status === 401) { clearAccount(); locked = true; }
        else if (r.ok) applyAccount((await r.json()).data || {});
        // sonst (offline, Server kurz weg): mit dem Stand auf dem Gerät weiter
      } catch {}
    }
    if (locked) showLogin();
    const appLoaded = loadApp();
    if (locked) reveal(appLoaded);
    if (!locked) whenReady();
  }

  // gerade angemeldet → wenn die App ihre Tabs wiederhergestellt hat, „Neuer Chat“ öffnen
  function whenReady() {
    let fresh = false;
    try { fresh = sessionStorage.getItem(FRESH_KEY) === '1'; sessionStorage.removeItem(FRESH_KEY); } catch {}
    if (!fresh) return;
    let done = false;
    const go = () => { if (done) return; done = true; document.querySelector('.sidebar .sb-main [data-nav="new"]')?.click(); };
    window.addEventListener('app-layout-ready', () => setTimeout(go, 0), { once: true });
    setTimeout(go, 6000); // falls das Ereignis nie kommt
  }

  /* ===================================================================
     Anmeldefenster
     =================================================================== */
  const fi = (n, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  function showLogin() {
    root.classList.add('auth-locked');
    const app = document.getElementById('app');
    app?.setAttribute('inert', '');
    app?.setAttribute('aria-hidden', 'true');

    const wrap = document.createElement('section');
    wrap.className = 'auth';
    wrap.setAttribute('aria-label', 'Anmelden');
    wrap.innerHTML = `
      <form class="auth-card" novalidate autocomplete="on">
        <img class="auth-logo" src="icon-180.png?v=2" alt="" width="44" height="44" />
        <h1 class="auth-title">Bei Agenten anmelden</h1>
        <p class="auth-sub">Mit E-Mail, Passwort und deinem 6-stelligen Code.</p>
        <div class="auth-fields">
          <label class="auth-label" for="authEmail">E-Mail</label>
          <div class="auth-field">${fi('user', 14)}<input id="authEmail" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="name@beispiel.de" required /></div>
          <label class="auth-label" for="authPw">Passwort</label>
          <div class="auth-field">${fi('lock', 14)}<input id="authPw" name="password" type="password" autocomplete="current-password" placeholder="Passwort" required />
            <button type="button" class="auth-eye" aria-label="Passwort anzeigen" aria-pressed="false">${fi('eye', 14)}</button></div>
        </div>
        <div class="auth-code-wrap" aria-hidden="true"><div class="auth-code-in">
          <div class="auth-code-head"><span class="auth-label">Code</span><span class="auth-sent"></span></div>
          <div class="auth-code" role="group" aria-label="6-stelliger Code">
            ${Array.from({ length: 6 }, (_, i) => `<input class="auth-digit" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" ${i === 0 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'} aria-label="Ziffer ${i + 1}" tabindex="-1" />`).join('')}
          </div>
        </div></div>
        <p class="auth-err" role="alert"></p>
        <button type="submit" class="auth-btn"><span class="auth-btn-text">Code senden</span><span class="auth-spin" aria-hidden="true"></span></button>
        <div class="auth-foot">
          <button type="button" class="auth-link" data-act="change" hidden>E-Mail ändern</button>
          <button type="button" class="auth-link" data-act="resend" hidden>Code erneut senden</button>
        </div>
      </form>`;
    document.body.append(wrap);

    const form = wrap.querySelector('form');
    const email = wrap.querySelector('#authEmail');
    const pw = wrap.querySelector('#authPw');
    const err = wrap.querySelector('.auth-err');
    const btn = wrap.querySelector('.auth-btn');
    const btnText = wrap.querySelector('.auth-btn-text');
    const codeWrap = wrap.querySelector('.auth-code-wrap');
    const digits = [...wrap.querySelectorAll('.auth-digit')];
    const sentEl = wrap.querySelector('.auth-sent');
    const resend = wrap.querySelector('[data-act="resend"]');
    const change = wrap.querySelector('[data-act="change"]');
    let step = 'login', busy = false, resendAt = 0, resendT = 0;
    try { const last = lsGet('auth.lastEmail'); if (last) email.value = last; } catch {}
    setTimeout(() => (email.value ? pw : email).focus({ preventScroll: true }), 350);

    const setErr = (msg) => { err.textContent = msg || ''; wrap.classList.toggle('has-err', !!msg); };
    const setBusy = (on) => { busy = on; btn.classList.toggle('busy', on); btn.disabled = on; };
    const code = () => digits.map((d) => d.value).join('');
    const syncBtn = () => { if (step === 'code') btn.classList.toggle('ready', code().length === 6); };

    async function post(url, body) {
      const r = await nativeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let j = {};
      try { j = await r.json(); } catch {}
      if (!r.ok) throw new Error(j.error || 'Etwas ist schiefgelaufen. Versuch es noch einmal.');
      return j;
    }

    function toCode(addr, mode) {
      step = 'code';
      wrap.classList.add('step-code');
      codeWrap.setAttribute('aria-hidden', 'false');
      email.readOnly = pw.readOnly = true;
      digits.forEach((d) => { d.value = ''; d.tabIndex = 0; d.classList.remove('filled'); });
      sentEl.textContent = mode === 'fixed' ? 'dein fester Code' : `an ${addr} gesendet`;
      btnText.textContent = 'Anmelden';
      btn.classList.remove('ready');
      change.hidden = false;
      resend.hidden = mode === 'fixed';
      startResendTimer();
      setTimeout(() => digits[0].focus({ preventScroll: true }), 260);
    }
    function toLogin() {
      step = 'login';
      wrap.classList.remove('step-code');
      codeWrap.setAttribute('aria-hidden', 'true');
      email.readOnly = pw.readOnly = false;
      digits.forEach((d) => { d.tabIndex = -1; });
      btnText.textContent = 'Code senden';
      btn.classList.remove('ready');
      resend.hidden = change.hidden = true;
      clearInterval(resendT);
      setErr('');
      pw.focus({ preventScroll: true });
    }
    function startResendTimer() {
      resendAt = Date.now() + 30000;
      clearInterval(resendT);
      const tick = () => {
        const s = Math.ceil((resendAt - Date.now()) / 1000);
        resend.disabled = s > 0;
        resend.textContent = s > 0 ? `Code erneut senden (${s} s)` : 'Code erneut senden';
        if (s <= 0) clearInterval(resendT);
      };
      tick();
      resendT = setInterval(tick, 1000);
    }

    async function sendCode() {
      setErr('');
      const addr = email.value.trim();
      if (!addr) { setErr('Bitte gib deine E-Mail-Adresse ein.'); email.focus(); return; }
      if (!pw.value) { setErr('Bitte gib dein Passwort ein.'); pw.focus(); return; }
      setBusy(true);
      try {
        const j = await post('/api/auth/start', { email: addr, password: pw.value });
        lsSet('auth.lastEmail', j.email || addr);
        if (j.mode === 'direct') { await enter(j); return; } // feste Zugangsdaten ohne Code
        toCode(j.email || addr, j.mode);
      } catch (e) { setErr(e.message); }
      setBusy(false);
    }

    async function verify() {
      const c = code();
      if (c.length !== 6) { setErr('Bitte gib alle 6 Ziffern ein.'); digits[c.length]?.focus(); return; }
      setErr('');
      setBusy(true);
      try {
        const j = await post('/api/auth/verify', { email: email.value.trim(), code: c });
        await enter(j);
      } catch (e) {
        setErr(e.message);
        wrap.classList.add('code-wrong');
        setBusy(false);
        digits.forEach((d) => { d.value = ''; d.classList.remove('filled'); });
        syncBtn();
        digits[0].focus();
      }
    }

    // angemeldet: Konto-Stand holen, bei einem neuen Konto die Daten dieses Geräts mitnehmen, dann groß werden
    async function enter(j) {
      user = { email: j.user?.email || email.value.trim() };
      locked = false;
      lsSet(USER_KEY, JSON.stringify(user));
      try { sessionStorage.setItem(FRESH_KEY, '1'); } catch {}
      try {
        if (j.fresh) await adoptDevice();
        else {
          const r = await nativeFetch('/api/account/storage', { cache: 'no-store' });
          if (r.ok) applyAccount((await r.json()).data || {});
        }
      } catch {}
      if (dirty.size) await push().catch(() => {});
      open();
    }

    // Neues (leeres) Konto: was auf diesem Gerät schon gespeichert ist (Einstellungen, API-Keys, Aufgaben …,
    // Chats und Dokumente aus dem Browser-Ersatzspeicher), wandert ins Konto
    async function adoptDevice() {
      for (const k of lsKeys()) if (synced(k)) dirty.add(k);
      keepDirty();
      await push();
      const put = (url, body) => nativeFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      try {
        const old = JSON.parse(lsGet('chats.v1') || 'null');
        const chats = (old?.chats || []).filter((c) => c?.id && (c.history || []).length);
        for (const batch of batches(chats)) await put('/api/chats', { chats: batch, active: old.active, order: chats.map((c) => c.id) });
      } catch {}
      try {
        const old = JSON.parse(lsGet('docs.v1') || 'null');
        const docs = (old?.docs || []).filter((d) => d?.id);
        for (const batch of batches(docs)) await put('/api/docs', { docs: batch, projects: old.projects || [] });
      } catch {}
    }
    // Vercel nimmt höchstens ~4,5 MB pro Anfrage → in Pakete teilen
    function batches(items, max = 3_000_000) {
      const out = [];
      let cur = [], size = 0;
      for (const it of items) {
        const n = JSON.stringify(it).length;
        if (cur.length && size + n > max) { out.push(cur); cur = []; size = 0; }
        cur.push(it); size += n;
      }
      if (cur.length) out.push(cur);
      return out;
    }

    // Vorschau wird groß (gleiches Timing wie die App), dann startet die App mit den Kontodaten neu
    function open() {
      const appEl = document.getElementById('app');
      const collapsed = lsGet('sidebarCollapsed') === '1';
      root.classList.add('auth-opening');
      appEl?.classList.toggle('collapsed', collapsed);
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => location.reload(), reduce ? 60 : 620);
    }

    /* ---------- Bedienung ---------- */
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (busy) return;
      if (step === 'login') sendCode(); else verify();
    });
    wrap.querySelector('.auth-eye').addEventListener('click', (e) => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      e.currentTarget.setAttribute('aria-pressed', String(show));
      e.currentTarget.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
    });
    change.addEventListener('click', toLogin);
    resend.addEventListener('click', async () => {
      if (busy || Date.now() < resendAt) return;
      setErr('');
      setBusy(true);
      try { await post('/api/auth/start', { email: email.value.trim(), password: pw.value }); startResendTimer(); digits[0].focus(); }
      catch (e) { setErr(e.message); }
      setBusy(false);
    });
    // Kacheln: eine Ziffer je Feld, weiterspringen, Löschen springt zurück, Einfügen/Autofill verteilt den ganzen Code
    const fill = (from, text) => {
      const ds = String(text).replace(/\D/g, '').slice(0, 6 - from).split('');
      ds.forEach((d, i) => { digits[from + i].value = d; });
      digits.forEach((d) => d.classList.toggle('filled', !!d.value));
      const next = Math.min(5, from + ds.length);
      digits[code().length === 6 ? 5 : next].focus();
      syncBtn();
      if (code().length === 6) setTimeout(() => { if (!busy && step === 'code') verify(); }, 120);
    };
    digits.forEach((d, i) => {
      d.addEventListener('input', () => {
        wrap.classList.remove('code-wrong');
        setErr('');
        const v = d.value.replace(/\D/g, '');
        if (v.length > 1) { d.value = ''; fill(i, v); return; }
        d.value = v;
        d.classList.toggle('filled', !!v);
        syncBtn();
        if (v && i < 5) digits[i + 1].focus();
        if (code().length === 6) setTimeout(() => { if (!busy && step === 'code') verify(); }, 120);
      });
      d.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !d.value && i > 0) { e.preventDefault(); digits[i - 1].value = ''; digits[i - 1].classList.remove('filled'); digits[i - 1].focus(); syncBtn(); }
        else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); digits[i - 1].focus(); }
        else if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); digits[i + 1].focus(); }
      });
      d.addEventListener('paste', (e) => { e.preventDefault(); wrap.classList.remove('code-wrong'); fill(i, e.clipboardData?.getData('text') || ''); });
      d.addEventListener('focus', () => d.select());
    });
  }

  /* ---------- für die Einstellungen ---------- */
  window.Auth = {
    user: () => (user ? { ...user } : null),
    async logout() {
      await push().catch(() => {});
      try { await nativeFetch('/api/auth/logout', { method: 'POST' }); } catch {}
      locked = true;
      clearAccount();
      location.reload();
    },
    flush: () => push(),
  };

  // Skript steht am Ende von <body> → das Gerüst ist da
  boot();
})();
