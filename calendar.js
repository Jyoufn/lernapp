/* ===================================================================
   Kalender
   - Monatsansicht (Seitenleiste → „Kalender“): Raster Mo–So, Termine als Chips im Tag, „+N weitere“ wenn es nicht passt;
     blättern monatsweise (Pfeile, „Heute“, Wischen auf dem iPad); schmal nur Farbpunkte
   - „Neu“ → Termin-Fenster: Titel, Beschreibung, Datum, Uhrzeit, Icon, Farbe
   - Klick auf einen Termin → Ansicht-Karte (Stift = bearbeiten), „+N weitere“ → alle Termine des Tages; leerer Tag: nichts
   - Klick auf einen Termin → bearbeiten oder löschen
   - Gespeichert im Browser (localStorage); der Agent kann Termine anlegen (AppActions.add_event)
   =================================================================== */
const Calendar = (() => {
  const KEY = 'calendarEvents';
  const COLORS = ['#6d9fff', '#a78bfa', '#f472b6', '#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf'];
  // Vorschlagsfarben im Termin-Fenster: die App-Farben (UIKit.COLORS) + drei weitere, damit die Reihe bis ganz rechts reicht
  const EV_COLORS = [...((window.UIKit && UIKit.COLORS) || []), '#e0737a', '#d6bf5e', '#5db8b3'];
  // Farbauswahl im Termin-Fenster: oben die Vorschläge in einer Reihe, ganz rechts der Knopf für eine eigene Farbe (bleibt immer der bunte Kreis);
  // darunter die selbst gewählten Farben – gespeichert (localStorage „calendar.ownColors“), die neueste zuerst und gleich ausgewählt
  const OWN_KEY = 'calendar.ownColors';
  const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));
  const ownColors = () => { try { return (JSON.parse(localStorage.getItem(OWN_KEY)) || []).filter(isHex).slice(0, 12); } catch { return []; } };
  const addOwn = (hex) => { try { localStorage.setItem(OWN_KEY, JSON.stringify([hex, ...ownColors().filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, 12))); } catch {} };
  const colorDot = (c, cur) => `<button type="button" class="${c === cur ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="Farbe"></button>`;
  const ownRow = (cur) => { const own = ownColors(); if (isHex(cur) && !EV_COLORS.includes(cur) && !own.includes(cur)) own.unshift(cur); return own.map((c) => colorDot(c, cur)).join(''); };
  const evColorRow = (cur) => `<div class="tk-colors ce-colors ce-presets">${EV_COLORS.map((c) => colorDot(c, cur)).join('')}<button type="button" class="tk-custom" data-custom="data-color" aria-label="Eigene Farbe" title="Eigene Farbe"></button></div>`
    + `<div class="tk-picker-host"></div><div class="tk-colors ce-colors ce-own">${ownRow(cur)}</div>`;

  const ICONS = ['i-calendar', 'i-book', 'i-pencil', 'i-star', 'i-people', 'i-timer', 'i-music', 'i-heart', 'i-globe', 'i-bolt', 'i-file', 'i-check'];
  // 19.11.: bei „English“ alle Datumsnamen englisch (Monat vor dem Tag, ohne Punkt)
  const EN = window.I18n?.lang?.() === 'en';
  const MONTHS = EN ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] : ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const DAYS = EN ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const dm = (d, arr = MONTHS) => (EN ? `${arr[d.getMonth()]} ${d.getDate()}` : `${d.getDate()}. ${arr[d.getMonth()]}`);

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  let events = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(events)); } catch {} window.dispatchEvent(new CustomEvent('calendar-changed')); };
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => iso(new Date());
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const icon = (id) => `<svg width="16" height="16" aria-hidden="true"><use href="#${id}"/></svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // angezeigter Monat: 1. des Monats, 12 Uhr (12 Uhr, damit Zeitumstellungen das Datum nicht verschieben)
  const monthOf = (d) => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(1); return m; };
  let cursor = monthOf(new Date());
  let open = false;
  const minsOf = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const MONTHS_SHORT = EN ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

  /* ---------- Ansicht: Monat (Raster Mo–So, 5–6 Wochen), Termine als Chips im Tag ---------- */
  const view = document.createElement('section');
  view.className = 'cal-view cal-month-view';
  view.hidden = true;
  view.setAttribute('aria-label', 'Kalender');
  view.innerHTML = `
    <header class="cal-head cm-head">
      <div class="cm-title"><span class="cm-m"></span> <span class="cm-y"></span></div>
      <label class="au-search cm-search">${icon('f-search')}<input type="search" placeholder="Termine durchsuchen" aria-label="Termine durchsuchen" autocomplete="off" /><button type="button" class="lb2-filter au-fbtn cm-fbtn" data-cs="filter" aria-label="Filter" title="Filter">${icon('f-filter')}</button></label>
      <div class="cm-results" role="listbox" hidden></div>
      <div class="cal-nav cm-nav">
        <div class="cm-switch">
          <button type="button" class="cm-arr" data-cal="prev" aria-label="Vorheriger Monat">${icon('f-back')}</button>
          <span class="cm-label"></span>
          <button type="button" class="cm-arr" data-cal="next" aria-label="Nächster Monat">${icon('f-forward')}</button>
        </div>
        <button class="cal-new" type="button" data-cal="new" aria-label="Neuer Termin">${icon('f-plus')}<span>Neuer Termin</span></button>
      </div>
    </header>
    <div class="cm">
      <div class="cm-wd">${DAYS.map((d, i) => `<span${i > 4 ? ' class="we"' : ''}>${d}</span>`).join('')}</div>
      <div class="cm-grid"></div>
    </div>`;
  const box = view.querySelector('.cm'), grid = view.querySelector('.cm-grid');
  const pickLabel = view.querySelector('.cm-label');

  // Termine eines Tages: ganztägige zuerst, dann nach Uhrzeit
  const dayEvents = (k) => events.filter((e) => e.date === k).sort((a, b) => (minsOf(a.time) ?? -1) - (minsOf(b.time) ?? -1) || String(a.title).localeCompare(String(b.title)));
  function chip(e) {
    const b = document.createElement('button');
    b.type = 'button';
    const allDay = minsOf(e.time) == null;
    b.className = `cal-pill cm-ev${allDay ? ' all' : ''}`;
    b.dataset.id = e.id;
    b.style.setProperty('--c', e.color || COLORS[0]);
    b.setAttribute('aria-label', [e.time, e.title].filter(Boolean).join(' '));
    b.innerHTML = `<i class="cm-dot"></i><span class="cm-ev-t">${esc(e.title)}</span>${allDay ? '' : `<span class="cm-ev-time">${esc(e.time)}</span>`}`;
    return b;
  }
  function render(dir = 0) {
    if (dir && !reduced()) [pickLabel, view.querySelector('.cm-title')].forEach((n) => n.animate([{ opacity: 0, transform: `translateX(${dir > 0 ? 10 : -10}px)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }));
    view.querySelector('.cm-m').textContent = MONTHS[cursor.getMonth()];
    view.querySelector('.cm-y').textContent = cursor.getFullYear();
    pickLabel.textContent = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    // erster angezeigter Tag = Montag der Woche mit dem 1.; so viele Wochen wie nötig (5 oder 6, Februar evtl. 4)
    const first = new Date(cursor); first.setDate(1 - ((cursor.getDay() + 6) % 7));
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
    const weeks = Math.ceil((((last - first) / 86400000) + 1) / 7);
    grid.style.setProperty('--weeks', weeks);
    const today = todayIso(), month = cursor.getMonth();
    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(first); d.setDate(first.getDate() + i);
      const k = iso(d), other = d.getMonth() !== month;
      const c = document.createElement('div');
      c.className = `cm-cell${other ? ' other' : ''}${k === today ? ' today' : ''}${i % 7 > 4 ? ' we' : ''}${i % 7 === 6 ? ' end' : ''}${i >= (weeks - 1) * 7 ? ' last' : ''}`;
      c.dataset.date = k;
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', `${dm(d)}`);
      const label = d.getDate() === 1 ? `${dm(d, MONTHS_SHORT)}` : d.getDate();
      c.innerHTML = `<div class="cm-cell-h"><span class="cm-dn">${label}</span></div><button type="button" class="cm-more" hidden></button><div class="cm-evs"></div>`;
      const list = c.querySelector('.cm-evs');
      dayEvents(k).forEach((e) => list.append(chip(e)));
      cells.push(c);
    }
    grid.replaceChildren(...cells);
    fit();
    if (dir && !reduced()) { grid.classList.remove('slide-l', 'slide-r'); void grid.offsetWidth; grid.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
  }
  // so viele Termine je Tag zeigen, wie hineinpassen; der Rest steht als „+N“ darunter (öffnet den Tag)
  function fit() {
    if (view.hidden) return;
    const w = box.clientWidth, compact = w < 480;
    box.classList.toggle('compact', compact);
    box.classList.toggle('narrow', !compact && w < 760); // mittlere Breite (iPad hochkant): Chips ohne Uhrzeit
    grid.querySelectorAll('.cm-cell').forEach((c) => {
      const chips = [...c.querySelectorAll('.cm-ev')], more = c.querySelector('.cm-more');
      chips.forEach((x) => { x.hidden = false; });
      more.hidden = true;
      if (!chips.length) return;
      if (compact) { // schmal (Handy/iPad hochkant geteilt): nur Farbpunkte, höchstens 4
        chips.forEach((x, i) => { x.hidden = i >= 4; });
        return;
      }
      const room = c.clientHeight - c.querySelector('.cm-cell-h').offsetHeight - 10;
      const ROW = 22; // Chip 20 + Abstand 2
      let n = Math.max(0, Math.floor((room + 2) / ROW));
      if (n >= chips.length) return;
      n = Math.max(0, Math.floor((room - 16) / ROW)); // Platz für „+N weitere“ unter der Zahl
      chips.forEach((x, i) => { x.hidden = i >= n; });
      more.hidden = false;
      more.textContent = `+${chips.length - n} weitere`;
    });
  }
  new ResizeObserver(() => fit()).observe(box);
  const shiftMonth = (n) => { cursor.setMonth(cursor.getMonth() + n); render(n); };

  view.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-cal]')?.dataset.cal;
    if (a === 'prev') { shiftMonth(-1); return; }
    if (a === 'next') { shiftMonth(1); return; }
    if (a === 'new') { edit(null, todayIso(), '', '', null, ev.target.closest('[data-cal]')); return; }
    const cell = ev.target.closest('.cm-cell');
    const p = ev.target.closest('.cm-ev');
    const compact = box.classList.contains('compact');
    // Termin antippen → Ansicht (bearbeiten über den Stift oben rechts); schmal sind die Chips nur Punkte → Tagesliste
    if (p && !compact) { showEvent(events.find((e) => e.id === p.dataset.id), p); return; }
    // „+N weitere“ (bzw. schmal: Tag mit Terminen) → alle Termine des Tages; ein leerer Tag macht nichts
    if (cell && (ev.target.closest('.cm-more') || (compact && cell.querySelector('.cm-ev')))) showDayList(cell.dataset.date, cell);
  });
  /* 19.11.: Suche mit Filter (wie bei den Aufgaben). Darunter klappt eine Liste der Treffer auf:
     links Name, daneben Priorität, Tags, ganz rechts Datum + Uhrzeit. Antippen springt zum Termin und öffnet ihn. */
  const sIn = view.querySelector('.cm-search input'), results = view.querySelector('.cm-results');
  const cf = { when: 'all', tags: new Set() };
  const cfOn = () => cf.when !== 'all' || cf.tags.size > 0;
  const prioOf = (e) => { const t = e.task && window.Aufgaben?.items?.find((x) => x.id === e.task); const id = e.priority || t?.priority; return id && id !== 'none' ? (window.UIKit?.PRIOS || []).find((q) => q.id === id) : null; };
  const whenText = (e) => { const d = new Date(`${e.date}T12:00:00`); const dt = `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() : ''}`.trim(); return e.time ? `${dt} · ${e.time}${e.end ? `–${e.end}` : ''} Uhr` : `${dt} · Ganztägig`; };
  function matches() {
    const q = sIn.value.trim().toLowerCase(), td = todayIso();
    const wk = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return iso(d); })();
    const all = window.TagMenu?.all?.() || [];
    return events.filter((e) => {
      if (cf.when === 'up' && e.date < td) return false;
      if (cf.when === 'past' && e.date >= td) return false;
      if (cf.when === 'week' && (e.date < td || e.date > wk)) return false;
      if (cf.when === 'month' && e.date.slice(0, 7) !== td.slice(0, 7)) return false;
      if (cf.tags.size && !(e.tags || []).some((id) => cf.tags.has(id))) return false;
      if (!q) return true;
      const tn = all.filter((g) => (e.tags || []).includes(g.id)).map((g) => g.name).join(' ');
      return `${e.title} ${e.description || ''} ${tn}`.toLowerCase().includes(q);
    }).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 60);
  }
  function drawResults() {
    const want = document.activeElement === sIn && (sIn.value.trim() || cfOn());
    view.querySelector('.cm-fbtn').classList.toggle('set', cfOn());
    if (!want) { results.hidden = true; return; }
    const list = matches(), all = window.TagMenu?.all?.() || [];
    results.innerHTML = list.length ? list.map((e) => {
      const pr = prioOf(e), tg = all.filter((g) => (e.tags || []).includes(g.id));
      return `<button type="button" class="cs-row" data-eid="${esc(e.id)}" role="option"><i class="cs-dot" style="background:${esc(e.color || COLORS[0])}"></i><span class="cs-name">${esc(e.title)}</span>`
        + `<span class="cs-prio">${pr ? `${window.UIKit.prioIcon(pr.id, 12)}<span>${esc(pr.name)}</span>` : ''}</span>`
        + `<span class="cs-tags">${tg.slice(0, 2).map((g) => `<span class="lb2-tag" style="--c:${esc(g.c)}"><span>${esc(g.name)}</span></span>`).join('')}${tg.length > 2 ? `<span class="lb2-tag more">+${tg.length - 2}</span>` : ''}</span>`
        + `<span class="cs-when">${esc(whenText(e))}</span></button>`;
    }).join('') : '<div class="cs-empty">Keine Termine gefunden</div>';
    results.hidden = false;
    // unter dem Suchfeld, mittig dazu ausgerichtet (mindestens 600 px breit, nie über den Kopf hinaus)
    const sb = view.querySelector('.cm-search'), hd = view.querySelector('.cm-head');
    const w = Math.min(hd.clientWidth, Math.max(sb.offsetWidth, 600));
    results.style.width = `${w}px`; const sr = sb.getBoundingClientRect(), hr = hd.getBoundingClientRect(); results.style.left = `${Math.max(0, Math.min(hd.clientWidth - w, sr.left - hr.left + sr.width / 2 - w / 2))}px`; // 19.11.: mittig unter der Suche (gleich weit links und rechts überstehend)
  }
  sIn.addEventListener('input', drawResults);
  sIn.addEventListener('focus', drawResults);
  sIn.addEventListener('keydown', (x) => { x.stopPropagation(); if (x.key === 'Escape') { sIn.value = ''; sIn.blur(); results.hidden = true; } });
  sIn.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== sIn && !results.matches(':hover')) results.hidden = true; }, 150));
  results.addEventListener('pointerdown', (x) => x.preventDefault()); // Fokus bleibt im Suchfeld
  results.addEventListener('click', (x) => {
    const r = x.target.closest('[data-eid]'); if (!r) return;
    const e = events.find((y) => y.id === r.dataset.eid); if (!e) return;
    results.hidden = true; sIn.blur();
    const m = monthOf(new Date(`${e.date}T12:00:00`));
    if (m.getTime() !== cursor.getTime()) { const dir = m > cursor ? 1 : -1; cursor = m; render(dir); }
    requestAnimationFrame(() => { const chip = view.querySelector(`.cm-ev[data-id="${CSS.escape(e.id)}"]`); showEvent(e, chip || view.querySelector(`.cm-cell[data-date="${e.date}"]`)); });
  });
  // Filter-Menü (Stil des Chat-Menüs, Haken rechts, Gruppen nur durch Striche getrennt)
  const cmenu = document.createElement('div'); cmenu.className = 'chat-pop chat-menu au-menu open'; cmenu.hidden = true; cmenu.setAttribute('role', 'menu');
  document.body.append(cmenu);
  const cmi = (v, label, on, ic) => `<button type="button" role="menuitem" class="au-mi" data-v="${esc(v)}">${ic}<span>${esc(label)}</span>${on ? `<i class="au-tick">${icon('f-check')}</i>` : ''}</button>`;
  const cmHtml = () => {
    const W = [['all', 'Alle Termine', 'f-calendar'], ['up', 'Kommende', 'f-forward'], ['week', 'Nächste 7 Tage', 'f-clock'], ['month', 'Dieser Monat', 'f-calendar'], ['past', 'Vergangene', 'f-back']];
    const tags = window.TagMenu?.all?.() || [];
    return W.map(([v, l, ic]) => cmi(`w:${v}`, l, cf.when === v, icon(ic))).join('')
      + (tags.length ? '<div class="cm-sep" role="separator"></div>' + tags.map((g) => cmi(`g:${g.id}`, g.name, cf.tags.has(g.id), `<span class="au-mdot"><i style="background:${esc(g.c)}"></i></span>`)).join('') : '')
      + (cfOn() ? `<div class="cm-sep" role="separator"></div>${cmi('reset', 'Filter zurücksetzen', false, icon('f-x'))}` : '');
  };
  view.querySelector('.cm-fbtn').addEventListener('click', (x) => {
    x.preventDefault(); x.stopPropagation();
    if (!cmenu.hidden) { cmenu.hidden = true; return; }
    const b = x.currentTarget, r = b.getBoundingClientRect();
    cmenu.innerHTML = cmHtml(); cmenu.hidden = false;
    cmenu.style.left = `${Math.max(8, Math.min(innerWidth - cmenu.offsetWidth - 8, r.right - cmenu.offsetWidth - 6))}px`; cmenu.style.top = `${r.bottom + 6}px`;
  });
  cmenu.addEventListener('click', (x) => {
    const b = x.target.closest('[data-v]'); if (!b) return; x.stopPropagation();
    const v = b.dataset.v;
    if (v.startsWith('w:')) cf.when = v.slice(2);
    else if (v.startsWith('g:')) { const id = v.slice(2); cf.tags.has(id) ? cf.tags.delete(id) : cf.tags.add(id); }
    else if (v === 'reset') { cf.when = 'all'; cf.tags.clear(); }
    const st = cmenu.scrollTop; cmenu.innerHTML = cmHtml(); cmenu.scrollTop = st;
    sIn.focus({ preventScroll: true }); drawResults();
  });
  document.addEventListener('pointerdown', (x) => { if (!cmenu.hidden && !cmenu.contains(x.target) && !x.target.closest('.cm-fbtn')) cmenu.hidden = true; });
  // Wischen auf dem iPad: links/rechts = Monat vor/zurück
  let swipe = null;
  box.addEventListener('touchstart', (ev) => { const t = ev.touches[0]; swipe = ev.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: Date.now() } : null; }, { passive: true });
  box.addEventListener('touchend', (ev) => {
    if (!swipe) return;
    const t = ev.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - swipe.at < 600) shiftMonth(dx < 0 ? 1 : -1);
    swipe = null;
  }, { passive: true });

  // ganztägiger Termin als Band im Tagesfenster (div statt button: ein Knopf zentriert den Titel senkrecht, das Band soll ihn oben halten)
  function band(e, j, n) {
    const b = document.createElement('div');
    b.className = 'cal-pill cw-band';
    b.dataset.id = e.id;
    b.setAttribute('role', 'button'); b.tabIndex = 0;
    b.style.setProperty('--c', e.color || COLORS[0]);
    b.innerHTML = `<span class="cw-band-t">${icon(e.icon || 'i-calendar')}<span>${esc(e.title)}</span></span>`;
    Object.assign(b.style, { left: `calc(${(j / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` });
    return b;
  }
  function pill(e) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cal-pill';
    b.dataset.id = e.id;
    b.style.setProperty('--c', e.color || COLORS[0]);
    b.innerHTML = `${icon(e.icon || 'i-calendar')}<span class="cal-pill-t">${esc(e.title)}</span>${e.time ? `<span class="cal-pill-time">${esc(e.time)}</span>` : ''}`;
    return b;
  }

  /* ---------- Tagesansicht: Klick auf einen Tag → Tag wächst weich aus der Zelle, links die Uhrzeiten ---------- */
  const HOUR = 52; // Höhe einer Stunde in px
  const WEEKDAYS = EN ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  // Tagesansicht als eigenes großes Fenster über dem Kalender (wegklicken, Esc oder ×)
  const dvWrap = document.createElement('div');
  dvWrap.className = 'cal-dv-wrap';
  dvWrap.hidden = true;
  const dv = document.createElement('div');
  dv.className = 'cal-dv';
  dv.hidden = true;
  dvWrap.append(dv);
  document.body.append(dvWrap);
  dvWrap.addEventListener('pointerdown', (ev) => { if (ev.target === dvWrap) closeDay(); });
  let dayDate = null;
  const mins = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  function drawDay(dir = 0) {
    const d = new Date(`${dayDate}T12:00:00`);
    const list = events.filter((e) => e.date === dayDate);
    const allDay = list.filter((e) => mins(e.time) == null);
    const timed = list.filter((e) => mins(e.time) != null).sort((a, b) => mins(a.time) - mins(b.time));
    dv.innerHTML = `<header class="cal-dv-head">

        <div class="cal-dv-title"><span>${WEEKDAYS[d.getDay()]},</span> ${dm(d)}${dayDate === todayIso() ? '<em>Heute</em>' : ''}</div>
        <div class="cal-nav">
          <button class="cal-icon" type="button" data-dv="prev" aria-label="Vorheriger Tag" title="Vorheriger Tag">${icon('f-back')}</button>
          <button class="cal-icon" type="button" data-dv="next" aria-label="Nächster Tag" title="Nächster Tag">${icon('f-forward')}</button>
          <button class="cal-icon" type="button" data-dv="new" aria-label="Neuer Termin" title="Neuer Termin">${icon('f-plus')}</button>
          <button class="tk-x cal-dv-x" type="button" data-dv="back" aria-label="Schließen" title="Schließen">${icon('f-x')}</button>
        </div>
      </header>
      <div class="cal-dv-scroll"><div class="cal-dv-hours" style="height:${24 * HOUR}px">
        ${Array.from({ length: 24 }, (_, h) => `<div class="cal-dv-row" data-hour="${h}" style="top:${h * HOUR}px"><span>${pad(h)}:00</span></div>`).join('')}
        <div class="cal-dv-events"></div>
      </div></div>`;
    const box = dv.querySelector('.cal-dv-events');
    // ganztägig: Farbband über den ganzen Tag (wie in der Woche)
    allDay.forEach((e, j) => {
      box.append(band(e, j, allDay.length));
    });
    // Überschneidungen nebeneinander legen
    const lanes = [];
    timed.forEach((e) => {
      const start = mins(e.time), end = Math.max(start + 30, mins(e.end) ?? start + 60);
      let lane = lanes.findIndex((l) => l <= start);
      if (lane < 0) { lane = lanes.length; lanes.push(end); } else lanes[lane] = end;
      e._lane = lane; e._s = start; e._e = end;
    });
    timed.forEach((e) => {
      const b = pill(e);
      b.classList.add('cal-dv-ev');
      const w = 100 / Math.max(1, lanes.length);
      Object.assign(b.style, { top: `${(e._s / 60) * HOUR}px`, height: `${Math.max(22, ((e._e - e._s) / 60) * HOUR - 2)}px`, left: `calc(${e._lane * w}% + 2px)`, width: `calc(${w}% - 4px)` });
      if (e.end) b.querySelector('.cal-pill-time').textContent = `${e.time} – ${e.end}`;
      box.append(b);
    });
    const sc = dv.querySelector('.cal-dv-scroll');
    const first = timed[0] ? timed[0]._s / 60 - 1 : dayDate === todayIso() ? new Date().getHours() - 2 : 7;
    sc.scrollTop = Math.max(0, first) * HOUR;
    if (dir) { sc.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
  }
  // Fenster wächst weich aus der angeklickten Zelle und schrumpft beim Schließen wieder hinein
  const fromCell = (cell) => {
    const r = cell.getBoundingClientRect(), w = dv.getBoundingClientRect();
    return `translate(${r.left + r.width / 2 - (w.left + w.width / 2)}px, ${r.top + r.height / 2 - (w.top + w.height / 2)}px) scale(${r.width / w.width}, ${r.height / w.height})`;
  };
  function openDay(date, cell) {
    dayDate = date;
    dvWrap.hidden = false;
    dv.hidden = false; // erst sichtbar machen, sonst greift das Scrollen zur ersten Uhrzeit nicht
    drawDay();
    if (reduced()) return;
    dvWrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease' });
    if (cell) dv.animate([{ transform: fromCell(cell), opacity: 0.4, borderRadius: '12px' }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    dv.querySelector('.cal-dv-scroll').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 100, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
  }
  function closeDay() {
    if (dv.hidden) return;
    const d = new Date(`${dayDate}T12:00:00`);
    if (monthOf(d).getTime() !== cursor.getTime()) { cursor = monthOf(d); render(); }
    const done = () => { dv.hidden = true; dvWrap.hidden = true; };
    const cell = view.querySelector(`.cm-cell[data-date="${dayDate}"]`);
    if (reduced()) { done(); return; }
    const fade = dvWrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease', fill: 'forwards' });
    const shrink = dv.animate([{ transform: 'none', opacity: 1 }, { transform: cell ? fromCell(cell) : 'scale(0.96)', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
    // per Zeitgeber schließen – verlässlich, auch wenn das Fenster im Hintergrund nicht animiert
    setTimeout(() => { done(); fade.cancel(); shrink.cancel(); }, 300);
  }
  dv.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-dv]')?.dataset.dv;
    if (a === 'back') { closeDay(); return; }
    if (a === 'prev' || a === 'next') { const d = new Date(`${dayDate}T12:00:00`); d.setDate(d.getDate() + (a === 'next' ? 1 : -1)); dayDate = iso(d); drawDay(a === 'next' ? 1 : -1); return; }
    if (a === 'new') { edit(null, dayDate); return; }
    const p = ev.target.closest('.cal-pill');
    if (p) { edit(events.find((e) => e.id === p.dataset.id)); return; }
    // Klick in eine leere Stunde legt nichts an – neue Termine nur über „+“
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !dv.hidden && modal.hidden && emodal.hidden) closeDay(); });

  /* ---------- Menü: neuer Termin / bearbeiten ---------- */
  const modal = document.createElement('div');
  modal.className = 'cal-modal';
  modal.hidden = true;
  document.body.append(modal);

  function close() {
    if (modal.hidden) return;
    modal.classList.add('closing');
    setTimeout(() => { modal.hidden = true; modal.classList.remove('closing'); modal.replaceChildren(); }, 200);
  }
  modal.addEventListener('pointerdown', (ev) => { if (ev.target === modal) close(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !modal.hidden) close(); });

  /* Termin-Fenster wie die Menüs: Icon + Titel oben, darunter Eigenschaften als Zeilen (Beschriftung links, Wert rechts) */
  /* Termin-Fenster im Stil der Aufgaben: flach oben, Titel + Beschreibung, darunter Pillen
     für Datum (Kalender), Zeit (Uhrzeit-Rad wie bei Apple), Farbe (mit eigener Farbe) und Icon */
  const EV_ICONS = ['calendar', 'book-open', 'cap', 'pencil', 'bulb', 'file', 'people', 'user', 'chat', 'clock', 'bell', 'flag',
    'star', 'heart', 'music', 'gamepad', 'dumbbell', 'coffee', 'food', 'cart', 'car', 'plane', 'map-pin', 'home',
    'briefcase', 'medical', 'sun', 'moon', 'gift', 'camera', 'palette', 'leaf', 'globe', 'bolt'].map((n) => `f-${n}`);
  // passendes Icon aus dem Titel (nur solange keins von Hand gewählt wurde)
  const ICON_WORDS = [
    ['cap', /\b(klausur|klassenarbeit|prüfung|test|abi|abitur|schulaufgabe|ex\b|stegreif)/i], ['book-open', /\b(lernen|lesen|buch|vokabel|wiederhol|hausaufgabe|ha\b)/i],
    ['pencil', /\b(schreib|aufsatz|referat|hausarbeit|facharbeit|erörterung)/i], ['bulb', /\b(idee|projekt|präsentation|vortrag)/i],
    ['people', /\b(treffen|meeting|gruppe|team|elternabend|besprechung)/i], ['medical', /\b(arzt|zahnarzt|termin beim|praxis|impf|kranken)/i],
    ['dumbbell', /\b(sport|training|fitness|gym|fußball|handball|basketball|tennis|schwimm|lauf|joggen|turnen)/i], ['music', /\b(musik|klavier|gitarre|chor|band|konzert|orchester|unterricht.*(klavier|gitarre))/i],
    ['gift', /\b(geburtstag|party|feier|geschenk)/i], ['plane', /\b(urlaub|reise|flug|ferien)/i], ['car', /\b(fahrstunde|fahren|auto|abholen)/i],
    ['food', /\b(essen|mittag|abendessen|frühstück|kochen|restaurant)/i], ['coffee', /\b(kaffee|café|cafe)/i], ['cart', /\b(einkauf|kaufen|supermarkt|shopping)/i],
    ['gamepad', /\b(zocken|spiel|gaming|roblox|konsole)/i], ['briefcase', /\b(arbeit|job|praktikum|schicht|bewerbung)/i], ['bell', /\b(erinner|deadline|abgabe|frist)/i],
    ['chat', /\b(anruf|telefon|call|anrufen)/i], ['home', /\b(zuhause|aufräumen|putzen|haushalt)/i], ['globe', /\b(englisch|französisch|spanisch|latein|sprache)/i],
    ['leaf', /\b(bio|biologie|natur|garten|wandern)/i], ['bolt', /\b(physik|chemie)/i], ['palette', /\b(kunst|malen|zeichnen)/i], ['camera', /\b(foto|fotos|film|video)/i],
  ];
  const guessIcon = (title) => { const hit = ICON_WORDS.find(([, re]) => re.test(title || '')); return hit ? `f-${hit[0]}` : 'f-calendar'; };
  const emodal = document.createElement('div');
  emodal.className = 'tk-modal cal-emodal';
  emodal.hidden = true;
  document.body.append(emodal);
  // 19.11.: Fenster kann auch an Ort und Stelle aufgeklappt sein (Aufgaben-Karte): opts.inline = Behälter
  let inlineForm = null, inlineDone = null;
  function eclose() {
    if (inlineForm) {
      const f = inlineForm, done = inlineDone; inlineForm = null; inlineDone = null;
      if (window.TagMenu?.isOpen) window.TagMenu.close();
      const h = f.offsetHeight;
      const fin = () => { f.remove(); done?.(); };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) fin();
      else f.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }).finished.then(fin, fin);
      return;
    }
    if (emodal.hidden) return;
    if (window.TagMenu?.isOpen) window.TagMenu.close();
    document.querySelectorAll('.cw-ghost').forEach((g) => g.remove());
    emodal.classList.add('closing');
    setTimeout(() => { emodal.hidden = true; emodal.classList.remove('closing'); emodal.replaceChildren(); }, 220);
  }
  emodal.addEventListener('pointerdown', (x) => { if (x.target === emodal) eclose(); });
  document.addEventListener('keydown', (x) => {
    if (x.key !== 'Escape' || (emodal.hidden && !inlineForm)) return;
    if (inlineForm) { const pop = inlineForm.querySelector('.tk-pop.open'); if (pop) pop.classList.remove('open'); else eclose(); return; }
    const pop = emodal.querySelector('.tk-pop.open');
    if (pop) pop.classList.remove('open'); else eclose();
  });
  const WD_SHORT = EN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  // store: eigener Speicherort (z. B. Kalender in einem Dokument) – { onSave(item), onDelete(id) }; ohne: der Kalender der App
  // anchor = Termin/Zelle im Wochenraster: das Fenster erscheint wie in der Vorlage als Popover mit Spitze direkt daneben
  // Karte neben den Termin (bzw. unter „Neuer Termin“) setzen – ohne Spitze, ohne Schleier
  function place(form, anchor) {
    if (anchor?.closest?.('.cm-head, .au-head')) anchor = null; // 19.11.: „Neuer Termin“ / „Neue Aufgabe“ → Fenster mittig, Rest unscharf
    emodal.classList.toggle('anchored', !!anchor);
    if (!anchor || !anchor.isConnected) { emodal.classList.remove('anchored'); form.removeAttribute('style'); return; }
    const r = anchor.getBoundingClientRect(), fw = Math.min(340, innerWidth - 24), gap = 8;
    const fh = form.offsetHeight || 260;
    const room = form.classList.contains('ce-view') ? 0 : 290; // Bearbeiten: Platz nach unten zum Aufklappen
    let left, top;
    if (anchor.closest('.cm-head, .au-head')) { // „Neuer Termin“ / „Neue Aufgabe“ oben rechts: klappt darunter auf, rechtsbündig
      left = Math.max(8, Math.min(innerWidth - fw - 8, r.right - fw));
      top = r.bottom + gap;
    } else {
      const cell = anchor.closest('.cm-cell') || anchor, cr = cell.getBoundingClientRect();
      left = cr.right + gap + fw <= innerWidth - 8 ? cr.right + gap : cr.left - gap - fw >= 8 ? cr.left - gap - fw : Math.max(8, (innerWidth - fw) / 2);
      top = Math.max(12, Math.min(innerHeight - fh - room - 12, cr.top));
    }
    Object.assign(form.style, { position: 'fixed', left: `${left}px`, top: `${Math.max(12, top)}px`, width: `${fw}px`, maxHeight: `${Math.max(240, innerHeight - Math.max(12, top) - 12)}px` }); // 19.11.: nie unten aus dem Bild – innen scrollen
  }
  const DUR = (a, b) => { const s0 = minsOf(a), e0 = minsOf(b); if (s0 == null || e0 == null || e0 <= s0) return ''; const d = e0 - s0; return d < 60 ? `${d} Min.` : `${Math.floor(d / 60)} Std.${d % 60 ? ` ${d % 60} Min.` : ''}`; };
  const dateText = (k) => { const d = new Date(`${k}T12:00:00`); return `${WEEKDAYS[d.getDay()]}, ${dm(d)}`; };

  /* Termin antippen (19.11.): öffnet direkt das Bearbeiten-Fenster am Termin (kein Ansehen + Stift mehr);
     die Kommentare stehen unten im Fenster (Enter fügt hinzu, gespeichert am Termin: comments: [{ t, at }]) */
  function showEvent(ev, anchor, store = null) {
    if (!ev) return;
    if (!Array.isArray(ev.comments)) ev.comments = []; // dieselbe Liste wie in der Kopie des Formulars → Speichern behält neue Kommentare
    edit(ev, null, ev.time || '', ev.end || '', store, anchor);
    const form = emodal.querySelector('form');
    if (!form) return;
    const box = document.createElement('div');
    box.className = 'ce-cbox ce-cbox-edit';
    box.innerHTML = `<div class="ce-clist"></div>
      <label class="ce-cnew"><span class="tk-si">${icon('f-chat')}</span><input class="ce-cin" maxlength="300" placeholder="Kommentar hinzufügen" aria-label="Kommentar hinzufügen" autocomplete="off" /></label>`;
    form.querySelector('.ce-foot')?.before(box);
    const cbox = box.querySelector('.ce-clist');
    const persist = () => { if (store) store.onSave({ ...ev }); else save(); };
    const draw = () => {
      cbox.hidden = !ev.comments.length;
      cbox.innerHTML = ev.comments.map((c, i) => `<div class="ce-cm"><span class="ce-cm-t">${esc(c.t)}</span><button type="button" class="ce-cm-x" data-cdel="${i}" aria-label="Kommentar löschen">${icon('f-x')}</button></div>`).join('');
    };
    draw();
    const cin = box.querySelector('.ce-cin');
    cin.addEventListener('keydown', (x) => {
      x.stopPropagation();
      if (x.key === 'Escape') { x.target.blur(); eclose(); return; }
      if (x.key !== 'Enter') return;
      x.preventDefault(); // kein Absenden des Formulars
      const t = x.target.value.trim(); if (!t) return;
      ev.comments.push({ t: t.slice(0, 300), at: Date.now() });
      if (ev.comments.length > 30) ev.comments.splice(0, ev.comments.length - 30);
      x.target.value = ''; persist(); draw();
    });
    cin.addEventListener('keypress', (x) => x.stopPropagation());
    cbox.addEventListener('click', (x) => { const d = x.target.closest('[data-cdel]'); if (!d) return; x.stopPropagation(); ev.comments.splice(+d.dataset.cdel, 1); persist(); draw(); });
    place(form, anchor); // nach dem Einfügen neu messen
  }
  /* „+N weitere“: alle Termine des Tages in einer kleinen Karte */
  function showDayList(date, anchor) {
    close();
    const list = dayEvents(date);
    emodal.innerHTML = `<div class="tk-form ce-card ce-view ce-daylist">
      <div class="ce-headbox ce-vhead"><div class="ce-vtitle">${dateText(date)}</div><div class="ce-vsub">${list.length} Termine</div></div>
      <div class="ce-dl"></div></div>`;
    const card = emodal.firstElementChild, box = card.querySelector('.ce-dl');
    list.forEach((e) => box.append(chip(e)));
    card.addEventListener('click', (x) => {
      const p = x.target.closest('.cm-ev');
      if (p) showEvent(events.find((e) => e.id === p.dataset.id), anchor);
    });
    emodal.hidden = false;
    place(card, anchor);
  }
  // Cover-Bild: auf höchstens 720 × 400 px verkleinern (JPEG), damit es klein im Speicher bleibt
  function shrinkImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 720 / img.naturalWidth, 400 / img.naturalHeight);
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.74));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild')); };
      img.src = url;
    });
  }
  // 18.11.: Cover eines Termins – eigenes Bild (alt: Text data:…) oder wie beim Dokument (Vorlage, Farbe, KI): { kind, … }
  const coverBg = (c) => (!c ? '' : typeof c === 'string' ? `center / cover no-repeat url("${c.replace(/"/g, '%22')}")` : window.Docs?.editor?.coverCss?.(c) || '');
  /* 18.11. spät: opts.task = dasselbe Fenster für Aufgaben (aufgaben.js): Status (runder Kasten), Priorität, Fällig am,
     „Im Kalender eintragen“ (Schalter + Uhrzeit), Tags, Cover – keine Farbe. Termine haben jetzt ebenfalls Tags. */
  function edit(ev, date, time = '', end = '', store = null, anchor = null, opts = {}) {
    close(); // ggf. Tagesliste schließen
    const T = !!opts.task;
    const e = ev ? { ...ev } : T ? { id: '', title: '', description: '', date: '', time: '', end: '', status: 'open', priority: 'none', tags: [] } : { id: '', title: '', description: '', date: date || todayIso(), time, end, color: EV_COLORS[6] || COLORS[0], icon: 'f-calendar' };
    if (!Array.isArray(e.tags)) e.tags = [];
    const STATI = [['open', 'Offen'], ['doing', 'In Arbeit'], ['done', 'Erledigt'], ['archived', 'Archiviert']];
    const STI = { open: 'f-st-open', doing: 'f-st-doing', done: 'f-st-done', archived: 'f-st-arch' };
    const PRIOS = window.UIKit?.PRIOS || [{ id: 'none', name: 'Keine' }];
    let iconPicked = !!ev && ev.icon !== 'f-calendar'; // neuer Termin: Icon folgt dem Titel, bis eins gewählt wird
    // Aufbau wie das Aufgaben-Fenster: × oben rechts, Titel + „Beschreibung hinzufügen“, darunter Zeilen (Icon + Wert),
    // die ihren Inhalt in einem Kasten direkt unter sich aufklappen (UIKit.foldRows); unten Löschen + blauer Knopf
    // Karten-Stil wie die Vorlage: oben ein Kasten mit Titel + Beschreibung, darunter je Eigenschaft ein eigener Kasten,
    // der seinen Inhalt in sich aufklappt (rechts ein kleiner Pfeil-Knopf)
    const pill = (k, menu, cls = '') => `<div class="tk-pop" data-k="${k}"><button type="button" class="tk-pill" data-open="${k}"></button><div class="tk-menu ${cls}"><div class="tk-box">${menu}</div></div></div>`;
    emodal.innerHTML = `<form class="tk-form tk-sheet ce-sheet ce-card${T ? ' ce-task' : ''}" autocomplete="off">
      <div class="tk-sheet-main ce-headbox">
        <div class="ce-cover"${e.cover ? '' : ' hidden'}><span class="ce-cover-bg"></span><button type="button" class="ce-cover-x" data-act="cover-x" aria-label="Cover entfernen">${icon('f-x')}</button></div>
        <input class="tk-f-title" name="title" value="${esc(e.title)}" placeholder="Titel" maxlength="80" aria-label="Titel" required />
        <textarea class="tk-f-notes" name="description" rows="1" placeholder="Beschreibung hinzufügen" maxlength="400" aria-label="Beschreibung">${esc(e.description)}</textarea>
      </div>
      <input type="file" accept="image/*" class="ce-cover-in" hidden />
      <div class="tk-sheet-rows ce-rows">
        ${T ? pill('status', STATI.map(([k, n]) => `<button type="button" class="tk-mi" data-st="${k}">${icon(STI[k])}<span>${n}</span>${icon('f-check')}</button>`).join(''), 'prio') : ''}
        ${pill('date', '<div class="tk-cal"></div>', 'date')}
        ${pill('time', `<div class="ce-wheels"><div><span class="tk-ml">Beginn</span><div data-wheel="time"></div></div><div><span class="tk-ml">Ende</span><div data-wheel="end"></div></div></div>`, 'time')}
        ${T ? '<div class="tk-pop ce-calrow"><button type="button" class="tk-pill" data-act="cal"></button></div>' : ''}
        ${T ? '' : pill('color', evColorRow(e.color), 'color')}
        ${T ? pill('prio', PRIOS.map((p) => `<button type="button" class="tk-mi" data-prio="${p.id}">${window.UIKit?.prioIcon?.(p.id, 15) || ''}<span>${esc(p.name)}</span>${icon('f-check')}</button>`).join(''), 'prio') : ''}
        <div class="tk-pop ce-tags-row" data-k="tags"><div class="tk-pill" data-open="tags" role="button" tabindex="0"><span class="tk-si">${icon('f-tag')}</span><span class="tk-rv"><span class="ce-tl">Tags</span><span class="ce-tchips"></span></span><span class="ce-tsearch"></span><span class="ce-chev">${icon('f-chevron-down')}</span></div><div class="tk-menu tags"><div class="tk-box ce-tagbox"></div></div></div>
        <div class="tk-pop ce-cover-row"><button type="button" class="tk-pill" data-act="cover"></button></div>
      </div>
      <div class="tk-sheet-foot ce-foot">${ev ? `<button type="button" class="tk-sheet-ib danger" data-act="delete" aria-label="Löschen">${icon('f-trash')}</button>` : ''}<span class="grow"></span><button type="submit" class="tk-create tk-make">${ev ? 'Speichern' : 'Erstellen'}</button></div>
    </form>`;
    const form = emodal.querySelector('form');
    UIKit.foldRows(form);
    const notes = form.querySelector('.tk-f-notes');
    const grow = UIKit.autoGrow(notes); // wächst nur mit dem Text, höchstens 4 Zeilen

    const toMin = (v) => { const m = /^(\d{2}):(\d{2})$/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const fromMin = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    const draw = () => {
      const d = new Date(`${e.date || todayIso()}T12:00:00`);
      const chev = `<span class="ce-chev">${icon('f-chevron-down')}</span>`; // nur ein leiser Pfeil, kein Kasten
      const set = (k, ic, text, extra = '') => { form.querySelector(`[data-open="${k}"]`).innerHTML = `<span class="tk-si">${ic}</span><span class="tk-rv">${text}</span>${extra}${chev}`; };
      if (T && !e.date) set('date', icon('f-calendar'), '<span class="ce-off">Fällig am</span>');
      else set('date', icon('f-calendar'), `${T ? `${WD_SHORT[d.getDay()]}, ${dm(d, MONTHS_SHORT)}` : `${WEEKDAYS[d.getDay()]}, ${dm(d)}`}${e.date === todayIso() ? '<b class="ce-today">Heute</b>' : ''}`, T ? `<span class="ce-x" data-act="date-x" role="button" aria-label="Datum entfernen">${icon('f-x')}</span>` : '');
      if (T) {
        const pr = PRIOS.find((p) => p.id === (e.priority || 'none')) || PRIOS[0];
        set('prio', window.UIKit?.prioIcon?.(pr.id, 15) || icon('f-flag'), pr.id === 'none' ? '<span class="ce-off">Priorität</span>' : esc(pr.name));
        form.querySelectorAll('[data-prio]').forEach((b) => b.classList.toggle('on', b.dataset.prio === (e.priority || 'none')));
        form.querySelectorAll('[data-st]').forEach((b) => b.classList.toggle('on', b.dataset.st === (e.status || 'open')));
      }
      const tg = (window.TagMenu?.all?.() || []).filter((g) => e.tags.includes(g.id));
      form.querySelector('.ce-tchips').innerHTML = tg.slice(0, 3).map((g) => `<span class="lb2-tag" style="--c:${esc(g.c)}"><span>${esc(g.name)}</span></span>`).join('') + (tg.length > 3 ? `<span class="lb2-tag more">+${tg.length - 3}</span>` : ''); // ab 4 Tags: „+N“
      form.querySelector('.ce-tags-row').classList.toggle('has', !!tg.length);
      if (T) form.querySelector('[data-act="cal"]').innerHTML = `<span class="tk-si">${icon('f-calendar')}</span><span class="tk-rv${e.cal ? '' : ' ce-off'}">Im Kalender eintragen</span><span class="ce-check${e.cal ? ' on' : ''}" role="checkbox" aria-checked="${!!e.cal}">${icon('f-check')}</span>`;
      if (T) { const st = e.status || 'open'; set('status', icon(STI[st]), esc((STATI.find(([k]) => k === st) || STATI[0])[1])); }
      // Zeit wie in der Vorlage: „16:30 → 17:30“, rechts die Dauer
      const s = toMin(e.time), en = toMin(e.end), dur = s != null && en != null && en > s ? en - s : null;
      const durTxt = dur == null ? '' : dur < 60 ? `${dur} Min.` : `${Math.floor(dur / 60)} Std.${dur % 60 ? ` ${dur % 60} Min.` : ''}`;
      // Uhrzeit: Regler direkt in der Zeile (kein Aufklappen von Hand) – an = Uhrzeit festgelegt, die Räder fahren darunter aus; aus = ganztägig
      form.querySelector('[data-open="time"]').innerHTML = `<span class="tk-si">${icon('f-clock')}</span><span class="tk-rv${e.time ? '' : ' ce-off'}">${e.time ? `${e.time}${e.end ? ` bis ${e.end}` : ''} Uhr` : 'Uhrzeit'}</span>${durTxt ? `<span class="ce-dur">${durTxt}</span>` : ''}<span class="ce-switch${e.time ? ' on' : ''}" data-allday role="switch" aria-checked="${!!e.time}" aria-label="Uhrzeit festlegen"><i></i></span>`;
      if (!T) set('color', `<i class="ce-dot" style="background:${e.color}"></i>`, 'Farbe');
      form.querySelector('[data-act="cover"]').innerHTML = `<span class="tk-si">${icon('f-image')}</span><span class="tk-rv">${e.cover ? 'Cover ändern' : 'Cover hinzufügen'}</span><span class="ce-chev">${icon('f-plus')}</span>`;
      const cv = form.querySelector('.ce-cover'), bg = coverBg(e.cover); cv.hidden = !bg; if (bg) cv.firstElementChild.style.background = bg;
      form.querySelector('.ce-wheels').hidden = !e.time; // ganztägig: keine Uhrzeiten
      form.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === e.color));
      const own = form.querySelector('.ce-own'); if (own) own.hidden = !own.firstElementChild;
    };
    // Datum: kleiner Kalender
    const cal = UIKit.miniCalendar(form.querySelector('.tk-cal'), () => e.date, (iso) => { e.date = iso; draw(); setTimeout(() => form.querySelector('.tk-pop[data-k="date"]').classList.remove('open'), 140); });
    // Zeit: zwei Räder (Beginn / Ende), Ende rückt mit, wenn der Beginn danach liegt
    const wStart = UIKit.timeWheel(e.time || '09:00', (v) => {
      e.time = v;
      if (!e.end || toMin(e.end) <= toMin(v)) { e.end = fromMin(Math.min(23 * 60 + 55, toMin(v) + 60)); wEnd.setValue(e.end); }
      draw();
    });
    const wEnd = UIKit.timeWheel(e.end || '10:00', (v) => { if (e.time) { e.end = v; draw(); } });
    form.querySelector('[data-wheel="time"]').append(wStart);
    form.querySelector('[data-wheel="end"]').append(wEnd);

    const openPop = (k) => {
      form.querySelectorAll('.tk-pop').forEach((p) => p.classList.toggle('open', p.dataset.k === k && !p.classList.contains('open')));
      const p = form.querySelector(`.tk-pop[data-k="${k}"].open`);
      if (p) setTimeout(() => { if (p.classList.contains('open')) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 430); // aufgeklappter Inhalt rutscht sichtbar ins Fenster
      const tagsOpen = form.querySelector('.tk-pop[data-k="tags"].open');
      if (tagsOpen && k === 'tags') window.TagMenu?.embed?.(form.querySelector('.ce-tagbox'), form.querySelector('.ce-tsearch'), { key: 'embed', get: () => e.tags, set: (ids) => { e.tags = ids; draw(); } });
      else if (window.TagMenu?.isOpen) window.TagMenu.close();
      if (k === 'tags' && tagsOpen) setTimeout(() => form.querySelector('.ce-tsearch input')?.focus({ preventScroll: true }), 60);
      if (k === 'date' && p) cal.open();
      if (k === 'time' && p) requestAnimationFrame(() => { wStart.setValue(e.time || '09:00'); wEnd.setValue(e.end || '10:00'); });
    };
    // Regler „Uhrzeit“ (16.11.): draw() zeichnet die Zeile neu → ohne Hilfe springt der Knopf nur um. Daher läuft er hier
    // sichtbar von der alten zur neuen Seite und die Spur blendet ihre Farbe weich über.
    const slideSwitch = (on) => {
      const sw = form.querySelector('[data-allday]'), k = sw?.querySelector('i');
      if (!k || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const bgNow = getComputedStyle(sw).backgroundColor; sw.classList.toggle('on'); const bgWas = getComputedStyle(sw).backgroundColor; sw.classList.toggle('on');
      const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';
      k.animate([{ transform: on ? 'none' : 'translateX(14px)' }, { transform: on ? 'translateX(14px)' : 'none' }], { duration: 320, easing: ease });
      sw.animate([{ backgroundColor: bgWas }, { backgroundColor: bgNow }], { duration: 260, easing: 'ease' });
    };
    form.addEventListener('click', (x) => {
      const op = x.target.closest('[data-open]');
      // Uhrzeit-Zeile: Regler (oder Zeile ohne Uhrzeit) schaltet die Uhrzeit an/aus – an: die Räder fahren aus, aus: sie fahren ein
      if (op && op.dataset.open === 'time' && (x.target.closest('[data-allday]') || !e.time)) {
        const pop = op.closest('.tk-pop');
        if (e.time) { e.time = ''; e.end = ''; pop.classList.remove('open'); draw(); slideSwitch(false); return; }
        e.time = '09:00'; e.end = '10:00'; if (!e.date) e.date = todayIso(); draw(); slideSwitch(true);
        form.querySelectorAll('.tk-pop.open').forEach((q) => q.classList.remove('open'));
        pop.classList.add('open');
        requestAnimationFrame(() => { wStart.setValue(e.time); wEnd.setValue(e.end); });
        return;
      }
      if (x.target.closest('[data-act="cal"]')) { e.cal = !e.cal; if (e.cal && !e.date) e.date = todayIso(); form.querySelectorAll('.tk-pop.open').forEach((q) => q.classList.remove('open')); draw(); return; }
      if (x.target.closest('[data-act="date-x"]')) { e.date = ''; e.time = ''; e.end = ''; e.cal = false; form.querySelectorAll('.tk-pop.open').forEach((q) => q.classList.remove('open')); draw(); return; }
      if (op) { openPop(op.dataset.open); return; }
      if (x.target.closest('.ce-tsearch')) return; // Suchfeld in der Tags-Zeile
      const stb = x.target.closest('[data-st]'); if (stb) { e.status = stb.dataset.st; draw(); stb.closest('.tk-pop')?.classList.remove('open'); return; }
      const prb = x.target.closest('[data-prio]'); if (prb) { e.priority = prb.dataset.prio; draw(); prb.closest('.tk-pop').classList.remove('open'); return; }

      const cu = x.target.closest('[data-custom]');
      if (cu) {
        // Eigene Farbe: der bunte Knopf bleibt, wie er ist; die Farbe erscheint oben in der Zeile (Vorschau) und kommt mit „Übernehmen“
        // in die Reihe darunter – gespeichert und gleich ausgewählt. Ohne „Übernehmen“ gilt wieder die vorige Farbe.
        const host = form.querySelector('.tk-picker-host');
        if (host.firstChild) { e.color = host._before || e.color; host.replaceChildren(); draw(); return; }
        host._before = e.color;
        host.append(UIKit.colorPicker(EV_COLORS.includes(e.color) || COLORS.includes(e.color) ? '#5b8cff' : e.color, (hex, done) => {
          e.color = hex;
          if (done) { addOwn(hex); host._before = hex; host.replaceChildren(); form.querySelector('.ce-own').innerHTML = ownRow(hex); }
          draw();
        }));
        return;
      }
      if (x.target.closest('.tk-picker')) return;
      const co = x.target.closest('[data-color]');
      if (co) { if (!co.dataset.color) return; e.color = co.dataset.color; const host = form.querySelector('.tk-picker-host'); host._before = e.color; host.replaceChildren(); draw(); co.closest('.tk-pop').classList.remove('open'); return; }
      if (!x.target.closest('.tk-pop')) form.querySelectorAll('.tk-pop.open').forEach((p) => p.classList.remove('open'));
      const act = x.target.closest('[data-act]')?.dataset.act;
      if (act === 'cover') { // gleiches Cover-Fenster wie beim Dokument (Vorlagen, Farben, eigenes Bild, KI)
        form.querySelectorAll('.tk-pop.open').forEach((p) => p.classList.remove('open'));
        if (window.Docs?.editor?.pickCover) window.Docs.editor.pickCover({ get: () => (typeof e.cover === 'object' ? e.cover : null), set: (c) => { e.cover = c || ''; draw(); } });
        else form.querySelector('.ce-cover-in').click();
        return;
      }
      if (act === 'cover-x') { e.cover = ''; draw(); return; }
      if (act === 'close') eclose();
      if (act === 'delete') { if (store) store.onDelete(e.id); else { events = events.filter((y) => y.id !== e.id); save(); render(); if (!dv.hidden) drawDay(); } eclose(); }
    });
    form.addEventListener('keydown', (x) => {
      if (x.key !== 'Escape') x.stopPropagation(); // Esc schließt das Fenster auch aus dem Titel-Feld heraus
      if (x.key === 'Enter' && (x.metaKey || x.ctrlKey)) { x.preventDefault(); form.requestSubmit(); }
      else if (x.key === 'Enter' && x.target.matches('.tk-f-title')) { x.preventDefault(); notes.focus(); }
    });
    form.addEventListener('keypress', (x) => x.stopPropagation());
    form.querySelector('.ce-cover-in').addEventListener('change', async (x) => {
      const f = x.target.files && x.target.files[0]; x.target.value = '';
      if (!f) return;
      try { e.cover = await shrinkImage(f); draw(); } catch {}
    });
    form.querySelector('.tk-f-title').addEventListener('input', (x) => { if (iconPicked) return; const n = guessIcon(x.target.value); if (n !== e.icon) { e.icon = n; draw(); } });
    form.addEventListener('submit', (x) => {
      x.preventDefault();
      const title = String(new FormData(form).get('title')).trim();
      if (!title) {
        form.querySelector('.tk-f-title').focus();
        form.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 280, easing: 'ease-out' });
        return;
      }
      if (form.classList.contains('saving')) return;
      form.classList.add('saving');
      const btn = form.querySelector('.tk-create');
      btn.style.width = `${btn.offsetWidth}px`;
      btn.innerHTML = icon('f-check');
      setTimeout(() => {
        const item = { ...e, title, description: notes.value.trim() };
        if (store) { if (!item.id) item.id = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; store.onSave(item); } else upsert(item);
        eclose();
      }, 260);
    });
    draw();
    if (opts.inline) { // an Ort und Stelle aufklappen (kein Fenster daneben)
      if (inlineForm) { inlineForm.remove(); inlineDone?.(); }
      emodal.hidden = true; emodal.replaceChildren();
      form.classList.add('ce-inline'); opts.inline.append(form); inlineForm = form; inlineDone = opts.onClose || null;
      requestAnimationFrame(grow);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { const h = form.offsetHeight; form.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }); }
      return;
    }
    emodal.hidden = false;
    place(form, anchor);
    requestAnimationFrame(grow);
    setTimeout(() => form.querySelector('.tk-f-title').focus(), 60);
  }

  function dayList(date) {
    const list = events.filter((e) => e.date === date).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const d = new Date(`${date}T12:00:00`);
    modal.innerHTML = `<div class="cal-card cal-day-card"><div class="cal-day-title">${dm(d)}</div><div class="cal-day-list"></div>
      <div class="cal-card-foot"><div class="flex-spacer"></div><button type="button" class="cal-btn primary" data-new>Neuer Termin</button></div></div>`;
    const box = modal.querySelector('.cal-day-list');
    list.forEach((e) => box.append(pill(e)));
    modal.querySelector('.cal-card').addEventListener('click', (x) => {
      const p = x.target.closest('.cal-pill');
      if (p) edit(events.find((e) => e.id === p.dataset.id));
      if (x.target.closest('[data-new]')) edit(null, date);
    });
    modal.hidden = false;
  }

  function upsert(item) {
    if (!item.id) item.id = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const i = events.findIndex((e) => e.id === item.id);
    if (i >= 0) events[i] = item; else events.push(item);
    save();
    if (open) {
      const d = new Date(`${item.date}T12:00:00`);
      cursor = monthOf(d);
      render();
      view.querySelector(`.cm-ev[data-id="${item.id}"]`)?.classList.add('fresh');
      if (!dv.hidden) { dayDate = item.date; drawDay(); dv.querySelector(`[data-id="${item.id}"]`)?.classList.add('fresh'); }
    }
    return item;
  }

  /* ---------- Öffnen / Schließen (Seitenleiste „Calendar“, Tabs → zurück zum Chat) ---------- */
  function mount() {
    const panel = document.querySelector('.panel');
    if (panel && !view.isConnected) panel.append(view);
  }
  function show() {
    mount();
    dv.hidden = true;
    dvWrap.hidden = true;
    open = true;
    view.hidden = false;
    render();
    // 16.11. spät: beim Öffnen erscheinen die Kacheln einzeln in zufälliger Reihenfolge (keine Welle) – nur beim Öffnen, nicht beim Monatswechsel
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      view.querySelectorAll('.cm-cell').forEach((c) => { c.style.setProperty('--td', `${Math.round(Math.random() * 380)}ms`); });
      view.classList.remove('cal-enter'); void view.offsetWidth; view.classList.add('cal-enter');
      clearTimeout(show.t); show.t = setTimeout(() => view.classList.remove('cal-enter'), 1200);
    }
    document.querySelector('.panel')?.classList.add('view-calendar');
  }
  function hide() {
    if (!open) return;
    open = false;
    view.hidden = true;
    dv.hidden = true; // Tagesfenster schließt beim Tab-Wechsel mit
    dvWrap.hidden = true;
    document.querySelector('.panel')?.classList.remove('view-calendar');
  }
  // Öffnen/Schließen steuern die Tabs oben (app.js → openViewTab)

  /* Agent / Sprache: Termin anlegen */
  function add(a = {}) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(a.date || '')) ? a.date : todayIso();
    const time = /^\d{1,2}:\d{2}$/.test(String(a.time || '')) ? String(a.time).padStart(5, '0') : '';
    const item = upsert({ id: '', title: String(a.title || 'Termin').slice(0, 80), description: String(a.description || '').slice(0, 400), date, time, end: time && /^\d{1,2}:\d{2}$/.test(String(a.end || '')) ? String(a.end).padStart(5, '0') : '', tags: Array.isArray(a.tags) ? a.tags.slice(0, 12).map(String) : [], // 19.11.: Ende + Tags wurden verworfen
      color: COLORS.includes(a.color) ? a.color : COLORS[0], icon: ICONS.includes(`i-${a.icon}`) ? `i-${a.icon}` : ICONS.includes(a.icon) ? a.icon : 'i-calendar' });
    return item;
  }

  // Termin-Fenster von außen öffnen (Dokument-Kalender): gleiches Fenster, eigener Speicherort
  const openEditor = (ev, date, store) => edit(ev || null, date, ev?.time || '', ev?.end || '', store);
  // für den Sprach-Agenten: Termin per Titel (und optional Datum) löschen
  function remove({ title, date } = {}) {
    const q = String(title || '').toLowerCase().trim(); if (!q) return null;
    const ok = (e) => (!date || e.date === date);
    const hit = events.find((e) => ok(e) && e.title.toLowerCase() === q) || events.find((e) => ok(e) && e.title.toLowerCase().includes(q));
    if (!hit) return null;
    events = events.filter((e) => e !== hit); save(); if (open) render();
    return hit;
  }
  const editTask = (task, anchor, store, more = {}) => edit(task || null, '', task?.time || '', task?.end || '', store, anchor, { task: true, ...more });
  return { show, hide, add, remove, openEditor, editTask, upsert, removeEvent: (id) => { events = events.filter((y) => y.id !== id); save(); if (open) render(); }, get open() { return open; }, get events() { return events.slice(); } };
})();
window.Calendar = Calendar;
if (window.AppActions) {
  const openCal = () => (window.openViewTab ? window.openViewTab('calendar') : Calendar.show());
  window.AppActions.add_event = (a) => { Calendar.add(a); openCal(); };
  window.AppActions.open_calendar = openCal;
}
