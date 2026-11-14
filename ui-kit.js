/* ===================================================================
   Gemeinsame Bausteine für Aufgaben und Kalender
   - colorPicker: Farbe zum Ziehen (Fläche + Farbton-Leiste), ohne Hexcode
   - miniCalendar: kleiner Monatskalender zum Anklicken
   - timeWheel: Uhrzeit-Rad wie bei Apple (Stunden/Minuten scrollen und einrasten)
   =================================================================== */
const UIKit = (() => {
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fi = (n, s = 13) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  // Farbpunkte wie im Nutzer-Bild „Appearance“ (09.11.): ruhige Pastelltöne; alte Farben bleiben gültig (gelten dann als eigene Farbe)
  const COLORS = ['#d1d1d1', '#cb88ab', '#d38b7d', '#ce965b', '#a1af60', '#7db993', '#6bb0d7', '#9799ec'];

  /* ---------- Farbe ---------- */
  const hexToHsv = (hex) => {
    const n = parseInt(String(hex).slice(1), 16) || 0, r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
  };
  const hsvToHex = ({ h, s, v }) => {
    const f = (k) => { const x = (k + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(x, 4 - x, 1)))); };
    return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  };
  // onPick(hex, fertig) – live beim Ziehen, „fertig“ beim Knopf unten
  function colorPicker(start, onPick, label = 'Übernehmen') {
    const hsv = hexToHsv(start);
    const el = document.createElement('div');
    el.className = 'tk-picker';
    el.innerHTML = `<div class="tk-sv"><b></b></div><div class="tk-hue"><b></b></div><div class="tk-picker-foot"><i class="tk-swatch"></i><span class="grow"></span><button type="button" class="tk-mini primary" data-picked>${label}</button></div>`;
    const sv = el.querySelector('.tk-sv'), hue = el.querySelector('.tk-hue'), sw = el.querySelector('.tk-swatch');
    const paint = (live = true) => {
      const hex = hsvToHex(hsv);
      sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`;
      sv.querySelector('b').style.cssText = `left:${hsv.s * 100}%;top:${(1 - hsv.v) * 100}%;background:${hex}`;
      hue.querySelector('b').style.left = `${(hsv.h / 360) * 100}%`;
      sw.style.background = hex;
      if (live) onPick(hex, false);
    };
    const drag = (area, fn) => {
      const move = (e) => { const r = area.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))); paint(); };
      area.addEventListener('pointerdown', (e) => { area.setPointerCapture(e.pointerId); move(e); });
      area.addEventListener('pointermove', (e) => { if (area.hasPointerCapture(e.pointerId)) move(e); });
    };
    drag(sv, (x, y) => { hsv.s = x; hsv.v = 1 - y; });
    drag(hue, (x) => { hsv.h = x * 359.9; });
    el.querySelector('[data-picked]').addEventListener('click', (e) => { e.stopPropagation(); onPick(hsvToHex(hsv), true); });
    paint(false);
    return el;
  }
  // Farbreihe: feste Farben + ganz rechts eigene Farbe (eigene Farbe → Feld zum Ziehen + Farbton-Regler, colorPicker). Wunsch 10.11.: wieder wie vorher
  const colorRow = (cur, attr) => {
    const custom = cur && !COLORS.includes(cur);
    return `<div class="tk-colors">${COLORS.map((c) => `<button type="button" class="${c === cur ? 'on' : ''}" ${attr}="${c}" style="--c:${c}" aria-label="Farbe"></button>`).join('')}`
      + `<button type="button" class="tk-custom${custom ? ' on' : ''}" data-custom="${attr}" ${custom ? `style="--c:${cur}"` : ''} aria-label="Eigene Farbe" title="Eigene Farbe"></button></div><div class="tk-picker-host"></div>`;
  };

  /* ---------- Kalender zum Anklicken ---------- */
  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  // box: Element, get(): aktuelles ISO-Datum, pick(iso): Klick auf einen Tag
  function miniCalendar(box, get, pick) {
    let month = null;
    const draw = () => {
      const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
      const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
      const today = isoOf(new Date()), cur = get();
      let cells = '';
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        if (i === 35 && d.getMonth() !== month.getMonth()) break; // nur so viele Wochen wie nötig
        const k = isoOf(d);
        cells += `<button type="button" class="${d.getMonth() !== month.getMonth() ? 'other' : ''}${k === today ? ' today' : ''}${k === cur ? ' on' : ''}" data-day="${k}">${d.getDate()}</button>`;
      }
      box.innerHTML = `<div class="tk-cal-head"><span>${MONTHS_LONG[month.getMonth()]} ${month.getFullYear()}</span>
          <button type="button" data-calnav="-1" aria-label="Vorheriger Monat">${fi('back', 12)}</button><button type="button" data-calnav="1" aria-label="Nächster Monat">${fi('forward', 12)}</button></div>
        <div class="tk-cal-grid">${WD.map((w) => `<span>${w}</span>`).join('')}${cells}</div>`;
    };
    box.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-calnav]');
      if (nav) { e.stopPropagation(); month.setMonth(month.getMonth() + +nav.dataset.calnav); draw(); return; }
      const day = e.target.closest('[data-day]');
      if (day) { e.stopPropagation(); pick(day.dataset.day); draw(); }
    });
    return {
      open() { const v = get(); const d = v ? new Date(`${v}T12:00:00`) : new Date(); month = new Date(d.getFullYear(), d.getMonth(), 1, 12); draw(); },
      draw,
    };
  }

  /* ---------- Uhrzeit-Rad (Stunden 0–23, Minuten einzeln oder in Schritten) ---------- */
  const ROW = 28;
  function timeWheel(value, onChange, step = 1) {
    const el = document.createElement('div');
    el.className = 'tk-wheel';
    const col = (n, step) => `<div class="tk-wh-col" tabindex="0">${Array.from({ length: n / step }, (_, i) => `<div class="tk-wh-item" data-v="${i * step}">${pad2(i * step)}</div>`).join('')}</div>`;
    el.innerHTML = `<i class="tk-wh-band"></i>${col(24, 1)}<span class="tk-wh-sep">:</span>${col(60, step)}`;
    const [hc, mc] = el.querySelectorAll('.tk-wh-col');
    const read = () => {
      const h = Math.max(0, Math.min(23, Math.round(hc.scrollTop / ROW)));
      const m = Math.max(0, Math.min(60 / step - 1, Math.round(mc.scrollTop / ROW))) * step;
      [hc, mc].forEach((c) => { const i = Math.round(c.scrollTop / ROW); c.querySelectorAll('.tk-wh-item').forEach((x, k) => x.classList.toggle('on', k === i)); });
      return `${pad2(h)}:${pad2(m)}`;
    };
    let t = 0, last = value;
    const onScroll = () => { read(); clearTimeout(t); t = setTimeout(() => { const v = read(); if (v !== last) { last = v; onChange(v); } }, 90); };
    [hc, mc].forEach((c) => {
      c.addEventListener('scroll', onScroll, { passive: true });
      c.addEventListener('click', (e) => { const it = e.target.closest('.tk-wh-item'); if (it) c.scrollTo({ top: [...c.children].indexOf(it) * ROW, behavior: 'smooth' }); });
      c.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault(); e.stopPropagation();
        c.scrollTo({ top: c.scrollTop + (e.key === 'ArrowDown' ? ROW : -ROW), behavior: 'smooth' });
      });
    });
    const set = (v) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(v || '') || [0, 9, 0];
      hc.scrollTop = +m[1] * ROW;
      mc.scrollTop = Math.round(+m[2] / step) * ROW;
      last = read();
    };
    // erst nach dem Einfügen messbar → im nächsten Frame setzen
    requestAnimationFrame(() => set(value));
    el.setValue = set;
    return el;
  }

  /* ---------- Aufklapp-Zeilen (Aufgaben- und Termin-Fenster): Inhalt wächst weich im Kasten unter seiner Zeile auf ----------
     Beobachtet die Klasse „open“ an jeder .tk-pop im Fenster – egal, wer sie setzt oder entfernt (Klick, Auswahl, Esc) –
     und lässt die Höhe von .tk-menu weich auf- bzw. zulaufen. Beim Zuklappen hält „folding“ den Inhalt sichtbar, bis er zu ist. */
  function foldRows(root) {
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isOpen = (cls) => /(^|\s)open(\s|$)/.test(cls || '');
    // eigene Änderungen an „folding“ lösen den Beobachter auch aus – sie ändern „open“ nicht und fallen unten heraus
    const mo = new MutationObserver((list) => list.forEach((m) => {
      const pop = m.target;
      if (!pop.classList || !pop.classList.contains('tk-pop')) return;
      const was = isOpen(m.oldValue), is = pop.classList.contains('open');
      if (was === is) return;
      const menu = pop.querySelector(':scope > .tk-menu'), box = menu && menu.firstElementChild;
      if (!menu) return;
      const wasFolding = pop.classList.contains('folding');
      pop.classList.add('folding'); // sichtbar halten, damit die aktuelle Höhe messbar ist
      const from = menu.offsetHeight; // läuft noch eine Animation: dort weitermachen, wo sie gerade ist
      menu.getAnimations().forEach((a) => a.cancel());
      box?.getAnimations().forEach((a) => a.cancel());
      pop.classList.remove('folding');
      if (reduced()) return;
      if (is) {
        const h = menu.offsetHeight;
        // nur die Höhe läuft auf – der Inhalt steht still (kein Hineingleiten, kein Wachsen)
        menu.animate([{ height: `${wasFolding ? from : 0}px` }, { height: `${h}px` }], { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
      } else {
        pop.classList.add('folding');
        // gleiche Kurve und Dauer wie beim Aufklappen → beim Wechsel zwischen zwei Zeilen bleibt die Fensterhöhe ruhig
        const a = menu.animate([{ height: `${from}px` }, { height: '0px' }], { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' });
        a.onfinish = () => { if (!pop.classList.contains('open')) { pop.classList.remove('folding'); menu.getAnimations().forEach((x) => x.cancel()); box?.getAnimations().forEach((x) => x.cancel()); } };
      }
    }));
    mo.observe(root, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    return mo;
  }

  /* ---------- Beschreibung, die beim Schreiben mitwächst ----------
     Leer und ohne Fokus eine Zeile; beim Schreiben (Fokus oder Text da) mindestens `focusLines` Zeilen, darüber mit dem Text bis `maxLines`,
     danach scrollen. Gemessen wird an einer unsichtbaren Kopie – so läuft die Höhe weich (CSS-Übergang), ohne erst auf 0 zu springen. */
  // Beschreibung: wächst NUR mit dem Text (kein Aufklappen beim Antippen), höchstens 4 Zeilen, danach scrollt sie (Wunsch 04.11.)
  function autoGrow(ta, { line = 20, minLines = 1, maxLines = 4 } = {}) {
    const meas = ta.cloneNode(false);
    meas.removeAttribute('name'); meas.removeAttribute('id'); meas.tabIndex = -1; meas.setAttribute('aria-hidden', 'true');
    Object.assign(meas.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', height: '0px', minHeight: '0', left: '0', top: '0', overflow: 'hidden', transition: 'none' });
    const fit = () => {
      if (!meas.isConnected) ta.parentNode?.append(meas);
      meas.style.width = `${ta.clientWidth}px`; meas.value = ta.value;
      const h = Math.max(minLines * line, Math.min(meas.scrollHeight, maxLines * line));
      ta.style.height = `${h}px`;
      ta.style.overflowY = meas.scrollHeight > maxLines * line ? 'auto' : 'hidden';
    };
    ta.addEventListener('input', fit);
    requestAnimationFrame(fit);
    return fit;
  }

  /* Zeit-Gruppen für Listen (Chats, Bibliothek): Zuletzt (heute) · Gestern · Letzte Woche · Letzter Monat · Letztes Jahr · Älter */
  function timeGroups(items, timeOf, now = new Date()) {
    const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), D = 86400000;
    const G = [['Zuletzt', day0], ['Gestern', day0 - D], ['Letzte Woche', day0 - 7 * D], ['Letzter Monat', day0 - 30 * D], ['Letztes Jahr', day0 - 365 * D], ['Älter', -Infinity]];
    const out = G.map(([label]) => [label, []]);
    items.forEach((x) => { const t = timeOf(x) || 0; out[G.findIndex(([, from]) => t >= from)][1].push(x); });
    return out.filter(([, list]) => list.length);
  }

  /* Umschalter (.cs-pill, z. B. „Agenten | Dokumente“): der helle Teil gleitet weich zum gewählten Knopf (Wunsch 09.11.; setzt sich selbst, wo immer ein .cs-pill steht) */
  function placeThumb(pill) {
    if (!pill.isConnected) return;
    const on = pill.querySelector(':scope > button.on');
    let t = pill.querySelector(':scope > .cs-thumb');
    if (!on || !on.offsetWidth) { if (t) t.style.opacity = '0'; return; }
    if (!t) { t = document.createElement('i'); t.className = 'cs-thumb'; t.style.transition = 'none'; pill.prepend(t); requestAnimationFrame(() => requestAnimationFrame(() => { t.style.transition = ''; })); }
    t.style.opacity = '1'; t.style.width = `${on.offsetWidth}px`; t.style.transform = `translateX(${on.offsetLeft}px)`;
  }
  // nur im Browser (Tests laden ui-kit.js ohne DOM)
  if (typeof document !== 'undefined' && document.body && typeof MutationObserver === 'function' && typeof window !== 'undefined' && window.addEventListener) {
    // sichtbar werden (z. B. „Erstellen“ geöffnet) ändert die Größe → neu setzen
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => es.forEach((e) => placeThumb(e.target))) : null;
    const watch = (pill) => { if (ro && !pill._csWatch) { pill._csWatch = true; ro.observe(pill); } };
    const placeAll = () => document.querySelectorAll('.cs-pill').forEach((p) => { watch(p); placeThumb(p); });
    window.addEventListener('chat-tab-switched', () => requestAnimationFrame(placeAll));
    new MutationObserver((ms) => {
      const pills = new Set(ms.map((m) => m.target.closest?.('.cs-pill')).filter(Boolean));
      pills.forEach((p) => { watch(p); placeThumb(p); });
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', placeAll);
    requestAnimationFrame(placeAll);
  }

  /* ---------- Tableiste (.ui-tabs, 14.11.): Leiste mit gleitender Fläche unter dem gewählten Tab ----------
     tabBar({ items: [{ id, label }], value, onChange(id), label }) → Element mit .value und .select(id).
     Antippen oder Pfeiltasten wählen; die Fläche gleitet per transform/width an ihren Platz. */
  function tabBar({ items = [], value, onChange, label = 'Ansicht' } = {}) {
    const el = document.createElement('div');
    el.className = 'ui-tabs';
    el.setAttribute('role', 'tablist');
    el.setAttribute('aria-label', label);
    const thumb = document.createElement('i');
    thumb.className = 'ui-tabs-thumb';
    el.append(thumb);
    let cur = items.some((x) => x.id === value) ? value : items[0]?.id;
    const btns = items.map((it) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ui-tab'; b.dataset.tab = it.id; b.dataset.label = it.label;
      b.setAttribute('role', 'tab');
      const s = document.createElement('span'); s.textContent = it.label; b.append(s);
      el.append(b);
      return b;
    });
    const place = (animate = true) => {
      const on = btns.find((b) => b.dataset.tab === cur);
      btns.forEach((b) => { const sel = b === on; b.classList.toggle('on', sel); b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1; });
      if (!on || !on.offsetWidth) { thumb.style.opacity = '0'; return; }
      const first = thumb.style.opacity !== '1';
      if (!animate || first) thumb.style.transition = 'none';
      thumb.style.width = `${on.offsetWidth}px`;
      thumb.style.transform = `translateX(${on.offsetLeft}px)`;
      thumb.style.opacity = '1';
      if (!animate || first) { void thumb.offsetWidth; thumb.style.transition = ''; }
    };
    const select = (id, silent) => {
      if (id === cur || !items.some((x) => x.id === id)) return;
      cur = id; place(); if (!silent) onChange?.(id);
    };
    el.addEventListener('click', (e) => { const b = e.target.closest('.ui-tab'); if (b) select(b.dataset.tab); });
    el.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!step) return;
      e.preventDefault();
      const i = btns.findIndex((b) => b.dataset.tab === cur), n = btns[(i + step + btns.length) % btns.length];
      select(n.dataset.tab); n.focus();
    });
    // sichtbar werden / Größe ändert sich (Schrift geladen, Fenster) → Fläche ohne Gleiten neu setzen
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => place(false)).observe(el);
    place(false);
    Object.defineProperty(el, 'value', { get: () => cur });
    el.select = select;
    return el;
  }

  /* ---------- Icon-Liste (14.11.): neue Linien-Icons im Stil des Vorbilds ----------
     Regeln (am Vorbild ausgemessen): Raster 20 × 20, Strich 1,65 (gleich dick wie die bisherigen Icons „Anheften“/„Duplizieren“: 2 im 24er-Raster), runde Enden und Ecken, keine Füllungen.
     Die Form füllt das Raster fast ganz (Rand 2,5–2,75) und ist breit und weich: Ecken als „Squircle“ (Helfer sq, Ecke 5 lang, läuft weich in die Gerade aus), kein Kreisbogen.
     Details innen sind kurze offene Striche. Farbe = currentColor. Nutzung: UIKit.icon('pencil', 16).
     Wird Stück für Stück ergänzt (Bereich „UI“ → Icons zeigt die Liste). */
  // Weiche Ecke wie im Vorbild („Squircle“): die Kurve läuft länger in die Gerade aus als ein Kreisbogen. r = Länge der Ecke je Seite.
  const sq = (x, y, w, h, r = 5) => {
    const k = +(r * 0.76).toFixed(2), m = +(r - k).toFixed(2);
    return `<path d="M${x + r} ${y}h${w - 2 * r}c${k} 0 ${r} ${m} ${r} ${r}v${h - 2 * r}c0 ${k}-${m} ${r}-${r} ${r}h-${w - 2 * r}c-${k} 0-${r}-${m}-${r}-${r}v-${h - 2 * r}c0-${k} ${m}-${r} ${r}-${r}z"/>`;
  };
  const ICONS = {
    pencil: { label: 'Umbenennen', d: '<path d="M12.9 3.6a1.9 1.9 0 0 1 2.7 0l.8.8a1.9 1.9 0 0 1 0 2.7l-8.6 8.6c-.24.24-.54.41-.87.5l-2.85.75a.75.75 0 0 1-1.03-1.03l.75-2.85c.09-.33.26-.63.5-.87z"/><path d="m11.4 5.1 3.5 3.5"/>' },
    link: { label: 'Link', d: '<path d="M8.6 11.4a3.4 3.4 0 0 0 4.8 0L15.8 9A3.4 3.4 0 0 0 11 4.2l-.9.9"/><path d="M11.4 8.6a3.4 3.4 0 0 0-4.8 0L4.2 11A3.4 3.4 0 0 0 9 15.8l.9-.9"/>' },
    plus: { label: 'Erstellen', d: '<path d="M10 3.75v12.5M3.75 10h12.5"/>' },
    // Home = „Bibliothek“ aus dem Vorbild: weicher Kasten, unten offen, dort hängt ein Lesezeichen; innen zwei kurze Zeilen
    home: { label: 'Home', d: '<path d="M5.4 16.3c-1.8-.7-2.65-1.9-2.65-4.1V7.35c0-3.5 1.1-4.6 4.6-4.6h5.3c3.5 0 4.6 1.1 4.6 4.6v4.85c0 2.2-.85 3.4-2.65 4.1"/><path d="M7.6 18.2v-5a1.2 1.2 0 0 1 1.2-1.2h2.4a1.2 1.2 0 0 1 1.2 1.2v5L10 16.6z"/><path d="M6.8 5.95h3.4M6.8 9H13"/>' },
    // Bereiche = „Spaces“ aus dem Vorbild: Korb mit zwei gestapelten Bögen darüber
    spaces: { label: 'Bereiche', d: '<path d="M6.2 4.1c0-1 .7-1.7 1.7-1.7h4.2c1 0 1.7.7 1.7 1.7"/><path d="M4.7 7.2c0-.9.6-1.5 1.5-1.5h7.6c.9 0 1.5.6 1.5 1.5"/><path d="M4.6 8.9h10.8c1.1 0 1.9 1 1.6 2.1l-1.3 4.9c-.25.9-1 1.5-1.95 1.5H6.25c-.95 0-1.7-.6-1.95-1.5L3 11c-.3-1.1.5-2.1 1.6-2.1z"/>' },
    // Chat wie im zweiten Vorbild: große runde Sprechblase (Zipfel unten links), davor eine kleine (Zipfel unten rechts)
    chat: { label: 'Chat', d: '<path d="M15.57 8.41A6.5 6.5 0 1 0 4.12 13.18L3.5 15.8l2.55-1.06a6.5 6.5 0 0 0 2.46.73"/><path d="M17.16 14.73a3.9 3.9 0 1 0-2.33 2.33l2.67.34z"/>' },
    // Dokument wie im zweiten Vorbild: Blatt mit weichen Ecken, die Ecke oben rechts ist als eigenes Stück abgesetzt (dort gefüllt, hier als Linie)
    doc: { label: 'Dokument', d: '<path d="M9.1 2.5H8c-3.1 0-4.1 1-4.1 4.1v6.8c0 3.1 1 4.1 4.1 4.1h4c3.1 0 4.1-1 4.1-4.1v-3"/><path d="M11.7 2.8v2.5c0 1.3 1 2.3 2.3 2.3h2.4z"/>' },
    // Aufgaben wie bisher in der Sidebar (kleines Board: drei Spalten unterschiedlich voll)
    tasks: { label: 'Aufgaben', d: `${sq(2.75, 2.75, 14.5, 14.5)}<path d="M6.6 6.5v7M10 6.5v3.5M13.4 6.5v5.2"/>` },
    // Kalender wie bisher in der Sidebar (Kasten, Kopflinie, fünf Punkte) – nur dünn
    calendar: { label: 'Kalender', d: `${sq(2.75, 2.75, 14.5, 14.5)}<path d="M2.75 7.4h14.5"/><path stroke-width="2" d="M6.6 10.9h.01M10 10.9h.01M13.4 10.9h.01M6.6 14h.01M10 14h.01"/>` },
    search: { label: 'Suche', d: '<circle cx="9" cy="9" r="5.75"/><path d="m13.2 13.2 3.6 3.6"/>' },
    folder: { label: 'Ordner', d: '<path d="M2.5 6.6c0-2.2.9-3.1 3.1-3.1h1.9c.75 0 1.45.3 1.97.83l.7.72c.34.35.8.55 1.3.55h2.93c2.2 0 3.1.9 3.1 3.1v4.7c0 2.2-.9 3.1-3.1 3.1H5.6c-2.2 0-3.1-.9-3.1-3.1z"/>' },
  };
  const uiIcon = (name, size = 16) => (ICONS[name] ? `<svg class="ui-ic" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name].d}</svg>` : fi(name, size));

  /* Neue Icons in der ganzen App (14.11.): die Formen aus ICONS ersetzen den Inhalt der vorhandenen Symbole
     (#o-… Sidebar, #f-…/#i-… überall sonst) – jede Stelle mit <use href="#…"> zieht mit. Läuft nach line-icons.js.
     Gefüllte Varianten (#df-…) und Dokument-Icons (#d-…) bleiben, wie sie sind. */
  const ICON_USE = {
    plus: ['o-plus', 'f-plus', 'i-plus'], search: ['o-search', 'f-search', 'i-search'], home: ['o-home', 'f-home'],
    tasks: ['o-tasks', 'f-tasks', 'i-tasks'], calendar: ['o-calendar', 'f-calendar', 'i-calendar'], chat: ['o-chat', 'f-chat'],
    doc: ['o-doc', 'f-file', 'i-file'], folder: ['f-folder'], pencil: ['f-pencil', 'i-pencil'], link: ['f-link'],
  };
  if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    for (const [name, ids] of Object.entries(ICON_USE)) {
      for (const id of ids) {
        const sym = document.getElementById(id); if (!sym) continue;
        sym.setAttribute('viewBox', '0 0 20 20');
        sym.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${ICONS[name].d}</g>`;
      }
    }
  }

  /* ---------- Knopf (.ui-btn, 14.11.): gleiche Sprache wie die Tableiste ----------
     button({ label, icon, kind, size, disabled, onClick }) → <button>
     kind: 'soft' (Standard, leicht getönt) · 'light' (hell gefüllt, wichtigste Aktion) · 'line' (nur Rand) · 'ghost' (ohne Fläche) · 'danger'
     size: 's' 24 px · 'm' 28 px (Standard) · 'l' 34 px; ohne label = quadratischer Icon-Knopf (dann label als aria über „aria“) */
  function button({ label = '', icon = '', kind = 'soft', size = 'm', disabled = false, aria = '', onClick } = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ui-btn ui-btn-${kind}${size !== 'm' ? ` ui-btn-${size}` : ''}${label ? '' : ' ui-btn-icon'}`;
    if (icon) b.innerHTML = fi(icon, size === 'l' ? 15 : size === 's' ? 12 : 14);
    if (label) { const s = document.createElement('span'); s.textContent = label; b.append(s); } else if (aria) b.setAttribute('aria-label', aria);
    b.disabled = !!disabled;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  /* ---------- Dropdown-Menü (.ui-dd / .ui-menu, 14.11.) ----------
     dropdown({ label, icon, kind, size, items, value, select, align, onPick(id) }) → Element (Knopf + Menü darunter)
     items: { id, label, icon?, hint?, danger? } · { sep: true } (Trennlinie) · { title: 'Abschnitt' }
     select: true → Auswahl-Menü: der Knopf zeigt den gewählten Eintrag, im Menü steht dort ein Haken.
     Öffnet weich aus der Ecke des Knopfs (nur transform/opacity); schließt bei Klick daneben, Escape, Auswahl. Pfeiltasten wandern. */
  let openDd = null;
  function dropdown({ label = '', icon = '', kind = 'soft', size = 'm', items = [], value, select = false, align = 'left', aria = '', onPick } = {}) {
    const el = document.createElement('div');
    el.className = `ui-dd${align === 'right' ? ' ui-dd-right' : ''}`;
    let cur = value;
    const curLabel = () => (select ? items.find((x) => x.id === cur)?.label || label : label);
    const btn = button({ label: curLabel(), icon, kind, size, aria });
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
    if (label || select) btn.insertAdjacentHTML('beforeend', `<svg class="ui-dd-chev" width="12" height="12" aria-hidden="true"><use href="#f-chevron-down"/></svg>`);
    const menu = document.createElement('div');
    menu.className = 'ui-menu'; menu.setAttribute('role', 'menu');
    const draw = () => {
      menu.replaceChildren(...items.map((it) => {
        if (it.sep) { const x = document.createElement('i'); x.className = 'ui-menu-sep'; return x; }
        if (it.title) { const x = document.createElement('div'); x.className = 'ui-menu-title'; x.textContent = it.title; return x; }
        const b = document.createElement('button');
        b.type = 'button'; b.className = `ui-menu-item${it.danger ? ' danger' : ''}`; b.dataset.id = it.id; b.tabIndex = -1;
        b.setAttribute('role', select ? 'menuitemradio' : 'menuitem');
        if (it.icon) b.innerHTML = uiIcon(it.icon, 16); // neue Icons aus ICONS, sonst das bisherige #f-…
        const t = document.createElement('span'); t.className = 'ui-menu-label'; t.textContent = it.label; b.append(t);
        if (it.hint) { const h = document.createElement('span'); h.className = 'ui-menu-hint'; h.textContent = it.hint; b.append(h); }
        if (select) { b.setAttribute('aria-checked', String(it.id === cur)); b.insertAdjacentHTML('beforeend', `<svg class="ui-menu-tick" width="13" height="13" aria-hidden="true"><use href="#f-check"/></svg>`); if (it.id === cur) b.classList.add('on'); }
        return b;
      }));
    };
    const close = (focus) => {
      if (!el.classList.contains('open')) return;
      el.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
      if (openDd === el) openDd = null;
      if (focus) btn.focus();
    };
    const open = () => {
      openDd?._close();
      draw();
      // nach oben öffnen, wenn unten kein Platz ist
      el.classList.remove('ui-dd-up');
      el.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      const r = menu.getBoundingClientRect();
      if (r.bottom > innerHeight - 8 && btn.getBoundingClientRect().top > r.height + 16) el.classList.add('ui-dd-up');
      openDd = el;
    };
    el._close = close;
    btn.addEventListener('click', () => (el.classList.contains('open') ? close() : open()));
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('.ui-menu-item'); if (!b) return;
      if (select) { cur = b.dataset.id; btn.querySelector('span').textContent = curLabel(); }
      close(true); onPick?.(b.dataset.id);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && el.classList.contains('open')) { e.stopPropagation(); close(true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (!el.classList.contains('open')) open();
      const list = [...menu.querySelectorAll('.ui-menu-item')], i = list.indexOf(document.activeElement);
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    });
    el.append(btn, menu);
    Object.defineProperty(el, 'value', { get: () => cur });
    return el;
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerdown', (e) => { if (openDd && !openDd.contains(e.target)) openDd._close(); });
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('chat-tab-switched', () => openDd?._close());
  }

  // „Eigene Farbe“ (Knopf rechts in der Farbreihe): Feld + Regler darunter auf-/zuklappen; onDone(hex) beim Knopf „Übernehmen“
  const customPick = (btn, start, onDone, onLive) => {
    const host = btn.closest('.tk-colors')?.nextElementSibling; if (!host) return;
    if (host.firstChild) { host.replaceChildren(); return; }
    host.append(colorPicker(start || '#6bb0d7', (hex, done) => { btn.style.setProperty('--c', hex); btn.classList.add('on'); onLive?.(hex); if (done) { host.replaceChildren(); onDone(hex); } }));
  };
  return { tabBar, button, dropdown, ICONS, icon: uiIcon, customPick, pad2, isoOf, COLORS, timeGroups, colorPicker, colorRow, miniCalendar, timeWheel, hsvToHex, hexToHsv, MONTHS_LONG, foldRows, autoGrow };
})();
window.UIKit = UIKit;
