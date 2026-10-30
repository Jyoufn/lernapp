/* ===================================================================
   Suchfeld (Lupe oben in der Seitenleiste, ⌘K / Strg+K) und Workspace-Menü (Name oben links)
   - Suchfeld wie eine Befehlspalette: oben das Eingabefeld, darunter Gruppen
     leer:   Aktionen (Neuer Chat, Neues Dokument, Neue Aufgabe) · Zuletzt (Chats mit Hund) · Gehe zu
     tippen: passende Aktionen, Agenten-Chats (Titel und Inhalt, davor der Hund des zuletzt genutzten Agenten), Dokumente (Titel und Text)
     Pfeile wählen, Enter öffnet, Esc schließt. Fundstelle im Inhalt erscheint grau dahinter.
   - Workspaces (höchstens 3): jeder mit eigenem Hund und eigenen Chats/Dokumenten. Menü oben links: Liste (Haken am aktiven),
     „Workspace hinzufügen“ (Name eintippen, Enter), Einstellungen. Umbenennen, Symbol wählen und Löschen: Einstellungen → Allgemein → Workspaces
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
  const chatTabs = () => [...document.querySelectorAll('#tabs .tab:not([data-view]):not(.uil-tab)')].filter((t) => (!t.classList.contains('draft') || historyOf(t).length) && (window.inWorkspace?.(t) ?? true));
  const chats = () => chatTabs().map((tab) => {
    const c = chatOf(tab) || {};
    return { tab, title: c.title || 'Chat', agent: c.agent, updated: c.updated || 0, text: historyOf(tab).map((h) => h.text || '').join('\n') };
  }).sort((a, b) => b.updated - a.updated);
  const docs = () => (window.Docs?.docs || []).filter((d) => !window.Docs.isEmpty(d.id) && (window.Docs.inWs?.(d) ?? true)).map((d) => ({ id: d.id, title: d.title || 'Unbenannt', updated: d.updated || 0, icon: d.icon, text: `${d.subtitle || ''} ${plain(d.content)}` }))
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
  const ACTIONS = () => [
    { group: 'Aktionen', icon: oi('plus'), label: 'Neuer Chat', keys: 'chat neu', run: newChat },
    { group: 'Aktionen', icon: oi('doc-new'), label: 'Neues Dokument', keys: 'dokument neu notiz', run: () => window.Docs?.create() },
    { group: 'Aktionen', icon: oi('tasks'), label: 'Neue Aufgabe', keys: 'aufgabe neu task', run: () => { openViewTab('tasks'); setTimeout(() => document.querySelector('.tk-view:not([hidden]) .tk-new')?.click(), 120); } },
    { group: 'Gehe zu', icon: oi('chat'), label: 'Chatverlauf', keys: 'chats verlauf alle', run: () => window.openChatsFromAnywhere?.() },
    { group: 'Gehe zu', icon: oi('library'), label: 'Bibliothek', keys: 'dokumente bibliothek library', run: () => openViewTab('docs') },
    { group: 'Gehe zu', icon: oi('tasks'), label: 'Aufgaben', keys: 'aufgaben board tasks', run: () => openViewTab('tasks') },
    { group: 'Gehe zu', icon: oi('calendar'), label: 'Kalender', keys: 'kalender termine', run: () => openViewTab('calendar') },
  ];

  /* ---------- Fenster ---------- */
  const root = document.createElement('div');
  root.className = 'cmdk';
  root.hidden = true;
  root.innerHTML = `<div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Suchen">
      <label class="cmdk-in">${oi('search', 15)}<input type="text" placeholder="Suchen oder Aktion …" aria-label="Suchen" autocomplete="off" spellcheck="false" /></label>
      <div class="cmdk-list" role="listbox"></div></div>`;
  document.body.append(root);
  const input = root.querySelector('input'), list = root.querySelector('.cmdk-list');
  let rows = [], sel = 0;

  function build(qRaw, enter = false) {
    const q = norm(qRaw).trim();
    const out = [];
    const acts = ACTIONS().filter((a) => !q || norm(`${a.label} ${a.keys}`).includes(q));
    if (!q) {
      const recent = chats().slice(0, 4).map((c) => ({ group: 'Zuletzt', icon: `<span class="cmdk-dog">${dog(c.agent)}</span>`, label: c.title, meta: when(c.updated), run: () => openChat(c.tab) }));
      out.push(...acts.filter((a) => a.group === 'Aktionen'), ...recent, ...acts.filter((a) => a.group !== 'Aktionen'));
    } else {
      const cs = chats().filter((c) => norm(c.title).includes(q) || norm(c.text).includes(q)).slice(0, 8)
        .map((c) => ({ group: 'Chats', icon: `<span class="cmdk-dog">${dog(c.agent)}</span>`, label: c.title, html: mark(c.title, q), meta: when(c.updated), run: () => openChat(c.tab) }));
      const ds = docs().filter((d) => norm(d.title).includes(q) || norm(d.text).includes(q)).slice(0, 8)
        .map((d) => ({ group: 'Dokumente', icon: d.icon && window.DocIcons?.has(d.icon.name) ? `<svg width="15" height="15" style="color:${d.icon.c}"><use href="#${d.icon.line ? 'dl' : 'd'}-${d.icon.name}"/></svg>` : fi('file'), label: d.title, html: mark(d.title, q), meta: when(d.updated), run: () => window.Docs?.open(d.id) }));
      out.push(...cs, ...ds, ...acts);
    }
    rows = out;
    sel = 0;
    if (!rows.length) { list.innerHTML = `<div class="cmdk-empty">Nichts gefunden zu „${esc(qRaw.trim())}“</div>`; return; }
    let html = '', last = '';
    rows.forEach((r, i) => {
      if (r.group !== last) { html += `<div class="cmdk-g">${r.group}</div>`; last = r.group; }
      html += `<div class="cmdk-row" role="option" data-i="${i}" style="--i:${Math.min(i, 9)}"><span class="cmdk-ic">${r.icon}</span><span class="cmdk-t"><span class="cmdk-l">${r.html || esc(r.label)}</span>${r.sub ? `<span class="cmdk-s">${mark(r.sub, q)}</span>` : ''}</span>${r.meta ? `<span class="cmdk-m">${esc(r.meta)}</span>` : ''}</div>`;
    });
    list.innerHTML = html;
    list.classList.toggle('enter', enter); // beim Öffnen gleiten die Zeilen nacheinander herein, beim Tippen blendet die Liste nur weich um
    if (!enter) list.animate?.([{ opacity: 0.55 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
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
    input.value = q; build(q, true);
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

  /* ---------- Workspaces (höchstens 3) – im Konto gespeichert (workspaces.v1, wird wie der übrige Browser-Speicher übertragen) ---------- */
  const WS_KEY = 'workspaces.v1', WS_MAX = 3, WS_DOGS = ['general', 'research', 'learn', 'boerse'];
  const wsLoad = () => { try { const o = JSON.parse(localStorage.getItem(WS_KEY) || 'null'); if (o?.list?.length) return o; } catch {} return { list: [{ id: 'main', dog: 'general' }], active: 'main' }; };
  let wsData = wsLoad();
  const wsSave = () => { try { localStorage.setItem(WS_KEY, JSON.stringify(wsData)); } catch {} };
  const wsOf = (id) => wsData.list.find((w) => w.id === id) || wsData.list[0];
  const wsName = (w) => w.name || (w.id === 'main' ? (window.userName?.() || 'Julian') : 'Workspace');
  // Personen im Workspace: Besitzer + angenommene Mitglieder (Einladungen zählen noch nicht)
  const people = (w) => (w.guest ? 0 : 1) + (w.members || []).filter((m) => m.state !== 'pending').length;
  const wsSub = (w) => (w.shared ? `Geteilt · ${people(w)} ${people(w) === 1 ? 'Person' : 'Personen'}` : 'Privat');
  const post = async (path, body) => {
    const r = await fetch(`/api/workspaces/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Das hat nicht geklappt.');
    return j;
  };
  // Stand vom Server übernehmen: geteilte eigene Workspaces bekommen ihre Mitglieder, fremde (guest) kommen dazu oder fallen weg
  function applyShared(o) {
    if (!o?.shared) return;
    const seen = new Set();
    o.shared.forEach((x) => {
      seen.add(x.ws);
      let w = wsData.list.find((y) => y.id === x.ws);
      if (!w && x.mine) return;
      if (!w) { w = { id: x.ws }; wsData.list.push(w); }
      Object.assign(w, { name: x.name, dog: x.dog, shared: true, members: x.members, ...(x.mine ? {} : { guest: true, owner: x.owner, from: x.from }) });
    });
    const gone = wsData.list.filter((w) => w.guest && !seen.has(w.id));
    gone.forEach((w) => { window.dropWorkspaceChats?.(w.id); window.Docs?.forgetWs?.(w.id); });
    wsData.list = wsData.list.filter((w) => !gone.includes(w));
    wsData.list.forEach((w) => { if (!w.guest && !seen.has(w.id) && w.shared) { delete w.shared; delete w.members; } });
    if (!wsData.list.some((w) => w.id === wsData.active)) wsData.active = 'main';
    wsSave(); refreshAll();
  }
  // Tabs oben: nur Chats und Dokumente des aktiven Workspace (Kalender, Aufgaben, Bibliothek bleiben)
  const applyTabs = () => {
    const act = wsData.active;
    document.querySelectorAll('#tabs .tab:not(.uil-tab)').forEach((t) => {
      const kind = t.dataset.view;
      const ws = !kind ? (chatOf(t)?.ws || 'main') : kind === 'doc' ? (window.Docs?.get(t.dataset.doc)?.ws || 'main') : act;
      t.classList.toggle('ws-off', ws !== act);
    });
    const cur = document.querySelector('#tabs .tab.active');
    if (cur?.classList.contains('ws-off')) {
      const next = document.querySelector('#tabs .tab:not(.uil-tab):not(.ws-off):not([hidden]):not([data-view])');
      if (next) activateTab(next); else createTab('Neuer Chat');
    }
  };
  const refreshAll = () => {
    applyTabs();
    window.applyWorkspaceName?.();
    paintAv();
    window.renderSideChats?.();
    window.Docs?.refresh?.();
    if (chatsView?.open) chatsView.render?.();
  };
  const shareSync = (w, patch) => { if (w.shared) post('update', { ws: w.id, owner: w.owner, ...patch }).then(applyShared).catch(() => {}); };
  window.Workspaces = {
    active: () => wsData.active,
    list: () => wsData.list.slice(),
    get: (id) => wsData.list.find((w) => w.id === id) || null,
    label: () => wsName(wsOf(wsData.active)),
    nameOf: (id) => wsName(wsOf(id)),
    sub: (id) => wsSub(wsOf(id)),
    refreshTabs: () => applyTabs(),
    set(id) { if (!wsData.list.some((w) => w.id === id) || id === wsData.active) return; wsData.active = id; wsSave(); refreshAll(); },
    add(name) {
      if (wsData.list.filter((w) => !w.guest).length >= WS_MAX) return null;
      const used = new Set(wsData.list.map((w) => w.dog));
      const w = { id: `w${Date.now().toString(36)}`, name: String(name || 'Workspace').trim().slice(0, 32) || 'Workspace', dog: WS_DOGS.find((d) => !used.has(d)) || 'general' };
      wsData.list.push(w); wsData.active = w.id; wsSave(); refreshAll();
      return w;
    },
    canAdd: () => wsData.list.filter((w) => !w.guest).length < WS_MAX,
    setDog(id, dog) { const w = wsData.list.find((x) => x.id === id); if (!w || !window.PixelDogs?.DOGS?.[dog]) return; w.dog = dog; wsSave(); refreshAll(); shareSync(w, { dog }); },
    rename(id, name) {
      const w = wsData.list.find((x) => x.id === id); if (!w) return;
      const n = String(name).trim().slice(0, 32);
      if (!n || n === wsName(w)) return;
      w.name = n; wsSave(); refreshAll(); shareSync(w, { name: n });
    },
    // Löschen: eigene Chats und Dokumente gehen nicht verloren – sie wandern in den ersten Workspace.
    // Fremder (geteilter) Workspace: austreten – sein Inhalt gehört dem Besitzer und verschwindet nur hier.
    async remove(id) {
      const w = wsData.list.find((x) => x.id === id);
      if (id === 'main' || !w) return;
      if (w.guest) {
        await post('remove', { ws: id, owner: w.owner }).catch(() => {});
        window.dropWorkspaceChats?.(id); window.Docs?.forgetWs?.(id);
      } else {
        if (w.shared) await post('remove', { ws: id }).catch(() => {});
        document.querySelectorAll('#tabs .tab:not(.uil-tab):not([data-view])').forEach((t) => { const c = chatOf(t); if (c?.ws === id) { c.ws = 'main'; c.updated = Date.now(); } });
        (window.Docs?.docs || []).filter((d) => d.ws === id).forEach((d) => window.Docs.update(d.id, { ws: 'main' }));
        window.saveChats?.();
      }
      wsData.list = wsData.list.filter((x) => x.id !== id);
      if (wsData.active === id) wsData.active = 'main';
      wsSave(); refreshAll();
    },
    // Teilen: Einladung an eine E-Mail (der Haupt-Workspace bleibt privat)
    async share(id, email) {
      const w = wsData.list.find((x) => x.id === id); if (!w || w.guest) throw new Error('Nur eigene Workspaces kannst du teilen.');
      const o = await post('share', { ws: { id: w.id, name: wsName(w), dog: w.dog }, email, from: window.userName?.() || '' });
      applyShared(o); return o;
    },
    async unshare(id, email) { applyShared(await post('remove', { ws: id, email })); },
    async load() {
      try { const r = await fetch('/api/workspaces', { cache: 'no-store' }); if (!r.ok) return null; const o = await r.json(); applyShared(o); return o; } catch { return null; }
    },
    async answer(inviteId, accept) {
      const o = await post('answer', { id: inviteId, accept, name: window.userName?.() || '' });
      applyShared(o);
      if (o.joined) { this.set(o.joined.ws); await window.syncSharedChats?.(); }
      return o;
    },
  };
  window.addEventListener('storage', (e) => { if (e.key === WS_KEY) { wsData = wsLoad(); refreshAll(); } });
  // nach dem Laden der Chats/Dokumente einmal die Tabs zuordnen
  window.addEventListener('app-layout-ready', () => setTimeout(applyTabs, 0));
  setTimeout(applyTabs, 2500);

  /* ---------- Workspace-Menü (Name oben links) ---------- */
  const ws = document.querySelector('.sb-ws');
  const av = ws?.querySelector('.sb-ws-av');
  function paintAv() { if (av) av.innerHTML = dog(wsOf(wsData.active).dog, 20); }
  paintAv();
  setTimeout(() => { paintAv(); window.applyWorkspaceName?.(); }, 0); // Hunde-Skript kommt nach diesem Skript
  const pop = document.createElement('div');
  pop.className = 'ws-menu';
  pop.setAttribute('role', 'menu');
  ws?.parentElement?.append(pop);
  let adding = false, renaming = null;
  const draw = () => {
    const rows = wsData.list.map((w) => renaming === w.id
      ? `<div class="ws-row edit"><span class="ws-av">${dog(w.dog, 24)}</span><input class="ws-in" data-rename="${w.id}" value="${esc(wsName(w))}" maxlength="32" aria-label="Name des Workspace" /></div>`
      : `<div class="ws-row${w.id === wsData.active ? ' on' : ''}" data-ws-pick="${w.id}" role="menuitemradio" aria-checked="${w.id === wsData.active}" tabindex="0">
          <span class="ws-av">${dog(w.dog, 24)}</span><span class="ws-t"><b>${esc(wsName(w))}</b><small>${wsSub(w)}</small></span>
          ${w.id === wsData.active ? `<span class="ws-check">${fi('check', 13)}</span>` : ''}</div>`).join('');
    const full = !window.Workspaces.canAdd();
    pop.innerHTML = `${rows}
      ${adding ? `<div class="ws-row edit"><span class="ws-av ws-av-new">${oi('plus', 12)}</span><input class="ws-in" data-new maxlength="32" placeholder="Name des Workspace" aria-label="Name des neuen Workspace" /></div>` : ''}
      <div class="ws-sep"></div>
      ${full ? '<div class="ws-note">Höchstens 3 Workspaces</div>' : `<button type="button" class="ws-mi" data-ws="new">${oi('plus', 12)}<span>Workspace hinzufügen</span></button>`}
      <button type="button" class="ws-mi" data-ws="settings">${oi('settings', 15)}<span>Einstellungen</span></button>`;
    const inp = pop.querySelector('.ws-in');
    if (inp) { setTimeout(() => { inp.focus(); inp.select(); }, 20); }
  };
  const menu = {
    set(on) {
      if (!ws) return;
      if (on) { adding = false; renaming = null; draw(); }
      pop.classList.toggle('open', on);
      if (on) pop.querySelectorAll('.ws-row, .ws-mi, .ws-sep').forEach((n, i) => n.style.setProperty('--i', i));
      ws.classList.toggle('on', on);
      ws.setAttribute('aria-expanded', String(on));
    },
  };
  ws?.addEventListener('click', (e) => { e.stopPropagation(); menu.set(!pop.classList.contains('open')); });
  pop.addEventListener('click', (e) => {
    const ren = e.target.closest('[data-ws-rename]'); if (ren) { e.stopPropagation(); renaming = ren.dataset.wsRename; adding = false; draw(); return; }
    const del = e.target.closest('[data-ws-del]'); if (del) { e.stopPropagation(); window.Workspaces.remove(del.dataset.wsDel); draw(); return; }
    const pick = e.target.closest('[data-ws-pick]'); if (pick) { window.Workspaces.set(pick.dataset.wsPick); menu.set(false); return; }
    const b = e.target.closest('[data-ws]'); if (!b) return;
    if (b.dataset.ws === 'new') { adding = true; renaming = null; draw(); return; }
    menu.set(false);
    if (b.dataset.ws === 'settings') window.Settings?.open();
  });
  pop.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const inp = e.target.closest('.ws-in');
    if (inp && e.key === 'Enter') {
      e.preventDefault();
      if (inp.dataset.new != null) { if (inp.value.trim()) { window.Workspaces.add(inp.value); menu.set(false); } }
      else { window.Workspaces.rename(inp.dataset.rename, inp.value); renaming = null; draw(); }
    }
    if (e.key === 'Escape') { e.preventDefault(); if (adding || renaming) { adding = false; renaming = null; draw(); } else menu.set(false); }
    if (!inp && e.key === 'Enter' && e.target.closest('[data-ws-pick]')) { window.Workspaces.set(e.target.closest('[data-ws-pick]').dataset.wsPick); menu.set(false); }
  });
  document.addEventListener('pointerdown', (e) => { if (!pop.contains(e.target) && !ws?.contains(e.target)) menu.set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.set(false); });

  return { open, close };
})();
window.AppSearch = AppSearch;
