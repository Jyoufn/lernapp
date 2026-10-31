# Design – verbindliche Regeln (aktueller Stand)

## Grundsätze
- Dunkel und ruhig; Kontrast über Helligkeit von Text/Icons, nicht über Farbe. Nicht „KI-haft“: keine Deko-Verläufe, kein Glow, kein Lila, keine Emojis.
- **Blau nur als Akzent**: Hauptknopf, Haken einer Auswahl, Wichtigstes im Diagramm. Alles andere grau.
- **Auswahl = blauer Haken, keine Fläche** (weder grau noch blau hinterlegt). Beim Antippen nichts grau (`-webkit-tap-highlight-color: transparent`), beim Fokus kein Rand, nichts wird heller, nichts schrumpft beim Drücken.
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
- **Seitenköpfe** Chats/Bibliothek/Aufgaben: Titel 18 px links, blauer Knopf rechts, darunter Suchfeld (40 px, Radius 12, Fläche `--main-bg`, Icon 14).
- **Kalender-Kopf**: auf Höhe des Sidebar-Knopfs oben links, Trennstrich, „Oktober 2026“ 15 px; rechts „‹ Heute ›“ und „Neu“ gleich hoch.
- **Menüs/Aufklapp-Kästen** (`.tk-box`): `--menu-bg`, Rand `--menu-border`, Radius 10, Zeilen 30 px, Auswahl nur blauer Haken.
- **Fenster Aufgabe/Termin**: ohne × und ohne Kopftext; Titel, „Beschreibung hinzufügen“ (wächst, höchstens ~6 Zeilen, dann scrollt sie; das ganze Fenster höchstens Bildschirmhöhe und scrollbar), darunter Pillen-Zeilen (Icon + Text), die bündig einen Kasten aufklappen. Knopf unten rechts „Aufgabe erstellen“.
- **Karten im Chat** (Agent-Empfehlung, Fehler, API-Key fehlt, Unterbrochen): Hund links, Titel + Satz, rechts ein Knopf; Fläche/Rand wie Eingabefeld. Nicht noch eine Karte im Muster „Icon links + Titel + Untertitel“ erfinden – der Nutzer will dafür bessere Lösungen.
- **Tags**: getönte Fläche 12 %, farbiger Text, ohne Punkt (Liste) – im Dokument mit Punkt.
- **Leisten oben mittig** (`.cs-pill`): runde Pille 36 px, Rand #2a2a2a, Fläche #1a1a1a; gewählt = weißer Text, sonst `--text-4`.
- **Quellen**: Chips in der Zeitleiste; unter der Antwort `src-stack` = nur Logos als abgerundete Quadrate (20 px, Radius 6, leicht überlappend, OHNE Namen), höchstens 3, dann „+N“, Klick → Quellenfenster.
- **Pixel-Hunde** im groben 32er-Raster; Größen nur 32/24/20 (andere Größen gibt es nicht → Fehler).
