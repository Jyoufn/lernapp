/* =====================================================================
   Chat-Hintergrund (Einstellungen → Aussehen → Chat-Hintergrund, oder per Chat)
   - „Standard“ = die Kacheln im leeren Chat wie bisher. Sonst EIGENE Hintergründe – keine fertigen Vorlagen mehr:
     • von der KI gebaut (```hintergrund, Pixel-Art-Stil, läuft abgeschottet im iframe wie Mini-Apps)
     • eigenes Bild (verkleinert, geht ins Konto) oder eigenes Video (animiert, bleibt auf diesem Gerät, IndexedDB)
   - Gespeicherte Hintergründe stehen als Kacheln in den Einstellungen (auswählen, löschen, hochladen).
   - Füllt den ganzen Hauptteil bis nach unten (nur das Eingabefeld selbst bleibt deckend); steht still, wenn Tab/Chat nicht sichtbar ist.
   ===================================================================== */
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
    if (item.type === 'code' && window.CodeBox) { const host = document.createElement('div'); host.className = 'chat-bg-frame'; layer.append(host); frame = host; CodeBox.start(host, item.code, { fill: true, title: 'Hintergrund' }); }
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
  function useCode(code, name = 'KI-Hintergrund') {
    const c = String(code || '').replace(/^\s*(titel|title)\s*:.*\n/i, '').slice(0, 80000);
    const hit = cfg.saved.find((x) => x.type === 'code' && x.code === c);
    if (hit) { set({ active: hit.id }); return hit.id; }
    return add({ type: 'code', name: String(name).slice(0, 40), code: c });
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
      .concat(cfg.saved.map((x) => tile(x.id, x.name, x.type === 'image' ? `<img src="${esc(x.src)}" alt="">` : `<span class="cbg-std">${fi(x.type === 'video' ? 'video' : 'codewin', 16)}</span>`,
        `<button type="button" class="cbg-del${armDel === x.id ? ' sure' : ''}" data-cbg-del="${x.id}" aria-label="Löschen">${armDel === x.id ? 'Löschen?' : fi('x', 10)}</button>`)))
      .concat(`<label class="cbg-tile cbg-up"><span class="cbg-prev"><span class="cbg-std">${fi('plus', 16)}</span></span><span class="cbg-name">Hochladen</span><input type="file" accept="image/*,video/*" data-cbg-file hidden></label>`);
    const cur = byId(cfg.active);
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
      if (en.isIntersecting && !stage._cbx && window.CodeBox) CodeBox.start(stage, code, { fill: true, title: 'Hintergrund-Vorschau' });
      else if (!en.isIntersecting && stage._cbx) CodeBox.stop(stage);
    }));
    io.observe(stage);
    fig.addEventListener('click', (e) => { if (e.target.closest('[data-use]')) { useCode(code, title); draw(); window.CodeBox?.toast('Hintergrund gespeichert und aktiv'); } });
    return fig;
  }

  return { get: () => ({ ...cfg }), set, figure, useCode, upload };
})();
window.ChatBg = ChatBg;
