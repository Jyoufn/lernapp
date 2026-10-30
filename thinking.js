/* ===================================================================
   Denk-Abläufe der Agenten (Zeitleiste über der Antwort)
   Kopf = HAUPTSTATUS (z. B. „Researching“), darunter je Schritt der UNTERPUNKT (z. B. „Searching for sources“).
   Jeder Agent hat seinen eigenen Ablauf. Gezeigt wird nur, was wirklich passiert: eine einfache Frage zeigt z. B. nur
   Understanding → Thinking → Working → Completed; Recherche, Analyse und Prüfung kommen nur dazu, wenn sie laufen.
   Ausnahme Research: zeigt seinen Ablauf immer vollständig.
   Schlüssel (von app.js benutzt):
     start    erster Schritt (Anfrage verstehen)        plan     Planung/Analyse der Frage (mit Plan-Kasten)
     material angehängte Dateien prüfen                  search   Quellen suchen                gather  Informationen sammeln
     analyze  Informationen auswerten                    thoughts eigene Gedanken des Modells   work    Antwort schreiben
     review   Prüfung                                     done     fertig                        picture Bild erzeugen
     Börse zusätzlich: portfolio, allocation, market, news, charts, fundamentals, opportunities, risk
     Research zusätzlich: strategy, web, discover, compare, credibility, crosscheck, synthesize
   kind = kleine Animation im Kopf (think · search · read · write · check · work), wenn kein Hund daneben steht
   anim = was der Hund neben dem Hauptstatus tut (PixelDogs.actor) – Denkblase nur am Anfang, danach je Agent EIN Arbeitsbild:
     Allgemein kocht (Pfanne) · Lernen blättert im Buch · Research sucht mit der Lupe und schreibt am Ende mit Feder auf Pergament
     (mit Brille) · Börse liest die Zeitung (Markt, Nachrichten, Depot) und arbeitet am Laptop · am Ende Daumen hoch
     Bild erzeugen (picture): alle Agenten malen an der Staffelei
   =================================================================== */
const Thinking = (() => {
  const F = (main, sub, kind, anim = 'think') => ({ main, sub, kind, anim });
  const FLOWS = {
    general: {
      start: F('Verstehen', 'Anfrage wird gelesen', 'read', 'think'),
      plan: F('Nachdenken', 'Anforderungen klären', 'think', 'think'),
      material: F('Verstehen', 'Deine Dateien ansehen', 'read', 'cook'),
      search: F('Recherchieren', 'Quellen suchen', 'search', 'cook'),
      gather: F('Recherchieren', 'Informationen sammeln', 'read', 'cook'),
      analyze: F('Analysieren', 'Informationen auswerten', 'check', 'cook'),
      thoughts: F('Nachdenken', 'Erkenntnisse verbinden', 'think', 'think'),
      work: F('Kochen', 'Antwort vorbereiten', 'write', 'cook'),
      review: F('Kochen', 'Richtigkeit prüfen', 'check', 'cook'),
      picture: F('Malen', 'Bild erzeugen', 'work', 'paint'),
      done: F('Fertig', 'Antwort fertig', 'check', 'done'),
    },
    learn: {
      start: F('Verstehen', 'Lernziel verstehen', 'read', 'think'),
      plan: F('Verstehen', 'Frage analysieren', 'think', 'think'),
      material: F('Kontext prüfen', 'Dokumente ansehen', 'read', 'book'),
      search: F('Recherchieren', 'Lernquellen suchen', 'search', 'book'),
      gather: F('Recherchieren', 'Lernmaterial sammeln', 'read', 'book'),
      analyze: F('Analysieren', 'Fachwissen prüfen', 'check', 'book'),
      thoughts: F('Nachdenken', 'Erklärung gliedern', 'think', 'think'),
      work: F('Arbeiten', 'Antwort ausarbeiten', 'write', 'book'),
      review: F('Prüfen', 'Richtigkeit prüfen', 'check', 'book'),
      picture: F('Malen', 'Illustration zeichnen', 'work', 'paint'),
      done: F('Fertig', 'Erklärung fertig', 'check', 'done'),
    },
    research: {
      start: F('Recherche planen', 'Umfang festlegen', 'read', 'think'),
      plan: F('Recherche planen', 'Umfang festlegen', 'think', 'think'),
      strategy: F('Nachdenken', 'Vorgehen planen', 'think', 'think'),
      material: F('Recherche planen', 'Deine Dateien ansehen', 'read', 'search'),
      search: F('Quellen suchen', 'Im Web suchen', 'search', 'search'),
      web: F('Quellen suchen', 'Im Web suchen', 'search', 'search'),
      discover: F('Quellen suchen', 'Passende Quellen finden', 'read', 'search'),
      gather: F('Informationen sammeln', 'Wichtige Ergebnisse sammeln', 'read', 'search'),
      compare: F('Analysieren', 'Quellen vergleichen', 'think', 'search'),
      credibility: F('Analysieren', 'Glaubwürdigkeit prüfen', 'check', 'search'),
      crosscheck: F('Gegenprüfen', 'Angaben prüfen', 'search', 'search'),
      analyze: F('Analysieren', 'Informationen auswerten', 'check', 'search'),
      synthesize: F('Zusammenführen', 'Ergebnisse verbinden', 'think', 'quill'),
      thoughts: F('Zusammenführen', 'Ergebnisse verbinden', 'think', 'think'),
      work: F('Arbeiten', 'Bericht gliedern', 'write', 'quill'),
      review: F('Prüfen', 'Quellen und Ergebnisse prüfen', 'check', 'search'),
      picture: F('Malen', 'Bild erzeugen', 'work', 'paint'),
      done: F('Fertig', 'Bericht fertig', 'check', 'done'),
    },
    boerse: {
      start: F('Verstehen', 'Anfrage verstehen', 'read', 'think'),
      plan: F('Verstehen', 'Anfrage verstehen', 'think', 'think'),
      material: F('Depot-Analyse', 'Deine Dateien ansehen', 'read', 'news'),
      extract: F('Depot-Analyse', 'Deine Käufe auslesen', 'read', 'news'),
      saveDepot: F('Depot-Analyse', 'Ins Depot eintragen', 'write', 'chartop'),
      depot: F('Depot-Analyse', 'Depot ansehen', 'read', 'news'),
      depotAnalysis: F('Depot-Analyse', 'Depot analysieren', 'think', 'news'),
      chartsLoad: F('Kurscharts', 'Kurse laden', 'read', 'news'),
      portfolio: F('Depot-Analyse', 'Depot ansehen', 'read', 'news'),
      allocation: F('Depot-Analyse', 'Aufteilung analysieren', 'think', 'news'),
      market: F('Marktrecherche', 'Marktlage prüfen', 'search', 'news'),
      news: F('Marktrecherche', 'Finanznachrichten suchen', 'search', 'news'),
      search: F('Marktrecherche', 'Finanznachrichten suchen', 'search', 'news'),
      gather: F('Marktrecherche', 'Finanznachrichten lesen', 'read', 'news'),
      charts: F('Chartanalyse', 'Kursverläufe analysieren', 'read', 'news'),
      fundamentals: F('Fundamentalanalyse', 'Kennzahlen prüfen', 'read', 'news'),
      opportunities: F('Chancen-Analyse', 'Chancen suchen', 'search', 'news'),
      risk: F('Risiko-Analyse', 'Risiko bewerten', 'check', 'news'),
      analyze: F('Risiko-Analyse', 'Risiko bewerten', 'check', 'news'),
      thoughts: F('Nachdenken', 'Markt-Erkenntnisse verbinden', 'think', 'think'),
      work: F('Arbeiten', 'Einschätzung schreiben', 'write', 'chartop'),
      review: F('Prüfen', 'Daten prüfen', 'check', 'chartop'),
      picture: F('Malen', 'Bild erzeugen', 'work', 'paint'),
      done: F('Fertig', 'Analyse fertig', 'check', 'done'),
    },
  };
  FLOWS.code = { ...FLOWS.general, work: F('Arbeiten', 'Code schreiben', 'write', 'type'), done: F('Fertig', 'Projekt fertig', 'check', 'done') };

  /* ---------- Formate: was am Ende entsteht (Präsentation, Mindmap, Zeitstrahl …) ----------
     Jedes Format hat eigene Schritte für Verstehen, Planen/Denken, Bauen und Fertig – der Hund und seine Arbeit (anim) bleiben die des Agenten.
     Erkannt wird das Format an der Frage (formatOf); schreibt die KI unerwartet einen solchen Block, schaltet app.js beim Schreiben um (blockFormat).
     wrote = Zeile, wenn das Bauen fertig ist (mit Zahlen aus dem Block, siehe statsOf). */
  const X = (main, sub, kind) => ({ main, sub, kind });
  const FORMATS = {
    praesentation: { label: 'Präsentation', wrote: 'Präsentation erstellt',
      start: X('Ziel verstehen', 'Ziel der Präsentation festlegen', 'read'),
      plan: X('Planen', 'Folien gliedern', 'think'), thoughts: X('Planen', 'Folien gliedern', 'think'),
      search: X('Recherchieren', 'Quellen für die Folien suchen', 'search'), gather: X('Recherchieren', 'Fakten für die Folien sammeln', 'read'),
      analyze: X('Recherchieren', 'Inhalte für die Folien auswählen', 'check'),
      work: X('Präsentation erstellen', 'Folien gestalten', 'write'), review: X('Prüfen', 'Folien prüfen', 'check'),
      done: X('Fertig', 'Präsentation fertig', 'check') },
    mindmap: { label: 'Mindmap', wrote: 'Mindmap gebaut',
      start: X('Thema verstehen', 'Kernthema finden', 'read'),
      plan: X('Gliedern', 'Hauptäste finden', 'think'), thoughts: X('Gliedern', 'Ideen zu Ästen ordnen', 'think'),
      search: X('Recherchieren', 'Fakten für die Äste suchen', 'search'), gather: X('Recherchieren', 'Wichtige Fakten sammeln', 'read'),
      analyze: X('Gliedern', 'Fakten den Ästen zuordnen', 'check'),
      work: X('Mindmap bauen', 'Äste und Details anordnen', 'write'), done: X('Fertig', 'Mindmap fertig', 'check') },
    timeline: { label: 'Zeitstrahl', wrote: 'Zeitstrahl gebaut',
      start: X('Thema verstehen', 'Zeitraum bestimmen', 'read'),
      plan: X('Gliedern', 'Wichtige Ereignisse wählen', 'think'), thoughts: X('Gliedern', 'Ereignisse ordnen', 'think'),
      search: X('Recherchieren', 'Daten und Ereignisse suchen', 'search'), gather: X('Recherchieren', 'Daten und Fakten sammeln', 'read'),
      analyze: X('Gliedern', 'Daten und Reihenfolge prüfen', 'check'),
      work: X('Zeitstrahl bauen', 'Ereignisse einordnen', 'write'), done: X('Fertig', 'Zeitstrahl fertig', 'check') },
    chart: { label: 'chart', wrote: 'Diagramm gezeichnet',
      start: X('Ziel verstehen', 'Daten auswählen', 'read'),
      plan: X('Daten vorbereiten', 'Werte auswählen', 'think'), thoughts: X('Daten vorbereiten', 'Zahlen prüfen', 'think'),
      search: X('Recherchieren', 'Aktuelle Zahlen suchen', 'search'), gather: X('Recherchieren', 'Zahlen sammeln', 'read'),
      analyze: X('Daten vorbereiten', 'Zahlen vergleichen', 'check'),
      work: X('Diagramm zeichnen', 'Daten eintragen', 'write'), done: X('Fertig', 'Diagramm fertig', 'check') },
    quiz: { label: 'quiz', wrote: 'Quiz erstellt',
      start: X('Ziel verstehen', 'Übungsziel festlegen', 'read'),
      plan: X('Planen', 'Wichtige Begriffe wählen', 'think'), thoughts: X('Planen', 'Wichtige Begriffe wählen', 'think'),
      work: X('Quiz erstellen', 'Fragen und Antworten schreiben', 'write'), done: X('Fertig', 'Quiz fertig', 'check') },
    table: { label: 'Vergleich', wrote: 'Vergleich gebaut',
      start: X('Ziel verstehen', 'Vergleich festlegen', 'read'),
      plan: X('Vergleichen', 'Kriterien wählen', 'think'), thoughts: X('Vergleichen', 'Unterschiede abwägen', 'think'),
      work: X('Vergleich bauen', 'Tabelle füllen', 'write'), done: X('Fertig', 'Vergleich fertig', 'check') },
    heft: { label: 'Hefteintrag', wrote: 'Hefteintrag geschrieben',
      work: X('Schreiben', 'Schritt für Schritt lösen', 'write'), done: X('Fertig', 'Hefteintrag fertig', 'check') },
  };
  // Format aus der Frage (Börse: „Chart“ ist dort der Aktienchart, kein eigenes Format)
  const ASK = [
    ['praesentation', /pr(ä|ae)sentation|powerpoint|keynote|\bfolien\b|vortragsfolien/i],
    ['mindmap', /mind\s?-?map|gedankenkarte/i],
    ['timeline', /zeitstrahl|zeitleiste|timeline|chronolog/i],
    ['quiz', /\bquiz|teste? mich|frag mich ab|abfrag|karteikarten|(ü|ue)bungsfragen|testfragen/i],
    ['chart', /diagramm|statistik|infografik|schaubild|\bgrafik\b|visualisier/i],
    ['table', /tabelle|gegen(ü|ue)berstell|vergleichs?tabelle/i],
    ['heft', /hefteintrag|ins heft|f(ü|ue)rs heft/i],
  ];
  const formatOf = (text, agent) => {
    if (agent === 'boerse' || agent === 'code') return null;
    const hit = ASK.find(([k, re]) => re.test(String(text || '')));
    return hit ? hit[0] : null;
  };
  // Block in der Antwort → Format (z. B. ```mindmap)
  const blockFormat = (text) => {
    const m = /```(praesentation|mindmap|timeline|chart|heft)\b/.exec(String(text || ''));
    return m ? m[1] : null;
  };
  // Zahlen fürs „fertig“: Folien, Äste/Punkte, Ereignisse, Diagramme
  const statsOf = (format, text) => {
    const blocks = [...String(text || '').matchAll(new RegExp('```' + format + '\\s*([\\s\\S]*?)```', 'g'))].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
    if (!blocks.length) return '';
    const b = blocks[0], pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    if (format === 'praesentation') { const n = (b.slides || b.folien || []).length; return n ? pl(n, 'Folie', 'Folien') : ''; }
    if (format === 'mindmap') {
      const kids = (x) => [...(x.children || []), ...(x.items || []).map((t) => ({ label: t }))];
      const count = (x) => kids(x).reduce((n, c) => n + 1 + count(c), 0);
      const br = (b.branches || []).length, all = (b.branches || []).reduce((n, x) => n + count(x), 0);
      return br ? `${pl(br, 'Ast', 'Äste')}${all ? ` · ${pl(all, 'Punkt', 'Punkte')}` : ''}` : '';
    }
    if (format === 'timeline') { const n = (b.events || []).length; return n ? pl(n, 'Ereignis', 'Ereignisse') : ''; }
    if (format === 'chart') return pl(blocks.length, 'Diagramm', 'Diagramme');
    return '';
  };
  const of = (agent, key, format) => {
    const base = (FLOWS[agent] || FLOWS.general)[key] || FLOWS.general[key] || F('Arbeiten', key, 'work');
    const o = format && FORMATS[format]?.[key];
    return o ? { ...base, ...o } : base;
  };
  // Research zeigt seinen Ablauf immer ganz, die anderen nur, was wirklich läuft
  const full = (agent) => agent === 'research';
  return { of, full, FLOWS, FORMATS, formatOf, blockFormat, statsOf };
})();
window.Thinking = Thinking;
