/* ===================================================================
   Kalender
   - Wochenansicht (Seitenleiste → „Kalender“): Mo–So nebeneinander, links die Uhrzeiten, oben ganztägige Termine,
     rote Linie = jetzt; blättern wochenweise (Pfeile, „Heute“, Wischen auf dem iPad)
   - Klick in eine Stunde oder „Neuer Termin“ → Menü: Titel, Beschreibung, Datum, Uhrzeit, Icon, Farbe
   - Klick auf den Tageskopf → großes Tagesfenster
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

  // angezeigte Woche: Montag 12 Uhr (12 Uhr, damit Zeitumstellungen das Datum nicht verschieben)
  const mondayOf = (d) => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
  let cursor = mondayOf(new Date());
  let open = false;
  const WEEK_HOUR = 56; // Höhe einer Stunde in der Wochenansicht
  // Kalenderwoche nach ISO 8601
  const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 86400000 + 1) / 7); };
  const minsOf = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };

  /* ---------- Ansicht: Woche (Mo–So) mit Uhrzeiten links, ganztägige Termine oben ---------- */
  const view = document.createElement('section');
  view.className = 'cal-view cal-week';
  view.hidden = true;
  view.setAttribute('aria-label', 'Kalender');
  view.innerHTML = `
    <header class="cal-head">
      <div class="cal-title"><span class="cw-my"><span class="cal-month"></span> <span class="cal-year"></span></span></div>
      <div class="cal-nav">
        <div class="cal-seg">
          <button type="button" data-cal="prev" aria-label="Vorherige Woche" title="Vorherige Woche">${icon('f-back')}</button>
          <button type="button" class="cal-seg-today" data-cal="today">Heute</button>
          <button type="button" data-cal="next" aria-label="Nächste Woche" title="Nächste Woche">${icon('f-forward')}</button>
        </div>
        <button class="cal-new" type="button" data-cal="new" title="Neuer Termin">${icon('f-plus')}<span>Neu</span></button>
      </div>
    </header>
    <div class="cw">
      <div class="cw-top"><div class="cw-days"><span class="cw-tz"></span></div><div class="cw-all"><span class="cw-all-l">Ganztägig</span></div></div>
      <div class="cw-scroll"><div class="cw-body" style="height:${24 * WEEK_HOUR}px">
        <div class="cw-hours">${Array.from({ length: 24 }, (_, h) => `<span style="top:${h * WEEK_HOUR}px">${h ? `${pad(h)}:00` : ''}</span>`).join('')}<b class="cw-now-tag" hidden></b></div>
        <div class="cw-now-all" hidden></div>
        <div class="cw-cols"></div>
      </div></div>
    </div>`;
  const grid = view.querySelector('.cw'); // Ziel der Blätter-Animation
  const daysBox = view.querySelector('.cw-days'), allBox = view.querySelector('.cw-all'), colsBox = view.querySelector('.cw-cols'), scroller = view.querySelector('.cw-scroll');
  let scrolledOnce = false;

  // Termine eines Tages nebeneinander legen, wenn sie sich überschneiden
  function layoutDay(list) {
    const timed = list.filter((e) => minsOf(e.time) != null).map((e) => ({ e, s: minsOf(e.time), en: Math.max(minsOf(e.time) + 30, minsOf(e.end) ?? minsOf(e.time) + 60) })).sort((a, b) => a.s - b.s || b.en - a.en);
    const out = []; let cluster = [], lanes = [], clusterEnd = -1;
    const flush = () => { cluster.forEach((x) => { x.n = lanes.length; }); out.push(...cluster); cluster = []; lanes = []; };
    timed.forEach((x) => {
      if (x.s >= clusterEnd && cluster.length) flush();
      let lane = lanes.findIndex((l) => l <= x.s);
      if (lane < 0) { lane = lanes.length; lanes.push(x.en); } else lanes[lane] = x.en;
      x.lane = lane; cluster.push(x); clusterEnd = Math.max(clusterEnd, x.en);
    });
    if (cluster.length) flush();
    return out;
  }
  function render(dir = 0) {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(cursor); d.setDate(cursor.getDate() + i); return d; });
    const a = days[0], b = days[6];
    // Monat wie in der Vorlage: der Monat, in dem der Donnerstag der Woche liegt (gehört nach ISO zu diesem Monat)
    view.querySelector('.cal-month').textContent = MONTHS[days[3].getMonth()];
    view.querySelector('.cal-year').textContent = days[3].getFullYear();
    const off = -new Date().getTimezoneOffset() / 60;
    view.querySelector('.cw-tz').textContent = `GMT${off >= 0 ? '+' : '−'}${Math.abs(off)}`;
    const today = todayIso();
    daysBox.querySelectorAll('.cw-day').forEach((x) => x.remove());
    daysBox.insertAdjacentHTML('beforeend', days.map((d, i) => { const k = iso(d); return `<button type="button" class="cw-day${k === today ? ' today' : ''}${i > 4 ? ' weekend' : ''}" data-day="${k}"><span class="cw-wd">${DAYS[i]}</span><span class="cw-dn">${d.getDate()}</span></button>`; }).join(''));
    // ganztägig
    const allCells = days.map((d) => {
      const k = iso(d), c = document.createElement('div');
      c.className = 'cw-all-cell'; c.dataset.date = k;
      events.filter((e) => e.date === k && minsOf(e.time) == null).forEach((e) => c.append(pill(e)));
      return c;
    });
    allBox.replaceChildren(allBox.firstElementChild, ...allCells);
    allBox.classList.toggle('empty', !allCells.some((c) => c.children.length));
    // Spalten mit Terminen
    colsBox.replaceChildren(...days.map((d, i) => {
      const k = iso(d), col = document.createElement('div');
      col.className = `cw-col${k === today ? ' today' : ''}${i > 4 ? ' weekend' : ''}`;
      col.dataset.date = k;
      layoutDay(events.filter((e) => e.date === k)).forEach(({ e, s, en, lane, n }) => {
        const p = pill(e);
        p.classList.add('cw-ev');
        // wie in der Vorlage: Farbstrich links, oben Icon + Titel, darunter die Uhrzeit
        p.innerHTML = `<i class="cw-bar"></i><span class="cal-pill-t">${icon(e.icon || 'i-calendar')}<span>${esc(e.title)}</span></span><span class="cal-pill-time">${esc(e.time)}</span>`;
        if ((en - s) < 45) p.classList.add('short');
        Object.assign(p.style, { top: `${(s / 60) * WEEK_HOUR + 1}px`, height: `${Math.max(20, ((en - s) / 60) * WEEK_HOUR - 3)}px`, left: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` });
        const t = p.querySelector('.cal-pill-time'); if (t && e.end && (en - s) >= 45) t.textContent = `${e.time} – ${e.end}`;
        col.append(p);
      });
      if (k === today) {
        const line = document.createElement('div');
        line.className = 'cw-now';
        col.append(line);
      }
      return col;
    }));
    placeNow();
    if (!scrolledOnce && !view.hidden) {
      // beim ersten Öffnen: zur aktuellen Uhrzeit (bzw. 7 Uhr), damit der Tag sichtbar ist
      const n = new Date(); scroller.scrollTop = Math.max(0, Math.min(n.getHours() - 2, 7)) * WEEK_HOUR; scrolledOnce = true;
    }
    if (dir) { grid.classList.remove('slide-l', 'slide-r'); void grid.offsetWidth; grid.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
  }
  // Jetzt: rote Pille mit der Uhrzeit links, feine rote Linie über die Woche, kräftig im heutigen Tag – wandert jede Minute mit
  function placeNow() {
    const n = new Date(), top = `${((n.getHours() * 60 + n.getMinutes()) / 60) * WEEK_HOUR}px`;
    const inWeek = view.querySelector('.cw-col.today');
    const tag = view.querySelector('.cw-now-tag'), all = view.querySelector('.cw-now-all');
    tag.hidden = all.hidden = !inWeek;
    tag.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    tag.style.top = all.style.top = top;
    view.querySelectorAll('.cw-now').forEach((l) => { l.style.top = top; });
    view.querySelectorAll('.cw-hours > span').forEach((sp, h) => { sp.classList.toggle('near', !!inWeek && Math.abs(h * 60 - (n.getHours() * 60 + n.getMinutes())) < 18); });
  }
  setInterval(() => { if (open && !view.hidden) placeNow(); }, 30000);
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
  const shiftWeek = (n) => { cursor.setDate(cursor.getDate() + 7 * n); render(n); };

  view.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-cal]')?.dataset.cal;
    if (a === 'prev') { shiftWeek(-1); return; }
    if (a === 'next') { shiftWeek(1); return; }
    if (a === 'today') { const was = +cursor; cursor = mondayOf(new Date()); render(Math.sign(+cursor - was)); const n = new Date(); scroller.scrollTo({ top: Math.max(0, n.getHours() - 2) * WEEK_HOUR, behavior: 'smooth' }); return; }
    if (a === 'new') { edit(null, todayIso()); return; }
    const p = ev.target.closest('.cal-pill');
    if (p) { edit(events.find((e) => e.id === p.dataset.id), null, '', '', null, p); return; }
    const day = ev.target.closest('[data-day]');
    if (day) { openDay(day.dataset.day, day); return; }
    const ac = ev.target.closest('.cw-all-cell');
    if (ac) { edit(null, ac.dataset.date); return; }
    // Klick in eine Stunde → Termin um diese Uhrzeit (halbe Stunden)
    const col = ev.target.closest('.cw-col');
    if (col) {
      const y = ev.clientY - col.getBoundingClientRect().top;
      const m = Math.max(0, Math.min(23 * 60, Math.floor(y / (WEEK_HOUR / 2)) * 30));
      const hm = (x) => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
      // Platzhalter-Termin an der Stelle zeigen, an den das Popover andockt (verschwindet mit dem Fenster)
      col.querySelector('.cw-ghost')?.remove();
      const g = document.createElement('div');
      g.className = 'cw-ghost';
      Object.assign(g.style, { top: `${(m / 60) * WEEK_HOUR + 1}px`, height: `${WEEK_HOUR - 3}px` });
      col.append(g);
      edit(null, col.dataset.date, hm(m), hm(Math.min(23 * 60 + 30, m + 60)), null, g);
    }
  });
  // Wischen auf dem iPad: links/rechts = Woche vor/zurück
  let swipe = null;
  scroller.addEventListener('touchstart', (ev) => { const t = ev.touches[0]; swipe = ev.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: Date.now() } : null; }, { passive: true });
  scroller.addEventListener('touchend', (ev) => {
    if (!swipe) return;
    const t = ev.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - swipe.at < 600) shiftWeek(dx < 0 ? 1 : -1);
    swipe = null;
  }, { passive: true });

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
    cursor = mondayOf(d);
    render();
    const done = () => { dv.hidden = true; dvWrap.hidden = true; };
    const cell = view.querySelector(`.cw-day[data-day="${dayDate}"]`);
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
    document.querySelectorAll('.cw-ghost').forEach((g) => g.remove());
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
  // anchor = Termin/Zelle im Wochenraster: das Fenster erscheint wie in der Vorlage als Popover mit Spitze direkt daneben
  function edit(ev, date, time = '', end = '', store = null, anchor = null) {
    close(); // ggf. Tagesliste schließen
    const e = ev ? { ...ev } : { id: '', title: '', description: '', date: date || todayIso(), time, end, color: COLORS[0], icon: 'f-calendar' };
    // Aufbau wie das Aufgaben-Fenster: × oben rechts, Titel + „Beschreibung hinzufügen“, darunter Zeilen (Icon + Wert),
    // die ihren Inhalt in einem Kasten direkt unter sich aufklappen (UIKit.foldRows); unten Löschen + blauer Knopf
    const pill = (k, menu, cls = '') => `<div class="tk-pop" data-k="${k}"><button type="button" class="tk-pill" data-open="${k}"></button><div class="tk-menu ${cls}"><div class="tk-box">${menu}</div></div></div>`;
    emodal.innerHTML = `<form class="tk-form tk-sheet ce-sheet" autocomplete="off">
      <div class="tk-sheet-main">
        <input class="tk-f-title" name="title" value="${esc(e.title)}" placeholder="Titel" maxlength="80" aria-label="Titel" required />
        <textarea class="tk-f-notes" name="description" rows="1" placeholder="Beschreibung hinzufügen" maxlength="400" aria-label="Beschreibung">${esc(e.description)}</textarea>
      </div>
      <div class="tk-sheet-rows">
        ${pill('date', '<div class="tk-cal"></div>', 'date')}
        ${pill('time', `<label class="ce-allday"><span>Ganztägig</span><button type="button" class="ce-switch" data-allday role="switch" aria-label="Ganztägig"><i></i></button></label>
          <div class="ce-wheels"><div><span class="tk-ml">Beginn</span><div data-wheel="time"></div></div><div><span class="tk-ml">Ende</span><div data-wheel="end"></div></div></div>`, 'time')}
        ${pill('color', UIKit.colorRow(e.color, 'data-color'), 'color')}
        ${pill('icon', `<div class="ce-icon-grid">${EV_ICONS.map((id) => `<button type="button" data-icon="${id}" aria-label="Icon">${icon(id)}</button>`).join('')}</div>`, 'icon')}
      </div>
      <div class="tk-sheet-foot"><span class="grow"></span>${ev ? `<button type="button" class="tk-sheet-ib danger" data-act="delete" aria-label="Löschen" title="Löschen">${icon('f-trash')}</button>` : ''}<button type="submit" class="tk-create tk-make">${ev ? 'Speichern' : 'Erstellen'}</button></div>
    </form>`;
    const form = emodal.querySelector('form');
    UIKit.foldRows(form);
    const notes = form.querySelector('.tk-f-notes');
    const grow = UIKit.autoGrow(notes); // wächst beim Schreiben auf mind. 5 Zeilen

    const draw = () => {
      const d = new Date(`${e.date}T12:00:00`);
      const set = (k, ic, text) => { form.querySelector(`[data-open="${k}"]`).innerHTML = `<span class="tk-si">${ic}</span><span class="tk-rv">${text}</span>`; };
      set('date', icon('f-calendar'), `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`);
      set('time', icon('f-clock'), e.time ? `${e.time}${e.end ? ` – ${e.end}` : ''}` : 'Ganztägig');
      set('color', `<i class="ce-dot" style="background:${e.color}"></i>`, 'Farbe');
      set('icon', `<span style="color:${e.color}">${icon(e.icon)}</span>`, 'Icon');
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
    emodal.classList.toggle('anchored', !!anchor);
    if (anchor) {
      const r = anchor.getBoundingClientRect(), fw = Math.min(380, innerWidth - 24), gap = 14;
      const left = r.left - gap - fw >= 8 ? r.left - gap - fw : Math.min(innerWidth - fw - 8, r.right + gap);
      const side = left < r.left ? 'right' : 'left'; // Spitze zeigt zum Termin
      const fh = form.offsetHeight || 260;
      const room = 290; // Platz nach unten, damit Datum/Zeit/Icon aufklappen können, ohne dass das Fenster wandert
      const top = Math.max(12, Math.min(innerHeight - fh - room - 12, r.top + r.height / 2 - 60));
      Object.assign(form.style, { position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${fw}px` });
      form.dataset.arrow = side;
      form.style.setProperty('--ay', `${Math.max(18, Math.min(fh - 18, r.top + r.height / 2 - top))}px`);
    } else { form.removeAttribute('style'); delete form.dataset.arrow; }
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
      cursor = mondayOf(d);
      render();
      const fresh = view.querySelector(`[data-id="${item.id}"]`);
      fresh?.classList.add('fresh');
      if (fresh?.classList.contains('cw-ev')) { const top = parseFloat(fresh.style.top) || 0; if (top < scroller.scrollTop || top > scroller.scrollTop + scroller.clientHeight - 40) scroller.scrollTo({ top: Math.max(0, top - WEEK_HOUR), behavior: 'smooth' }); }
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
    view.hidden = false;
    render();
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
