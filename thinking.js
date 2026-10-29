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
   kind = kleine Animation im Kopf (think · search · read · write · check · work)
   =================================================================== */
const Thinking = (() => {
  const F = (main, sub, kind) => ({ main, sub, kind });
  const FLOWS = {
    general: {
      start: F('Understanding', 'Analyzing request', 'read'),
      plan: F('Thinking', 'Identifying requirements', 'think'),
      material: F('Understanding', 'Reviewing your files', 'read'),
      search: F('Researching', 'Searching for sources', 'search'),
      gather: F('Researching', 'Gathering information', 'read'),
      analyze: F('Analyzing', 'Evaluating information', 'check'),
      thoughts: F('Thinking', 'Connecting key insights', 'think'),
      work: F('Working', 'Preparing response', 'write'),
      review: F('Reviewing', 'Checking accuracy', 'check'),
      picture: F('Working', 'Generating picture', 'work'),
      done: F('Completed', 'Response ready', 'check'),
    },
    learn: {
      start: F('Understanding', 'Understanding learning goal', 'read'),
      plan: F('Understanding', 'Analyzing the question', 'think'),
      material: F('Reviewing context', 'Reviewing documents', 'read'),
      search: F('Researching', 'Searching learning sources', 'search'),
      gather: F('Researching', 'Gathering learning material', 'read'),
      analyze: F('Analyzing', 'Checking subject knowledge', 'check'),
      thoughts: F('Thinking', 'Structuring the explanation', 'think'),
      work: F('Working', 'Developing the answer', 'write'),
      review: F('Reviewing', 'Checking accuracy', 'check'),
      picture: F('Working', 'Drawing the illustration', 'work'),
      done: F('Completed', 'Learning response ready', 'check'),
    },
    research: {
      start: F('Planning research', 'Defining research scope', 'read'),
      plan: F('Planning research', 'Defining research scope', 'think'),
      strategy: F('Thinking', 'Developing research strategy', 'think'),
      material: F('Planning research', 'Reviewing your files', 'read'),
      search: F('Searching sources', 'Searching the web', 'search'),
      web: F('Searching sources', 'Searching the web', 'search'),
      discover: F('Searching sources', 'Discovering relevant sources', 'read'),
      gather: F('Gathering information', 'Collecting key findings', 'read'),
      compare: F('Analyzing', 'Comparing sources', 'think'),
      credibility: F('Analyzing', 'Evaluating source credibility', 'check'),
      crosscheck: F('Cross-checking', 'Verifying information', 'search'),
      analyze: F('Analyzing', 'Evaluating information', 'check'),
      synthesize: F('Synthesizing', 'Connecting research findings', 'think'),
      thoughts: F('Synthesizing', 'Connecting research findings', 'think'),
      work: F('Working', 'Structuring research report', 'write'),
      review: F('Reviewing', 'Reviewing sources and findings', 'check'),
      picture: F('Working', 'Generating picture', 'work'),
      done: F('Completed', 'Research report ready', 'check'),
    },
    boerse: {
      start: F('Understanding', 'Understanding market request', 'read'),
      plan: F('Understanding', 'Understanding market request', 'think'),
      material: F('Portfolio analysis', 'Reading your trade journal', 'read'),
      portfolio: F('Portfolio analysis', 'Reviewing your portfolio', 'read'),
      allocation: F('Portfolio analysis', 'Analyzing asset allocation', 'think'),
      market: F('Market research', 'Checking market condition', 'search'),
      news: F('Market research', 'Searching financial news', 'search'),
      search: F('Market research', 'Searching financial news', 'search'),
      gather: F('Market research', 'Reading financial news', 'read'),
      charts: F('Technical analysis', 'Analyzing price charts', 'read'),
      fundamentals: F('Fundamental analysis', 'Reviewing company fundamentals', 'read'),
      opportunities: F('Opportunity analysis', 'Identifying market opportunities', 'search'),
      risk: F('Risk analysis', 'Evaluating investment risk', 'check'),
      analyze: F('Risk analysis', 'Evaluating investment risk', 'check'),
      thoughts: F('Thinking', 'Connecting market insights', 'think'),
      work: F('Working', 'Preparing market assessment', 'write'),
      review: F('Reviewing', 'Verifying data and findings', 'check'),
      picture: F('Working', 'Preparing market assessment', 'work'),
      done: F('Completed', 'Market analysis ready', 'check'),
    },
  };
  FLOWS.code = { ...FLOWS.general, work: F('Working', 'Writing the code', 'write'), done: F('Completed', 'Project ready', 'check') };
  const of = (agent, key) => (FLOWS[agent] || FLOWS.general)[key] || FLOWS.general[key] || F('Working', key, 'work');
  // Research zeigt seinen Ablauf immer ganz, die anderen nur, was wirklich läuft
  const full = (agent) => agent === 'research';
  return { of, full, FLOWS };
})();
window.Thinking = Thinking;
