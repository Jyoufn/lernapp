/* ===================================================================
   Aufgaben (18.11., wieder da – Englisch „To-dos“): eigene Ansicht als Tab wie der Kalender.
   - Gespeichert im Browser (localStorage „tasks.items.v1“) – auth.js gleicht das mit dem Konto ab, also auf allen Geräten gleich
     und auch für die Homescreen-Widgets (/api/widget) lesbar.
   - Oben ein Feld „Neue Aufgabe …“ (Enter legt an), daneben optional ein Datum. Darunter Gruppen: Überfällig · Heute · Demnächst · Ohne Datum,
     ganz unten „Erledigt“ (eingeklappt). Runder Haken zum Abhaken, Text antippen = umbenennen, × löscht.
   Die KI kann Aufgaben anlegen (AppActions.add_task).
   =================================================================== */
const Aufgaben = (() => {
  const KEY = 'tasks.items.v1';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const load = () => { try { const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; } catch { return []; } };
  let items = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} window.dispatchEvent(new CustomEvent('tasks-changed')); };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => iso(new Date());
  const dayLabel = (s) => {
    if (!s) return '';
    const t = today(), d = new Date(`${s}T12:00:00`), tm = new Date(); tm.setDate(tm.getDate() + 1);
    if (s === t) return 'Heute';
    if (s === iso(tm)) return 'Morgen';
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  let doneOpen = false, newDue = '';

  const view = document.createElement('section');
  view.className = 'tk-view au-view';
  view.hidden = true;
  view.setAttribute('aria-label', 'Aufgaben');
  view.innerHTML = `<header class="au-head"><h1 class="au-title">Aufgaben</h1><span class="au-count"></span></header>
    <form class="au-new" autocomplete="off"><span class="au-plus">${icon('f-plus', 15)}</span><input class="au-in" placeholder="Neue Aufgabe …" maxlength="200" aria-label="Neue Aufgabe" />
      <label class="au-due-btn" title="Fällig am">${icon('o-calendar', 14)}<span class="au-due-l"></span><input type="date" class="au-due-in" aria-label="Fällig am" /></label></form>
    <div class="au-list"></div>`;
  const list = view.querySelector('.au-list'), input = view.querySelector('.au-in'), dueIn = view.querySelector('.au-due-in');

  function row(t) {
    const over = !t.done && t.due && t.due < today();
    return `<div class="au-row${t.done ? ' done' : ''}" data-id="${esc(t.id)}">
      <button type="button" class="au-check" data-au="toggle" aria-label="${t.done ? 'Nicht erledigt' : 'Erledigt'}">${icon('f-check', 11)}</button>
      <span class="au-t" data-au="edit">${esc(t.title)}</span>
      ${t.due ? `<span class="au-due${over ? ' over' : ''}">${esc(dayLabel(t.due))}</span>` : ''}
      <button type="button" class="au-x" data-au="del" aria-label="Löschen">${icon('f-x', 12)}</button></div>`;
  }
  function render() {
    const open = items.filter((t) => !t.done), done = items.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const t0 = today();
    const groups = [
      ['Überfällig', open.filter((t) => t.due && t.due < t0)],
      ['Heute', open.filter((t) => t.due === t0)],
      ['Demnächst', open.filter((t) => t.due && t.due > t0).sort((a, b) => a.due.localeCompare(b.due))],
      ['Ohne Datum', open.filter((t) => !t.due)],
    ].filter(([, l]) => l.length);
    view.querySelector('.au-count').textContent = open.length ? `${open.length} offen` : '';
    list.innerHTML = (groups.length ? groups.map(([name, l]) => `<section class="au-group"><h2 class="au-gh">${name}</h2>${l.map(row).join('')}</section>`).join('')
      : '<div class="au-empty">Keine offenen Aufgaben</div>')
      + (done.length ? `<section class="au-group au-donegrp${doneOpen ? ' open' : ''}"><button type="button" class="au-gh au-toggle" data-au="donegrp">${icon('f-chevron-right', 11)}Erledigt <span>${done.length}</span></button><div class="au-donelist">${done.slice(0, 50).map(row).join('')}</div></section>` : '');
    const dl = view.querySelector('.au-due-l');
    dl.textContent = newDue ? dayLabel(newDue) : '';
    view.querySelector('.au-due-btn').classList.toggle('set', !!newDue);
  }
  function add(a = {}) {
    const title = String(a.title || '').trim().slice(0, 200); if (!title) return null;
    const t = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title, done: false, due: /^\d{4}-\d{2}-\d{2}$/.test(String(a.due || '')) ? a.due : '', created: Date.now() };
    items.unshift(t); save(); if (open) render();
    return t;
  }
  view.querySelector('.au-new').addEventListener('submit', (e) => {
    e.preventDefault();
    if (add({ title: input.value, due: newDue })) { input.value = ''; newDue = ''; dueIn.value = ''; render(); }
  });
  dueIn.addEventListener('change', () => { newDue = dueIn.value; render(); });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-au]'); if (!b) return;
    if (b.dataset.au === 'donegrp') { doneOpen = !doneOpen; b.parentElement.classList.toggle('open', doneOpen); return; }
    const r = b.closest('.au-row'), t = r && items.find((x) => x.id === r.dataset.id); if (!t) return;
    if (b.dataset.au === 'toggle') {
      t.done = !t.done; t.doneAt = t.done ? Date.now() : 0;
      r.classList.toggle('done', t.done);
      save(); setTimeout(render, 380); // kurz abgehakt stehen lassen, dann einsortieren
    } else if (b.dataset.au === 'del') { items = items.filter((x) => x !== t); save(); r.classList.add('out'); setTimeout(render, 200); }
    else if (b.dataset.au === 'edit' && !t.done) {
      const inp = document.createElement('input');
      inp.className = 'au-edit'; inp.value = t.title; inp.maxLength = 200;
      b.replaceWith(inp); inp.focus(); inp.select();
      const done = (keep) => { if (keep && inp.value.trim()) { t.title = inp.value.trim(); save(); } render(); };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true));
    }
  });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { items = load(); if (open) render(); } });
  window.addEventListener('account-storage-applied', () => { items = load(); if (open) render(); });

  let open = false;
  function show() {
    const panel = document.querySelector('.panel');
    if (panel && !view.isConnected) panel.append(view);
    items = load();
    open = true; view.hidden = false; render();
    document.querySelector('.panel')?.classList.add('view-tasks');
    setTimeout(() => { if (open && !matchMedia('(hover: none)').matches) input.focus({ preventScroll: true }); }, 60);
  }
  function hide() { if (!open) return; open = false; view.hidden = true; document.querySelector('.panel')?.classList.remove('view-tasks'); }
  window.AppActions = window.AppActions || {};
  window.AppActions.add_task = (a) => { add(a); window.openViewTab?.('tasks'); };
  return { show, hide, add, get items() { return items.slice(); }, get open() { return open; } };
})();
window.Aufgaben = Aufgaben;
