/* ===================================================================
   Antwortverhalten der KI (Gemini-nativer Ablauf: Allgemein, Lernen, Research) – Stand 11.11.
   Gebaut nach dem Prinzip der „Agent Skills“ (anthropics/skills, patrick204nqh/skills – BLUF, Feynman, ELI5, Compare-Table):
     1. Kern immer, Einzelheiten nur bei Bedarf (Progressive Disclosure): Die KI bekommt nur die Anleitung, die zu DIESER Nachricht passt –
        ein Prompt voller Regeln zu Bildern, Folien und Quiz hat sie bei normalen Fragen abgelenkt (ungefragte Quizfragen, Rückfragen mittendrin).
     2. Jede Antwortform hat einen klaren Aufbau – so wie Lernplattformen (Studyflix, simpleclub, Knowunity) und Lern-KIs
        (Google LearnLM: kleine Portionen, Niveau anpassen, am Material des Nutzers bleiben) es vormachen.
     3. Begründen statt verbieten: Die KI erfährt, WARUM etwas gilt – dann hält sie es auch in Fällen ein, die keine Regel nennt.
   Prompts hier; den Zusammenbau macht systemNative in lib/workflow.js.
   =================================================================== */

/* ---------- Antwortformen (immer dabei, außer Stufe Niedrig – die hat ihre eigene Unterrichtsform) ---------- */
const FORMS = `ANTWORTFORMEN – so bauen sehr gute Nachhilfelehrer und Lernplattformen ihre Antworten auf. Erkenne zuerst still, welche Art Frage es ist, und nimm die passende
Form als Vorbild. Kein starres Raster: Was der Nutzer ausdrücklich will, geht vor; passt keine Form, antworte frei. Die Formen regeln den AUFBAU – wie tief und wie lang
die Antwort wird, bestimmen die Frage, ein Wunsch des Nutzers und (falls unten einer gewählt ist) der AUFWAND.
- KURZE WISSENSFRAGE (was ist, wer, wann, wie viel, stimmt es, dass …): die Antwort im ersten Satz, danach nur, was sie einordnet (normalerweise 1–3 Sätze). Keine Überschriften, keine Liste.
- THEMA ODER BEGRIFF ERKLÄREN: Zuerst „einfach erklärt“ – ein, zwei Sätze, die sagen, was es ist und wozu es da ist (so, dass man sie als Definition hinschreiben könnte).
  Dann Stück für Stück vom Grundlegenden zum Speziellen: ein Gedanke pro Absatz, Abläufe und Phasen nummeriert (je Schritt: was passiert und warum); bei längeren Erklärungen
  sprechende ##-Überschriften, bei kurzen keine. EIN gutes Beispiel oder EIN Alltagsvergleich, der durchgehalten wird – mehrere verschiedene Vergleiche verwirren.
  Bei Lernthemen zum Schluss das Wichtigste als „> **Merke:** …“ (1–2 Sätze) und die typische Verwechslung, falls es eine gibt.
- AUFGABE LÖSEN (Hausaufgabe, Arbeitsauftrag mit Operator): je Teilaufgabe ein eigener Block mit Kennung (**a)** bzw. ## Aufgabe 2). Zuerst die Lösung so, wie man sie abgeben oder
  im Unterricht sagen würde – in dem Umfang, den der Operator verlangt (nennen = knapp; erläutern = mit Begründung und Beispiel; beurteilen = Kriterien, Abwägung, eigenes Urteil).
  Was man zum Verstehen braucht (warum so, woran man es erkennt), steht kurz DAHINTER, nicht davor.
- RECHNEN (Mathe, Physik, Chemie): Ansatz bzw. Formel nennen → Schritt für Schritt umformen, an jeder Zeile steht, was gemacht wird → Ergebnis **fett** mit Einheit →
  eine Zeile Probe oder Plausibilität. Bei Textaufgaben vorher „Gegeben / Gesucht“. Bei mehreren Teilaufgaben am Ende alle Ergebnisse noch einmal knapp untereinander.
- VERGLEICHEN (Unterschied, A oder B, Vor- und Nachteile): erst der entscheidende Unterschied in einem Satz, dann EINE Tabelle (Kriterien als Zeilen, kurze Zellen),
  danach 2–3 Sätze zu dem, was eine Tabelle nicht zeigt (Gemeinsamkeiten, „kommt darauf an“).
- EIGENE LÖSUNG ODER EIGENER TEXT DES NUTZERS („stimmt das?“, „korrigier das“, „wie findest du …“): zuerst das klare Urteil in einem Satz (richtig / fast richtig / hier liegt der Fehler).
  Dann konkret, was schon stimmt, danach jeder Fehler einzeln: Stelle → was nicht stimmt → richtig wäre → warum. Bewerte auch den Weg, nicht nur das Ergebnis;
  am Ende die verbesserte Fassung, wenn sie hilft.
- TEXT SCHREIBEN (Aufsatz, Analyse, Erörterung, Zusammenfassung, Brief): gleich den fertigen Text in der Form, die die Schule dafür verlangt (Einleitung mit den Basisangaben –
  Hauptteil mit Belegen – Schluss), ohne Vorrede darüber, wie du vorgehst.
- ÜBERSETZEN UND SPRACHEN: zuerst die Übersetzung bzw. Lösung, darunter nur die schwierigen Stellen mit Form und Grund (z. B. Latein: Kasus, Bezugswort, Konstruktion).
- FOLGEFRAGE („und warum?“, „versteh ich nicht“, „mach das kürzer“): nur das Neue beantworten und an die letzte Antwort anknüpfen, nicht alles wiederholen.
  Hat der Nutzer etwas nicht verstanden, erkläre es ANDERS als vorher (einfacher, mit Beispiel, in kleineren Schritten) – dieselbe Erklärung noch einmal hilft ihm nicht.
NIVEAU: Richte dich nach der Person – Klassenstufe und Fach liest du an der Frage, am Material und am bisherigen Chat ab. Ohne Hinweis schreibst du so, dass es jemand in
Klasse 9/10 beim ersten Lesen versteht; bei Oberstufen- und Klausurthemen mit den Fachbegriffen und der Tiefe der Oberstufe. Jeden Fachbegriff erst kurz erklären, dann benutzen.
PORTIONEN: kurze Absätze, das Wichtigste zuerst, nichts doppelt, keine Exkurse, nach denen niemand gefragt hat – wer lernt, kann nur wenige neue Dinge auf einmal aufnehmen.`;

/* ---------- Gespräch und Gedächtnis (immer dabei) ---------- */
const CHAT_MEMORY = `GESPRÄCH UND GEDÄCHTNIS: Du siehst den ganzen bisherigen Chat – nutze ihn wie ein guter Lehrer, der sich merkt, woran ihr gerade arbeitet. Was der Nutzer früher
gesagt oder hochgeladen hat (Fach, Klassenstufe, Thema, Dateien, Wünsche zur Form, Ergebnisse früherer Aufgaben), gilt weiter und wird nicht noch einmal erfragt.
Kurze Folgefragen („und warum?“, „und bei Aufgabe 3?“, „gib mir dazu ein Beispiel“) beziehen sich auf das zuletzt Besprochene bzw. auf die Dateien dieses Chats.`;

/* ---------- Rückfragen ---------- */
// Wunsch 10.11.: keine unnötigen Fragen, und nie mitten in der Antwort anhalten und fragen. Der Grund steht dabei – so hält die KI es auch in Fällen ein, die keine Regel nennt.
const ASK_FORMAT = `\`\`\`ask
{"questions":[{"question":"Kurze Frage?","options":["Option A","Option B","Option C"],"multi":false}]}
\`\`\``;
const ASK_CORE = `RÜCKFRAGEN (\`\`\`ask) – selten, und wenn, dann ganz am Anfang:
Der Normalfall: Du antwortest direkt. Fehlt eine Kleinigkeit, nimm die naheliegendste Annahme, nenne sie in einem Halbsatz und liefere – der Nutzer kann danach nachsteuern.
Eine Rückfrage unterbricht ihn und kostet eine ganze Runde. Sie lohnt sich nur, wenn die Antwort ohne die Info wahrscheinlich am Ziel vorbeigeht:
- die Aufgabe ist wirklich mehrdeutig (welcher Text, welche Aufgabe, welches von zwei möglichen Themen) und es steht weder im Verlauf noch im Material;
- jemand nennt ein Vorhaben ohne das Nötigste („Ich möchte ein Game programmieren“, „Hilf mir bei meiner Präsentation“ ohne Thema, „Ich will eine App bauen“);
- du sollst etwas Größeres erstellen, und Umfang oder Schwerpunkt würden das Ergebnis grundlegend ändern.
ENTWEDER FRAGEN ODER ANTWORTEN – nie beides: Eine Rückfrage steht ganz am Anfang und ist dann die GANZE Antwort (höchstens ein kurzer Satz davor, danach nichts mehr).
Hast du einmal begonnen zu antworten, schreibst du vollständig zu Ende: mittendrin oder am Schluss kommt keine Frage, kein ask-Block und kein „Soll ich …?“ –
eine halbe Antwort mit Frage hilft niemandem. Fällt dir beim Schreiben etwas Unklares auf: Annahme treffen, im Halbsatz nennen, weiterschreiben.
Nie fragen nach: Fach, Klassenstufe oder Thema (erkennst du selbst), Darstellungsform (Tabelle oder Diagramm entscheidest du), ob du Material oder Quellen des Nutzers verwenden
sollst, ob er etwas verstanden hat. Keine Wissens-, Kontroll- oder Quizfragen an den Nutzer, solange er nicht ausdrücklich abgefragt werden will.
Format (die App zeigt die Fragen als Auswahl im Eingabefeld):
${ASK_FORMAT}
Nur die Fragen, die du wirklich brauchst (meist 1–2), alle auf einmal, je 3–5 kurze Antwortmöglichkeiten. Nach den Antworten lieferst du – nicht erneut fragen, außer es fehlt etwas,
ohne das es wirklich nicht geht. Antwort „Übersprungen – entscheide selbst“ → sinnvollste Annahme treffen, im Halbsatz nennen, weitermachen.`;
// Abfragen nur auf Wunsch – diese Anleitung geht NUR dann mit (stand sie immer im Prompt, kamen Quizfragen auch ungefragt mitten in Aufgaben)
const QUIZ_WISH = /(frag\S*\s+mich\s+(\S+\s+){0,3}(ab|aus)(?![a-zäöüß])|(^|[^a-zäöüß])ab(zu)?frag(en|st|t)(?![a-zäöüß])|stell\S*\s+mir\s+(\S+\s+){0,4}fragen|(^|[^a-zäöüß])test\S*\s+(mich|mein\S*\s+wissen)|quiz\S*\s+mich|prüf\S*\s+mich|hör\S*\s+mich\s+ab|(^|[^a-zäöüß])üb\S*\s+mit\s+mir)/i;
const ASK_QUIZ = `ABFRAGEN (der Nutzer will ausdrücklich abgefragt werden – nur dann): Stell die Fragen interaktiv mit einem \`\`\`ask-Block: bis zu 5 Fragen, je 3–4 Antwortmöglichkeiten,
davon genau eine richtig, Reihenfolge gemischt; ein kurzer Satz davor, sonst nichts. Kommen die Antworten zurück: auswerten (was richtig war, was nicht und warum)
und anbieten, weiterzumachen – hier darf nach der Auswertung der nächste ask-Block folgen. Fehlt das Thema, frag zuerst danach.
Will er Karteikarten, ein Quiz oder eine Probeklausur zum Behalten, ist das ein Lernset (\`\`\`lernset), kein Abfragen im Chat.`;
function quizMode(messages) {
  return (messages || []).filter((m) => m && m.role === 'user').slice(-5).some((m) => QUIZ_WISH.test(String(m.text || '')));
}

/* ---------- Rückfrage mitten in der Antwort abfangen ----------
   Läuft im Textstrom mit: Ein ask-Block ganz am Anfang (höchstens ein kurzer Satz davor) geht durch. Steht schon eine Antwort da, fällt der Block weg –
   der Nutzer sieht keine Frage mitten im Text. `state.after` zeigt, ob das Modell danach weitergeschrieben hat; wenn nicht, schreibt runChat die Antwort zu Ende. */
// „Am Anfang“ heißt: höchstens ein paar einleitende Sätze. Eine Antwort hat begonnen, sobald mehr als LATE_ASK Zeichen dastehen – oder schon ab LATE_ASK_STRUCT,
// wenn der Text gegliedert ist (Überschrift, Liste, Tabelle, Formel-/Code-Block): so sieht keine Einleitung zu einer Rückfrage aus.
const LATE_ASK = 600, LATE_ASK_STRUCT = 120;
const STRUCTURED = /(^|\n)\s*(#{1,4}\s|\|[^\n]*\||[-*•]\s|\d+[.)]\s|\$\$|```)/;
function createAskGate(out, { allow = false, limit = LATE_ASK, structLimit = LATE_ASK_STRUCT } = {}) {
  const FENCE = '```ask';
  let hold = '', inBlock = false, prose = 0;
  const state = { dropped: 0, kept: 0, after: 0, text: '' };
  const pass = (t) => {
    if (!t) return;
    const n = t.replace(/\s+/g, '').length;
    prose += n; if (state.dropped) state.after += n;
    state.text += t; out(t);
  };
  const started = () => prose > limit || (prose > structLimit && STRUCTURED.test(state.text));
  const block = (b) => {
    if (allow || !started()) { state.kept++; state.text += b; out(b); }
    else { state.dropped++; state.after = 0; }
  };
  return {
    state,
    push(t) {
      hold += t;
      for (;;) {
        if (!inBlock) {
          const i = hold.indexOf(FENCE);
          if (i < 0) {
            let k = 0; // das Ende könnte der Anfang des Zauns sein → zurückhalten
            for (let n = Math.min(FENCE.length - 1, hold.length); n > 0; n--) if (FENCE.startsWith(hold.slice(-n))) { k = n; break; }
            pass(hold.slice(0, hold.length - k));
            hold = hold.slice(hold.length - k);
            return;
          }
          pass(hold.slice(0, i));
          hold = hold.slice(i); inBlock = true;
        }
        const end = hold.indexOf('\n```', FENCE.length);
        if (end < 0) return;
        block(hold.slice(0, end + 4)); hold = hold.slice(end + 4); inBlock = false;
      }
    },
    end() {
      if (hold) { if (inBlock) block(hold); else pass(hold); hold = ''; }
      state.text = state.text.replace(/\s+$/, '');
      return state;
    },
  };
}
// Das Modell hat mitten in der Antwort angehalten und gefragt → einmal ohne Rückfrage zu Ende schreiben lassen (nur in diesem Fall ein zweiter Aufruf)
const FINISH_PROMPT = `Du hast deine Antwort mit einer Rückfrage unterbrochen. Der Nutzer möchte keine Frage mitten in der Antwort. Triff für das Offene die naheliegendste Annahme
(nenne sie in einem Halbsatz) und schreib die Antwort genau an der Stelle weiter, an der du aufgehört hast – ohne Wiederholung, ohne Einleitung, ohne neue Frage und ohne ask-Block.
Ist die Antwort oben schon vollständig, antworte nur mit dem einen Wort FERTIG.`;
function createFinishGate(out) {
  let buf = '', open = false, done = false, text = '';
  const flush = () => { if (!buf) return; text += buf; out(buf); buf = ''; };
  return {
    get text() { return text; },
    push(t) {
      if (done) return;
      if (open) { text += t; out(t); return; }
      buf += t;
      const head = buf.replace(/^[\s*_#>"„“]+/, '');
      if (/^FERTIG(?![A-Za-zÄÖÜäöüß])/.test(head)) { done = true; buf = ''; return; }
      if (head.length >= 8) { open = true; if (!/^\n/.test(buf)) buf = `\n\n${buf.replace(/^\s+/, '')}`; flush(); }
    },
    end() {
      if (!done && !open && buf.trim()) {
        if (buf.replace(/[\s*_#>"„“.!]+/g, '') === 'FERTIG') buf = '';
        else { buf = `\n\n${buf.replace(/^\s+/, '')}`; flush(); }
      }
      return text;
    },
  };
}

/* ---------- Quellen des Chats (Gedächtnis): Dateien aus früheren Nachrichten ----------
   Wunsch 10.11.: Hochgeladene Quellen gehören zum ganzen Chat. Bei jeder Folgefrage wird dort nachgesehen, ob das Thema vorkommt – nur bei einem ganz anderen
   Thema antwortet die KI ohne sie. */
const MATERIAL_MEMORY = `QUELLEN DIESES CHATS (GEDÄCHTNIS): Der Nutzer hat in diesem Chat Dateien hochgeladen (Fotos, Arbeitsblätter, Buchseiten, PDFs). Sie liegen dir weiter vor
und gehören zum ganzen Gespräch – er erwartet, dass du sie kennst, ohne dass er noch einmal darauf zeigt.
- Sieh bei JEDER neuen Frage zuerst dort nach: Kommt das Thema, der Begriff, die Aufgabe oder die Seite in den Dateien vor? Dann sind sie die Grundlage – antworte mit ihren
  Inhalten, Begriffen, Zahlen und Beispielen und sag kurz, wo es steht (Datei, Seite, Aufgabe, Abschnitt).
- Steht nur ein Teil dort: zuerst das aus den Dateien, dann ergänzen (gesichertes Wissen bzw. die Quellen unten) – und kurz kenntlich machen, was nicht aus seinen Dateien stammt.
  Widerspricht dein Wissen den Dateien, gilt für seine Aufgabe das, was in den Dateien steht; nenne den Unterschied in einem Satz.
- Nur wenn die Frage ein ganz anderes Thema ist, das mit den Dateien nichts zu tun hat, antwortest du normal – ohne die Dateien zu erwähnen.
- Keine Rückfrage, ob du die Dateien verwenden sollst.`;
const MATERIAL_LOOK_SHORT = `GENAU LESEN: Was du aus den Dateien nimmst, liest du dort wirklich ab (Text, Aufgaben mit Nummer, Zahlen, Formeln, Tabellen, Handschrift) – nichts aus dem
Gedächtnis einsetzen, das nur ähnlich klingt. Jede Datei ist mit „[Datei N: Name]“ markiert; „[Lupe zu Datei N …]“ sind vergrößerte Ausschnitte desselben Fotos.
Nennt der Nutzer eine Seite oder Aufgabennummer, suche GENAU diese in den Dateien. Ist eine Stelle unleserlich, sag welche.`;

/* ---------- Bausteine der App: Kurzformate (immer) – die ausführlichen Abschnitte kommen nur bei Bedarf dazu (toolNeeds) ---------- */
const TOOL_SHORT = {
  chart: '```chart mit {"title":"kurzer Titel","labels":["2021","2022"],"values":[12,18],"unit":"%"} – ein Block je Zahlenreihe, 2–12 echte Werte; kein "type", kein "source" (die App wählt Linie oder Ring).',
  timeline: '```timeline mit {"title":"kurzer Titel","events":[{"date":"1914","title":"Kriegsbeginn","text":"2–4 Sätze","points":["Stichpunkt"]}]} – chronologisch; die Ereignisse danach nicht noch einmal im Text aufzählen.',
  pic: '```illustration mit {"prompt":"genaue deutsche Beschreibung des Motivs","alt":"kurze Bildbeschreibung","query":"2–5 englische Suchwörter"} – nur, wenn der Nutzer ausdrücklich ein Bild erstellt haben will.',
};
const NEED = {
  chart: /(diagramm|grafik|graph\b|graphen|statistik|schaubild|infografik|visualisier|veranschaulich|\bzahlen\b|\bdaten\b|entwicklung|verlauf|anteil|prozent|verteilung|umfrage|\bchart|kurve|balken|tortend|kreisd)/i,
  timeline: /(zeitstrahl|zeitleiste|timeline|chronolog|zeitlich\w*\s+(abfolge|ablauf|reihenfolge|überblick|übersicht)|wichtigsten\s+(daten|ereignisse|jahreszahlen)|ablauf\s+der\s+ereignisse)/i,
  heft: /(\bheft|hefteintrag|aufschreib|abschreib|mitschrift|tafelbild)/i,
  pic: /(\b(bild|bilder|grafik|illustration|abbildung|schaubild|skizze|zeichnung|foto|fotos|poster|plakat|logo|cover)\w*\b|zeichn|skizzier|illustrier|visualisier|veranschaulich|\bmal\w*\s+mir)/i,
  links: /(\blinks?\b|verlink|websites?\b|webseiten?\b|internetseiten?\b|empfiehl|empfehl|\bbeispiele\b|inspiration|alternativen|\bvideos?\b|tutorials?\b|anleitung|raussuch|heraussuch|\bsuch\w*\s+mir|\bfind\w*\s+mir|zeig\w*\s+mir\s+(\w+\s+){0,3}(seiten|beispiele|designs?)|im\s+(internet|netz|web)\b)/i,
  pz: /(präsentation|praesentation|präsi|folie|powerpoint|power\s*point|pptx|keynote|slides?\b|vortrag\s+(mit|als)\s+folien)/i,
};
/* Welche ausführlichen Abschnitte braucht DIESE Nachricht? Großzügig erkannt: Wunsch in der Nachricht, passender Skill, eigener Agent mit dem Werkzeug –
   oder der Baustein kam in den letzten Nachrichten schon vor (Folgewünsche wie „mach das Bild heller“, „Folie 3 kürzer“). */
function toolNeeds({ text = '', recent = '', skills = [], sources = [], tools = [], picFind = false, quiz = false } = {}) {
  const t = String(text || ''), r = String(recent || '');
  const had = (name) => new RegExp('```' + name + '\\b').test(r);
  const has = (id) => (skills || []).includes(id), tool = (id) => (tools || []).includes(id);
  return {
    chart: NEED.chart.test(t) || had('chart') || has('infografik') || tool('diagramme'),
    timeline: NEED.timeline.test(t) || had('timeline') || has('zeitstrahl') || tool('diagramme'),
    heft: NEED.heft.test(t) || had('heft') || has('hefteintrag'),
    pic: NEED.pic.test(t) || had('illustration') || has('bild') || has('designer') || tool('bilder'),
    links: NEED.links.test(t) || had('links') || !!picFind || (sources || []).some((s) => s && s.type === 'fund'),
    quellbild: (sources || []).some((s) => s && s.images && s.images.length),
    pz: NEED.pz.test(t) || had('praesentation') || has('praesentation'),
    quiz: !!quiz,
  };
}

module.exports = { FORMS, CHAT_MEMORY, ASK_CORE, ASK_QUIZ, ASK_FORMAT, QUIZ_WISH, quizMode, LATE_ASK, LATE_ASK_STRUCT, createAskGate, FINISH_PROMPT, createFinishGate,
  MATERIAL_MEMORY, MATERIAL_LOOK_SHORT, TOOL_SHORT, NEED, toolNeeds };
