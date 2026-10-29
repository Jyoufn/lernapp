/* ===================================================================
   Suchfeld (Lupe oben in der Seitenleiste, ⌘K / Strg+K) und Workspace-Menü (Name oben links)
   - Suchfeld wie eine Befehlspalette: oben das Eingabefeld, darunter Gruppen
     leer:   Aktionen (Neuer Chat, Neues Dokument, Neue Aufgabe) · Zuletzt (Chats mit Hund) · Gehe zu · Darstellung · Einstellungen
     tippen: passende Aktionen, Agenten-Chats (Titel und Inhalt, davor der Hund des zuletzt genutzten Agenten), Dokumente (Titel und Text)
     Pfeile wählen, Enter öffnet, Esc schließt. Fundstelle im Inhalt erscheint grau dahinter.
   - Workspace-Menü: oben der Workspace mit Hund, darunter „Workspace hinzufügen“ (kommt später), Suchen, Einstellungen
   Braucht aus app.js: tabsEl, chatOf, historyOf, activateTab, createTab, openViewTab, isDraft, chatsView.
   =================================================================== */
const AppSearch = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 15) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const oi = (n, s = 15) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#o-${n}"/></svg>`;
  const dog = (id, s = 20) => { const d = window.PixelDogs?.DOGS?.[id] ? id : 'general'; return window.PixelDogs?.svg ? window.PixelDogs.svg(d, s) : ''; };
  const isMac = /Mac|iPad|iPhone/.test(navigator.platform || navigator.userAgent);
  const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').replace(/\s+/g, ' '); };
  const norm = (s) => String(s || '').toLowerCase();

  /* ---------- Daten ---------- */
  const chatTabs = () => [...document.querySelectorAll('#tabs .tab:not([data-view]):not(.uil-tab)')].filter((t) => !t.classList.contains('draft') || historyOf(t).length);
  const chats = () => chatTabs().map((tab) => {
    const c = chatOf(tab) || {};
    return { tab, title: c.title || 'Chat', agent: c.agent, updated: c.updated || 0, text: historyOf(tab).map((h) => h.text || '').join('\n') };
  }).sort((a, b) => b.updated - a.updated);
  const docs = () => (window.Docs?.docs || []).filter((d) => !window.Docs.isEmpty(d.id)).map((d) => ({ id: d.id, title: d.title || 'Unbenannt', updated: d.updated || 0, icon: d.icon, text: `${d.subtitle || ''} ${plain(d.content)}` }))
    .sort((a, b) => b.updated - a.updated);
  // kurzer Ausschnitt um die Fundstelle
  const snippet = (text, q) => {
    const i = norm(text).indexOf(q); if (i < 0) return '';
    const from = Math.max(0, i - 28), part = text.slice(from, i + q.length + 50).replace(/\s+/g, ' ').trim();
    return `${from > 0 ? '…' : ''}${part}`;
  };
  const mark = (s, q) => { const i = norm(s).indexOf(q); return i < 0 || !q ? esc(s) : `${esc(s.slice(0, i))}<b>${esc(s.slice(i, i + q.length))}</b>${esc(s.slice(i + q.length))}`; };
  const when = (t) => {
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} Min.`;
    if (s < 86400) return `${Math.round(s / 3600)} Std.`;
    return new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  };

  /* ---------- Aktionen ---------- */
  const newChat = () => {
    const act = document.querySelector('#tabs .tab.active');
    if (!(act && !act.dataset.view && isDraft(act))) createTab('Neuer Chat');
    chatsView?.hide?.();
    setTimeout(() => document.getElementById('input')?.focus(), 60);
  };
  const lightNow = () => window.Appearance?.get?.().mode === 'light';
  const ACTIONS = () => [
    { group: 'Aktionen', icon: oi('plus'), label: 'Neuer Chat', keys: 'chat neu', run: newChat },
    { group: 'Aktionen', icon: fi('file'), label: 'Neues Dokument', keys: 'dokument neu notiz', run: () => window.Docs?.create() },
    { group: 'Aktionen', icon: fi('tasks'), label: 'Neue Aufgabe', keys: 'aufgabe neu task', run: () => { openViewTab('tasks'); setTimeout(() => document.querySelector('.tk-view:not([hidden]) .tk-new')?.click(), 120); } },
    { group: 'Gehe zu', icon: oi('chat'), label: 'Chatverlauf', keys: 'chats verlauf alle', run: () => window.openChatsFromAnywhere?.() },
    { group: 'Gehe zu', icon: oi('library'), label: 'Bibliothek', keys: 'dokumente bibliothek library', run: () => openViewTab('docs') },
    { group: 'Gehe zu', icon: oi('tasks'), label: 'Aufgaben', keys: 'aufgaben board tasks', run: () => openViewTab('tasks') },
    { group: 'Gehe zu', icon: oi('calendar'), label: 'Kalender', keys: 'kalender termine', run: () => openViewTab('calendar') },
    { group: 'Darstellung', icon: fi(lightNow() ? 'eye' : 'bulb'), label: lightNow() ? 'Zu dunklem Design wechseln' : 'Zu hellem Design wechseln', keys: 'hell dunkel design theme modus', run: () => window.Appearance?.set({ mode: lightNow() ? 'dark' : 'light' }) },
    { group: 'Einstellungen', icon: fi('settings'), label: 'Einstellungen', keys: 'einstellungen settings api agenten', hint: isMac ? '⌘,' : 'Strg+,', run: () => window.Settings?.open() },
  ];

  /* ---------- Fenster ---------- */
  const root = document.createElement('div');
  root.className = 'cmdk';
  root.hidden = true;
  root.innerHTML = `<div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Suchen">
      <label class="cmdk-in">${oi('search', 15)}<input type="text" placeholder="Suchen oder Aktion …" aria-label="Suchen" autocomplete="off" spellcheck="false" /><kbd>Esc</kbd></label>
      <div class="cmdk-list" role="listbox"></div></div>`;
  document.body.append(root);
  const input = root.querySelector('input'), list = root.querySelector('.cmdk-list');
  let rows = [], sel = 0;

  function build(qRaw) {
    const q = norm(qRaw).trim();
    const out = [];
    const acts = ACTIONS().filter((a) => !q || norm(`${a.label} ${a.keys}`).includes(q));
    if (!q) {
      const recent = chats().slice(0, 4).map((c) => ({ group: 'Zuletzt', icon: `<span class="cmdk-dog">${dog(c.agent)}</span>`, label: c.title, meta: when(c.updated), run: () => openChat(c.tab) }));
      out.push(...acts.filter((a) => a.group === 'Aktionen'), ...recent, ...acts.filter((a) => a.group !== 'Aktionen'));
    } else {
      const cs = chats().filter((c) => norm(c.title).includes(q) || norm(c.text).includes(q)).slice(0, 8)
        .map((c) => ({ group: 'Chats', icon: `<span class="cmdk-dog">${dog(c.agent)}</span>`, label: c.title, html: mark(c.title, q), sub: norm(c.title).includes(q) ? '' : snippet(c.text, q), meta: when(c.updated), run: () => openChat(c.tab) }));
      const ds = docs().filter((d) => norm(d.title).includes(q) || norm(d.text).includes(q)).slice(0, 8)
        .map((d) => ({ group: 'Dokumente', icon: d.icon && window.DocIcons?.has(d.icon.name) ? `<svg width="15" height="15" style="color:${d.icon.c}"><use href="#d-${d.icon.name}"/></svg>` : fi('file'), label: d.title, html: mark(d.title, q), sub: norm(d.title).includes(q) ? '' : snippet(d.text, q), meta: when(d.updated), run: () => window.Docs?.open(d.id) }));
      out.push(...cs, ...ds, ...acts);
    }
    rows = out;
    sel = 0;
    if (!rows.length) { list.innerHTML = `<div class="cmdk-empty">Nichts gefunden zu „${esc(qRaw.trim())}“</div>`; return; }
    let html = '', last = '';
    rows.forEach((r, i) => {
      if (r.group !== last) { html += `<div class="cmdk-g">${r.group}</div>`; last = r.group; }
      html += `<div class="cmdk-row" role="option" data-i="${i}"><span class="cmdk-ic">${r.icon}</span><span class="cmdk-t"><span class="cmdk-l">${r.html || esc(r.label)}</span>${r.sub ? `<span class="cmdk-s">${mark(r.sub, q)}</span>` : ''}</span>${r.meta ? `<span class="cmdk-m">${esc(r.meta)}</span>` : ''}${r.hint ? `<kbd>${r.hint}</kbd>` : ''}</div>`;
    });
    list.innerHTML = html;
    paint();
  }
  function paint(scroll = false) {
    list.querySelectorAll('.cmdk-row').forEach((el) => el.classList.toggle('on', +el.dataset.i === sel));
    if (scroll) list.querySelector('.cmdk-row.on')?.scrollIntoView({ block: 'nearest' });
  }
  function openChat(tab) { chatsView?.hide?.(); activateTab(tab); }
  function run(i) { const r = rows[i]; if (!r) return; close(); setTimeout(() => r.run(), 30); }

  function open(q = '') {
    if (!root.hidden) { input.select(); return; }
    menu.set(false);
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('open'));
    input.value = q; build(q);
    setTimeout(() => input.focus(), 20);
  }
  function close() {
    if (root.hidden) return;
    root.classList.remove('open');
    setTimeout(() => { if (!root.classList.contains('open')) root.hidden = true; }, 180);
  }
  input.addEventListener('input', () => build(input.value));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(rows.length - 1, sel + 1); paint(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(true); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('mousemove', (e) => { const r = e.target.closest('.cmdk-row'); if (r && +r.dataset.i !== sel) { sel = +r.dataset.i; paint(); } });
  list.addEventListener('click', (e) => { const r = e.target.closest('.cmdk-row'); if (r) run(+r.dataset.i); });
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); root.hidden ? open() : close(); }
    if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); window.Settings?.open(); }
  });
  document.getElementById('sbSearch')?.addEventListener('click', () => open());

  /* ---------- Workspace-Menü (Name oben links) ---------- */
  const ws = document.querySelector('.sb-ws');
  const av = ws?.querySelector('.sb-ws-av');
  const paintAv = () => { if (av) av.innerHTML = dog('general', 20); };
  paintAv();
  if (av && !av.innerHTML) window.addEventListener('load', paintAv); // Hunde-Skript kommt nach diesem Skript
  setTimeout(paintAv, 0);
  const pop = document.createElement('div');
  pop.className = 'ws-menu';
  pop.setAttribute('role', 'menu');
  ws?.parentElement?.append(pop);
  const nameOf = () => ws?.querySelector('.sb-ws-name')?.textContent || 'Workspace';
  const draw = () => {
    pop.innerHTML = `<div class="ws-cur"><span class="ws-av">${dog('general', 24)}</span><span class="ws-t"><b>${esc(nameOf())}</b><small>Persönlicher Workspace</small></span>${fi('check', 13)}</div>
      <div class="ws-sep"></div>
      <button type="button" class="ws-mi" data-ws="new" aria-disabled="true">${oi('plus', 15)}<span>Workspace hinzufügen</span><em>Bald</em></button>
      <div class="ws-sep"></div>
      <button type="button" class="ws-mi" data-ws="search">${oi('search', 15)}<span>Suchen</span><kbd>${isMac ? '⌘K' : 'Strg+K'}</kbd></button>
      <button type="button" class="ws-mi" data-ws="settings">${oi('gear', 15)}<span>Einstellungen</span><kbd>${isMac ? '⌘,' : 'Strg+,'}</kbd></button>`;
  };
  const menu = {
    set(on) {
      if (!ws) return;
      if (on) draw();
      pop.classList.toggle('open', on);
      ws.classList.toggle('on', on);
      ws.setAttribute('aria-expanded', String(on));
    },
  };
  ws?.addEventListener('click', (e) => { e.stopPropagation(); menu.set(!pop.classList.contains('open')); });
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ws]'); if (!b) return;
    if (b.dataset.ws === 'new') return; // kommt später: eigene Workspaces mit eigenen Chats, teilbar
    menu.set(false);
    if (b.dataset.ws === 'search') open();
    if (b.dataset.ws === 'settings') window.Settings?.open();
  });
  document.addEventListener('pointerdown', (e) => { if (!pop.contains(e.target) && !ws?.contains(e.target)) menu.set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.set(false); });

  return { open, close };
})();
window.AppSearch = AppSearch;
