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
  // ===== Erweiterung 10.11. abends: alles, was die App selbst anzeigt (Meldungen, Fenster, Zeitleiste, Lernsets, Dokumente …) =====
  const D2 = {
    // Löschen/Bestätigen
    'Wirklich löschen?': 'Really delete?', 'Wirklich löschen': 'Really delete', 'Wirklich?': 'Really?', 'Löschen?': 'Delete?', 'Wirklich abgeben': 'Really submit',
    'Rückgängig': 'Undo', 'Rückgängig (Strg+Z)': 'Undo (Ctrl+Z)', 'Rückgängig gemacht': 'Undone', 'Bearbeiten': 'Edit', 'Auswählen': 'Select', 'Mehr': 'More',
    'Ausblenden': 'Hide', 'Neu laden': 'Reload', 'Neu starten': 'Restart', 'Neu zeichnen': 'Redraw', 'Neu generieren': 'Regenerate', 'Prüfen': 'Check',
    // Chat
    'Chat': 'Chat', 'Nachricht kopieren': 'Copy message', 'Antwort kopieren': 'Copy answer', 'Antwort neu erzeugen': 'Regenerate answer', 'Antwort stoppen': 'Stop answer',
    'Ins Dokument übernehmen': 'Add to document', 'Antwort als Dokument speichern': 'Save answer as document', 'Als Text kopieren': 'Copy as text',
    'Mehr anzeigen': 'Show more', 'Weniger anzeigen': 'Show less', 'Quellen anzeigen': 'Show sources', 'Alle Quellen anzeigen': 'Show all sources',
    'Suchanfragen und Quellen anzeigen': 'Show searches and sources', 'Quelle': 'Source', 'Gespräch anzeigen': 'Show conversation', 'Fragen in diesem Chat': 'Questions in this chat',
    'Chat umbenennen': 'Rename chat', 'Neuer Agent': 'New agent', 'Neuer Tab': 'New tab', 'Agent': 'Agent', 'Agent aktiv': 'Agent active', 'Agent beenden': 'Stop agent',
    'Agenten anzeigen': 'Show agents', 'Modell wählen': 'Choose model', 'Foto hinzufügen': 'Add photo', 'Vorheriges Bild': 'Previous image', 'Nächstes Bild': 'Next image',
    'Suchen (⌘K)': 'Search (⌘K)', 'Sidebar ein-/ausklappen': 'Toggle sidebar', 'Sidebar ein-/ausklappen (Strg+B / ⌘B)': 'Toggle sidebar (Ctrl+B / ⌘B)', 'Player ein-/ausblenden': 'Show/hide player',
    'Suchen oder Aktion …': 'Search or action …', 'Aktionen': 'Actions', 'Gehe zu': 'Go to', 'Empfehlung ausblenden': 'Hide suggestion', 'Wechseln': 'Switch',
    'Passt besser zu': 'Better suited for', '– soll ich wechseln und die Frage dort stellen?': '– shall I switch and ask the question there?', 'Dafür ist': 'This is for',
    'Einen Moment – die Datei wird noch gelesen': 'One moment – the file is still being read', 'Anhängen geht mit Fotos, PDFs und GoodNotes-Dateien': 'You can attach photos, PDFs and GoodNotes files',
    'Seite': 'Page', 'Seiten': 'Pages', 'Seiten gelesen': 'pages read', 'Konnte nicht gelesen werden': 'Could not be read', 'Fehler': 'Error', 'PDF entfernen': 'Remove PDF',
    'Foto entfernen': 'Remove photo', 'weitere Dateien anzeigen': 'show more files', 'Datei': 'File', 'Kein Mikrofon-Zugriff – im Browser erlauben': 'No microphone access – allow it in the browser',
    'Wird geöffnet …': 'Opening …', 'Konnte nicht geöffnet werden': 'Could not be opened', 'Nur auf dem Gerät verfügbar, auf dem es angehängt wurde': 'Only available on the device it was attached on',
    'Wird gelesen': 'Reading', 'Noch kein API-Key verbunden': 'No API key connected yet', 'Zu den Einstellungen': 'Go to settings', 'Die Modelle sind gerade überlastet': 'The models are overloaded right now',
    'Das hat gerade nicht geklappt': "That didn't work just now", 'Gerade fragen sehr viele gleichzeitig an – das liegt nicht an dir. In ein paar Sekunden klappt es meistens wieder.': "Lots of people are asking at once – it's not you. It usually works again in a few seconds.",
    'Unbekannter Fehler': 'Unknown error', 'Die Anfrage ist zu groß (zu viele oder zu große Dateien). Bitte weniger anhängen.': 'The request is too large (too many or too big files). Please attach less.',
    'Gemini hat zwei Minuten lang nicht geantwortet – die Anfrage wurde abgebrochen. Bitte nochmal senden.': "Gemini didn't respond for two minutes – the request was cancelled. Please send again.",
    'Die KI hat gerade nicht geantwortet.': "The AI didn't respond just now.", 'Die KI ist gerade nicht erreichbar.': 'The AI is unavailable right now.', '(keine Antwort)': '(no answer)',
    'Nachricht konnte nicht gezeigt werden': "Message couldn't be shown", 'Deine Chats laden gerade nicht – neue Chats werden trotzdem gespeichert': "Your chats aren't loading right now – new chats are still saved",
    'Chat konnte nicht geladen werden': "Chat couldn't be loaded", 'Chats laden': 'Loading chats', 'Chat konnte nicht ergänzt werden': "Chat couldn't be updated", 'Noch leer': 'Still empty',
    'Noch nichts passiert.': 'Nothing has happened yet.', 'Antwort wird geschrieben …': 'Writing answer …', 'Chat nicht mehr da': 'Chat no longer exists',
    'Spracherkennung wird von diesem Browser nicht unterstützt – bitte Chrome, Edge oder Safari nutzen.': 'Speech recognition is not supported by this browser – please use Chrome, Edge or Safari.',
    'Mikrofon nicht erlaubt – bitte im Browser freigeben.': 'Microphone not allowed – please enable it in the browser.', 'Deine Fokuszeit ist um. Gönn dir eine kurze Pause.': 'Your focus time is up. Take a short break.',
    // Rückfragen
    'Wartet auf deine Antwort': 'Waiting for your answer', 'Rückfragen der KI': 'Questions from the AI', 'Frage übersprungen': 'Question skipped', 'Übersprungen – entscheide selbst': 'Skipped – decide yourself',
    'Rückfrage': 'Question', 'Oder eigene Antwort schreiben': 'Or write your own answer', 'Deine Antwort…': 'Your answer…', 'Deine Antwort': 'Your answer', 'Antwort einsprechen': 'Speak your answer',
    'Die KI entscheidet diesen Punkt selbst': 'The AI decides this itself', 'Übersprungen – KI entscheidet': 'Skipped – AI decides', 'keine Angabe': 'not specified', 'Frage': 'Question', 'Fragen': 'Questions',
    // Zeitleiste (Hauptstatus + Schritte)
    'Verstehen': 'Understanding', 'Nachdenken': 'Thinking', 'Recherchieren': 'Researching', 'Kochen': 'Cooking', 'Arbeiten': 'Working', 'Analysieren': 'Analyzing',
    'Malen': 'Painting', 'Kontext prüfen': 'Checking context', 'Recherche planen': 'Planning research', 'Informationen sammeln': 'Gathering information', 'Gegenprüfen': 'Cross-checking',
    'Zusammenführen': 'Combining', 'Marktrecherche': 'Market research', 'Chartanalyse': 'Chart analysis', 'Kurscharts': 'Price charts', 'Depot-Analyse': 'Portfolio analysis',
    'Fundamentalanalyse': 'Fundamental analysis', 'Chancen-Analyse': 'Opportunity analysis', 'Risiko-Analyse': 'Risk analysis',
    'Anfrage wird gelesen': 'Reading request', 'Anfrage verstehen': 'Understanding request', 'Anforderungen klären': 'Clarifying requirements', 'Quellen suchen': 'Searching sources',
    'Quellen analysieren': 'Analyzing sources', 'Quellen analysiert': 'Sources analyzed', 'Antwort vorbereiten': 'Preparing answer', 'Richtigkeit prüfen': 'Checking accuracy',
    'Bilder und Beispiele suchen': 'Searching images and examples', 'Antwort fertig': 'Answer done', 'Frage analysieren': 'Analyzing question', 'Lernziel verstehen': 'Understanding learning goal',
    'Lernquellen suchen': 'Searching learning sources', 'Fachwissen prüfen': 'Checking subject knowledge', 'Erklärung gliedern': 'Structuring explanation', 'Antwort ausarbeiten': 'Working out answer',
    'Erklärung fertig': 'Explanation done', 'Im Web suchen': 'Searching the web', 'Passende Quellen finden': 'Finding suitable sources', 'Quellen vergleichen': 'Comparing sources',
    'Glaubwürdigkeit prüfen': 'Checking credibility', 'Angaben prüfen': 'Checking details', 'Quellen und Ergebnisse prüfen': 'Checking sources and results', 'Bericht fertig': 'Report done',
    'Bericht gliedern': 'Structuring report', 'Deine Käufe auslesen': 'Reading your purchases', 'Kurse laden': 'Loading prices', 'Marktlage prüfen': 'Checking market', 'Finanznachrichten suchen': 'Searching financial news',
    'Finanznachrichten lesen': 'Reading financial news', 'Kursverläufe analysieren': 'Analyzing price history', 'Kennzahlen prüfen': 'Checking key figures', 'Chancen suchen': 'Looking for opportunities',
    'Einschätzung schreiben': 'Writing assessment', 'Daten prüfen': 'Checking data', 'Analyse fertig': 'Analysis done', 'Projekt fertig': 'Project done', 'Dokumente analysieren': 'Analyzing documents',
    'Informationen auswerten': 'Evaluating information', 'Erkenntnisse verbinden': 'Connecting insights', 'Ergebnisse verbinden': 'Connecting results', 'Markt-Erkenntnisse verbinden': 'Connecting market insights',
    'Code schreiben': 'Writing code', 'Vorgehen planen': 'Planning approach', 'Umfang festlegen': 'Defining scope', 'Wichtige Ergebnisse sammeln': 'Collecting key results', 'Risiko bewerten': 'Assessing risk',
    'Depot analysieren': 'Analyzing portfolio', 'Depot ansehen': 'Viewing portfolio', 'Ins Depot eintragen': 'Adding to portfolio', 'Aufteilung analysieren': 'Analyzing allocation', 'Illustration zeichnen': 'Drawing illustration',
    'Bild erzeugen': 'Generating image', 'Bild erstellen': 'Create image', 'Kurse prüfen': 'Checking prices', 'Antwort entwerfen': 'Drafting answer', 'Fakten und Quellen prüfen': 'Checking facts and sources',
    'Bild suchen': 'Searching image', 'Bild gefunden': 'Image found', 'Bild erzeugt': 'Image generated', 'Bild': 'Image', 'Passendes Bild suchen': 'Searching a fitting image', 'Fertig gedacht': 'Done thinking',
    'Überarbeitung nicht möglich – geprüfter Entwurf': 'Revision not possible – checked draft', '· nicht verfügbar': '· not available', '· keine passenden Quellen': '· no suitable sources',
    'nur eine Quelle': 'only one source', 'nichts Neues': 'nothing new', 'gerade keine': 'none right now', '· Kurse gerade nicht erreichbar': '· prices unavailable right now',
    'Was soll die Mini-App können?': 'What should the mini app do?', 'Aufbau und Bedienung planen': 'Planning layout and controls', 'Aktuelle Infos suchen': 'Searching current info', 'Code prüfen': 'Checking code',
    'Mini-App fertig': 'Mini app done', 'Präsentation': 'Presentation', 'Präsentation erstellt': 'Presentation created', 'Ziel der Präsentation festlegen': 'Defining presentation goal',
    'Quellen für die Folien suchen': 'Searching sources for slides', 'Fakten für die Folien sammeln': 'Collecting facts for slides', 'Inhalte für die Folien auswählen': 'Choosing slide content',
    'Präsentation erstellen': 'Creating presentation', 'Folien prüfen': 'Checking slides', 'Präsentation fertig': 'Presentation done', 'Hauptäste finden': 'Finding main branches',
    'Ideen zu Ästen ordnen': 'Sorting ideas into branches', 'Fakten für die Äste suchen': 'Searching facts for branches', 'Fakten den Ästen zuordnen': 'Assigning facts to branches',
    'Äste und Details anordnen': 'Arranging branches and details', 'Mindmap fertig': 'Mind map done', 'Wichtige Ereignisse wählen': 'Choosing key events', 'Daten und Ereignisse suchen': 'Searching dates and events',
    'Daten und Fakten sammeln': 'Collecting dates and facts', 'Daten und Reihenfolge prüfen': 'Checking dates and order', 'Zeitstrahl fertig': 'Timeline done', 'Daten auswählen': 'Choosing data',
    'Werte auswählen': 'Choosing values', 'Zahlen prüfen': 'Checking numbers', 'Aktuelle Zahlen suchen': 'Searching current figures', 'Diagramm fertig': 'Chart done', 'Quiz erstellt': 'Quiz created',
    'Übungsziel festlegen': 'Defining practice goal', 'Wichtige Begriffe wählen': 'Choosing key terms', 'Quiz erstellen': 'Creating quiz', 'Quiz fertig': 'Quiz done', 'Kriterien wählen': 'Choosing criteria',
    'Unterschiede abwägen': 'Weighing differences', 'Tabelle füllen': 'Filling table', 'Vergleich fertig': 'Comparison done', 'Schritt für Schritt lösen': 'Solving step by step', 'Hefteintrag fertig': 'Notebook entry done',
    'Antwort wird gesprochen': 'Speaking answer', 'Passendes Bild suchen …': 'Searching a fitting image …',
    // Bilder/Grafiken
    'Das Bild konnte gerade nicht erstellt werden': "The image couldn't be created right now", 'Das Bildmodell ist ausgelastet oder nicht erreichbar.': 'The image model is busy or unavailable.',
    'Bild nicht verfügbar': 'Image not available', 'Bildquelle ungültig': 'Invalid image source', 'Bildformat ungültig': 'Invalid image format', 'Dein Bild-Limit': 'Your image limit',
    'Diagramm konnte nicht dargestellt werden.': "Chart couldn't be displayed.", 'Grafik konnte nicht dargestellt werden.': "Graphic couldn't be displayed.", 'Bild fertig': 'Image done',
    'Kein Bild': 'No image', 'Bild nicht lesbar': 'Image not readable', 'Bild konnte nicht gelesen werden': "Image couldn't be read", 'Bild hochladen': 'Upload image', 'Mit KI erstellen': 'Create with AI',
    'Eigenes Bild': 'Own image', 'Bild entfernen': 'Remove image', 'Eigenes Bild entfernen': 'Remove own image', 'Foto als Vorlage hinzufügen': 'Add photo as reference', 'Das Cover konnte gerade nicht erstellt werden.': "The cover couldn't be created right now.",
    'Bild hinzufügen': 'Add image', 'Bilder hinzufügen': 'Add images', 'Bild löschen': 'Delete image', 'Grafik löschen': 'Delete graphic', 'Großes Bild': 'Large image', 'kein Foto': 'no photo',
    // Dokumente
    'Dokument erstellt': 'Document created', 'Dokument aktualisiert': 'Document updated', 'Dokument gelöscht': 'Document deleted', 'Das Dokument gibt es nicht mehr.': 'This document no longer exists.',
    'Dieses Dokument gibt es nicht mehr.': 'This document no longer exists.', 'Kein Dokument erstellt.': 'No document created.', 'Wird geschrieben …': 'Writing …', 'Wird bearbeitet …': 'Editing …',
    'Wird erstellt …': 'Creating …', 'Hat nicht geklappt.': "Didn't work.", 'Hat nicht geklappt': "Didn't work", 'Das hat nicht geklappt.': "That didn't work.",
    'Titel und Beschreibung vorschlagen': 'Suggest title and description', 'Deine Dokumente laden gerade nicht – neue werden trotzdem gespeichert': "Your documents aren't loading right now – new ones are still saved",
    'Breite des Seitenfensters ändern': 'Change side panel width', 'Ziehen zum Verbreitern': 'Drag to widen', 'Änderung wird vorbereitet …': 'Preparing change …', 'Änderung am Dokument': 'Change to document',
    'Änderung übernommen': 'Change applied', 'Änderung abgelehnt': 'Change rejected', 'Änderung hat nicht geklappt': "Change didn't work", 'Der neue Text wird geschrieben …': 'Writing new text …',
    'Wieder übernehmen': 'Apply again', 'In diesem Dokument': 'In this document', 'Noch keine Chats zu diesem Dokument': 'No chats for this document yet', 'Text eingefügt': 'Text inserted',
    'Abschnitt gelöscht': 'Section deleted', 'Titel geändert': 'Title changed', 'Einstellungen des Dokuments': 'Document settings', 'Seitenfenster rechts ein-/ausklappen': 'Toggle right panel',
    'Projekt suchen oder anlegen': 'Search or create project', 'Abschnitt ein-/ausklappen': 'Toggle section', 'Ein-/ausklappen': 'Toggle', 'Überschriften in diesem Dokument': 'Headings in this document',
    'Tag hinzufügen': 'Add tag', 'Gefüllt': 'Filled', 'Linie': 'Line', 'Icon wählen': 'Choose icon', 'Überschrift': 'Heading', 'Noch kein Text in diesem Abschnitt': 'No text in this section yet',
    'KI fragen': 'Ask AI', 'Frag die KI': 'Ask the AI', 'Dokument suchen …': 'Search document …', 'Dokument suchen': 'Search document', 'Kein Dokument gefunden': 'No document found', 'Dokument öffnen': 'Open document',
    'In bestehendes Dokument übernehmen': 'Add to existing document', 'Dokument erstellen': 'Create document', 'Basis-Blöcke': 'Basic blocks', 'Überschrift 1': 'Heading 1', 'Überschrift 2': 'Heading 2',
    'Überschrift 3': 'Heading 3', 'Überschrift 4': 'Heading 4', 'Aufzählung': 'Bulleted list', 'Seite verlinken': 'Link page', 'Säulendiagramm': 'Column chart', 'Säulen': 'Columns',
    'Titel hinzufügen': 'Add title', 'Titel anzeigen': 'Show title', 'Block entfernen': 'Remove block', 'Reihe entfernen': 'Remove series', 'Datenreihe hinzufügen': 'Add data series',
    'Diagramm bearbeiten': 'Edit chart', 'Aufgabe hinzufügen …': 'Add task …', 'Eintrag hinzufügen': 'Add entry', 'Kachel hinzufügen': 'Add tile', 'Aufgaben-Board konnte nicht geladen werden.': "Task board couldn't be loaded.",
    'Bild hochladen, hierher ziehen oder Link einfügen': 'Upload an image, drag it here or paste a link', 'YouTube- oder Vimeo-Link einfügen oder Video hochladen (bis 20 MB)': 'Paste a YouTube or Vimeo link or upload a video (up to 20 MB)',
    'Audiodatei hochladen (bis 15 MB) oder Link einfügen': 'Upload an audio file (up to 15 MB) or paste a link', 'Link zu einer Website einfügen': 'Paste a link to a website',
    'Karte konnte nicht geladen werden (keine Verbindung?)': "Map couldn't be loaded (no connection?)", 'Karte braucht WebGL – im Browser nicht verfügbar.': 'The map needs WebGL – not available in this browser.',
    'Markierung entfernen': 'Remove marker', 'Markierung bearbeiten': 'Edit marker', 'Farbe und Form': 'Color and shape', 'Block konnte nicht dargestellt werden.': "Block couldn't be displayed.", 'Block-Menü': 'Block menu',
    'Zeile hinzufügen': 'Add row', 'Spalte hinzufügen': 'Add column', 'Zeile löschen': 'Delete row', 'Spalte löschen': 'Delete column', 'Ganzes Dashboard löschen': 'Delete whole dashboard',
    'Icon entfernen': 'Remove icon', 'Schreibe zum Suchen': 'Type to search', 'Datei konnte nicht gelesen werden': "File couldn't be read", 'Wörter': 'words', 'Bänder': 'Ribbons', 'Bögen': 'Arcs',
    'Dünen': 'Dunes', 'Wüste': 'Desert', 'Dämmerung': 'Dusk', 'Höhen Blau': 'Heights blue', 'Höhen Grün': 'Heights green', 'Höhen Rosa': 'Heights pink', 'Grün': 'Green', 'Weiß': 'White', 'Türkis': 'Turquoise',
    'Lernset konnte nicht gelesen werden.': "Study set couldn't be read.", 'Noch keine Kommentare': 'No comments yet', 'Keine Dokumente': 'No documents', 'Website hinzufügen': 'Add website',
    // Aufgaben / Kalender
    'Morgen': 'Tomorrow', 'Täglich': 'Daily', 'Täglich um': 'Daily at', 'Keine Aufgabe passt zum Filter.': 'No task matches the filter.', 'Neue Aufgaben legst du oben rechts an.': 'Create new tasks at the top right.',
    'Keine Priorität': 'No priority', 'Tag suchen oder neu': 'Search or new tag', 'Ohne Agent': 'No agent', 'Ergebnis als Chat': 'Result as chat', 'Ergebnis als Dokument': 'Result as document',
    'Aufgabe': 'Task', 'Vorheriger Monat': 'Previous month', 'Nächster Monat': 'Next month', 'Voriger Monat': 'Previous month', 'Vorheriger Tag': 'Previous day', 'Nächster Tag': 'Next day', '· Heute': '· Today',
    'ganztägig': 'all day', 'Läuft gerade': 'Running now', 'Morgen fällig': 'Due tomorrow', 'Übermorgen fällig': 'Due the day after tomorrow', 'Noch Zeit zum Vorbereiten': 'Still time to prepare',
    'Aufgaben für heute': 'Tasks for today', 'überfällig': 'overdue', 'Heute fällig': 'Due today', 'Eine Sache steht noch an': 'One thing is still pending', 'Tage': 'Days',
    'Diese Woche': 'This week', 'Termin erstellen': 'Create event', 'Zeit bearbeiten': 'Edit time', 'Titel, z. B. Prüfung Biologie': 'Title, e.g. Biology exam', 'Letztes Jahr': 'Last year',
    'Woche': 'Week', 'Monat': 'Month', '1 Woche': '1 week', '1 Monat': '1 month', '1 Jahr': '1 year', 'Monatsansicht': 'Month view',
    // Einstellungen / Workspaces
    'Glas': 'Glass', 'Ein Schlüssel ist auf dem Server hinterlegt.': 'A key is stored on the server.', 'Noch kein Schlüssel – bis dahin übernimmt die nächste.': 'No key yet – the next one takes over until then.',
    'Symbol ändern': 'Change symbol', 'Dein erster Workspace bleibt privat. Zum Teilen legst du einen weiteren an.': 'Your first workspace stays private. Create another one to share.',
    'Noch nichts gespeichert.': 'Nothing saved yet.', 'Gespeichert': 'Saved', 'Nur eigene Workspaces kannst du teilen.': 'You can only share your own workspaces.', 'Höchstens 3 Workspaces': 'At most 3 workspaces',
    'Eigener Agent': 'Custom agent', 'Neuen Agenten erstellen': 'Create new agent', 'Eigenen Agenten erstellen – Schritt für Schritt im Gespräch, mit eigenem Pixel-Profilbild.': 'Create your own agent – step by step in conversation, with its own pixel avatar.',
    'Agent wird zusammengestellt': 'Assembling agent', 'Der Agent stützt sich auf diese Dateien.': 'The agent relies on these files.', 'Skript, Mitschrift oder Vokabelliste – der Agent nutzt sie als Grundlage.': 'Script, notes or vocabulary list – the agent uses them as a basis.',
    'Wissen ist voll (höchstens ~80 000 Zeichen)': 'Knowledge is full (at most ~80,000 characters)', 'Chat starten': 'Start chat', 'Im Chat bearbeiten': 'Edit in chat', 'Dein Agent': 'Your agent',
    'Beschreib, wobei dein Agent helfen soll …': 'Describe what your agent should help with …', 'Das Bild konnte gerade nicht erzeugt werden.': "The image couldn't be generated right now.",
    'Das Bild konnte gerade nicht gezeichnet werden.': "The image couldn't be drawn right now.", 'Fehler beim Zeichnen.': 'Error while drawing.', 'Im Bild war keine Figur zu erkennen.': 'No figure could be recognized in the image.',
    'Keine Animation': 'No animation', 'Sucht mit Lupe': 'Searches with magnifier', 'So im Chat': 'Like this in chat', 'Bär': 'Bear',
    'Für alles – fragt nach, erklärt, recherchiert, schreibt und programmiert.': 'For everything – asks, explains, researches, writes and codes.',
    'Recherchiert gründlich – nur auf vertrauenswürdigen Seiten.': 'Researches thoroughly – only on trustworthy sites.', 'Erklärt Schulstoff verständlich, auch mit deinem Material.': 'Explains school topics clearly, also with your material.',
    'Baut ganze Projekte – Spiele, Websites, Tools – mit Code-Fenster und Vorschau.': 'Builds whole projects – games, websites, tools – with code window and preview.',
    'Nur Aktien: Echtzeitkurse, Charts, Chancen-Radar – wann rein, wann raus fürs Planspiel Börse.': 'Stocks only: live prices, charts, opportunity radar – when to buy and sell for the stock market game.',
    'Eigenes Wissen und Unterrichtsmaterial': 'Own knowledge and class material',
    // Lernsets
    'Karteikarten': 'Flashcards', 'Quiz': 'Quiz', 'Quiz starten': 'Start quiz', 'Klausur schreiben': 'Take exam', 'Lückentext': 'Fill in the blanks', 'Offene Fragen': 'Open questions',
    'Ergänze die Lücken.': 'Fill in the blanks.', 'Karteikarten schreiben': 'Writing flashcards', 'Fragen schreiben': 'Writing questions', 'Das Lernset konnte nicht erstellt werden – bitte noch einmal versuchen.': "The study set couldn't be created – please try again.",
    'Übersicht: gewusst und nicht gewusst': 'Overview: known and not known', 'Nicht gewusst': 'Not known', 'Gewusst': 'Known', 'Unsicher': 'Unsure', 'Nächste Frage wird erstellt': 'Creating next question',
    'Musterlösung': 'Model answer', 'Hattest du das?': 'Did you have that?', '1 falsche Antwort ansehen': 'View 1 wrong answer', 'ungenügend': 'insufficient', 'noch offen': 'still open', 'Noch offen': 'Still open',
    'Wird korrigiert …': 'Grading …', 'Konnte gerade nicht automatisch bewertet werden – vergleiche mit der Musterlösung.': "Couldn't be graded automatically – compare with the model answer.",
    'Verstehen und Anwenden': 'Understanding and applying', 'Lernset erstellen': 'Create study set', 'Quellen hinzufügen': 'Add sources', 'Alle Aufgabentypen': 'All task types', 'Ergebnis': 'Result',
    'Abgeben': 'Submit', 'Klausur starten': 'Start exam', 'Mischen': 'Shuffle', 'Probeklausur': 'Practice exam',
    'Folien mit Bildern und Quellen – als PowerPoint, Keynote oder PDF': 'Slides with images and sources – as PowerPoint, Keynote or PDF', 'Zahlen als Diagramme mit kurzer Einordnung': 'Numbers as charts with a short explanation',
    'Lernkarten zum Umdrehen und Selbst-Bewerten': 'Cards to flip and self-assess', 'Fragen mit Auswertung und Erklärungen': 'Questions with evaluation and explanations',
    'Klausur mit Zeit, strenger Korrektur und Notenpunkten': 'Exam with time limit, strict grading and points', 'Thema als Baum mit Ästen und Stichworten': 'Topic as a tree with branches and keywords',
    'Text klingt natürlich und menschlich – nicht nach KI': 'Text sounds natural and human – not like AI', 'Kompakte Zusammenfassung mit allem Klausurrelevanten': 'Compact summary with everything relevant for the exam',
    'Lösung sauber so, wie sie ins Heft gehört': 'Clean solution, the way it belongs in your notebook', 'Gründlich mit mehreren Fachquellen und Belegen': 'Thorough, with several subject sources and citations',
    // Präsentation / Podcast / Musik / Timer
    'Vielen Dank für eure Aufmerksamkeit!': 'Thank you for your attention!', 'Fragen?': 'Questions?', 'Das Wichtigste': 'Key points', 'Präsentation wird gestaltet': 'Designing presentation',
    'Im Teilen-Menü „Keynote“ wählen': 'Choose “Keynote” in the share menu', 'Präsentation bearbeiten': 'Edit presentation', 'Punkte der Gliederung (je Zeile einer)': 'Outline points (one per line)',
    'Zahlen (je Zeile „Wert | Erklärung“)': 'Numbers (one “value | explanation” per line)', 'Quellen (je Zeile eine)': 'Sources (one per line)', 'Kernaussagen (je Zeile eine)': 'Key statements (one per line)',
    'Stichpunkte (je Zeile einer, **fett** möglich)': 'Bullet points (one per line, **bold** possible)', 'Neue Folie': 'New slide', 'Kräftig': 'Bold',
    'Nächster Beitrag': 'Next segment', 'Frage an den Podcast': 'Question for the podcast', 'kein Ton': 'no sound', 'Wird vertont …': 'Generating audio …', 'Lädt …': 'Loading …', 'Keine Stimme verfügbar': 'No voice available',
    'Die beiden antworten …': 'The two are answering …', 'Gerade keine Antwort – nochmal versuchen': 'No answer right now – try again', 'Skript wird geschrieben': 'Writing script', 'Beiträge': 'Segments', 'Mitreden': 'Join in',
    'Nicht mit Spotify verbunden': 'Not connected to Spotify', 'Spotify erlaubt das nur mit Premium.': 'Spotify only allows this with Premium.', 'Spotify: Für das Abspielen im Browser ist Spotify Premium nötig.': 'Spotify: Playing in the browser requires Spotify Premium.',
    'Spotify: Bitte neu verbinden.': 'Spotify: Please reconnect.', 'Spotify-Player konnte nicht gestartet werden': "Spotify player couldn't be started", 'Musik direkt hier abspielen (Spotify Premium nötig)': 'Play music right here (Spotify Premium required)',
    'Song suchen': 'Search song', 'Lautstärke': 'Volume', 'Keine Treffer': 'No results', 'Keine Playlists gefunden': 'No playlists found', 'Nächster Song.': 'Next song.',
    'Alle beenden': 'Stop all', 'Es läuft gerade kein Timer.': 'No timer is running.', 'Alle Timer beendet.': 'All timers stopped.', 'Weiter geht’s.': "Let's go on.", 'Noch weniger als eine Minute.': 'Less than a minute left.',
    'Wie lange soll der Timer laufen?': 'How long should the timer run?', 'Er läuft zusätzlich.': 'It runs in addition.',
    // Börse
    'Noch keine Käufe.': 'No purchases yet.', 'Kauf fehlt noch': 'Purchase missing', 'Gerade keine offenen Positionen.': 'No open positions right now.', 'Gerade nicht erreichbar': 'Unavailable right now',
    'Bitte eine Aktie aus der Liste wählen.': 'Please choose a stock from the list.', 'Wie viele Stück?': 'How many shares?', 'Wird hinzugefügt …': 'Adding …', 'Nicht kaufen': "Don't buy",
    'Gerade erfüllt kein Wert alle Bedingungen – heute lieber abwarten.': 'No stock meets all conditions right now – better wait today.', 'keine Kursdaten': 'no price data', 'Heute · Prognose': 'Today · Forecast',
    'Mein Depot': 'My portfolio', 'Kaufen': 'Buy', 'Verkaufen': 'Sell', 'Beobachten': 'Watch', 'Halten': 'Hold', 'Einstieg': 'Entry', 'Ziel': 'Target', 'Stopp': 'Stop',
    'Das könnte dich interessieren': 'You might be interested in', 'Ungewöhnlich starker Anstieg': 'Unusually strong rise', 'Ungewöhnlich starker Rückgang – lohnt ein Blick': 'Unusually strong drop – worth a look',
    'Starker Rückgang mit Erholungschance': 'Strong drop with recovery potential', 'Der Radar zeigt': 'The radar shows',
    // Mini-Apps / Code
    'Zu groß zum Speichern.': 'Too large to save.', 'Speicher ist voll – lösch ältere Mini-Apps.': 'Storage is full – delete older mini apps.', 'Fehler gefunden – wird behoben': 'Error found – fixing',
    'Code anzeigen': 'Show code', 'Gespeichert – antippen zum Entfernen': 'Saved – tap to remove', 'Angehalten, damit die App flüssig bleibt': 'Paused to keep the app smooth', 'Hing fest und wurde beendet': 'Got stuck and was stopped',
    'Die Mini-App hat nicht mehr reagiert (Endlosschleife?).': 'The mini app stopped responding (infinite loop?).', 'Gespeichert – zu finden unter Einstellungen → Gespeichert': 'Saved – find it under Settings → Saved',
    'Wähle oben eine oder mehrere Mini-Apps.': 'Choose one or more mini apps above.', 'Eigener Hintergrund gespeichert und aktiv': 'Custom background saved and active', 'Schrift der Mini-Apps': 'Mini app font',
    'Fläche der Mini-Apps': 'Mini app surface', 'Stilwunsch gelöscht': 'Style wish deleted', 'Einstellung übernommen': 'Setting applied', 'konnte nicht eingetragen werden': "couldn't be added",
    'Bild angesehen': 'Viewed image', 'Datei gelesen': 'Read file', 'Laufzeitfehler – wird behoben': 'Runtime error – fixing', 'Code geprüft': 'Code checked', 'Ändert Dateien…': 'Changing files…', 'Dateien geändert': 'Files changed',
    'Code-Fenster ein-/ausklappen': 'Toggle code window', 'Breite des Code-Fensters ändern': 'Change code window width', 'Ziehen: Breite ändern · Doppelklick: Standard': 'Drag: change width · Double-click: default',
    'Alle Dateien': 'All files', 'Code-Fenster schließen': 'Close code window', 'Der Agent programmiert noch – gleich fertig': 'The agent is still coding – almost done', 'keine HTML-Datei': 'no HTML file',
    'Keine HTML-Datei – für dieses Projekt gibt es keine Vorschau.': 'No HTML file – there is no preview for this project.', 'Speicher voll – lösch einen Hintergrund.': 'Storage full – delete a background.',
    'Video ist zu groß (höchstens 60 MB).': 'Video is too large (at most 60 MB).', 'Video konnte nicht gespeichert werden.': "Video couldn't be saved.", 'Wird vorerst nur angezeigt, nicht ausgeführt': 'Only shown for now, not executed',
    'Programmieren': 'Coding', 'Vorschau': 'Preview',
    // Aufwand / Modelle
    'Schnell': 'Fast', 'Sehr hoch': 'Very high', 'Hinzufügen …': 'Add …', 'Anhängen': 'Attach', 'Diktieren': 'Dictate', 'Sprachmodus': 'Voice mode', 'Senden': 'Send', 'Stopp': 'Stop',
    'Tab schließen': 'Close tab', 'Eigene Farbe': 'Custom color', 'Eigene Akzentfarbe': 'Custom accent color', 'den markierten Text zu …': 'turn the selected text into …',
    'Tippe an einer Mini-App im Chat auf das Lesezeichen oder sag der KI „speicher das“.': 'Tap the bookmark on a mini app in the chat or tell the AI “save this”.',
  };
  Object.assign(D, D2);
  // Teilstücke in zusammengesetzten Texten (Zahlen, Namen davor/danach): längste zuerst ersetzen – nur außerhalb von Nutzer-/KI-Inhalten
  const PHRASES = Object.keys(D).filter((k) => k.length >= 6 && /\s/.test(k)).sort((a, b) => b.length - a.length);
  const RULES = [
    [/^Vor (\d+) Min\.$/, '$1 min ago'], [/^Vor (\d+) Std\.$/, '$1 h ago'], [/^Vor (\d+) Tagen$/, '$1 days ago'], [/^(\d+) ausgewählt$/, '$1 selected'],
    [/^(\d+) Seiten? gelesen$/, '$1 pages read'], [/^· (\d+)\/(\d+) Seiten?$/, '· $1/$2 pages'], [/^· (\d+) Seiten?$/, '· $1 pages'], [/^(\d+) Seiten?$/, '$1 pages'],
    [/^Frage (\d+) von (\d+)$/, 'Question $1 of $2'], [/^(\d+) Fragen? gestellt$/, '$1 questions asked'], [/^Eine Frage gestellt$/, 'Asked one question'], [/^(\d+) Fragen$/, '$1 questions'],
    [/^· (\d+) Quellen?$/, '· $1 sources'], [/^(\d+) Quellen?$/, '$1 sources'], [/^Quellen analysiert · (\d+)$/, 'Sources analyzed · $1'], [/^\+(\d+) weitere$/, '+$1 more'],
    [/^(\d+) (Min\.|Minuten)$/, '$1 min'], [/^(\d+) Std\.$/, '$1 h'], [/^(\d+) Tage$/, '$1 days'], [/^(\d+) Stück$/, '$1 shares'], [/^(\d+) Karten$/, '$1 cards'],
    [/^(\d+) Aufgaben$/, '$1 tasks'], [/^(\d+) Termine$/, '$1 events'], [/^(\d+) Dokumente$/, '$1 documents'], [/^(\d+) Chats$/, '$1 chats'], [/^(\d+) Zeilen$/, '$1 lines'],
    [/^Programmieren · (\d+) Zeilen$/, 'Coding · $1 lines'], [/^(\d+) Positionen$/, '$1 positions'], [/^(\d+) Position$/, '1 position'],
    [/^Nichts gefunden zu „(.+)“$/, 'Nothing found for “$1”'], [/^Dokument „(.+)“ erstellt$/, 'Document “$1” created'], [/^„(.+)“ löschen\?$/, 'Delete “$1”?'],
    [/^noch (\d+) weiterer?$/, '$1 more'], [/^(\d+) Wörter$/, '$1 words'], [/^(\d+) Wort$/, '$1 word'], [/^Farbe für „(.+)“$/, 'Color for “$1”'], [/^(\d+) Schlüssel$/, '$1 keys'],
  ];
  const SKIP = '.md, .out-bubble, .thought-text, .msg, .message, .bubble, .dc-content, .dc-title, .dc-sub, [contenteditable="true"], code, pre, .tab-title, .lb2-title, .sb-chat-t, .cl-title, .chat-title, .hm-title, script, style, svg, .cbx, iframe';
  const tr = (s) => {
    const t = s.trim(); if (!t) return null;
    if (D[t]) return s.replace(t, D[t]);
    for (const [re, to] of RULES) if (re.test(t)) return s.replace(t, t.replace(re, to));
    // zusammengesetzte Texte („Wirklich löschen?“ mit Zusatz, „3 Quellen · Bild gefunden“): bekannte Wendungen darin ersetzen
    if (t.length > 6 && /[a-zäöü]/.test(t)) {
      let out = t;
      for (const k of PHRASES) if (out.includes(k)) out = out.split(k).join(D[k]);
      if (out !== t) return s.replace(t, out);
    }
    return null;
  };
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  function walk(root) {
    if (root?.nodeType === 3 && root.parentElement?.closest(TITLES)) { titles(root.parentElement.closest(TITLES)); return; }
    if (!root || root.nodeType === 3) { if (root?.parentElement && !root.parentElement.closest(SKIP)) { const v = tr(root.nodeValue); if (v != null && v !== root.nodeValue) root.nodeValue = v; } return; }
    if (root.nodeType !== 1) return;
    if (root.closest?.(SKIP)) { titles(root.closest(TITLES) || root); return; }
    ATTRS.forEach((a) => { const v = root.getAttribute?.(a); if (v) { const n = tr(v); if (n != null && n !== v) root.setAttribute(a, n); } });
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      if (n.nodeType === 3) { const v = tr(n.nodeValue); if (v != null && v !== n.nodeValue) n.nodeValue = v; }
      else ATTRS.forEach((a) => { const v = n.getAttribute(a); if (v) { const x = tr(v); if (x != null && x !== v) n.setAttribute(a, x); } });
    }
    titles(root);
  }
  // Standard-Titel („Neuer Chat“, „Unbenannt“) stehen in Titel-Feldern, die sonst unberührt bleiben (eigene Titel des Nutzers)
  const TITLES = '.tab-title, .lb2-title, .sb-chat-t, .cl-title, .chat-title, .hm-title, .dc-title, .cmdk-l';
  const DEFAULT_TITLES = { 'Neuer Chat': 'New chat', 'Unbenannt': 'Untitled', 'Ohne Titel': 'Untitled', 'Neues Dokument': 'New document' };
  function titles(root) {
    const els = root.nodeType === 1 ? [...(root.matches?.(TITLES) ? [root] : []), ...root.querySelectorAll(TITLES)] : [];
    els.forEach((e) => { if (e.isContentEditable || e.closest('[contenteditable="true"]')) return; const t = e.textContent.trim(); if (DEFAULT_TITLES[t] && e.childElementCount === 0) e.textContent = DEFAULT_TITLES[t]; });
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
