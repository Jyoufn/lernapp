# Hinweise für Claude

**Zuerst `kb/00-start.md` lesen** (kurz) – dort steht, welche Datei der Wissensbasis zur Aufgabe passt. Nur diese eine lesen, dann gezielt per `grep` in den Code springen statt ganze Dateien zu lesen.

- UI-Änderungen: vorhandene Bausteine/Klassen wiederverwenden (Knöpfe, Menüs `.lb2-menu`/`.tk-menu`, Umschalter `.cs-pill`, Listen `.lb2-row` …), keine neuen erfinden. Vorher `kb/design.md` → **DESIGNSCHEMA** (drei Flächen #141414 / #181818 / #212121, Ränder #242424, keine Schatten, kein Schwarz). Neue Stile nur ans Ende von `style.css`. Schrift immer als `var(--font-ui, Inter)` schreiben (wählbare Schriftart), nie fest `Inter`.
- Icons über `#f-<name>` (Form kommt aus `line-icons.js`: runde Linien-Icons), keine Emojis. Oberfläche nur auf Deutsch.
- Neue Bausteine erst nach Absprache; danach den aktuellen Stand kurz in `kb/` eintragen (keine Chronik, alte Aussagen ersetzen).
- Neue Browser-Dateien in `app-server.js` → `PUBLIC_FILES` eintragen.
- Danach `npm run check` und `npm test`.
