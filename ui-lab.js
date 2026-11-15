/* ===================================================================
   Bereich „UI“ (Sidebar): Werkstatt für den NEUEN STIL (15.11.) – nach dem Vorbild des Nutzers (zwei Bilder: Aufgabenliste + Fenster „Neue Aufgabe“).
   Die früheren Abschnitte wurden entfernt und im neuen Stil neu aufgebaut. Der neue Stil gilt vorerst NUR hier (Wunsch 15.11.): der Rest der App
   bleibt wie er ist, Aufbau und Icons bleiben. Hell/dunkel folgt dem Modus der App. Keine Leiste im Kopf.
   Aussehen: style.css → Block „NEUER STIL“ (alles unter .uiv-view.nx). Einstellungen → Aussehen → Stil „Neu“ stellt zusätzlich die Schrift um.
   Neu nur hier (Klassen .nx-…): Fenster, Aufgabenfelder, Hinweis, Seitenleiste, Frage-Feld, Schrift. Der Rest sind die Bausteine aus
   ui-kit.js (Knöpfe, Eingabefeld, Tableiste, Dropdown-Menü, Regler) und der App (Umschalter, Schalter, Farben, Tags, Karte, Kalender, Uhrzeit).
   Öffnet als eigener Tab (app.js → VIEW_TABS.ui).
   =================================================================== */
const UILab = (() => {
  let view = null, open = false;
  const html = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
  const fi = (n, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const TICK = '<svg class="nx-tick" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 6.4 5 8.7l4.4-5.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const sw = (on) => { const e = html(`<button type="button" class="ce-switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="umschalten"><i></i></button>`); e.addEventListener('click', () => { const v = !e.classList.contains('on'); e.classList.toggle('on', v); e.setAttribute('aria-checked', String(v)); }); return e; };
  const seg = (items, on) => { const e = html(`<span class="st-seg" role="radiogroup">${items.map((l, i) => `<button type="button" role="radio" aria-checked="${i === on}" class="${i === on ? 'on' : ''}">${l}</button>`).join('')}</span>`);
    e.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; e.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); }); }); return e; };
  // Kästchen der Aufgabenfelder: antippen hakt ab (Zeile wird leise)
  const checkable = (root) => root.addEventListener('click', (ev) => { const c = ev.target.closest('.nx-check'); if (!c) return; const v = c.getAttribute('aria-checked') !== 'true'; c.setAttribute('aria-checked', String(v)); c.closest('.nx-task')?.classList.toggle('done', v); });

  // Abschnitt: Überschrift + Zeilen (je Zeile ein leiser Name links, rechts die Beispiele)
  function section(title, rows) {
    const sec = document.createElement('section');
    sec.className = 'uiv-sec';
    const h = document.createElement('h3'); h.textContent = title; sec.append(h);
    rows.forEach(([name, items]) => {
      const row = document.createElement('div'); row.className = 'uiv-row';
      const n = document.createElement('span'); n.className = 'uiv-name'; n.textContent = name;
      const box = document.createElement('div'); box.className = 'uiv-items'; box.append(...items);
      row.append(n, box); sec.append(row);
    });
    return sec;
  }
  // Abschnitt mit einem großen Beispiel über die ganze Breite
  const wide = (title, ...els) => { const sec = section(title, []); sec.classList.add('uiv-sec-wide'); sec.append(...els); return sec; };

  /* ---------- Neu: Fenster „Neue Aufgabe“ + Hinweis ---------- */
  function windows() {
    const B = window.UIKit.button;
    const win = html(`<div class="nx-win" role="group" aria-label="Fenster Neue Aufgabe">
        <div class="nx-win-top"><span class="nx-proj">${fi('folder', 14)}<span>Schule</span></span><span class="grow"></span><button type="button" class="nx-round" aria-label="Schließen">${fi('x', 12)}</button></div>
        <div class="nx-win-title nx-task"><button type="button" class="nx-check" role="checkbox" aria-checked="false" aria-label="Erledigt">${TICK}</button><input class="nx-title" type="text" value="Downloads aufräumen" placeholder="Neue Aufgabe" aria-label="Titel" spellcheck="false" autocomplete="off" /></div>
        <div class="nx-win-notes">${fi('file', 15)}<input type="text" placeholder="Notizen" aria-label="Notizen" spellcheck="false" autocomplete="off" /></div>
        <div class="nx-win-chips"></div>
        <div class="nx-win-foot"><span class="nx-slot"></span><span class="nx-foot-label">Weitere erstellen</span><span class="grow"></span></div></div>`);
    win.querySelector('.nx-win-chips').append(B({ label: 'Delegieren', icon: 'sparkle', kind: 'line' }), B({ label: 'Datum', icon: 'calendar', kind: 'line' }), B({ label: 'Dauer', icon: 'clock', kind: 'line' }), B({ label: 'Priorität', icon: 'flag', kind: 'line' }), B({ icon: 'list', kind: 'line', aria: 'Unteraufgaben' }), B({ icon: 'more', kind: 'line', aria: 'Mehr' }));
    win.querySelector('.nx-slot').replaceWith(sw(false));
    win.querySelector('.nx-win-foot').append(B({ label: 'Erstellen', kind: 'light', size: 'l' }));
    win.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    checkable(win);
    const toast = html(`<div class="nx-toast" role="status"><i>${fi('sparkle', 16)}</i><span class="nx-toast-t"><b>Der Agent ist dran</b><span>Arbeitet an „Downloads aufräumen“</span></span></div>`);
    const sec = wide('Fenster', win);
    sec.append(section('', [['Hinweis', [toast]]]).lastChild);
    return sec;
  }

  /* ---------- Neu: Aufgabenfelder (Karte mit Zeilen, Kästchen, Angaben rechts) ---------- */
  function tasks() {
    const rows = [
      ['Downloads aufräumen', '', false],
      ['Bio-Klausur vorbereiten', `<span class="nx-badge">${fi('timer', 12)}12 Tage</span><span class="nx-badge">0/5</span>`, false, true],
      ['Vokabeln wiederholen', `<span class="nx-badge nx-badge-ic" aria-label="Wiederholt sich">${fi('refresh', 12)}</span>`, false],
      ['Referat Geschichte', '<span class="nx-badge">0/3</span>', false],
      ['Mathe-Hausaufgaben abgeben', `<span class="nx-badge">${fi('calendar', 12)}Mo., 23. Nov.</span>`, false],
      ['Lernplan schreiben', '', true],
    ];
    const list = html(`<div class="nx-list" role="list">${rows.map(([t, right, done, due]) => `<div class="nx-task${done ? ' done' : ''}${due ? ' due' : ''}" role="listitem"><button type="button" class="nx-check" role="checkbox" aria-checked="${done}" aria-label="Erledigt">${TICK}</button><span class="nx-task-t">${t}</span><span class="grow"></span>${right}</div>`).join('')}</div>`);
    checkable(list);
    const ask = html(`<label class="nx-ask">${fi('sparkle', 16)}<input type="text" placeholder="Frag irgendwas" aria-label="Frag irgendwas" spellcheck="false" autocomplete="off" /><button type="button" class="nx-ask-go" aria-label="Sprachmodus">${fi('voice', 15)}</button></label>`);
    ask.querySelector('input').addEventListener('keydown', (e) => e.stopPropagation());
    const sec = wide('Aufgabenfelder', list);
    sec.append(section('', [['Frage-Feld', [ask]]]).lastChild);
    return sec;
  }

  /* ---------- Neu: Seitenleiste und Schrift ---------- */
  function sidebar() {
    const nav = [['home', 'Home', 0], ['tasks', 'Aufgaben', 0], ['calendar', 'Kalender', 0], ['analytics', 'Auswertung', 0]];
    const proj = [['#9799ec', 'Schule', 1], ['#d38b7d', 'Mathe', 0], ['#7db993', 'Biologie', 0]];
    const side = html(`<div class="nx-side"><div class="nx-nav-list">${nav.map(([ic, l]) => `<button type="button" class="nx-nav">${fi(ic, 16)}<span>${l}</span></button>`).join('')}</div><div class="nx-side-h">Projekte</div><div class="nx-nav-list">${proj.map(([c, l, on]) => `<button type="button" class="nx-nav${on ? ' on' : ''}"><i class="nx-dot" style="--c:${c}"></i><span>${l}</span></button>`).join('')}</div></div>`);
    side.addEventListener('click', (ev) => { const b = ev.target.closest('.nx-nav'); if (!b) return; side.querySelectorAll('.nx-nav').forEach((x) => x.classList.toggle('on', x === b)); });
    const type = html('<div class="nx-type"><span class="nx-type-xl">Schule</span><span class="nx-type-l">Downloads aufräumen</span><span class="nx-type-m">Bio-Klausur vorbereiten</span><span class="nx-type-s">Weitere erstellen · 12 Tage · 0/5</span></div>');
    return section('Seitenleiste und Schrift', [['Seitenleiste', [side]], ['Schrift', [type]]]);
  }

  /* ---------- Bausteine aus ui-kit.js und der App, im neuen Stil ---------- */
  function buttons() {
    const B = window.UIKit.button;
    return section('Knöpfe', [
      ['Arten', [B({ label: 'Erstellen', kind: 'light' }), B({ label: 'Standard' }), B({ label: 'Umrandet', kind: 'line' }), B({ label: 'Leise', kind: 'ghost' }), B({ label: 'Löschen', kind: 'danger' })]],
      ['Mit Icon', [B({ label: 'Hinzufügen', icon: 'plus', kind: 'light' }), B({ label: 'Hinzufügen', icon: 'plus' }), B({ label: 'Datum', icon: 'calendar', kind: 'line' }), B({ label: 'Hinzufügen', icon: 'plus', kind: 'ghost' }), B({ label: 'Löschen', icon: 'trash', kind: 'danger' })]],
      ['Nur Icon', [B({ icon: 'plus', kind: 'light', aria: 'Hinzufügen' }), B({ icon: 'search', aria: 'Suchen' }), B({ icon: 'more', kind: 'line', aria: 'Mehr' }), B({ icon: 'x', kind: 'ghost', aria: 'Schließen' }), B({ icon: 'trash', kind: 'danger', aria: 'Löschen' })]],
      ['Größen', [B({ label: 'Klein', size: 's', kind: 'light' }), B({ label: 'Mittel', kind: 'light' }), B({ label: 'Groß', size: 'l', kind: 'light' }), B({ label: 'Klein', size: 's', kind: 'line' }), B({ label: 'Mittel', kind: 'line' }), B({ label: 'Groß', size: 'l', kind: 'line' })]],
      ['Gesperrt', [B({ label: 'Erstellen', kind: 'light', disabled: true }), B({ label: 'Standard', disabled: true }), B({ label: 'Umrandet', kind: 'line', disabled: true }), B({ label: 'Leise', kind: 'ghost', disabled: true })]],
    ]);
  }

  function inputs() {
    const I = window.UIKit.input, B = window.UIKit.button, D = window.UIKit.dropdown;
    const grow = () => { const g = document.createElement('span'); g.style.flex = '1'; return g; };
    const sec = section('Eingabefeld', [
      ['Arten', [I({ placeholder: 'Text eingeben' }), I({ placeholder: 'Suchen', icon: 'search', clearable: true })]],
      ['Größen', [I({ placeholder: 'Klein', size: 's' }), I({ placeholder: 'Mittel' }), I({ placeholder: 'Groß', size: 'l' })]],
      ['Mehrzeilig', [I({ placeholder: 'Beschreibung hinzufügen', multiline: true, rows: 2 })]],
      // wie das Chat-Eingabefeld der App: Plus, Modell-Wahl · Aufwand, Mikrofon, Sprachmodus (dieselben Icons)
      ['Nachricht', [I({ placeholder: 'Schreib dem Agenten …', multiline: true, foot: [
        B({ icon: 'plus', kind: 'ghost', aria: 'Foto hinzufügen' }),
        D({ select: true, value: 'gemini', kind: 'ghost', items: [{ id: 'gemini', label: 'Gemini' }, { id: 'minimax', label: 'MiniMax' }, { id: 'deepseek', label: 'DeepSeek' }] }),
        grow(),
        D({ select: true, value: 'auto', kind: 'ghost', align: 'right', items: ['Auto', 'Niedrig', 'Mittel', 'Hoch', 'Max'].map((n) => ({ id: n.toLowerCase(), label: n })) }),
        B({ icon: 'mic', kind: 'ghost', aria: 'Sprachaufnahme starten' }), B({ icon: 'voice', kind: 'ghost', aria: 'Sprachmodus' }),
      ] })]],
      ['Gesperrt', [I({ placeholder: 'Nicht änderbar', disabled: true }), I({ value: 'Fester Wert', disabled: true })]],
    ]);
    sec.classList.add('uiv-sec-inputs');
    return sec;
  }

  function switches() {
    const S = window.UIKit.slider, T = window.UIKit.tabBar;
    return section('Umschalter, Schalter, Regler', [
      ['Tableiste', [T({ items: [{ id: 'a', label: 'Aufgaben' }, { id: 'b', label: 'Kalender' }, { id: 'c', label: 'Auswertung' }], value: 'a', label: 'Beispiel' })]],
      ['Umschalter', [seg(['Deutsch', 'English'], 0), seg(['Aus', 'Leicht', 'Mittel', 'Stark'], 2)]],
      ['Schalter', [sw(true), sw(false)]],
      ['Regler', [S({ value: 35, aria: 'Beispiel' }), S({ min: 0, max: 4, step: 1, value: 2, aria: 'Beispiel in Schritten' })]],
    ]);
  }

  function existing() {
    const K = window.UIKit, frag = document.createDocumentFragment();
    const tag = (name, c) => html(`<span class="lb2-tag" style="--c:${c}"><span>${name}</span></span>`);
    const colors = html(`<div class="uiv-colors">${K.colorRow(K.COLORS[6], 'data-uiv-color')}</div>`);
    colors.addEventListener('click', (ev) => { const b = ev.target.closest('[data-uiv-color]'); if (!b) return; colors.querySelectorAll('.tk-colors button').forEach((x) => x.classList.toggle('on', x === b)); });
    frag.append(section('Farben und Tags', [['Farbauswahl', [colors]], ['Tags', [tag('Biologie', '#7db993'), tag('Mathe', '#6bb0d7'), tag('Klausur', '#d38b7d'), tag('Vokabeln', '#9799ec')]]]));
    // Karte mit Zeilen (wie Einstellungen): Name links, Wert oder Bedienelement rechts
    const card = html(`<div class="st-card uiv-card">
        <div class="st-row"><span class="st-name">Name</span><span class="grow"></span><span class="uiv-slot" data-s="field"></span></div>
        <div class="st-row"><span class="st-name">Ansicht</span><span class="grow"></span><span class="uiv-slot" data-s="seg"></span></div>
        <div class="st-row"><span class="st-name">Benachrichtigungen</span><span class="grow"></span><span class="uiv-slot" data-s="sw"></span></div>
        <div class="st-row"><span class="st-name">Konto</span><span class="grow"></span><span class="st-muted">Im Konto</span><button type="button" class="st-btn">Abmelden</button></div></div>`);
    card.querySelector('[data-s="field"]').replaceWith(K.input({ value: 'Julian', size: 's' }));
    card.querySelector('[data-s="seg"]').replaceWith(seg(['Kacheln', 'Liste'], 0));
    card.querySelector('[data-s="sw"]').replaceWith(sw(true));
    const cs = section('Karte mit Zeilen', []); cs.append(card); frag.append(cs);
    // Kalender zum Anklicken und Uhrzeit-Rad (aus dem Termin-Fenster)
    let day = K.isoOf(new Date());
    const calBox = html('<div class="tk-cal uiv-cal"></div>'); const cal = K.miniCalendar(calBox, () => day, (iso) => { day = iso; }); cal.open();
    const wheel = html('<div class="uiv-wheel"></div>'); wheel.append(K.timeWheel('09:30', () => {}, 5));
    frag.append(section('Datum und Uhrzeit', [['Kalender', [calBox]], ['Uhrzeit', [wheel]]]));
    return frag;
  }

  function dropdowns() {
    const D = window.UIKit.dropdown;
    const sort = [{ id: 'new', label: 'Neueste zuerst' }, { id: 'old', label: 'Älteste zuerst' }, { id: 'name', label: 'Name A–Z' }, { id: 'size', label: 'Größe' }];
    const acts = [{ id: 'rename', label: 'Umbenennen', icon: 'pencil' }, { id: 'copy', label: 'Duplizieren', icon: 'copy' }, { id: 'pin', label: 'Anheften', icon: 'pin' }, { id: 'link', label: 'Link kopieren', icon: 'link' }, { sep: true }, { id: 'del', label: 'Löschen', icon: 'trash', danger: true }];
    const groups = [{ title: 'Ansicht' }, { id: 'grid', label: 'Kacheln' }, { id: 'list', label: 'Liste' }, { title: 'Zeigen' }, { id: 'all', label: 'Alles' }, { id: 'mine', label: 'Nur meine' }];
    // ein Menü steht dauerhaft offen daneben, damit man die Form ohne Antippen sieht
    const still = html('<div class="ui-menu nx-menu-still" role="presentation"></div>');
    still.innerHTML = acts.map((it) => (it.sep ? '<i class="ui-menu-sep"></i>' : `<span class="ui-menu-item${it.danger ? ' danger' : ''}">${window.UIKit.icon(it.icon, 16) || fi(it.icon, 16)}<span class="ui-menu-label">${it.label}</span></span>`)).join('');
    return section('Dropdown-Menü', [
      ['Auswahl', [D({ select: true, value: 'new', items: sort }), D({ select: true, value: 'name', items: sort, kind: 'line' }), D({ select: true, value: 'old', items: sort, kind: 'ghost' })]],
      ['Aktionen', [D({ label: 'Aktionen', items: acts }), D({ label: 'Neu', icon: 'plus', kind: 'light', items: [{ id: 'chat', label: 'Neuer Chat', icon: 'chat' }, { id: 'doc', label: 'Neues Dokument', icon: 'file' }, { id: 'folder', label: 'Neuer Ordner', icon: 'folder' }] }), D({ icon: 'sliders', kind: 'line', aria: 'Optionen', items: acts })]],
      ['Abschnitte', [D({ label: 'Ansicht', kind: 'line', items: groups }), D({ label: 'Rechtsbündig', align: 'right', items: acts })]],
      ['Offen', [still]],
    ]);
  }

  function icons() {
    const K = window.UIKit;
    const tile = (name) => { const t = document.createElement('div'); t.className = 'uiv-ic'; t.innerHTML = `<i>${K.icon(name, 20)}</i><span></span>`; t.lastChild.textContent = K.ICONS[name].label; return t; };
    const sec = section('Icons', [
      ['Liste', Object.keys(K.ICONS).map(tile)],
    ]);
    const note = document.createElement('p'); note.className = 'uiv-note'; note.textContent = 'Unverändert: Raster 20 · Strich 1,65 · weiche Ecken · keine Füllungen';
    sec.querySelector('h3').after(note);
    return sec;
  }

  function build() {
    view = document.createElement('section');
    view.className = 'uiv-view nx';
    view.setAttribute('aria-label', 'UI');
    view.innerHTML = '<header class="uiv-head"><h2>UI</h2><div class="uiv-mid"></div><span class="uiv-right"></span></header><div class="uiv-body"></div>';
    view.querySelector('.uiv-body').append(windows(), tasks(), sidebar(), buttons(), inputs(), switches(), dropdowns(), existing(), icons());
  }

  function show() {
    const panel = document.querySelector('.panel');
    if (!view) build();
    if (panel && !view.isConnected) panel.append(view);
    open = true;
    view.hidden = false;
    panel?.classList.add('view-ui');
  }
  function hide() {
    if (!open) return;
    open = false;
    view.hidden = true;
    document.querySelector('.panel')?.classList.remove('view-ui');
  }
  return { show, hide, get open() { return open; } };
})();
window.UILab = UILab;
