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

## Ablauf einer Antwort (`runChat`) – GEMINI-NATIV (verbindlich seit 31.10.)
- **Allgemein, Lernen, Research und jede Frage mit Bild/PDF** (`native`): KEIN Planungs-Aufruf, KEIN Plan im Prompt, keine von uns entschiedene Denk-Abschaltung. Gemini denkt selbst so lange es braucht, fragt selbst nach (```ask, Regeln in `BASE_PROMPT`) und sucht selbst (Google-Suche im Modell) – der alte Ablauf (Planung → Plan-Punkte → „Vorgehen steht“) hat Gemini verbogen und Aufgaben falsch verstehen lassen.
  - Auto: Denken dynamisch (`autoThink`: 2.5 Budget −1, 3.x ohne `thinkingLevel` = Standard), Stil `EFFORT_STYLE.auto`. Gewählte Stufe: genau diese (Low ohne Denken).
  - Quellen nur bei ausdrücklichem Wunsch, Max, Präsentation, Aktuellem oder Research-Agent: Gemini-Suche (`geminiSearch`); **Lernen** holt dann deutsche Fachquellen über die eigene Suche – `analyze` liefert dort NUR Suchbegriffe.
  - Zeitleiste: Bild/PDF → „Dokumente analysieren“ (während Gemini liest/denkt) → „Antwort schreiben“; sonst `answering` mit `meta.think` („Nachdenken“).
- Börse, Coden, Sprache und Aufrufe ohne Agent: bisheriger Ablauf (Planung `analyze`, Börse fester Plan `BOERSE_PLAN`, Recherche-Pipeline, Tests).
- Schulstärke im `BASE_PROMPT`: „SCHULAUFGABEN“ (Aufgabe Wort für Wort lesen, Operatoren-Liste, Material-Belege, Musterlösung je „## Aufgabe N“); nie nach Fach/Klasse/Thema fragen. High/Max bei konkreter Aufgabe: beste Lösung GENAU dieser Aufgabe, kein Referat.

## Denken (verbindlich)
- Gemini 2.5: `thinkingBudget`; 3.x: `thinkingLevel` (ohne = dynamisch). Keine Denk-Anweisungen in den System-Prompt (Gemini schreibt sie sonst in die Antwort).
- **Gedanken-Anzeige live** (`lib/thoughts.js`): jeder fertige Gedanken-Abschnitt von Gemini erscheint sofort; Übersetzung ins Deutsche treu (nicht umgedeutet) in wenigen gebündelten Aufrufen (Warteschlange: was während einer Übersetzung ankommt, geht gesammelt in die nächste). Scheitert sie → Original. Weg fallen nur reine Formatierungs-Abschnitte. Der Antworttext wartet, bis alle Gedanken gezeigt sind.
- **Antworttext ohne Vorgehen**: „NUR DAS ERGEBNIS“ + `createAnswerGuard` (Vorgehens-Absätze und englische Gedanken-Überschriften wie „**Executing Task**“ am Anfang fallen weg).

## Denk-Zeitleiste (Client, `app.js` + `thinking.js`)
- Hauptstatus (Kopf): `swapText` blendet nur die eigene Text-Animation – NIE `getAnimations().cancel()` auf das Element (sonst bleibt der Schimmer mitten stehen).
- Antwort mit Denken: der Server meldet `answering` mit `meta.think` → Kopf zeigt gleich „Nachdenken“, der Schreib-Schritt erscheint erst mit dem ersten Text (kein Springen Schreiben → Nachdenken → Schreiben).
- **Nur echte Schritte**: Keine Zeile für „Verstehen“ (steht nur im Kopf), kein erfundenes „Analysieren“ nach der Suche, keine „Risiko bewerten“-Zeile ohne Rechnung.
- Suche ohne Treffer oder fehlgeschlagen → der Schritt verschwindet ganz (kein „keine Quellen gefunden“).
- Gefundene Quellen hängen als Chips direkt am Such-Schritt.
- Nach einer Websuche heißt der Schritt „Quellen analysieren“ (Google-Suche des Modells: „Quellen analysiert · N“). Chips zeigen nur Seiten, die der Server als passend behalten hat.
- Bezeichnungen deutsch: Kopf z. B. Verstehen / Nachdenken / Recherchieren / Kochen / Arbeiten / Prüfen / Malen / Fertig, je Format eigene (Präsentation erstellen, Mindmap bauen …).

## Material des Nutzers (hochgeladene Dateien) – verbindlich
- **Bild/PDF an DIESER Frage (`materialMode`)**: Gemini arbeitet selbst. KEIN Planungs-Aufruf, KEIN Vorab-Check (beide sahen die Bilder nicht und haben geraten → falsche Aufgabe), keine Websuche. Aufwand = gewählte Stufe, Auto = Gemini entscheidet (dynamisches Denken, so lange es braucht). Zeitleiste: „Dokumente analysieren“ läuft, solange Gemini liest/denkt, mit dem ersten Antworttext „Antwort schreiben“.
- Prompt `MATERIAL_PROMPT({only:'solo'})` + `MATERIAL_LOOK`: genau die genannte Seite/Aufgabe im Material suchen (nie eine andere oder ähnliche aus dem Gedächtnis), Operator lesen, Lösung je „## Aufgabe N“, keine Analyse-/Vorgehens-Abschnitte. Fehlt etwas im Material → ein Satz + gesichertes Schulwissen kenntlich. Rückfrage (```ask) NUR bei wirklich unklarer Aufgabenstellung, nie nach Fach/Klasse/Thema.
- **Nur Gemini, sobald Material im Verlauf ist** (`geminiOnly`): Groq/OpenRouter sehen keine Bilder und haben sonst eine andere Aufgabe erfunden. Auch abkühlende Gemini-Modelle/Schlüssel kommen als letzte Chance dran.
- ALLE Dateien einbeziehen: Namensschild „[Datei N: Name]“ (`fileParts`), Größenbudget statt Dateizahl (`fitMaterial` in `app.js`, Vercel ≤ 4,5 MB; PDF passt nicht → im Gerät gelesener Text via pdf.js 3.11, max. 60 000 Zeichen); was gar nicht passt → `materialDropped`, die KI sagt es.
- Älteres Material (frühere Nachrichten): Bezug auf die Dateien (`SOURCE_REF`) → Modus `first` (aus dem Material, keine Websuche); Rückfragen nach Fach/Thema/Klasse fallen weg.
- Antwort-Wächter (`lib/thoughts.js`): ein ganzer Absatz „**Executing Task**“/„**Task Analysis Confirmed**“ (englische Gedanken-Überschrift) am Anfang einer deutschen Antwort fällt weg.

## Recherche
- Research-Agent (mit Gemini): Gemini recherchiert selbst (Google-Suche im Modell), keine eigene Tiefen-Recherche. Lernen/Allgemein behalten die eigene Suche (deutsche Fachquellen, Relevanz-Prüfung).

## Quellen
- Nummerierte Belege [1], [2] im Text werden entfernt; unten an der Antwort stehen nur **zitierte** Quellen (`mainSources`, bei vielen nur die tragenden).
- Google-Grounding: Server meldet nur Chunks, auf die `groundingSupports` zeigen (= wirklich benutzt). Hat die Antwort keine nummerierten Belege, stehen diese unten.
- Ohne Suche: gar nichts (keine Leiste, kein Hinweis).
- Anzeige unten: nur Logos als abgerundete Quadrate (`/api/icon?domain=`), ohne Namen, max. 3, dann „+N“; Klick → Fenster mit allen.
- **Nur passende Quellen** (verbindlich): Websites und deutsche Lernseiten laufen nach dem Wortabgleich durch `judgePages` (Modell-Bewertung, < 6 von 10 fällt weg); in `lib/research.js` fällt < 6 weg und Unbewertetes wird nicht übernommen. Lieber keine Quelle als eine fremde.
- **Lernen: NUR deutsche Fachwissensquellen** (verbindlich): keine englische Wikipedia, keine (englische) Fachliteratur/OpenAlex (`germanOnly`), Analyse liefert nur deutsche, themengenaue Suchbegriffe; Seiten, die nur ein ganzes Schulfach behandeln („Biologie“) oder Startseiten fallen weg (`GENERIC_SUBJECT`, Pfad „/“), Bewertung gibt ihnen 0–2. Andere Agenten: frei.
- **Lernen: deutsche Lernplattformen zuerst** (ausdrücklicher Wunsch, verbindlich): Studyflix, simpleclub, serlo, sofatutor, Lernhelfer, LEIFIphysik, planet-schule/-wissen u. a. (`LEARN_FAVORITES`, höchster Rang in `rankGerman`, +2 in `JUDGE_SYSTEM`, eigene Suchanfrage „… studyflix simpleclub“ beim Lern-Agenten/Schulthemen).
- Deutsche Quellen haben Vorrang (`isGerman`, `rankGerman`); Fachliteratur (OpenAlex) nur beim Lern-Agenten.

## Aufwand ist verbindlich (WICHTIGSTE REGEL – nie zurückbauen, außer der Nutzer will es)
Gilt überall, wo ein Aufwand gewählt wird: KI-Chat, Dokument-Chat (eigene Wahl im Eingabefeld), Aufgaben und Automatisierungen.
- **Auto**: Gemini entscheidet selbst (dynamisches Denken, Antwortlänge nach Bedarf); bei Börse/Coden die Analyse.
- **Ausdrücklich gewählt** (Low/Medium/High/Max): GENAU diese Stufe – kein internes Herunterstufen bei „einfachen“ Fragen,
  Antwortstil = gewählte Stufe (`EFFORT_STYLE`), Erinnerung am Ende des System-Prompts (High/Max). Nur Begrüßungen bleiben direkt.
- **Max = das Maximum**: volles Denk-Budget (24 576), immer Quellen (außer Coden/Börse/nur Material/Rückfrage; fehlen Suchbegriffe → aus der Frage),
  umfassend auf Klausurniveau, Tabellen, Belege [n], kurzes Fazit, kein Längenlimit. Darf länger dauern.
- **High**: gründlich, wichtige Punkte als eigene Abschnitte, Denken an, Quellen wenn sie helfen. **Medium**: normale vollständige Antwort. **Low**: kurz, ohne Denken.
- Vergleiche (Regel in `BASE_PROMPT`): bei High/Max jedes Objekt für sich (eigene Tabelle), dann Gemeinsamkeiten, Unterschiede (Gegenüberstellung), Fazit.
  Wichtige Infos nie in Klammern verstecken. Lern-Agent: fachliche Genauigkeit auf Klausurniveau.
- Hintergrund-Aufgaben: Gesamtzeit höchstens 280 s (Vercel-Limit 300 s) – ein Teilergebnis wird trotzdem gespeichert.
- Tests in `tests/workflow.test.js` („Max ist verbindlich …“, „High ist verbindlich …“, „1b …“) sichern das ab.

## Länge / Max (verbindlich, nicht wieder einbauen!)
- **Max hat kein Längen-/Kontextlimit**: 65 536 Tokens je Runde, 12 Weiterschreib-Runden, Verlauf bis 40 Nachrichten/600 000 Zeichen (`compactHistory(…, {max})`); Vercel-Zeitlimit → die App schreibt bei Max automatisch weiter (bis 8×). Prompt `EFFORT_STYLE.max`: lange Texte vollständig, nie kürzen. High: 65 536 Tokens, 6 Runden.
- Bei neuen Systemen darauf achten, dass diese Grenzen nicht wieder gekappt werden.

## Regeln im Prompt (Auswahl)
- Prompts, E-Mails, Nachrichten, Briefe zum Weiterverwenden → Block ```kopie (ohne Titelzeile; E-Mail: „Betreff: …“ zuerst) → Kopier-Kasten ohne Kopf/Trennstrich, Betreff abgesetzt, „Kopieren“ oben rechts (`copyFigure` in `app.js`). Ein kurzer Einleitungssatz steht davor im Text.
- Bildbitte mit Fotos/PDF: Reihenfolge strikt „Dokumente analysieren“ → „Bild erzeugen“ (`picWaitsForFiles`); kommt der Bild-Block mitten im Text, startet der Bild-Schritt + Malen sofort.
- Stichpunkte sind erlaubt, wo sie passen (gemischt mit Fließtext) – nicht alles Fließtext, nicht alles Stichpunkte.
- Bei Diagramm-Wünschen nie nach der Form fragen (Typ wählt `bestType`: Zeitverlauf → Linie, sonst Ring).
- Nie Code zum Selberzeichnen (matplotlib o. Ä.); Diagramme/Zeitstrahl/Mindmap nur als Block. Mindmap nur Stichpunkte, Zeitstrahl ohne Limit, keine `source`-Felder.
- Jeder Chat ist für sich; Bilder nur bei Bedarf/Wunsch; Rückfragen nur, wenn wirklich etwas fehlt; Hintergrund-Aufgaben nie mit Rückfragen.
- Präsentationen (Lern-Agent) immer mit echten Quellen und echten Fotos (Wikimedia).

- Aufgaben-Ergebnis als Dokument (`mdToHtml` in `lib/agenttasks.js`): ```illustration/chart/mindmap/timeline/stock-Blöcke werden `<div data-viz>`-Grafiken (die App zeichnet/erzeugt sie beim Öffnen), nicht Text.
- Tabellen: bei Vergleichen (3+ Kriterien) und Bestandteilen mit Funktion eine knappe Tabelle statt langer Liste (Regel in `lib/workflow.js`).

## Bilder bearbeiten
- Echte Bearbeitung über **Gemini 2.5 Flash Image** (`geminiImageEdit` in `app-server.js`): Cover „Mit KI bearbeiten“, Bild im Dokument „mit KI bearbeiten“, Folgewünsche zu Chat-Bildern. Ändert nur das Gewünschte.
- FLUX (NVIDIA) kann keine eigenen Bilder bearbeiten → nur Ersatz, wenn Gemini Flash Image nicht verfügbar ist (Kontingent/Fehler): dann wird anhand einer Beschreibung neu gemalt. Antwort enthält `mode: 'edit'`, wenn wirklich bearbeitet wurde.

## Kontingent schonen (verbindlich)
- Neue Funktionen dürfen nicht pro Abschnitt/Satz/Quelle einen eigenen Gemini-Aufruf machen – sammeln und EIN Aufruf. Kleine Aufgaben (`smallJsonTask`/`textTask`) laufen beim Anbieter der Anfrage (Gemini → Lite-Leiter).

## Modelle (verbindlich)
- **Mehrere Schlüssel je Anbieter** (Einstellungen → Agenten → Verbindung: Zeile antippen klappt die Schlüssel auf, ••••1234 mit ×, „Hinzufügen“).
  Gespeichert zeilenweise in `settings.keys.v1`; Server `cleanKeys` (max. 10), `P.keysOf`. Limit wird je Modell UND Schlüssel gemerkt; `P.geminiKey(env, model)` nimmt einen freien Schlüssel.
  Nie `env.GEMINI_API_KEY` direkt an Google schicken (kann mehrere Schlüssel enthalten).
- **Anbieter-Phasen (verbindlich)**: eine Anfrage läuft KOMPLETT bei einem Anbieter (`env.__family` aus `P.familyFor`): erst nur Gemini, dann nur Groq, dann nur OpenRouter (kostenlos) – Planung, Gedanken, Bewertung, Titel und Antwort beim selben (`P.textTask`). Fällt er mitten in der Antwort aus: nur vorwärts. **Kein Nemotron** (auch nicht als Notfall).
- **Anbieter-Reihenfolge** (`providerAttempts`): Gemini-Leiter (je Modell jeder Schlüssel, inkl. Flash-Lite) → Groq (`GROQ_MODELS`) → OpenRouter (nur „:free“-Modelle laut Liste). **Kein Nemotron für Antworten** (zu langsam, Wunsch des Nutzers); NVIDIA-Schlüssel nur noch für Bilder (FLUX). Kleine JSON-Hilfsaufgaben: Gemini-Lite → Groq → NVIDIA ohne Denken als stiller Notfall.
  Nemotron ist komplett raus (zu langsam) – auch nicht in den Einstellungen; der NVIDIA-Schlüssel dient nur noch FLUX-Bildern („FLUX (Bilder)“).
  Limits werden über alle Server-Instanzen geteilt (`ai:limits` im Speicher): Tageslimit → bis Mitternacht Pazifikzeit, dann ist das bessere Modell sofort wieder dran.
  Alle über denselben Ablauf (`openaiChat`): Gedanken (reasoning / <think>) durch den Gedanken-Filter (Deutsch, nur Inhalt), Antwort-Wächter, Weiterschreiben. Bilder nur an Modelle, die sie sehen.
- **Modell-Leiter** (`lib/providers.js` → `ladder`): Antworten `TEXT_LADDER` (3.8 → 3.7 → 3.6 → 3.5 Flash → 2.5 Flash → Flash-Lite-Modelle),
  kleine Hilfsaufgaben `LITE_LADDER` (3.1 Flash-Lite → 2.5 Flash-Lite → 3.5 Flash-Lite …). Genommen wird nur, was der Schlüssel laut
  Google-Modellliste wirklich kann (6 h gemerkt, auch „-preview“-Versionen); Abfrage fehlgeschlagen → bewährte Liste (2.5 Flash, 3.5 Flash, 3.5 Flash-Lite).
- Limit: Tageslimit (quotaId „PerDay“) → Modell bis Mitternacht Pazifikzeit überspringen, sonst 90 s; 404 → 1 Tag. Dann automatisch das nächstbeste.
- Google-Suche im Modell nur mit 2.5 Flash (kostenloses Grounding) → bei Aktuellem wird ein solches Modell nach vorn geholt.
- Alle Regeln (Aufwand verbindlich, Denken, Quellen) gelten für jedes Modell der Leiter gleich. „Live“-Modelle sind Sprach-Echtzeit, nicht für Text.
- Bildbearbeitung (Gemini Flash Image) hat laut Google keinen Gratis-Zugang → mit Gratis-Schlüssel wird neu gemalt (Ersatz).
- Aufbau/Struktur in Antworten (v. a. High/Max): als ```illustration-Bild mit genauer Beschreibung, Beschriftung und Beispielbild-Suchwörtern (`query`) – nie als ASCII-/Kasten-Skizze.
