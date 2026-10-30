/* ===================================================================
   Aufgaben (Seitenleiste → „Tasks“, erscheint als eigener Tab)
   - Haupt-Ansicht als Liste: Blöcke nach Fälligkeit (Überfällig, Heute, Nächste 7 Tage, Später, Ohne Datum),
     jede Aufgabe eine Zeile mit Kreis zum Abhaken; „Erledigt“ unten zum Aufklappen. Kein Status mehr.
   - Dokument-Block „Aufgaben-Board“ behält die Spalten (createBoard ohne list)
   - oben rechts nur Icons: Suche, Filter, Neue Aufgabe
   - Anlegen/Bearbeiten in einem flachen Fenster oben (Titel, Notizen, darunter Pillen
     für Status, Priorität, Datum und Tags – jede öffnet ihr Menü direkt darunter)
   - Tags legt man selbst an und wählt die Farbe; gespeichert im Browser (localStorage)
   - Aufgaben an die Agenten: im Fenster den Agenten wählen (und ob das Ergebnis ein Chat oder ein Dokument wird).
     Der Server arbeitet die Aufgabe ab – auch wenn die App geschlossen ist (lib/agenttasks.js). Die Karte wandert
     von selbst: Offen → In Arbeit (Agent arbeitet) → Prüfen (Ergebnis öffnen). Kein „+“ je Spalte mehr.
   =================================================================== */
const Tasks = (() => {
  const KEY = 'tasks.v1';
  const TAG_KEY = 'tasks.tags.v1';
  const ALL_COLS = [
    { id: 'backlog', name: 'Offen', c: '#8a8a8a' },
    { id: 'doing', name: 'In Arbeit', c: '#3b8cff' },
    { id: 'review', name: 'Prüfen', c: '#f59e0b' },
    { id: 'done', name: 'Erledigt', c: '#34c779' },
  ];
  const TAG_COLORS = ['#6aa8ff', '#b49cff', '#f472b6', '#f07a6e', '#f0913a', '#facc15', '#4fcf8a', '#2dd4bf', '#a3a3a3'];
  // Priorität: Balken werden von Stufe zu Stufe kräftiger orange, „Dringend“ rot mit Ausrufezeichen
  const PRIOS = [
    { id: 'none', name: 'Keine' },
    { id: 'low', name: 'Niedrig' },
    { id: 'medium', name: 'Mittel' },
    { id: 'high', name: 'Hoch' },
    { id: 'urgent', name: 'Dringend' },
  ];
  const BAR_OFF = '#4a4a4a';
  const prioIcon = (id, s = 14) => {
    const bars = (fills) => [[1.5, 9, 3, 5], [6.5, 6, 3, 8], [11.5, 3, 3, 11]].map(([x, y, w, h], i) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${fills[i]}"/>`).join('');
    const inner = {
      none: '<circle cx="3" cy="8" r="1.4" fill="#6a6a6a"/><circle cx="8" cy="8" r="1.4" fill="#6a6a6a"/><circle cx="13" cy="8" r="1.4" fill="#6a6a6a"/>',
      low: bars(['#e8762c', BAR_OFF, BAR_OFF]),
      medium: bars(['#f2a46b', '#ee7a22', BAR_OFF]),
      high: bars(['#f2a46b', '#f08a3e', '#f2701a']),
      urgent: '<rect x="1.5" y="9" width="3" height="5" rx="1" fill="#f19999"/><rect x="6.5" y="6" width="3" height="8" rx="1" fill="#ef6464"/><rect x="11.5" y="2" width="3" height="8" rx="1.2" fill="#ef4444"/><circle cx="13" cy="12.8" r="1.5" fill="#ef4444"/>',
    }[id] || '';
    return `<svg class="tk-pi" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
  };
  const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

  let tags = []; // { id, name, c } – selbst angelegt
  try { tags = JSON.parse(localStorage.getItem(TAG_KEY)) || []; } catch {}
  // Tags teilen sich alle Boards und Dokumente (gleicher Speicher, Änderung wird gemeldet)
  const saveTags = () => {
    try { localStorage.setItem(TAG_KEY, JSON.stringify(tags)); } catch {}
    window.dispatchEvent(new CustomEvent('tags-changed', { detail: 'tasks' }));
  };
  window.addEventListener('tags-changed', (e) => { if (e.detail !== 'tasks') { try { tags = JSON.parse(localStorage.getItem(TAG_KEY)) || []; } catch {} } });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 13) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const byId = (list, id) => list.find((x) => x.id === id) || list[0];
  const tagOf = (id) => tags.find((g) => g.id === id);
  const newId = (p = 't') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const pad2 = (n) => String(n).padStart(2, '0');

  // Datum als kurzer Text + Farbe: heute orange, überfällig rot, sonst grau
  function dueInfo(date, done) {
    if (!date) return null;
    const d = new Date(`${date}T12:00:00`), today = new Date(); today.setHours(12, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    const text = diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : diff === -1 ? 'Gestern' : `${d.getDate()}. ${MONTHS[d.getMonth()]}${d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
    return { text, diff, cls: done ? '' : diff < 0 ? ' late' : diff === 0 ? ' today' : '' };
  }

  // Filter-Symbol: drei Linien, die nach unten kürzer werden (wie in macOS)
  const SLIDERS = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3"/></g></svg>';

  /* ---------- Fenster: flach, oben in der Mitte (eins für alle Boards) ---------- */
  const modal = document.createElement('div');
  modal.className = 'tk-modal';
  modal.hidden = true;
  document.body.append(modal);
  function close() {
    if (modal.hidden) return;
    modal.classList.add('closing');
    setTimeout(() => { modal.hidden = true; modal.classList.remove('closing'); modal.replaceChildren(); }, 220);
  }
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) { if (modal.querySelector('.tk-pop.open')) modal.querySelectorAll('.tk-pop.open').forEach((p) => p.classList.remove('open')); else close(); } });
  document.addEventListener('click', () => document.querySelectorAll('.tk-filter-wrap.open').forEach((w) => w.classList.remove('open')));

  /* ---------- Board: dieselbe Ansicht für „Tasks“ (Browser) und für Dokument-Blöcke (Speicher im Dokument)
     store = { load() → Liste, save(liste) } ---------- */
  // cols = nur diese Spalten (z. B. im Dokument ohne „Prüfen“); Aufgaben aus fehlenden Spalten landen in „In Arbeit“
  // agents = Aufgaben können an einen Agenten gehen (nur das Haupt-Board „Aufgaben“)
  const AGENT_NAMES = { general: 'Allgemein', learn: 'Lernen', research: 'Research', boerse: 'Börse' };
  const dog = (id, s = 20) => (window.PixelDogs?.svg ? window.PixelDogs.svg(id, s) : '');
  // list = Liste statt Spalten (Haupt-Ansicht „Aufgaben“): nur offen / erledigt, Blöcke nach Fälligkeit, Kreis zum Abhaken
  function createBoard(store, { title = 'Aufgaben', cls = '', cols = null, agents = false, list: listMode = false } = {}) {
  if (listMode) cols = ['backlog', 'done'];
  const COLS = cols ? ALL_COLS.filter((c) => cols.includes(c.id)) : ALL_COLS;
  const hasCol = (id) => COLS.some((c) => c.id === id);
  let tasks = store.load() || [];
  tasks.forEach((t) => { if (!Array.isArray(t.tags)) t.tags = t.tag ? [t.tag] : []; delete t.tag; if (!COLS.some((c) => c.id === t.status)) t.status = COLS.some((c) => c.id === 'doing') ? 'doing' : COLS[0].id; });
  const save = () => { store.save(tasks); saveTags(); };
  const filter = { q: '', tags: new Set(), prios: new Set(), due: '' };
  const view = document.createElement('section');
  view.className = `tk-view${listMode ? ' tk-listmode' : ''}${cls ? ` ${cls}` : ''}`;
  view.setAttribute('aria-label', title || 'Aufgaben');
  view.innerHTML = `<header class="tk-head">
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      <div class="tk-tools">
        <label class="tk-search">${fi('search', 13)}<input type="search" placeholder="Titel suchen" aria-label="Aufgaben nach Titel suchen" /></label>
        <div class="tk-filter-wrap">
          <button type="button" class="tk-ib" data-act="filter" aria-haspopup="menu" aria-label="Filter" title="Filter">${SLIDERS}<b class="tk-fcount" hidden></b></button>
          <div class="tk-filter" role="menu"></div>
        </div>
        <button type="button" class="tk-new" data-act="new" title="Neue Aufgabe">${fi('plus', 13)}<span>Neue Aufgabe</span></button>
      </div>
    </header>
    ${listMode ? `<div class="tk-board tk-lst"></div>` : '<div class="tk-board"></div>'}`;
  const board = view.querySelector('.tk-board');
  const search = view.querySelector('.tk-search input');
  const fbox = view.querySelector('.tk-filter');

  const matches = (t) => {
    if (filter.q && !t.title.toLowerCase().includes(filter.q)) return false; // Suche nur im Titel
    if (filter.tags.size && !t.tags.some((x) => filter.tags.has(x))) return false;
    if (filter.prios.size && !filter.prios.has(t.prio || 'none')) return false;
    if (filter.due) {
      const d = dueInfo(t.date);
      if (filter.due === 'today' && !(d && d.diff <= 0)) return false;
      if (filter.due === 'week' && !(d && d.diff <= 7)) return false;
      if (filter.due === 'none' && d) return false;
    }
    return true;
  };

  // Karte: Tags + Stift oben, Titel, Notiz, Trennlinie, unten Datum · Fortschritt · Priorität
  function card(t) {
    const prio = byId(PRIOS, t.prio), due = dueInfo(t.date, t.status === 'done');
    const ts = t.tags.map(tagOf).filter(Boolean);
    const pr = Math.max(0, Math.min(100, t.progress || 0));
    const el = document.createElement('div');
    el.className = `tk-card${t.status === 'done' ? ' done' : ''}${ts.length ? '' : ' notags'}`;
    el.dataset.id = t.id;
    el.draggable = true;
    el.tabIndex = 0;
    // Fortschritt unten in Grau als gefülltes Icon: dünner Kreis, innen ein Tortenstück so groß wie der Fortschritt
    const pie = (p) => {
      if (p >= 100) return '<circle cx="8" cy="8" r="4" fill="currentColor"/>';
      const a = (p / 100) * 2 * Math.PI, x = 8 + 4 * Math.sin(a), y = 8 - 4 * Math.cos(a);
      return `<path d="M8 8V4A4 4 0 ${p > 50 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z" fill="currentColor"/>`;
    };
    const prog = pr ? `<span class="tk-prog" title="Fortschritt ${pr} %"><svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/>${pie(pr)}</svg>${pr} %</span>` : '';
    el.innerHTML = `<button type="button" class="tk-edit" data-edit aria-label="Bearbeiten" title="Bearbeiten">${fi('pencil', 12)}</button>
      ${ts.length ? `<div class="tk-tags">${ts.map((g) => `<span class="tk-tag" style="--c:${g.c}"><i class="tag-dot"></i>${esc(g.name)}</span>`).join('')}</div>` : ''}
      <div class="tk-title-row"><div class="tk-title">${esc(t.title)}</div></div>
      ${t.notes ? `<div class="tk-notes">${esc(t.notes)}</div>` : ''}
      <div class="tk-foot">
        ${due ? `<span class="tk-due${due.cls}">${fi('calendar', 12)}${due.text}</span>` : ''}
        ${t.comments?.length ? `<span class="tk-cmc" title="${t.comments.length} Kommentar${t.comments.length > 1 ? 'e' : ''}">${fi('chat', 12)}${t.comments.length}</span>` : ''}
        ${prog}
        ${prio.id !== 'none' ? `<span class="tk-prio${prio.id === 'urgent' ? ' urgent' : ''}" title="Priorität: ${prio.name}">${prioIcon(prio.id, 13)}<span class="tk-pn">${prio.name}</span></span>` : ''}
      </div>`;
    if (agents && t.agent && AGENT_NAMES[t.agent]) el.querySelector('.tk-title-row').after(agentRow(t));
    if (!el.querySelector('.tk-foot').children.length) el.querySelector('.tk-foot').remove();
    return el;
  }
  // Zeile auf der Karte: welcher Agent, was er gerade tut, und am Ende der Knopf zum Ergebnis
  function agentRow(t) {
    const r = t.run || {}, row = document.createElement('div');
    row.className = `tk-agent ${r.state || 'idle'}`;
    const what = t.output === 'doc' ? 'Dokument' : 'Chat';
    const state = r.state === 'done' ? `<button type="button" class="tk-res" data-result="${t.id}">${fi(t.output === 'doc' ? 'file' : 'chat', 12)}${what} öffnen</button>`
      : r.state === 'failed' ? `<span class="tk-ast">${esc(r.error || 'Hat nicht geklappt')}</span><button type="button" class="tk-res" data-retry="${t.id}">Nochmal</button>`
      : r.state === 'queued' || r.state === 'running' ? '<span class="tk-ast"><span class="spinner"></span>Arbeitet …</span>'
      : '';
    row.innerHTML = `<span class="tk-dog">${dog(t.agent, 20)}</span><span class="tk-an">${AGENT_NAMES[t.agent]}</span>${state}`;
    return row;
  }
  /* ---------- Listen-Ansicht: Blöcke nach Fälligkeit, jede Aufgabe eine Zeile mit Kreis zum Abhaken ---------- */
  const GROUPS = [
    { id: 'late', name: 'Überfällig', test: (d) => d && d.diff < 0 },
    { id: 'today', name: 'Heute', test: (d) => d && d.diff === 0 },
    { id: 'soon', name: 'Diese Woche', test: (d) => d && d.diff > 0 && d.diff <= 7 },
    { id: 'later', name: 'Später', test: (d) => d && d.diff > 7 },
    { id: 'none', name: 'Ohne Datum', test: (d) => !d },
  ];
  const PRIO_RANK = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
  const DONE_KEY = 'tasks.doneOpen.v1';
  let doneOpen = false;
  try { doneOpen = localStorage.getItem(DONE_KEY) === '1'; } catch {}
  const CHECK = '<svg class="tk-ck-mark" width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Zeile wie in der Vorlage: Kreis · Titel (Notiz klein darunter) · rechts Datums-Chip (heute blau, überfällig rot) und Flagge für die Priorität
  const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const FLAG = { urgent: '#f07a6e', high: '#f07a6e', medium: '#fb9a52', low: '#facc15' };
  const dueChip = (t, done) => {
    const d = dueInfo(t.date, done); if (!d) return '';
    const text = d.diff > 1 && d.diff <= 6 ? WD_LONG[new Date(`${t.date}T12:00:00`).getDay()] : d.text;
    return `<span class="tk-chip due${d.cls}">${fi('calendar', 11)}${text}</span>`;
  };
  function row(t) {
    const done = t.status === 'done', prio = byId(PRIOS, t.prio);
    const ts = t.tags.map(tagOf).filter(Boolean);
    const el = document.createElement('div');
    el.className = `tk-row${done ? ' done' : ''}`;
    el.dataset.id = t.id;
    el.tabIndex = 0;
    const chips = [
      ...ts.slice(0, 2).map((g) => `<span class="tk-chip tag" style="--c:${g.c}"><i class="tag-dot"></i>${esc(g.name)}</span>`),
      t.comments?.length ? `<span class="tk-chip">${fi('chat', 11)}${t.comments.length}</span>` : '',
      dueChip(t, done),
      FLAG[prio.id] ? `<span class="tk-flag${prio.id === 'urgent' ? ' urgent' : ''}" style="--c:${FLAG[prio.id]}" aria-label="Priorität ${prio.name}">${fi('flag', 11)}</span>` : '',
    ].filter(Boolean).join('');
    el.innerHTML = `<button type="button" class="tk-ck" data-check="${t.id}" role="checkbox" aria-checked="${done}" aria-label="${done ? 'Wieder öffnen' : 'Erledigt'}">${CHECK}</button>
      <div class="tk-row-main">
        <div class="tk-row-title">${esc(t.title)}</div>
        ${t.notes ? `<div class="tk-row-notes">${esc(t.notes)}</div>` : ''}
      </div>
      ${chips ? `<div class="tk-row-chips">${chips}</div>` : ''}`;
    if (agents && t.agent && AGENT_NAMES[t.agent]) el.querySelector('.tk-row-main').append(agentRow(t));
    return el;
  }
  function renderList() {
    const open = tasks.filter((t) => t.status !== 'done' && matches(t));
    const done = tasks.filter((t) => t.status === 'done' && matches(t)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const sortOpen = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || PRIO_RANK[a.prio || 'none'] - PRIO_RANK[b.prio || 'none'] || (a.order ?? 0) - (b.order ?? 0);
    const block = (id, name, items, extra = '') => {
      const g = document.createElement('section');
      g.className = `tk-grp g-${id}${extra}`;
      g.dataset.grp = id;
      g.innerHTML = `<div class="tk-rows"><div class="tk-grp-head"${id === 'done' ? ' data-toggle-done role="button" tabindex="0"' : ''}><span class="tk-grp-n">${name}</span><span class="tk-count">${items.length}</span><span class="grow"></span>${id === 'done' ? `<svg class="tk-grp-chev" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : `<button type="button" class="tk-grp-add" data-grp-add="${id}" aria-label="Aufgabe in „${name}“ anlegen">${fi('plus', 12)}</button>`}</div><div class="tk-rows-in"></div></div>`;
      g.querySelector('.tk-rows-in').append(...items.map(row));
      return g;
    };
    const quick = document.createElement('label');
    quick.className = 'tk-quick';
    quick.innerHTML = `<span class="tk-ck ghost">${fi('plus', 11)}</span><input class="tk-quick-in" placeholder="Aufgabe hinzufügen …" maxlength="120" aria-label="Aufgabe hinzufügen" />`;
    const parts = [quick];
    GROUPS.forEach((gr) => { const items = open.filter((t) => gr.test(dueInfo(t.date))).sort(sortOpen); if (items.length) parts.push(block(gr.id, gr.name, items)); });
    if (!open.length) {
      const e = document.createElement('div');
      e.className = 'tk-empty';
      e.textContent = tasks.some((t) => t.status !== 'done') ? 'Keine Aufgabe passt zum Filter.' : 'Alles erledigt.';
      parts.push(e);
    }
    if (done.length) parts.push(block('done', 'Erledigt', done, doneOpen ? ' open' : ''));
    const keep = document.activeElement?.classList.contains('tk-quick-in');
    board.replaceChildren(...parts);
    if (keep) board.querySelector('.tk-quick-in').focus();
  }
  function toggleDone(id) {
    const t = tasks.find((x) => x.id === id); if (!t) return;
    const el = board.querySelector(`.tk-row[data-id="${id}"]`);
    const nowDone = t.status !== 'done';
    t.status = nowDone ? 'done' : 'backlog';
    if (nowDone) { t.doneAt = Date.now(); t.progress = 100; } else { delete t.doneAt; if (t.progress === 100) t.progress = 0; t.order = -1; }
    normalize(); save();
    if (!el) { render(); return; }
    // erst der Haken, dann gleitet die Zeile weich weg und taucht im anderen Block auf
    el.classList.toggle('done', nowDone);
    el.querySelector('.tk-ck').setAttribute('aria-checked', String(nowDone));
    el.classList.add('leaving');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { render(); board.querySelector(`.tk-row[data-id="${id}"]`)?.classList.add('fresh'); }, reduce ? 0 : 420);
  }
  function quickAdd(input) {
    const title = input.value.trim(); if (!title) return;
    const t = { id: newId(), title: title.slice(0, 120), notes: '', status: 'backlog', tags: [], prio: 'none', date: '', progress: 0, comments: [], order: -1, created: Date.now() };
    tasks.push(t); normalize(); save(); render();
    board.querySelector(`.tk-row[data-id="${t.id}"]`)?.classList.add('fresh');
    board.querySelector('.tk-quick-in')?.focus();
  }
  if (listMode) {
    board.addEventListener('keydown', (e) => {
      if (e.target.matches('.tk-quick-in')) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); quickAdd(e.target); } if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); } return; }
      if (e.key === 'Enter' && e.target.matches('[data-toggle-done]')) e.target.click();
    });
  }

  function render() {
    if (listMode) { renderList(); const n = filter.tags.size + filter.prios.size + (filter.due ? 1 : 0); const fc = view.querySelector('.tk-fcount'); fc.hidden = !n; fc.textContent = n; return; }
    const any = filter.q || filter.tags.size || filter.prios.size || filter.due;
    board.replaceChildren(...COLS.map((col) => {
      const all = tasks.filter((t) => t.status === col.id);
      const list = all.filter(matches).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const c = document.createElement('div');
      c.className = 'tk-col';
      c.dataset.col = col.id;
      c.innerHTML = `<div class="tk-col-head"><i style="background:${col.c}"></i><span>${col.name}</span><span class="tk-count">${any ? `${list.length}/${all.length}` : all.length}</span>${agents ? '' : `<button type="button" class="tk-add" data-add="${col.id}" aria-label="Aufgabe in „${col.name}“ anlegen" title="Neue Aufgabe">${fi('plus', 12)}</button>`}</div><div class="tk-list"></div>`;
      c.querySelector('.tk-list').append(...list.map(card));
      return c;
    }));
    const n = filter.tags.size + filter.prios.size + (filter.due ? 1 : 0);
    const fc = view.querySelector('.tk-fcount');
    fc.hidden = !n; fc.textContent = n;
  }

  /* ---------- Suche + Filter ---------- */
  search.addEventListener('input', () => { filter.q = search.value.trim().toLowerCase(); render(); });
  search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { search.value = ''; filter.q = ''; render(); search.blur(); } });
  const DUES = [['', 'Alle'], ['today', 'Heute fällig oder überfällig'], ['week', 'In den nächsten 7 Tagen'], ['none', 'Ohne Datum']];
  function drawFilter() {
    fbox.innerHTML = (tags.length ? `<div class="tk-fl">Tags</div>${tags.map((g) => `<button type="button" class="tk-fi${filter.tags.has(g.id) ? ' on' : ''}" data-ft="${g.id}"><i style="background:${g.c}"></i><span>${esc(g.name)}</span>${fi('check', 12)}</button>`).join('')}<div class="tk-fsep"></div>` : '')
      + `<div class="tk-fl">Priorität</div>${PRIOS.map((p) => `<button type="button" class="tk-fi${filter.prios.has(p.id) ? ' on' : ''}" data-fp="${p.id}">${prioIcon(p.id)}<span>${p.name}</span>${fi('check', 12)}</button>`).join('')}
      <div class="tk-fsep"></div><div class="tk-fl">Fällig</div>${DUES.map(([v, n]) => `<button type="button" class="tk-fi${filter.due === v ? ' on' : ''}" data-fd="${v}"><span>${n}</span>${fi('check', 12)}</button>`).join('')}
      <div class="tk-fsep"></div><button type="button" class="tk-fi muted" data-fclear><span>Filter zurücksetzen</span></button>`;
  }
  fbox.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('button'); if (!b) return;
    const toggle = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
    if (b.dataset.ft) toggle(filter.tags, b.dataset.ft);
    if (b.dataset.fp) toggle(filter.prios, b.dataset.fp);
    if (b.dataset.fd != null) filter.due = b.dataset.fd;
    if (b.hasAttribute('data-fclear')) { filter.tags.clear(); filter.prios.clear(); filter.due = ''; }
    drawFilter(); render();
  });
  const colorPicker = (...a) => UIKit.colorPicker(...a); // gemeinsamer Farbwähler (ui-kit.js)

  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  function edit(id, status = 'backlog', presetDate = '') {
    const t0 = tasks.find((x) => x.id === id);
    const startAgent = agents && window.PixelDogs && !window.PixelDogs.UNAVAILABLE?.has(window.PixelDogs.mode) && AGENT_NAMES[window.PixelDogs.mode] ? window.PixelDogs.mode : 'general';
    const t = t0 ? { ...t0, tags: [...t0.tags], comments: [...(t0.comments || [])] } : { id: '', title: '', notes: '', status, tags: [], prio: 'none', date: presetDate, progress: 0, comments: [], ...(agents ? { agent: startAgent, output: 'chat' } : {}) };
    const locked = !!(t0?.agent && t0.run && t0.run.state !== 'failed'); // Agent arbeitet schon / ist fertig → Agent nicht mehr wechseln
    if (!PRIOS.some((p) => p.id === t.prio)) t.prio = 'none';
    t.progress = Math.max(0, Math.min(100, t.progress || 0));
    const pill = (k, menu, cls = '') => `<div class="tk-pop" data-k="${k}"><button type="button" class="tk-pill" data-open="${k}"></button><div class="tk-menu ${cls}">${menu}</div></div>`;
    modal.innerHTML = `<form class="tk-form" autocomplete="off">
      <div class="tk-form-head">
        <input class="tk-f-title" name="title" value="${esc(t.title)}" placeholder="Neue Aufgabe" maxlength="120" aria-label="Titel" required />
        <button type="button" class="tk-x" data-act="close" aria-label="Schließen">${fi('x', 12)}</button>
      </div>
      <textarea class="tk-f-notes" name="notes" rows="2" placeholder="Notizen …" maxlength="1000" aria-label="Notizen">${esc(t.notes)}</textarea>
      <div class="tk-pills">
        ${listMode ? '' : pill('status', COLS.map((c) => `<button type="button" class="tk-mi" data-status="${c.id}"><i style="background:${c.c}"></i><span>${c.name}</span>${fi('check', 12)}</button>`).join(''))}
        ${pill('prio', PRIOS.map((p) => `<button type="button" class="tk-mi" data-prio="${p.id}">${prioIcon(p.id, 15)}<span>${p.name}</span>${fi('check', 12)}</button>`).join(''))}
        ${pill('date', '<div class="tk-cal"></div>', 'date')}
        ${pill('tags', `<div class="tk-tag-row"><input class="tk-tag-in" placeholder="Tag suchen oder neu" maxlength="24" aria-label="Tag suchen oder anlegen" /></div><div class="tk-tag-list"></div><div class="tk-side"></div>`, 'tags')}
        ${agents && !locked ? pill('agent', `<button type="button" class="tk-mi" data-tagent=""><span class="tk-mi-ic">${fi('user', 13)}</span><span>Ohne Agent</span>${fi('check', 12)}</button>${Object.entries(AGENT_NAMES).map(([id, n]) => `<button type="button" class="tk-mi" data-tagent="${id}"><span class="tk-mi-ic">${dog(id, 20)}</span><span>${n}</span>${fi('check', 12)}</button>`).join('')}`) : ''}
        ${agents && !locked ? pill('output', `<button type="button" class="tk-mi" data-toutput="chat">${fi('chat', 13)}<span>Ergebnis als Chat</span>${fi('check', 12)}</button><button type="button" class="tk-mi" data-toutput="doc">${fi('file', 13)}<span>Ergebnis als Dokument</span>${fi('check', 12)}</button>`) : ''}
        ${pill('comments', '<div class="tk-cm-list"></div><div class="tk-cm-row"><input class="tk-cm-in" placeholder="Kommentar schreiben …" maxlength="500" aria-label="Kommentar schreiben" /><button type="button" class="tk-tag-plus" data-cm-send aria-label="Kommentar senden" title="Senden">' + fi('arrow-up', 12) + '</button></div>', 'comments')}
      </div>
      <div class="tk-form-foot">
        <div class="tk-progress" title="Fortschritt"${listMode ? ' hidden' : ''}><div class="tk-slider" role="slider" tabindex="0" aria-label="Fortschritt" aria-valuemin="0" aria-valuemax="100"><i class="tk-sl-fill"></i><b class="tk-sl-knob"></b></div><span class="tk-pv"></span></div>
        ${t0 ?`<button type="button" class="tk-del" data-act="delete">${fi('trash', 12)}Löschen</button>` : ''}<button type="submit" class="tk-create">${t0 ? 'Speichern' : 'Aufgabe erstellen'}</button></div>
    </form>`;
    const form = modal.querySelector('form');
    const notes = form.querySelector('.tk-f-notes');
    const grow = () => { notes.style.height = 'auto'; notes.style.height = `${Math.min(notes.scrollHeight, 200)}px`; };
    notes.addEventListener('input', grow);

    /* Pillen beschriften */
    const draw = () => {
      const st = byId(COLS, t.status), pr = byId(PRIOS, t.prio), du = dueInfo(t.date);
      const ts = t.tags.map(tagOf).filter(Boolean);
      const sp = form.querySelector('[data-open="status"]');
      if (sp) sp.innerHTML = `<i style="background:${st.c}"></i>${st.name}`;
      form.querySelector('[data-open="prio"]').innerHTML = `${prioIcon(pr.id, 14)}${pr.id === 'none' ? 'Priorität' : pr.name}`;
      form.querySelector('[data-open="date"]').innerHTML = `${fi('calendar', 13)}${du ? du.text : 'Datum'}`;
      // mehrere Tags: Farbpunkte überlappend, erster Name, „+N“
      form.querySelector('[data-open="tags"]').innerHTML = ts.length
        ? `<span class="tk-dots">${ts.map((g) => `<i style="background:${g.c}"></i>`).join('')}</span>${esc(ts[0].name)}${ts.length > 1 ? `<b>+${ts.length - 1}</b>` : ''}`
        : `${fi('bookmark', 13)}Tags`;
      form.querySelector('[data-open="comments"]').innerHTML = `${fi('chat', 13)}${t.comments.length ? t.comments.length : 'Kommentar'}`;
      form.querySelector('[data-open="comments"]').classList.toggle('empty', !t.comments.length);
      ['date', 'tags'].forEach((k) => form.querySelector(`[data-open="${k}"]`).classList.toggle('empty', k === 'date' ? !t.date : !ts.length));
      form.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('on', b.dataset.status === t.status));
      form.querySelectorAll('[data-prio]').forEach((b) => b.classList.toggle('on', b.dataset.prio === t.prio));
      const ap = form.querySelector('[data-open="agent"]'), op = form.querySelector('[data-open="output"]');
      if (ap) {
        ap.innerHTML = t.agent ? `<span class="tk-dog">${dog(t.agent, 20)}</span>${AGENT_NAMES[t.agent]}` : `${fi('user', 13)}Agent`;
        ap.classList.toggle('empty', !t.agent);
        op.closest('.tk-pop').hidden = !t.agent;
        op.innerHTML = `${fi(t.output === 'doc' ? 'file' : 'chat', 13)}${t.output === 'doc' ? 'Dokument' : 'Chat'}`;
        form.querySelectorAll('[data-tagent]').forEach((b) => b.classList.toggle('on', b.dataset.tagent === (t.agent || '')));
        form.querySelectorAll('[data-toutput]').forEach((b) => b.classList.toggle('on', b.dataset.toutput === t.output));
        form.querySelector('.tk-create').textContent = t0 ? 'Speichern' : t.agent ? 'An Agent geben' : 'Aufgabe erstellen';
      }
    };

    /* Fortschritt: Regler in 5er-Schritten, folgt der Maus und rastet ein */
    const slider = form.querySelector('.tk-slider'), sFill = slider.querySelector('.tk-sl-fill'), sKnob = slider.querySelector('.tk-sl-knob'), pv = form.querySelector('.tk-pv');
    const setProg = (v, anim = true) => {
      t.progress = Math.max(0, Math.min(100, Math.round(v / 5) * 5));
      slider.classList.toggle('drag', !anim);
      sFill.style.width = `${t.progress}%`; sKnob.style.left = `${t.progress}%`;
      pv.textContent = `${t.progress} %`;
      slider.setAttribute('aria-valuenow', t.progress);
    };
    const fromX = (e) => { const r = slider.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * 100; };
    slider.addEventListener('pointerdown', (e) => { slider.setPointerCapture(e.pointerId); setProg(fromX(e), false); });
    slider.addEventListener('pointermove', (e) => { if (slider.hasPointerCapture(e.pointerId)) setProg(fromX(e), false); });
    slider.addEventListener('pointerup', () => setProg(t.progress));
    slider.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setProg(t.progress + 5); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setProg(t.progress - 5); }
    });
    setProg(t.progress);

    /* Datum: kleiner Kalender zum Anklicken (zweiter Klick auf den Tag entfernt das Datum) */
    const calBox = form.querySelector('.tk-cal');
    let calMonth = null;
    const drawCal = () => {
      const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1, 12);
      const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
      const today = isoOf(new Date());
      let cells = '';
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const k = isoOf(d);
        if (i === 35 && d.getMonth() !== calMonth.getMonth()) break; // nur so viele Wochen wie nötig
        cells += `<button type="button" class="${d.getMonth() !== calMonth.getMonth() ? 'other' : ''}${k === today ? ' today' : ''}${k === t.date ? ' on' : ''}" data-day="${k}">${d.getDate()}</button>`;
      }
      calBox.innerHTML = `<div class="tk-cal-head"><span>${MONTHS_LONG[calMonth.getMonth()]} ${calMonth.getFullYear()}</span>
          <button type="button" data-cal="-1" aria-label="Vorheriger Monat">${fi('back', 12)}</button><button type="button" data-cal="1" aria-label="Nächster Monat">${fi('forward', 12)}</button></div>
        <div class="tk-cal-grid">${WD.map((w) => `<span>${w}</span>`).join('')}${cells}</div>`;
    };
    /* Tags: tippen → oben erscheint „„X“ hinzufügen“ → Farbe antippen = angelegt. Ganz rechts eigene Farbe zum Ziehen.
       Bearbeiten (Stift) zum Umbenennen, Umfärben, Löschen */
    const tagIn = form.querySelector('.tk-tag-in'), tagList = form.querySelector('.tk-tag-list');
    let creating = false, editing = null;
    const colorRow = UIKit.colorRow;
    const side = form.querySelector('.tk-side');
    // Bearbeiten öffnet ein eigenes kleines Fenster rechts neben dem Tag-Menü
    const drawSide = () => {
      const g = tagOf(editing);
      side.classList.toggle('open', !!g);
      if (!g) { side.replaceChildren(); return; }
      side.innerHTML = `<div class="tk-side-head"><span>Tag bearbeiten</span><button type="button" class="tk-x sm2" data-tag-done aria-label="Schließen">${fi('x', 10)}</button></div>
        <input class="tk-tag-name" value="${esc(g.name)}" maxlength="24" aria-label="Name" />${colorRow(g.c, 'data-edit-color')}
        <div class="tk-tag-edit-foot"><button type="button" class="tk-mini danger" data-tag-delete="${g.id}">${fi('trash', 11)}Löschen</button><span class="grow"></span><button type="button" class="tk-mini" data-tag-done>Fertig</button></div>`;
      side.querySelector('.tk-tag-name').addEventListener('input', (e) => { const x = tagOf(editing); if (x) { x.name = e.target.value.trim() || x.name; save(); draw(); drawTags(); } });
    };
    const drawTags = () => {
      const q = tagIn.value.trim();
      const exact = tags.some((g) => g.name.toLowerCase() === q.toLowerCase());
      tagList.classList.toggle('creating', creating);
      if (creating) { tagList.innerHTML = `<div class="tk-tag-new-l">Farbe für „${esc(q)}“</div>${colorRow('', 'data-new-color')}`; return; }
      const found = tags.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));
      tagList.innerHTML = found.map((g) => `<div class="tk-mi tag${t.tags.includes(g.id) ? ' on' : ''}${editing === g.id ? ' editing' : ''}" data-tag="${g.id}" role="button" tabindex="0"><i style="background:${g.c}"></i><span>${esc(g.name)}</span>${fi('check', 12)}<button type="button" class="tk-tag-pen" data-tag-edit="${g.id}" aria-label="Tag bearbeiten" title="Bearbeiten">${fi('pencil', 11)}</button></div>`).join('')
        + (!found.length && !q ? '<div class="tk-ml">Noch keine Tags</div>' : '');
      if (q && !exact) tagList.insertAdjacentHTML('afterbegin', `<div class="tk-mi tk-tag-add" data-tag-plus role="button" tabindex="0">${fi('plus', 12)}<span>„${esc(q)}“ hinzufügen</span></div>`);
    };
    const createTag = (c) => {
      const g = { id: newId('g'), name: tagIn.value.trim(), c };
      tags.push(g); t.tags.push(g.id); save();
      creating = false; tagIn.value = ''; drawTags(); draw(); tagIn.focus();
    };
    const recolor = (c) => { const g = tagOf(editing); if (g) { g.c = c; save(); draw(); drawTags(); render(); } };
    // eigener Farbwähler: Fläche für Helligkeit/Sättigung + Regenbogen-Leiste für den Farbton (zum Ziehen, ohne Hexcode)
    const openPicker = (btn) => {
      const host = btn.closest('.tk-colors').nextElementSibling;
      if (host.firstChild) { host.replaceChildren(); return; }
      const isNew = btn.dataset.custom === 'data-new-color';
      const start = isNew ? '#5b8cff' : (tagOf(editing)?.c || '#5b8cff');
      host.append(colorPicker(start, (hex, done) => {
        btn.style.setProperty('--c', hex); btn.classList.add('on');
        if (isNew) { if (done) createTag(hex); } else { recolor(hex); if (done) drawSide(); }
      }, isNew ? 'Anlegen' : 'Übernehmen'));
    };
    const startCreate = () => { if (!tagIn.value.trim()) return; creating = true; drawTags(); };
    tagIn.addEventListener('input', () => { creating = false; drawTags(); });
    tagIn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = tagIn.value.trim().toLowerCase();
      const hit = tags.find((g) => g.name.toLowerCase() === q);
      if (hit) { if (!t.tags.includes(hit.id)) t.tags.push(hit.id); tagIn.value = ''; drawTags(); draw(); } else startCreate();
    });

    /* Menüs öffnen sich direkt unter ihrer Pille */
    /* Kommentare: Liste mit Zeit, unten tippen + Enter (oder Pfeil) zum Hinzufügen */
    const cmList = form.querySelector('.tk-cm-list'), cmIn = form.querySelector('.tk-cm-in');
    const when = (ts) => new Date(ts).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const drawComments = () => {
      cmList.innerHTML = t.comments.length
        ? t.comments.map((c, i) => `<div class="tk-cm"><div class="tk-cm-text">${esc(c.text)}</div><div class="tk-cm-meta">${when(c.at)}<button type="button" class="tk-cm-del" data-cm-del="${i}" aria-label="Kommentar löschen" title="Löschen">${fi('trash', 10)}</button></div></div>`).join('')
        : '<div class="tk-ml">Noch keine Kommentare</div>';
      cmList.scrollTop = cmList.scrollHeight;
    };
    const addComment = () => {
      const v = cmIn.value.trim(); if (!v) return;
      t.comments.push({ text: v, at: Date.now() });
      cmIn.value = ''; drawComments(); draw();
      cmList.lastElementChild?.classList.add('fresh');
    };
    cmIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); addComment(); } });

    const openPop = (k) => {
      form.querySelectorAll('.tk-pop').forEach((p) => p.classList.toggle('open', p.dataset.k === k && !p.classList.contains('open')));
      const p = form.querySelector(`.tk-pop[data-k="${k}"].open`);
      if (k === 'date' && p) { const d = t.date ? new Date(`${t.date}T12:00:00`) : new Date(); calMonth = new Date(d.getFullYear(), d.getMonth(), 1, 12); drawCal(); }
      if (k === 'tags' && p) { creating = false; editing = null; tagIn.value = ''; drawTags(); drawSide(); setTimeout(() => tagIn.focus(), 30); }
      if (k !== 'tags') { editing = null; drawSide(); }
    };
    form.addEventListener('click', (e) => {
      const op = e.target.closest('[data-open]');
      if (op) { openPop(op.dataset.open); if (op.dataset.open === 'comments' && op.parentElement.classList.contains('open')) { drawComments(); setTimeout(() => cmIn.focus(), 30); } return; }
      if (e.target.closest('[data-cm-send]')) { addComment(); cmIn.focus(); return; }
      const cdel = e.target.closest('[data-cm-del]');
      if (cdel) { t.comments.splice(+cdel.dataset.cmDel, 1); drawComments(); draw(); return; }
      const st = e.target.closest('[data-status]');
      if (st) { t.status = st.dataset.status; if (t.status === 'done' && !t.progress) setProg(100); draw(); st.closest('.tk-pop').classList.remove('open'); return; }
      const ag = e.target.closest('[data-tagent]');
      if (ag) { t.agent = ag.dataset.tagent; if (!t.output) t.output = 'chat'; draw(); ag.closest('.tk-pop').classList.remove('open'); return; }
      const ou = e.target.closest('[data-toutput]');
      if (ou) { t.output = ou.dataset.toutput; draw(); ou.closest('.tk-pop').classList.remove('open'); return; }
      const pr = e.target.closest('[data-prio]');
      if (pr) { t.prio = pr.dataset.prio; draw(); pr.closest('.tk-pop').classList.remove('open'); return; }
      const cal = e.target.closest('[data-cal]');
      if (cal) { calMonth.setMonth(calMonth.getMonth() + +cal.dataset.cal); drawCal(); return; }
      const day = e.target.closest('[data-day]');
      if (day) { t.date = t.date === day.dataset.day ? '' : day.dataset.day; draw(); drawCal(); setTimeout(() => day.closest('.tk-pop')?.classList.remove('open'), 120); return; }
      if (e.target.closest('[data-tag-plus]')) { startCreate(); return; }
      const cu = e.target.closest('[data-custom]');
      if (cu) { openPicker(cu); return; }
      if (e.target.closest('.tk-picker')) return;
      const nc = e.target.closest('[data-new-color]');
      if (nc) { createTag(nc.dataset.newColor); return; }
      const te = e.target.closest('[data-tag-edit]');
      if (te) { editing = editing === te.dataset.tagEdit ? null : te.dataset.tagEdit; drawTags(); drawSide(); side.querySelector('.tk-tag-name')?.focus(); return; }
      const ec = e.target.closest('[data-edit-color]');
      if (ec) { recolor(ec.dataset.editColor); drawSide(); return; }
      if (e.target.closest('[data-tag-done]')) { editing = null; drawTags(); drawSide(); render(); return; }
      const tdel = e.target.closest('[data-tag-delete]');
      if (tdel) { const g = tdel.dataset.tagDelete; tags = tags.filter((x) => x.id !== g); tasks.forEach((x) => { x.tags = x.tags.filter((y) => y !== g); }); t.tags = t.tags.filter((y) => y !== g); editing = null; save(); drawTags(); drawSide(); draw(); render(); return; }
      if (e.target.closest('.tk-side')) return;
      const tg = e.target.closest('[data-tag]');
      if (tg) { const g = tg.dataset.tag; t.tags = t.tags.includes(g) ? t.tags.filter((x) => x !== g) : [...t.tags, g]; drawTags(); draw(); return; }
      if (!e.target.closest('.tk-pop')) form.querySelectorAll('.tk-pop.open').forEach((p) => p.classList.remove('open'));
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') close();
      if (act === 'delete') { tasks = tasks.filter((x) => x.id !== t.id); if (t.agent) forget([t.id]); save(); render(); close(); }
    });
    form.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(); }
      else if (e.key === 'Enter' && e.target.matches('.tk-f-title')) { e.preventDefault(); notes.focus(); }
      else if (e.key === 'Enter' && e.target.matches('.tk-tag-name')) { e.preventDefault(); editing = null; drawTags(); drawSide(); render(); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const title = String(f.get('title')).trim();
      if (!title) { // ohne Titel: Fenster wackelt kurz, Cursor in den Titel
        form.querySelector('.tk-f-title').focus();
        form.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
        return;
      }
      if (form.classList.contains('saving')) return;
      Object.assign(t, { title, notes: String(f.get('notes')).trim() });
      if (t0) {
        if (t.status !== t0.status) t.order = -1; // in neuer Spalte oben
        Object.assign(t0, t);
      } else {
        t.id = newId(); t.order = -1; t.created = Date.now();
        if (!t.agent) { delete t.agent; delete t.output; }
        tasks.push(t);
      }
      // neue Aufgabe mit Agent (oder ein Agent wurde nachträglich gewählt) → sofort an den Agenten
      const target = t0 || t;
      const go = agents && target.agent && (!target.run || target.run.state === 'failed') && target.status !== 'done';
      if (go) { if (hasCol('doing')) target.status = 'doing'; target.order = -1; target.run = { state: 'queued', updated: Date.now() }; }
      normalize(); save();
      if (go) startRun(target);
      // weich speichern: Knopf zeigt kurz einen Haken, dann schließt das Fenster und die Karte blendet ein
      const btn = form.querySelector('.tk-create');
      form.classList.add('saving');
      btn.style.width = `${btn.offsetWidth}px`;
      btn.innerHTML = `${fi('check', 13)}`;
      setTimeout(() => {
        render(); close();
        const c = board.querySelector(`[data-id="${t.id}"]`);
        c?.classList.add(t0 ? 'updated' : 'fresh');
        c?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 260);
    });
    draw();
    modal.hidden = false;
    requestAnimationFrame(grow);
    setTimeout(() => form.querySelector('.tk-f-title').focus(), 60);
  }
  const normalize = () => COLS.forEach((c) => tasks.filter((t) => t.status === c.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach((t, i) => { t.order = i; }));

  /* ---------- Ziehen zwischen Spalten (die Karte rutscht an die Stelle unter der Maus) ---------- */
  let dragId = null;
  board.addEventListener('dragstart', (e) => {
    const c = e.target.closest('.tk-card'); if (!c) return;
    dragId = c.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    requestAnimationFrame(() => c.classList.add('dragging'));
  });
  board.addEventListener('dragend', () => { board.querySelector('.dragging')?.classList.remove('dragging'); board.querySelectorAll('.tk-col.over').forEach((x) => x.classList.remove('over')); dragId = null; });
  board.addEventListener('dragover', (e) => {
    const col = e.target.closest('.tk-col'); if (!col || !dragId) return;
    e.preventDefault(); e.stopPropagation(); // im Dokument nicht als Text-/Bild-Ablage werten
    board.querySelectorAll('.tk-col.over').forEach((x) => x !== col && x.classList.remove('over'));
    col.classList.add('over');
    const list = col.querySelector('.tk-list'), dragged = board.querySelector('.tk-card.dragging');
    if (!dragged) return;
    const after = [...list.querySelectorAll('.tk-card:not(.dragging)')].find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (after) { if (dragged.nextSibling !== after) list.insertBefore(dragged, after); } else if (list.lastElementChild !== dragged) list.append(dragged);
  });
  board.addEventListener('drop', (e) => {
    const col = e.target.closest('.tk-col'); if (!col || !dragId) return;
    e.preventDefault(); e.stopPropagation();
    // Reihenfolge aus der Anzeige übernehmen (ausgefilterte Karten behalten ihren Platz dahinter)
    COLS.forEach((c) => [...board.querySelectorAll(`[data-col="${c.id}"] .tk-card`)].forEach((el, i) => {
      const t = tasks.find((x) => x.id === el.dataset.id); if (t) { t.status = c.id; t.order = i - 0.5; }
    }));
    normalize(); save(); render();
  });

  view.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new') { edit(null); return; }
    if (act === 'filter') { e.stopPropagation(); drawFilter(); view.querySelector('.tk-filter-wrap').classList.toggle('open'); return; }
    const res = e.target.closest('[data-result]');
    if (res) { openResult(tasks.find((x) => x.id === res.dataset.result)); return; }
    const rt = e.target.closest('[data-retry]');
    if (rt) { const t = tasks.find((x) => x.id === rt.dataset.retry); if (t) { if (hasCol('doing')) t.status = 'doing'; t.run = { state: 'queued', updated: Date.now() }; normalize(); save(); render(); startRun(t); } return; }
    const add = e.target.closest('[data-add]');
    if (add) { edit(null, add.dataset.add); return; }
    const ck = e.target.closest('[data-check]');
    if (ck) { toggleDone(ck.dataset.check); return; }
    const ga = e.target.closest('[data-grp-add]');
    if (ga) { const k = ga.dataset.grpAdd, d = new Date(); if (k === 'soon') d.setDate(d.getDate() + 1); edit(null, 'backlog', ['late', 'today', 'soon'].includes(k) ? isoOf(d) : ''); return; }
    if (e.target.closest('[data-toggle-done]')) {
      doneOpen = !doneOpen;
      try { localStorage.setItem(DONE_KEY, doneOpen ? '1' : '0'); } catch {}
      board.querySelector('.tk-grp.g-done')?.classList.toggle('open', doneOpen);
      return;
    }
    if (e.target.closest('.tk-quick')) return;
    const c = e.target.closest('.tk-card, .tk-row');
    if (c) edit(c.dataset.id);
  });
  board.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.tk-card, .tk-row')) edit(e.target.dataset.id); if (e.key === ' ' && e.target.matches('.tk-row')) { e.preventDefault(); toggleDone(e.target.dataset.id); } });

  /* ---------- Agenten: Aufgabe an den Server geben, Zustand abholen, Ergebnis öffnen ---------- */
  function startRun(t) {
    if (!agents) return;
    const body = JSON.stringify({ task: { id: t.id, title: t.title, notes: t.notes, agent: t.agent, output: t.output, ws: window.Workspaces?.active() || 'main' } });
    // keepalive: die Anfrage geht auch raus, wenn die App gleich geschlossen wird – der Server arbeitet dann allein weiter
    fetch('/api/agent-tasks/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .then(() => pull()).catch(() => {});
    setTimeout(pull, 1500);
  }
  function forget(ids) { if (agents && ids.length) fetch('/api/agent-tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => {}); }
  async function openResult(t) {
    const r = t?.run; if (!r) return;
    if (r.docId) { await window.Docs?.sync?.(); window.Docs?.open(r.docId); return; }
    if (r.chatId && !(await window.openSavedChat?.(r.chatId))) { r.state = 'failed'; r.error = 'Chat nicht mehr da'; save(); render(); }
  }
  let pullT = 0, pulling = false;
  async function pull() {
    if (!agents || pulling) return;
    clearTimeout(pullT);
    pulling = true;
    let map = null;
    try { const r = await fetch('/api/agent-tasks', { cache: 'no-store' }); if (r.ok) map = await r.json(); } catch {}
    pulling = false;
    if (map) {
      let changed = false;
      tasks.filter((t) => t.agent).forEach((t) => {
        const s = map[t.id];
        // noch nicht beim Server angekommen (z. B. offline beim Anlegen) → nochmal losschicken
        if (!s) { if (t.run?.state === 'queued' && Date.now() - (t.run.updated || 0) > 20000) { t.run.updated = Date.now(); startRun(t); } return; }
        if ((s.updated || 0) <= (t.run?.updated || 0) && t.run?.state === s.state) return;
        const was = t.run?.state;
        t.run = { state: s.state, chatId: s.chatId || '', docId: s.docId || '', error: s.error || '', updated: s.updated };
        if (s.state === 'running' && t.status === 'backlog' && hasCol('doing')) { t.status = 'doing'; t.order = -1; }
        if (s.state === 'done' && was !== 'done') {
          if (t.status !== 'done' && hasCol('review')) { t.status = 'review'; t.order = -1; }
          t.progress = 100;
          t.comments = [...(t.comments || []), { text: `${AGENT_NAMES[t.agent] || 'Agent'}: fertig – ${t.output === 'doc' ? 'Dokument' : 'Chat'} „${s.title || t.title}“ ist bereit.`, at: s.finished || Date.now() }];
        }
        changed = true;
      });
      if (changed) { normalize(); save(); render(); }
    }
    if (tasks.some((t) => t.agent && (t.run?.state === 'queued' || t.run?.state === 'running'))) pullT = setTimeout(pull, 5000);
  }
  if (agents) {
    setTimeout(pull, 1200);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  }
  render();
  // für den Sprach-Agenten: Aufgabe per Titel finden (genau, sonst Teil des Titels), anlegen, ändern, löschen
  const find = (q) => { q = String(q || '').toLowerCase().trim(); return q ? tasks.find((t) => t.title.toLowerCase() === q) || tasks.find((t) => t.title.toLowerCase().includes(q)) : null; };
  const clean = (a, t = {}) => ({
    ...(a.title ? { title: String(a.title).trim().slice(0, 120) } : {}), ...(a.notes != null ? { notes: String(a.notes).slice(0, 1000) } : {}),
    ...(COLS.some((c) => c.id === a.status) ? { status: a.status } : {}), ...(PRIOS.some((p) => p.id === a.prio) ? { prio: a.prio } : {}),
    ...(a.date === '' || /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? { date: a.date } : {}),
    ...(a.progress != null ? { progress: Math.max(0, Math.min(100, Math.round(+a.progress / 5) * 5 || 0)) } : a.status === 'done' && !t.progress ? { progress: 100 } : {}),
  });
  function add(a = {}) {
    const t = { id: newId(), title: 'Aufgabe', notes: '', status: COLS[0].id, tags: [], prio: 'none', date: '', progress: 0, comments: [], order: -1, created: Date.now(), ...clean(a) };
    tasks.push(t); normalize(); save(); render(); return t;
  }
  function update(q, a = {}) { const t = find(q); if (!t) return null; const p = clean(a, t); if (p.status && p.status !== t.status) t.order = -1; Object.assign(t, p); normalize(); save(); render(); return t; }
  function remove(q) { const t = find(q); if (!t) return null; tasks = tasks.filter((x) => x !== t); if (t.agent) forget([t.id]); save(); render(); return t; }
  return { view, render, add, update, remove, pull, get tasks() { return tasks.slice(); } };
  }

  // Haupt-Board „Tasks“: im Browser gespeichert
  const main = createBoard({
    load: () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } },
    save: (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} },
  }, { agents: true, list: true });
  const view = main.view, render = main.render;
  view.hidden = true;
  let open = false;

  /* ---------- Öffnen / Schließen (die Tabs oben steuern das, siehe app.js → openViewTab) ---------- */
  function show() {
    const panel = document.querySelector('.panel');
    if (panel && !view.isConnected) panel.append(view);
    open = true;
    render();
    main.pull();
    view.hidden = false;
    panel?.classList.add('view-tasks');
  }
  function hide() {
    if (!open) return;
    open = false;
    view.hidden = true;
    document.querySelector('.panel')?.classList.remove('view-tasks');
  }

  // createBoard: eigenes Board mit eigenem Speicher (z. B. Aufgaben-Block im Dokument)
  return { show, hide, get open() { return open; }, get tasks() { return main.tasks; }, add: main.add, update: main.update, remove: main.remove, COLS: ALL_COLS, PRIOS, prioIcon, createBoard }; // PRIOS/prioIcon auch für die Dokument-Infos
})();
window.Tasks = Tasks;
