# Dateien – wo steht was

## Browser (Reihenfolge wird in `index.html` → `<template id="appScripts">` geladen, gestartet von `auth.js`)
| Datei | Inhalt / wichtige Funktionen |
|---|---|
| `index.html` | Gerüst, Linien-Icons der Sidebar (`#o-…`), alte Icons (`#i-…`), Sidebar-Einträge `data-nav` |
| `auth.js` | Anmeldung (Vorschau links, Formular rechts), lädt Browser-Speicher aus dem Konto, startet App-Skripte |
| `settings.js` | Einstellungen in der Sidebar: Tabs `general` (Allgemein, Workspaces), `look` (Aussehen), `agents` (Verbindung: API-Keys + Rolle je Anbieter „Haupt-KI“/„Als Ersatz“/„Bild-KI“), `saved` (Gespeichert). Erweiterbar über `window.SettingsHooks` ({page, order, html, click, input, change}); `Settings.open('agents')`, `Settings.redraw()` |
| `icons.js` | `FadeIcons` (gefüllt, `#f-…`) und `DocIcons` (`#d-…`, nur Dokument-Icons) |
| `app.js` (~5500 Z.) | Tabs (`createTab`, `activateTab`, `isDraft`, `openViewTab`, `openDocTab`), Sidebar (`renderSideChats`), Chat-Stream (`sendMessage` → SSE), Zeitleiste (`createWork`, `stepLine`, `startStage`/`endStage`, `phase`), Funde (`linksFigure`), Quellen (`siteIcon`, `sourceChip`, `fillChips`, `mainSources`, `placeSourceStack`, `openSourcesModal`), Rückfragen (`showAskPanel`, `parseAskBlock`), Karten (`keyCard`, `errorCard`, `resumeCard`, `agentSuggestCard`), Visuals (`chartFigure`, `mindmapFigure`, `timelineFigure`), Chatverlauf (`chatsView`), Umschalter „Erstellen“ (`createSwitch`), `AppActions` (Sprach-Agent) |
| `thinking.js` | Hauptstatus/Unterpunkte der Zeitleiste je Agent (`FLOWS`) und je Format (`FORMATS`), `formatOf`, `blockFormat`, `statsOf` |
| `pixel-dogs.js` | Pixel-Hunde/Bär (Raster 32/24/20), Hero im leeren Chat, Hund am Eingabefeld, Agenten-Feld (`makePicker`), `PixelDogs.actor` (Hund neben dem Status), `UNAVAILABLE` |
| `chat-visuals.js` | Prüft/normalisiert Daten der Blöcke chart, mindmap (Baum), timeline |
| `stock-chart.js` | Aktienchart (```stock), Prognose-Fächer |
| `chancen-card.js` | Chancen-Karten (```chancen) |
| `boerse-bestand.js` | „Meine Käufe“ / Depot-Karte |
| `praesentation.js` | Präsentation (```praesentation): Vorschau, PPTX-/PDF-Schreiber, Bearbeiten-Fenster |
| `lernset.js` | Lernsets (```lernset): `parse`, `figure` (Chat), `deck` (Karteikarten-Stapel), `quiz`, `exam`, `open` (Vollbild), `dialog` (Erstellen-Fenster), `pickMention`, `sectionsOf` |
| `home.js` | Home: „Als Nächstes“-Karten (`Home.render/refreshBoerse`) |
| `ui-design.js` | Ansicht „UI Design“: Katalog aller Bausteine mit echten Klassen (`window.UIDesign`, `VIEW_TABS.uidesign`) |
| `docs.js` | Home-Liste (`list`), Editor (`editor`: `draw`, Fokusmodus `setFocus`), Dokument-Chat rechts (`drawDocChat`), `Docs.create/open/discard/isEmpty` |
| `docblocks.js` | Slash-Menü und Blöcke im Dokument (Tabelle, Medien, Kalender, Zeit, Dashboard, Karte, Diagramme, Board) |
| `tasks.js` | Aufgaben: `createBoard(store, {agents, list})`; Liste (`row`, `toggleRow`, `renderList`), Fenster (`edit`: Pillen date/sched/prio/tags/agent/auto/limit), Automatisierung (`syncAuto`), Agenten-Lauf (`startRun`, `pull`) |
| `calendar.js` | Wochenansicht (`render`, `layoutDay`, `band` für ganztägig), Tagesfenster (`drawDay`), Termin-Fenster (`edit`) |
| `ui-kit.js` | `foldRows`, `autoGrow`, `timeWheel`, `miniCalendar`, `colorRow`, `colorPicker`, `timeGroups` (Zuletzt/Gestern/…) |
| `search.js` | ⌘K-Palette, Workspace-Menü (`window.Workspaces`) |
| `workspace-invite.js`, `music.js`, `timer.js`, `code-agent.js` | Einladung, Musik, Timer, Coding-Anzeige (alter Datei-Modus) |
| `code-box.js` | Mini-Apps (```widget): `parse`, `figure` (Kasten, Dashboard-Kacheln, Code-Ansicht), `srcdoc` (Sandbox + Grundstile + Laufzeit), `start/stop` (iframes, Wächter, Pause), Gespeichert (`codebox.saved.v1`), Design (`codebox.design.v1`), ```einstellung (`applySetting`), `render` (Haken aus `renderMarkdown`) |
| `chat-bg.js` | Animierter Chat-Hintergrund (`chatbg.v1`): Leinwand-Szenen, eigener Code (```hintergrund) im iframe, Einstellungs-Abschnitt |
| `podcast.js` | Podcasts im Chat (```podcast): `parse`, `figure(data, { onChange })` (Player, Transkript, Mitreden; Ton über `/api/podcast/audio`, Ersatz Gerätestimmen), `pending` (Warte-Karte) |
| `agent-builder.js` | Eigene Agenten (`agents.custom.v1`): Fenster „Neuer Agent“ (Einrichtungs-Chat), Profil-Karte (```agentprofil), `window.agentPayload` (agent/custom/setup/look an jede Anfrage), Liste in Einstellungen → Agenten |
| `style.css` (~8900 Z.) | Alle Stile; ältere Schichten oben, **gültig ist das Ende** |

## Server
| Datei | Inhalt |
|---|---|
| `app-server.js` | HTTP-Server/Handler, `PUBLIC_FILES`, alle `/api/…`-Routen, Doc-KI (`DOC_SYSTEM`), Titel (`TITLE_SYSTEM`), Cron für Automatisierungen |
| `api/index.js`, `vercel-build.js`, `vercel.json` | Vercel-Funktion und Build nach `public/` |
| `lib/workflow.js` | **Chat-Ablauf** `runChat`: Analyse (`ANALYZE_SYSTEM`, `analyze`), Aufwand, Recherche, Google-Suche (`TIME_SENSITIVE`), Entwurf/Prüfung (`VERIFY_SYSTEM`), Prompts (`BASE_PROMPT`, `AGENT_PROMPT`), `prepareBody`, Statusereignisse |
| `lib/providers.js` | Gemini-Stream/-Once, Modell-Leiter (`ladder`), Schlüssel (`keysOf`, `geminiKey`), Limits (`markLimited`, geteilt über `ai:limits`), Anbieter-Phasen (`familyFor`, `textTask`, `smallJsonTask`), MiniMax/DeepSeek/Kimi über NVIDIA (`openaiChat`, `thinkExtra`, `FAMILY_MODELS`) |
| `lib/research.js`, `lib/web.js`, `lib/deepresearch.js` | Quellen-Suche (Wikipedia, OpenAlex), Websuche/Seiten lesen (`searchWeb`, `findVisuals`, `linkPreview` für `/api/link`), Tiefen-Recherche |
| `lib/boerse.js`, `lib/radar.js`, `lib/holdings.js`, `lib/universe.js` | Börse: Kurse/Charts/Nachrichten (`contextFor` → `steps`), Chancen-Radar, Orderbuch/Depot, Aktienliste |
| `lib/lernset.js` | Lernset-Prompt `PROMPT(spec)`, Wunsch-Erkennung `ASK`, Klausur-Korrektur `grade` (`/api/lernset/grade`) |
| `lib/thoughts.js` | Gedanken-Filter (nur Inhalt, Deutsch) und Antwort-Wächter (kein Vorgehen im Text) |
| `lib/agenttasks.js` | Aufgaben im Hintergrund (`run` mit `noClarify`), Automatisierungen (`saveAuto`, `runDue`, `nextRun`, Limit) |
| `lib/accounts.js`, `lib/store.js`, `lib/workspaces.js` | Konten/Sitzungen, Speicher (Redis/Dateien/Speicher), geteilte Workspaces |
| `lib/codeloop.js`, `lib/codecheck.js`, `lib/apptest.js` | Coding-Agent (gesperrt) |
| `tests/*.test.js` | `node --test`, Mocks in `tests/mock.js` |
