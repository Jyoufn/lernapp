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
    void mode; const bg = 'transparent'; // die Fläche liefert der Kasten der App (gleiche Farbe wie die anderen Kästen)
    const n = parseInt(acc.slice(1), 16), mix = (c) => Math.round(c + (255 - c) * 0.3); // heller Text-Akzent wie #6aa8ff zu #2f86ff
    const accText = `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`;
    return `:root{--bg:${bg};--card:rgba(255,255,255,.035);--card-2:rgba(255,255,255,.07);--hover:rgba(255,255,255,.05);--field:rgba(255,255,255,.02);
--line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.16);--text:#f2f2f2;--text-2:#e6e6e6;--muted:#a3a3a3;--dim:#6e6e6e;
--accent:${acc};--accent-text:${accText};--accent-soft:${rgba(acc, 0.16)};--good:#4fcf8a;--bad:#f07a6e;--bad-soft:rgba(239,107,95,.13);--warn:#f0913a;
--radius:${RADIUS[design.corners] || RADIUS.normal};--spring:cubic-bezier(.16,1,.3,1);
--font:${(FONTS[design.font] || FONTS.inter).css};--mono:'JetBrains Mono',ui-monospace,Menlo,monospace;color-scheme:dark}`;
  }
  // Grundstile = Design-System der App (kb/design.md): so sieht eine Mini-App ohne eigene Gestaltung schon aus wie die App
  const BASE_CSS = `*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent;height:100%}
body{margin:0;min-height:100%;padding:16px;background:var(--bg);color:var(--text);font:400 13.5px/1.5 var(--font);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{margin:0 0 .5em;font-weight:600;letter-spacing:-.01em;line-height:1.25;color:var(--text)}h1{font-size:18px}h2{font-size:15px}h3{font-size:14px}h4{font-size:13px}
p{margin:0 0 .7em;color:var(--text-2)}a{color:var(--accent-text);text-decoration:none}small,.muted{color:var(--muted)}.dim{color:var(--dim)}hr{border:0;border-top:1px solid var(--line);margin:12px 0}
b,strong{font-weight:600}
button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--line);border-radius:8px;
background:transparent;color:var(--text-2);font:500 12.5px var(--font);cursor:pointer;transition:background .14s,color .14s,border-color .14s;touch-action:manipulation;user-select:none;-webkit-user-select:none}
button:hover{background:var(--hover);color:var(--text)}button:disabled{opacity:.4;cursor:default}button:focus-visible{outline:none;border-color:var(--line-2)}
button.primary{background:var(--accent);border-color:transparent;color:#fff}button.primary:hover{filter:brightness(1.07);background:var(--accent)}
button.ghost{border-color:transparent}button.icon{width:30px;padding:0}button.danger{color:var(--bad);background:var(--bad-soft);border-color:transparent}
button.big{height:38px;padding:0 18px;font-size:13.5px;border-radius:10px}
input,select,textarea{height:30px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--text);font:400 13px var(--font);outline:none}
textarea{height:auto;padding:8px 10px;resize:vertical}input:focus,select:focus,textarea:focus{border-color:var(--line-2)}input::placeholder,textarea::placeholder{color:var(--dim)}
input[type=range],input[type=checkbox],input[type=radio]{height:auto;padding:0;accent-color:var(--accent)}input[type=color]{width:34px;padding:2px}
select option{background:#202020;color:var(--text)}label{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--muted);font-weight:500;font-size:11.5px}
tr:last-child td{border-bottom:0}
code,pre{font-family:var(--mono);font-size:12.5px}pre{padding:10px 12px;border-radius:10px;background:var(--card);overflow:auto}
canvas,svg,img,video{display:block;max-width:100%}img{border-radius:10px}
.app{display:flex;flex-direction:column;gap:12px;min-height:calc(100vh - 32px)}.fill{flex:1;min-height:0}.center{display:grid;place-items:center}
.card{padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}.card-2{background:var(--card-2)}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.col{display:flex;flex-direction:column;gap:8px}.between{justify-content:space-between}.grow{flex:1}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.title{display:flex;align-items:center;gap:8px;color:var(--text);font-size:15px;font-weight:600}.title .ic{color:var(--muted)}
.label{color:var(--muted);font-size:11.5px;font-weight:500}.big{font-size:26px;font-weight:600;letter-spacing:-.02em;color:var(--text)}.huge{font-size:40px;font-weight:600;letter-spacing:-.03em}
.stat{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card)}.stat .v{font-size:19px;font-weight:600;color:var(--text)}.stat .k{font-size:11.5px;color:var(--muted)}
.chip,.tag{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:6px;background:color-mix(in srgb,var(--c,var(--accent)) 13%,transparent);color:color-mix(in srgb,var(--c,var(--accent)) 72%,#fff);font-size:11.5px;font-weight:500}
.seg{display:inline-flex;padding:2px;border:1px solid var(--line);border-radius:10px}.seg button{height:26px;border:1px solid transparent;border-radius:8px;color:var(--muted)}.seg button.on{border-color:var(--line-2);color:var(--text);background:transparent}
.list{display:flex;flex-direction:column}.item{display:flex;align-items:center;gap:10px;min-height:40px;padding:6px 4px;border-bottom:1px solid var(--line)}.item:last-child{border-bottom:0}
.progress{height:6px;overflow:hidden;border-radius:6px;background:var(--card-2)}.progress>i{display:block;height:100%;border-radius:inherit;background:var(--accent);transition:width .4s var(--spring)}
.switch{position:relative;width:34px;height:20px;border-radius:10px;background:var(--card-2);border:0;padding:0;flex:none}.switch::after{content:'';position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s var(--spring)}.switch.on{background:var(--accent)}.switch.on::after{transform:translateX(14px)}
.ic{width:16px;height:16px;flex:none;fill:currentColor}.ic.s{width:13px;height:13px}.ic.l{width:20px;height:20px}
.empty{display:grid;place-items:center;gap:6px;padding:28px;color:var(--dim);font-size:12.5px;text-align:center}
.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}.accent{color:var(--accent-text)}
.fade-in{animation:cbx-fade .4s var(--spring) both}@keyframes cbx-fade{from{opacity:0;transform:translateY(6px)}}
::selection{background:var(--accent-soft)}::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:8px}::-webkit-scrollbar-track{background:transparent}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}`;
  // Laufzeit im iframe: Fehler melden, Herzschlag, Pause/Weiter (rAF + Timer), localStorage-Ersatz, Design live tauschen,
  // Icons (<i data-icon="name">) und Bilder (<img data-bild="Beschreibung" data-suche="english words">) über die App
  const RUNTIME = (id) => `(function(){var ID=${JSON.stringify(id)},P=parent,paused=false,q=[],send=function(m){m.cbx=ID;try{P.postMessage(m,'*')}catch(e){}};
try{window.localStorage.getItem('x')}catch(e){var mem={},S={getItem:function(k){return k in mem?mem[k]:null},setItem:function(k,v){mem[k]=String(v)},removeItem:function(k){delete mem[k]},clear:function(){mem={}},key:function(i){return Object.keys(mem)[i]||null}};Object.defineProperty(S,'length',{get:function(){return Object.keys(mem).length}});try{Object.defineProperty(window,'localStorage',{value:S,configurable:true})}catch(e2){}try{Object.defineProperty(window,'sessionStorage',{value:S,configurable:true})}catch(e3){}}
var rAF=window.requestAnimationFrame.bind(window),sT=window.setTimeout.bind(window),sI=window.setInterval.bind(window);
window.requestAnimationFrame=function(cb){if(paused){q.push(cb);return -1}return rAF(cb)};
window.setInterval=function(fn,ms){var a=[].slice.call(arguments,2);return sI(function(){if(!paused){typeof fn==='function'?fn.apply(null,a):(0,eval)(fn)}},ms)};
window.setTimeout=function(fn,ms){var a=[].slice.call(arguments,2);var run=function(){if(paused){sT(run,200);return}typeof fn==='function'?fn.apply(null,a):(0,eval)(fn)};return sT(run,ms)};
var imgs={},n=0;
function icons(root){(root||document).querySelectorAll('i[data-icon]').forEach(function(el){var nm=el.getAttribute('data-icon'),s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('class','ic'+(el.className?' '+el.className:''));s.setAttribute('aria-hidden','true');var u=document.createElementNS('http://www.w3.org/2000/svg','use');u.setAttribute('href','#f-'+nm);s.appendChild(u);el.replaceWith(s)})}
function pics(root){(root||document).querySelectorAll('img[data-bild]:not([data-cbx])').forEach(function(el){var k='i'+(++n);el.setAttribute('data-cbx',k);imgs[k]=el;if(!el.getAttribute('src'))el.style.background='rgba(255,255,255,.05)';send({img:{k:k,desc:el.getAttribute('data-bild'),q:el.getAttribute('data-suche')||''}})})}
window.CBX={icon:function(name,cls){return '<svg class="ic'+(cls?' '+cls:'')+'" aria-hidden="true"><use href="#f-'+name+'"/></svg>'},refresh:function(r){icons(r);pics(r)}};
window.addEventListener('message',function(e){var d=e.data||{};if(d.cbxCmd==='pause')paused=true;else if(d.cbxCmd==='resume'){paused=false;var l=q;q=[];l.forEach(function(cb){rAF(cb)})}else if(d.cbxCmd==='theme'){var s=document.getElementById('cbx-theme');if(s)s.textContent=d.css}else if(d.cbxCmd==='img'&&imgs[d.k]){if(d.url)imgs[d.k].src=d.url;imgs[d.k].style.background=''}else if(d.cbxCmd==='shot'){var url='';try{var cs=[].slice.call(document.querySelectorAll('canvas')).sort(function(a,b){return b.width*b.height-a.width*a.height})[0];if(cs&&cs.width){if(cs.width<=480)url=cs.toDataURL('image/png');else{var k=320/cs.width,c=document.createElement('canvas');c.width=320;c.height=Math.max(1,Math.round(cs.height*k));var g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(cs,0,0,c.width,c.height);url=c.toDataURL('image/png')}}}catch(e){}send({shot:url})}});
var errs=0;window.addEventListener('error',function(e){if(e.target&&e.target!==window&&e.target.tagName==='SCRIPT'){send({err:'Skript konnte nicht geladen werden: '+(e.target.src||'')});return}if(++errs>5)return;send({err:String(e.message||'Fehler').slice(0,400),line:e.lineno||0,stack:String(e.error&&e.error.stack||'').slice(0,600)})},true);
window.addEventListener('unhandledrejection',function(e){if(++errs>5)return;send({err:String((e.reason&&e.reason.message)||e.reason||'Fehler').slice(0,400)})});
sI(function(){send({beat:1})},1000);
document.addEventListener('DOMContentLoaded',function(){icons();pics();try{new MutationObserver(function(){icons();pics()}).observe(document.body,{childList:true,subtree:true})}catch(e){}});})();`;
  const CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src https://fonts.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com data:; img-src https: data: blob:; media-src https: data: blob:; connect-src https:; worker-src blob:";
  // Icons der App (gefüllt, #f-…) – einmal aus der Seite gelesen, in jede Mini-App eingebettet
  let spriteHtml = null;
  const sprite = () => {
    if (spriteHtml != null) return spriteHtml;
    const sym = document.querySelector('symbol[id^="f-"]');
    spriteHtml = sym?.parentElement ? `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${[...sym.parentElement.querySelectorAll('symbol[id^="f-"]')].map((x) => x.outerHTML).join('')}</svg>` : '';
    return spriteHtml;
  };
  function srcdoc(code, id, extraCss = '', extraJs = '') {
    const font = FONTS[design.font] || FONTS.inter;
    const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CSP}">`
      + `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font.link}&display=swap">`
      + `<style id="cbx-theme">${themeVars()}</style><style>${BASE_CSS}${extraCss}</style><script>${RUNTIME(id)}<\/script>${extraJs ? `<script>${extraJs}<\/script>` : ''}`;
    // externe Skripte mit crossorigin laden → echte Fehlermeldungen statt „Script error.“
    const src = String(code || '').replace(/<script(?![^>]*\bcrossorigin\b)([^>]*\bsrc=["']https:)/gi, '<script crossorigin="anonymous"$1');
    const icons = sprite();
    if (/<html[\s>]/i.test(src) || /<!doctype/i.test(src)) {
      const withHead = /<head[^>]*>/i.test(src) ? src.replace(/<head[^>]*>/i, (m) => `${m}${head}`) : src.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
      return /<body[^>]*>/i.test(withHead) ? withHead.replace(/<body[^>]*>/i, (m) => `${m}${icons}`) : withHead;
    }
    return `<!doctype html><html lang="de"><head>${head}</head><body>${icons}${src}</body></html>`;
  }

  /* ---------- laufende iframes: anlegen, anhalten, Wächter ---------- */
  const frames = new Map(); // id → { iframe, host, box, seen, beat, visible, view }
  let seq = 0;
  // Bilder für Mini-Apps (<img data-bild="…">): dieselbe Bild-Suche wie im Chat (passendes freies Foto, sonst KI-Bild) – je Beschreibung einmal
  const imgCache = new Map();
  const imageFor = (desc, q) => {
    const k = `${desc}|${q}`;
    if (!imgCache.has(k)) imgCache.set(k, fetch('/api/illustration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: `Bild für eine Mini-App: ${desc}`, query: q || desc, source: 'web' }) })
      .then((r) => r.json()).then((j) => j.url || (j.data ? `data:${j.mime};base64,${j.data}` : '')).catch(() => ''));
    return imgCache.get(k);
  };
  window.addEventListener('message', (e) => {
    const d = e.data; if (!d || typeof d.cbx !== 'string') return;
    const f = frames.get(d.cbx); if (!f || e.source !== f.iframe.contentWindow) return;
    f.beat = Date.now();
    if (d.img && d.img.desc) imageFor(String(d.img.desc).slice(0, 300), String(d.img.q || '').slice(0, 90)).then((url) => post(f, { cmd: 'img', k: d.img.k, url }));
    if (d.err) f.onError?.(d.err, d.line, d.stack);
    if (typeof d.shot === 'string') { const cb = f.onShot; f.onShot = null; cb?.(d.shot); }
  });
  // Momentaufnahme der Leinwand (Vorschau eines Hintergrunds): cb(dataUrl | '')
  function shot(host, cb) { const f = frames.get(host?._cbx); if (!f) { cb(''); return; } f.onShot = cb; post(f, { cmd: 'shot' }); setTimeout(() => { if (f.onShot === cb) { f.onShot = null; cb(''); } }, 2500); }
  // Hintergründe: Leinwand füllt immer die ganze Fläche, pixelig (nie weichgezeichnet), kein Rand/Abstand
  const BG_CSS = 'html,body{margin:0!important;padding:0!important;height:100%;overflow:hidden;background:#000}canvas{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;object-fit:cover;image-rendering:pixelated;image-rendering:crisp-edges}';
  function start(host, code, opts = {}) {
    stop(host);
    const id = `cbx${++seq}`;
    const iframe = document.createElement('iframe');
    iframe.className = 'cbx-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('allow', 'fullscreen; clipboard-write; accelerometer; gyroscope');
    iframe.title = opts.title || 'Mini-App';
    iframe.srcdoc = opts.bg ? srcdoc(code, id, BG_CSS, window.PixelKit || '') : srcdoc(code, id);
    host.replaceChildren(iframe);
    const f = { id, iframe, host, beat: Date.now(), seen: Date.now(), visible: true, onError: opts.onError };
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

  /* ---------- Breite im Chat: bis 980 px, auch wenn die Textspalte schmaler ist ---------- */
  const scroller = document.getElementById('chatScroll'), chatEl = document.getElementById('chat');
  if (scroller && chatEl && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => chatEl.style.setProperty('--cbx-w', `${Math.max(280, Math.min(980, scroller.clientWidth - 48))}px`)).observe(scroller);

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

  /* ---------- Kasten: nur der programmierte Inhalt, groß; unten eine schmale Leiste mit Icons ----------
     o.full: im Vollbild · o.defer: erst starten, wenn die Antwort fertig ist · o.live: in dieser Sitzung entstanden (dann repariert die App Fehler selbst)
     o.onReplace(newRaw): repariert → im Verlauf an derselben Stelle ersetzen */
  const AUTO_FIX = 2; // so oft repariert die App eine frisch geschriebene Mini-App von selbst
  function figure(raw0, o = {}) {
    let raw = raw0, spec = parse(raw), h = hash(raw);
    const fig = document.createElement('figure');
    fig.className = `cbx${o.full ? ' cbx-full' : ''}${design.surface === 'transparent' ? ' clear' : ''}`;
    fig.dataset.viz = 'widget'; fig.dataset.raw = raw;
    let lay = layoutOf(h, spec.views.length), showCode = false, fixing = false, fixes = 0, errMsg = '';
    const multi = () => spec.views.length > 1;
    const body = document.createElement('div'); body.className = 'cbx-body';
    const bar = document.createElement('div'); bar.className = 'cbx-bar';
    fig.append(body, bar);
    if (spec.height) fig.style.setProperty('--cbx-h', `${spec.height}px`);
    const btn = (act, ic, label, on) => `<button type="button" class="cbx-ib${on ? ' on' : ''}" data-cbx="${act}" aria-label="${label}">${fi(ic, 14)}</button>`;
    function drawBar() {
      const sv = isSaved(raw);
      const left = fixing ? `<span class="cbx-status shimmer">${fi('refresh', 12)}Fehler gefunden – wird behoben</span>`
        : errMsg ? `<span class="cbx-status bad">${fi('alert', 12)}<span>${esc(errMsg)}</span></span><button type="button" class="cbx-fixbtn" data-cbx="fix">Beheben</button>`
        : multi() && !showCode ? `<span class="cbx-views">${['Alle', ...spec.views.map((v) => v.name)].map((n, k) => `<button type="button" class="${(k === 0 ? lay.mode === 'grid' : lay.mode === 'single' && lay.view === k - 1) ? 'on' : ''}" data-cbx-view="${k - 1}">${esc(n)}</button>`).join('')}</span>` : '';
      bar.innerHTML = `<span class="cbx-bar-l">${left}</span><span class="cbx-grow"></span>`
        + btn('code', 'terminal', showCode ? 'Mini-App zeigen' : 'Code anzeigen', showCode)
        + btn('reload', 'refresh', 'Neu starten')
        + btn('save', 'bookmark', sv ? 'Gespeichert – antippen zum Entfernen' : 'Speichern', sv)
        + (o.full ? btn('close', 'shrink', 'Vollbild verlassen') : btn('full', 'expand', 'Vollbild'));
    }
    const hosts = [];
    let go = !o.defer;
    const arm = (host) => { if (io) io.observe(host); else host._wake(); if (o.full) host._wake(); };
    fig._go = () => { if (go) return; go = true; hosts.forEach(arm); };
    function onError(m, line) {
      if (fixing) return;
      errMsg = `${m}${line ? ` (Zeile ${line})` : ''}`.slice(0, 300);
      // frisch geschrieben → selbst reparieren (an derselben Stelle, keine neue Nachricht); sonst Knopf „Beheben“
      if (o.live && fixes < AUTO_FIX) { repair(); return; }
      drawBar();
    }
    async function repair() {
      if (fixing) return;
      fixing = true; fixes++; drawBar();
      fig.classList.add('fixing');
      const err = errMsg; errMsg = '';
      try {
        const r = await fetch('/api/widget-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw, error: err, look: look() }) });
        const j = await r.json();
        if (!r.ok || !j.raw) throw new Error(j.error || 'Reparatur fehlgeschlagen');
        const old = raw;
        raw = j.raw; spec = parse(raw); h = hash(raw); fig.dataset.raw = raw;
        lay = layoutOf(h, spec.views.length);
        if (spec.height) fig.style.setProperty('--cbx-h', `${spec.height}px`);
        o.onReplace?.(old, raw);
        fixing = false; fig.classList.remove('fixing');
        drawBar(); drawBody();
      } catch (e) {
        fixing = false; fig.classList.remove('fixing');
        errMsg = `${err} – ${e.message}`.slice(0, 300); drawBar();
      }
    }
    function mountView(host, v) {
      hosts.push(host);
      host.className = 'cbx-stage';
      host.innerHTML = '<div class="cbx-wait"><span class="cbx-dot"></span></div>';
      const run = () => start(host, v.code, { title: v.name, fill: true, onError });
      host._wake = () => { if (!host._cbx && !host._paused && !host._dead) run(); };
      host._sleep = () => { stop(host, pausedNote(host, 'Angehalten, damit die App flüssig bleibt')); host._paused = true; };
      host._hung = () => { host._dead = true; stop(host, pausedNote(host, 'Hing fest und wurde beendet', true)); onError('Die Mini-App hat nicht mehr reagiert (Endlosschleife?).'); };
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
        const all = spec.views.map((v) => (multi() ? `<!-- === ${v.name} === -->\n${v.code}` : v.code)).join('\n\n');
        body.innerHTML = `<div class="cbx-codewrap"><button type="button" class="cbx-copy" data-cbx="copy">${fi('copy', 12)}<span>Kopieren</span></button><pre class="cbx-code"><code>${esc(all)}</code></pre></div>`;
        return;
      }
      if (!multi() || lay.mode === 'single') {
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
      if (b.dataset.cbxView != null) { const k = +b.dataset.cbxView; if (k < 0) lay.mode = 'grid'; else { lay.mode = 'single'; lay.view = k; } keepLayout(h, lay); drawBar(); drawBody(); return; }
      if (b.dataset.cbxMove != null) { const p = +b.dataset.cbxMove, q = p + +b.dataset.dir; [lay.order[p], lay.order[q]] = [lay.order[q], lay.order[p]]; keepLayout(h, lay); drawBody(); return; }
      if (b.dataset.cbxWide != null) { const vi = +b.dataset.cbxWide; lay.wide = lay.wide.includes(vi) ? lay.wide.filter((x) => x !== vi) : [...lay.wide, vi]; keepLayout(h, lay); drawBody(); return; }
      if (act === 'code') { showCode = !showCode; drawBar(); drawBody(); }
      else if (act === 'reload') { showCode = false; errMsg = ''; drawBar(); drawBody(); }
      else if (act === 'save') { if (isSaved(raw)) unsave(h); else { const r = save(raw, spec.title); toast(r.ok ? 'Gespeichert – zu finden unter Einstellungen → Gespeichert' : r.msg); } drawBar(); }
      else if (act === 'full') openFull([raw], false, (old, nu) => { o.onReplace?.(old, nu); raw = nu; spec = parse(raw); h = hash(raw); fig.dataset.raw = raw; drawBar(); drawBody(); });
      else if (act === 'close') o.onClose?.();
      else if (act === 'copy') { navigator.clipboard?.writeText(spec.views.map((v) => v.code).join('\n\n')).then(() => { b.querySelector('span').textContent = 'Kopiert'; setTimeout(() => { if (b.isConnected) b.querySelector('span').textContent = 'Kopieren'; }, 1400); }).catch(() => {}); }
      else if (act === 'fix') repair(); // „Beheben“: an derselben Stelle, keine neue Nachricht
    });
    drawBar(); drawBody();
    fig._stop = () => hosts.forEach((x) => { stop(x); io?.unobserve(x); });
    return fig;
  }
  // Warten, solange die KI noch programmiert: derselbe große Kasten mit der Kachel-Welle, unten „Programmieren · N Zeilen“
  function waiting(raw) {
    const fig = document.createElement('figure');
    fig.className = 'cbx cbx-writing';
    fig.innerHTML = `<div class="cbx-body"><div class="cbx-stage cbx-wave">${window.illustrationWave ? illustrationWave() : ''}</div></div><div class="cbx-bar"><span class="cbx-bar-l"><span class="cbx-status shimmer">${fi('codewin', 12)}Programmieren · <b>0</b> Zeilen</span></span></div>`;
    fig.update = (r) => { const b = fig.querySelector('.cbx-status b'); if (b) b.textContent = String(r || '').split('\n').length; };
    fig.update(raw);
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
  function openFull(raws, picker = false, onReplace = null) {
    closeFull();
    const el = document.createElement('div');
    el.className = 'cbx-overlay';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Mini-App');
    const list = saved();
    let chosen = raws.slice(0, 4);
    const draw = () => {
      el.querySelectorAll('.cbx').forEach((f) => f._stop?.());
      const bar = picker && list.length > 1 ? `<div class="cbx-ov-bar"><span class="cbx-ov-t">Mini-Apps</span><div class="cbx-ov-pills">${list.map((x) => `<button type="button" class="cbx-pill${chosen.includes(x.raw) ? ' on' : ''}" data-pick="${esc(x.id)}">${chosen.includes(x.raw) ? fi('check', 11) : ''}<span>${esc(x.title)}</span></button>`).join('')}</div><span class="cbx-grow"></span><button type="button" class="cbx-ib" data-ov-close aria-label="Schließen">${fi('x', 14)}</button></div>` : '';
      el.innerHTML = `<div class="cbx-ov-in${chosen.length > 1 ? ' many' : ''}">${bar}<div class="cbx-ov-grid n${chosen.length}"></div></div>`;
      const grid = el.querySelector('.cbx-ov-grid');
      if (!chosen.length) grid.innerHTML = '<p class="cbx-ov-empty">Wähle oben eine oder mehrere Mini-Apps.</p>';
      chosen.forEach((r) => grid.append(figure(r, { full: true, onClose: closeFull, onReplace })));
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
  /* ---------- ```einstellung: die KI stellt etwas ein ---------- */
  function applySetting(obj, customBg) {
    const before = { design: { ...design }, bg: window.ChatBg?.get?.() };
    const said = [];
    const B = window.ChatBg;
    if (B) {
      const h = String(obj.hintergrund || '').toLowerCase();
      if (h === 'eigener' && customBg) { B.useCode(customBg); said.push('Eigener Hintergrund gespeichert und aktiv'); }
      else if (h === 'aus' || h === 'standard') { B.set({ active: '' }); said.push('Hintergrund: Standard'); }
      if (Number.isFinite(+obj.staerke) && obj.staerke !== '' && obj.staerke != null) { B.set({ strength: Math.max(10, Math.min(100, +obj.staerke)) }); said.push(`Deckkraft ${Math.round(+obj.staerke)} %`); }
    }
    const d = {};
    if (typeof obj.codeAkzent === 'string' && (obj.codeAkzent === '' || /^#[0-9a-f]{6}$/i.test(obj.codeAkzent))) { d.accent = obj.codeAkzent; said.push('Akzent der Mini-Apps'); }
    if (RADIUS[obj.codeEcken]) { d.corners = obj.codeEcken; said.push(`Ecken: ${obj.codeEcken}`); }
    if (FONTS[obj.codeSchrift]) { d.font = obj.codeSchrift; said.push('Schrift der Mini-Apps'); }
    if (['karte', 'transparent'].includes(obj.codeFlaeche)) { d.surface = obj.codeFlaeche; said.push('Fläche der Mini-Apps'); }
    if (typeof obj.codeWunsch === 'string') { d.wish = obj.codeWunsch.slice(0, 600); said.push(d.wish ? 'Stilwunsch gemerkt' : 'Stilwunsch gelöscht'); }
    if (Object.keys(d).length) setDesign(d);
    return { said, undo: () => { if (before.bg) window.ChatBg?.set?.({ active: before.bg.active, strength: before.bg.strength }); setDesign(before.design, true); } };
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

  /* ---------- ```termin / ```aufgabe: die KI trägt einen Kalendertermin bzw. eine Aufgabe ein (Wunsch 10.11.) ----------
     Gleiches Kärtchen wie bei ```einstellung: Bestätigung mit „Rückgängig“ und einem Knopf zum Kalender bzw. zu den Aufgaben.
     Eingetragen wird nur einmal – beim Schreiben der Antwort (live); im Verlauf steht nur noch der Hinweis. */
  function planChip(lang, raw, live) {
    let o = null;
    try { o = JSON.parse(String(raw).replace(/[„“]/g, '"')); } catch {}
    if (!o || typeof o !== 'object') return null;
    if (lang !== 'termin') return null; // ```aufgabe aus älteren Chats: Aufgaben gibt es nicht mehr → Block verschwindet
    const isEvent = true;
    const title = String(o.titel || o.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!title) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(o.datum || o.date || '')) ? String(o.datum || o.date) : '';
    const time = /^\d{1,2}:\d{2}$/.test(String(o.zeit || o.time || '')) ? String(o.zeit || o.time).padStart(5, '0') : '';
    const when = date ? new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
    const sub = [title, when, isEvent && time ? `${time} Uhr` : ''].filter(Boolean).join(' · ');
    const chip = document.createElement('div');
    chip.className = 'cbx-set';
    if (!live) {
      chip.innerHTML = `<span class="cbx-set-ic">${fi(isEvent ? 'calendar' : 'tasks', 13)}</span><span class="cbx-set-t">${isEvent ? 'Termin eingetragen' : 'Aufgabe angelegt'}<span class="cbx-set-s">${esc(sub)}</span></span>`;
      return chip;
    }
    let made = null;
    try {
      made = window.Calendar?.add({ title, date, time, description: String(o.beschreibung || o.description || '') });
    } catch {}
    if (!made) { chip.innerHTML = `<span class="cbx-set-ic">${fi('alert', 13)}</span><span class="cbx-set-t">${isEvent ? 'Termin' : 'Aufgabe'} konnte nicht eingetragen werden<span class="cbx-set-s">${esc(sub)}</span></span>`; return chip; }
    chip.innerHTML = `<span class="cbx-set-ic ok">${fi('check', 12)}</span><span class="cbx-set-t">${isEvent ? 'Termin eingetragen' : 'Aufgabe angelegt'}<span class="cbx-set-s">${esc(sub)}</span></span><span class="cbx-grow"></span>`
      + `<button type="button" class="cbx-set-b" data-undo>Rückgängig</button><button type="button" class="cbx-set-b" data-open>${isEvent ? 'Kalender' : 'Aufgaben'}</button>`;
    chip.addEventListener('click', (e) => {
      if (e.target.closest('[data-undo]')) {
        window.Calendar?.remove({ title, date: made.date });
        chip.querySelector('.cbx-set-t').firstChild.textContent = 'Rückgängig gemacht'; e.target.closest('[data-undo]').remove();
      }
      if (e.target.closest('[data-open]')) window.openViewTab?.('calendar');
    });
    return chip;
  }

  /* ---------- reparierte Mini-App im Chat-Verlauf ersetzen (dieselbe Nachricht, keine neue) ---------- */
  function replaceInHistory(target, old, nu) {
    try {
      const tab = typeof activeTab === 'function' ? activeTab() : null;
      const hist = tab && typeof historyOf === 'function' ? historyOf(tab) : [];
      const a = old.trim(), b = nu.trim();
      const m = [...hist].reverse().find((x) => x.role === 'assistant' && String(x.text || '').includes(a));
      if (m) { m.text = m.text.replace(a, b); if (typeof saveChats === 'function') saveChats(); }
      const keep = target._cbxKeep;
      if (keep) for (const [k, f] of keep) if (k.endsWith(`|${old}`)) { keep.delete(k); keep.set(k.slice(0, -old.length) + nu, f); }
    } catch {}
  }

  /* ---------- in eine Antwort einsetzen (aus renderMarkdown, app.js) ---------- */
  const seen = new Set(read(SEEN_KEY, [])); // von der KI schon automatisch gespeichert (nach dem Löschen nicht wieder anlegen)
  function render(target, text, opts = {}) {
    if (opts.live) target._cbxLive = true;
    const pres = target.querySelectorAll('pre:has(code.language-widget), pre:has(code.language-hintergrund), pre:has(code.language-einstellung), pre:has(code.language-termin), pre:has(code.language-aufgabe)');
    if (!pres.length) return;
    const closed = (lang) => (String(text).match(new RegExp('```' + lang + '[^\\n]*\\n[\\s\\S]*?\\n```', 'g')) || []).length;
    const keep = (target._cbxKeep ||= new Map());
    const counts = { widget: 0, hintergrund: 0, einstellung: 0, termin: 0, aufgabe: 0 };
    const done = { widget: closed('widget'), hintergrund: closed('hintergrund'), einstellung: closed('einstellung'), termin: closed('termin'), aufgabe: closed('aufgabe') };
    let lastBg = null;
    pres.forEach((pre) => {
      const code = pre.querySelector('code'), raw = code.textContent;
      const lang = ['widget', 'hintergrund', 'termin', 'aufgabe'].find((l) => code.classList.contains(`language-${l}`)) || 'einstellung';
      const i = counts[lang]++;
      const finished = !opts.live || i < done[lang];
      const key = `${lang}|${i}`;
      if (lang === 'termin' || lang === 'aufgabe') {
        if (!finished) { pre.remove(); return; }
        const k = `${key}|${raw}`;
        if (!keep.has(k)) { const c = planChip(lang, raw, !!target._cbxLive); if (!c) { pre.remove(); return; } keep.set(k, c); }
        pre.replaceWith(keep.get(k));
        return;
      }
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
          const f = figure(raw, { defer: true, live: !!target._cbxLive, onReplace: (old, nu) => replaceInHistory(target, old, nu) });
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
    // Design der Mini-Apps (Aussehen) vorerst ausgeblendet – Mini-Apps im Chat sind aus; alte Mini-Apps bleiben unter „Gespeichert“
    { page: 'look', order: 2, html: () => '', click: settingsClick, input: settingsInput, change: settingsChange },
    { page: 'saved', order: 1, html: savedHtml, click: settingsClick },
  );
  // Aussehen der App geändert (Akzent, Modus) → laufende Mini-Apps übernehmen es
  const ap = window.Appearance;
  if (ap?.set && !ap._cbx) { const set0 = ap.set; ap.set = (p) => { set0(p); pushTheme(); }; ap._cbx = true; }

  // Design-Vorgaben gehen mit jeder Chat-Anfrage an den Server (Prompt „Stilwünsche“)
  const look = () => ({ accent: design.accent, corners: design.corners, font: design.font, surface: design.surface, wish: design.wish });

  return { parse, figure, render, save, saved, unsave, openFull, closeFull, look, design: () => ({ ...design }), setDesign, srcdoc, start, stop, shot, toast, applySetting };
})();
window.CodeBox = CodeBox;
