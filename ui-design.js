/* ===================================================================
   UI Design (Wunsch 09.11.): eigene Ansicht in der Sidebar mit ALLEN Bausteinen der App an einem Ort.
   - Jeder Baustein steht hier mit den ECHTEN Klassen aus style.css (kein Nachbau) → was hier geändert wird, gilt überall.
   - Unter jedem Baustein: Name + Klasse, damit man ihn im Gespräch genau benennen kann („ändere .st-seg“).
   - Farben/Schrift werden live aus den CSS-Variablen gelesen, Icons aus den vorhandenen <symbol>s.
   - Neue Bausteine der App IMMER auch hier eintragen (kb/design.md → „UI Design“).
   - Oben mittig ein Umschalter wie „Agenten | Dokumente“ (.cs-pill): „Aktuell“ = heutiger Stil der App,
     „Glas“ = neuer Stil als Vorschau (Vorbild: drittes Nutzer-Bild, Mac-Widget; Sidebar wie im zweiten Bild):
     Milchglas über neutral-grauem Hintergrund, Karten wie Kacheln mit Kopf in der Karte, oben frei, SF-Schrift.
     Der Glas-Stil gilt NUR, solange diese Ansicht mit „Glas“ offen ist: .ud-glass an der Ansicht + body.gl-shell
     (Fenster/Sidebar). Regeln im Block „STIL GLAS“ am Ende von style.css, gemerkt in ud.style.v1.
   app.js: VIEW_TABS.uidesign → window.UIDesign (show/hide wie die anderen Ansichten).
   =================================================================== */
const UIDesign = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const oi = (n, s = 16) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#o-${n}"/></svg>`;
  const dog = (id, s = 20) => (window.PixelDogs?.svg ? window.PixelDogs.svg(id, s) : '');
  const panel = () => document.querySelector('.panel');

  // Satz je Stil: [Aktuell, Glas]
  const two = (cur, glass) => `<span class="ud-cur">${esc(cur)}</span><span class="ud-gl">${esc(glass)}</span>`;
  // Ein Baustein: Bühne + Name + Klasse (+ kurzer Satz, wo er benutzt wird)
  const item = (name, cls, stage, note = '', wide = false) => `<figure class="ud-item${wide ? ' ud-wide' : ''}">
      <div class="ud-stage">${stage}</div>
      <figcaption><b>${esc(name)}</b>${cls ? `<code>${esc(cls)}</code>` : ''}${note ? `<span>${Array.isArray(note) ? two(...note) : esc(note)}</span>` : ''}</figcaption></figure>`;
  const section = (id, title, note, items) => `<section class="ud-sec" id="ud-${id}" data-sec="${id}">
      <h3>${esc(title)}</h3>${note ? `<p class="ud-note">${Array.isArray(note) ? two(...note) : esc(note)}</p>` : ''}<div class="ud-grid">${items.join('')}</div></section>`;

  /* ---------- Inhalte ---------- */
  const SURFACES = [['Hauptteil', '--main-bg', 'Sidebar, Hauptbereich'], ['Fenster', '--win-bg', 'Eingabefeld, Karten, Menüs'], ['Ausklappbar', '--pop-bg', 'Hover, Köpfe, aktive Zeile'], ['Rand', '--line', 'alle Ränder']];
  const TEXTS = [['Titel', '--text'], ['Text 2', '--text-2'], ['Fließtext', '--text-3'], ['Leise', '--text-4']];
  const ACCENTS = [['Akzent', '--accent', '#2f86ff'], ['Gefahr', '--g-red', '#f07a6e'], ['Grün', '--g-green', '#3fb57d']];
  const SIZES_GLASS = [[28, 700, 'Seitentitel'], [28, 600, 'Große Zahl'], [15, 600, 'Abschnitt'], [13.5, 600, 'Kartenkopf'], [13, 400, 'Text, Sidebar, Menü'], [12.5, 400, 'Klein'], [11.5, 500, 'Etikett']];
  const SURFACES_GLASS = [['Sidebar', '--gl-side', ''], ['Hauptteil', '--gl-main', ''], ['Karte', '--gl-card', ''], ['Angehoben', '--gl-card-2', ''], ['Gewählt', '--gl-card-3', ''], ['Rand', '--gl-edge', ''], ['Menü', '--gl-menu', '']];
  const SIZES = [[18, 600, 'Seitentitel'], [15, 600, 'Abschnitt'], [14, 400, 'Zeilentitel'], [13.5, 400, 'Sidebar'], [13, 400, 'Knopf'], [12.5, 400, 'Menü'], [12, 400, 'Klein'], [11, 500, 'Etikett']];

  const swatch = ([label, v, fixed]) => `<div class="ud-sw"><i data-var="${v}" style="background:${v ? `var(${v}${fixed ? `, ${fixed}` : ''})` : fixed}"></i><b>${esc(label)}</b><code data-hex="${v}" data-fix="${fixed || ''}">${fixed || ''}</code></div>`;

  function build() {
    const colors = window.UIKit?.COLORS || [];
    const icons = [...document.querySelectorAll('symbol[id^="f-"]')].map((s) => s.id.slice(2));
    const sideIcons = [...document.querySelectorAll('symbol[id^="o-"]')].map((s) => s.id.slice(2)).filter((n) => n !== 'chev');
    return `<div class="ud-top"><div class="cs-pill" role="tablist" aria-label="Stil">
        <button type="button" role="tab" data-udstyle="cur">Aktuell</button><button type="button" role="tab" data-udstyle="glass">Glas</button></div>
        <div class="ud-top-in"><nav class="ud-jump">${[['farben', 'Farben'], ['schrift', 'Schrift'], ['knoepfe', 'Knöpfe'], ['eingaben', 'Eingaben'], ['auswahl', 'Auswahl'], ['menues', 'Menüs'], ['listen', 'Listen'], ['karten', 'Karten'], ['etiketten', 'Etiketten'], ['werkzeuge', 'Werkzeuge'], ['icons', 'Icons']].map(([k, l]) => `<button type="button" data-jump="${k}">${l}</button>`).join('')}</nav></div></div>
      <div class="ud-wrap">
      <div class="cl-head ud-head"><h2>UI Design</h2></div>
      <p class="ud-lead">${two('Alle Bausteine der App an einem Ort – mit den echten Stilen. Was hier geändert wird, ändert sich überall.', 'Vorschau auf den neuen Stil: dieselben Bausteine wie am Mac. Gilt nur hier – in die App kommt er erst nach deiner Freigabe.')}</p>

      ${section('farben', 'Farben', ['Nur drei Flächen, ein Rand, vier Text-Töne. Farbe nur als Akzent.', 'Milchglas über neutralem Grau.'], [
        item('Flächen', '', `<div class="ud-sws ud-cur-b">${SURFACES.map(swatch).join('')}</div><div class="ud-sws ud-gl-b">${SURFACES_GLASS.map(swatch).join('')}</div>`, ['--main-bg · --win-bg · --pop-bg · --line', '--gl-window · --gl-side · --gl-fill … --gl-menu'], true),
        item('Text', '--text … --text-4', `<div class="ud-sws">${TEXTS.map(swatch).join('')}</div>`, '', true),
        item('Akzente', '--accent', `<div class="ud-sws">${ACCENTS.map(swatch).join('')}</div>`),
        item('Fach-/Termin-Farben', 'UIKit.COLORS', `<div class="ud-dots">${colors.map((c) => `<i style="background:${c}" title=""></i>`).join('')}</div>`),
      ])}

      ${section('schrift', 'Schrift', ['Inter, Stärke 400/500/600 – nie fetter.', 'Systemschrift des Mac (SF Pro), Grundgröße 13 px; Titel und große Zahlen 700.'], [
        item('Größen', '', [[SIZES, 'ud-cur-b'], [SIZES_GLASS, 'ud-gl-b']].map(([list, cls]) => `<div class="ud-type ${cls}">${list.map(([px, w, l]) => `<div><span style="font-size:${px}px;font-weight:${w}">${l}</span><code>${String(px).replace('.', ',')} px · ${w}</code></div>`).join('')}</div>`).join(''), '', true),
      ])}

      ${section('knoepfe', 'Knöpfe', '', [
        item('Hauptknopf', '.ud-btn.primary', '<button type="button" class="ud-btn primary">Aufgabe erstellen</button>', 'Blau nur für das Wichtigste'),
        item('Grauer Knopf', '.tk-new', `<span class="tk-view tk-listmode ud-inline"><button type="button" class="tk-new">${fi('plus', 13)}<span>Neue Aufgabe</span></button></span>`, 'Seitenköpfe (Aufgaben)'),
        item('Nebenknopf', '.ud-btn', '<button type="button" class="ud-btn">Abbrechen</button>', ['Rand, keine Fläche', 'Leicht gefüllt, ohne Rand']),
        item('Löschen', '.ud-btn.danger', `<button type="button" class="ud-btn danger">${fi('trash', 13)}Löschen</button>`, 'Erst rot, zweiter Tipp löscht'),
        item('Icon-Knopf', '.icon-btn', `<span class="ud-row"><button type="button" class="icon-btn">${fi('pin', 15)}</button><button type="button" class="icon-btn">${fi('sliders', 15)}</button><button type="button" class="icon-btn">${fi('more', 15)}</button></span>`, 'Werkzeug-Knöpfe nur als Icon'),
        item('Plus-Knopf', '.hm-plus', `<button type="button" class="hm-plus">${fi('plus', 14)}</button>`, 'Rechts neben „Home“'),
        item('Pille', '.tk-pill', `<span class="ud-row"><button type="button" class="tk-pill">${fi('calendar', 12)}Heute</button><button type="button" class="tk-pill">${fi('flag', 12)}Wichtig</button></span>`, 'Filter, Leisten'),
        item('Karten-Knopf', '.hm-go', '<button type="button" class="hm-go">Öffnen</button>', 'Rechts in Home-Karten'),
      ])}

      ${section('eingaben', 'Eingaben', '', [
        item('Suchfeld', '.cl-search', `<label class="cl-search ud-full">${fi('search', 14)}<input type="search" placeholder="Chats und Dokumente durchsuchen" /></label>`, 'Home, Aufgaben', true),
        item('Textfeld', '.ud-input', '<input class="ud-input" placeholder="Projektname" />'),
        item('Textbereich', '.ud-input', '<textarea class="ud-input" rows="3" placeholder="Beschreibung hinzufügen"></textarea>'),
        item('System-Auswahl', 'select', '<select class="ud-select"><option>Automatisch</option><option>Gemini</option><option>MiniMax</option></select>', 'Nur wo nötig – sonst eigenes Menü'),
      ])}

      ${section('auswahl', 'Auswahl', ['Kein Blau und kein Grau als Auswahl-Fläche – nur Haken oder heller Teil.', 'Gewählter Teil hell durchscheinend, Schalter und Kästchen im Akzent.'], [
        item('Stufen-Umschalter', '.st-seg', '<span class="st-seg" role="radiogroup"><button type="button" class="on">Haupt-KI</button><button type="button">Ersatz</button><button type="button">Aus</button></span>', 'Einstellungen'),
        item('Leiste oben mittig', '.cs-pill', '<div class="cs-pill"><button type="button" class="on">Agenten</button><button type="button">Dokumente</button></div>', 'Erstellen'),
        item('Schalter', '.ce-switch', '<span class="ud-row"><button type="button" class="ce-switch on" role="switch"><i></i></button><button type="button" class="ce-switch" role="switch"><i></i></button></span>', 'An = Akzent'),
        item('Kästchen', '.lb2-check', `<div class="cl-wrap lb2 lb2-picking ud-list ud-mini"><div class="cl-list">
            <div class="lb2-row picked"><button type="button" class="lb2-check" role="checkbox" aria-checked="true">${fi('check', 11)}</button><span class="lb2-text"><span class="lb2-title">Gewählt</span></span></div>
            <div class="lb2-row"><button type="button" class="lb2-check" role="checkbox" aria-checked="false">${fi('check', 11)}</button><span class="lb2-text"><span class="lb2-title">Nicht gewählt</span></span></div></div></div>`, 'Home-Liste (Auswahl)'),
        item('Farbreihe', '.tk-colors', `<div class="ud-colors">${window.UIKit?.colorRow ? window.UIKit.colorRow(colors[2], 'data-udc') : ''}</div>`, 'Termine, Tags'),
      ])}

      ${section('menues', 'Menüs', ['Fläche Fenster-Ton, Rand leise, Radius 10, Auswahl nur Haken.', 'Glas mit Weichzeichner, Radius 12, Zeilen Radius 7, Auswahl nur Haken.'], [
        item('Auswahl-Menü', '.tk-pop · .tk-menu · .tk-mi', `<div class="tk-pop ud-pop"><button type="button" class="tk-pill" data-udopen>${fi('filter', 12)}<span data-udval>Alle</span>${fi('chevron-down', 10)}</button>
            <div class="tk-menu">${['Alle', 'Chats', 'Dokumente'].map((v, i) => `<button type="button" class="tk-mi${i === 0 ? ' on' : ''}" data-udpick="${v}"><span>${v}</span>${fi('check', 12)}</button>`).join('')}</div></div>`, 'Zum Ausprobieren antippen'),
        item('Menü (offen)', '.lb2-menu · .lb2-mi', `<div class="lb2-menu ud-static" role="menu">
            <button type="button" class="lb2-mi">${fi('chat', 14)}<span>Neuer Chat</span></button>
            <button type="button" class="lb2-mi">${fi('file-plus', 14)}<span>Neues Dokument</span><i class="lb2-tick">${fi('check', 13)}</i></button>
            <button type="button" class="lb2-mi lb2-danger">${fi('trash', 14)}<span>Löschen</span></button></div>`, 'Plus, Filter, ⋯'),
        item('Chat-Menü', '.chat-pop.chat-menu', `<div class="chat-pop chat-menu ud-static open" role="menu">
            <button type="button">${fi('pencil', 14)}<span>Umbenennen</span></button><button type="button">${fi('pin', 14)}<span>Anheften</span></button>
            <div class="cm-sep"></div><button type="button" class="danger">${fi('trash', 14)}<span>Löschen</span></button></div>`, 'Titel oben links im Chat'),
        item('Aufklapp-Zeilen im Fenster', '.tk-sheet-rows · .tk-pill · .tk-box', `<div class="tk-sheet ud-sheet"><div class="tk-sheet-rows">
            <div class="tk-pop" data-k="a"><button type="button" class="tk-pill" data-udfold><span class="tk-si">${fi('calendar', 14)}</span><span class="tk-rv">Morgen, 14:00</span></button><div class="tk-menu"><div class="tk-box ud-cal"></div></div></div>
            <div class="tk-pop" data-k="b"><button type="button" class="tk-pill empty" data-udfold><span class="tk-si">${fi('flag', 14)}</span><span class="tk-rv">Priorität</span></button><div class="tk-menu"><div class="tk-box">${['Hoch', 'Mittel', 'Niedrig'].map((v) => `<button type="button" class="tk-mi"><span>${v}</span>${fi('check', 12)}</button>`).join('')}</div></div></div>
          </div></div>`, 'Fenster „Neue Aufgabe“ / Termin', true),
        item('Uhrzeit-Rad', '.tk-wheel', '<div class="ud-wheel"></div>', 'Termin-Fenster'),
      ])}

      ${section('listen', 'Listen', '', [
        item('Home-Zeile', '.lb2-row', `<div class="cl-wrap lb2 ud-list"><div class="cl-list">
            <div class="cl-label">Heute</div>
            <div class="lb2-row" tabindex="0"><button type="button" class="lb2-check" role="checkbox" aria-checked="false">${fi('check', 11)}</button><span class="cl-av" data-udchat></span><span class="lb2-text"><span class="lb2-title">Photosynthese erklärt</span></span><span class="lb2-time">14:32</span>
              <span class="lb2-acts"><button type="button" class="lb-act lb2-pin">${fi('pin', 14)}</button><button type="button" class="lb-act lb-del">${fi('trash', 14)}</button></span></div>
            <div class="lb2-row" tabindex="0"><button type="button" class="lb2-check" role="checkbox" aria-checked="false">${fi('check', 11)}</button><span class="cl-av" data-udpage></span><span class="lb2-text"><span class="lb2-title">Lernzettel Biologie</span></span><span class="lb2-time">09:10</span>
              <span class="lb2-acts"><button type="button" class="lb-act lb2-pin">${fi('pin', 14)}</button><button type="button" class="lb-act lb-del">${fi('trash', 14)}</button></span></div></div></div>`, 'Chats und Dokumente; Darüberfahren zeigt Aktionen', true),
        item('Sidebar-Zeilen', '.nav-item', `<nav class="nav sb-main ud-nav"><a class="nav-item">${oi('home')}Home</a><a class="nav-item active">${oi('tasks')}Aufgaben</a><a class="nav-item">${oi('calendar')}Kalender</a></nav>`, 'Aktiv = Ausklappbar-Ton'),
        item('Auswahl-Leiste unten', '.lb2-dock-pill', `<div class="lb2-dock-pill"><button type="button">${fi('pin', 14)}<span>Anheften</span></button><i class="lb2-dk-sep"></i><button type="button">${fi('trash', 14)}<span>Löschen</span></button><i class="lb2-dk-sep"></i><button type="button"><span>Abbrechen</span></button></div>`, 'Erscheint bei Auswahl', true),
      ])}

      ${section('karten', 'Karten', '', [
        item('Home-Karte', '.hm-card', `<div class="hm-next ud-hm"><div class="hm-track">
            <article class="hm-card hm-event hm-soon"><span class="hm-ic">${fi('calendar', 16)}</span><span class="hm-txt"><span class="hm-title">Mathe-Nachhilfe</span><span class="hm-desc"><b>In 40 Min.</b><span class="hm-dot">·</span>15:00–16:00</span></span><button type="button" class="hm-go">Kalender</button><button type="button" class="hm-x">${fi('x', 10)}</button></article></div></div>`, 'Als Nächstes', true),
        item('Home-Karte (Alarm)', '.hm-card.hm-warn', `<div class="hm-next ud-hm"><div class="hm-track">
            <article class="hm-card hm-task hm-warn"><span class="hm-ic">${fi('tasks', 16)}</span><span class="hm-txt"><span class="hm-title">3 Aufgaben für heute</span><span class="hm-desc"><b>1 überfällig</b><span class="hm-dot">·</span>Vokabeln · Referat</span></span><button type="button" class="hm-go">Aufgaben</button><button type="button" class="hm-x">${fi('x', 10)}</button></article></div></div>`, '', true),
        item('Inhalts-Kasten', '.ud-box', `<div class="ud-box"><div class="ud-box-head">${fi('book-open', 14)}<b>Quiz · Zellbiologie</b><span class="grow"></span><button type="button" class="icon-btn">${fi('expand', 14)}</button></div><p>Welche Organelle betreibt die Fotosynthese?</p></div>`, 'Quiz, Mini-Apps, Podcast', true),
        item('Hinweis im Chat', '.ud-note-card', `<div class="ud-note-card"><span class="ud-dog">${dog('learn', 24)}</span><span class="ud-nc-txt"><b>API-Schlüssel fehlt</b><span>Trag ihn in den Einstellungen ein.</span></span><button type="button" class="hm-go">Öffnen</button></div>`, 'Hund links, ein Knopf rechts', true),
      ])}

      ${section('etiketten', 'Etiketten', 'Getönte Fläche 12 %, farbiger Text.', [
        item('Tags', '.tk-tag', `<div class="tk-tags ud-row">${colors.slice(0, 4).map((c, i) => `<span class="tk-tag" style="--c:${c}"><i class="tag-dot"></i>${['Mathe', 'Deutsch', 'Bio', 'Englisch'][i]}</span>`).join('')}</div>`),
        item('Etikett', '.ud-badge', '<span class="ud-row"><span class="ud-badge accent">Haupt-KI</span><span class="ud-badge">Bild-KI</span><span class="ud-badge danger">Überfällig</span></span>'),
        item('Agenten', 'PixelDogs.svg', `<span class="ud-row ud-dogs">${['general', 'learn', 'research', 'code', 'boerse'].map((a) => dog(a, 24)).join('')}</span>`, 'Größen nur 32 / 24 / 20'),
      ])}

      ${section('werkzeuge', 'Werkzeuge', '', [
        item('Kalender zum Anklicken', 'UIKit.miniCalendar', '<div class="tk-box ud-cal2"></div>', 'Datum wählen'),
        item('Farbwähler', 'UIKit.colorPicker', '<div class="ud-picker"></div>', 'Eigene Farbe'),
      ])}

      ${section('icons', 'Icons', 'Gefüllt, 16er-Raster, Farbe = Textfarbe. Keine Emojis.', [
        item('Sidebar', '#o-…', `<div class="ud-icons">${sideIcons.map((n) => `<span title="">${oi(n, 16)}<code>${esc(n)}</code></span>`).join('')}</div>`, '', true),
        item('Allgemein', '#f-…', `<div class="ud-icons">${icons.map((n) => `<span>${fi(n, 16)}<code>${esc(n)}</code></span>`).join('')}</div>`, '', true),
      ])}
    </div>`;
  }

  /* ---------- Ansicht ---------- */
  let view = null;
  const hexOf = (v) => {
    if (!v) return '';
    const c = getComputedStyle(view || document.documentElement).getPropertyValue(v).trim();
    return c || '';
  };
  const STYLE_KEY = 'ud.style.v1';
  // Glas-Vorschau gilt app-weit (Home, Erstellen, Aufgaben, Kalender …), solange oben „Glas“ gewählt ist
  const syncShell = () => {
    let st = 'cur'; try { st = localStorage.getItem(STYLE_KEY) || 'cur'; } catch {}
    const on = view ? view.classList.contains('ud-glass') : st === 'glass';
    if (on) glassify();
    document.body.classList.toggle('gl-shell', on);
  };

  /* Glas-Umrechnung: style.css enthält viele fest eingetragene Grautöne (#141414, #181818, #212121 …).
     Für die Vorschau wird direkt HINTER jede solche Regel eine gleich spezifische Regel eingefügt
     (:where(body.gl-shell) zählt nicht zur Spezifität), die das Grau durch die passende Glasfläche ersetzt.
     So bleibt die Reihenfolge der Regeln erhalten und neue Regeln werden automatisch mit umgestellt.
     Grau, das frei schwebt (position absolute/fixed), wird zu Milchglas mit Weichzeichner. */
  let glassDone = false;
  function glassify() {
    if (glassDone) return; glassDone = true;
    const sheet = [...document.styleSheets].find((sh) => /style\.css/.test(sh.href || ''));
    if (!sheet) return;
    const grey = (v) => {
      v = (v || '').trim();
      let r, g, b;
      const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
      if (h) { const x = h[1].length === 3 ? h[1].replace(/./g, '$&$&') : h[1]; [r, g, b] = [0, 2, 4].map((k) => parseInt(x.slice(k, k + 2), 16)); }
      else {
        const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(v);
        if (!m || (m[4] !== undefined && +m[4] < 1)) return -1;
        [r, g, b] = [+m[1], +m[2], +m[3]];
      }
      return Math.max(r, g, b) - Math.min(r, g, b) <= 6 && r <= 60 ? r : -1;
    };
    const fill = (l, float) => (float ? 'var(--gl-float)' : l <= 22 ? 'transparent' : l <= 31 ? 'var(--gl-card)' : l <= 40 ? 'var(--gl-card-2)' : 'var(--gl-card-3)');
    const prefix = (sel) => {
      const parts = []; let depth = 0, cur = '';
      for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch; }
      parts.push(cur);
      return parts.map((x) => {
        x = x.trim();
        if (/^(html|:root)/.test(x)) { const i = x.search(/\s/); return i < 0 ? '' : `${x.slice(0, i)} :where(body.gl-shell) ${x.slice(i + 1)}`; }
        if (/^body\b/.test(x)) return x.replace(/^body/, 'body:where(.gl-shell)');
        return `:where(body.gl-shell) ${x}`;
      }).filter(Boolean).join(', ');
    };
    const walk = (list, insert) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i];
        if (r.cssRules && !r.selectorText) { try { walk(r.cssRules, (t, at) => r.insertRule(t, at)); } catch {} continue; }
        if (!r.selectorText || !r.style || /gl-shell|ud-glass/.test(r.selectorText)) continue;
        const st = r.style; const out = [];
        const pos = st.getPropertyValue('position');
        const float = pos === 'absolute' || pos === 'fixed';
        let bg = st.getPropertyValue('background-color');
        if (!bg) { const m = /background(?:-color)?:\s*([^;]+)/.exec(st.cssText); const c = m && /(#[0-9a-f]{3,6}|rgba?\([^)]*\))\s*(?:!important)?\s*$/i.exec(m[1].trim()); if (c) bg = c[1]; }
        const imp = (p) => (st.getPropertyPriority(p) ? ' !important' : '');
        const l = grey(bg);
        if (l >= 0) {
          out.push(`background-color: ${fill(l, float)}${imp('background-color')}`);
          if (float) out.push('-webkit-backdrop-filter: var(--gl-blur); backdrop-filter: var(--gl-blur)');
        } else if (/var\(--menu-bg\)/.test(bg + st.getPropertyValue('background'))) {
          out.push('-webkit-backdrop-filter: var(--gl-blur); backdrop-filter: var(--gl-blur)');
        }
        for (const side of ['top', 'right', 'bottom', 'left']) {
          const p = `border-${side}-color`;
          const bl = grey(st.getPropertyValue(p));
          if (bl >= 18) out.push(`${p}: var(--gl-edge)${imp(p)}`);
        }
        if (!out.length) continue;
        const sel = prefix(r.selectorText);
        if (sel) { try { insert(`${sel} { ${out.join('; ')} }`, i + 1); } catch {} }
      }
    };
    try { walk(sheet.cssRules, (t, at) => sheet.insertRule(t, at)); } catch {}
  }
  const paintHex = () => view.querySelectorAll('[data-hex]').forEach((c) => { if (c.dataset.hex) c.textContent = hexOf(c.dataset.hex) || c.dataset.fix; });
  function setStyle(st) {
    const glass = st === 'glass';
    view.classList.toggle('ud-glass', glass);
    syncShell();
    view.querySelectorAll('[data-udstyle]').forEach((b) => { const on = b.dataset.udstyle === (glass ? 'glass' : 'cur'); b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    try { localStorage.setItem(STYLE_KEY, glass ? 'glass' : 'cur'); } catch {}
    paintHex();
  }
  function wire() {
    // echte Bausteine zum Leben erwecken
    const chatIc = '<svg class="lb2-page lb2-chat" width="18" height="20" viewBox="0 0 18 20" aria-hidden="true"><path class="pg-out" d="M3.6 3.5h10.8a2.1 2.1 0 0 1 2.1 2.1v7.1a2.1 2.1 0 0 1-2.1 2.1H8.4l-3.6 2.9v-2.9H3.6a2.1 2.1 0 0 1-2.1-2.1V5.6a2.1 2.1 0 0 1 2.1-2.1z"/><path class="pg-ln" d="M5 7.9h8M5 10.9h5.2"/></svg>';
    view.querySelector('[data-udchat]')?.insertAdjacentHTML('beforeend', window.Docs?.CHAT_ICON || chatIc);
    const page = window.Docs?.PAGE_SHAPE ? `<svg class="lb2-page" width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">${window.Docs.PAGE_SHAPE}</svg>` : fi('file', 16);
    view.querySelector('[data-udpage]')?.insertAdjacentHTML('beforeend', page);
    paintHex();
    let day = new Date().toISOString().slice(0, 10);
    for (const box of view.querySelectorAll('.ud-cal, .ud-cal2')) {
      const cal = window.UIKit?.miniCalendar(box, () => day, (d) => { day = d; });
      cal?.open();
    }
    const wh = view.querySelector('.ud-wheel');
    if (wh && window.UIKit?.timeWheel) wh.append(window.UIKit.timeWheel('14:00', () => {}, 5));
    const pk = view.querySelector('.ud-picker');
    if (pk && window.UIKit?.colorPicker) pk.append(window.UIKit.colorPicker('#2f86ff', () => {}));
    const sheet = view.querySelector('.ud-sheet');
    if (sheet && window.UIKit?.foldRows) window.UIKit.foldRows(sheet);

    view.addEventListener('click', (e) => {
      const stb = e.target.closest('[data-udstyle]');
      if (stb) { (window.softSwitch || ((f) => f()))(() => setStyle(stb.dataset.udstyle)); return; }
      const j = e.target.closest('[data-jump]');
      if (j) { view.querySelector(`#ud-${j.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const seg = e.target.closest('.st-seg button, .cs-pill button');
      if (seg) { seg.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === seg); b.setAttribute('aria-checked', String(b === seg)); }); return; }
      const sw = e.target.closest('.ce-switch');
      if (sw) { sw.classList.toggle('on'); return; }
      const ck = e.target.closest('.lb2-check');
      if (ck) { const on = ck.getAttribute('aria-checked') !== 'true'; ck.setAttribute('aria-checked', String(on)); ck.closest('.lb2-row')?.classList.toggle('picked', on); return; }
      const col = e.target.closest('[data-udc]');
      if (col) { col.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === col)); return; }
      const op = e.target.closest('[data-udopen]');
      if (op) { op.closest('.tk-pop').classList.toggle('open'); return; }
      const pick = e.target.closest('[data-udpick]');
      if (pick) {
        const pop = pick.closest('.tk-pop');
        pop.querySelectorAll('[data-udpick]').forEach((b) => b.classList.toggle('on', b === pick));
        pop.querySelector('[data-udval]').textContent = pick.dataset.udpick;
        pop.classList.remove('open'); return;
      }
      const fold = e.target.closest('[data-udfold]');
      if (fold) { const pop = fold.closest('.tk-pop'); const was = pop.classList.contains('open'); sheet.querySelectorAll('.tk-pop.open').forEach((p) => p.classList.remove('open')); pop.classList.toggle('open', !was); return; }
      const mi = e.target.closest('.ud-sheet .tk-mi');
      if (mi) {
        const pop = mi.closest('.tk-pop');
        pop.querySelector('.tk-rv').textContent = mi.textContent.trim();
        pop.querySelector('.tk-pill').classList.remove('empty');
        pop.querySelectorAll('.tk-mi').forEach((b) => b.classList.toggle('on', b === mi));
        pop.classList.remove('open');
      }
    });
    document.addEventListener('click', (e) => {
      if (!view || view.hidden) return;
      if (!e.target.closest('.ud-pop')) view.querySelectorAll('.ud-pop.open').forEach((p) => p.classList.remove('open'));
    });
  }

  const api = {
    open: false,
    applyStored: () => syncShell(),
    show() {
      const p = panel(); if (!p) return;
      if (!view) {
        view = document.createElement('section');
        view.className = 'dc-view ud-view';
        view.setAttribute('aria-label', 'UI Design');
        view.innerHTML = build();
        wire();
        let st = 'cur'; try { st = localStorage.getItem(STYLE_KEY) || 'cur'; } catch {}
        setStyle(st);
      }
      if (!view.isConnected) p.append(view);
      api.open = true; view.hidden = false; paintHex();
      p.classList.add('view-docs', 'view-ud');
    },
    hide() {
      if (!api.open) return;
      api.open = false;
      if (view) view.hidden = true;
      const p = panel(); if (!p) return;
      p.classList.remove('view-ud');
      if (!(window.Docs?.list?.open || window.Docs?.editor?.open)) p.classList.remove('view-docs');
    },
  };
  return api;
})();
window.UIDesign = UIDesign;
UIDesign.applyStored();
