/* ===================================================================
   Bereich „UI“ (Sidebar, 14.11.): Sammlung der Bausteine, aus denen später das Design der App entsteht.
   Noch fast leer – die Bausteine kommen einzeln dazu. Bisher: Tableiste (UIKit.tabBar) oben mittig, darunter Knöpfe (UIKit.button) Regler, Dropdown-Menüs (UIKit.dropdown), die vorhandenen Bausteine der App (Umschalter, Schalter, Farben, Tags, Karte, Kalender, Uhrzeit) und die Icon-Liste (UIKit.ICONS).
   Öffnet als eigener Tab (app.js → VIEW_TABS.ui).
   =================================================================== */
const UILab = (() => {
  const TABS = [{ id: 'all', label: 'Alle' }, { id: 'images', label: 'Bilder' }, { id: 'videos', label: 'Videos' }, { id: 'pages', label: 'Seiten' }];
  let view = null, open = false;

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
  function buttons() {
    const B = window.UIKit.button;
    return section('Knöpfe', [
      ['Arten', [B({ label: 'Standard' }), B({ label: 'Hell', kind: 'light' }), B({ label: 'Umrandet', kind: 'line' }), B({ label: 'Leise', kind: 'ghost' }), B({ label: 'Löschen', kind: 'danger' })]],
      ['Mit Icon', [B({ label: 'Hinzufügen', icon: 'plus' }), B({ label: 'Hinzufügen', icon: 'plus', kind: 'light' }), B({ label: 'Hinzufügen', icon: 'plus', kind: 'line' }), B({ label: 'Hinzufügen', icon: 'plus', kind: 'ghost' }), B({ label: 'Löschen', icon: 'trash', kind: 'danger' })]],
      ['Nur Icon', [B({ icon: 'search', aria: 'Suchen' }), B({ icon: 'plus', kind: 'light', aria: 'Hinzufügen' }), B({ icon: 'filter', kind: 'line', aria: 'Filter' }), B({ icon: 'plus', kind: 'ghost', aria: 'Hinzufügen' }), B({ icon: 'trash', kind: 'danger', aria: 'Löschen' })]],
      ['Größen', [B({ label: 'Klein', size: 's' }), B({ label: 'Mittel' }), B({ label: 'Groß', size: 'l' }), B({ label: 'Klein', size: 's', kind: 'light' }), B({ label: 'Mittel', kind: 'light' }), B({ label: 'Groß', size: 'l', kind: 'light' })]],
      ['Gesperrt', [B({ label: 'Standard', disabled: true }), B({ label: 'Hell', kind: 'light', disabled: true }), B({ label: 'Umrandet', kind: 'line', disabled: true }), B({ label: 'Leise', kind: 'ghost', disabled: true })]],
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

  function sliders() {
    const S = window.UIKit.slider;
    return section('Regler', [['Stufenlos', [S({ value: 35, aria: 'Beispiel' })]], ['In Schritten', [S({ min: 0, max: 4, step: 1, value: 2, aria: 'Beispiel in Schritten' })]]]);
  }

  /* Bausteine, die es in der App schon gibt (14.11.): hier gesammelt, damit man sie an einer Stelle sieht und beurteilen kann.
     Es sind dieselben Klassen wie in der App (kein Nachbau) – ändert sich dort etwas, ändert es sich hier mit. */
  function existing() {
    const K = window.UIKit, frag = document.createDocumentFragment();
    const html = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
    const seg = (items, on) => { const e = html(`<span class="st-seg" role="radiogroup">${items.map((l, i) => `<button type="button" role="radio" aria-checked="${i === on}" class="${i === on ? 'on' : ''}">${l}</button>`).join('')}</span>`);
      e.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; e.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); }); }); return e; };
    const sw = (on) => { const e = html(`<button type="button" class="ce-switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="umschalten"><i></i></button>`); e.addEventListener('click', () => { const v = !e.classList.contains('on'); e.classList.toggle('on', v); e.setAttribute('aria-checked', String(v)); }); return e; };
    const tag = (name, c) => html(`<span class="lb2-tag" style="--c:${c}"><span>${name}</span></span>`);
    frag.append(section('Umschalter', [['Zwei', [seg(['Deutsch', 'English'], 0)]], ['Mehrere', [seg(['Aus', 'Leicht', 'Mittel', 'Stark'], 2)]]]));
    frag.append(section('Schalter', [['An und aus', [sw(true), sw(false)]]]));
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
    return section('Dropdown-Menü', [
      ['Auswahl', [D({ select: true, value: 'new', items: sort }), D({ select: true, value: 'name', items: sort, kind: 'line' }), D({ select: true, value: 'old', items: sort, kind: 'ghost' })]],
      ['Aktionen', [D({ label: 'Aktionen', items: acts }), D({ label: 'Neu', icon: 'plus', kind: 'light', items: [{ id: 'chat', label: 'Neuer Chat', icon: 'chat' }, { id: 'doc', label: 'Neues Dokument', icon: 'file' }, { id: 'folder', label: 'Neuer Ordner', icon: 'folder' }] }), D({ icon: 'sliders', kind: 'ghost', aria: 'Optionen', items: acts })]],
      ['Abschnitte', [D({ label: 'Ansicht', kind: 'line', items: groups }), D({ label: 'Rechtsbündig', align: 'right', items: acts })]],
    ]);
  }

  function icons() {
    const K = window.UIKit;
    const tile = (name) => { const t = document.createElement('div'); t.className = 'uiv-ic'; t.innerHTML = `<i>${K.icon(name, 20)}</i><span></span>`; t.lastChild.textContent = K.ICONS[name].label; return t; };
    const sec = section('Icons', [
      ['Liste', Object.keys(K.ICONS).map(tile)],
    ]);
    const note = document.createElement('p'); note.className = 'uiv-note'; note.textContent = 'Raster 20 · Strich 1,65 · Form füllt das Raster · weiche Ecken · keine Füllungen';
    sec.querySelector('h3').after(note);
    return sec;
  }

  function build() {
    view = document.createElement('section');
    view.className = 'uiv-view';
    view.setAttribute('aria-label', 'UI');
    view.innerHTML = '<header class="uiv-head"><h2>UI</h2><div class="uiv-mid"></div><span class="uiv-right"></span></header><div class="uiv-body"></div>';
    view.querySelector('.uiv-mid').append(window.UIKit.tabBar({ items: TABS, value: 'all', label: 'Tableiste' }));
    view.querySelector('.uiv-body').append(buttons(), inputs(), sliders(), dropdowns(), existing(), icons());
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
