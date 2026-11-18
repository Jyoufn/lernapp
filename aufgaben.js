/* ===================================================================
   Aufgaben (Englisch „To-dos“) – 18.11. spät: als Board mit vier Reitern
   Offen · In Arbeit · Erledigt · Archiviert. Oben ein Banner (Wallpaper) wie das Cover eines Dokuments: Vorlagen, eigene Farben,
   eigenes Bild oder mit KI – dasselbe Fenster wie beim Dokument (Docs.editor.pickCover). Dasselbe Banner gibt es im Kalender (ViewBanner).
   - Gespeichert im Browser (localStorage „tasks.items.v1“, Banner „tasks.banner“) – auth.js gleicht das mit dem Konto ab
     (alle Geräte, Homescreen-Widgets über /api/widget).
   - Verschieben: Haken = erledigt, ▶ = in Arbeit, Archiv-Symbol = archivieren, oder die Zeile auf einen Reiter ziehen.
     Die Zeile gleitet zum Reiter, dessen Zahl springt kurz auf.
   =================================================================== */

/* Banner oben in einer Ansicht (Aufgaben, Kalender): Fläche + beim Darüberfahren „Banner ändern“ */
window.ViewBanner = (key, fallback = { kind: 'preset', id: 'w-ocean' }) => {
  const box = document.createElement('div');
  box.className = 'vb';
  box.innerHTML = '<div class="vb-img"></div><div class="vb-acts"><button type="button" class="vb-btn" data-vb="pick">Banner ändern</button></div>';
  const get = () => { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } };
  const draw = () => {
    const cv = get(), css = cv ? window.Docs?.editor?.coverCss?.(cv) || '' : '';
    box.classList.toggle('empty', !css);
    box.querySelector('.vb-img').style.background = css;
    box.querySelector('.vb-btn').textContent = css ? 'Banner ändern' : 'Banner hinzufügen';
  };
  box.addEventListener('click', (e) => {
    if (!e.target.closest('[data-vb="pick"]')) return;
    window.Docs?.editor?.pickCover?.({ get: () => get(), set: (cv) => { try { localStorage.setItem(key, JSON.stringify(cv || null)); } catch {} draw(); } });
  });
  window.addEventListener('storage', (e) => { if (e.key === key) draw(); });
  box.draw = draw;
  requestAnimationFrame(draw);
  return box;
};

const Aufgaben = (() => {
  const KEY = 'tasks.items.v1';
  const TABS = [['open', 'Offen'], ['doing', 'In Arbeit'], ['done', 'Erledigt'], ['archived', 'Archiviert']];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const statusOf = (t) => t.status || (t.done ? 'done' : 'open'); // ältere Einträge kannten nur done: true/false
  const load = () => { try { const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a.map((t) => ({ ...t, status: statusOf(t) })) : []; } catch { return []; } };
  let items = load();
  const save = () => {
    items.forEach((t) => { t.done = t.status === 'done' || t.status === 'archived'; }); // Widgets/ältere Stände lesen weiter „done“
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
    window.dispatchEvent(new CustomEvent('tasks-changed'));
  };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => iso(new Date());
  const dayLabel = (s) => {
    if (!s) return '';
    const tm = new Date(); tm.setDate(tm.getDate() + 1);
    if (s === today()) return 'Heute';
    if (s === iso(tm)) return 'Morgen';
    return new Date(`${s}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  let tab = 'open', newDue = '';

  const view = document.createElement('section');
  view.className = 'tk-view au-view';
  view.hidden = true;
  view.setAttribute('aria-label', 'Aufgaben');
  const banner = window.ViewBanner('tasks.banner');
  view.append(banner);
  const main = document.createElement('div');
  main.className = 'au-main';
  main.innerHTML = `<header class="au-head"><h1 class="au-title">Aufgaben</h1></header>
    <div class="cs-pill au-tabs" role="tablist" aria-label="Status">${TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}">${n}<span class="au-n" data-n="${k}"></span></button>`).join('')}</div>
    <form class="au-new" autocomplete="off"><span class="au-plus">${icon('f-plus', 15)}</span><input class="au-in" placeholder="Neue Aufgabe …" maxlength="200" aria-label="Neue Aufgabe" />
      <label class="au-due-btn" title="Fällig am">${icon('o-calendar', 14)}<span class="au-due-l"></span><input type="date" class="au-due-in" aria-label="Fällig am" /></label></form>
    <div class="au-list"></div>`;
  view.append(main);
  const list = main.querySelector('.au-list'), input = main.querySelector('.au-in'), dueIn = main.querySelector('.au-due-in'), tabsEl = main.querySelector('.au-tabs');

  const ACT = {
    open: [['doing', 'f-play', 'In Arbeit'], ['archived', 'f-archive', 'Archivieren']],
    doing: [['open', 'f-back', 'Zurück zu Offen'], ['archived', 'f-archive', 'Archivieren']],
    done: [['open', 'f-undo', 'Wieder öffnen'], ['archived', 'f-archive', 'Archivieren']],
    archived: [['open', 'f-undo', 'Wiederherstellen'], ['del', 'f-trash', 'Endgültig löschen']],
  };
  function row(t) {
    const st = statusOf(t), over = (st === 'open' || st === 'doing') && t.due && t.due < today();
    return `<div class="au-row st-${st}" data-id="${esc(t.id)}" draggable="true">
      <button type="button" class="au-check" data-au="${st === 'done' ? 'open' : 'done'}" aria-label="${st === 'done' ? 'Nicht erledigt' : 'Erledigt'}">${icon('f-check', 11)}</button>
      <span class="au-t" data-au="edit">${esc(t.title)}</span>
      ${t.due ? `<span class="au-due${over ? ' over' : ''}">${esc(dayLabel(t.due))}</span>` : ''}
      <span class="au-acts">${ACT[st].map(([to, ic, label]) => `<button type="button" class="au-a" data-au="${to}" aria-label="${label}" title="${label}">${icon(ic, 13)}</button>`).join('')}</span></div>`;
  }
  function counts() {
    TABS.forEach(([k]) => { const n = items.filter((t) => statusOf(t) === k).length; const el = main.querySelector(`[data-n="${k}"]`); if (el) el.textContent = n ? String(n) : ''; });
  }
  function render(dir = 0) {
    tabsEl.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    counts();
    const mine = items.filter((t) => statusOf(t) === tab);
    let html = '';
    if (tab === 'open') {
      const t0 = today();
      const groups = [
        ['Überfällig', mine.filter((t) => t.due && t.due < t0)],
        ['Heute', mine.filter((t) => t.due === t0)],
        ['Demnächst', mine.filter((t) => t.due && t.due > t0).sort((a, b) => a.due.localeCompare(b.due))],
        ['Ohne Datum', mine.filter((t) => !t.due)],
      ].filter(([, l]) => l.length);
      html = groups.map(([name, l]) => `<section class="au-group"><h2 class="au-gh">${name}</h2>${l.map(row).join('')}</section>`).join('');
    } else {
      const sorted = tab === 'doing' ? mine.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')) : mine.sort((a, b) => (b.movedAt || 0) - (a.movedAt || 0));
      html = sorted.length ? `<section class="au-group">${sorted.slice(0, 200).map(row).join('')}</section>` : '';
    }
    const EMPTY = { open: 'Keine offenen Aufgaben', doing: 'Gerade ist nichts in Arbeit', done: 'Noch nichts erledigt', archived: 'Archiv ist leer' };
    list.innerHTML = html || `<div class="au-empty">${EMPTY[tab]}</div>`;
    main.querySelector('.au-new').hidden = tab === 'done' || tab === 'archived';
    main.querySelector('.au-due-l').textContent = newDue ? dayLabel(newDue) : '';
    main.querySelector('.au-due-btn').classList.toggle('set', !!newDue);
    if (dir && !matchMedia('(prefers-reduced-motion: reduce)').matches) list.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
  function add(a = {}) {
    const title = String(a.title || '').trim().slice(0, 200); if (!title) return null;
    const st = ['open', 'doing'].includes(a.status) ? a.status : 'open';
    const t = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title, status: st, due: /^\d{4}-\d{2}-\d{2}$/.test(String(a.due || '')) ? a.due : '', created: Date.now(), movedAt: Date.now() };
    items.unshift(t); save(); if (open) render();
    return t;
  }
  // Verschieben mit Animation: die Zeile gleitet Richtung Reiter und schrumpft, der Reiter-Zähler springt kurz auf
  function move(t, to, rowEl) {
    if (to === 'del') {
      items = items.filter((x) => x !== t); save();
      if (rowEl) { rowEl.classList.add('out'); setTimeout(render, 220); } else render();
      return;
    }
    t.status = to; t.movedAt = Date.now(); if (to === 'done') t.doneAt = Date.now();
    save();
    const target = tabsEl.querySelector(`[data-tab="${to}"]`);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!rowEl || !target || reduced) { render(); return; }
    rowEl.classList.add('moving', `to-${to}`);
    const r = rowEl.getBoundingClientRect(), tr = target.getBoundingClientRect();
    const dx = tr.left + tr.width / 2 - (r.left + r.width / 2), dy = tr.top + tr.height / 2 - (r.top + r.height / 2);
    const h = r.height;
    const fly = rowEl.animate([
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx * 0.15}px, ${dy * 0.1}px) scale(0.98)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.22)`, opacity: 0 },
    ], { duration: 520, easing: 'cubic-bezier(0.55, 0, 0.3, 1)', fill: 'forwards' });
    // Platz darunter schließt sich weich
    const gap = document.createElement('div'); gap.className = 'au-gap'; gap.style.height = `${h}px`;
    fly.finished.then(() => {
      rowEl.replaceWith(gap);
      gap.animate([{ height: `${h}px` }, { height: '0px' }], { duration: 220, easing: 'ease-out' }).finished.then(() => render(), () => render());
      counts();
      const n = target.querySelector('.au-n');
      n?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    }, () => render());
  }
  main.querySelector('.au-new').addEventListener('submit', (e) => {
    e.preventDefault();
    if (add({ title: input.value, due: newDue, status: tab === 'doing' ? 'doing' : 'open' })) { input.value = ''; newDue = ''; dueIn.value = ''; render(); }
  });
  dueIn.addEventListener('change', () => { newDue = dueIn.value; render(); });
  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b || b.dataset.tab === tab) return;
    const order = TABS.map(([k]) => k), dir = order.indexOf(b.dataset.tab) > order.indexOf(tab) ? 1 : -1;
    tab = b.dataset.tab; render(dir);
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-au]'); if (!b) return;
    const r = b.closest('.au-row'), t = r && items.find((x) => x.id === r.dataset.id); if (!t) return;
    const what = b.dataset.au;
    if (what === 'edit') {
      if (statusOf(t) === 'archived') return;
      const inp = document.createElement('input');
      inp.className = 'au-edit'; inp.value = t.title; inp.maxLength = 200;
      b.replaceWith(inp); inp.focus(); inp.select();
      const done = (keep) => { if (keep && inp.value.trim()) { t.title = inp.value.trim(); save(); } render(); };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true));
      return;
    }
    if (what === 'done') r.classList.add('ticked'); // Haken kurz zeigen, dann gleitet die Zeile zu „Erledigt“
    setTimeout(() => move(t, what, r), what === 'done' ? 260 : 0);
  });
  // Ziehen auf einen Reiter
  let dragId = '';
  list.addEventListener('dragstart', (e) => { const r = e.target.closest('.au-row'); if (!r) return; dragId = r.dataset.id; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch {} });
  list.addEventListener('dragend', () => { list.querySelector('.dragging')?.classList.remove('dragging'); tabsEl.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop')); dragId = ''; });
  tabsEl.addEventListener('dragover', (e) => { const b = e.target.closest('[data-tab]'); if (!b || !dragId) return; e.preventDefault(); tabsEl.querySelectorAll('.drop').forEach((x) => x !== b && x.classList.remove('drop')); b.classList.add('drop'); });
  tabsEl.addEventListener('dragleave', (e) => { e.target.closest?.('[data-tab]')?.classList.remove('drop'); });
  tabsEl.addEventListener('drop', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b || !dragId) return; e.preventDefault(); b.classList.remove('drop');
    const t = items.find((x) => x.id === dragId), r = list.querySelector(`.au-row[data-id="${CSS.escape(dragId)}"]`);
    if (t && statusOf(t) !== b.dataset.tab) move(t, b.dataset.tab, r);
  });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { items = load(); if (open) render(); } });

  let open = false;
  function show() {
    const panel = document.querySelector('.panel');
    if (panel && !view.isConnected) panel.append(view);
    items = load();
    open = true; view.hidden = false; banner.draw(); render();
    document.querySelector('.panel')?.classList.add('view-tasks');
    setTimeout(() => { if (open && !matchMedia('(hover: none)').matches && tab === 'open') input.focus({ preventScroll: true }); }, 60);
  }
  function hide() { if (!open) return; open = false; view.hidden = true; document.querySelector('.panel')?.classList.remove('view-tasks'); }
  window.AppActions = window.AppActions || {};
  window.AppActions.add_task = (a) => { add(a); window.openViewTab?.('tasks'); };
  return { show, hide, add, get items() { return items.slice(); }, get open() { return open; } };
})();
window.Aufgaben = Aufgaben;
