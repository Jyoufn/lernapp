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
      start: F('Understanding', 'Analyzing request', 'read', 'think'),
      plan: F('Thinking', 'Identifying requirements', 'think', 'think'),
      material: F('Understanding', 'Reviewing your files', 'read', 'cook'),
      search: F('Researching', 'Searching for sources', 'search', 'cook'),
      gather: F('Researching', 'Gathering information', 'read', 'cook'),
      analyze: F('Analyzing', 'Evaluating information', 'check', 'cook'),
      thoughts: F('Thinking', 'Connecting key insights', 'think', 'think'),
      work: F('Cooking', 'Preparing response', 'write', 'cook'),
      review: F('Cooking', 'Checking accuracy', 'check', 'cook'),
      picture: F('Painting', 'Generating picture', 'work', 'paint'),
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
      picture: F('Painting', 'Drawing the illustration', 'work', 'paint'),
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
      picture: F('Painting', 'Generating picture', 'work', 'paint'),
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
      picture: F('Painting', 'Generating picture', 'work', 'paint'),
      done: F('Completed', 'Market analysis ready', 'check', 'done'),
    },
  };
  FLOWS.code = { ...FLOWS.general, work: F('Working', 'Writing the code', 'write', 'type'), done: F('Completed', 'Project ready', 'check', 'done') };

  /* ---------- Formate: was am Ende entsteht (Präsentation, Mindmap, Zeitstrahl …) ----------
     Jedes Format hat eigene Schritte für Verstehen, Planen/Denken, Bauen und Fertig – der Hund und seine Arbeit (anim) bleiben die des Agenten.
     Erkannt wird das Format an der Frage (formatOf); schreibt die KI unerwartet einen solchen Block, schaltet app.js beim Schreiben um (blockFormat).
     wrote = Zeile, wenn das Bauen fertig ist (mit Zahlen aus dem Block, siehe statsOf). */
  const X = (main, sub, kind) => ({ main, sub, kind });
  const FORMATS = {
    praesentation: { label: 'presentation', wrote: 'Created presentation',
      start: X('Understanding your goal', 'Defining what the presentation should achieve', 'read'),
      plan: X('Planning', 'Outlining the slides', 'think'), thoughts: X('Planning', 'Outlining the slides', 'think'),
      search: X('Researching', 'Searching sources for the slides', 'search'), gather: X('Researching', 'Collecting facts for the slides', 'read'),
      analyze: X('Researching', 'Selecting what goes on the slides', 'check'),
      work: X('Creating presentation', 'Designing the slides', 'write'), review: X('Reviewing', 'Checking the slides', 'check'),
      done: X('Completed', 'Presentation ready', 'check') },
    mindmap: { label: 'mind map', wrote: 'Built mind map',
      start: X('Understanding the topic', 'Identifying the core topic', 'read'),
      plan: X('Structuring', 'Finding the main branches', 'think'), thoughts: X('Structuring', 'Grouping ideas into branches', 'think'),
      search: X('Researching', 'Searching facts for the branches', 'search'), gather: X('Researching', 'Collecting key facts', 'read'),
      analyze: X('Structuring', 'Sorting facts into branches', 'check'),
      work: X('Building mind map', 'Arranging branches and details', 'write'), done: X('Completed', 'Mind map ready', 'check') },
    timeline: { label: 'timeline', wrote: 'Built timeline',
      start: X('Understanding the topic', 'Identifying the time span', 'read'),
      plan: X('Structuring', 'Choosing the key events', 'think'), thoughts: X('Structuring', 'Ordering events in time', 'think'),
      search: X('Researching', 'Searching dates and events', 'search'), gather: X('Researching', 'Collecting dates and facts', 'read'),
      analyze: X('Structuring', 'Checking dates and order', 'check'),
      work: X('Building timeline', 'Placing events in order', 'write'), done: X('Completed', 'Timeline ready', 'check') },
    chart: { label: 'chart', wrote: 'Drew chart',
      start: X('Understanding your goal', 'Identifying the data to show', 'read'),
      plan: X('Preparing data', 'Selecting the values', 'think'), thoughts: X('Preparing data', 'Checking the numbers', 'think'),
      search: X('Researching', 'Searching for current numbers', 'search'), gather: X('Researching', 'Collecting the numbers', 'read'),
      analyze: X('Preparing data', 'Comparing the numbers', 'check'),
      work: X('Drawing chart', 'Plotting the data', 'write'), done: X('Completed', 'Chart ready', 'check') },
    quiz: { label: 'quiz', wrote: 'Created quiz',
      start: X('Understanding your goal', 'Defining what to practise', 'read'),
      plan: X('Planning', 'Choosing the key concepts', 'think'), thoughts: X('Planning', 'Choosing the key concepts', 'think'),
      work: X('Creating quiz', 'Writing questions and answers', 'write'), done: X('Completed', 'Quiz ready', 'check') },
    table: { label: 'comparison', wrote: 'Built comparison',
      start: X('Understanding your goal', 'Identifying what to compare', 'read'),
      plan: X('Comparing', 'Choosing comparison criteria', 'think'), thoughts: X('Comparing', 'Weighing the differences', 'think'),
      work: X('Building comparison', 'Filling in the table', 'write'), done: X('Completed', 'Comparison ready', 'check') },
    heft: { label: 'notebook entry', wrote: 'Wrote notebook entry',
      work: X('Writing', 'Solving step by step', 'write'), done: X('Completed', 'Notebook entry ready', 'check') },
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
    if (format === 'praesentation') { const n = (b.slides || b.folien || []).length; return n ? pl(n, 'slide', 'slides') : ''; }
    if (format === 'mindmap') {
      const kids = (x) => [...(x.children || []), ...(x.items || []).map((t) => ({ label: t }))];
      const count = (x) => kids(x).reduce((n, c) => n + 1 + count(c), 0);
      const br = (b.branches || []).length, all = (b.branches || []).reduce((n, x) => n + count(x), 0);
      return br ? `${pl(br, 'branch', 'branches')}${all ? ` · ${pl(all, 'point', 'points')}` : ''}` : '';
    }
    if (format === 'timeline') { const n = (b.events || []).length; return n ? pl(n, 'event', 'events') : ''; }
    if (format === 'chart') return pl(blocks.length, 'chart', 'charts');
    return '';
  };
  const of = (agent, key, format) => {
    const base = (FLOWS[agent] || FLOWS.general)[key] || FLOWS.general[key] || F('Working', key, 'work');
    const o = format && FORMATS[format]?.[key];
    return o ? { ...base, ...o } : base;
  };
  // Research zeigt seinen Ablauf immer ganz, die anderen nur, was wirklich läuft
  const full = (agent) => agent === 'research';
  return { of, full, FLOWS, FORMATS, formatOf, blockFormat, statsOf };
})();
window.Thinking = Thinking;
