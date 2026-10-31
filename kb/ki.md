# KI – Ablauf, Prompts, Quellen, Denk-Schritte

## Wo die Prompts stehen
| Wo | Was |
|---|---|
| `lib/workflow.js` → `BASE_PROMPT`, `AGENT_PROMPT` | Ton, Aufbau, Blöcke, Regeln je Agent |
| `lib/workflow.js` → `ANALYZE_SYSTEM` | Planung: clarify, effort, simple, think, research, web, verify, points, Suchbegriffe |
| `lib/workflow.js` → `VERIFY_SYSTEM`, `JUDGE_SYSTEM` | Prüfung von Entwurf und Quellen |
| `app-server.js` → `TITLE_SYSTEM`, `DOC_SYSTEM`, `DOC_FORMAT` | Chat-Titel, Dokument-KI (`/api/doc-ai`) |
| `lib/workflow.js` → `VOICE_PROMPT` | Sprach-Agent mit ```app-Aktionen |
Darstellung von Blöcken ändert man in `app.js`/`style.css`, nicht in den Prompts.

## Ablauf einer Antwort (`runChat`)
1. Kurznachricht („Moin“) → direkt antworten, keine Zeitleiste (`quiet`).
2. Material (Fotos/PDF) prüfen (`material`) – Material hat Vorrang.
3. **Planung** (`thinking`, `analyze`): Die KI entscheidet hier, welche Schritte nötig sind – `research` (Quellen), `web` (Websites), `verify` (Prüfung), `think` (Nachdenken). Prompt-Regel: jeder eingeschaltete Schritt wird angezeigt → nur einschalten, was wirklich nötig ist. Börse: fester Plan statt Analyse (`BOERSE_PLAN`).
4. Börse: `market` (Kurse/Charts/Nachrichten) – Server meldet die tatsächlich gerechneten Schritte (`steps` aus `lib/boerse.js`), nur Schritte mit Ergebnis.
5. Websites (`browsing`) bzw. Nachschlagewerke/Fachliteratur (`searching_sources`), Research: Tiefen-Recherche.
6. Optional Entwurf + Prüfung (`processing`, `verifying`), dann Antwort (`answering`).
7. Google-Suche im Modell (Grounding) nur bei Aktuellem (`TIME_SENSITIVE`, ganze Wörter) oder Research/Lernen-mit-Bild.

## Denken (verbindlich – nicht zurückbauen, außer der Nutzer will es)
- Modell: **Gemini 2.5 Flash** hat echtes Reasoning; `thinkingBudget` 0 = aus, sonst Obergrenze (Ersatzmodelle 3.x: `thinkingLevel`).
- **Denken nur, wenn es die Antwort besser macht** (`thinkNeeded` in `runChat`): Die Analyse setzt `think`. Aus (Budget 0, keine Gedanken-Anzeige) bei
  einfachen E-Mails/Nachrichten, Übersetzungen, Definitionen, Fakten, Low/Schnell. An bei `think`, Recherche mit Quellen, Rechnen/Prüfung/
  Textanalyse/Vergleich, Lernen ab High, ausdrücklich High/Max (außer ganz einfache Frage), Coden, Börse. Ohne Analyse: ab High.
- **Gedanken-Anzeige** (`lib/thoughts.js`, `createThoughtFilter`): Geminis Zusammenfassungen je **Abschnitt** – reine Form-/Gliederungs-
  Gedanken („Refining the format“, „Structuring the response“, „Analyzing the approach“) fallen weg; inhaltliche werden sinngetreu und knapp
  ins Deutsche übertragen (kleiner Modellaufruf). Klappt das nicht → Abschnitt wird nicht gezeigt (nie Englisch, nie Erfundenes).
  Der erste Antworttext wartet, bis alle Gedanken gemeldet sind.
- **Antworttext ohne Vorgehen**: Prompt-Regel „NUR DAS ERGEBNIS“ + `createAnswerGuard` (verwirft Vorgehens-Absätze nur am Antwortanfang).
  Nie wieder Denk-Anweisungen („denke auf Deutsch mit Überschriften“) in den System-Prompt schreiben – Gemini schreibt sie sonst in die Antwort.

## Denk-Zeitleiste (Client, `app.js` + `thinking.js`)
- **Nur echte Schritte**: Keine Zeile für „Verstehen“ (steht nur im Kopf), kein erfundenes „Analysieren“ nach der Suche, keine „Risiko bewerten“-Zeile ohne Rechnung.
- Suche ohne Treffer oder fehlgeschlagen → der Schritt verschwindet ganz (kein „keine Quellen gefunden“).
- Gefundene Quellen hängen als Chips direkt am Such-Schritt.
- Nach einer Websuche heißt der Schritt „Quellen analysieren“ (Google-Suche des Modells: „Quellen analysiert · N“). Chips zeigen nur Seiten, die der Server als passend behalten hat.
- Bezeichnungen deutsch: Kopf z. B. Verstehen / Nachdenken / Recherchieren / Kochen / Arbeiten / Prüfen / Malen / Fertig, je Format eigene (Präsentation erstellen, Mindmap bauen …).

## Quellen
- Nummerierte Belege [1], [2] im Text werden entfernt; unten an der Antwort stehen nur **zitierte** Quellen (`mainSources`, bei vielen nur die tragenden).
- Google-Grounding: Server meldet nur Chunks, auf die `groundingSupports` zeigen (= wirklich benutzt). Hat die Antwort keine nummerierten Belege, stehen diese unten.
- Ohne Suche: gar nichts (keine Leiste, kein Hinweis).
- Anzeige unten: rundes Logo (`/api/icon?domain=`) + Domain, max. 2, dann „+N“; Klick → Fenster mit allen.
- **Nur passende Quellen** (verbindlich): Websites und deutsche Lernseiten laufen nach dem Wortabgleich durch `judgePages` (Modell-Bewertung, < 6 von 10 fällt weg); in `lib/research.js` fällt < 6 weg und Unbewertetes wird nicht übernommen. Lieber keine Quelle als eine fremde.
- Deutsche Quellen haben Vorrang (`isGerman`, `rankGerman`); Fachliteratur (OpenAlex) nur beim Lern-Agenten.

## Länge / Max (verbindlich, nicht wieder einbauen!)
- **Max hat kein Längen-/Kontextlimit**: 65 536 Tokens je Runde, 12 Weiterschreib-Runden, Verlauf bis 40 Nachrichten/600 000 Zeichen (`compactHistory(…, {max})`); Vercel-Zeitlimit → die App schreibt bei Max automatisch weiter (bis 8×). Prompt `EFFORT_STYLE.max`: lange Texte vollständig, nie kürzen. High: 65 536 Tokens, 6 Runden.
- Bei neuen Systemen darauf achten, dass diese Grenzen nicht wieder gekappt werden.

## Regeln im Prompt (Auswahl)
- Prompts, E-Mails, Nachrichten, Briefe zum Weiterverwenden → Block ```kopie (ohne Titelzeile; E-Mail: „Betreff: …“ zuerst) → Kopier-Kasten ohne Kopf/Trennstrich, Betreff abgesetzt, „Kopieren“ oben rechts (`copyFigure` in `app.js`). Ein kurzer Einleitungssatz steht davor im Text.
- Bildbitte mit Fotos/PDF: Reihenfolge strikt „Deine Dateien ansehen“ → „Bild erzeugen“ (`picWaitsForFiles`); kommt der Bild-Block mitten im Text, startet der Bild-Schritt + Malen sofort.
- Stichpunkte sind erlaubt, wo sie passen (gemischt mit Fließtext) – nicht alles Fließtext, nicht alles Stichpunkte.
- Bei Diagramm-Wünschen nie nach der Form fragen (Typ wählt `bestType`: Zeitverlauf → Linie, sonst Ring).
- Nie Code zum Selberzeichnen (matplotlib o. Ä.); Diagramme/Zeitstrahl/Mindmap nur als Block. Mindmap nur Stichpunkte, Zeitstrahl ohne Limit, keine `source`-Felder.
- Jeder Chat ist für sich; Bilder nur bei Bedarf/Wunsch; Rückfragen nur, wenn wirklich etwas fehlt; Hintergrund-Aufgaben nie mit Rückfragen.
- Präsentationen (Lern-Agent) immer mit echten Quellen und echten Fotos (Wikimedia).

- Aufgaben-Ergebnis als Dokument (`mdToHtml` in `lib/agenttasks.js`): ```illustration/chart/mindmap/timeline/stock-Blöcke werden `<div data-viz>`-Grafiken (die App zeichnet/erzeugt sie beim Öffnen), nicht Text.
- Tabellen: bei Vergleichen (3+ Kriterien) und Bestandteilen mit Funktion eine knappe Tabelle statt langer Liste (Regel in `lib/workflow.js`).
