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
  let newDue = '';

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
  const SI = { open: '<span class="au-si si-open"></span>', doing: '<span class="au-si si-doing"></span>', done: `<span class="au-si si-done">${icon('f-check', 9)}</span>`, archived: `<span class="au-si si-arch">${icon('f-archive', 13)}</span>` };
  main.innerHTML = `<header class="au-head"><h1 class="au-title">Aufgaben</h1>
      <form class="au-new" autocomplete="off"><span class="au-plus">${icon('f-plus', 15)}</span><input class="au-in" placeholder="Neue Aufgabe …" maxlength="200" aria-label="Neue Aufgabe" />
      <label class="au-due-btn" title="Fällig am">${icon('o-calendar', 14)}<span class="au-due-l"></span><input type="date" class="au-due-in" aria-label="Fällig am" /></label></form></header>
    <div class="au-board">${TABS.map(([k, n]) => `<section class="au-col" data-col="${k}"><div class="au-ch">${SI[k]}<span class="au-cn">${n}</span><span class="au-n" data-n="${k}"></span></div><div class="au-cards" data-cards="${k}"></div></section>`).join('')}</div>`;
  view.append(main);
  const board = main.querySelector('.au-board'), input = main.querySelector('.au-in'), dueIn = main.querySelector('.au-due-in');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function card(t) {
    const st = statusOf(t), over = (st === 'open' || st === 'doing') && t.due && t.due < today(), bg = coverBg(t.cover);
    return `<article class="au-card2 st-${st}${bg ? ' has-cov' : ''}" data-id="${esc(t.id)}" tabindex="0">
      ${bg ? `<div class="au-ccov" style="background:${esc(bg)}"></div>` : ''}
      <div class="au-cb"><div class="au-ctr"><span class="au-ct">${esc(t.title)}</span>${st === 'done' ? `<span class="au-ok">${icon('f-check', 9)}</span>` : ''}</div>
      ${t.note || t.due ? `<div class="au-cm">${t.note ? `<span class="au-cnote">${icon('f-file', 12)}<span>Notiz</span></span>` : ''}<span class="grow"></span>${t.due ? `<span class="au-cdue${over ? ' over' : ''}">${esc(dayLabel(t.due))}</span>` : ''}</div>` : ''}</div></article>`;
  }
  function counts() {
    TABS.forEach(([k]) => { const n = items.filter((t) => statusOf(t) === k).length; const el = main.querySelector(`[data-n="${k}"]`); if (el) el.textContent = String(n); });
  }
  function render() {
    counts();
    TABS.forEach(([k]) => {
      const box = board.querySelector(`[data-cards="${k}"]`);
      const mine = items.filter((t) => statusOf(t) === k).slice(0, 150);
      box.innerHTML = mine.map(card).join('');
    });
    main.querySelector('.au-due-l').textContent = newDue ? dayLabel(newDue) : '';
    main.querySelector('.au-due-btn').classList.toggle('set', !!newDue);
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
  main.querySelector('.au-new').addEventListener('submit', (e) => {
    e.preventDefault();
    if (add({ title: input.value, due: newDue })) {
      input.value = ''; newDue = ''; dueIn.value = ''; render();
      const c = board.querySelector('[data-cards="open"] .au-card2'); if (c && !reduced()) c.animate([{ opacity: 0, transform: 'translateY(-8px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
  });
  dueIn.addEventListener('change', () => { newDue = dueIn.value; render(); });

  /* ---------- Ziehen ---------- */
  // FLIP: Positionen merken, DOM ändern, dann jede verschobene Karte von der alten Stelle weich nachgleiten lassen
  const rectsOf = () => new Map([...board.querySelectorAll('.au-card2:not(.au-src), .au-ph')].map((el) => [el, el.getBoundingClientRect()]));
  const flip = (before) => {
    if (reduced()) return;
    before.forEach((r0, el) => { if (!el.isConnected) return; const r1 = el.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top; if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }); });
  };
  let drag = null;
  board.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.au-card2'); if (!c || e.button > 0) return;
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
    if (!drag.on) { const t = items.find((x) => x.id === drag.id); drag = null; if (t) detail(t); return; }
    finish(false);
  });
  board.addEventListener('pointercancel', () => { if (drag?.on) finish(true); else drag = null; });
  board.addEventListener('keydown', (e) => { const c = e.target.closest?.('.au-card2'); if (c && e.key === 'Enter') { const t = items.find((x) => x.id === c.dataset.id); if (t) detail(t); } });

  /* Aufgabe öffnen (18.11.): Fenster wie ein Kalendertermin – oben das Cover (wie beim Dokument: Vorlagen, Farben, Bild, KI),
     Titel, Notiz, Fällig am, Status; unten Löschen und Fertig */
  const modal = document.createElement('div');
  modal.className = 'tk-modal au-modal'; modal.hidden = true;
  document.body.append(modal);
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeDetail(); });
  let cur = null;
  function closeDetail(save_ = true) {
    if (!cur) return;
    if (save_) { const f = modal.querySelector('form'); const ti = f.querySelector('[name=title]').value.trim(); if (ti) cur.title = ti; cur.note = f.querySelector('[name=note]').value.trim(); cur.due = f.querySelector('[name=due]').value || ''; save(); }
    cur = null; modal.classList.add('closing');
    setTimeout(() => { modal.hidden = true; modal.classList.remove('closing'); modal.innerHTML = ''; if (open) render(); }, 180);
  }
  function detail(t) {
    cur = t;
    const draw = () => {
      const bg = coverBg(t.cover);
      modal.innerHTML = `<form class="tk-form ce-card au-card" autocomplete="off">
        <div class="ce-cover"${bg ? '' : ' hidden'}><span class="ce-cover-bg" style="background:${esc(bg)}"></span><button type="button" class="ce-cover-x" data-ad="cover-x" aria-label="Cover entfernen">${icon('f-x', 12)}</button></div>
        <div class="ce-headbox au-dhead"><input class="tk-f-title" name="title" value="${esc(t.title)}" placeholder="Titel" maxlength="200" aria-label="Titel" />
          <textarea class="tk-f-notes" name="note" rows="2" placeholder="Notiz hinzufügen" maxlength="1000" aria-label="Notiz">${esc(t.note || '')}</textarea></div>
        <div class="au-drows">
          <label class="au-drow"><span class="au-dl">${icon('o-calendar', 14)}Fällig am</span><input type="date" name="due" value="${esc(t.due || '')}" /></label>
          <div class="au-drow"><span class="au-dl">${icon('o-todo', 14)}Status</span><span class="au-dst">${TABS.map(([k, n]) => `<button type="button" class="${statusOf(t) === k ? 'on' : ''}" data-ad="st" data-st="${k}">${n}</button>`).join('')}</span></div>
          <button type="button" class="au-drow au-dcov" data-ad="cover"><span class="au-dl">${icon('f-image', 14)}${bg ? 'Cover ändern' : 'Cover hinzufügen'}</span>${icon('f-plus', 13)}</button>
        </div>
        <div class="au-dfoot"><button type="button" class="tk-sheet-ib danger" data-ad="del" aria-label="Löschen">${icon('f-trash', 14)}</button><span class="grow"></span><button type="submit" class="au-done">Fertig</button></div>
      </form>`;
    };
    draw();
    modal.hidden = false;
    modal.onclick = (e) => {
      const b = e.target.closest('[data-ad]'); if (!b) return;
      const keep = () => { const f = modal.querySelector('form'); t.title = f.querySelector('[name=title]').value.trim() || t.title; t.note = f.querySelector('[name=note]').value.trim(); t.due = f.querySelector('[name=due]').value || ''; };
      if (b.dataset.ad === 'st') { keep(); t.status = b.dataset.st; t.movedAt = Date.now(); save(); draw(); }
      else if (b.dataset.ad === 'cover') { keep(); window.Docs?.editor?.pickCover?.({ get: () => (t.cover && typeof t.cover === 'object' ? t.cover : null), set: (c) => { t.cover = c || null; if (!c) delete t.cover; save(); if (cur === t) draw(); } }); }
      else if (b.dataset.ad === 'cover-x') { keep(); delete t.cover; save(); draw(); }
      else if (b.dataset.ad === 'del') { items = items.filter((x) => x !== t); save(); closeDetail(false); }
    };
    modal.onsubmit = (e) => { e.preventDefault(); closeDetail(); };
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur && !document.querySelector('.dc-cmodal')) closeDetail(); });

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
