# Wissensbasis LernApp – Einstieg (zuerst lesen)

Kurzfassung des Projekts für Claude, damit nicht jedes Mal der ganze Code gelesen werden muss.
**Nur die Datei lesen, die zur Aufgabe passt** – danach gezielt mit `grep` in den Code springen.

| Aufgabe | lesen |
|---|---|
| Aussehen ändern (Farben, Abstände, Menüs, Karten, Animation) | `design.md` |
| Wo steht was im Code? | `dateien.md` |
| Wie funktioniert Feature X heute (Chat, Aufgaben, Kalender, Börse …) | `funktionen.md` |
| KI-Verhalten, Prompts, Blöcke, Quellen, Denk-Schritte | `ki.md` |
| Vercel, Konten, Umgebungsvariablen, Zeitplan | `betrieb.md` |
| Was wurde ausprobiert und abgelehnt? | `entscheidungen.md` |

## Das Projekt in 5 Sätzen
- Lern-App „Agenten“ des Nutzers (Julian, Schüler, nutzt sie vor allem auf dem **iPad**), Repo `Jyoufn/lernapp`, läuft auf **Vercel**.
- Reines HTML/CSS/JS ohne Framework, Node-Server `app-server.js` (auf Vercel über `api/index.js`), Speicher Upstash Redis.
- KI-Chat mit 5 Agenten (Pixel-Hunde): Allgemein, Lernen, Research, Coden (gesperrt), Börse (Bär). Dazu Dokumente (Notion-artig), Aufgaben, Kalender, Workspaces.
- Modelle: Gemini (Standard) und Nemotron über NVIDIA; Schlüssel pro Konto in den Einstellungen.
- **Oberfläche komplett auf Deutsch** (keine englischen Beschriftungen, auch nicht in der Denk-Zeitleiste).

## Arbeitsweise (verbindlich)
1. Vor UI-Änderungen `design.md` lesen. Neue Stile **nur ans Ende von `style.css`** (Block „FESTGELEGTER STIL“ reicht bis zum Dateiende; neuere Regeln weiter unten gewinnen). Jeder neue Block bekommt einen Kommentar-Kopf mit Datum.
2. Icons aus `icons.js` (`#f-<name>`, gefüllt), **keine Emojis**. Verfügbare Namen: siehe `design.md`.
3. Neue Browser-Datei → in `app-server.js` bei `PUBLIC_FILES` eintragen.
4. Neue Bausteine erst nach Absprache; danach kurz in `funktionen.md` / `design.md` eintragen (aktueller Stand, keine Chronik).
5. Danach `npm run check` und `npm test` (alles grün), sichtbare Änderungen mit Playwright-Screenshot prüfen.
6. Commit auf `main`, `git pull --rebase`, `git push`. Commit-Fußzeile laut Sitzungs-Anweisung.

## Testen im Container
- Server: `LOGIN_EMAIL=test@test.de LOGIN_PASSWORD=testtest123 PORT=3000 node app-server.js`
- Beenden: `for p in $(pgrep -f "^node app-server.js"); do kill $p; done` (nicht `pkill -f`, das trifft die eigene Shell).
- Playwright: `NODE_PATH=$(npm root -g) node script.js`; Anmelden über das Formular (`input[type=email]`, `input[type=password]`, Enter).
- Navigation: `document.querySelector('[data-nav="tasks|calendar|docs|history|new"]').click()`.
- Testdaten: `localStorage` `tasks.v1`, `tasks.tags.v1`, `calendarEvents`; danach neu laden.
- Ohne Internet: cdnjs (marked, KaTeX) und Favicons laden nicht → Markdown roh, Buchstaben statt Logos. Echte KI/Kurse gibt es im Container nicht – mit Mocks testen (`tests/mock.js`).

## Wie der Nutzer kommuniziert
- Diktiert auf Deutsch, oft viele Punkte in einer Nachricht → als Liste abarbeiten, am Ende kurz auf Deutsch berichten (was geändert, wo abgewichen).
- Mag: ruhig, dunkel, sauber ausgerichtet, weiche Animationen, wenig Text. Mag nicht: graue Flächen bei Auswahl, blaue Hintergründe bei Auswahl, Tooltips, englische Texte, „KI-Look“.
