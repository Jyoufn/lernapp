/* =====================================================================
   Mini-Apps (```widget): die KI schreibt eigenen Code (HTML/CSS/JS), die App führt ihn im Chat in einem Kasten aus.
   - Sicherheit: jede Ansicht läuft in einem abgeschotteten iframe (sandbox="allow-scripts", ohne allow-same-origin → kein Zugriff
     auf App, Konto, Cookies, localStorage). Netzwerk nur https, Skripte nur von jsDelivr/cdnjs (CSP im iframe).
   - Leistung: iframes entstehen erst, wenn der Kasten sichtbar ist (IntersectionObserver), höchstens MAX_LIVE laufen gleichzeitig
     (der am längsten unsichtbare wird angehalten), außerhalb des Bildschirms pausieren Animationen (requestAnimationFrame/Timer im
     iframe werden angehalten), ein Wächter beendet hängende Mini-Apps (kein Herzschlag mehr = Endlosschleife).
   - Design: Grundstile + CSS-Variablen (--bg, --card, --accent …) aus dem Aussehen der App und den Vorgaben des Nutzers
     (Einstellungen → Aussehen → Mini-Apps). Änderungen wirken sofort auch in laufenden Mini-Apps.
   - Mehrere Ansichten (=== Name ===) → Dashboard: Kacheln nebeneinander (Reihenfolge/Breite anpassbar) oder einzeln.
   - Speichern: Knopf im Kasten oder „speichern: ja“ von der KI → Einstellungen → Gespeichert (öffnen, mehrere zusammen, löschen).
   - ```einstellung: die KI stellt etwas an der App ein (Hintergrund, Design der Mini-Apps) → Bestätigung mit „Rückgängig“.
   ===================================================================== */
const CodeBox = (() => {
  const SAVED_KEY = 'codebox.saved.v1', DESIGN_KEY = 'codebox.design.v1', LAYOUT_KEY = 'codebox.layout.v1', SEEN_KEY = 'codebox.seen.v1';
  const MAX_LIVE = 6, MAX_SAVED = 40, MAX_RAW = 150000;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 14) => (window.FadeIcons ? FadeIcons.svg(n, s) : `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`);
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Block lesen ---------- */
  const HEAD = /^\s*(titel|title|hoehe|höhe|height|speichern|save)\s*:\s*(.*?)\s*$/i;
  const SEP = /^\s*={3,}\s*(.+?)\s*={3,}\s*$/;
  function parse(raw) {
    const lines = String(raw || '').replace(/\r/g, '').split('\n');
    const out = { title: '', height: 0, save: false, views: [] };
    let i = 0;
    for (; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const m = lines[i].match(HEAD);
      if (!m) break;
      const k = m[1].toLowerCase(), v = m[2];
      if (k === 'titel' || k === 'title') out.title = v.slice(0, 80);
      else if (k === 'speichern' || k === 'save') out.save = /^(ja|yes|true|1)$/i.test(v);
      else out.height = Math.max(160, Math.min(1200, parseInt(v, 10) || 0)) || 0;
    }
    let cur = null;
    for (; i < lines.length; i++) {
      const m = lines[i].match(SEP);
      if (m) { cur = { name: m[1].slice(0, 40), code: [] }; out.views.push(cur); continue; }
      if (!cur) { if (!lines[i].trim()) continue; cur = { name: '', code: [] }; out.views.push(cur); }
      cur.code.push(lines[i]);
    }
    out.views = out.views.map((v, k) => ({ name: v.name || (out.views.length > 1 ? `Ansicht ${k + 1}` : out.title || 'Mini-App'), code: v.code.join('\n').trim() })).filter((v) => v.code).slice(0, 8);
    if (!out.title) out.title = out.views[0]?.name || 'Mini-App';
    return out;
  }

  /* ---------- Design (Einstellungen → Aussehen → Mini-Apps) ---------- */
  const DEFAULT_DESIGN = { accent: '', corners: 'normal', font: 'inter', surface: 'karte', wish: '' };
  let design = { ...DEFAULT_DESIGN, ...read(DESIGN_KEY, {}) };
  const FONTS = {
    inter: { css: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif", link: 'Inter:wght@400;500;600' },
    mono: { css: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace", link: 'JetBrains+Mono:wght@400;500;600' },
    serif: { css: "'Source Serif 4', 'Iowan Old Style', Georgia, serif", link: 'Source+Serif+4:wght@400;500;600' },
    rund: { css: "'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif", link: 'Nunito:wght@400;500;600' },
  };
  const RADIUS = { eckig: '6px', normal: '10px', rund: '16px' };
  const appAccent = () => { const a = window.Appearance?.get?.().accent; return /^#[0-9a-f]{6}$/i.test(a || '') ? a : '#2f86ff'; };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };
  function themeVars() {
    const acc = /^#[0-9a-f]{6}$/i.test(design.accent || '') ? design.accent : appAccent();
    const mode = window.Appearance?.get?.().mode;
    const bg = design.surface === 'transparent' ? 'transparent' : mode === 'black' ? '#0f0f0f' : '#1a1a1a';
    return `:root{--bg:${bg};--card:rgba(255,255,255,.045);--card-2:rgba(255,255,255,.08);--line:rgba(255,255,255,.09);--text:#f2f2f2;--text-2:#d4d4d4;--muted:#8f8f8f;
--accent:${acc};--accent-soft:${rgba(acc, 0.16)};--good:#4fcf8a;--bad:#f07a6e;--warn:#f0b43a;--radius:${RADIUS[design.corners] || RADIUS.normal};
--font:${(FONTS[design.font] || FONTS.inter).css};--mono:'JetBrains Mono',ui-monospace,Menlo,monospace;color-scheme:dark}`;
  }
  // Grundstile: so sieht eine Mini-App ohne eigene Gestaltung schon aus wie die App
  const BASE_CSS = `*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}
body{margin:0;padding:14px;background:var(--bg);color:var(--text);font:400 14px/1.5 var(--font);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{margin:0 0 .5em;font-weight:600;letter-spacing:-.01em;line-height:1.25}h1{font-size:20px}h2{font-size:16px}h3{font-size:14px}h4{font-size:13px}
p{margin:0 0 .7em}a{color:var(--accent)}small,.muted{color:var(--muted)}hr{border:0;border-top:1px solid var(--line);margin:12px 0}
button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 13px;border:1px solid var(--line);border-radius:calc(var(--radius) - 2px);
background:var(--card);color:var(--text-2);font:500 13px var(--font);cursor:pointer;transition:background .15s,color .15s,border-color .15s;touch-action:manipulation}
button:hover{background:var(--card-2);color:var(--text)}button:disabled{opacity:.45;cursor:default}
button.primary{background:var(--accent);border-color:transparent;color:#fff}button.primary:hover{filter:brightness(1.08);background:var(--accent)}
input,select,textarea{height:32px;padding:0 10px;border:1px solid var(--line);border-radius:calc(var(--radius) - 2px);background:transparent;color:var(--text);font:400 13.5px var(--font);outline:none}
textarea{height:auto;padding:8px 10px;resize:vertical}input:focus,select:focus,textarea:focus{border-color:rgba(255,255,255,.2)}
input[type=range],input[type=checkbox],input[type=radio]{height:auto;padding:0;accent-color:var(--accent)}input[type=color]{width:36px;padding:2px}
select option{background:#1e1e1e;color:var(--text)}label{color:var(--text-2);font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--muted);font-weight:500;font-size:12px}
code,pre{font-family:var(--mono);font-size:12.5px}pre{padding:10px 12px;border-radius:var(--radius);background:var(--card);overflow:auto}
canvas,svg,img,video{display:block;max-width:100%}
.card{padding:14px;border:1px solid var(--line);border-radius:var(--radius);background:var(--card)}.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}.chip{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:500}
.big{font-size:26px;font-weight:600;letter-spacing:-.02em}::selection{background:var(--accent-soft)}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:8px}::-webkit-scrollbar-track{background:transparent}`;
  // Laufzeit im iframe: Höhe melden, Fehler melden, Herzschlag, Pause/Weiter (rAF + Timer), localStorage-Ersatz, Design live tauschen
  const RUNTIME = (id) => `(function(){var ID=${JSON.stringify(id)},P=parent,paused=false,q=[],send=function(m){m.cbx=ID;try{P.postMessage(m,'*')}catch(e){}};
try{window.localStorage.getItem('x')}catch(e){var mem={},S={getItem:function(k){return k in mem?mem[k]:null},setItem:function(k,v){mem[k]=String(v)},removeItem:function(k){delete mem[k]},clear:function(){mem={}},key:function(i){return Object.keys(mem)[i]||null}};Object.defineProperty(S,'length',{get:function(){return Object.keys(mem).length}});try{Object.defineProperty(window,'localStorage',{value:S,configurable:true})}catch(e2){}try{Object.defineProperty(window,'sessionStorage',{value:S,configurable:true})}catch(e3){}}
var rAF=window.requestAnimationFrame.bind(window),sT=window.setTimeout.bind(window),sI=window.setInterval.bind(window);
window.requestAnimationFrame=function(cb){if(paused){q.push(cb);return -1}return rAF(cb)};
window.setInterval=function(fn,ms){var a=[].slice.call(arguments,2);return sI(function(){if(!paused)typeof fn==='function'?fn.apply(null,a):0},ms)};
window.setTimeout=function(fn,ms){var a=[].slice.call(arguments,2);var run=function(){if(paused){sT(run,200);return}typeof fn==='function'?fn.apply(null,a):0};return sT(run,ms)};
window.addEventListener('message',function(e){var d=e.data||{};if(d.cbxCmd==='pause')paused=true;else if(d.cbxCmd==='resume'){paused=false;var l=q;q=[];l.forEach(function(cb){rAF(cb)})}else if(d.cbxCmd==='theme'){var s=document.getElementById('cbx-theme');if(s)s.textContent=d.css}});
var last=0,h=function(){var b=document.body,v=b?Math.ceil(Math.max(b.scrollHeight,b.getBoundingClientRect().height)):0;if(Math.abs(v-last)>2){last=v;send({h:v})}};
window.addEventListener('error',function(e){send({err:String(e.message||'Fehler').slice(0,300),line:e.lineno||0})});
window.addEventListener('unhandledrejection',function(e){send({err:String((e.reason&&e.reason.message)||e.reason||'Fehler').slice(0,300)})});
sI(function(){send({beat:1});h()},1000);
document.addEventListener('DOMContentLoaded',function(){h();try{new ResizeObserver(h).observe(document.body)}catch(e){}});window.addEventListener('load',h);})();`;
  const CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src https://fonts.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com data:; img-src https: data: blob:; media-src https: data: blob:; connect-src https:; worker-src blob:";
  function srcdoc(code, id, extraCss = '') {
    const font = FONTS[design.font] || FONTS.inter;
    const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CSP}">`
      + `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font.link}&display=swap">`
      + `<style id="cbx-theme">${themeVars()}</style><style>${BASE_CSS}${extraCss}</style><script>${RUNTIME(id)}<\/script>`;
    const src = String(code || '');
    if (/<html[\s>]/i.test(src) || /<!doctype/i.test(src)) {
      return /<head[^>]*>/i.test(src) ? src.replace(/<head[^>]*>/i, (m) => `${m}${head}`) : src.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
    }
    return `<!doctype html><html lang="de"><head>${head}</head><body>${src}</body></html>`;
  }

  /* ---------- laufende iframes: anlegen, anhalten, Wächter ---------- */
  const frames = new Map(); // id → { iframe, host, box, seen, beat, visible, view }
  let seq = 0;
  window.addEventListener('message', (e) => {
    const d = e.data; if (!d || typeof d.cbx !== 'string') return;
    const f = frames.get(d.cbx); if (!f || e.source !== f.iframe.contentWindow) return;
    f.beat = Date.now();
    if (d.h && f.auto) {
      // feste Höhe, wenn der Inhalt mit der Fensterhöhe mitwächst (100vh) – sonst Schleife
      f.grows = d.h > (f.lastH || 0) && Math.abs(d.h - (f.setH || 0)) < 6 ? (f.grows || 0) + 1 : 0;
      if (f.grows > 6) { f.auto = false; f.iframe.style.height = '460px'; return; }
      f.setH = Math.max(140, Math.min(f.maxH || 760, d.h)); f.lastH = d.h;
      f.iframe.style.height = `${f.setH}px`;
    }
    if (d.err) f.onError?.(d.err, d.line);
  });
  function start(host, code, opts = {}) {
    stop(host);
    const id = `cbx${++seq}`;
    const iframe = document.createElement('iframe');
    iframe.className = 'cbx-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('allow', 'fullscreen; clipboard-write; accelerometer; gyroscope');
    iframe.title = opts.title || 'Mini-App';
    const fixed = opts.height || /100vh|innerHeight|100dvh|height:\s*100%/.test(code) ? opts.height || 460 : 0;
    if (!opts.fill) iframe.style.height = `${fixed || 220}px`;
    if (opts.fill) iframe.classList.add('fill');
    iframe.srcdoc = srcdoc(code, id);
    host.replaceChildren(iframe);
    const f = { id, iframe, host, beat: Date.now(), seen: Date.now(), visible: true, auto: !fixed && !opts.fill, maxH: opts.maxH || 760, onError: opts.onError };
    frames.set(id, f); host._cbx = id;
    limit();
    return f;
  }
  function stop(host, note) {
    const f = frames.get(host?._cbx); if (!f) return;
    frames.delete(f.id); host._cbx = null;
    f.iframe.remove();
    if (note) host.replaceChildren(note);
  }
  const post = (f, cmd) => { try { f.iframe.contentWindow?.postMessage({ cbxCmd: cmd.cmd || cmd, ...cmd }, '*'); } catch {} };
  // zu viele gleichzeitig → die am längsten unsichtbaren anhalten
  function limit() {
    const live = [...frames.values()];
    if (live.length <= MAX_LIVE) return;
    live.filter((f) => !f.visible).sort((a, b) => a.seen - b.seen).slice(0, live.length - MAX_LIVE).forEach((f) => f.host._sleep?.());
  }
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((list) => list.forEach((en) => {
    const host = en.target, f = frames.get(host._cbx);
    if (en.isIntersecting) { host._wake?.(); if (f) { f.visible = true; f.seen = Date.now(); f.beat = Date.now(); post(f, 'resume'); } }
    else if (f) { f.visible = false; f.seen = Date.now(); post(f, 'pause'); }
  }), { rootMargin: '240px 0px' }) : null;
  // Wächter: sichtbare Mini-App ohne Herzschlag seit 6 s → hängt (Endlosschleife) → beenden
  setInterval(() => {
    if (document.hidden) { frames.forEach((f) => { f.beat = Date.now(); }); return; }
    frames.forEach((f) => {
      if (!f.iframe.isConnected) { f.goneAt ||= Date.now(); if (Date.now() - f.goneAt > 600000) frames.delete(f.id); return; } // anderer Chat-Tab: bleibt gemerkt
      f.goneAt = 0;
      if (f.visible && Date.now() - f.beat > 6000) f.host._hung?.();
    });
  }, 2000);
  document.addEventListener('visibilitychange', () => frames.forEach((f) => post(f, document.hidden || !f.visible ? 'pause' : 'resume')));
  function pushTheme() { const css = themeVars(); frames.forEach((f) => post(f, { cmd: 'theme', css })); }

  /* ---------- Gespeichert ---------- */
  const saved = () => read(SAVED_KEY, []).filter((x) => x && x.id && x.raw);
  const isSaved = (raw) => saved().some((x) => x.h === hash(raw));
  function save(raw, title) {
    if (raw.length > MAX_RAW) return { ok: false, msg: 'Zu groß zum Speichern.' };
    const list = saved(), h = hash(raw);
    // gleicher Titel = neue Fassung derselben Mini-App → ersetzen
    const same = list.findIndex((x) => x.h === h || (title && x.title === title));
    const item = { id: same >= 0 ? list[same].id : `w${Date.now().toString(36)}`, h, title: title || 'Mini-App', raw, at: Date.now() };
    if (same >= 0) list.splice(same, 1);
    list.unshift(item);
    if (!write(SAVED_KEY, list.slice(0, MAX_SAVED))) return { ok: false, msg: 'Speicher ist voll – lösch ältere Mini-Apps.' };
    refreshSettings();
    return { ok: true, item };
  }
  function unsave(id) { write(SAVED_KEY, saved().filter((x) => x.id !== id && x.h !== id)); refreshSettings(); }
  const refreshSettings = () => window.Settings?.redraw?.();

  /* ---------- Dashboard-Anordnung je Mini-App (Reihenfolge, breite Kacheln) ---------- */
  const layoutOf = (h, n) => {
    const all = read(LAYOUT_KEY, {}), l = all[h];
    const order = Array.isArray(l?.order) && l.order.length === n ? l.order : [...Array(n).keys()];
    return { mode: l?.mode === 'single' ? 'single' : 'grid', order, wide: Array.isArray(l?.wide) ? l.wide : [], view: Number(l?.view) || 0 };
  };
  const keepLayout = (h, l) => { const all = read(LAYOUT_KEY, {}); all[h] = l; const keys = Object.keys(all); if (keys.length > 120) delete all[keys[0]]; write(LAYOUT_KEY, all); };

  /* ---------- Kasten ---------- */
  function figure(raw, o = {}) {
    const spec = parse(raw), h = hash(raw);
    const fig = document.createElement('figure');
    fig.className = `cbx${o.full ? ' cbx-full' : ''}`;
    fig.dataset.viz = 'widget'; fig.dataset.raw = raw;
    const multi = spec.views.length > 1;
    const lay = layoutOf(h, spec.views.length);
    let showCode = false;
    const head = document.createElement('div');
    head.className = 'cbx-head';
    const body = document.createElement('div');
    body.className = 'cbx-body';
    fig.append(head, body);
    const btn = (act, ic, label, on) => `<button type="button" class="cbx-ib${on ? ' on' : ''}" data-cbx="${act}" aria-label="${label}">${fi(ic, 14)}</button>`;
    function drawHead() {
      const sv = isSaved(raw);
      head.innerHTML = `<span class="cbx-ic">${fi('codewin', 14)}</span><span class="cbx-title">${esc(spec.title)}</span>`
        + (multi ? `<span class="cbx-n">${spec.views.length} Ansichten</span>` : '') + '<span class="cbx-grow"></span>'
        + (multi && !showCode ? btn('layout', lay.mode === 'grid' ? 'stack' : 'dashboard', lay.mode === 'grid' ? 'Einzeln anzeigen' : 'Alle nebeneinander') : '')
        + btn('code', 'terminal', showCode ? 'Mini-App zeigen' : 'Code anzeigen', showCode)
        + btn('reload', 'refresh', 'Neu starten')
        + btn('save', 'bookmark', sv ? 'Gespeichert – antippen zum Entfernen' : 'Speichern', sv)
        + (o.full ? btn('close', 'x', 'Schließen') : btn('full', 'expand', 'Vollbild'));
    }
    const hosts = [];
    // im Chat erst starten, wenn die Antwort fertig ist (sonst würde jedes neue Textstück das iframe neu einhängen = neu laden)
    let go = !o.defer;
    const arm = (host) => { if (io) io.observe(host); else host._wake(); if (o.full) host._wake(); };
    fig._go = () => { if (go) return; go = true; hosts.forEach(arm); };
    function errorBar(host, msg) {
      let bar = host.parentElement.querySelector(':scope > .cbx-err');
      if (!bar) { bar = document.createElement('div'); bar.className = 'cbx-err'; host.after(bar); }
      bar.innerHTML = `<span class="cbx-err-t">${fi('alert', 12)}<span>${esc(msg)}</span></span><button type="button" data-cbx="fix">Beheben lassen</button><button type="button" data-cbx="errx" aria-label="Ausblenden">${fi('x', 11)}</button>`;
      bar.dataset.msg = msg;
    }
    function mountView(host, v) {
      hosts.push(host);
      host.className = 'cbx-stage';
      host.innerHTML = '<div class="cbx-wait"><span class="cbx-dot"></span></div>';
      const run = () => {
        host.parentElement?.querySelector(':scope > .cbx-err')?.remove();
        start(host, v.code, { title: v.name, height: o.full ? 0 : spec.height, fill: !!o.full, onError: (m, line) => errorBar(host, `${m}${line ? ` (Zeile ${line})` : ''}`) });
      };
      host._wake = () => { if (!host._cbx && !host._paused && !host._dead) run(); };
      host._sleep = () => { stop(host, pausedNote(host, 'Angehalten, damit die App flüssig bleibt')); host._paused = true; };
      host._hung = () => { host._dead = true; stop(host, pausedNote(host, 'Hing fest und wurde beendet (Endlosschleife?)', true)); errorBar(host, 'Die Mini-App hat nicht mehr reagiert.'); };
      host._run = () => { host._paused = false; host._dead = false; run(); };
      if (go) arm(host);
    }
    function pausedNote(host, text, bad) {
      const n = document.createElement('button');
      n.type = 'button'; n.className = `cbx-paused${bad ? ' bad' : ''}`;
      n.innerHTML = `${fi(bad ? 'alert' : 'play', 14)}<span>${esc(text)}</span><b>${bad ? 'Neu starten' : 'Fortsetzen'}</b>`;
      n.addEventListener('click', () => host._run());
      return n;
    }
    function drawBody() {
      hosts.forEach((x) => { stop(x); io?.unobserve(x); }); hosts.length = 0;
      body.replaceChildren();
      if (showCode) {
        const all = spec.views.map((v) => (multi ? `<!-- === ${v.name} === -->\n${v.code}` : v.code)).join('\n\n');
        body.innerHTML = `<div class="cbx-codewrap"><button type="button" class="cbx-copy" data-cbx="copy">${fi('copy', 12)}<span>Kopieren</span></button><pre class="cbx-code"><code>${esc(all)}</code></pre></div>`;
        return;
      }
      if (!multi || lay.mode === 'single') {
        if (multi) {
          const tabs = document.createElement('div');
          tabs.className = 'cbx-tabs';
          tabs.innerHTML = spec.views.map((v, i) => `<button type="button" class="cbx-tab${i === lay.view ? ' on' : ''}" data-cbx-view="${i}">${esc(v.name)}</button>`).join('');
          body.append(tabs);
        }
        const host = document.createElement('div');
        body.append(host);
        mountView(host, spec.views[Math.min(lay.view, spec.views.length - 1)]);
        return;
      }
      const grid = document.createElement('div');
      grid.className = 'cbx-grid';
      lay.order.forEach((vi, pos) => {
        const v = spec.views[vi]; if (!v) return;
        const tile = document.createElement('div');
        tile.className = `cbx-tile${lay.wide.includes(vi) ? ' wide' : ''}`;
        tile.innerHTML = `<div class="cbx-thead"><span>${esc(v.name)}</span><span class="cbx-grow"></span>`
          + (pos ? `<button type="button" class="cbx-tb" data-cbx-move="${pos}" data-dir="-1" aria-label="Nach vorne">${fi('back', 11)}</button>` : '')
          + (pos < lay.order.length - 1 ? `<button type="button" class="cbx-tb" data-cbx-move="${pos}" data-dir="1" aria-label="Nach hinten">${fi('forward', 11)}</button>` : '')
          + `<button type="button" class="cbx-tb" data-cbx-wide="${vi}" aria-label="${lay.wide.includes(vi) ? 'Schmal' : 'Breit'}">${fi(lay.wide.includes(vi) ? 'shrink' : 'expand', 11)}</button></div>`;
        const host = document.createElement('div');
        tile.append(host);
        grid.append(tile);
        mountView(host, v);
      });
      body.append(grid);
    }
    fig.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cbx], [data-cbx-view], [data-cbx-move], [data-cbx-wide]'); if (!b || !fig.contains(b)) return;
      const act = b.dataset.cbx;
      if (b.dataset.cbxView != null) { lay.view = +b.dataset.cbxView; keepLayout(h, lay); drawBody(); return; }
      if (b.dataset.cbxMove != null) { const p = +b.dataset.cbxMove, q = p + +b.dataset.dir; [lay.order[p], lay.order[q]] = [lay.order[q], lay.order[p]]; keepLayout(h, lay); drawBody(); return; }
      if (b.dataset.cbxWide != null) { const vi = +b.dataset.cbxWide; lay.wide = lay.wide.includes(vi) ? lay.wide.filter((x) => x !== vi) : [...lay.wide, vi]; keepLayout(h, lay); drawBody(); return; }
      if (act === 'layout') { lay.mode = lay.mode === 'grid' ? 'single' : 'grid'; keepLayout(h, lay); drawHead(); drawBody(); }
      else if (act === 'code') { showCode = !showCode; drawHead(); drawBody(); }
      else if (act === 'reload') { showCode = false; drawHead(); drawBody(); }
      else if (act === 'save') { if (isSaved(raw)) unsave(h); else { const r = save(raw, spec.title); if (!r.ok) toast(r.msg); else toast('Gespeichert – zu finden unter Einstellungen → Gespeichert'); } drawHead(); }
      else if (act === 'full') openFull([raw]);
      else if (act === 'close') o.onClose?.();
      else if (act === 'copy') { navigator.clipboard?.writeText(spec.views.map((v) => v.code).join('\n\n')).then(() => { b.querySelector('span').textContent = 'Kopiert'; setTimeout(() => { if (b.isConnected) b.querySelector('span').textContent = 'Kopieren'; }, 1400); }).catch(() => {}); }
      else if (act === 'errx') b.closest('.cbx-err')?.remove();
      else if (act === 'fix') { const msg = b.closest('.cbx-err')?.dataset.msg || ''; o.onClose?.(); askChat(`Die Mini-App „${spec.title}“ meldet einen Fehler: ${msg}\nBitte behebe ihn und schreib die Mini-App vollständig neu.`); }
    });
    drawHead(); drawBody();
    fig._stop = () => hosts.forEach((x) => { stop(x); io?.unobserve(x); });
    return fig;
  }
  // Wartekarte, solange die KI noch programmiert (Block noch offen)
  function waiting(raw) {
    const spec = parse(raw);
    const n = String(raw || '').split('\n').length;
    const fig = document.createElement('figure');
    fig.className = 'cbx cbx-writing';
    fig.innerHTML = `<div class="cbx-head"><span class="cbx-ic">${fi('codewin', 14)}</span><span class="cbx-title">${esc(spec.title && spec.title !== 'Mini-App' ? spec.title : 'Mini-App')}</span><span class="cbx-grow"></span><span class="cbx-lines shimmer">Programmieren · <b>${n}</b> Zeilen</span></div><div class="cbx-body"><div class="cbx-wave">${window.illustrationWave ? illustrationWave() : ''}</div></div>`;
    fig.update = (r) => { const b = fig.querySelector('.cbx-lines b'); if (b) b.textContent = String(r || '').split('\n').length; const t = parse(r).title; if (t && t !== 'Mini-App') fig.querySelector('.cbx-title').textContent = t; };
    return fig;
  }

  /* ---------- Vollbild: eine oder mehrere Mini-Apps (gespeicherte zusammen als Dashboard) ---------- */
  let fullEl = null;
  function closeFull() {
    if (!fullEl) return;
    const el = fullEl; fullEl = null;
    el.querySelectorAll('.cbx').forEach((f) => f._stop?.());
    el.classList.remove('in');
    setTimeout(() => el.remove(), reduced() ? 0 : 260);
    document.removeEventListener('keydown', escClose, true);
  }
  const escClose = (e) => { if (e.key === 'Escape' && fullEl && !e.target.closest?.('iframe')) { e.stopPropagation(); closeFull(); } };
  function openFull(raws, picker = false) {
    closeFull();
    const el = document.createElement('div');
    el.className = 'cbx-overlay';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Mini-App');
    const list = saved();
    let chosen = raws.slice(0, 4);
    const draw = () => {
      el.querySelectorAll('.cbx').forEach((f) => f._stop?.());
      const bar = picker ? `<div class="cbx-ov-bar"><span class="cbx-ov-t">Mini-Apps</span><div class="cbx-ov-pills">${list.map((x) => `<button type="button" class="cbx-pill${chosen.includes(x.raw) ? ' on' : ''}" data-pick="${esc(x.id)}">${chosen.includes(x.raw) ? fi('check', 11) : ''}<span>${esc(x.title)}</span></button>`).join('')}</div><span class="cbx-grow"></span><button type="button" class="cbx-ib" data-ov-close aria-label="Schließen">${fi('x', 14)}</button></div>` : '';
      el.innerHTML = `<div class="cbx-ov-in${chosen.length > 1 ? ' many' : ''}">${bar}<div class="cbx-ov-grid n${chosen.length}"></div></div>`;
      const grid = el.querySelector('.cbx-ov-grid');
      if (!chosen.length) grid.innerHTML = '<p class="cbx-ov-empty">Wähle oben eine oder mehrere Mini-Apps.</p>';
      chosen.forEach((r) => grid.append(figure(r, { full: true, onClose: closeFull })));
    };
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-ov-close]')) { closeFull(); return; }
      const p = e.target.closest('[data-pick]');
      if (p) { const x = list.find((y) => y.id === p.dataset.pick); if (!x) return; chosen = chosen.includes(x.raw) ? chosen.filter((r) => r !== x.raw) : [...chosen, x.raw].slice(-4); draw(); }
    });
    document.body.append(el);
    fullEl = el; draw();
    requestAnimationFrame(() => el.classList.add('in'));
    document.addEventListener('keydown', escClose, true);
  }

  /* ---------- kleine Helfer ---------- */
  function toast(text) {
    const t = document.createElement('div');
    t.className = 'cbx-toast'; t.textContent = text;
    document.body.append(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 2600);
  }
  // Nachricht an den Chat schicken (z. B. „Beheben lassen“)
  function askChat(text) {
    const inp = document.getElementById('input'), form = document.getElementById('composer');
    if (!inp || !form) return;
    inp.value = text; inp.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit?.();
  }

  /* ---------- ```einstellung: die KI stellt etwas ein ---------- */
  const BG_NAMES = { aus: 'Aus', punkte: 'Punkte', sterne: 'Sterne', wellen: 'Wellen', linien: 'Linien', raster: 'Raster', regen: 'Regen', nebel: 'Nebel', eigener: 'Eigener' };
  function applySetting(obj, customBg) {
    const before = { design: { ...design }, bg: window.ChatBg?.get?.() };
    const said = [];
    const bgPatch = {};
    if (typeof obj.hintergrund === 'string' && BG_NAMES[obj.hintergrund]) { bgPatch.kind = obj.hintergrund; said.push(`Hintergrund: ${BG_NAMES[obj.hintergrund]}`); }
    if (obj.hintergrund === 'eigener' && customBg) bgPatch.custom = String(customBg).replace(/^\s*(titel|title)\s*:.*\n/i, '');
    if (obj.hintergrund === 'eigener' && !customBg && !window.ChatBg?.get?.().custom) { delete bgPatch.kind; said.pop(); } // kein eigener Code da
    if (Number.isFinite(+obj.staerke) && obj.staerke !== '') { bgPatch.strength = Math.max(0, Math.min(100, +obj.staerke)); said.push(`Stärke ${bgPatch.strength} %`); }
    if (Number.isFinite(+obj.tempo) && obj.tempo !== '') { bgPatch.speed = Math.max(0, Math.min(100, +obj.tempo)); said.push(`Tempo ${bgPatch.speed} %`); }
    if (/^#[0-9a-f]{6}$/i.test(obj.farbe || '')) { bgPatch.color = obj.farbe; said.push('Hintergrundfarbe'); }
    const d = {};
    if (typeof obj.codeAkzent === 'string' && (obj.codeAkzent === '' || /^#[0-9a-f]{6}$/i.test(obj.codeAkzent))) { d.accent = obj.codeAkzent; said.push('Akzent der Mini-Apps'); }
    if (RADIUS[obj.codeEcken]) { d.corners = obj.codeEcken; said.push(`Ecken: ${obj.codeEcken}`); }
    if (FONTS[obj.codeSchrift]) { d.font = obj.codeSchrift; said.push('Schrift der Mini-Apps'); }
    if (['karte', 'transparent'].includes(obj.codeFlaeche)) { d.surface = obj.codeFlaeche; said.push('Fläche der Mini-Apps'); }
    if (typeof obj.codeWunsch === 'string') { d.wish = obj.codeWunsch.slice(0, 600); said.push(d.wish ? 'Stilwunsch gemerkt' : 'Stilwunsch gelöscht'); }
    if (Object.keys(bgPatch).length) window.ChatBg?.set?.(bgPatch);
    if (Object.keys(d).length) setDesign(d);
    return { said, undo: () => { if (before.bg) window.ChatBg?.set?.(before.bg, true); setDesign(before.design, true); } };
  }
  function settingChip(raw, live, customBg) {
    let obj = null;
    try { obj = JSON.parse(String(raw).replace(/[„“]/g, '"')); } catch {}
    const chip = document.createElement('div');
    chip.className = 'cbx-set';
    if (!obj || typeof obj !== 'object') { chip.remove(); return null; }
    if (!live) {
      chip.innerHTML = `<span class="cbx-set-ic">${fi('sliders', 13)}</span><span class="cbx-set-t">Einstellung übernommen</span>`;
      return chip;
    }
    const r = applySetting(obj, customBg);
    chip.innerHTML = `<span class="cbx-set-ic ok">${fi('check', 12)}</span><span class="cbx-set-t">Eingestellt<span class="cbx-set-s">${esc(r.said.join(' · ') || 'nichts geändert')}</span></span><span class="cbx-grow"></span>`
      + `<button type="button" class="cbx-set-b" data-undo>Rückgängig</button><button type="button" class="cbx-set-b" data-open>Einstellungen</button>`;
    chip.addEventListener('click', (e) => {
      if (e.target.closest('[data-undo]')) { r.undo(); chip.querySelector('.cbx-set-t').firstChild.textContent = 'Rückgängig gemacht'; e.target.closest('[data-undo]').remove(); }
      if (e.target.closest('[data-open]')) window.Settings?.open('look');
    });
    return chip;
  }

  /* ---------- in eine Antwort einsetzen (aus renderMarkdown, app.js) ---------- */
  const seen = new Set(read(SEEN_KEY, [])); // von der KI schon automatisch gespeichert (nach dem Löschen nicht wieder anlegen)
  function render(target, text, opts = {}) {
    if (opts.live) target._cbxLive = true;
    const pres = target.querySelectorAll('pre:has(code.language-widget), pre:has(code.language-hintergrund), pre:has(code.language-einstellung)');
    if (!pres.length) return;
    const closed = (lang) => (String(text).match(new RegExp('```' + lang + '[^\\n]*\\n[\\s\\S]*?\\n```', 'g')) || []).length;
    const keep = (target._cbxKeep ||= new Map());
    const counts = { widget: 0, hintergrund: 0, einstellung: 0 };
    const done = { widget: closed('widget'), hintergrund: closed('hintergrund'), einstellung: closed('einstellung') };
    let lastBg = null;
    pres.forEach((pre) => {
      const code = pre.querySelector('code'), raw = code.textContent;
      const lang = code.classList.contains('language-widget') ? 'widget' : code.classList.contains('language-hintergrund') ? 'hintergrund' : 'einstellung';
      const i = counts[lang]++;
      const finished = !opts.live || i < done[lang];
      const key = `${lang}|${i}`;
      if (lang === 'einstellung') {
        if (!finished) { pre.remove(); return; }
        const k = `${key}|${raw}`;
        if (!keep.has(k)) { const c = settingChip(raw, !!target._cbxLive, lastBg); if (!c) { pre.remove(); return; } keep.set(k, c); }
        pre.replaceWith(keep.get(k));
        return;
      }
      if (!finished) {
        let w = keep.get(`${key}|wait`);
        if (!w) { w = waiting(raw); keep.set(`${key}|wait`, w); }
        w.update(raw); pre.replaceWith(w);
        return;
      }
      const k = `${key}|${raw}`;
      if (!keep.has(k)) {
        if (lang === 'hintergrund') { keep.set(k, window.ChatBg?.figure?.(raw) || document.createElement('span')); }
        else {
          // „speichern: ja“ von der KI: einmal speichern (vor dem Zeichnen, damit das Lesezeichen gleich gefüllt ist)
          const spec = parse(raw), hs = hash(raw);
          if (spec.save && target._cbxLive && !seen.has(hs)) { seen.add(hs); write(SEEN_KEY, [...seen].slice(-200)); const r = save(raw, spec.title); setTimeout(() => toast(r.ok ? `„${spec.title}“ gespeichert` : r.msg), 400); }
          const f = figure(raw, { defer: true });
          if (keep.has(`${key}|wait`)) f.classList.add('cbx-reveal');
          keep.set(k, f);
        }
      }
      if (lang === 'hintergrund') lastBg = raw;
      pre.replaceWith(keep.get(k));
      if (!opts.live) keep.get(k)._go?.(); // Antwort fertig (oder aus dem Verlauf) → jetzt laufen lassen
    });
  }

  /* ---------- Einstellungen: Aussehen → Mini-Apps, Seite „Gespeichert“ ---------- */
  function setDesign(patch, quiet) {
    design = { ...design, ...patch };
    write(DESIGN_KEY, design);
    pushTheme();
    if (!quiet || window.Settings) refreshSettings();
  }
  const seg = (attr, items, on) => `<span class="st-seg" role="radiogroup">${items.map(([l, v]) => `<button type="button" role="radio" aria-checked="${v === on}" class="${v === on ? 'on' : ''}" ${attr}="${v}">${esc(l)}</button>`).join('')}</span>`;
  const ACCENTS = ['', '#2f86ff', '#6aa8ff', '#4fcf8a', '#2dd4bf', '#facc15', '#f0913a', '#f07a6e', '#f472b6'];
  function lookHtml() {
    const own = design.accent && !ACCENTS.includes(design.accent);
    return `<h2>Mini-Apps</h2><div class="st-card cbx-st">
      <div class="st-row"><span class="st-name">Akzentfarbe</span><span class="grow"></span><span class="st-swatches">${ACCENTS.map((c) => `<button type="button" class="st-sw${c === (design.accent || '') ? ' on' : ''}${c ? '' : ' app'}" style="--sw:${c || appAccent()}" data-cbx-acc="${c}" aria-label="${c ? `Akzent ${c}` : 'Wie die App'}">${c ? '' : '<i>App</i>'}</button>`).join('')}<label class="st-sw st-sw-own${own ? ' on' : ''}" style="--sw:${own ? design.accent : 'transparent'}"><input type="color" data-cbx-accin value="${esc(design.accent || appAccent())}" aria-label="Eigene Akzentfarbe" /></label></span></div>
      <div class="st-row"><span class="st-name">Ecken</span><span class="grow"></span>${seg('data-cbx-corners', [['Eckig', 'eckig'], ['Normal', 'normal'], ['Rund', 'rund']], design.corners)}</div>
      <div class="st-row"><span class="st-name">Schrift</span><span class="grow"></span>${seg('data-cbx-font', [['Inter', 'inter'], ['Mono', 'mono'], ['Serif', 'serif'], ['Rund', 'rund']], design.font)}</div>
      <div class="st-row"><span class="st-name">Fläche</span><span class="grow"></span>${seg('data-cbx-surface', [['Karte', 'karte'], ['Durchsichtig', 'transparent']], design.surface)}</div>
      <div class="st-row cbx-st-wish"><span class="st-name">Stilwünsche</span><textarea class="st-field" data-cbx-wish rows="2" maxlength="600" placeholder="z. B. verspielt, Pastellfarben, große Knöpfe – gilt für alle neuen Mini-Apps">${esc(design.wish)}</textarea></div>
      <div class="cbx-st-prev">${previewHtml()}</div>
    </div>`;
  }
  // kleine Vorschau direkt in den Einstellungen (kein iframe, gleiche Variablen)
  function previewHtml() {
    const acc = design.accent || appAccent(), r = RADIUS[design.corners] || RADIUS.normal, font = (FONTS[design.font] || FONTS.inter).css;
    return `<div class="cbx-pv" style="--pv-acc:${acc};--pv-r:${r};--pv-font:${font.replace(/"/g, "'")};${design.surface === 'transparent' ? '--pv-bg:transparent' : ''}">
      <div class="cbx-pv-t">Vorschau</div><div class="cbx-pv-row"><span class="cbx-pv-big">42</span><span class="cbx-pv-chip">+12 %</span></div>
      <div class="cbx-pv-bar"><i style="width:64%"></i></div><div class="cbx-pv-row"><span class="cbx-pv-btn p">Starten</span><span class="cbx-pv-btn">Zurücksetzen</span></div></div>`;
  }
  function savedHtml() {
    const list = saved();
    if (!list.length) return `<h2>Mini-Apps</h2><div class="st-card"><div class="st-row"><span class="st-muted cbx-st-empty">Noch nichts gespeichert. Tippe an einer Mini-App im Chat auf das Lesezeichen oder sag der KI „speicher das“.</span></div></div>`;
    const fmt = (t) => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    return `<h2>Mini-Apps</h2><div class="st-card">${list.map((x) => {
      const sp = parse(x.raw);
      return `<div class="st-row cbx-st-item"><span class="cbx-st-ic">${fi(sp.views.length > 1 ? 'dashboard' : 'codewin', 14)}</span><span class="st-name">${esc(x.title)}</span><span class="st-muted cbx-st-meta">${sp.views.length > 1 ? `${sp.views.length} Ansichten · ` : ''}${fmt(x.at)}</span><span class="grow"></span>`
        + `<button type="button" class="st-btn dark" data-cbx-open="${esc(x.id)}">Öffnen</button><button type="button" class="cbx-st-del${delArm === x.id ? ' sure' : ''}" data-cbx-del="${esc(x.id)}" aria-label="Löschen">${delArm === x.id ? 'Wirklich?' : fi('trash', 13)}</button></div>`;
    }).join('')}</div>${list.length > 1 ? `<div class="cbx-st-foot"><button type="button" class="st-btn dark" data-cbx-dash>${fi('dashboard', 13)}Mehrere zusammen öffnen</button></div>` : ''}`;
  }
  let delArm = null;
  function settingsClick(e, redraw) {
    const t = e.target;
    const acc = t.closest('[data-cbx-acc]'); if (acc) { setDesign({ accent: acc.dataset.cbxAcc }); return true; }
    const c = t.closest('[data-cbx-corners]'); if (c) { setDesign({ corners: c.dataset.cbxCorners }); return true; }
    const f = t.closest('[data-cbx-font]'); if (f) { setDesign({ font: f.dataset.cbxFont }); return true; }
    const s = t.closest('[data-cbx-surface]'); if (s) { setDesign({ surface: s.dataset.cbxSurface }); return true; }
    const op = t.closest('[data-cbx-open]'); if (op) { const x = saved().find((y) => y.id === op.dataset.cbxOpen); if (x) openFull([x.raw], true); return true; }
    const del = t.closest('[data-cbx-del]');
    if (del) { const id = del.dataset.cbxDel; if (delArm !== id) { delArm = id; redraw(); setTimeout(() => { if (delArm === id) { delArm = null; redraw(); } }, 3000); } else { delArm = null; unsave(id); } return true; }
    if (t.closest('[data-cbx-dash]')) { openFull(saved().slice(0, 2).map((x) => x.raw), true); return true; }
    return false;
  }
  function settingsInput(e) {
    if (e.target.matches('[data-cbx-accin]')) { design.accent = e.target.value; write(DESIGN_KEY, design); pushTheme(); const pv = document.querySelector('.cbx-st-prev'); if (pv) pv.innerHTML = previewHtml(); return true; }
    return false;
  }
  function settingsChange(e) {
    if (e.target.matches('[data-cbx-wish]')) { setDesign({ wish: e.target.value.trim().slice(0, 600) }); return true; }
    if (e.target.matches('[data-cbx-accin]')) { setDesign({ accent: e.target.value }); return true; }
    return false;
  }
  (window.SettingsHooks ||= []).push(
    { page: 'look', order: 2, html: lookHtml, click: settingsClick, input: settingsInput, change: settingsChange },
    { page: 'saved', order: 1, html: savedHtml, click: settingsClick },
  );
  // Aussehen der App geändert (Akzent, Modus) → laufende Mini-Apps übernehmen es
  const ap = window.Appearance;
  if (ap?.set && !ap._cbx) { const set0 = ap.set; ap.set = (p) => { set0(p); pushTheme(); }; ap._cbx = true; }

  // Design-Vorgaben gehen mit jeder Chat-Anfrage an den Server (Prompt „Stilwünsche“)
  const look = () => ({ accent: design.accent, corners: design.corners, font: design.font, surface: design.surface, wish: design.wish });

  return { parse, figure, render, save, saved, unsave, openFull, closeFull, look, design: () => ({ ...design }), setDesign, srcdoc, start, stop, toast, applySetting };
})();
window.CodeBox = CodeBox;
