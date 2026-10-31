// Websites besuchen: Websuche (DuckDuckGo, ohne Key) + Abruf öffentlicher Seiten.
// Für Fragen zu Apps, Produkten, Firmen, Websites oder aktuellen Dingen, die in Nachschlagewerken fehlen.
// Sicherheit: nur http(s), nur öffentliche Adressen (kein localhost / internes Netz – auch nicht über Weiterleitungen),
// Größen- und Zeitlimits. Seiteninhalte sind UNVERTRAUENSWÜRDIG und werden wie Quellen behandelt.
const dns = require('dns').promises;
const net = require('net');
const R = require('./research');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_BYTES = 1500000;
const hooks = { lookup: (host) => dns.lookup(host, { all: true }) }; // in Tests austauschbar
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;
const BARE_DOMAIN = /\b((?:[a-z0-9-]+\.)+(?:com|de|org|net|io|app|ai|dev|co|eu|at|ch|info|edu|gov))(\/[^\s<>"'`)\]]*)?/gi;

/* ---------- Schutz vor Zugriffen ins eigene Netz ---------- */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:') && isPrivateIp(v6.slice(7));
}

async function assertPublicUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Nur http/https erlaubt');
  if (url.username || url.password) throw new Error('Adresse mit Zugangsdaten nicht erlaubt');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.(localhost|local|internal|lan|home|test))$/i.test(host)) throw new Error('Interne Adresse nicht erlaubt');
  const addrs = net.isIP(host) ? [{ address: host }] : await hooks.lookup(host);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Interne Adresse nicht erlaubt');
  return url;
}

/* fetch mit Zeitlimit, geprüften Weiterleitungen und Größenlimit */
async function fetchPublic(raw, { signal, timeoutMs = 9000, accept = 'text/html,*/*;q=0.8' } = {}) {
  const sig = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean));
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal: sig, headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'de,en;q=0.8' } });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).href);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { reader.cancel().catch(() => {}); break; }
      chunks.push(value);
    }
    return { url: url.href, type: (res.headers.get('content-type') || '').toLowerCase(), body: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('Zu viele Weiterleitungen');
}

/* ---------- HTML → lesbarer Text ---------- */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', euro: '€', copy: '©', reg: '®', trade: '™' };
function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}
const metaContent = (html, re) => decodeEntities((html.match(re) || [])[1] || '').trim();

function extractPage(html) {
  const title = metaContent(html, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || metaContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = metaContent(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i)
    || metaContent(html, /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["']/i)
    || metaContent(html, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  let body = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|form|button|select)\b[\s\S]*?<\/\1>/gi, ' ');
  // Hauptinhalt bevorzugen; Navigation/Fußzeilen weglassen
  const main = body.match(/<(main|article)\b[\s\S]*?<\/\1>/i);
  if (main && main[0].length > 800) body = main[0];
  body = body.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|section|li|h[1-6]|tr|br|article|main)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(body).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 30 && !/^(aus Wikipedia|Zur Navigation|Zur Suche|Jump to|From Wikipedia)/i.test(l)).join('\n');
  return { title: title.slice(0, 200), description: description.slice(0, 400), text };
}

/* ---------- Websuche ----------
   Mehrere Suchmaschinen nacheinander, bis genug Treffer da sind: DuckDuckGo (HTML) → DuckDuckGo Lite → Bing → Google-Suche über Gemini
   (nur mit GEMINI_API_KEY). Grund: Von Server-Adressen (Vercel) blockt DuckDuckGo oft mit einer Prüfseite – dann kam früher NICHTS zurück
   („No suitable sources found“). Jede Suchmaschine liefert { url, title, snippet, host? } – host nur, wenn url eine Weiterleitung ist. */
const clean = (h) => decodeEntities(String(h || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
// Abschnitte, die jeweils bei einem Treffer beginnen und vor dem nächsten enden
const blocksAt = (html, re) => { const at = [...html.matchAll(re)].map((m) => m.index); return at.map((i, k) => html.slice(i, at[k + 1] ?? html.length)); };
function parseDdg(html) {
  const out = [];
  // je Treffer ein Abschnitt ab dem Titel-Link – so gehört der Auszug sicher zum richtigen Treffer
  for (const block of blocksAt(html, /<a[^>]+class="result__a"/g)) {
    const m = block.match(/^<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!m) continue;
    let href = decodeEntities(m[1]);
    if (/duckduckgo\.com\/y\.js|ad_domain|ad_provider/.test(href)) continue; // Werbung
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (!/^https?:\/\//.test(href)) continue;
    const sn = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    out.push({ url: href, title: clean(m[2]), snippet: clean(sn?.[1]) });
  }
  return out;
}
function parseDdgLite(html) {
  const out = [];
  for (const block of blocksAt(html, /<a[^>]+class=['"]result-link['"]/g)) {
    const m = block.match(/^<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!m) continue;
    let href = decodeEntities(m[1]);
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (/duckduckgo\.com\/y\.js/.test(href) || !/^https?:\/\//.test(href)) continue;
    const sn = block.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/);
    out.push({ url: href, title: clean(m[2]), snippet: clean(sn?.[1]) });
  }
  return out;
}
// Bing-Links sind oft Weiterleitungen (bing.com/ck/a?…&u=a1<base64>) – die echte Adresse steckt im Parameter u
function bingTarget(href) {
  const u = href.match(/[?&]u=a1([^&]+)/);
  if (!u) return href;
  try { return Buffer.from(u[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { return href; }
}
function parseBing(html) {
  const out = [];
  for (const block of html.split(/<li class="b_algo"/).slice(1)) {
    const a = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const href = bingTarget(decodeEntities(a[1]));
    if (!/^https?:\/\//.test(href) || /(^|\.)bing\.com\//.test(href.replace(/^https?:\/\//, ''))) continue;
    const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    out.push({ url: href, title: clean(a[2]), snippet: clean(p?.[1]) });
  }
  return out;
}
// Google-Suche über Gemini („Grounding“): liefert die Seiten, auf die sich Gemini stützt. Die Adressen sind Weiterleitungen
// (vertexaisearch.cloud.google.com/…) – der Titel ist meist die Domain; die echte Seite steht nach dem Lesen fest.
async function geminiSearch(query, { signal, key }) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Suche im Web nach: ${query}\nBevorzuge deutschsprachige Quellen (deutsche Seiten zuerst). Nenne kurz die wichtigsten Fakten mit Quellen.` }] }],
      tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 600 },
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)].filter(Boolean)),
  });
  if (!r.ok) throw new Error(`Gemini-Suche HTTP ${r.status}`);
  const meta = (await r.json()).candidates?.[0]?.groundingMetadata || {};
  const supports = meta.groundingSupports || [];
  return (meta.groundingChunks || []).map((c, i) => {
    const w = c.web || {};
    const host = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(w.title || '') ? w.title.toLowerCase() : '';
    const snippet = supports.filter((s) => (s.groundingChunkIndices || []).includes(i)).map((s) => s.segment?.text).filter(Boolean).join(' ').slice(0, 300);
    return w.uri ? { url: w.uri, title: w.title || host, snippet, host } : null;
  }).filter(Boolean);
}
const ENGINES = {
  ddg: async (q, o) => parseDdg((await fetchPublic(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=de-de`, o)).body),
  ddglite: async (q, o) => parseDdgLite((await fetchPublic(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}&kl=de-de`, o)).body),
  bing: async (q, o) => parseBing((await fetchPublic(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=de&cc=DE`, o)).body),
};
hooks.engines = ENGINES; hooks.geminiSearch = geminiSearch;
// Schul-App: Erwachsenen-/Glücksspielseiten nie als Treffer (Suchmaschinen liefern bei Wortlisten-Anfragen manchmal Unsinn)
const UNSAFE = /(porn|xxx|xvideo|xnxx|xhamster|redtube|youporn|brazzers|onlyfans|chaturbate|stripchat|camsoda|livejasmin|hentai|erotik|\bsex|casino|\bbet(ting)?\b|gambl)/i;
const unsafe = (r) => { let host = ''; try { host = new URL(r.url).hostname; } catch {} return UNSAFE.test(host) || UNSAFE.test(String(r.title || '')); };
async function searchWeb(query, { signal, env, min = 4 } = {}) {
  const out = [], seen = new Set(), errors = [];
  const add = (list, via) => list.forEach((r) => { const k = r.url.replace(/#.*$/, ''); if (!seen.has(k) && !unsafe(r)) { seen.add(k); out.push({ ...r, via }); } });
  for (const name of ['ddg', 'ddglite', 'bing']) {
    if (out.length >= min) break;
    try { add(await hooks.engines[name](query, { signal, timeoutMs: 8000 }), name); } catch (err) { if (signal?.aborted) throw err; errors.push(`${name}: ${err.message}`); }
  }
  // Google über Gemini: alle Schlüssel nacheinander (einer am Tageslimit → der nächste)
  const keys = String(env?.GEMINI_API_KEY || '').split(/[\s,;]+/).filter(Boolean).slice(0, 4);
  for (const key of out.length < min ? keys : []) {
    try { add(await hooks.geminiSearch(query, { signal, key }), 'google'); break; } catch (err) { if (signal?.aborted) throw err; errors.push(`google: ${err.message}`); }
  }
  if (!out.length && errors.length) throw new Error(`Keine Suchmaschine erreichbar (${errors.join('; ')})`);
  return out;
}

/* URLs und Domains aus der Nachricht des Lernenden */
function urlsInText(text) {
  const found = new Set((String(text || '').match(URL_IN_TEXT) || []).map((u) => u.replace(/[.,;:!?]+$/, '')));
  for (const m of String(text || '').matchAll(BARE_DOMAIN)) {
    const full = `https://${m[1]}${m[2] || ''}`.replace(/[.,;:!?]+$/, '');
    if (![...found].some((u) => u.includes(m[1]))) found.add(full);
  }
  return [...found].slice(0, 3);
}

/* ---------- Ablauf ----------
   plan: { urls[], queries[], topic }  limits: { maxPages, timeMs }
   onEvent(e): e.action = 'search' | 'visit' | 'visited' */
// Links auf derselben Website (für „lies alles von dieser Seite“) – ohne Anker, Dateien, Login/Impressum/Datenschutz
function sameSiteLinks(html, base) {
  let host;
  try { host = new URL(base).hostname; } catch { return []; }
  const self = String(base).replace(/#.*$/, '').replace(/\/$/, '');
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let u;
    try { u = new URL(decodeEntities(m[1]), base); } catch { continue; }
    if (u.hostname !== host || !/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|mp3|docx?|xlsx?)$/i.test(u.pathname)) continue;
    if (/(login|anmelden|signin|register|impressum|datenschutz|privacy|cookie|agb|terms|kontakt|contact|warenkorb|cart)/i.test(u.pathname)) continue;
    u.hash = '';
    if (u.href.replace(/\/$/, '') !== self) out.push(u.href);
  }
  return out;
}

async function browse(plan, limits, { signal, onEvent } = {}) {
  const sig = AbortSignal.any([signal, AbortSignal.timeout(limits.timeMs)].filter(Boolean));
  const emit = (e) => onEvent?.(e);
  const candidates = [];
  const seenUrl = new Set();
  const perDomain = new Map();
  const add = (url, origin, host) => {
    let key;
    try { key = new URL(url).href.replace(/#.*$/, ''); } catch { return; }
    const domain = host || R.domainOf(key);
    if (seenUrl.has(key) || (perDomain.get(domain) || 0) >= 1) return;
    seenUrl.add(key);
    perDomain.set(domain, (perDomain.get(domain) || 0) + 1);
    candidates.push({ url: key, domain, origin });
  };
  (plan.urls || []).forEach((u) => add(u, 'link'));
  const failures = [];
  for (const q of (plan.queries || []).slice(0, 2)) {
    if (candidates.length >= limits.maxPages) break;
    emit({ action: 'search', query: q });
    try {
      const results = await searchWeb(q, { signal: sig, env: limits.env });
      emit({ action: 'search', query: q, results: results.length });
      const ranked = limits.rank
        ? results.map((r) => ({ r, s: limits.rank(r) })).filter((x) => x.s != null).sort((a, b) => b.s - a.s).map((x) => x.r)
        : results;
      ranked.slice(0, 6).forEach((r) => add(r.url, 'search', r.host));
    } catch (err) {
      if (signal?.aborted) throw err;
      failures.push({ provider: 'websuche', query: q, error: err.message });
    }
  }
  const topicTerms = R.terms(`${plan.topic || ''} ${(plan.queries || []).join(' ')}`);
  const pages = [];
  const subLinks = []; // limits.crawl: Unterseiten der vom Nutzer genannten Websites
  const visit = async (c, i) => {
    await new Promise((r) => setTimeout(r, i * 150));
    if (sig.aborted) return;
    emit({ action: 'visit', url: c.url, domain: c.domain });
    try {
      const res = await fetchPublic(c.url, { signal: sig });
      if (!/html|text\/plain/.test(res.type)) throw new Error('Kein lesbarer Text');
      const page = /html/.test(res.type) ? extractPage(res.body) : { title: '', description: '', text: res.body };
      if (limits.crawl && c.origin === 'link' && /html/.test(res.type)) subLinks.push(...sameSiteLinks(res.body, res.url));
      const clean = R.sanitizeExternal(page.text, 5000);
      if (clean.text.length < 150 && !page.description) throw new Error('Kaum lesbarer Inhalt (evtl. nur mit JavaScript)');
      const passage = R.bestPassage(clean.text, plan.topic || topicTerms.join(' '), 300);
      const seen = R.sanitizeExternal(page.description || passage, 300).text;
      const p = {
        url: res.url, domain: R.domainOf(res.url), title: R.sanitizeExternal(page.title || c.domain, 200).text,
        description: R.sanitizeExternal(page.description, 400).text, text: clean.text, passage, seen,
        suspicious: clean.suspicious || R.INJECTION.test(page.description || ''), origin: c.origin, order: i,
      };
      pages.push(p);
      emit({ action: 'visited', url: p.url, domain: p.domain, title: p.title, seen: p.suspicious ? '' : p.seen, status: p.suspicious ? 'ignored' : 'done',
        note: p.suspicious ? 'Seite enthält Anweisungen an KI-Systeme – ignoriert' : '' });
    } catch (err) {
      if (signal?.aborted) throw err;
      failures.push({ provider: 'website', query: c.url, error: err.message });
      emit({ action: 'visited', url: c.url, domain: c.domain, status: 'failed', note: err.name === 'TimeoutError' ? 'Zeitüberschreitung' : err.message });
    }
  };
  const first = candidates.slice(0, limits.maxPages);
  await Promise.all(first.map(visit));
  // „Lies alles von dieser Website“: danach noch Unterseiten derselben Website
  if (limits.crawl && subLinks.length && !sig.aborted) {
    const fresh = [...new Set(subLinks)].filter((u) => !seenUrl.has(u)).slice(0, limits.crawl);
    fresh.forEach((u) => seenUrl.add(u));
    await Promise.all(fresh.map((u, i) => visit({ url: u, domain: R.domainOf(u), origin: 'crawl' }, first.length + i)));
  }
  if (signal?.aborted) throw signal.reason || new Error('aborted');
  return { pages: pages.filter((p) => !p.suspicious).sort((a, b) => a.order - b.order), failures, visited: candidates.length };
}

/* Eine Seite lesen (für die Tiefen-Recherche): Text, Titel, beste Stelle zum Thema – wirft bei Fehler oder verdächtigem Inhalt */
async function readPage(url, { signal, topic = '', max = 6000 } = {}) {
  const res = await fetchPublic(url, { signal, timeoutMs: 10000 });
  if (!/html|text\/plain/.test(res.type)) throw new Error('Kein lesbarer Text');
  const page = /html/.test(res.type) ? extractPage(res.body) : { title: '', description: '', text: res.body };
  const clean = R.sanitizeExternal(page.text, max);
  if (clean.text.length < 200 && !page.description) throw new Error('Kaum lesbarer Inhalt');
  if (clean.suspicious || R.INJECTION.test(page.description || '')) throw new Error('Seite enthält Anweisungen an KI-Systeme – ignoriert');
  return {
    url: res.url, domain: R.domainOf(res.url), title: R.sanitizeExternal(page.title || R.domainOf(res.url), 200).text,
    description: R.sanitizeExternal(page.description, 400).text, text: clean.text, passage: R.bestPassage(clean.text, topic, 300),
  };
}

module.exports = { parseDdg, parseDdgLite, parseBing, bingTarget, geminiSearch, readPage, hooks, browse, searchWeb, fetchPublic, extractPage, urlsInText, assertPublicUrl, isPrivateIp, decodeEntities };
