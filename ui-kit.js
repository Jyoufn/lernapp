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
  /* Farbauswahl (Wunsch 10.11., Menü wie im Nutzer-Bild „Themes“ – aber ohne Regenbogen und ohne Punkte im Feld):
     oben eine ruhige Vorschau der gewählten Farbe (weicher Schein), darunter die Farbkreise (‹ › blättert, mehr Farben),
     unten „Helligkeit“ mit Prozent und Regler – der Regler macht die gewählte Farbe heller/dunkler.
     Überall gleich (Tags, Projekte, Icons, Termine …). Aufrufer brauchen nichts Neues: Farbkreis = Klick auf [attr]=hex,
     Regler loslassen = Klick auf einen versteckten Knopf [attr]=hex. */
  const MORE = ['#e0737a', '#d6bf5e', '#5db8b3', '#8f9bb3', '#c48bd6', '#7fa7e8', '#e09a6b', '#9fc27a'];
  const colorRow = (cur, attr) => {
    const start = cur || COLORS[6];
    const { h, s, v } = hexToHsv(start);
    const all = [...COLORS, ...MORE.filter((c) => !COLORS.includes(c))];
    return `<div class="cp-panel" data-cp-h="${h.toFixed(1)}" data-cp-s="${s.toFixed(3)}" data-cp-v="${v.toFixed(3)}">`
      + `<div class="cp-prev" style="--pc:${start}"></div>`
      + `<div class="cp-row"><button type="button" class="cp-nav" data-cp-nav="-1" aria-label="Zurück">${fi('back', 11)}</button>`
      + `<div class="tk-colors">${all.map((c) => `<button type="button" class="${c === cur ? 'on' : ''}" ${attr}="${c}" style="--c:${c}" aria-label="Farbe"></button>`).join('')}</div>`
      + `<button type="button" class="cp-nav" data-cp-nav="1" aria-label="Weiter">${fi('forward', 11)}</button></div>`
      + `<div class="cp-light"><span>Helligkeit</span><em>${Math.round(v * 100)} %</em></div>`
      + `<div class="cp-slider"><i style="width:${v * 100}%"></i><b style="left:${v * 100}%"></b></div>`
      + `<button type="button" class="cp-commit" hidden ${attr}="" tabindex="-1"></button></div><div class="tk-picker-host"></div>`;
  };
  // Regler (Helligkeit), Blättern und Vorschau – ein Handler für alle Farbauswahlen (nur im Browser; Tests laden ui-kit.js ohne DOM)
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') (() => {
    let drag = null;
    const hexOf = (p) => hsvToHex({ h: +p.dataset.cpH, s: +p.dataset.cpS, v: +p.dataset.cpV });
    const paint = (p) => {
      const hex = hexOf(p), v = +p.dataset.cpV;
      p.querySelector('.cp-prev').style.setProperty('--pc', hex);
      p.querySelector('.cp-slider i').style.width = `${v * 100}%`; p.querySelector('.cp-slider b').style.left = `${v * 100}%`;
      p.querySelector('.cp-light em').textContent = `${Math.round(v * 100)} %`;
    };
    const move = (e) => {
      if (!drag) return;
      const r = drag.area.getBoundingClientRect();
      drag.p.dataset.cpV = Math.max(0.3, Math.min(1, (e.clientX - r.left) / r.width)).toFixed(3);
      drag.p.querySelectorAll('.tk-colors button').forEach((b) => b.classList.remove('on'));
      paint(drag.p);
    };
    document.addEventListener('pointerdown', (e) => {
      const area = e.target.closest?.('.cp-slider'); if (!area) return;
      e.preventDefault(); e.stopPropagation();
      drag = { area, p: area.closest('.cp-panel') };
      move(e);
    }, true);
    document.addEventListener('pointermove', move, true);
    const up = () => {
      if (!drag) return;
      const p = drag.p; drag = null;
      const btn = p.querySelector('.cp-commit'), attr = [...btn.attributes].find((a) => a.name.startsWith('data-'))?.name;
      if (attr) { btn.setAttribute(attr, hexOf(p)); btn.click(); }
    };
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    // Farbkreis angetippt → Vorschau und Regler zeigen diese Farbe (die Aufrufer übernehmen sie selbst)
    document.addEventListener('click', (e) => {
      const nav = e.target.closest?.('.cp-nav');
      if (nav) { e.stopPropagation(); const row = nav.parentElement.querySelector('.tk-colors'); row.scrollBy({ left: +nav.dataset.cpNav * (row.clientWidth - 30), behavior: 'smooth' }); return; }
      const dot = e.target.closest?.('.cp-panel .tk-colors button'); if (!dot) return;
      const p = dot.closest('.cp-panel'), attr = [...dot.attributes].find((a) => a.name.startsWith('data-'))?.name; const hex = attr && dot.getAttribute(attr);
      if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return;
      const hsv = hexToHsv(hex); p.dataset.cpH = hsv.h.toFixed(1); p.dataset.cpS = hsv.s.toFixed(3); p.dataset.cpV = hsv.v.toFixed(3);
      p.querySelectorAll('.tk-colors button').forEach((b) => b.classList.toggle('on', b === dot));
      paint(p);
    }, true);
  })();

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

  return { pad2, isoOf, COLORS, timeGroups, colorPicker, colorRow, miniCalendar, timeWheel, hsvToHex, hexToHsv, MONTHS_LONG, foldRows, autoGrow };
})();
window.UIKit = UIKit;
