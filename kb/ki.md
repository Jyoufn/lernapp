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

## Denk-Zeitleiste (Client, `app.js` + `thinking.js`)
- **Nur echte Schritte**: Keine Zeile für „Verstehen“ (steht nur im Kopf), kein erfundenes „Analysieren“ nach der Suche, keine „Risiko bewerten“-Zeile ohne Rechnung.
- Suche ohne Treffer oder fehlgeschlagen → der Schritt verschwindet ganz (kein „keine Quellen gefunden“).
- Gefundene Quellen hängen als Chips direkt am Such-Schritt.
- Bezeichnungen deutsch: Kopf z. B. Verstehen / Nachdenken / Recherchieren / Kochen / Arbeiten / Prüfen / Malen / Fertig, je Format eigene (Präsentation erstellen, Mindmap bauen …).

## Quellen
- Nummerierte Belege [1], [2] im Text werden entfernt; unten an der Antwort stehen nur **zitierte** Quellen (`mainSources`, bei vielen nur die tragenden).
- Google-Grounding: Server meldet nur Chunks, auf die `groundingSupports` zeigen (= wirklich benutzt). Hat die Antwort keine nummerierten Belege, stehen diese unten.
- Ohne Suche: gar nichts (keine Leiste, kein Hinweis).
- Anzeige unten: rundes Logo (`/api/icon?domain=`) + Domain, max. 2, dann „+N“; Klick → Fenster mit allen.
- Deutsche Quellen haben Vorrang (`isGerman`, `rankGerman`); Fachliteratur (OpenAlex) nur beim Lern-Agenten.

## Regeln im Prompt (Auswahl)
- Bei Diagramm-Wünschen nie nach der Form fragen (Typ wählt `bestType`: Zeitverlauf → Linie, sonst Ring).
- Nie Code zum Selberzeichnen (matplotlib o. Ä.); Diagramme/Zeitstrahl/Mindmap nur als Block. Mindmap nur Stichpunkte, Zeitstrahl ohne Limit, keine `source`-Felder.
- Jeder Chat ist für sich; Bilder nur bei Bedarf/Wunsch; Rückfragen nur, wenn wirklich etwas fehlt; Hintergrund-Aufgaben nie mit Rückfragen.
- Präsentationen (Lern-Agent) immer mit echten Quellen und echten Fotos (Wikimedia).
