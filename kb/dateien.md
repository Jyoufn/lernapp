# Dateien – wo steht was

## Browser (Reihenfolge wird in `index.html` → `<template id="appScripts">` geladen, gestartet von `auth.js`)
| Datei | Inhalt / wichtige Funktionen |
|---|---|
| `index.html` | Gerüst, Linien-Icons der Sidebar (`#o-…`), alte Icons (`#i-…`), Sidebar-Einträge `data-nav` |
| `auth.js` | Anmeldung (Vorschau links, Formular rechts), lädt Browser-Speicher aus dem Konto, startet App-Skripte |
| `settings.js` | Einstellungen in der Sidebar: Tabs `general` (Allgemein, Workspaces), `look` (Aussehen), `agents` (Verbindung/API-Keys). `Settings.open('agents')` |
| `icons.js` | `FadeIcons` (gefüllt, `#f-…`) und `DocIcons` (`#d-…`, nur Dokument-Icons) |
| `app.js` (~5500 Z.) | Tabs (`createTab`, `activateTab`, `isDraft`, `openViewTab`, `openDocTab`), Sidebar (`renderSideChats`), Chat-Stream (`sendMessage` → SSE), Zeitleiste (`createWork`, `stepLine`, `startStage`/`endStage`, `phase`), Quellen (`siteIcon`, `sourceChip`, `fillChips`, `mainSources`, `placeSourceStack`, `openSourcesModal`), Rückfragen (`showAskPanel`, `parseAskBlock`), Karten (`keyCard`, `errorCard`, `resumeCard`, `agentSuggestCard`), Visuals (`chartFigure`, `mindmapFigure`, `timelineFigure`), Chatverlauf (`chatsView`), Umschalter „Erstellen“ (`createSwitch`), `AppActions` (Sprach-Agent) |
| `thinking.js` | Hauptstatus/Unterpunkte der Zeitleiste je Agent (`FLOWS`) und je Format (`FORMATS`), `formatOf`, `blockFormat`, `statsOf` |
| `pixel-dogs.js` | Pixel-Hunde/Bär (Raster 32/24/20), Hero im leeren Chat, Hund am Eingabefeld, Agenten-Feld (`makePicker`), `PixelDogs.actor` (Hund neben dem Status), `UNAVAILABLE` |
| `chat-visuals.js` | Prüft/normalisiert Daten der Blöcke chart, mindmap (Baum), timeline |
| `stock-chart.js` | Aktienchart (```stock), Prognose-Fächer |
| `chancen-card.js` | Chancen-Karten (```chancen) |
| `boerse-bestand.js` | „Meine Käufe“ / Depot-Karte |
| `praesentation.js` | Präsentation (```praesentation): Vorschau, PPTX-/PDF-Schreiber, Bearbeiten-Fenster |
| `docs.js` | Bibliothek (`list`), Editor (`editor`: `draw`, Fokusmodus `setFocus`), Dokument-Chat rechts (`drawDocChat`), `Docs.create/open/discard/isEmpty` |
| `docblocks.js` | Slash-Menü und Blöcke im Dokument (Tabelle, Medien, Kalender, Zeit, Dashboard, Karte, Diagramme, Board) |
| `tasks.js` | Aufgaben: `createBoard(store, {agents, list})`; Liste (`row`, `toggleRow`, `renderList`), Fenster (`edit`: Pillen date/sched/prio/tags/agent/auto/limit), Automatisierung (`syncAuto`), Agenten-Lauf (`startRun`, `pull`) |
| `calendar.js` | Wochenansicht (`render`, `layoutDay`, `band` für ganztägig), Tagesfenster (`drawDay`), Termin-Fenster (`edit`) |
| `ui-kit.js` | `foldRows`, `autoGrow`, `timeWheel`, `miniCalendar`, `colorRow`, `colorPicker`, `timeGroups` (Zuletzt/Gestern/…) |
| `search.js` | ⌘K-Palette, Workspace-Menü (`window.Workspaces`) |
| `workspace-invite.js`, `music.js`, `timer.js`, `code-agent.js` | Einladung, Musik, Timer, Coding-Anzeige |
| `style.css` (~8900 Z.) | Alle Stile; ältere Schichten oben, **gültig ist das Ende** |

## Server
| Datei | Inhalt |
|---|---|
| `app-server.js` | HTTP-Server/Handler, `PUBLIC_FILES`, alle `/api/…`-Routen, Doc-KI (`DOC_SYSTEM`), Titel (`TITLE_SYSTEM`), Cron für Automatisierungen |
| `api/index.js`, `vercel-build.js`, `vercel.json` | Vercel-Funktion und Build nach `public/` |
| `lib/workflow.js` | **Chat-Ablauf** `runChat`: Analyse (`ANALYZE_SYSTEM`, `analyze`), Aufwand, Recherche, Google-Suche (`TIME_SENSITIVE`), Entwurf/Prüfung (`VERIFY_SYSTEM`), Prompts (`BASE_PROMPT`, `AGENT_PROMPT`), `prepareBody`, Statusereignisse |
| `lib/providers.js` | Gemini-Stream (`geminiStream`, Grounding nur benutzte Quellen), `geminiOnce`, NVIDIA |
| `lib/research.js`, `lib/web.js`, `lib/deepresearch.js` | Quellen-Suche (Wikipedia, OpenAlex), Websuche/Seiten lesen, Tiefen-Recherche |
| `lib/boerse.js`, `lib/radar.js`, `lib/holdings.js`, `lib/universe.js` | Börse: Kurse/Charts/Nachrichten (`contextFor` → `steps`), Chancen-Radar, Orderbuch/Depot, Aktienliste |
| `lib/agenttasks.js` | Aufgaben im Hintergrund (`run` mit `noClarify`), Automatisierungen (`saveAuto`, `runDue`, `nextRun`, Limit) |
| `lib/accounts.js`, `lib/store.js`, `lib/workspaces.js` | Konten/Sitzungen, Speicher (Redis/Dateien/Speicher), geteilte Workspaces |
| `lib/codeloop.js`, `lib/codecheck.js`, `lib/apptest.js` | Coding-Agent (gesperrt) |
| `tests/*.test.js` | `node --test`, Mocks in `tests/mock.js` |
