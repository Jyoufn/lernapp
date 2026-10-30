# Funktionen – aktueller Stand

## Navigation
- Sidebar: **Erstellen** (`data-nav="new"`), Chatverlauf, Bibliothek, Aufgaben, Kalender; darunter „Chats ⌄“ (8 neueste, Anheften/⋯) und „Dokumente ⌄“. Kopf: Workspace-Name, Lupe (⌘K), Einstellungen (Regler).
- Tabs arbeiten unsichtbar im Hintergrund (Tab-Leiste ausgeblendet), je Chat/Dokument/Ansicht ein Tab; leere Chats/Dokumente sind „Entwürfe“ und werden beim Verlassen verworfen. Ein-/Ausklapp-Knopf der Sidebar immer oben links im Hauptteil.
- **Erstellen**: oben mittig Umschalter **Agenten | Dokumente** (statt der alten Hunde-Leiste `.dog-modes`, die ist aus). Agenten = leerer Chat mit Hund in der Mitte („Woran arbeiten wir heute?“, Klick auf den Hund → Agenten-Feld). Dokumente = neues leeres Dokument (Tab mit `data-create="1"`). Gewähltes Wort ist umrandet. Leiste verschwindet nach dem Senden bzw. sobald im Dokument etwas steht (dann ist man im Dokument, Sidebar markiert nicht mehr „Erstellen“).
- Chatverlauf und Bibliothek: „Angeheftet“, dann nach Zeit **Zuletzt · Gestern · Letzte Woche · Letzter Monat · Letztes Jahr · Älter** (`UIKit.timeGroups`); Zeile: Icon/Hund, Titel, Zeit, Anheften, Löschen (2. Klick löscht, endgültig).

## Chat und Agenten
- Agenten: `general` Allgemein (Havaneser, kocht), `learn` Lernen (Border Collie mit Doktorhut, Buch), `research` (Golden Retriever, Lupe/Feder, recherchiert immer, Tiefen-Recherche), `code` (gesperrt, `PixelDogs.UNAVAILABLE`), `boerse` (Bär im Anzug mit Sonnenbrille, Zeitung/Laptop).
- Eingabefeld: Plus (Fotos/PDF), Modell-Chip mit Aufwand (Auto/Low/Medium/High/Max), Diktat, Sprachmodus. Rückfragen der KI erscheinen als Karte im Eingabefeld.
- Zeitleiste über der Antwort: Kopf = Hauptstatus (mit Hund, der passend arbeitet), darunter **nur echte Schritte** (siehe `ki.md`), am Ende „Fertig“ + blauer Haken, klappt dann zu.
- Blöcke in Antworten: chart (Linie/Ring), mindmap (Baum mit Zoom/Vollbild), timeline (Datum im Kästchen), heft, praesentation (Lern-Agent), stock/chancen/merken (Börse), illustration (Bilder: FLUX über NVIDIA), ask (Rückfrage), app (Sprach-Agent steuert die App).
- Unter jeder Antwort: Kopieren, Neu erzeugen, Ins Dokument; Quellen rechts (nur benutzte).
- Fehler/fehlender Schlüssel/Unterbrechung als ruhige Karte statt roter Box; Limit erreicht als graue Zeile.

## Dokumente
- Editor: Cover, Icon, Titel, Beschreibung, „Infos ⌄“, Inhalt (contenteditable), Überschriften h2–h4 einklappbar mit Griff links, Slash-Menü, Format-Menü bei Markierung (Ask AI), Rechtsklick-/„•••“-Menü für Blöcke.
- Oben rechts: Fokusmodus (`#f-expand`), Einstellungen (Regler), Seitenfenster (Dokument-Chat).
- **Fokusmodus**: nur Titel + Inhalt, Sidebar/Leisten/Griffe/Seitenfenster weg, Vollbild, nicht bearbeitbar; runder Knopf oben mittig (`#f-shrink`) oder Esc beendet.
- Dokument-Chat rechts: eigener KI-Chat je Dokument (mehrere), gleiche Zeitleiste wie der Haupt-Chat.

## Aufgaben (`tasks.js`, Liste)
- Gruppen-Karten: Überfällig · Heute · Diese Woche · Später · Ohne Datum, unten „Erledigt“ (aufklappbar). Zeile 46 px: Kreis 15 px · Titel 14 px · Tags (leicht getönt) · rechts Hund-Ergebnis oder Datum (+Uhrzeit) · Priorität · Stift (gleitet beim Aufklappen herein).
- Aufklappen nur, wenn es etwas zu zeigen gibt (Beschreibung oder „An Lernen geben“, falls im Fenster ein Agent gewählt ist). Kein „Keine Beschreibung“.
- Vom Agenten erledigt: rechts Hund + Name des Ergebnisses (Dokument), Klick öffnet es.
- Fenster: Datum (Kalender immer 6 Wochen, Uhrzeit-Schalter + Rad, „Kein Datum“), Priorität, Tags (anlegen mit Farbe), Agent, **Automatisierung** Nein/Ja → statt Datum der Zeitplan (Täglich/Werktags/Wöchentlich + Tag + Uhrzeit) und „Wiederholungen“ (Kein Limit, 1–20-mal). „Aufgabe erstellen“ schickt nicht automatisch ab; Ergebnis von Agenten ist immer ein Dokument.
- Hintergrund-Lauf: Server (`lib/agenttasks.js`) ohne Rückfragen (`noClarify`), auch bei geschlossener App (Cron). Ziel des Nutzers: Hausaufgaben eintragen → Agent erledigt sie → später Export (PDF) für GoodNotes.

## Kalender (`calendar.js`)
- Wochenansicht: Tage „Mo 26“ (heute rote Pille), Stunden 56 px, Termine getönt mit Farbstrich. **Ganztägig = Farbband durch den ganzen Tag** (Titel klebt oben), keine Ganztägig-Zeile, keine Jetzt-Linie, kein Überscrollen. Klick in leere Felder macht nichts – neue Termine nur über „Neu“. Klick auf Tagesnamen öffnet das Tagesfenster.
- Termin-Fenster wie das Aufgaben-Fenster (Datum, Zeit/Ganztägig, Farbe, Icon).

## Börse (Bär)
- Echtzeitkurse (Tradegate/ING), Verlauf (Yahoo, Ersatz Stooq), Nachrichten (Google/Bing News), Kennzahlen; Strategie des Nutzers: **nur „Starker Rückgang · Erholung“** (in 2 Tagen ≥ 5 % / 5 Tagen ≥ 8 % gefallen, Grund zur Erholung) – kein riskantes Momentum.
- Karten: Aktienchart (Prognose-Fächer Gut/Basis/Schwach), Chancen-Karten (ganze Karte klappt auf, „Stand heute, HH:MM Uhr · n Werte geprüft“), „Mein Depot“ aus dem Orderbuch (Handelstagebuch/Screenshot auslesen, löschen/aktualisieren per Chat). Kein Login ins Planspiel.
- „Mein Depot“: oben Kennzahlen als Abschnitte über die ganze Breite (Depotwert · Bargeld · Seit Start; Etikett klein grau, Zahl 19 px weiß), keine Orders-Anzahl. Zeile antippen klappt den Aktienchart mit Kauflinie auf.
- Kursverlauf: Yahoo → Stooq → ING (`ingSeries`, per ISIN – ING ist vom Server aus erreichbar, auch wenn Yahoo/Stooq sperren). Live-Kurs: Tradegate/ING.

## Workspaces und Konto
- Bis 3 Workspaces, teilbar per E-Mail (Einladung beim Öffnen). Alles (Chats, Dokumente, Aufgaben, Einstellungen, API-Keys) gehört zum Konto.
- Einstellungen in der Sidebar: Allgemein · Aussehen (Dunkel/Schwarz/Hell, Akzentfarbe) · Agenten (Verbindung/Schlüssel).

## Geplant / besprochen, noch nicht gebaut
- Bestätigungs-Karte im Chat für zerstörende Aktionen („lösche alle Dokumente“): kurzer Text + Karte mit Icons und Anzahl (Dokumente, Chats), unten rechts „Abbrechen“ und „Löschen“ (rot transparent).
- Agent steuert die Website: z. B. Bilder-Schlüssel fehlt → Karte direkt zum richtigen Einstellungs-Tab; „Wie ändere ich mein Aussehen?“ → Einstellungen direkt öffnen.
- Automatisierungen allgemein als „Prompt zu einer Uhrzeit“ (z. B. Chats aufräumen, später E-Mails lesen).
- Export der Aufgaben-Ergebnisse nach GoodNotes.
