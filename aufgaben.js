/* ===================================================================
   Aufgaben (Englisch „To-dos“) – 18.11. spät: als Board mit vier Reitern
   Offen · In Arbeit · Erledigt · Archiviert. Jede Aufgabe lässt sich öffnen (Titel, Notiz, Datum, Status) und bekommt dort auf Wunsch ein
   Cover wie ein Dokument (Vorlagen, Farben, eigenes Bild, KI – Docs.editor.pickCover); Kalendertermine ebenso.
   - Gespeichert im Browser (localStorage „tasks.items.v1“) – auth.js gleicht das mit dem Konto ab
     (alle Geräte, Homescreen-Widgets über /api/widget).
   - Verschieben: Haken = erledigt, ▶ = in Arbeit, Archiv-Symbol = archivieren, oder die Zeile auf einen Reiter ziehen.
     Die Zeile gleitet zum Reiter, dessen Zahl springt kurz auf.
   =================================================================== */

const Aufgaben = (() => {
  const KEY = 'tasks.items.v1';
  const TABS = [['open', 'Offen'], ['doing', 'In Arbeit'], ['done', 'Erledigt'], ['archived', 'Archiviert']];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const coverBg = (c) => (!c ? '' : typeof c === 'string' ? `center / cover no-repeat url("${c.replace(/"/g, '%22')}")` : window.Docs?.editor?.coverCss?.(c) || '');
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
    return new Date(`${s}T12:00:00`).toLocaleDateString(window.I18n?.lang?.() === 'en' ? 'en-GB' : 'de-DE', { day: 'numeric', month: 'short' });
  };

  /* 18.11. (Vorlage „Kanban card drag“): Board mit vier Spalten nebeneinander – Kopf mit Status-Symbol, Name, Anzahl;
     Karten mit Cover oben, Titel, Notiz-Hinweis und Datum. Nur zum Anzeigen/Ordnen (keine KI-Aktionen).
     Ziehen mit Zeiger (Maus und Finger): Karte hebt sich leicht schräg ab, in der Zielspalte öffnet sich eine Lücke,
     die anderen Karten gleiten weich zur Seite; Loslassen setzt die Karte in die Lücke. Antippen öffnet das Detailfenster. */
  const view = document.createElement('section');
  view.className = 'tk-view au-view';
  view.hidden = true;
  view.setAttribute('aria-label', 'Aufgaben');
  const main = document.createElement('div');
  main.className = 'au-main';
  const SI = { open: icon('f-st-open', 14), doing: icon('f-st-doing', 14), done: icon('f-st-done', 14), archived: icon('f-st-arch', 14) }; // grau, runde Linien
  main.innerHTML = `<header class="au-head"><h1 class="au-title">Aufgaben</h1>
      <label class="au-search">${icon('f-search', 14)}<input type="search" placeholder="Aufgaben durchsuchen" aria-label="Aufgaben durchsuchen" autocomplete="off" /></label><span class="grow"></span>
      <button class="cal-new" type="button" data-au="new" aria-label="Neue Aufgabe">${icon('f-plus')}<span>Neue Aufgabe</span></button></header>
    <div class="au-board">${TABS.map(([k, n]) => `<section class="au-col" data-col="${k}"><div class="au-ch"><span class="au-si">${SI[k]}</span><span class="au-cn">${n}</span><span class="au-n" data-n="${k}"></span></div><div class="au-cards" data-cards="${k}"></div></section>`).join('')}</div>`;
  view.append(main);
  const board = main.querySelector('.au-board');
  main.querySelector('.au-search input').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); render(); });
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function card(t) {
    const st = statusOf(t), over = (st === 'open' || st === 'doing') && t.due && t.due < today(), bg = coverBg(t.cover);
    return `<article class="au-card2 st-${st}${bg ? ' has-cov' : ''}" data-id="${esc(t.id)}" tabindex="0">
      ${bg ? `<div class="au-ccov" style="background:${esc(bg)}"></div>` : ''}
      <button type="button" class="au-edit" data-au="edit" aria-label="Bearbeiten" title="Bearbeiten">${icon('f-pencil', 13)}</button>
      <div class="au-cb"><div class="au-ctr"><span class="au-ct">${esc(t.title)}</span>${st === 'done' ? `<span class="au-ok">${icon('f-check', 9)}</span>` : ''}</div>
      ${(() => { // 19.11.: Titel oben über die ganze Breite, darunter die Tags, darunter Priorität und direkt daneben das Datum (mit Kalender-Symbol)
        const pr = t.priority && t.priority !== 'none' ? (window.UIKit?.PRIOS || []).find((p) => p.id === t.priority) : null;
        const tg = (window.TagMenu?.all?.() || []).filter((g) => (t.tags || []).includes(g.id));
        const tags = tg.length ? `<div class="au-ctags">${tg.slice(0, 3).map((g) => `<span class="lb2-tag" style="--c:${esc(g.c)}"><span>${esc(g.name)}</span></span>`).join('')}${tg.length > 3 ? `<span class="lb2-tag more">+${tg.length - 3}</span>` : ''}</div>` : '';
        const foot = pr || t.due || t.note ? `<div class="au-cm">${pr ? `<span class="au-cprio p-${esc(pr.id)}" title="${esc(pr.name)}">${window.UIKit.prioIcon(pr.id, 13)}</span>` : ''}${t.due ? `<span class="au-cdue${over ? ' over' : ''}">${icon(t.calId ? 'f-calendar' : 'o-calendar', 12)}${esc(dayLabel(t.due))}${t.time ? ` · ${esc(t.time)}` : ''}</span>` : ''}${t.note && !pr && !t.due ? `<span class="au-cnote">${icon('f-file', 12)}<span>Notiz</span></span>` : ''}</div>` : '';
        return tags + foot;
      })()}</div></article>`;
  }
  function counts() {
    TABS.forEach(([k]) => { const n = items.filter((t) => statusOf(t) === k).length; const el = main.querySelector(`[data-n="${k}"]`); if (el) el.textContent = String(n); });
  }
  // Suche oben in der Mitte: Titel, Notiz und Tag-Namen
  let query = '';
  const hit = (t) => {
    if (!query) return true;
    const tags = (window.TagMenu?.all?.() || []).filter((g) => (t.tags || []).includes(g.id)).map((g) => g.name).join(' ');
    return `${t.title} ${t.note || ''} ${tags}`.toLowerCase().includes(query);
  };
  function render() {
    counts();
    TABS.forEach(([k]) => {
      const box = board.querySelector(`[data-cards="${k}"]`);
      const mine = items.filter((t) => statusOf(t) === k && hit(t)).slice(0, 150);
      box.innerHTML = mine.map(card).join('');
    });
  }
  function add(a = {}) {
    const title = String(a.title || '').trim().slice(0, 200); if (!title) return null;
    const st = ['open', 'doing'].includes(a.status) ? a.status : 'open';
    const t = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title, status: st, due: /^\d{4}-\d{2}-\d{2}$/.test(String(a.due || '')) ? a.due : '', created: Date.now(), movedAt: Date.now() };
    items.unshift(t); save(); if (open) render();
    return t;
  }
  // nur noch fürs Detailfenster und Widgets: Status setzen (ohne Fluganimation)
  function move(t, to) {
    if (to === 'del') { items = items.filter((x) => x !== t); save(); render(); return; }
    t.status = to; t.movedAt = Date.now(); if (to === 'done') t.doneAt = Date.now();
    save(); render();
  }
  /* ---------- Ziehen ---------- */
  // FLIP: Positionen merken, DOM ändern, dann jede verschobene Karte von der alten Stelle weich nachgleiten lassen
  const rectsOf = () => new Map([...board.querySelectorAll('.au-card2:not(.au-src), .au-ph')].map((el) => [el, el.getBoundingClientRect()]));
  const flip = (before) => {
    if (reduced()) return;
    before.forEach((r0, el) => { if (!el.isConnected) return; const r1 = el.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top; if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }); });
  };
  let drag = null;
  board.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.au-card2'); if (!c || e.button > 0 || e.target.closest('.au-edit, .au-inl') || c.classList.contains('editing')) return;
    drag = { el: c, id: c.dataset.id, x0: e.clientX, y0: e.clientY, on: false, pid: e.pointerId };
  });
  function begin(e) {
    const c = drag.el, r = c.getBoundingClientRect();
    drag.on = true; drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
    const ghost = c.cloneNode(true); ghost.classList.add('au-ghost'); ghost.style.width = `${r.width}px`;
    ghost.style.left = `${r.left}px`; ghost.style.top = `${r.top}px`;
    document.body.append(ghost); drag.ghost = ghost;
    if (!reduced()) ghost.animate([{ transform: 'none' }, { transform: 'rotate(-2.5deg) scale(1.02)' }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
    const ph = document.createElement('div'); ph.className = 'au-ph'; ph.style.height = `${r.height}px`;
    c.after(ph); c.classList.add('au-src'); drag.ph = ph;
    document.body.classList.add('au-dragging');
    try { board.setPointerCapture(drag.pid); } catch {}
  }
  board.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.on) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; begin(e); }
    e.preventDefault();
    drag.ghost.style.left = `${e.clientX - drag.dx}px`; drag.ghost.style.top = `${e.clientY - drag.dy}px`;
    // Zielspalte und Lücke bestimmen
    const col = [...board.querySelectorAll('.au-col')].find((cl) => { const r = cl.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right; });
    if (!col) return;
    const box = col.querySelector('.au-cards');
    const others = [...box.querySelectorAll('.au-card2:not(.au-src)')];
    const before = others.find((el) => { const r = el.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; }) || null;
    if (drag.ph.parentElement === box && drag.ph.nextElementSibling === before) return;
    if (before && before.previousElementSibling === drag.ph) return;
    const snap = rectsOf();
    box.insertBefore(drag.ph, before);
    board.querySelectorAll('.au-col.over').forEach((x) => x !== col && x.classList.remove('over')); col.classList.add('over');
    flip(snap);
  });
  function finish(cancel) {
    const d = drag; drag = null;
    document.body.classList.remove('au-dragging');
    board.querySelectorAll('.au-col.over').forEach((x) => x.classList.remove('over'));
    const t = items.find((x) => x.id === d.id);
    const box = d.ph.parentElement, to = box?.dataset.cards;
    const end = () => {
      if (!cancel && t && to) {
        // Reihenfolge übernehmen: vor die Karte, die nach der Lücke steht – sonst ans Ende der Spalte
        const nextId = d.ph.nextElementSibling?.classList.contains('au-src') ? d.ph.nextElementSibling.nextElementSibling?.dataset.id : d.ph.nextElementSibling?.dataset.id;
        const changed = statusOf(t) !== to;
        items = items.filter((x) => x !== t);
        if (changed) { t.status = to; t.movedAt = Date.now(); if (to === 'done') t.doneAt = Date.now(); }
        const i = nextId ? items.findIndex((x) => x.id === nextId) : -1;
        if (i >= 0) items.splice(i, 0, t);
        else { const last = items.map((x) => statusOf(x)).lastIndexOf(to); items.splice(last + 1, 0, t); }
        save();
      }
      d.ghost.remove(); render();
      const nc = board.querySelector(`.au-card2[data-id="${CSS.escape(d.id)}"]`);
      if (nc && !cancel && to === 'done' && !reduced()) nc.querySelector('.au-ok')?.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    };
    const target = (cancel ? d.el : d.ph).getBoundingClientRect();
    if (reduced()) return end();
    const g = d.ghost.getBoundingClientRect();
    d.ghost.getAnimations().forEach((a) => a.cancel());
    d.ghost.animate([{ transform: `translate(0, 0) rotate(-2.5deg) scale(1.02)` }, { transform: `translate(${target.left - g.left}px, ${target.top - g.top}px)` }], { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }).finished.then(end, end);
  }
  board.addEventListener('pointerup', (e) => {
    if (!drag) return;
    // einmal antippen: Karte nur auswählen (Stift erscheint) – bearbeitet wird erst über den Stift
    if (!drag.on) { const el = drag.el; drag = null; board.querySelectorAll('.au-card2.sel').forEach((x) => x !== el && x.classList.remove('sel')); el.classList.toggle('sel'); return; }
    finish(false);
  });
  board.addEventListener('pointercancel', () => { if (drag?.on) finish(true); else drag = null; });
  board.addEventListener('click', (e) => {
    const b = e.target.closest('.au-edit'); if (!b) return;
    const c = b.closest('.au-card2'), t = items.find((x) => x.id === c.dataset.id); if (!t || c.classList.contains('editing')) return;
    board.querySelectorAll('.au-card2.editing').forEach((x) => x.classList.remove('editing'));
    const host = document.createElement('div'); host.className = 'au-inl'; c.append(host); c.classList.add('editing');
    detail(t, c, host);
  });
  document.addEventListener('pointerdown', (e) => { if (open && !e.target.closest('.au-card2')) board.querySelectorAll('.au-card2.sel').forEach((x) => x.classList.remove('sel')); });
  board.addEventListener('keydown', (e) => { const c = e.target.closest?.('.au-card2'); if (c && e.key === 'Enter') { const t = items.find((x) => x.id === c.dataset.id); if (t) detail(t); } });

  /* Aufgabe anlegen/öffnen (18.11. spät): dasselbe Fenster wie ein Kalendertermin (Calendar.editTask) – Titel, Beschreibung,
     Status, Priorität, Fällig am, „Im Kalender eintragen“ (legt einen verknüpften Termin an: calId), Tags, Cover */
  function detail(t, anchor = null, inline = null) {
    const C = window.Calendar; if (!C?.editTask) return;
    const ev = t ? { id: t.id, title: t.title, description: t.note || '', date: t.due || '', time: t.time || '', end: t.end || '', status: statusOf(t), priority: t.priority || 'none', tags: t.tags || [], cover: t.cover || '', cal: !!t.calId } : null;
    C.editTask(ev, inline ? null : anchor, {
      onSave(item) {
        let x = t ? items.find((y) => y.id === t.id) : null;
        if (!x) { x = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, created: Date.now(), movedAt: Date.now() }; items.unshift(x); }
        if (x.status && x.status !== item.status) { x.movedAt = Date.now(); if (item.status === 'done') x.doneAt = Date.now(); }
        Object.assign(x, { title: item.title, note: item.description || '', due: item.date || '', time: item.time || '', end: item.end || '', status: item.status || 'open', priority: item.priority || 'none', tags: item.tags || [] });
        if (item.cover) x.cover = item.cover; else delete x.cover;
        // verknüpfter Kalendereintrag: an = anlegen/aktualisieren, aus = entfernen
        if (item.cal && item.date) {
          const evx = C.upsert({ ...(C.events.find((y) => y.id === x.calId) || {}), id: x.calId || '', title: x.title, description: x.note, date: x.due, time: x.time, end: x.end, tags: x.tags, cover: x.cover || '', color: (C.events.find((y) => y.id === x.calId) || {}).color || '#8e8e93', icon: 'f-calendar', task: x.id });
          x.calId = evx.id;
        } else if (x.calId) { C.removeEvent(x.calId); delete x.calId; }
        save(); if (open) render();
      },
      onDelete(id) { const x = items.find((y) => y.id === id); if (x?.calId) C.removeEvent(x.calId); items = items.filter((y) => y.id !== id); save(); if (open) render(); },
    }, inline ? { inline, onClose: () => { if (open) render(); } } : {});
  }
  main.querySelector('[data-au="new"]').addEventListener('click', (e) => detail(null, e.currentTarget));

  window.addEventListener('storage', (e) => { if (e.key === KEY) { items = load(); if (open) render(); } });

  let open = false;
  function show() {
    const panel = document.querySelector('.panel');
    if (panel && !view.isConnected) panel.append(view);
    items = load();
    open = true; view.hidden = false; render();
    document.querySelector('.panel')?.classList.add('view-tasks');
    
  }
  function hide() { if (!open) return; open = false; view.hidden = true; document.querySelector('.panel')?.classList.remove('view-tasks'); }
  window.AppActions = window.AppActions || {};
  window.AppActions.add_task = (a) => { add(a); window.openViewTab?.('tasks'); };
  return { show, hide, add, get items() { return items.slice(); }, get open() { return open; } };
})();
window.Aufgaben = Aufgaben;
