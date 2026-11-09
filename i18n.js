/* ===================================================================
   Sprache der Oberfläche (Einstellungen → Aussehen → Sprache, Wunsch 10.11.): Deutsch (Standard) oder English.
   Die App ist auf Deutsch gebaut; bei „English“ übersetzt dieser Baustein die festen Beschriftungen (Text, placeholder,
   aria-label, title) über ein Wörterbuch und beobachtet neue Elemente. Inhalte des Nutzers (Chats, Dokumente, Titel, Eingaben)
   bleiben unberührt. Zurück auf Deutsch lädt die Seite neu.
   =================================================================== */
(() => {
  const KEY = 'ui.lang';
  const lang = () => { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'de'; } catch { return 'de'; } };
  const D = {
    // Sidebar, Köpfe
    'Erstellen': 'Create', 'Home': 'Home', 'Aufgaben': 'Tasks', 'Kalender': 'Calendar', 'Angepinnt': 'Pinned', 'Chats': 'Chats', 'Dokumente': 'Documents',
    'Agenten': 'Agents', 'Einstellungen': 'Settings', 'Zurück': 'Back', 'Allgemein': 'General', 'Aussehen': 'Appearance', 'Suchen': 'Search',
    'Workspace hinzufügen': 'Add workspace', 'Privat': 'Private', 'Neuer Chat': 'New chat', 'Neues Dokument': 'New document', 'Neue Aufgabe': 'New task',
    'Als Nächstes': 'Up next', 'Öffnen': 'Open', 'Alle Einträge': 'All items', 'Alle Chats': 'All chats', 'Gefiltert': 'Filtered',
    'Chats und Dokumente durchsuchen': 'Search chats and documents', 'Chats durchsuchen': 'Search chats', 'Aufgaben durchsuchen': 'Search tasks',
    'Noch keine Chats oder Dokumente': 'No chats or documents yet', 'Noch keine Chats': 'No chats yet', 'Nichts gefunden': 'Nothing found',
    'Heute': 'Today', 'Gestern': 'Yesterday', 'Letzte Woche': 'Last week', 'Letzter Monat': 'Last month', 'Älter': 'Older', 'Zuletzt': 'Recent',
    // Filter / Menüs
    'Anzeigen': 'Show', 'Alle': 'All', 'Zeitraum': 'Time range', 'Jederzeit': 'Any time', 'Letzte 7 Tage': 'Last 7 days', 'Letzte 30 Tage': 'Last 30 days',
    'Tags': 'Tags', 'Nur angeheftete': 'Pinned only', 'Filter zurücksetzen': 'Reset filters', 'Filter': 'Filter', 'Anheften': 'Pin', 'Lösen': 'Unpin',
    'Löschen': 'Delete', 'Wirklich': 'Really', 'löschen': 'delete', 'Abbrechen': 'Cancel', 'Fertig': 'Done', 'Speichern': 'Save', 'Übernehmen': 'Apply',
    'Umbenennen': 'Rename', 'Entfernen': 'Remove', 'Hinzufügen': 'Add', 'hinzufügen': 'add', 'Weiter': 'Next', 'Schließen': 'Close', 'Neu': 'New',
    'Tag bearbeiten': 'Edit tag', 'Noch keine Tags': 'No tags yet', 'Tag suchen oder anlegen': 'Search or create tag', 'Farbe': 'Color', 'Helligkeit': 'Brightness',
    'Icon': 'Icon', 'Name': 'Name', 'Kopieren': 'Copy', 'Teilen': 'Share', 'Neu erzeugen': 'Regenerate',
    // Aufgaben
    'Titel': 'Title', 'Beschreibung hinzufügen': 'Add description', 'Priorität hinzufügen': 'Add priority', 'Tags hinzufügen': 'Add tags', 'Agent auswählen': 'Choose agent',
    'Automatisierung': 'Automation', 'Aufgabe erstellen': 'Create task', 'Priorität': 'Priority', 'Keine': 'None', 'Niedrig': 'Low', 'Mittel': 'Medium', 'Hoch': 'High',
    'Dringend': 'Urgent', 'Fällig': 'Due', 'Heute fällig oder überfällig': 'Due today or overdue', 'In den nächsten 7 Tagen': 'In the next 7 days', 'Ohne Datum': 'No date',
    'Keine offenen Aufgaben': 'No open tasks', 'Erledigt': 'Done', 'Offen': 'Open',
    // Kalender
    'Ganztägig': 'All day', 'Beginn': 'Start', 'Ende': 'End', 'Farbe ändern': 'Change color', 'Icon ändern': 'Change icon', 'Termin': 'Event', 'Neuer Termin': 'New event',
    'Montag': 'Monday', 'Dienstag': 'Tuesday', 'Mittwoch': 'Wednesday', 'Donnerstag': 'Thursday', 'Freitag': 'Friday', 'Samstag': 'Saturday', 'Sonntag': 'Sunday',
    'Mo': 'Mon', 'Di': 'Tue', 'Mi': 'Wed', 'Do': 'Thu', 'Fr': 'Fri', 'Sa': 'Sat', 'So': 'Sun',
    'Januar': 'January', 'Februar': 'February', 'März': 'March', 'April': 'April', 'Mai': 'May', 'Juni': 'June', 'Juli': 'July', 'August': 'August',
    'September': 'September', 'Oktober': 'October', 'November': 'November', 'Dezember': 'December',
    // Dokument
    'Projekt': 'Project', 'Kein Projekt': 'No project', 'Erstellt': 'Created', 'Bearbeitet': 'Edited', 'Umfang': 'Length', 'Abschnitte': 'Sections',
    'Icon hinzufügen': 'Add icon', 'Cover hinzufügen': 'Add cover', 'Unbenannt': 'Untitled', 'Ohne Titel': 'Untitled', 'Darstellung': 'Display', 'Dokument': 'Document',
    'Akzentfarbe': 'Accent color', 'Schrift': 'Font', 'Standard': 'Default', 'Breite': 'Width', 'Normal': 'Normal', 'Breit': 'Wide', 'Kleine Schrift': 'Small text',
    'Infos': 'Info', 'Tabelle unter dem Titel': 'Table below the title', 'Gliederung links': 'Outline on the left', 'Striche zu den Überschriften': 'Marks for the headings',
    'Rechtschreibprüfung': 'Spell check', 'passt sich dem Cover an': 'matches the cover', 'für Haken, Markierungen und Links': 'for checks, highlights and links',
    'Aus Dokument entfernen': 'Remove from document', 'Noch keine Projekte': 'No projects yet', 'Frag etwas zu diesem Dokument …': 'Ask something about this document …',
    // Einstellungen
    'Profil': 'Profile', 'Konto': 'Account', 'Abmelden': 'Sign out', 'Workspaces': 'Workspaces', 'Daten': 'Data', 'Chats und Dokumente': 'Chats and documents',
    'Einstellungen und Aufgaben': 'Settings and tasks', 'Im Konto': 'In account', 'Modus': 'Mode', 'Dunkel': 'Dark', 'Schwarz': 'Black', 'Hell': 'Light',
    'Kacheln im neuen Chat': 'Tiles in new chat', 'Aus': 'Off', 'Leicht': 'Light', 'Stark': 'Strong', 'Sprache': 'Language', 'Verbindung': 'Connection',
    'Verbinden': 'Connect', 'Verbunden': 'Connected', 'Haupt-KI': 'Main AI', 'Ersatz': 'Backup', 'Bild-KI': 'Image AI', 'Rolle': 'Role', 'Schlüssel': 'Keys',
    'mehrere Schlüssel = mehr Gratis-Kontingent': 'more keys = more free quota', 'Neuen Agenten erstellen': 'Create new agent', 'Lernen': 'Learning', 'Research': 'Research',
    'Coden': 'Coding', 'Börse': 'Stocks', 'Personen': 'People', 'Einladen': 'Invite', 'Nicht verfügbar': 'Not available',
    'Wird für alles zuerst genutzt – Antworten, Coden, Agenten, Hintergründe.': 'Used first for everything – answers, coding, agents, backgrounds.',
    'Springt nur ein, wenn die Haupt-KI gerade nicht kann.': 'Only steps in when the main AI is unavailable.', 'Wird nie genutzt.': 'Never used.',
    // Chat
    'Woran arbeiten wir heute?': 'What are we working on today?', 'Schreib dem Agenten …': 'Message the agent …', 'Auto': 'Auto', 'Aufwand': 'Effort', 'Modell': 'Model',
    'Max': 'Max', 'Niedriger Aufwand': 'Low effort', 'Hört zu': 'Listening', 'Spricht': 'Speaking', 'Denkt nach': 'Thinking', 'Antwortet': 'Answering',
    'Weitermachen, wo du aufgehört hast': 'Continue where you left off', 'Keine Termine': 'No events', 'Termine': 'Events', 'Quellen': 'Sources', 'Erklärung': 'Explanation', 'Bestätigen': 'Confirm', 'Überspringen': 'Skip', 'Ins Dokument': 'To document',
  };
  const RULES = [
    [/^Vor (\d+) Min\.$/, '$1 min ago'], [/^Vor (\d+) Std\.$/, '$1 h ago'], [/^Vor (\d+) Tagen$/, '$1 days ago'], [/^(\d+) ausgewählt$/, '$1 selected'],
    [/^noch (\d+) weiterer?$/, '$1 more'], [/^(\d+) Wörter$/, '$1 words'], [/^(\d+) Wort$/, '$1 word'], [/^Farbe für „(.+)“$/, 'Color for “$1”'], [/^(\d+) Schlüssel$/, '$1 keys'],
  ];
  const SKIP = '.msg, .message, .bubble, .dc-content, .dc-title, .dc-sub, [contenteditable="true"], code, pre, .tab-title, .lb2-title, .sb-chat-t, .cl-title, .chat-title, .hm-title, script, style, svg, .cbx, iframe';
  const tr = (s) => {
    const t = s.trim(); if (!t) return null;
    if (D[t]) return s.replace(t, D[t]);
    for (const [re, to] of RULES) if (re.test(t)) return s.replace(t, t.replace(re, to));
    return null;
  };
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  function walk(root) {
    if (!root || root.nodeType === 3) { if (root?.parentElement && !root.parentElement.closest(SKIP)) { const v = tr(root.nodeValue); if (v != null && v !== root.nodeValue) root.nodeValue = v; } return; }
    if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
    ATTRS.forEach((a) => { const v = root.getAttribute?.(a); if (v) { const n = tr(v); if (n != null && n !== v) root.setAttribute(a, n); } });
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      if (n.nodeType === 3) { const v = tr(n.nodeValue); if (v != null && v !== n.nodeValue) n.nodeValue = v; }
      else ATTRS.forEach((a) => { const v = n.getAttribute(a); if (v) { const x = tr(v); if (x != null && x !== v) n.setAttribute(a, x); } });
    }
  }
  let obs = null, queued = new Set(), raf = 0;
  function start() {
    document.documentElement.lang = 'en';
    walk(document.body);
    obs = new MutationObserver((list) => {
      list.forEach((m) => { if (m.type === 'characterData') queued.add(m.target); else if (m.type === 'attributes') queued.add(m.target); else m.addedNodes.forEach((n) => queued.add(n)); });
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; const q = [...queued]; queued.clear(); obs.disconnect(); q.forEach((n) => { if (n.isConnected) walk(n); }); obs.observe(document.body, OPTS); });
    });
    obs.observe(document.body, OPTS);
  }
  const OPTS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
  window.I18n = {
    lang,
    t: (s) => (lang() === 'en' ? (tr(s) ?? s) : s),
    set(l) {
      const next = l === 'en' ? 'en' : 'de'; if (next === lang()) return;
      try { localStorage.setItem(KEY, next); } catch {}
      if (next === 'en') start(); else location.reload();
    },
  };
  if (lang() === 'en') { if (document.body) start(); else addEventListener('DOMContentLoaded', start); }
})();
