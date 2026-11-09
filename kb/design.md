# Design – verbindliche Regeln (aktueller Stand)

## BAUSTEINE (Stand 09.11. nachts)
- Den Tab „UI Design“ gibt es nicht mehr (Wunsch 09.11.). Bausteine = die vorhandenen Klassen in der App wiederverwenden: Knöpfe wie `.tk-new` (grau #212121, Rand #242424, Radius 8), Menüs `.lb2-menu` (Abschnitte `.lb2-ml`, Trennlinie `.lb2-msep`, Haken `.lb2-tick`), Umschalter `.cs-pill`, Listenzeilen `.lb2-row`, Etiketten/Tags `.lb2-tag` / `.tk-tag`.
- **Glas-Stil: entfernt** (09.11. abends) – vorerst kein Glas/Weichzeichner.
- **Icons**: `line-icons.js` ersetzt beim Laden den Inhalt aller Symbole `#f-…`, `#i-…`, `#d-…` durch runde Linien-Icons: Home, Aufgaben, Kalender, Chat, Dokument, Plus, Suche, Agent = Formen der Sidebar-Icons `#o-…` (Strich 1,5, runde Enden); übrige aus Hugeicons „Stroke Rounded“ (MIT), Strich 2 im 24er-Raster. Ausnahmen: Sprachmodus (`voice`) = fünf runde Striche (Tonwelle); Neu erzeugen (`refresh`) = ein runder Pfeil; Chats (`chats`) = zwei runde Sprechblasen; Knöpfe unter Antworten (`.msg-btn`) Icons 14 px; Einklappen (`sidebar`) = Rahmen + dickerer gefüllter Balken links. `#o-home` (Sidebar) mit weich gerundetem Dach. Neue Icons in `line-icons.js` nachtragen.
- **Formen**: Knöpfe/Pillen/Etiketten „abgerundet“ (Radius 8) statt „ganz rund“ – auch Kalender, Aufgaben, Home. Kein Fokus-Rahmen beim Anklicken, keine Schatten. Filter-Knöpfe nur als Icon ohne Kasten.
- **Umschalter `.cs-pill`** (Agenten | Dokumente): Spur #181818, Rand #242424, Radius 12; gewählter Teil = gleitende Fläche `.cs-thumb` (#262628, Rand #303033, Radius 9), gesetzt von `ui-kit.js` → `placeThumb` (beobachtet Klassen-/Größenänderungen, gilt für jedes `.cs-pill`).
- **Farbauswahl** (`UIKit.COLORS`, Tags/Projekte/Termine): #d1d1d1, #cb88ab, #d38b7d, #ce965b, #a1af60, #7db993, #6bb0d7, #9799ec (Farbpunkte aus dem Nutzer-Bild „Appearance“); Punkte 20 px, gewählt = heller Ring. Dokument-Eigenschaften (Erstellt, Bearbeitet, Projekt, Priorität …) als Karte (Rand #242424, Radius 12, Zeilen mit Trennlinie).
- **Home-Liste**: Chat-Icon = runde Sprechblase, neutral wie das Dokument-Icon (kein Blau); Tags der Einträge rechts als kleine Etiketten (Punkt + Name, max. 2, dann +N).

## DESIGNSCHEMA (verbindlich seit 04.11. – überall anwenden, vor jeder UI-Änderung prüfen)
Vorbild: die „Thought for 3s“-Karte (Nutzer-Screenshot). Ruhig, dunkel, flach, wenig Kontrast über Flächen, Kontrast über Text.

**1. Nur drei Flächen-Töne** (alles andere ist falsch, auch „fast gleiche“ Grautöne):
| Ebene | Wert | Variable | Wofür |
|---|---|---|---|
| Hauptteil | #141414 | `--main-bg`, `--sidebar-bg` | Sidebar, Hauptbereich, `<select>` |
| Fenster | #181818 | `--win-bg`, `--field-bg`, `--card` | Eingabefeld, Suchfelder, Karten, Fenster/Sheets, Inhalts-Kästen, gewählte Zeile, **Auswahl-Menüs/Dropdowns** (`--menu-bg`, wie Knopf „Neues Dokument“; Hover `--menu-hover` #212121) |
| Ausklappbar | #212121 | `--pop-bg` | Aufklapp-Kästen und Menüs INNERHALB eines Fensters, Köpfe, Leisten, Hover-Flächen, aktive Sidebar-Zeile, Neben-Knöpfe (z. B. „Neues Dokument“ in der Bibliothek) |
- **Nichts ist dunkler als #141414** (kein Schwarz, kein #0d0d0d). In einem Fenster ist nichts dunkler als das Fenster.
- Abdunkelung hinter Fenstern/Overlays: `color-mix(in srgb, var(--main-bg) 72%, transparent)` – nie `rgba(0,0,0,…)`.
- Gewählt/aktiv in einer Leiste = eine Stufe tiefer (Fenster-Ton auf Ausklappbar-Fläche).

**2. Ränder nur leicht sichtbar**: `--line` #242424 (bzw. `--menu-border`, `--field-border`). Keine helleren Grau-Ränder; farbige Ränder nur für Akzent/Gefahr. Rand um den Hauptteil (`.panel`) noch leiser: #1d1d1d (09.11.).

**3. Keine Schatten**: kein `box-shadow` mit Versatz/Unschärfe, kein `drop-shadow` – nirgends. Erlaubt: Ringe ohne Unschärfe (`0 0 0 1px …`, `inset`).

**4. Text** (exakt Vorlage): `--text` #f7f7f7 (Titel) · `--text-2` #ededed · `--text-3` #bbbbbb (Fließtext) · `--text-4` #909090 (leise). Keine anderen Text-Grautöne.

**5. Farbe nur als Akzent**: `--accent` #2f86ff für Hauptknopf (z. B. „Aufgabe erstellen“), Haken, Wichtigstes. Gefahr #f07a6e, Fläche `rgba(239,107,95,.12–.14)`. Getönte Etiketten: Fläche Farbe 12–13 %, Text ~72 % + Weiß. Fach-/Termin-Farben: `UIKit.COLORS`.

**6. Auswahl**: Kästchen 18 px, Radius 6, Rand #3a3a3a auf `--main-bg`; gewählt = helles Grau #e6e6e6 mit dickem dunklem Haken (#141414, Kontrast; kurze Feder-Animation, kein Blau) UND die Zeile bekommt den Fenster-Ton #181818. Aktive Zeile in der Sidebar (offener Chat, Bereich) = #212121. Beim Antippen nichts grau (`-webkit-tap-highlight-color: transparent`), kein Fokus-Rand, nichts schrumpft.

**7. Form**: Pillen (Radius 999) für Leisten-Knöpfe/Filter/Auswahl-Leiste; Menüs Radius 10; Karten/Fenster 12–14; Eingabefeld 18. Filter/Werkzeug-Knöpfe nur als Icon.

**8. Sonst**: keine Browser-Tooltips, keine Emojis, keine Deko-Verläufe/Glow/Lila, kein „KI-Look“, Texte nur Deutsch, eng und sauber ausgerichtet.
Umsetzung: Block „DREI FLÄCHEN“ und folgende Blöcke am Ende von `style.css`; Modus „Dunkel“ (`MODES.dark` in `app.js`) setzt dieselben Werte. Modi „Schwarz“/„Hell“ haben eigene Töne.

## Schrift und Maße
- Inter; Zahlen `tabular-nums`. Größen: 11 · 11.5 · 12 · **12.5 (Menüs)** · 13 · 13.5 (Sidebar) · 14 (Zeilentitel) · 15 (Abschnitt/Kalender-Kopf) · 18 (Seitentitel Chats/Bibliothek/Aufgaben). Stärke 400/500/600, nie 700+.
- Radien: 6–7 Menüzeile · 8 Knopf · 10 Menü/Suchfeld · 12–14 Karten/Fenster · 18 Eingabefeld/Pillen-Leisten.
- Höhen: Menüzeile 26–30 · Knopf 28–30 · Listenzeile Aufgaben 46 · Chat-Zeile 34–40.
- Scrollleisten: nur schmaler Balken, nie `scrollbar-width/-color` setzen (außer `none`).

## Icons
- `icons.js`: gefüllt, 16er-Raster, Details ausgespart; nur Lupe und einfache Zeichen (Pfeile, Plus, ×, Haken) als Linie. Farbe `currentColor`.
- HTML `<svg width="14" height="14"><use href="#f-NAME"/></svg>`, JS `fi('NAME', 14)` bzw. `FadeIcons.svg('NAME', 14)`.
- Namen u. a.: Die vollständige Liste: Schlüssel unter `f` / `i` / `d` in `line-icons.js` bzw. die `<symbol>`s in `icons.js`/`index.html`. NICHT vorhanden z. B. `hourglass`, `clipboard`, `notebook` (nur als Dokument-Icons `#d-…`) – vorher dort nachsehen.
- Sidebar nutzt Linien-Icons `#o-…` aus `index.html` (Strich 1,5, runde Enden, Ecken weich wie `o-tasks`/`o-calendar`; `o-home` = Haus mit weich gerundetem Dach).

## Animation
- **Flüssig auf dem iPad** (verbindlich, 04.11.): nur `transform` und `opacity` animieren – kein `filter: blur` in Keyframes/Übergängen, kein `backdrop-filter`, keine Schatten-Animation.
- Federkurve `--spring` = `cubic-bezier(0.16,1,0.3,1)`; für Auf-/Zuklappen `cubic-bezier(0.32,0.72,0,1)`.
- Hover 90–160 ms, Aufklappen 260–420 ms (nur über die Höhe, Inhalt blendet leicht mit), Einblenden 400–500 ms.
- Immer `prefers-reduced-motion` beachten. Nichts wackelt oder hüpft.

## Bausteine (so sehen sie heute aus)
- **Hauptknopf**: blau gefüllt, Radius 8, weißer Text („Neue Aufgabe“, „Neues Dokument“, „Neuer Chat“). Nebenknopf: Rand, keine Fläche. Löschen: rot transparent.
- **Home-Liste** (`.lb2-*`): Zeilen ohne Kasten, feine Trennlinie (6 % Weiß), Hover `--menu-hover`; Kästchen 16 px Radius 5 links außerhalb der Zeile, gewählt = blauer Rand + Haken (keine Fläche); Filter und Auswahl-Knöpfe als runde Pillen (Radius 999, Rand `--menu-border`); Menüs wie `.tk-box`. Auswahl-Aktionen unten mittig (`.lb2-dock`) im Stil des Schalters „Agenten · Dokumente“: 36 px, Radius 12, `--win-bg`, Rand `--line`, Icon + Text, Trennstriche 1×16 px `--line`, Hover #212121; 10 px über dem Rand, gleitet mit Feder ein. Dokument-Icon ohne eigenes Icon: Blatt mit Eselsohr (`PAGE_SHAPE` in `docs.js`, Sidebar und Bibliothek).
- **Seitenköpfe** Home/Aufgaben: Titel 18 px links, KEINE Unterzeile, rechts höchstens ein Knopf (Home: Plus `.hm-plus` 30 px, Radius 8, ohne Fläche, Hover #212121 → Menü Neuer Chat | Neues Dokument; Aufgaben: grauer Knopf #212121, kein Blau), darunter Suchfeld (40 px, Radius 12, Fläche `--win-bg`, Icon 14).
- **Kalender-Kopf**: auf Höhe des Sidebar-Knopfs oben links, Trennstrich, „Oktober 2026“ 15 px; rechts „‹ Heute ›“ und „Neu“ gleich hoch.
- **Menüs/Aufklapp-Kästen** (`.tk-box`): `--menu-bg`, Rand `--menu-border`, Radius 10, Zeilen 30 px, Auswahl nur blauer Haken.
- **Fenster Aufgabe/Termin**: ohne × und ohne Kopftext; Titel, „Beschreibung hinzufügen“ (wächst, höchstens ~6 Zeilen, dann scrollt sie; das ganze Fenster höchstens Bildschirmhöhe und scrollbar), darunter Pillen-Zeilen (Icon + Text), die bündig einen Kasten aufklappen. Knopf unten rechts „Aufgabe erstellen“.
- **Inhalts-Kästen im Chat (verbindlich, wie Börse „Mein Depot“/Empfehlungen)**: Quiz steht in EINEM Kasten; Karteikarten und Probeklausur OHNE äußeren Kasten – Titel frei darüber, nur die Hauptfläche (Karte bzw. Klausur-Karte) hat diesen Ton. Kasten/Hauptfläche: Fläche `var(--win-bg)`, Rand `rgba(255,255,255,.065)`, Radius 14 (nicht runder), Titel oben links 15 px fett (600) mit grauem Icon, rechts kleine Icon-Knöpfe (Radius 7–8). Elemente darin (Karteikarte) nur einen Hauch heller (~96,5 %), grau – keine Farbtöne. Knöpfe wie ×, Mischen, Pfeile: Radius 8, nicht kreisrund.
- **Karten im Chat** (Agent-Empfehlung, Fehler, API-Key fehlt, Unterbrochen): Hund links, Titel + Satz, rechts ein Knopf; Fläche/Rand wie Eingabefeld. Nicht noch eine Karte im Muster „Icon links + Titel + Untertitel“ erfinden – der Nutzer will dafür bessere Lösungen.
- **Tags**: getönte Fläche 12 %, farbiger Text, ohne Punkt (Liste) – im Dokument mit Punkt.
- **Leisten oben mittig** (`.cs-pill`): Leiste 36 px, Radius 12, Fläche #181818, leiser Rand; gewählter Teil 28 px, Radius 9, heller #242424 mit weißem Text, sonst `--text-4`.
- **Quellen**: Chips in der Zeitleiste; unter der Antwort `src-stack` = nur Logos als abgerundete Quadrate (20 px, Radius 6, leicht überlappend, OHNE Namen), in einer Reihe, deutsche zuerst, höchstens 5, dann „+N“, Klick → Quellenfenster; endet die Antwort mit einer Grafik, stehen sie neben den Aktions-Icons.
- **Lernsets im Chat**: keine Box mit Knopf unten rechts, kein Satz darüber – Kopfzeile (eigenes graues Art-Icon `KICON` – Karteikarten: drei aufgefächerte graue Karten, keine Farben – + Titel, rechts „3 / 9“, lädt noch → pulsierender Punkt statt Gesamtzahl, Vollbild-Icon), darunter direkt die Lernfläche; Aktionen als runde Pillen (34 px). Karteikarte Radius 16, grau einen Hauch heller als der Kasten, **Rückseite gleiche Farbe, kein Schatten**, Blättern: alte Karte gleitet als Kopie zur Seite, neue kommt gleichzeitig, Bewertung färbt nur kurz den Rand; Nachbarkarten nur als Kante, Pfeile links/rechts; Bewertung Daumen runter · Fragezeichen („unsicher“) · Daumen hoch. Kopf rechts: Info (Übersicht gewusst/unsicher/nicht gewusst/offen mit Balken) und im Vollbild Mischen – nur Icons ohne Rand. Quiz: unten links „Überspringen“ (kein Zurück). Probeklausur: Karte mit Übersicht (Icons: Dauer, Anzahl, Fach – keine Punktsumme) → „Klausur starten“ → Aufgabe für Aufgabe (Segmente, Zeit rechts, „Zurück“/„Weiter“, „Abgeben“) → Notenpunkte 0–15 im Ring → Aufgaben mit Punkten, Rückmeldung, Musterlösung (aufklappbar). Offene Antwort: nur Umrandung wie das Eingabefeld. Quiz: Karte mit Segmenten je Frage (grün/rot, antippen springt zur Frage), Optionen mit Buchstabe A–D (gewählt = Feld voll blau, weißer Haken zeichnet sich, Rand bleibt), Antwort erst nach „Bestätigen“ auswerten (Füllung läuft von links ein, Rest abgeblendet), Fuß: links Ergebnis + „Erklärung“ (klappt auf), rechts Knopf. Lücken als Linie im Text, Zuordnung mit eigenem Menü (kein System-Select), offene Antwort im Eingabefeld-Stil. Ergebnis: Ring läuft hoch, falsche Antworten nur aufklappbar als blaue Chips wie `qa-pick` – ohne Nummern; Lückentext: Lösungen direkt im Text, Zuordnung untereinander in richtiger Reihenfolge. Vollbild: kein Strich/Balken, × und Mischen mit Radius 8, Titel als Text 15 px fett („Titel · 3 / 9“, keine Pille), Inhalt mittig, Öffnen/Schließen gleiten weich (10 px + Blende). Warten: Kachel-Welle über die volle Breite ohne Text – Fortschritt steht im Schritt der Zeitleiste.
- **Erstellen-Fenster Lernset**: exakt das Fenster „Neue Aufgabe“ (`tk-sheet`, Zeilen mit aufklappendem Kasten): Thema, Wünsche, Art (nur ohne Vorauswahl), Quellen, Abschnitte, Schwierigkeit, Aufgabentypen. Keine Anzahl – die bestimmt die KI.
- **Funde (```links)**: Raster `minmax(172px,1fr)`, Karte Radius 16, Bild 4:3 oben (Schimmer beim Laden), darunter Titel (2 Zeilen), Satz, Website mit Logo.
- **Zeitleiste**: ein einzelner Schritt steht nur im Hauptstatus; die Liste erscheint ab dem 2. Schritt (der erste abgehakt). Keine Drehkreise – Punkt pulsiert, der Hund arbeitet.
- **Mini-App-Kasten**: wie Inhalts-Kästen (Fläche 98,5 %, Rand .065, Radius 14), Kopf 46 px (Icon grau, Titel 15 px 600, rechts Icon-Knöpfe 30 px Radius 8, aktiv = Akzentfarbe ohne Fläche), Kacheln Radius 12. Warten: Kachel-Welle + „Programmieren · N Zeilen“ (schimmernd).
- **Haupt-KI**: keine eigenen Karten – im aufgeklappten Anbieter unter den Schlüsseln eine Zeile „Rolle“ mit Umschalter Haupt-KI · Ersatz · Aus (`st-seg`, bei der Haupt-KI sind die anderen gesperrt) und darunter ein grauer Satz, was das heißt; der gewählte Anbieter trägt im Kopf das Akzent-Etikett „Haupt-KI“, FLUX ein graues „Bild-KI“. Einstellungen-Sidebar: „Agenten“ mit Roboter-Kopf (`#o-agent`).
- **Fenster „Neuer Agent“**: der Chat-Hauptteil schwebt als Fenster (Rand Menü-Farbe, Radius 16, Schatten, Hintergrund abgedunkelt), Kopf nur Titel + × ohne Strich/Fläche (weicher Übergang, der Chat reicht nach oben); Ideen als runde Pillen unter dem Feld. Skills im Eingabefeld: keine Färbung mehr.
- **Podcast-Player** (`.pod`): Inhalts-Kasten (98,5 %, Rand .065, Radius 14, max. 760 px). Kopf: Cover 56 px (Radius 10, Akzent 20 % getönt, fünf Equalizer-Balken, bewegen sich nur beim Abspielen), daneben „PODCAST“ (11 px, Großbuchstaben, grau), Titel 15 px 600, „Lena & Jonas · 9 Min.“, Statuszeile („Wird vertont …“, „Die beiden antworten …“). Fortschritt: Zeit links/rechts (11,5 px, Ziffern gleich breit), Linie 3 px, Punkt 10 px. Knöpfe: zurück/vor 34 px Radius 8 ohne Fläche, Play rund 42 px weiß mit dunklem Icon (wie Spotify), rechts Lautstärke-Regler + Pille „Mitreden“ (Mikro-Icon, 32 px, Feld-Stil). Kapitel als Pillen (Radius 8, aktuelles heller umrandet). Transkript max. 300 px scrollbar: Name 12 px 600 in sanfter Sprecherfarbe (blau/rosa/grün), Text 14 px grau, aktueller Beitrag weiß auf leicht hellerer Fläche (Radius 10); eigene Frage gestrichelt umrandet mit „Du“. Schmal: Regler schrumpft, nichts bricht um.
- **PDF-Fenster** (`.pv`): Fenster wie „Neuer Agent“ (Menü-Rand, Radius 16, Schatten, Hintergrund abgedunkelt), Kopf 54 px: rot getöntes Datei-Icon, Name 14 px 600 + „18 Seiten“, rechts − / + / × (30 px, Radius 8). Seiten weiß, Radius 6, Abstand 14, Schimmer beim Laden; unten mittig „3 / 18“ als Pille. Auf dem Handy volle Fläche.
- **Pixel-Hunde** im groben 32er-Raster; Größen nur 32/24/20 (andere Größen gibt es nicht → Fehler).

- **Stufen-Auswahl** (`.st-seg`, Einstellungen): gewählte Stufe hellgrau gefüllt (#2e2e2e) ohne Umrandung – wie der Erstellen-Schalter. Home-Kästchen: Rand 1 px.
- **Home-Karten** (`.hm-*`, 07.11.): Fläche #181818 mit feiner Schraffur (−45°, 1 px Linie alle 8 px, 7 % Kartenton), Rand 22 % Kartenton, Radius 12, 62 px hoch; Icon-Kachel 34 px Radius 10 (#212121, Rand #242424); Knopf als graue Pille (#212121, 28 px); X dezent. Kartenton: Akzent, grün #3fb57d (gleich/läuft), rot #ef6b5f (Alarm/überfällig), grau (Dokument). Ansichtswechsel aus der Sidebar/den Karten über `window.softSwitch` (View Transitions: alt 160 ms ausblenden, neu 260 ms einblenden; eigene Ansichts-Animationen solange aus, `html.vt-on`).
