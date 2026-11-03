/* =====================================================================
   Chat-Hintergrund (Einstellungen → Aussehen → Chat-Hintergrund, oder per Chat)
   - „Standard“ = die Kacheln im leeren Chat wie bisher. Sonst EIGENE Hintergründe – keine fertigen Vorlagen mehr:
     • von der KI gebaut (```hintergrund, Pixel-Art-Stil, läuft abgeschottet im iframe wie Mini-Apps)
     • eigenes Bild (verkleinert, geht ins Konto) oder eigenes Video (animiert, bleibt auf diesem Gerät, IndexedDB)
   - Gespeicherte Hintergründe stehen als Kacheln in den Einstellungen (auswählen, löschen, hochladen).
   - Füllt den ganzen Hauptteil bis nach unten (nur das Eingabefeld selbst bleibt deckend); steht still, wenn Tab/Chat nicht sichtbar ist.
   ===================================================================== */
/* ---------- Pixel-Baukasten für KI-Hintergründe (läuft IM iframe, als window.PX) ----------
   Damit sieht jeder Hintergrund wie echte Pixel-Art aus: kleine Leinwand (Höhe 180 px, Breite nach Seitenverhältnis), nur ganze Pixel,
   per CSS kantig hochskaliert. Die KI baut ihre Szene aus diesen Bausteinen (Prompt: lib/workflow.js → SETTINGS_PROMPT). */
function pixelKit() {
  var P = {}, cv, ctx, H0 = 180, hooks = [], layers = {}, starsCache = {};
  function fit() {
    var r = Math.max(0.45, Math.min(3.2, innerWidth / Math.max(1, innerHeight)));
    P.H = H0; P.W = Math.max(64, Math.round(H0 * r));
    cv.width = P.W; cv.height = P.H; ctx.imageSmoothingEnabled = false;
    layers = {};
    for (var i = 0; i < hooks.length; i++) hooks[i](P.W, P.H);
  }
  P.init = function (h) {
    H0 = Math.max(90, Math.min(270, Math.round(h || 180)));
    cv = document.createElement('canvas'); cv.id = 'px'; document.body.appendChild(cv);
    ctx = cv.getContext('2d'); P.ctx = ctx; P.canvas = cv; fit();
    addEventListener('resize', fit);
    return ctx;
  };
  P.onResize = function (f) { hooks.push(f); };
  P.rng = function (seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  P.noise = function (x, seed) {
    var i = Math.floor(x), f = x - i, s = (seed || 0) | 0;
    var h = function (n) { n = (Math.imul(n, 374761393) + Math.imul(s, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    var u = f * f * (3 - 2 * f); return h(i) * (1 - u) + h(i + 1) * u;
  };
  P.px = function (x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
  P.rect = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  P.line = function (x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); ctx.fillStyle = c;
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, e = dx + dy;
    for (var k = 0; k < 2000; k++) { ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  };
  P.circle = function (cx, cy, r, c) { ctx.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy); r = Math.max(0, Math.round(r)); for (var y = -r; y <= r; y++) { var w = Math.floor(Math.sqrt(r * r - y * y + r * 0.8)); ctx.fillRect(cx - w, cy + y, 2 * w + 1, 1); } };
  // Farbbänder von oben nach unten (Himmel, Wasser) mit gepixeltem Übergang (Dithering) zwischen zwei Bändern
  P.bands = function (y0, y1, colors) {
    var n = colors.length, h = (y1 - y0) / n;
    for (var i = 0; i < n; i++) {
      var a = Math.round(y0 + i * h), b = Math.round(y0 + (i + 1) * h);
      P.rect(0, a, P.W, b - a, colors[i]);
      if (i > 0) { ctx.fillStyle = colors[i - 1]; for (var x = 0; x < P.W; x++) { if (x % 2 === 0) ctx.fillRect(x, a, 1, 1); if (x % 4 === 1) ctx.fillRect(x, a + 1, 1, 1); } }
    }
  };
  // Bergkette / Hügel / Dünen: Kammlinie aus Rauschen, darunter gefüllt; light = hellere Kante oben (Licht), snow = Schneekappen ab dieser Höhe
  P.ridge = function (o) {
    var s = o.seed || 1, sc = o.scale || 0.02, x0 = o.offset || 0;
    for (var x = 0; x < P.W; x++) {
      var n = P.noise((x + x0) * sc, s) * 0.68 + P.noise((x + x0) * sc * 3.1, s + 7) * 0.24 + P.noise((x + x0) * sc * 9, s + 13) * 0.08;
      var y = Math.round(o.base - n * o.amp);
      P.rect(x, y, 1, P.H - y, o.color);
      if (o.snow != null && y < o.snow) P.rect(x, y, 1, Math.min(3, o.snow - y), o.snowColor || '#e8ecf5');
      else if (o.light) P.px(x, y, o.light);
    }
  };
  // Sprite aus Zeichen: rows = ['..a..', '.aba.'], pal = { a: '#123456', b: '#abcdef' }; '.' und ' ' = durchsichtig
  P.sprite = function (rows, pal, x, y, flip) {
    x = Math.round(x); y = Math.round(y);
    for (var j = 0; j < rows.length; j++) { var r = rows[j]; for (var i = 0; i < r.length; i++) { var ch = r.charAt(flip ? r.length - 1 - i : i); if (ch !== '.' && ch !== ' ' && pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x + i, y + j, 1, 1); } } }
  };
  // Ebene einmal zeichnen und merken (wird bei Größenänderung neu gezeichnet); w = Breite (für endloses Scrollen gern 2 × P.W)
  P.layer = function (key, draw, w) {
    if (layers[key]) return layers[key];
    var c = document.createElement('canvas'); c.width = Math.round(w || P.W); c.height = P.H;
    var keepCtx = ctx, keepW = P.W; ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; P.W = c.width;
    try { draw(ctx, c.width, P.H); } finally { ctx = keepCtx; P.W = keepW; }
    layers[key] = c; return c;
  };
  // Ebene zeichnen, waagerecht verschoben und endlos wiederholt (Parallax: ferne Ebenen langsamer)
  P.blit = function (c, offset, y) { var w = c.width, o = ((Math.round(offset || 0) % w) + w) % w; ctx.drawImage(c, -o, Math.round(y || 0)); if (w - o < P.W) ctx.drawImage(c, w - o, Math.round(y || 0)); };
  // funkelnde Sterne (feste Plätze je seed), nur bis maxY
  P.stars = function (n, seed, t, maxY, cols) {
    var key = n + ':' + seed + ':' + P.W + ':' + (maxY || 0), list = starsCache[key];
    if (!list) { var r = P.rng(seed); list = []; for (var i = 0; i < n; i++) list.push({ x: Math.floor(r() * P.W), y: Math.floor(r() * (maxY || P.H * 0.55)), ph: r() * 6.283, sp: 0.4 + r() * 1.6, big: r() > 0.92, c: r() }); starsCache[key] = list; }
    cols = cols || ['#ffffff', '#cdd8ff', '#ffe8b8'];
    for (var k = 0; k < list.length; k++) { var st = list[k], a = Math.sin(t * st.sp + st.ph), col = cols[Math.floor(st.c * cols.length)]; if (a > -0.35) P.px(st.x, st.y, col); if (st.big && a > 0.6) { P.px(st.x - 1, st.y, col); P.px(st.x + 1, st.y, col); P.px(st.x, st.y - 1, col); P.px(st.x, st.y + 1, col); } }
  };
  // Teilchen (Schnee, Blüten, Glühwürmchen, Regen, Blätter): feste Liste je seed, Bewegung aus der Zeit berechnet (ruckelfrei, ohne Zustand)
  P.particles = function (n, seed, t, o) {
    o = o || {}; var r = P.rng(seed), vx = o.vx || 0, vy = o.vy == null ? 6 : o.vy, sw = o.sway == null ? 4 : o.sway, cols = o.colors || ['#ffffff'], sz = o.size || 1;
    for (var i = 0; i < n; i++) {
      var x0 = r() * P.W, y0 = r() * P.H, sp = 0.6 + r() * 0.8, ph = r() * 6.283, c = cols[Math.floor(r() * cols.length)];
      var x = ((x0 + vx * t * sp + Math.sin(t * 0.8 + ph) * sw) % P.W + P.W) % P.W, y = ((y0 + vy * t * sp) % P.H + P.H) % P.H;
      if (o.glow && Math.sin(t * 2 + ph) < 0.2) continue; // Glühwürmchen: an und aus
      P.rect(x, y, sz, sz, c);
    }
  };
  // ruhige Schleife: fn(t in Sekunden, dt) mit höchstens 30 Bildern/s
  P.loop = function (fn) { var last = 0, t0 = performance.now(); function f(now) { requestAnimationFrame(f); if (now - last < 32) return; var dt = last ? Math.min(0.1, (now - last) / 1000) : 0.033; last = now; fn((now - t0) / 1000, dt); } requestAnimationFrame(f); };
  // abgestimmte Paletten (dunkel → hell), dürfen frei ergänzt werden
  P.PAL = {
    nacht: ['#070a17', '#0d1328', '#152043', '#1f2f5c', '#2d4478', '#445f97', '#7f97c4', '#dfe6ff'],
    daemmerung: ['#120b24', '#24143f', '#3c1f57', '#5e2a66', '#8d3b6c', '#c35a6a', '#ec8a6a', '#ffc78f'],
    sakura: ['#0f0c22', '#1f1940', '#30285c', '#47397a', '#d98bb0', '#f2b3cf', '#ffe1ec', '#203a2e', '#162a22'],
    wald: ['#081310', '#0e1f18', '#163023', '#21452f', '#2f5f3c', '#4c8549', '#86b062', '#d6e8a6'],
    meer: ['#04101c', '#081d31', '#0e2e49', '#164263', '#225c82', '#3a7fa5', '#74b4cd', '#d4eef2'],
    herbst: ['#140c0a', '#2a1610', '#472217', '#6b301b', '#9a4820', '#c86c2a', '#e8a046', '#f8d58a'],
    winter: ['#0a1020', '#121c33', '#1d2d4d', '#2d4469', '#4a6690', '#7b98bd', '#b9cde3', '#f2f7ff'],
    stadt: ['#08070f', '#12101f', '#1d1a33', '#2b2648', '#3f3763', '#ffb454', '#ffd27a', '#7ae0ff'],
  };
  window.PX = P;
}
window.PixelKit = `(${pixelKit.toString()})();`;

const ChatBg = (() => {
  const KEY = 'chatbg.v2', DB = 'chatbg-videos', MAX_SAVED = 16;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 14) => (window.FadeIcons ? FadeIcons.svg(n, s) : '');
  const DEF = { active: '', strength: 70, saved: [] };
  let cfg = { ...DEF };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  // alter Stand (v1): eigener KI-Hintergrund übernehmen
  try { const old = JSON.parse(localStorage.getItem('chatbg.v1') || 'null'); if (old?.custom && !cfg.saved.length) { cfg.saved = [{ id: 'b1', type: 'code', name: 'Eigener Hintergrund', code: old.custom, at: Date.now() }]; if (old.kind === 'eigener') cfg.active = 'b1'; } } catch {}
  if (!Array.isArray(cfg.saved)) cfg.saved = [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { window.CodeBox?.toast?.('Speicher voll – lösch einen Hintergrund.'); } };
  const byId = (id) => cfg.saved.find((x) => x.id === id);

  /* ---------- Videos: groß → nur auf diesem Gerät (IndexedDB) ---------- */
  const idb = () => new Promise((ok, bad) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('v'); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
  const putVideo = async (id, blob) => { const d = await idb(); return new Promise((ok, bad) => { const t = d.transaction('v', 'readwrite'); t.objectStore('v').put(blob, id); t.oncomplete = ok; t.onerror = () => bad(t.error); }); };
  const getVideo = async (id) => { const d = await idb(); return new Promise((ok) => { const r = d.transaction('v').objectStore('v').get(id); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); };
  const delVideo = async (id) => { try { const d = await idb(); d.transaction('v', 'readwrite').objectStore('v').delete(id); } catch {} };
  const videoUrls = new Map();
  const videoUrl = async (id) => { if (videoUrls.has(id)) return videoUrls.get(id); const b = await getVideo(id); if (!b) return ''; const u = URL.createObjectURL(b); videoUrls.set(id, u); return u; };

  /* ---------- Ebene hinter dem Chat ---------- */
  const panel = document.querySelector('.panel');
  const layer = document.createElement('div');
  layer.className = 'chat-bg'; layer.setAttribute('aria-hidden', 'true');
  panel?.prepend(layer);
  let shownId = null, frame = null;
  const wanted = () => {
    if (!cfg.active || !byId(cfg.active) || !panel) return false;
    if (document.getElementById('app')?.classList.contains('settings-open')) return false;
    const tab = typeof activeTab === 'function' ? activeTab() : null;
    return !!tab && !tab.dataset.view;
  };
  async function mountBg(item) {
    if (frame) { window.CodeBox?.stop(frame); frame = null; }
    layer.replaceChildren();
    shownId = item?.id || null;
    if (!item) return;
    if (item.type === 'code' && window.CodeBox) {
      const host = document.createElement('div'); host.className = 'chat-bg-frame'; layer.append(host); frame = host;
      CodeBox.start(host, item.code, { fill: true, title: 'Hintergrund', bg: true });
      if (!item.thumb) setTimeout(() => { if (frame === host) CodeBox.shot(host, (url) => { if (url) { item.thumb = url; save(); window.Settings?.redraw?.(); } }); }, 2500); // Vorschau für die Einstellungen
    }
    else if (item.type === 'image') { const d = document.createElement('div'); d.className = 'chat-bg-img'; d.style.backgroundImage = `url("${item.src}")`; layer.append(d); }
    else if (item.type === 'video') {
      const v = document.createElement('video'); v.className = 'chat-bg-video'; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.setAttribute('playsinline', '');
      layer.append(v); const u = await videoUrl(item.id); if (u && shownId === item.id) { v.src = u; v.play().catch(() => {}); }
    }
  }
  function update() {
    const item = byId(cfg.active), on = wanted();
    panel?.classList.toggle('has-cbg', !!item);
    layer.style.setProperty('--cbg', String(Math.max(10, Math.min(100, cfg.strength)) / 100));
    layer.classList.toggle('on', on);
    if (on && !document.hidden) { if (shownId !== item.id) mountBg(item); else layer.querySelector('video')?.play().catch(() => {}); }
    else { layer.querySelector('video')?.pause(); if (frame && document.hidden) { window.CodeBox?.stop(frame); frame = null; shownId = null; } }
  }
  window.addEventListener('chat-tab-switched', () => setTimeout(update, 0));
  document.addEventListener('visibilitychange', update);
  const appEl = document.getElementById('app');
  if (appEl) new MutationObserver(update).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  setTimeout(update, 0);

  function set(patch) {
    cfg = { ...cfg, ...patch };
    if (cfg.active && !byId(cfg.active)) cfg.active = '';
    save(); shownId = shownId === cfg.active ? shownId : null; update();
    window.Settings?.redraw?.();
  }
  function add(item, activate = true) {
    const id = `b${Date.now().toString(36)}`;
    cfg.saved = [{ id, at: Date.now(), ...item }, ...cfg.saved].slice(0, MAX_SAVED);
    set(activate ? { active: id } : {});
    return id;
  }
  async function remove(id) {
    const it = byId(id); if (!it) return;
    if (it.type === 'video') { delVideo(id); const u = videoUrls.get(id); if (u) URL.revokeObjectURL(u); videoUrls.delete(id); }
    cfg.saved = cfg.saved.filter((x) => x.id !== id);
    set({ active: cfg.active === id ? '' : cfg.active });
  }
  // KI-Hintergrund (Code) übernehmen: schon gespeichert → nur auswählen
  function useCode(code, name = 'KI-Hintergrund', thumb = '') {
    const t = /^\s*(?:titel|title)\s*:\s*(.+)$/im.exec(String(code || ''))?.[1]?.trim();
    if (t && name === 'KI-Hintergrund') name = t; // Name aus der Titelzeile (z. B. „Sakura-Tal bei Nacht“)
    const c = String(code || '').replace(/^\s*(titel|title)\s*:.*\n/i, '').slice(0, 80000);
    const hit = cfg.saved.find((x) => x.type === 'code' && x.code === c);
    if (hit) { if (thumb && !hit.thumb) hit.thumb = thumb; set({ active: hit.id }); return hit.id; }
    return add({ type: 'code', name: String(name).slice(0, 40), code: c, ...(thumb ? { thumb } : {}) });
  }
  /* Vorschaubilder für gespeicherte KI-Hintergründe ohne Bild: kurz unsichtbar laufen lassen und die Leinwand abfotografieren (eins nach dem anderen) */
  let thumbing = false;
  function ensureThumbs() {
    if (thumbing || !window.CodeBox) return;
    const it = cfg.saved.find((x) => x.type === 'code' && !x.thumb && !x.noThumb);
    if (!it) return;
    thumbing = true;
    const host = document.createElement('div');
    host.className = 'cbg-shooter';
    document.body.append(host);
    CodeBox.start(host, it.code, { title: 'Vorschau', bg: true });
    setTimeout(() => CodeBox.shot(host, (url) => {
      CodeBox.stop(host); host.remove(); thumbing = false;
      if (url) it.thumb = url; else it.noThumb = true; // ohne Leinwand (nur CSS) → Symbol bleibt
      save(); window.Settings?.redraw?.();
      setTimeout(ensureThumbs, 300);
    }), 2200);
  }

  /* ---------- Hochladen: Bild (verkleinert, ins Konto) oder Video (bleibt auf dem Gerät) ---------- */
  async function upload(file) {
    if (!file) return;
    if (/^video\//.test(file.type)) {
      if (file.size > 60 * 1024 * 1024) { window.CodeBox?.toast?.('Video ist zu groß (höchstens 60 MB).'); return; }
      const id = `b${Date.now().toString(36)}`;
      try { await putVideo(id, file); } catch { window.CodeBox?.toast?.('Video konnte nicht gespeichert werden.'); return; }
      cfg.saved = [{ id, type: 'video', name: file.name.replace(/\.\w+$/, '').slice(0, 40) || 'Video', at: Date.now() }, ...cfg.saved].slice(0, MAX_SAVED);
      set({ active: id });
      return;
    }
    if (!/^image\//.test(file.type)) return;
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; }).catch(() => null);
    URL.revokeObjectURL(url);
    if (!img) return;
    const k = Math.min(1, 1920 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    add({ type: 'image', name: file.name.replace(/\.\w+$/, '').slice(0, 40) || 'Bild', src: c.toDataURL('image/jpeg', 0.82) });
  }

  /* ---------- Einstellungen: Standard · gespeicherte · Hochladen ---------- */
  const seg = (attr, items, on) => `<span class="st-seg" role="radiogroup">${items.map(([l, v]) => `<button type="button" role="radio" aria-checked="${v === on}" class="${v === on ? 'on' : ''}" ${attr}="${v}">${esc(l)}</button>`).join('')}</span>`;
  const near = (v, list) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  let armDel = null;
  function html() {
    const tile = (id, label, prev, extra = '') => `<div class="cbg-tile${(cfg.active || '') === id ? ' on' : ''}" data-cbg-pick="${id}" role="button" tabindex="0"><span class="cbg-prev">${prev}</span><span class="cbg-name">${esc(label)}</span>${extra}</div>`;
    const tiles = [tile('', 'Standard', `<span class="cbg-std">${fi('dashboard', 16)}</span>`)]
      .concat(cfg.saved.map((x) => tile(x.id, x.name, x.type === 'image' ? `<img src="${esc(x.src)}" alt="">` : x.thumb ? `<img class="cbg-px" src="${esc(x.thumb)}" alt="">` : `<span class="cbg-std${x.type === 'code' && !x.noThumb ? ' cbg-wait' : ''}">${fi(x.type === 'video' ? 'video' : 'image', 16)}</span>`,
        `<button type="button" class="cbg-del${armDel === x.id ? ' sure' : ''}" data-cbg-del="${x.id}" aria-label="Löschen">${armDel === x.id ? 'Löschen?' : fi('x', 10)}</button>`)))
      .concat(`<label class="cbg-tile cbg-up"><span class="cbg-prev"><span class="cbg-std">${fi('plus', 16)}</span></span><span class="cbg-name">Hochladen</span><input type="file" accept="image/*,video/*" data-cbg-file hidden></label>`);
    const cur = byId(cfg.active);
    setTimeout(ensureThumbs, 400);
    return `<h2>Chat-Hintergrund</h2><div class="st-card">
      <div class="st-row st-modes-row"><span class="st-name">Hintergrund</span><div class="cbg-tiles">${tiles.join('')}</div></div>
      ${cur ? `<div class="st-row"><span class="st-name">Deckkraft</span><span class="grow"></span>${seg('data-cbg-str', [['Leicht', '35'], ['Mittel', '70'], ['Voll', '100']], String(near(cfg.strength, [35, 70, 100])))}</div>` : ''}
      <p class="st-ws-note cbg-note">Eigene Hintergründe: Bild oder Video hochladen – oder die KI bitten, z. B. „Mach mir einen animierten Pixel-Hintergrund mit Sternenhimmel“. Videos bleiben auf diesem Gerät.</p>
    </div>`;
  }
  function click(e) {
    const d = e.target.closest('[data-cbg-del]');
    if (d) { e.preventDefault(); const id = d.dataset.cbgDel; if (armDel !== id) { armDel = id; window.Settings?.redraw?.(); setTimeout(() => { if (armDel === id) { armDel = null; window.Settings?.redraw?.(); } }, 3000); } else { armDel = null; remove(id); } return true; }
    const k = e.target.closest('[data-cbg-pick]'); if (k) { set({ active: k.dataset.cbgPick }); return true; }
    const s = e.target.closest('[data-cbg-str]'); if (s) { set({ strength: +s.dataset.cbgStr }); return true; }
    return false;
  }
  function change(e) { if (e.target.matches('[data-cbg-file]')) { upload(e.target.files?.[0]); return true; } return false; }
  (window.SettingsHooks ||= []).push({ page: 'look', order: 1, html, click, change });

  /* ---------- ```hintergrund im Chat: Vorschau + „Als Hintergrund verwenden“ (wird gespeichert) ---------- */
  function figure(raw) {
    const fig = document.createElement('figure');
    fig.className = 'cbx cbg-fig';
    const code = String(raw || '').replace(/^\s*(titel|title)\s*:.*\n/i, '');
    const title = ((String(raw).match(/^\s*(?:titel|title)\s*:\s*(.+)$/im) || [])[1] || 'KI-Hintergrund').slice(0, 40);
    const active = () => byId(cfg.active)?.code === code;
    fig.innerHTML = '<div class="cbx-body"><div class="cbg-stage"></div></div><div class="cbx-bar"><span class="cbx-bar-l"></span><span class="cbx-grow"></span></div>';
    const draw = () => { fig.querySelector('.cbx-bar-l').innerHTML = `<span class="cbx-status">${fi('image', 12)}${esc(title)}</span>`;
      fig.querySelector('.cbx-bar .cbg-act')?.remove();
      fig.querySelector('.cbx-bar').insertAdjacentHTML('beforeend', active() ? `<span class="cbg-act cbg-on">${fi('check', 12)}Aktiv</span>` : '<button type="button" class="cbg-act cbg-use" data-use>Als Hintergrund verwenden</button>'); };
    draw();
    const stage = fig.querySelector('.cbg-stage');
    const io = new IntersectionObserver((list) => list.forEach((en) => {
      if (en.isIntersecting && !stage._cbx && window.CodeBox) {
        CodeBox.start(stage, code, { fill: true, title: 'Hintergrund-Vorschau', bg: true });
        if (!fig._shot) setTimeout(() => { if (stage._cbx) CodeBox.shot(stage, (url) => { if (url) fig._shot = url; }); }, 2200);
      }
      else if (!en.isIntersecting && stage._cbx) CodeBox.stop(stage);
    }));
    io.observe(stage);
    fig.addEventListener('click', (e) => { if (e.target.closest('[data-use]')) { useCode(code, title, fig._shot || ''); draw(); window.CodeBox?.toast('Hintergrund gespeichert und aktiv'); } });
    return fig;
  }

  return { get: () => ({ ...cfg }), set, figure, useCode, upload };
})();
window.ChatBg = ChatBg;
