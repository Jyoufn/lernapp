// Recherche in verlässlichen, frei zugänglichen Quellen – ohne API-Key:
//  - OpenAlex: wissenschaftliche Fachartikel (Abstracts, Autor:innen, Zeitschrift, Datum, DOI)
//  - Wikipedia (de/en): nur als Einstieg/Überblick, höchstens 2 Artikel
// Alle Zahlen (Suchanfragen, gefunden, abgerufen, bewertet, verwendet) werden echt gezählt.
// Externe Texte sind UNVERTRAUENSWÜRDIG: sie werden bereinigt, auf Prompt-Injection geprüft
// und nur als markierte Daten an das Modell gegeben.

const RESEARCH_UA = { 'User-Agent': 'LernApp/0.2 (local learning app; research)' };
const WIKI_MAX = 2;          // Wikipedia höchstens als Ergänzung
const MIN_RELEVANCE = 0.5;   // darunter gilt eine Quelle als nicht passend
const GERMAN_FILL = 3;       // fremdsprachige Quellen nur, bis zusammen so viele Quellen da sind (deutsche haben Vorrang)
const STOP = new Set(('der die das und oder ein eine einer eines einem einen ist sind war wie was wer wann wo warum welche welcher welches '
  + 'mit von zu im in am an auf für bei aus über unter nach vor durch den dem des sich nicht auch als dass kann können wird werden '
  + 'erkläre erklär erklären beschreibe bitte mir mal genau ausführlich kurz the of and or a an to in on for with by from is are was what how why which').split(' '));

/* Injection-Muster: Anweisungen an eine KI, die in Quellen nichts zu suchen haben */
const INJECTION = /(ignore|disregard|forget)\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)|ignoriere\s+(alle\s+)?(vorherigen|bisherigen|obigen)\s+(anweisungen|regeln)|\b(system\s*prompt|you are now|du bist (jetzt|ab sofort))\b|<\/?\s*(system|assistant|quelle|source)\b/i;

const today = () => new Date().toISOString().slice(0, 10);
function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function terms(text) {
  return [...new Set(String(text || '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w)))];
}

/* Externen Text bereinigen: Steuerzeichen raus, Tag-Klammern entschärfen, Länge begrenzen */
function sanitizeExternal(text, max = 4000) {
  const clean = String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/</g, '‹').replace(/>/g, '›')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text: clean.slice(0, max), suspicious: INJECTION.test(String(text || '')) };
}

/* Zwei Wörter gelten als gleich, wenn sie weitgehend denselben Anfang haben (photosynthese ≈ photosynthesis, reaction ≈ reactions) */
function sameWord(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n >= 4 && n >= Math.min(a.length, b.length) * 0.8;
}

/* Abdeckung: welcher Anteil der Suchbegriffe kommt vor? Titel zählt voll, Text halb. 0..1 */
// Seiten, die nur ein ganzes Schulfach behandeln (z. B. „Biologie“), passen nie zu einer konkreten Frage
const GENERIC_SUBJECT = /^(biologie|chemie|physik|mathematik|mathe|geschichte|erdkunde|geographie|geografie|politik|sozialkunde|wirtschaft|informatik|deutsch|englisch|französisch|latein|religion|ethik|philosophie|kunst|musik|sport|naturwissenschaften?|lebewesen|zelle|zellen)$/i;
function relevance(queryTerms, title, text) {
  if (!queryTerms.length) return 0;
  const tt = terms(title);
  const body = String(text || '').toLowerCase();
  let score = 0;
  for (const q of queryTerms) {
    if (tt.some((w) => sameWord(q, w))) score += 1;
    else if (body.includes(q.length > 5 ? q.slice(0, -1) : q)) score += 0.5;
  }
  return Math.min(1, score / queryTerms.length);
}

/* Präzision: wie sehr dreht sich der Titel um das Thema? Spezialstudien mit vielen fremden Begriffen
   (z. B. „Heat-shock protein protects photosystem II during …“) sind für Lernende selten die beste Quelle. */
function titlePrecision(topicTerms, title) {
  const tt = terms(title);
  if (!tt.length) return 0;
  return tt.filter((w) => topicTerms.some((q) => sameWord(q, w))).length / tt.length;
}

/* Passendste Textstelle (ca. 1–3 Sätze) zu einer Aussage/Frage */
function bestPassage(text, query, maxLen = 420) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9„"(])/u).filter((s) => s.length > 30);
  if (!sentences.length) return String(text || '').slice(0, maxLen);
  const q = terms(query);
  let best = 0, bestScore = -1;
  sentences.forEach((s, i) => {
    const window = s + ' ' + (sentences[i + 1] || '');
    const sc = relevance(q, '', window);
    if (sc > bestScore) { bestScore = sc; best = i; }
  });
  let out = sentences[best];
  if (out.length < 220 && sentences[best + 1]) out += ' ' + sentences[best + 1];
  return out.length > maxLen ? out.slice(0, maxLen - 1).trimEnd() + '…' : out;
}

/* Die relevantesten Absätze eines langen Artikels (Einleitung bleibt immer dabei) */
function relevantParagraphs(text, queryTerms, max) {
  const paras = String(text || '').split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 80);
  if (!paras.length) return '';
  const lead = paras[0];
  const rest = paras.slice(1).map((p, i) => ({ p, i, s: relevance(queryTerms, '', p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const picked = [];
  let len = lead.length;
  for (const r of rest) {
    if (len + r.p.length > max) continue;
    picked.push(r);
    len += r.p.length;
  }
  return [lead, ...picked.sort((a, b) => a.i - b.i).map((r) => r.p)].join('\n').slice(0, max);
}

/* fetch mit Zeitlimit und Wiederholung bei Drosselung (429/5xx) */
async function fetchJson(url, { signal, timeoutMs = 12000, retries = 2 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw signal.reason || new Error('aborted');
    const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    try {
      const res = await fetch(url, { headers: RESEARCH_UA, signal: sig });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err.name === 'TimeoutError' ? new Error(`Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)} s`) : err;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  throw lastErr;
}

/* ---------- Wikipedia ---------- */
async function searchWikipedia(query, lang, opts) {
  const api = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  Object.entries({ action: 'query', format: 'json', origin: '*', list: 'search', srsearch: query, srlimit: '3', srprop: 'snippet|timestamp' })
    .forEach(([k, v]) => api.searchParams.set(k, v));
  const j = await fetchJson(api, opts);
  return (j.query?.search || []).map((r) => ({
    provider: 'wikipedia', lang, query,
    title: r.title,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    snippet: String(r.snippet || '').replace(/<[^>]+>/g, ''),
    published: r.timestamp ? String(r.timestamp).slice(0, 10) : '',
  }));
}

async function fetchWikipediaText(candidate, opts) {
  const api = new URL(`https://${candidate.lang}.wikipedia.org/w/api.php`);
  Object.entries({
    action: 'query', format: 'json', origin: '*', titles: candidate.title, redirects: '1',
    prop: 'extracts|info|revisions', explaintext: '1', exsectionformat: 'plain', inprop: 'url', rvprop: 'timestamp',
  }).forEach(([k, v]) => api.searchParams.set(k, v));
  const j = await fetchJson(api, opts);
  const page = Object.values(j.query?.pages || {})[0];
  if (!page || page.missing !== undefined || !page.extract) throw new Error('Artikel nicht abrufbar');
  return {
    text: page.extract,
    url: page.fullurl || candidate.url,
    published: page.revisions?.[0]?.timestamp ? page.revisions[0].timestamp.slice(0, 10) : candidate.published,
  };
}

/* ---------- OpenAlex (wissenschaftliche Literatur) ---------- */
async function searchOpenAlex(query, opts, lang = '') {
  const api = new URL('https://api.openalex.org/works');
  Object.entries({
    search: query, 'per-page': '10', filter: `has_abstract:true,cited_by_count:>${lang ? 2 : 20}${lang ? `,language:${lang}` : ''}`,
    select: 'id,title,doi,publication_year,publication_date,cited_by_count,type,abstract_inverted_index,primary_location,authorships,language',
  }).forEach(([k, v]) => api.searchParams.set(k, v));
  const j = await fetchJson(api, opts);
  return (j.results || []).map((w) => {
    // Abstract aus dem „inverted index“ zusammensetzen – der Inhalt kommt also mit der Suche an
    const words = [];
    for (const [word, positions] of Object.entries(w.abstract_inverted_index || {})) positions.forEach((pos) => { words[pos] = word; });
    const authors = (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean);
    const institution = w.authorships?.[0]?.institutions?.[0]?.display_name || '';
    const url = w.doi || w.id;
    // Verlagsseite (z. B. pubs.acs.org) statt doi.org – für Anzeige und Website-Logo
    const site = domainOf(w.primary_location?.landing_page_url || '');
    return {
      site: site && site !== 'doi.org' ? site : '',
      provider: 'openalex', query, lang: w.language || '',
      title: w.title || '',
      url,
      authors: authors.length > 3 ? `${authors.slice(0, 3).join(', ')} u. a.` : authors.join(', '),
      institution,
      venue: w.primary_location?.source?.display_name || '',
      published: w.publication_date || (w.publication_year ? String(w.publication_year) : ''),
      workType: w.type || 'article',
      citedBy: w.cited_by_count || 0,
      text: words.filter(Boolean).join(' '),
    };
  }).filter((w) => w.title);
}

/* ---------- Ablauf ----------
   plan: { topic, queriesDe[], queriesEn[] }
   limits: { maxQueries, maxSources, timeMs }
   onProgress(counts, queries) wird bei jeder echten Änderung aufgerufen. */
async function research(plan, limits, { signal, onProgress } = {}) {
  const started = Date.now();
  const deadline = AbortSignal.timeout(limits.timeMs);
  const sig = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const counts = { queries: 0, found: 0, fetched: 0, failed: 0, evaluated: 0, used: 0, cited: 0 };
  const failures = [];
  const candidates = [];
  const seen = new Set();
  const sentQueries = [];
  const progress = () => onProgress?.({ ...counts }, [...sentQueries]);
  const topicTerms = terms(`${plan.topic || ''} ${(plan.queriesDe || []).join(' ')} ${(plan.queriesEn || []).join(' ')}`);

  // Suchanfragen in dieser Reihenfolge (die ersten maxQueries werden gestellt):
  // deutsche Wikipedia als Einstieg, Fachliteratur (englisch + deutschsprachig), englische Wikipedia nur ohne deutschen Begriff
  const de = plan.queriesDe || [];
  const en = plan.queriesEn || [];
  const jobs = [];
  if (de[0]) jobs.push({ provider: 'wikipedia', q: de[0], lang: 'de', run: () => searchWikipedia(de[0], 'de', { signal: sig }) });
  // Fachliteratur (OpenAlex) nur, wenn erlaubt – in der App nur beim Lern-Agenten (limits.academic === true)
  const academic = limits.academic !== false && !limits.germanOnly; // Lernen: nur deutsche Fachquellen – keine (englische) Fachliteratur
  if (academic && en[0]) jobs.push({ provider: 'openalex', q: en[0], run: () => searchOpenAlex(en[0], { signal: sig }) });
  if (academic && de[0]) jobs.push({ provider: 'openalex', q: de[0], lang: 'de', run: () => searchOpenAlex(de[0], { signal: sig }, 'de') });
  if (academic) en.slice(1).forEach((q) => jobs.push({ provider: 'openalex', q, run: () => searchOpenAlex(q, { signal: sig }) }));
  if (de[1]) jobs.push({ provider: 'wikipedia', q: de[1], lang: 'de', run: () => searchWikipedia(de[1], 'de', { signal: sig }) });
  if (!de.length && en[0] && !limits.germanOnly) jobs.push({ provider: 'wikipedia', q: en[0], lang: 'en', run: () => searchWikipedia(en[0], 'en', { signal: sig }) });
  const plannedJobs = jobs.slice(0, limits.maxQueries);

  const searchOne = async (job, i) => {
    await new Promise((r) => setTimeout(r, i * 200)); // leicht versetzt – Wikipedia drosselt sonst
    if (sig.aborted) return;
    counts.queries++;
    sentQueries.push({ provider: job.provider, query: job.q, lang: job.lang || 'en' });
    progress();
    try {
      for (const c of await job.run()) {
        const key = c.url.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ ...c, state: 'found' });
        counts.found++;
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      failures.push({ provider: job.provider, query: job.q, error: err.message || String(err) });
    }
    progress();
  };
  await Promise.all(plannedJobs.map(searchOne));
  if (signal?.aborted) throw signal.reason || new Error('aborted');

  // Inhalte abrufen: Fachartikel bringen ihr Abstract mit, Wikipedia-Artikel werden einzeln geladen
  // (nur der beste Treffer je Suchanfrage – das spart Anfragen)
  const wikiByQuery = new Map();
  for (const c of candidates.filter((x) => x.provider === 'wikipedia')) {
    const sc = relevance(terms(c.query), c.title, c.snippet);
    const prev = wikiByQuery.get(c.query + c.lang);
    if (!prev || sc > prev.sc) wikiByQuery.set(c.query + c.lang, { c, sc });
  }
  for (const c of candidates.filter((x) => x.provider === 'openalex')) {
    if (c.text.length >= 200) { c.state = 'fetched'; counts.fetched++; }
    else { c.state = 'failed'; c.error = 'Kein Abstract verfügbar'; counts.failed++; }
  }
  progress();
  await Promise.all([...wikiByQuery.values()].map(async ({ c }, i) => {
    await new Promise((r) => setTimeout(r, i * 200));
    if (sig.aborted) { c.state = 'failed'; c.error = 'Zeitlimit der Recherche erreicht'; counts.failed++; return; }
    try {
      const page = await fetchWikipediaText(c, { signal: sig });
      Object.assign(c, page, { state: 'fetched' });
      counts.fetched++;
    } catch (err) {
      if (signal?.aborted) throw err;
      c.state = 'failed';
      c.error = err.message || String(err);
      counts.failed++;
      failures.push({ provider: 'wikipedia', query: c.title, error: c.error });
    }
    progress();
  }));
  if (signal?.aborted) throw signal.reason || new Error('aborted');

  // Bewerten: Relevanz zum Thema, Quellentyp (Fachliteratur > Lexikon), Zitierhäufigkeit, Injection-Verdacht
  const fetched = candidates.filter((c) => c.state === 'fetched');
  for (const c of fetched) {
    const clean = sanitizeExternal(c.provider === 'wikipedia' ? relevantParagraphs(c.text, topicTerms, 3800) : c.text, c.provider === 'wikipedia' ? 3800 : 2600);
    c.text = clean.text;
    c.suspicious = clean.suspicious;
    // Abdeckung (an der eigenen Suchanfrage in gleicher Sprache oder am Gesamtthema – der bessere Wert)
    // kombiniert mit der Präzision des Titels
    const coverage = Math.max(relevance(terms(c.query), c.title, c.text), relevance(topicTerms, c.title, c.text));
    c.relevance = 0.6 * coverage + 0.4 * titlePrecision(topicTerms, c.title);
    c.german = c.lang === 'de';
    const typeWeight = (c.provider === 'openalex' ? (c.workType === 'review' || /review|overview/i.test(c.title) ? 1.2 : 1) : 0.9) * (c.german ? 1.15 : 1);
    c.score = c.relevance * typeWeight + (c.citedBy ? Math.min(0.1, Math.log10(c.citedBy) * 0.03) : 0) - (c.suspicious ? 1 : 0);
    c.state = 'evaluated';
    counts.evaluated++;
  }
  progress();

  // Inhaltliche Bewertung durch das Modell (optional): passt die Quelle wirklich zur Frage des Lernenden?
  // Wortabgleich allein lässt Spezialstudien durch, die nur dieselben Begriffe enthalten.
  if (limits.judge) {
    const pool = fetched.filter((c) => !c.suspicious && c.relevance >= 0.3).sort((a, b) => b.score - a.score).slice(0, 14);
    if (pool.length) {
      try {
        const scores = await limits.judge(pool.map((c, i) => ({
          i, title: c.title, lang: c.lang || 'en', kind: c.provider === 'wikipedia' ? 'encyclopedia' : (c.workType || 'article'), venue: c.venue || c.lang || '', year: String(c.published || '').slice(0, 4),
          excerpt: c.text.slice(0, 300),
        })), sig);
        pool.forEach((c, i) => {
          const j = scores.get(i);
          if (j == null) return;
          c.judged = j;
          c.relevance = 0.4 * c.relevance + 0.6 * (j / 10);
          c.score = c.relevance * (c.provider === 'openalex' ? (c.workType === 'review' || /review|overview/i.test(c.title) ? 1.2 : 1) : 0.9) * (c.german ? 1.15 : 1);
          if (j < 6) c.rejected = 'passt inhaltlich nicht zur Frage';
        });
        counts.judged = pool.filter((c) => c.judged != null).length;
        // Bewertung hat geklappt → nicht bewertete Kandidaten (außerhalb der besten 14) nicht ungeprüft übernehmen
        if (counts.judged) fetched.forEach((c) => { if (c.judged == null && !c.rejected) c.rejected = 'nicht inhaltlich geprüft'; });
      } catch (err) {
        if (signal?.aborted) throw err;
        failures.push({ provider: 'bewertung', query: '', error: 'Inhaltliche Bewertung nicht verfügbar – nur Wortabgleich' });
      }
      progress();
    }
  }

  // Auswählen: nur passende Quellen. Fachliteratur hat Vorrang; der beste Wikipedia-Artikel bekommt einen
  // Ergänzungsplatz als Einstieg/Überblick, höchstens WIKI_MAX insgesamt.
  const ranked = fetched.sort((a, b) => b.score - a.score);
  for (const c of ranked) {
    if (limits.germanOnly && c.lang && c.lang !== 'de' && !c.rejected) c.rejected = 'Lernen: nur deutsche Quellen';
    // nur das ganze Schulfach („Biologie“) statt des gefragten Themas → zu allgemein
    if (!c.rejected && GENERIC_SUBJECT.test(String(c.title || '').replace(/\s*[–|-]\s*(wikipedia|studyflix|simpleclub|serlo).*$/i, '').trim())) c.rejected = 'zu allgemein (nur das Schulfach)';
    if (c.suspicious) c.rejected = 'Verdacht auf eingeschleuste Anweisungen';
    else if (!c.rejected && c.relevance < MIN_RELEVANCE) c.rejected = 'nicht relevant genug';
  }
  const ok = ranked.filter((c) => !c.rejected);
  const bestWiki = ok.find((c) => c.provider === 'wikipedia');
  const selected = [];
  let wiki = 0;
  const pick = (c) => { c.state = 'used'; selected.push(c); };
  const skip = (c, why) => { c.rejected = why; };
  // Deutsche Quellen zuerst; fremdsprachige (meist englische Fachartikel) nur als Ergänzung, solange es zusammen weniger als GERMAN_FILL Quellen sind
  const ordered = [...ok.filter((c) => c.lang === 'de'), ...ok.filter((c) => c.lang !== 'de')];
  for (const c of ordered) {
    if (c.lang !== 'de' && selected.length >= Math.min(GERMAN_FILL, limits.maxSources)) { skip(c, 'deutschsprachige Quellen bevorzugt'); continue; }
    if (c.provider === 'wikipedia') {
      if (wiki >= WIKI_MAX) { skip(c, 'Wikipedia nur als Ergänzung'); continue; }
      if (selected.length >= limits.maxSources) { skip(c, 'weniger relevant als die ausgewählten Quellen'); continue; }
      wiki++;
      pick(c);
      continue;
    }
    // Fachquelle: Platz für den besten Wikipedia-Artikel freihalten, solange er noch nicht gewählt ist
    const free = limits.maxSources - selected.length - (bestWiki && bestWiki.state !== 'used' ? 1 : 0);
    if (free <= 0) { skip(c, 'weniger relevant als die ausgewählten Quellen'); continue; }
    pick(c);
  }
  counts.used = selected.length;
  // Nummerierung: deutschsprachige Quellen zuerst, danach nach Güte
  selected.sort((a, b) => (b.german ? 1 : 0) - (a.german ? 1 : 0) || b.score - a.score);

  // DOI-Links auflösen → echte Verlagsseite (für Anzeige und Website-Logo); nur für ausgewählte Quellen
  await Promise.all(selected.filter((c) => !c.site && /^https:\/\/doi\.org\//.test(c.url)).map(async (c) => {
    try {
      const res = await fetch(c.url, { method: 'HEAD', redirect: 'manual', headers: RESEARCH_UA, signal: AbortSignal.any([sig, AbortSignal.timeout(4000)]) });
      const host = domainOf(new URL(res.headers.get('location') || '', c.url).href);
      if (host && host !== 'doi.org') c.site = host;
    } catch {}
  }));
  progress();

  const retrieved = today();
  const toSource = (c, n) => ({
    id: n ? `s${n}` : null,
    n: n || null,
    title: c.title,
    authors: c.provider === 'wikipedia' ? 'Wikipedia-Autor:innen' : c.authors || '',
    institution: c.provider === 'wikipedia' ? 'Wikimedia Foundation' : c.institution || '',
    publisher: c.provider === 'wikipedia' ? `Wikipedia (${c.lang})` : c.venue || '',
    domain: c.site || domainOf(c.url),
    url: c.url,
    published: c.published || '',
    retrieved,
    type: c.provider === 'wikipedia' ? 'encyclopedia' : (c.workType === 'review' || /review|overview/i.test(c.title) ? 'review' : c.workType || 'article'),
    relevance: c.relevance != null ? Math.round(c.relevance * 100) / 100 : null,
    state: c.state,
    note: c.rejected || c.error || '',
    passage: '',
  });
  const sources = selected.map((c, i) => ({ ...toSource(c, i + 1), text: c.text, passage: bestPassage(c.text, plan.topic || topicTerms.join(' ')) }));
  const others = candidates.filter((c) => c.state !== 'used').slice(0, 24).map((c) => toSource(c, null));
  const allFailed = plannedJobs.length > 0 && failures.length >= counts.queries && counts.found === 0;
  return {
    status: allFailed ? 'failed' : sources.length >= 2 ? 'ok' : 'insufficient',
    sources, others, counts, failures, queries: sentQueries, durationMs: Date.now() - started,
    timedOut: deadline.aborted,
  };
}

/* Welche Quellen wurden in der fertigen Antwort tatsächlich zitiert – und mit welcher Aussage? */
function collectCitations(answer, sources) {
  const valid = new Map(sources.map((s) => [s.n, s]));
  const cited = new Map();
  const freq = {};
  const invalid = new Set();
  const sentences = String(answer || '').replace(/```[\s\S]*?```/g, '').split(/(?<=[.!?:])\s+|\n+/);
  for (const sentence of sentences) {
    const nums = [...sentence.matchAll(/\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\](?!\()/g)].flatMap((m) => m[1].split(/[,;]/).map((x) => Number(x.trim())));
    for (const n of nums) {
      if (!valid.has(n)) { invalid.add(n); continue; }
      freq[n] = (freq[n] || 0) + 1;
      if (!cited.has(n)) cited.set(n, sentence.replace(/\[\d{1,2}(?:\s*[,;]\s*\d{1,2})*\]/g, '').replace(/[#*_>`]/g, '').trim());
    }
  }
  return {
    cited: [...cited.keys()].sort((a, b) => a - b),
    freq,
    invalid: [...invalid],
    passages: [...cited.entries()].map(([n, claim]) => ({ n, claim: claim.slice(0, 300), passage: bestPassage(valid.get(n).text, claim) })),
  };
}

module.exports = { GENERIC_SUBJECT,
  research, collectCitations, sanitizeExternal, relevance, titlePrecision, sameWord, bestPassage, terms, domainOf, INJECTION,
  searchWikipedia, searchOpenAlex, fetchWikipediaText, relevantParagraphs,
};
