# Design – verbindliche Regeln (aktueller Stand)

## Grundsätze
- Dunkel und ruhig; Kontrast über Helligkeit von Text/Icons, nicht über Farbe. Nicht „KI-haft“: keine Deko-Verläufe, kein Glow, kein Lila, keine Emojis.
- **Blau nur als Akzent**: Hauptknopf, Haken einer Auswahl, Wichtigstes im Diagramm. Alles andere grau.
- **Auswahl = blauer Haken, keine Fläche** (weder grau noch blau hinterlegt). Beim Antippen nichts grau (`-webkit-tap-highlight-color: transparent`), beim Fokus kein Rand, nichts wird heller, nichts schrumpft beim Drücken. Gilt auch für Auswahl-Knöpfe, Antwort-Optionen und Eingabefelder (z. B. im Lernset): Antippen/Öffnen ändert weder Rand noch Fläche.
- Keine Browser-Tooltips (`title` wird von `app.js` automatisch entfernt).
- Eng statt luftig, alles sauber auf gleicher Höhe/Kante ausgerichtet. Texte auf **Deutsch**.

## Farben (CSS-Variablen)
| Zweck | Wert |
|---|---|
| Hauptkasten | `--main-bg` #171717 |
| Sidebar | `--sidebar-bg` #141414 |
| Menü/Popover | `--menu-bg` #202020, Rand `--menu-border` #343434, Hover `--menu-hover` #2b2b2b |
| Eingabefeld-Stil (Karten wie Agent-Empfehlung) | `--field-bg`, `--field-border` |
| Karten (Börse, Aufgaben-Fenster) | ~1,5–4 % heller als `--main-bg`, Rand `rgba(255,255,255,.08–.1)`, Radius 14 |
| Text | `--text` #f2f2f2 · `--text-2` #e6e6e6 · `--text-3` #a3a3a3 · `--text-4` #6e6e6e |
| Akzent | `--accent` #2f86ff (heller Text-Akzent #6aa8ff) |
| Gefahr | #f07a6e / #e5705f, Fläche `rgba(239,107,95,.12–.14)` |
| Getönte Etiketten | Fläche = Farbe 12–13 %, Text = Farbe ~72 % + Weiß |
| Fach-/Termin-Farben | #6aa8ff #b49cff #f472b6 #f07a6e #f0913a #facc15 #4fcf8a #2dd4bf #a3a3a3 (`UIKit.COLORS`) |
Keine neuen Grautöne erfinden.

## Schrift und Maße
- Inter; Zahlen `tabular-nums`. Größen: 11 · 11.5 · 12 · **12.5 (Menüs)** · 13 · 13.5 (Sidebar) · 14 (Zeilentitel) · 15 (Abschnitt/Kalender-Kopf) · 18 (Seitentitel Chats/Bibliothek/Aufgaben). Stärke 400/500/600, nie 700+.
- Radien: 6–7 Menüzeile · 8 Knopf · 10 Menü/Suchfeld · 12–14 Karten/Fenster · 18 Eingabefeld/Pillen-Leisten.
- Höhen: Menüzeile 26–30 · Knopf 28–30 · Listenzeile Aufgaben 46 · Chat-Zeile 34–40.
- Scrollleisten: nur schmaler Balken, nie `scrollbar-width/-color` setzen (außer `none`).

## Icons
- `icons.js`: gefüllt, 16er-Raster, Details ausgespart; nur Lupe und einfache Zeichen (Pfeile, Plus, ×, Haken) als Linie. Farbe `currentColor`.
- HTML `<svg width="14" height="14"><use href="#f-NAME"/></svg>`, JS `fi('NAME', 14)` bzw. `FadeIcons.svg('NAME', 14)`.
- Namen u. a.: home inbox tasks calendar analytics chart search people user stack db settings file folder files file-plus book cap bulb sparkle bolt mic voice music volume clock timer bell star heart bookmark flag pencil pin trash copy chat chats image globe link terminal codewin list filter eye lock download tag cloud-up upload slides share refresh undo sidebar grip more target check-circle x-circle plus-circle alert play pause next prev stop power plus x check back forward chevron-down chevron-right arrow-up arrow-right send hash mindmap agent book-open sun moon coffee food gift briefcase leaf camera cart gamepad palette dumbbell car plane medical table divider list-num quote video callout gallery dashboard bars-h trend minus info sliders expand shrink kanban notebook pen clipboard calc sigma ruler. (Nicht vorhanden z. B. `hourglass` → `#d-hourglass` ist nur Dokument-Icon.)
- Sidebar nutzt Linien-Icons `#o-…` aus `index.html`.

## Animation
- Federkurve `--spring` = `cubic-bezier(0.16,1,0.3,1)`; für Auf-/Zuklappen `cubic-bezier(0.32,0.72,0,1)`.
- Hover 90–160 ms, Aufklappen 260–420 ms (nur über die Höhe, Inhalt blendet leicht mit), Einblenden 400–500 ms.
- Immer `prefers-reduced-motion` beachten. Nichts wackelt oder hüpft.

## Bausteine (so sehen sie heute aus)
- **Hauptknopf**: blau gefüllt, Radius 8, weißer Text („Neue Aufgabe“, „Neues Dokument“, „Neuer Chat“). Nebenknopf: Rand, keine Fläche. Löschen: rot transparent.
- **Bibliotheks-Liste** (`.lb2-*`): Zeilen ohne Kasten, feine Trennlinie (6 % Weiß), Hover `--menu-hover`; Kästchen 16 px Radius 5 links außerhalb der Zeile, gewählt = blauer Rand + Haken (keine Fläche); Chips 24 px mit Rand `--menu-border`, Radius 8; Menüs wie `.tk-box`.
- **Seitenköpfe** Chats/Bibliothek/Aufgaben: Titel 18 px links, blauer Knopf rechts, darunter Suchfeld (40 px, Radius 12, Fläche `--main-bg`, Icon 14).
- **Kalender-Kopf**: auf Höhe des Sidebar-Knopfs oben links, Trennstrich, „Oktober 2026“ 15 px; rechts „‹ Heute ›“ und „Neu“ gleich hoch.
- **Menüs/Aufklapp-Kästen** (`.tk-box`): `--menu-bg`, Rand `--menu-border`, Radius 10, Zeilen 30 px, Auswahl nur blauer Haken.
- **Fenster Aufgabe/Termin**: ohne × und ohne Kopftext; Titel, „Beschreibung hinzufügen“ (wächst, höchstens ~6 Zeilen, dann scrollt sie; das ganze Fenster höchstens Bildschirmhöhe und scrollbar), darunter Pillen-Zeilen (Icon + Text), die bündig einen Kasten aufklappen. Knopf unten rechts „Aufgabe erstellen“.
- **Inhalts-Kästen im Chat (verbindlich, wie Börse „Mein Depot“/Empfehlungen)**: Quiz steht in EINEM Kasten; Karteikarten und Probeklausur OHNE äußeren Kasten – Titel frei darüber, nur die Hauptfläche (Karte bzw. Klausur-Karte) hat diesen Ton. Kasten/Hauptfläche: Fläche `color-mix(in srgb, var(--main-bg) 98.5%, #fff)`, Rand `rgba(255,255,255,.065)`, Radius 14 (nicht runder), Titel oben links 15 px fett (600) mit grauem Icon, rechts kleine Icon-Knöpfe (Radius 7–8). Elemente darin (Karteikarte) nur einen Hauch heller (~96,5 %), grau – keine Farbtöne. Knöpfe wie ×, Mischen, Pfeile: Radius 8, nicht kreisrund.
- **Karten im Chat** (Agent-Empfehlung, Fehler, API-Key fehlt, Unterbrochen): Hund links, Titel + Satz, rechts ein Knopf; Fläche/Rand wie Eingabefeld. Nicht noch eine Karte im Muster „Icon links + Titel + Untertitel“ erfinden – der Nutzer will dafür bessere Lösungen.
- **Tags**: getönte Fläche 12 %, farbiger Text, ohne Punkt (Liste) – im Dokument mit Punkt.
- **Leisten oben mittig** (`.cs-pill`): runde Pille 36 px, Rand #2a2a2a, Fläche #1a1a1a; gewählt = weißer Text, sonst `--text-4`.
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
