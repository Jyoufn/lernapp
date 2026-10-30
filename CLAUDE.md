# Hinweise für Claude

**Zuerst `kb/00-start.md` lesen** (kurz) – dort steht, welche Datei der Wissensbasis zur Aufgabe passt. Nur diese eine lesen, dann gezielt per `grep` in den Code springen statt ganze Dateien zu lesen.

- UI-Änderungen: vorher `kb/design.md`. Neue Stile nur ans Ende von `style.css`.
- Icons aus `icons.js` (`#f-<name>`), gefüllt; keine Emojis. Oberfläche nur auf Deutsch.
- Neue Bausteine erst nach Absprache; danach den aktuellen Stand kurz in `kb/` eintragen (keine Chronik, alte Aussagen ersetzen).
- Neue Browser-Dateien in `app-server.js` → `PUBLIC_FILES` eintragen.
- Danach `npm run check` und `npm test`.
