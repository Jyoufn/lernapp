/* ===================================================================
   Kalender
   - Monatsansicht (Seitenleiste → „Calendar“), Termine als leicht durchscheinende, farbige Einträge mit Icon
   - Klick auf einen Tag oder „Neuer Termin“ → Menü: Titel, Beschreibung, Datum, Uhrzeit, Icon, Farbe
   - Klick auf einen Termin → bearbeiten oder löschen
   - Gespeichert im Browser (localStorage); der Agent kann Termine anlegen (AppActions.add_event)
   =================================================================== */
const Calendar = (() => {
  const KEY = 'calendarEvents';
  const COLORS = ['#6d9fff', '#a78bfa', '#f472b6', '#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf'];
  const ICONS = ['i-calendar', 'i-book', 'i-pencil', 'i-star', 'i-people', 'i-timer', 'i-music', 'i-heart', 'i-globe', 'i-bolt', 'i-file', 'i-check'];
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  let events = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(events)); } catch {} window.dispatchEvent(new CustomEvent('calendar-changed')); };
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => iso(new Date());
  const icon = (id) => `<svg width="16" height="16" aria-hidden="true"><use href="#${id}"/></svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let cursor = new Date(); cursor.setDate(1); // angezeigter Monat
  let open = false;

  /* ---------- Ansicht ---------- */
  const view = document.createElement('section');
  view.className = 'cal-view';
  view.hidden = true;
  view.setAttribute('aria-label', 'Kalender');
  view.innerHTML = `
    <header class="cal-head">
      <div class="cal-title"><span class="cal-month"></span><span class="cal-year"></span></div>
      <div class="cal-nav">
        <div class="cal-seg">
          <button type="button" data-cal="prev" aria-label="Vorheriger Monat" title="Vorheriger Monat">${icon('f-back')}</button>
          <button type="button" class="cal-seg-today" data-cal="today">Heute</button>
          <button type="button" data-cal="next" aria-label="Nächster Monat" title="Nächster Monat">${icon('f-forward')}</button>
        </div>
        <button class="cal-new" type="button" data-cal="new" title="Neuer Termin">${icon('f-plus')}<span>Neuer Termin</span></button>
      </div>
    </header>
    <div class="cal-weekdays">${DAYS.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="cal-grid"></div>`;
  const grid = view.querySelector('.cal-grid');

  function render(dir = 0) {
    view.querySelector('.cal-month').textContent = MONTHS[cursor.getMonth()];
    view.querySelector('.cal-year').textContent = cursor.getFullYear();
    const first = new Date(cursor);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // Montag davor
    const today = todayIso();
    const cells = [];
    // nur so viele Wochen wie der Monat braucht (4–6) – kompakter, die Zeilen werden dafür etwas höher
    const daysIn = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysIn) / 7);
    grid.style.gridTemplateRows = `repeat(${weeks}, 1fr)`;
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = iso(d);
      const list = events.filter((e) => e.date === key).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      const cell = document.createElement('div');
      cell.className = `cal-cell${d.getMonth() !== cursor.getMonth() ? ' other' : ''}${key === today ? ' today' : ''}${i % 7 > 4 ? ' weekend' : ''}`;
      cell.dataset.date = key;
      cell.innerHTML = `<span class="cal-day">${d.getDate()}</span><div class="cal-events"></div>`;
      const box = cell.querySelector('.cal-events');
      list.slice(0, 3).forEach((e) => box.append(pill(e)));
      if (list.length > 3) { const more = document.createElement('button'); more.type = 'button'; more.className = 'cal-more'; more.textContent = `+${list.length - 3} weitere`; more.dataset.more = key; box.append(more); }
      cells.push(cell);
    }
    grid.replaceChildren(...cells);
    if (dir) { grid.classList.remove('slide-l', 'slide-r'); void grid.offsetWidth; grid.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
  }
  function pill(e) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cal-pill';
    b.dataset.id = e.id;
    b.style.setProperty('--c', e.color || COLORS[0]);
    b.innerHTML = `${icon(e.icon || 'i-calendar')}<span class="cal-pill-t">${esc(e.title)}</span>${e.time ? `<span class="cal-pill-time">${esc(e.time)}</span>` : ''}`;
    b.title = [e.time, e.title, e.description].filter(Boolean).join(' · ');
    return b;
  }

  view.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-cal]')?.dataset.cal;
    if (a === 'prev') { cursor.setMonth(cursor.getMonth() - 1); render(-1); return; }
    if (a === 'next') { cursor.setMonth(cursor.getMonth() + 1); render(1); return; }
    if (a === 'today') { cursor = new Date(); cursor.setDate(1); render(); return; }
    if (a === 'new') { edit(null, todayIso()); return; }
    const p = ev.target.closest('.cal-pill');
    if (p) { edit(events.find((e) => e.id === p.dataset.id)); return; }
    const more = ev.target.closest('[data-more]');
    if (more) { dayList(more.dataset.more); return; }
    const cell = ev.target.closest('.cal-cell');
    if (cell) openDay(cell.dataset.date, cell);
  });

  /* ---------- Tagesansicht: Klick auf einen Tag → Tag wächst weich aus der Zelle, links die Uhrzeiten ---------- */
  const HOUR = 52; // Höhe einer Stunde in px
  const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
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

        <div class="cal-dv-title"><span>${WEEKDAYS[d.getDay()]},</span> ${d.getDate()}. ${MONTHS[d.getMonth()]}${dayDate === todayIso() ? '<em>Heute</em>' : ''}</div>
        <div class="cal-nav">
          <button class="cal-icon" type="button" data-dv="prev" aria-label="Vorheriger Tag" title="Vorheriger Tag">${icon('f-back')}</button>
          <button class="cal-icon" type="button" data-dv="next" aria-label="Nächster Tag" title="Nächster Tag">${icon('f-forward')}</button>
          <button class="cal-icon" type="button" data-dv="new" aria-label="Neuer Termin" title="Neuer Termin">${icon('f-plus')}</button>
          <button class="tk-x cal-dv-x" type="button" data-dv="back" aria-label="Schließen" title="Schließen">${icon('f-x')}</button>
        </div>
      </header>
      ${allDay.length ? `<div class="cal-dv-all"><span>Ganztägig</span><div></div></div>` : ''}
      <div class="cal-dv-scroll"><div class="cal-dv-hours" style="height:${24 * HOUR}px">
        ${Array.from({ length: 24 }, (_, h) => `<div class="cal-dv-row" data-hour="${h}" style="top:${h * HOUR}px"><span>${pad(h)}:00</span></div>`).join('')}
        <div class="cal-dv-events"></div>
      </div></div>`;
    if (allDay.length) dv.querySelector('.cal-dv-all > div').append(...allDay.map(pill));
    const box = dv.querySelector('.cal-dv-events');
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
    if (dayDate === todayIso()) {
      const n = new Date(), line = document.createElement('div');
      line.className = 'cal-dv-now';
      line.style.top = `${((n.getHours() * 60 + n.getMinutes()) / 60) * HOUR}px`;
      dv.querySelector('.cal-dv-hours').append(line);
    }
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
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) { cursor = d; cursor.setDate(1); }
    render();
    const done = () => { dv.hidden = true; dvWrap.hidden = true; };
    const cell = grid.querySelector(`[data-date="${dayDate}"]`);
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
    // Klick in eine Stunde → Termin um diese Uhrzeit
    const hours = ev.target.closest('.cal-dv-hours');
    if (hours) {
      const y = ev.clientY - hours.getBoundingClientRect().top;
      const h = Math.max(0, Math.min(23, Math.floor(y / HOUR)));
      edit(null, dayDate, `${pad(h)}:00`, `${pad(Math.min(23, h + 1))}:00`);
    }
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
  const emodal = document.createElement('div');
  emodal.className = 'tk-modal cal-emodal';
  emodal.hidden = true;
  document.body.append(emodal);
  function eclose() {
    if (emodal.hidden) return;
    emodal.classList.add('closing');
    setTimeout(() => { emodal.hidden = true; emodal.classList.remove('closing'); emodal.replaceChildren(); }, 220);
  }
  emodal.addEventListener('pointerdown', (x) => { if (x.target === emodal) eclose(); });
  document.addEventListener('keydown', (x) => {
    if (x.key !== 'Escape' || emodal.hidden) return;
    const pop = emodal.querySelector('.tk-pop.open');
    if (pop) pop.classList.remove('open'); else eclose();
  });
  const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  // store: eigener Speicherort (z. B. Kalender in einem Dokument) – { onSave(item), onDelete(id) }; ohne: der Kalender der App
  function edit(ev, date, time = '', end = '', store = null) {
    close(); // ggf. Tagesliste schließen
    const e = ev ? { ...ev } : { id: '', title: '', description: '', date: date || todayIso(), time, end, color: COLORS[0], icon: 'f-calendar' };
    const pill = (k, menu, cls = '') => `<div class="tk-pop" data-k="${k}"><button type="button" class="tk-pill" data-open="${k}"></button><div class="tk-menu ${cls}">${menu}</div></div>`;
    emodal.innerHTML = `<form class="tk-form" autocomplete="off">
      <div class="tk-form-head">
        <input class="tk-f-title" name="title" value="${esc(e.title)}" placeholder="Neuer Termin" maxlength="80" aria-label="Titel" required />
        <button type="button" class="tk-x" data-act="close" aria-label="Schließen">${icon('f-x')}</button>
      </div>
      <textarea class="tk-f-notes" name="description" rows="2" placeholder="Beschreibung …" maxlength="400" aria-label="Beschreibung">${esc(e.description)}</textarea>
      <div class="tk-pills">
        ${pill('date', '<div class="tk-cal"></div>', 'date')}
        ${pill('time', `<label class="ce-allday"><span>Ganztägig</span><button type="button" class="ce-switch" data-allday role="switch" aria-label="Ganztägig"><i></i></button></label>
          <div class="ce-wheels"><div><span class="tk-ml">Beginn</span><div data-wheel="time"></div></div><div><span class="tk-ml">Ende</span><div data-wheel="end"></div></div></div>`, 'time')}
        ${pill('color', UIKit.colorRow(e.color, 'data-color'), 'color')}
        ${pill('icon', `<div class="ce-icon-grid">${EV_ICONS.map((id) => `<button type="button" data-icon="${id}" aria-label="Icon">${icon(id)}</button>`).join('')}</div>`, 'icon')}
      </div>
      <div class="tk-form-foot"><span class="grow"></span>${ev ? `<button type="button" class="tk-del" data-act="delete">${icon('f-trash')}Löschen</button>` : ''}<button type="submit" class="tk-create">${ev ? 'Speichern' : 'Termin erstellen'}</button></div>
    </form>`;
    const form = emodal.querySelector('form');
    const notes = form.querySelector('.tk-f-notes');
    const grow = () => { notes.style.height = 'auto'; notes.style.height = `${Math.min(notes.scrollHeight, 160)}px`; };
    notes.addEventListener('input', grow);

    const draw = () => {
      const d = new Date(`${e.date}T12:00:00`);
      form.querySelector('[data-open="date"]').innerHTML = `${icon('f-calendar')}${WD_SHORT[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}.`;
      form.querySelector('[data-open="time"]').innerHTML = `${icon('f-clock')}${e.time ? `${e.time}${e.end ? ` – ${e.end}` : ''}` : 'Ganztägig'}`;
      form.querySelector('[data-open="color"]').innerHTML = `<i style="background:${e.color}"></i>Farbe`;
      form.querySelector('[data-open="icon"]').innerHTML = `<span style="color:${e.color}">${icon(e.icon)}</span>Icon`;
      form.querySelector('[data-allday]').classList.toggle('on', !e.time);
      form.querySelector('.ce-wheels').hidden = !e.time; // ganztägig: keine Uhrzeiten
      form.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('on', b.dataset.icon === e.icon));
      form.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === e.color));
    };
    // Datum: kleiner Kalender
    const cal = UIKit.miniCalendar(form.querySelector('.tk-cal'), () => e.date, (iso) => { e.date = iso; draw(); setTimeout(() => form.querySelector('.tk-pop[data-k="date"]').classList.remove('open'), 140); });
    // Zeit: zwei Räder (Beginn / Ende), Ende rückt mit, wenn der Beginn danach liegt
    const toMin = (v) => { const m = /^(\d{2}):(\d{2})$/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const fromMin = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
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
      if (k === 'date' && p) cal.open();
      if (k === 'time' && p) requestAnimationFrame(() => { wStart.setValue(e.time || '09:00'); wEnd.setValue(e.end || '10:00'); });
    };
    form.addEventListener('click', (x) => {
      const op = x.target.closest('[data-open]');
      if (op) { openPop(op.dataset.open); return; }
      if (x.target.closest('[data-allday]')) {
        if (e.time) { e.time = ''; e.end = ''; } else { e.time = '09:00'; e.end = '10:00'; wStart.setValue(e.time); wEnd.setValue(e.end); }
        draw(); return;
      }
      const cu = x.target.closest('[data-custom]');
      if (cu) {
        const host = cu.closest('.tk-colors').nextElementSibling;
        if (host.firstChild) { host.replaceChildren(); return; }
        host.append(UIKit.colorPicker(COLORS.includes(e.color) ? '#5b8cff' : e.color, (hex, done) => {
          e.color = hex; cu.style.setProperty('--c', hex); cu.classList.add('on'); draw();
          if (done) { host.replaceChildren(); cu.closest('.tk-pop').classList.remove('open'); }
        }));
        return;
      }
      if (x.target.closest('.tk-picker')) return;
      const co = x.target.closest('[data-color]');
      if (co) { e.color = co.dataset.color; form.querySelector('.tk-custom').classList.remove('on'); draw(); co.closest('.tk-pop').classList.remove('open'); return; }
      const ic = x.target.closest('[data-icon]');
      if (ic) { e.icon = ic.dataset.icon; draw(); ic.closest('.tk-pop').classList.remove('open'); return; }
      if (!x.target.closest('.tk-pop')) form.querySelectorAll('.tk-pop.open').forEach((p) => p.classList.remove('open'));
      const act = x.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') eclose();
      if (act === 'delete') { if (store) store.onDelete(e.id); else { events = events.filter((y) => y.id !== e.id); save(); render(); if (!dv.hidden) drawDay(); } eclose(); }
    });
    form.addEventListener('keydown', (x) => {
      x.stopPropagation();
      if (x.key === 'Enter' && (x.metaKey || x.ctrlKey)) { x.preventDefault(); form.requestSubmit(); }
      else if (x.key === 'Enter' && x.target.matches('.tk-f-title')) { x.preventDefault(); notes.focus(); }
    });
    form.addEventListener('keypress', (x) => x.stopPropagation());
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
    emodal.hidden = false;
    requestAnimationFrame(grow);
    setTimeout(() => form.querySelector('.tk-f-title').focus(), 60);
  }

  function dayList(date) {
    const list = events.filter((e) => e.date === date).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const d = new Date(`${date}T12:00:00`);
    modal.innerHTML = `<div class="cal-card cal-day-card"><div class="cal-day-title">${d.getDate()}. ${MONTHS[d.getMonth()]}</div><div class="cal-day-list"></div>
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
      if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) { cursor = d; cursor.setDate(1); }
      render();
      grid.querySelector(`[data-id="${item.id}"]`)?.classList.add('fresh');
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
    window.Tasks?.hide();
    dv.hidden = true;
    dvWrap.hidden = true;
    open = true;
    render();
    view.hidden = false;
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
    const item = upsert({ id: '', title: String(a.title || 'Termin').slice(0, 80), description: String(a.description || '').slice(0, 400), date, time, end: '',
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
  return { show, hide, add, remove, openEditor, get open() { return open; }, get events() { return events.slice(); } };
})();
window.Calendar = Calendar;
if (window.AppActions) {
  const openCal = () => (window.openViewTab ? window.openViewTab('calendar') : Calendar.show());
  window.AppActions.add_event = (a) => { Calendar.add(a); openCal(); };
  window.AppActions.open_calendar = openCal;
}
