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
   =================================================================== */
const Thinking = (() => {
  const F = (main, sub, kind, anim = 'think') => ({ main, sub, kind, anim });
  const FLOWS = {
    general: {
      start: F('Understanding', 'Analyzing request', 'read', 'think'),
      plan: F('Thinking', 'Identifying requirements', 'think', 'think'),
      material: F('Understanding', 'Reviewing your files', 'read', 'cook'),
      search: F('Researching', 'Searching for sources', 'search', 'cook'),
      gather: F('Researching', 'Gathering information', 'read', 'cook'),
      analyze: F('Analyzing', 'Evaluating information', 'check', 'cook'),
      thoughts: F('Thinking', 'Connecting key insights', 'think', 'think'),
      work: F('Cooking', 'Preparing response', 'write', 'cook'),
      review: F('Cooking', 'Checking accuracy', 'check', 'cook'),
      picture: F('Cooking', 'Generating picture', 'work', 'cook'),
      done: F('Completed', 'Response ready', 'check', 'done'),
    },
    learn: {
      start: F('Understanding', 'Understanding learning goal', 'read', 'think'),
      plan: F('Understanding', 'Analyzing the question', 'think', 'think'),
      material: F('Reviewing context', 'Reviewing documents', 'read', 'book'),
      search: F('Researching', 'Searching learning sources', 'search', 'book'),
      gather: F('Researching', 'Gathering learning material', 'read', 'book'),
      analyze: F('Analyzing', 'Checking subject knowledge', 'check', 'book'),
      thoughts: F('Thinking', 'Structuring the explanation', 'think', 'think'),
      work: F('Working', 'Developing the answer', 'write', 'book'),
      review: F('Reviewing', 'Checking accuracy', 'check', 'book'),
      picture: F('Working', 'Drawing the illustration', 'work', 'book'),
      done: F('Completed', 'Learning response ready', 'check', 'done'),
    },
    research: {
      start: F('Planning research', 'Defining research scope', 'read', 'think'),
      plan: F('Planning research', 'Defining research scope', 'think', 'think'),
      strategy: F('Thinking', 'Developing research strategy', 'think', 'think'),
      material: F('Planning research', 'Reviewing your files', 'read', 'search'),
      search: F('Searching sources', 'Searching the web', 'search', 'search'),
      web: F('Searching sources', 'Searching the web', 'search', 'search'),
      discover: F('Searching sources', 'Discovering relevant sources', 'read', 'search'),
      gather: F('Gathering information', 'Collecting key findings', 'read', 'search'),
      compare: F('Analyzing', 'Comparing sources', 'think', 'search'),
      credibility: F('Analyzing', 'Evaluating source credibility', 'check', 'search'),
      crosscheck: F('Cross-checking', 'Verifying information', 'search', 'search'),
      analyze: F('Analyzing', 'Evaluating information', 'check', 'search'),
      synthesize: F('Synthesizing', 'Connecting research findings', 'think', 'quill'),
      thoughts: F('Synthesizing', 'Connecting research findings', 'think', 'think'),
      work: F('Working', 'Structuring research report', 'write', 'quill'),
      review: F('Reviewing', 'Reviewing sources and findings', 'check', 'search'),
      picture: F('Working', 'Generating picture', 'work', 'quill'),
      done: F('Completed', 'Research report ready', 'check', 'done'),
    },
    boerse: {
      start: F('Understanding', 'Understanding market request', 'read', 'think'),
      plan: F('Understanding', 'Understanding market request', 'think', 'think'),
      material: F('Portfolio analysis', 'Reviewing your files', 'read', 'news'),
      extract: F('Portfolio analysis', 'Extracting your trades', 'read', 'news'),
      saveDepot: F('Portfolio analysis', 'Adding to your depot', 'write', 'chartop'),
      depot: F('Portfolio analysis', 'Checking your depot', 'read', 'news'),
      depotAnalysis: F('Portfolio analysis', 'Analyzing your depot', 'think', 'news'),
      chartsLoad: F('Market charts', 'Loading price charts', 'read', 'news'),
      portfolio: F('Portfolio analysis', 'Reviewing your portfolio', 'read', 'news'),
      allocation: F('Portfolio analysis', 'Analyzing asset allocation', 'think', 'news'),
      market: F('Market research', 'Checking market condition', 'search', 'news'),
      news: F('Market research', 'Searching financial news', 'search', 'news'),
      search: F('Market research', 'Searching financial news', 'search', 'news'),
      gather: F('Market research', 'Reading financial news', 'read', 'news'),
      charts: F('Technical analysis', 'Analyzing price charts', 'read', 'news'),
      fundamentals: F('Fundamental analysis', 'Reviewing company fundamentals', 'read', 'news'),
      opportunities: F('Opportunity analysis', 'Identifying market opportunities', 'search', 'news'),
      risk: F('Risk analysis', 'Evaluating investment risk', 'check', 'news'),
      analyze: F('Risk analysis', 'Evaluating investment risk', 'check', 'news'),
      thoughts: F('Thinking', 'Connecting market insights', 'think', 'think'),
      work: F('Working', 'Preparing market assessment', 'write', 'chartop'),
      review: F('Reviewing', 'Verifying data and findings', 'check', 'chartop'),
      picture: F('Working', 'Preparing market assessment', 'work', 'chartop'),
      done: F('Completed', 'Market analysis ready', 'check', 'done'),
    },
  };
  FLOWS.code = { ...FLOWS.general, work: F('Working', 'Writing the code', 'write', 'type'), done: F('Completed', 'Project ready', 'check', 'done') };
  const of = (agent, key) => (FLOWS[agent] || FLOWS.general)[key] || FLOWS.general[key] || F('Working', key, 'work');
  // Research zeigt seinen Ablauf immer ganz, die anderen nur, was wirklich läuft
  const full = (agent) => agent === 'research';
  return { of, full, FLOWS };
})();
window.Thinking = Thinking;
