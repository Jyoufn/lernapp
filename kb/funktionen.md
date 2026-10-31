# Funktionen – aktueller Stand

## Navigation
- Sidebar: **Erstellen** (`data-nav="new"`), Chatverlauf, Bibliothek, Aufgaben, Kalender; darunter „Chats ⌄“ (8 neueste, Anheften/⋯) und „Dokumente ⌄“. Kopf: Workspace-Name, Lupe (⌘K), Einstellungen (Regler).
- Tabs arbeiten unsichtbar im Hintergrund (Tab-Leiste ausgeblendet), je Chat/Dokument/Ansicht ein Tab; leere Chats/Dokumente sind „Entwürfe“ und werden beim Verlassen verworfen. Ein-/Ausklapp-Knopf der Sidebar immer oben links im Hauptteil.
- **Erstellen**: oben mittig Umschalter **Agenten | Dokumente** (statt der alten Hunde-Leiste `.dog-modes`, die ist aus). Agenten = leerer Chat mit Hund in der Mitte („Woran arbeiten wir heute?“, Klick auf den Hund → Agenten-Feld). Dokumente = neues leeres Dokument (Tab mit `data-create="1"`). Gewähltes Wort ist umrandet. Leiste verschwindet nach dem Senden bzw. sobald im Dokument etwas steht (dann ist man im Dokument, Sidebar markiert nicht mehr „Erstellen“).
- Chatverlauf und Bibliothek: „Angeheftet“, dann nach Zeit **Zuletzt · Gestern · Letzte Woche · Letzter Monat · Letztes Jahr · Älter** (`UIKit.timeGroups`); Zeile: Icon/Hund, Titel, Zeit, Anheften, Löschen (2. Klick löscht, endgültig).

## Chat und Agenten
- Agenten: `general` Allgemein (Havaneser, kocht), `learn` Lernen (Border Collie mit Doktorhut, Buch), `research` (Golden Retriever, Lupe/Feder, recherchiert immer, Tiefen-Recherche), `code` (gesperrt, `PixelDogs.UNAVAILABLE`), `boerse` (Bär im Anzug mit Sonnenbrille, Zeitung/Laptop).
- Eingabefeld: Plus (Fotos/PDF), Modell-Chip mit Aufwand (Auto/Low/Medium/High/Max), Diktat, Sprachmodus. Rückfragen der KI erscheinen als Karte im Eingabefeld (Kopf „Rückfrage x von y“, Antwortoptionen ohne Nummer davor); solange sie offen ist, bleibt der Hund mit Denkblase (`actor.ask()`, `msgEl._askActor`) und arbeitet nach der Antwort weiter.
- Zeitleiste über der Antwort: Kopf = Hauptstatus (mit Hund, der passend arbeitet), darunter **nur echte Schritte** (siehe `ki.md`), am Ende „Fertig“ + blauer Haken, klappt dann zu.
- Blöcke in Antworten: chart (Linie/Ring), mindmap (Baum mit Zoom/Vollbild), timeline (Datum im Kästchen), heft, praesentation (Lern-Agent), stock/chancen/merken (Börse), illustration (Bilder: FLUX über NVIDIA), ask (Rückfrage), app (Sprach-Agent steuert die App).
- Unter jeder Antwort: Kopieren, Neu erzeugen, Ins Dokument; Quellen rechts (nur benutzte).
- Fehler/fehlender Schlüssel/Unterbrechung als ruhige Karte statt roter Box; Limit erreicht als graue Zeile.

## Dokumente
- Editor (Kopf nach Capacities-Vorlage): über dem Titel EINE Zeile **Projekt-Pille** (Akzentfarbe getönt, Rand transparenter; leer: Würfel + „Projekt“, gesetzt: Icon des Projekts in seiner Farbe + Name; Menü „Suchen“, „Noch keine Projekte“; „„X“ anlegen“ normal links → wie bei Tags erst Icon (Gefüllt/Linie) dann Farbe antippen = angelegt; Projekt = `{id, name, c, icon, line}`) · „Icon hinzufügen“ (`#f-smile`) · „Cover hinzufügen“ – erscheinen beim Darüberfahren/Antippen. Darunter Titel, dann **Tags**, dann die **Infos-Tabelle** (Erstellt, Bearbeitet, Priorität, Umfang, Abschnitte; fest, nicht einklappbar; in den Dokument-Einstellungen „Infos“ abschaltbar). Keine Beschreibung, kein Platzhaltertext im Inhalt.
- Inhalt: Überschriften h2–h4 einklappbar mit Griff links, Slash-Menü, Format-Menü bei Markierung (Ask AI), Rechtsklick-/„•••“-Menü für Blöcke.
- Oben rechts: Fokusmodus (`#f-focus`, Kreis aus acht Bögen), **Anheften** (`#f-pin`, angeheftet = Akzent), Einstellungen, Seitenfenster. Alle ohne Rand/Fläche.
- **Fokusmodus**: Icon, Titel, Infos-Tabelle und Inhalt bleiben; Sidebar, Leisten, Griffe, Projekt/Icon/Cover hinzufügen, Tags und Cover-Bild weg, kein Browser-Vollbild, nicht bearbeitbar; oben mittig ein Kasten in Dokumentfarbe mit rundem Kreis → Klick/Esc beendet; Text blendet darunter weich aus.
- Icon-Auswahl: Übersicht immer grau, gewählt = Umrandung; oben **Gefüllt | Linie** (Linien-Fassung `#dl-<name>`, `doc.icon.line`); danach Farbe. Rendern immer über `DocIcons.of(ic)` bzw. `DocIcons.svg(name, size, '', line)`.
- Cover-Kacheln wachsen beim Darüberfahren nicht (iPad), Fenster scrollt überall.
- Cover-Stile (eigene Farbe): Wellen, Dünen, Bänder, Bögen, Schlicht, Gipfel, Prisma, Punkte, Bokeh, Bauhaus, Seide, Streifen, Mosaik (Horizont…Flüssig nicht mehr wählbar, alte Cover werden weiter gezeichnet).
- Cover **„Mit KI erstellen“**: Kachel neben Hochladen → Eingabefeld oben im Fenster (Fenster bleibt offen) → `POST /api/cover-image {wish}` (Gemini → englischer Auftrag im festen Stil `COVER_STYLE`: gezeichnete, flache Illustration, nicht realistisch, keine Schrift → FLUX via `nvcfImage`).
- Dokument-Chat rechts: eigener KI-Chat je Dokument (mehrere), gleiche Zeitleiste wie der Haupt-Chat. Eigene Aufwand-Wahl im Eingabefeld (Auto/Low/Medium/High/Max, `docs.chatEffort`, kein Modellname). Neuer Text wird im Chat vollständig gezeigt + [[ÄNDERN]]; die KI liest das Dokument, doppelt nichts, ändert/löscht gezielt statt alles neu einzufügen. Leerer Chat: Feld wächst nach oben (Hund rutscht mit).
- Projekt bearbeiten: Klick auf die gesetzte Projekt-Pille öffnet direkt „bearbeiten“ (Name, Farbe, Icon in der Farbe, „Aus Dokument entfernen“, „Projekt löschen“ rot); in der Liste je Projekt ein Stift. Löschen nimmt das Projekt aus allen Dokumenten.
- Sidebar „Dokumente“: Projekte als Ordner (Icon in Projektfarbe + Name, Pfeil, weich ein-/ausklappbar, Zustand `docs.openProjects`), Dokumente darin eingerückt; danach bis 6 Dokumente ohne Projekt. Neue Dokumente vom Server (Aufgaben, Automatisierungen) erscheinen sofort: `Docs.sync()` nach fertigem Agenten-Lauf, beim Zurückkehren in die App und jede Minute.
- Projekt-Pille mit Cover: direkt unter dem Cover; mit Icon rechts neben dem Icon-Kasten, knapp unter der Cover-Kante (`under-cover`/`by-icon`, Abstand `--by-icon` aus dem Icon berechnet). Tags-Abstand zum Titel über das Titel-Polster (kein negativer Rand – sonst schneidet der klebende Titel die Tags an).
- Fokusmodus: Titel klebt nicht oben; Verlassen mit weichem Einblenden (`focus-out`). Tags sitzen eng unter dem Titel.

## Aufgaben (`tasks.js`, Liste)
- Gruppen-Karten: Überfällig · Heute · Diese Woche · Später · Ohne Datum, unten „Erledigt“ (aufklappbar). Zeile 46 px: Kreis 15 px · Titel 14 px · Tags (leicht getönt) · rechts Hund-Ergebnis oder Datum (+Uhrzeit) · Priorität · Stift (gleitet beim Aufklappen herein).
- Aufklappen nur, wenn es etwas zu zeigen gibt (Beschreibung oder „An Lernen geben“, falls im Fenster ein Agent gewählt ist). Kein „Keine Beschreibung“.
- Vom Agenten erledigt: rechts Hund + Name des Ergebnisses (Dokument), Klick öffnet es.
- Fenster: Datum (Kalender immer 6 Wochen, Uhrzeit-Schalter + Rad; **Schalter rechts in der Zeile**: aus = Datum grau, das zuletzt gewählte/heutige bleibt stehen), Priorität, Tags (anlegen mit Farbe), Agent, **Aufwand** (nur mit Agent: Auto/Niedrig/Mittel/Hoch/Max, Standard Hoch → `task.effort`, auch für Automatisierungen), **Automatisierung** als Schalter rechts (blau an, grau aus) → statt Datum der Zeitplan (Täglich/Werktags/Wöchentlich + Tag + Uhrzeit) und „Wiederholungen“ (Kein Limit, 1–20-mal). „Aufgabe erstellen“ schickt nicht automatisch ab; Ergebnis von Agenten ist immer ein Dokument.
- Erledigte Aufgaben werden einen Tag nach dem Abhaken komplett gelöscht (`purgeDone`, nicht bei Automatisierungen). Antippen von Haken/„Erledigt“ ohne helles Aufleuchten.
- Aufgaben mit Agent: Pille **Quellen** → gestrichelter Kasten „Fotos hochladen“ (nur Bilder, verkleinert, max. 4 → `t.srcFiles`, gehen als Bilder an den Agenten) und darunter „Website hinzufügen“ (Link + Enter → `t.srcLinks`/`task.sources`, gehen in den Prompt). High/Max (Standard) → Prompt verlangt echte Recherche; Ergebnis-Dokument mit Tabellen/Diagrammen, bekommt passendes Icon (`pickIcon`) und die Priorität der Aufgabe (`doc.priority`). Sperre `agt:run:lock:*` → kein doppeltes Dokument. Prompt: jedes Mal frisch arbeiten, nicht an früheren Ergebnissen orientieren.
- Hintergrund-Lauf: Server (`lib/agenttasks.js`) ohne Rückfragen (`noClarify`), auch bei geschlossener App (Cron). Ziel des Nutzers: Hausaufgaben eintragen → Agent erledigt sie → später Export (PDF) für GoodNotes.

## Kalender (`calendar.js`)
- Wochenansicht: Tage „Mo 26“ (heute rote Pille), Stunden 56 px, Termine getönt mit Farbstrich. **Ganztägig = Farbband durch den ganzen Tag** (Titel klebt oben), keine Ganztägig-Zeile, keine Jetzt-Linie, kein Überscrollen. Klick in leere Felder macht nichts – neue Termine nur über „Neu“. Klick auf Tagesnamen öffnet das Tagesfenster.
- Termin-Fenster wie das Aufgaben-Fenster (Datum, Zeit/Ganztägig, Farbe, Icon). Neuer Termin: Icon folgt dem Titel (`guessIcon`/`ICON_WORDS` in `calendar.js`), bis eins von Hand gewählt wird.

## Börse (Bär)
- Echtzeitkurse (Tradegate/ING), Verlauf (Yahoo, Ersatz Stooq), Nachrichten (Google/Bing News), Kennzahlen; Strategie des Nutzers: **nur „Starker Rückgang · Erholung“** (in 2 Tagen ≥ 5 % / 5 Tagen ≥ 8 % gefallen, Grund zur Erholung) – kein riskantes Momentum.
- Karten: Aktienchart (Prognose-Fächer Gut/Basis/Schwach), Chancen-Karten (ganze Karte klappt auf, „Stand heute, HH:MM Uhr · n Werte geprüft“), „Mein Depot“ aus dem Orderbuch (Handelstagebuch/Screenshot auslesen, löschen/aktualisieren per Chat). Kein Login ins Planspiel.
- „Mein Depot“: oben Kennzahlen als Abschnitte über die ganze Breite (Depotwert · Bargeld · Seit Start; Etikett klein grau, Zahl 19 px weiß), keine Orders-Anzahl. Zeile antippen klappt den Aktienchart mit Kauflinie auf.
- Kursverlauf: Yahoo → Stooq → ING (`ingSeries`, per ISIN – ING ist vom Server aus erreichbar, auch wenn Yahoo/Stooq sperren). Live-Kurs: Tradegate/ING.

## Workspaces und Konto
- Sidebar-Kopf: Workspace (Symbol 17 px) + Lupe; **kein Zahnrad** – Einstellungen über das Workspace-Menü.
- Einstellungen → Allgemein → Workspaces: Zeile antippen **klappt sie auf** (`wsSection`/`wsClick` in `settings.js`, Zustand `wst`). Offen: Symbol links in der Zeile ist ein Knopf → Auswahlmenü nach unten (`.st-ws-menu`, Agenten-Hunde + Katze/Fuchs/Panda/Pinguin `PixelDogs.ANIMALS` + eigenes Bild 128 px `w.img`; Auswahl = feiner heller Rahmen; Klick daneben schließt), Name direkt in der Zeile änderbar. Darunter Personen (Einladen per E-Mail, Liste mit ×), unten rechts rotes „Löschen“/„Verlassen“ (2. Klick „Wirklich?“). Kein Öffnen/Geöffnet, keine Inhalte-Zahlen. Tier-Raster: `/home/claude/gen/animals2.py`.
- Neue Pixel-Tiere entstehen mit dem Generator-Prinzip (Brustbild, 1-px-Umriss, runde Licht-Schattierung von links oben, wenig Struktur, Augen mit Lichtpunkt) je Größe 32/24/20 nativ – nie herunterskalieren.
- Aussehen: Modus als drei **Vorschaubilder** (Dunkel/Schwarz/Hell, gewählt = Akzent-Ring); Umschalter in den Einstellungen gewählt = Umrandung statt grauer Fläche; Felder in Kartenfarbe mit feinem Rand.
- Heller Modus = Umkehrung (`[data-theme=light]` invertiert body): Werte VOR der Umkehrung setzen (Hauptteil `#08080a` → #f7f7f5, Text `--text #d6d6d6` → grau statt schwarz, Menüs schwarz → weiß); Bilder/Pixel-Tiere/Vorschauen werden zurück-invertiert; Schrift auf blauen Knöpfen vorher schwarz.
- Nach dem Anmelden: Vorschau wächst zur App, danach bleibt man im leeren Chat (kein Sprung, keine wiederhergestellten Tabs; `window.AUTH_FRESH` → `restoreLayout`). Schon angemeldet (Neuladen): letzter Tab wird wiederhergestellt.
- Bis 3 Workspaces, teilbar per E-Mail (Einladung beim Öffnen). Alles (Chats, Dokumente, Aufgaben, Einstellungen, API-Keys) gehört zum Konto.
- Einstellungen in der Sidebar: Allgemein · Aussehen (Dunkel/Schwarz/Hell, Akzentfarbe) · Agenten (Verbindung/Schlüssel).

## Geplant / besprochen, noch nicht gebaut
- Bestätigungs-Karte im Chat für zerstörende Aktionen („lösche alle Dokumente“): kurzer Text + Karte mit Icons und Anzahl (Dokumente, Chats), unten rechts „Abbrechen“ und „Löschen“ (rot transparent).
- Agent steuert die Website: z. B. Bilder-Schlüssel fehlt → Karte direkt zum richtigen Einstellungs-Tab; „Wie ändere ich mein Aussehen?“ → Einstellungen direkt öffnen.
- Automatisierungen allgemein als „Prompt zu einer Uhrzeit“ (z. B. Chats aufräumen, später E-Mails lesen).
- Export der Aufgaben-Ergebnisse nach GoodNotes.


## Dokumente – Icon, Projekt, KI-Cover
- Icon-Auswahl nur gefüllt (keine Linien-Fassung mehr, alte `line`-Icons werden gefüllt gezeigt). Dokument-Tab ohne gewähltes Icon zeigt kein Symbol.
- Neues Projekt: Name → Farbe antippen → Icon (in der Farbe) antippen legt an. Projekt-Chip in Projektfarbe (Icon, 13 %-Fläche, Text).
- Cover „Mit KI erstellen“: nur ein Eingabefeld unten im Fenster (Chat-Design, wächst mit dem Text bis ~180 px, dann scrollen; Foto-Vorlagen bis 3, Mikro wie im Chat), kein Agent. Beim Erzeugen NUR die Wellen-Animation (kein Text). Fertig → Cover gesetzt und ganzes Fenster zu. Stil (`COVER_STYLE` in `app-server.js`): farbige flache Illustration mit gemaltem Look, Merkmale des Themas klar und fachlich richtig erkennbar, kreativ angeordnet, Farbwunsch bestimmt Palette – nie realistisch, nie skizziert. KI-Cover und hochgeladene Bilder bleiben unter „Deine Bilder“ gespeichert (`docs.coverImages`, JPEG, max. 12) und lassen sich mit × entfernen. Jedes Cover hat zusätzlich „Mit KI bearbeiten“ (öffnet direkt das Eingabefeld; aktuelles Cover-Bild bzw. Beschreibung geht mit, nur der Wunsch wird geändert). Die KI plant fürs Banner-Format (~3,6 : 1, nur der mittlere Streifen sichtbar → Elemente in einem Band in der Mitte, nicht zu viele).
- Eigenes Cover-Bild (Hochladen) und KI-Cover: normales Banner-Format (`cover.ai`), senkrecht ziehen verschiebt den Ausschnitt (`cover.y` 0–100) – das Bild selbst wird nicht verändert.
- YouTube im Dokument (Slash „Video“ oder einfach Link einfügen → Video-Block): eigener Player über die IFrame-API (`ytPlayer` in `docblocks.js`): keine YouTube-Leiste/Vorschläge (Fläche abgedeckt), eigene Leiste mit Play/Pause, Spulen, Zeit, Lautstärke/Stumm, Vollbild, „Nächstes“ nur bei Playlist-Links. Werbung lässt sich bei der offiziellen Einbettung nicht abschalten.
