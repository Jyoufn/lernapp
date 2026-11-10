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
async function fetchPublic(raw, { signal, timeoutMs = 9000, accept = 'text/html,*/*;q=0.8', maxBytes = MAX_BYTES, binary = false } = {}) {
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
      if (size > maxBytes) { reader.cancel().catch(() => {}); if (binary) throw new Error('Datei zu groß'); break; }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks);
    return { url: url.href, type: (res.headers.get('content-type') || '').toLowerCase(), body: binary ? buf : buf.toString('utf8') };
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

/* Bilder aus gelesenen Lernquellen (Wunsch 03.11.: passende Bilder aus dem Netz statt selbst erzeugter) – serlo (CC BY-SA 4.0), Wikipedia/Wikimedia
   Commons (freie Lizenzen) und die großen Lernplattformen (Studyflix, simpleclub, sofatutor, Lernhelfer, LEIFIphysik, Planet Wissen/Schule …).
   Die App zeigt sie nur eingebettet mit Herkunft und Link zur Seite (keine Kopie); nur Bilder der Seite selbst bzw. ihres Bild-Servers, keine Logos/Icons. */
const IMAGE_PAGES = /(^|\.)(serlo\.org|wikipedia\.org|studyflix\.de|simpleclub\.com|sofatutor\.com|lernhelfer\.de|leifiphysik\.de|planet-wissen\.de|planet-schule\.de|abiweb\.de|frustfrei-lernen\.de|mathebibel\.de|kapiert\.de|chemie\.de|biologie-schule\.de)$/i;
const FREE_IMAGE_HOSTS = /(^|\.)(assets\.serlo\.org|upload\.wikimedia\.org)$/i;
const IMAGE_LICENSE = (host, page) => (/serlo/.test(host) ? 'serlo.org · CC BY-SA 4.0' : /wikimedia/.test(host) ? 'Wikimedia Commons · freie Lizenz' : `Bild: ${page}`);
const siteOf = (h) => String(h || '').replace(/^www\./, '').split('.').slice(-2).join('.');
function extractImages(html, base, max = 5) {
  let pageHost = ''; try { pageHost = new URL(base).hostname.replace(/^www\./, ''); } catch { return []; }
  if (!IMAGE_PAGES.test(pageHost)) return [];
  const site = siteOf(pageHost);
  const okHost = (h) => FREE_IMAGE_HOSTS.test(h) || siteOf(h) === site || /(^|\.)(studyflix\.de|simpleclub\.com|sofatutor\.com|ctfassets\.net|imgix\.net|cloudfront\.net|wdr\.de|ardmediathek\.de)$/i.test(h) && !/serlo|wikipedia/.test(site);
  const main = html.match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0] || html;
  const out = [], seen = new Set();
  const add = (src, alt, w = 0) => {
    if (!src) return;
    const nextImg = src.match(/[?&]url=([^&]+)/); // Next.js-Bild (/_next/image?url=…)
    if (nextImg && /_next\/image/.test(src)) src = decodeURIComponent(nextImg[1]);
    if (src.startsWith('//')) src = `https:${src}`;
    let u; try { u = new URL(src, base); } catch { return; }
    if (u.protocol !== 'https:' || !okHost(u.hostname)) return;
    if (/\.(svg|gif)($|\?)/i.test(u.pathname) && /logo|icon|sprite|badge|avatar/i.test(u.pathname)) return;
    alt = String(alt || '').replace(/\s+/g, ' ').trim();
    if ((w && w < 160) || /(logo|icon|avatar|emoji|sprite|flag|badge|banner|werbung|advert|placeholder|tracking|pixel)/i.test(u.pathname + ' ' + alt)) return;
    const href = u.href.replace(/\/(\d{2,3})px-/, (x, n) => (+n < 400 ? '/640px-' : x)); // Wikipedia-Vorschau → größere Fassung
    if (seen.has(href)) return;
    seen.add(href);
    out.push({ src: href, alt: alt.slice(0, 160), license: IMAGE_LICENSE(u.hostname, pageHost) });
  };
  for (const m of main.matchAll(/<img\b[^>]*>/gi)) {
    if (out.length >= max) break;
    const tag = m[0];
    const attr = (n) => decodeEntities((tag.match(new RegExp(`\\s${n}=["']([^"']*)["']`, 'i')) || [])[1] || '');
    const srcset = attr('srcset') || attr('data-srcset');
    const big = srcset ? srcset.split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean).pop() : '';
    const alt = attr('alt') || attr('title');
    if (!alt && !FREE_IMAGE_HOSTS.test(pageHost)) { if (!/serlo|wikipedia/.test(site)) continue; } // ohne Beschreibung lässt sich nicht prüfen, ob es passt
    add(attr('src') || attr('data-src') || big, alt, Number(attr('width')) || 0);
  }
  // Titelbild der Seite (oft genau das Schema zum Thema) – mit dem Seitentitel als Beschreibung
  const og = (html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i) || [])[1];
  const title = (html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';
  if (og && out.length < max) add(decodeEntities(og), `Titelbild: ${decodeEntities(title)}`.slice(0, 160));
  return out;
}

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
/* Tavily (Such-API für KI, Schlüssel in Einstellungen → Verbindung): vom Server aus die EINZIGE verlässliche Websuche – DuckDuckGo, Mojeek,
   Qwant, Ecosia blocken Vercel (403), Bing liefert dort fremde Treffer (gemessen 04.11. über /api/diag/suche). Liefert den Seitentext gleich mit
   (PREFETCHED) – die Seiten müssen dann nicht mehr selbst geladen werden (viele blocken ebenfalls). */
const PREFETCHED = new Map(); // url → { title, text }
const remember = (url, title, text) => { if (!text || text.length < 300) return; PREFETCHED.set(url.replace(/#.*$/, ''), { title, text }); if (PREFETCHED.size > 300) PREFETCHED.delete(PREFETCHED.keys().next().value); };
// news: nur aktuelle Nachrichten (Tavily „news“, letzte 7 Tage) · domains: nur diese Websites (z. B. Börse: seriöse Finanzseiten)
async function tavily(query, { signal, key, max = 8, news = false, domains = null } = {}) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: 'advanced', max_results: max, include_raw_content: 'text', include_answer: false,
      ...(news ? { topic: 'news', days: 7 } : {}), ...(domains?.length ? { include_domains: domains.slice(0, 60) } : {}) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(25000)].filter(Boolean)),
  });
  if (!r.ok) throw new Error(`Tavily HTTP ${r.status}`);
  const j = await r.json();
  return (j.results || []).filter((x) => /^https?:\/\//.test(x.url || '')).map((x) => {
    remember(x.url, x.title, String(x.raw_content || '').slice(0, 40000));
    return { url: x.url, title: clean(x.title || ''), snippet: clean(x.content || '').slice(0, 400) };
  });
}
// Schlüssel aus env (mehrere erlaubt → der erste)
const tavilyKey = (env) => String(env?.TAVILY_API_KEY || '').split(/[\s,;]+/).filter(Boolean)[0] || '';
/* Tavily Extract: Seitentext für bis zu 20 Adressen in EINEM Aufruf – auch Seiten, die Server sonst blocken oder nur mit JavaScript zeigen.
   Ergebnis landet in PREFETCHED (browse/readPage lesen es von dort). Kosten: 1 Credit je 5 Seiten (basic). */
async function tavilyExtract(urls, { signal, key, depth = 'basic' } = {}) {
  const list = [...new Set(urls)].filter((u) => /^https?:\/\//.test(u) && !PREFETCHED.has(u.replace(/#.*$/, ''))).slice(0, 20);
  if (!key || !list.length) return 0;
  const r = await fetch('https://api.tavily.com/extract', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ urls: list, extract_depth: depth, format: 'text' }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)].filter(Boolean)),
  });
  if (!r.ok) throw new Error(`Tavily Extract HTTP ${r.status}`);
  const j = await r.json();
  let n = 0;
  (j.results || []).forEach((x) => { if (x?.url && x.raw_content) { remember(x.url, x.title || '', String(x.raw_content).slice(0, 40000)); n++; } });
  return n;
}
/* Tavily Crawl: eine Website (vom Nutzer genannt) gezielt durchgehen – Unterseiten passend zu „instructions“, mit Text */
async function tavilyCrawl(url, { signal, key, instructions = '', limit = 12 } = {}) {
  if (!key) return [];
  const r = await fetch('https://api.tavily.com/crawl', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ url, max_depth: 2, limit, ...(instructions ? { instructions: String(instructions).slice(0, 300) } : {}), extract_depth: 'basic', format: 'text' }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)].filter(Boolean)),
  });
  if (!r.ok) throw new Error(`Tavily Crawl HTTP ${r.status}`);
  const j = await r.json();
  return (j.results || []).filter((x) => x?.url && x.raw_content).map((x) => { remember(x.url, x.title || '', String(x.raw_content).slice(0, 40000)); return x.url; });
}
async function tavilyImages(query, { signal, key } = {}) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: 'basic', max_results: 5, include_images: true, include_image_descriptions: true }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)].filter(Boolean)),
  });
  if (!r.ok) throw new Error(`Tavily HTTP ${r.status}`);
  const j = await r.json();
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  return (j.images || []).map((im) => (typeof im === 'string' ? { url: im } : im)).filter((im) => /^https:\/\//.test(im.url || ''))
    .map((im) => ({ src: im.url, url: im.url, alt: clean(im.description || '').slice(0, 200), site: host(im.url), page: '' }));
}
// Mojeek: eigener Suchindex, liefert Servern (Vercel) meist normale Treffer statt Captcha – Ersatz, wenn DDG blockt und Bing Fremdes liefert
function parseMojeek(html) {
  const out = [];
  for (const block of String(html).split(/<li[^>]*>/).slice(1)) {
    const a = block.match(/<a[^>]+class="[^"]*\btitle\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/) || block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const href = decodeEntities(a[1]);
    if (!/^https?:\/\//.test(href) || /(^|\.)mojeek\.com\//.test(href.replace(/^https?:\/\//, ''))) continue;
    const p = block.match(/<p[^>]*class="[^"]*\bs\b[^"]*"[^>]*>([\s\S]*?)<\/p>/) || block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    out.push({ url: href, title: clean(a[2]), snippet: clean(p?.[1]) });
  }
  return out;
}
// Google-Suche über Gemini („Grounding“): liefert die Seiten, auf die sich Gemini stützt. Die Adressen sind Weiterleitungen
// (vertexaisearch.cloud.google.com/…) – der Titel ist meist die Domain; die echte Seite steht nach dem Lesen fest.
// Google-Suche über Gemini (Grounding): 2.5 Flash gibt es für neue Schlüssel nicht mehr → der Reihe nach probieren, abgeschaltete merken
const SEARCH_GONE = new Set();
async function geminiSearch(query, { signal, key }) {
  let last = null;
  for (const model of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']) {
    if (SEARCH_GONE.has(`${model}|${String(key).slice(-8)}`)) continue;
    try { return await geminiSearchWith(model, query, { signal, key }); } catch (err) {
      if (signal?.aborted) throw err;
      last = err;
      if (/HTTP (400|403|404)/.test(err.message)) SEARCH_GONE.add(`${model}|${String(key).slice(-8)}`);
      else if (!/HTTP (429|500|503)/.test(err.message)) throw err;
    }
  }
  throw last || new Error('Gemini-Suche nicht verfügbar');
}
async function geminiSearchWith(model, query, { signal, key }) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
  mojeek: async (q, o) => parseMojeek((await fetchPublic(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}`, o)).body),
};
hooks.engines = ENGINES; hooks.geminiSearch = geminiSearch; hooks.tavily = tavily;
// Schul-App: Erwachsenen-/Glücksspielseiten nie als Treffer (Suchmaschinen liefern bei Wortlisten-Anfragen manchmal Unsinn)
const UNSAFE = /(porn|xxx|xvideo|xnxx|xhamster|redtube|youporn|brazzers|onlyfans|chaturbate|stripchat|camsoda|livejasmin|hentai|erotik|\bsex|casino|\bbet(ting)?\b|gambl)/i;
const unsafe = (r) => { let host = ''; try { host = new URL(r.url).hostname; } catch {} return UNSAFE.test(host) || UNSAFE.test(String(r.title || '')); };
// health (je Anfrage): Suchmaschinen, die zweimal nichts lieferten oder blockten (Server-Adressen: Captcha, 403), werden für den Rest der Anfrage
// übersprungen – sonst kostet jede weitere Suche bis zu 8 s Wartezeit pro Maschine und die Recherche läuft in ihr Zeitlimit
async function searchWeb(query, { signal, env, min = 4, health = null, news = false, domains = null } = {}) {
  const out = [], seen = new Set(), errors = [];
  // „genug Treffer“ zählt nur, was zum Suchbegriff passt: Suchmaschinen geben Server-Adressen manchmal fremde Treffer
  // (z. B. Reddit/Mediatheken statt der Frage) – dann geht es mit der nächsten Suchmaschine bzw. Google weiter; passende stehen vorn
  const terms = R.terms(query);
  const fits = (r) => !terms.length || r.host || R.relevance(terms, r.title, r.snippet) >= 0.34;
  let good = 0;
  const add = (list, via) => list.forEach((r) => { const k = r.url.replace(/#.*$/, ''); if (!seen.has(k) && !unsafe(r)) { seen.add(k); const fit = fits(r); out.push({ ...r, via, fit }); if (fit) good++; } });
  const strike = (name) => health?.set(name, (health.get(name) || 0) + 1);
  // zuerst Tavily (falls Schlüssel da) – liefert echte, passende Treffer samt Text
  const tkey = String(env?.TAVILY_API_KEY || '').split(/[\s,;]+/).filter(Boolean)[0];
  if (tkey && (health?.get('tavily') || 0) < 2) {
    try { add(await hooks.tavily(query, { signal, key: tkey, news, domains }), 'tavily'); } catch (err) { if (signal?.aborted) throw err; errors.push(`tavily: ${err.message}`); strike('tavily'); }
  }
  for (const name of good >= min ? [] : ['ddg', 'ddglite', 'bing']) {
    if (good >= min) break;
    if ((health?.get(name) || 0) >= 2) continue;
    try {
      // nur bestimmte Website(s) gewünscht (1–2): die Suchmaschinen kennen kein include_domains → „site:“ an die Anfrage
      const q = domains?.length && domains.length <= 2 ? `${query} site:${domains[0]}` : query;
      const list = await hooks.engines[name](q, { signal, timeoutMs: 8000 });
      if (list.length) health?.set(name, 0); else strike(name);
      add(list, name);
    } catch (err) { if (signal?.aborted) throw err; errors.push(`${name}: ${err.message}`); strike(name); }
  }
  // Google über Gemini: alle Schlüssel nacheinander (einer am Tageslimit → der nächste)
  const keys = String(env?.GEMINI_API_KEY || '').split(/[\s,;]+/).filter(Boolean).slice(0, 4);
  for (const key of good < min ? keys : []) {
    try { add(await hooks.geminiSearch(query, { signal, key }), 'google'); break; } catch (err) { if (signal?.aborted) throw err; errors.push(`google: ${err.message}`); }
  }
  if (!out.length && errors.length) throw new Error(`Keine Suchmaschine erreichbar (${errors.join('; ')})`);
  return [...out.filter((r) => r.via === 'tavily' || fits(r)), ...out.filter((r) => r.via !== 'tavily' && !fits(r))];
}
// Google-Treffer sind Weiterleitungen (vertexaisearch…) – für Links und Vorschau die echte Adresse (Ziel der Weiterleitung, ohne die Seite zu laden)
async function resolveRedirect(raw, { signal } = {}) {
  const res = await fetch(await assertPublicUrl(raw), { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(6000)].filter(Boolean)), headers: { 'User-Agent': UA } });
  res.body?.cancel().catch(() => {});
  const loc = res.headers.get('location');
  return loc ? (await assertPublicUrl(new URL(loc, raw).href)).href : null;
}

/* ---------- Funde heraussuchen („such mir Bilder/Designs/Beispiele raus – mit Link“) ----------
   Echte Funde statt erzeugter Bilder, nur über offizielle Wege: die normale Websuche (Seiten mit Titel und Link; das Vorschaubild holt
   die App später – Seitenbild og:image bzw. Screenshot) und für Fotos Openverse (freie Bilder, offene API ohne Schlüssel).
   Je Website höchstens 2 Funde, nichts doppelt; abwechselnd aus den Suchbegriffen gemischt. */
async function openverseImages(q, o) {
  const j = JSON.parse((await fetchPublic(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20&mature=false`, { ...o, accept: 'application/json' })).body);
  return (j.results || []).filter((r) => /^https?:\/\//.test(r.url || '') && /^https?:\/\//.test(r.foreign_landing_url || ''))
    .map((r) => ({ url: r.foreign_landing_url, image: r.url, thumb: r.thumbnail || r.url, title: clean(r.title || ''), snippet: [r.creator && `Foto: ${r.creator}`, r.license && `Lizenz CC ${String(r.license).toUpperCase()}`].filter(Boolean).join(' · ') }));
}
// Wikimedia Commons: freie Fotos mit Beschreibungsseite (zuverlässig, offizielle API) – zuerst; Openverse nur als Ersatz
async function commonsImages(q, o) {
  const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '16', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '640' });
  const j = JSON.parse((await fetchPublic(`https://commons.wikimedia.org/w/api.php?${params}`, { ...o, accept: 'application/json' })).body);
  return Object.values(j.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map((p) => {
    const ii = p.imageinfo?.[0] || {};
    return /^https:\/\//.test(ii.thumburl || '') && /^https:\/\//.test(ii.descriptionurl || '')
      ? { url: ii.descriptionurl, image: ii.url || ii.thumburl, thumb: ii.thumburl, title: String(p.title || '').replace(/^(File|Datei):/, '').replace(/\.\w{3,4}$/, '').replace(/_/g, ' '), snippet: 'Freies Bild (Wikimedia Commons)' }
      : null;
  }).filter(Boolean);
}
hooks.photos = async (q, o) => {
  try { const r = await commonsImages(q, o); if (r.length) return r; } catch (err) { if (o?.signal?.aborted) throw err; }
  return openverseImages(q, o);
};
async function findVisuals(queries, { signal, env, photos = false, max = 30 } = {}) {
  const qs = [...new Set((Array.isArray(queries) ? queries : [queries]).map((q) => String(q || '').trim()).filter(Boolean))].slice(0, 3);
  // Suchmaschinen liefern Servern manchmal fremde Treffer (Mediatheken, Shops …) – nur, was zum eigenen Suchbegriff passt (Titel/Auszug)
  const fits = (q) => { const terms = R.terms(q); return (r) => !terms.length || r.host || R.relevance(terms, r.title, r.snippet) >= 0.34; }; // Google-Treffer: Gemini hat sie schon passend gewählt
  const lists = await Promise.all([
    ...qs.map((q) => searchWeb(q, { signal, env, min: 8 }).then((l) => l.filter(fits(q))).catch((err) => { if (signal?.aborted) throw err; return []; })),
    ...(photos ? qs.slice(0, 2).map((q) => hooks.photos(q, { signal, timeoutMs: 9000 }).catch((err) => { if (signal?.aborted) throw err; return []; })) : []),
  ]);
  // Fotos zuerst (Liste nach vorn), je Website bis zu 4 Funde – auf Design-Seiten (Dribbble, Behance) ist jeder Treffer ein anderes Design
  if (photos) lists.unshift(...lists.splice(qs.length));
  // Google-Weiterleitungen auflösen (echte Seite für Link und Vorschaubild); was sich nicht auflösen lässt, fällt weg
  await Promise.all(lists.flat().filter((r) => r.host).slice(0, 24).map(async (r) => {
    r.url = await resolveRedirect(r.url, { signal }).catch((err) => { if (signal?.aborted) throw err; return null; }) || r.url;
    if (!/vertexaisearch/.test(r.url)) { r.host = ''; if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(r.title || '')) r.title = ''; }
  }));
  const out = [], seen = new Set(), perSite = new Map();
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const r = l[i];
      if (!r || out.length >= max) continue;
      let host = '';
      try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch { continue; }
      const key = (r.image || r.url).replace(/[?#].*$/, '').replace(/\/+$/, '');
      if (r.host || /vertexaisearch/.test(host) || seen.has(key) || unsafe(r) || (perSite.get(host) || 0) >= (r.image ? 12 : 4)) continue; // Google-Weiterleitungen haben keine echte Seite
      seen.add(key); perSite.set(host, (perSite.get(host) || 0) + 1);
      out.push({ url: r.url, title: r.title || host, snippet: r.snippet || '', image: r.image || '', thumb: r.thumb || '', domain: host });
    }
  }
  return out;
}

/* ---------- Bild zur Erklärung (automatisch, läuft parallel zur Antwort) ----------
   Bei Themen, die man SEHEN muss (Aufbau, Formen, Modelle mit Beschriftung, Abläufe, Karten): echte Bilder aus guten Quellen – Lernplattformen
   (Studyflix, simpleclub, serlo, Lernhelfer, LEIFI …) und Wikimedia Commons, nie erzeugt. Liefert Kandidaten mit Beschreibung, Seite und Lizenz;
   welches wirklich passt, prüft danach die KI am Bild selbst (lib/workflow.js → pickTeachingImage). */
async function commonsDiagrams(q, o) {
  if (!q) return [];
  const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo',
    iiprop: 'url|extmetadata|size', iiurlwidth: '900', iiextmetadatafilter: 'ImageDescription|ObjectName' });
  const j = JSON.parse((await fetchPublic(`https://commons.wikimedia.org/w/api.php?${params}`, { ...o, accept: 'application/json' })).body);
  const plain = (h) => decodeEntities(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return Object.values(j.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map((p) => {
    const ii = p.imageinfo?.[0] || {}, md = ii.extmetadata || {};
    if (!/^https:\/\//.test(ii.thumburl || '') || !/^https:\/\//.test(ii.descriptionurl || '') || /\.(webm|ogv|ogg|pdf|tif|tiff|djvu)$/i.test(p.title || '')) return null;
    const title = String(p.title || '').replace(/^(File|Datei):/, '').replace(/\.\w{3,4}$/, '').replace(/_/g, ' ');
    return { src: ii.thumburl, big: bigOf(ii), url: ii.descriptionurl, site: 'commons.wikimedia.org', page: title, alt: `${plain(md.ObjectName?.value) || title}${md.ImageDescription ? ` – ${plain(md.ImageDescription.value).slice(0, 160)}` : ''}`.slice(0, 220), license: 'Wikimedia Commons · freie Lizenz' };
  }).filter(Boolean);
}
// Scharfe Fassung fürs Anzeigen (die 900-px-Vorschau dient nur der Bildprüfung): SVG/kleine Bilder im Original, große als 1800-px-Vorschau
function bigOf(ii) {
  const url = String(ii.url || ''), w = Number(ii.width) || 0;
  if (/\.svg$/i.test(url) || (w && w <= 1800)) return /^https:\/\//.test(url) ? url : ii.thumburl;
  return String(ii.thumburl || '').replace(/\/\d{3,4}px-/, '/1800px-');
}
// Wikipedia (deutsch): die Bilder des passenden Artikels – oft genau das beschriftete Schema zum Thema (Zelle, Organ, Kreislauf …); offizielle API,
// vom Server aus zuverlässig erreichbar (anders als Suchmaschinen)
const WIKI_SKIP = /(icon|logo|flag|flagge|wappen|commons|wikidata|wiktionary|wikibooks|disambig|question|edit|symbol|portal|stub|lock|padlock|speaker|audio|sound|\.ogg|\.webm|qsicon|ambox|nuvola|crystal_clear|gnome|signature|unterschrift|map_marker|red_pencil|text-x)/i;
async function wikiImages(q, o) {
  const api = (params) => fetchPublic(`https://de.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', ...params })}`, { ...o, accept: 'application/json' }).then((r) => JSON.parse(r.body));
  const found = await api({ action: 'query', list: 'search', srsearch: q, srlimit: '2' });
  const titles = (found.query?.search || []).map((x) => x.title).slice(0, 2);
  if (!titles.length) return [];
  const pages = await api({ action: 'query', titles: titles.join('|'), prop: 'images', imlimit: '40' });
  const files = [...new Set(Object.values(pages.query?.pages || {}).flatMap((p) => (p.images || []).map((im) => im.title)))]
    .filter((t) => /\.(svg|png|jpe?g)$/i.test(t) && !WIKI_SKIP.test(t)).slice(0, 20);
  if (!files.length) return [];
  const info = await api({ action: 'query', titles: files.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '900', iiextmetadatafilter: 'ImageDescription|ObjectName' });
  const plain = (h) => decodeEntities(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return Object.values(info.query?.pages || {}).map((p) => {
    const ii = p.imageinfo?.[0] || {}, md = ii.extmetadata || {};
    if (!/^https:\/\//.test(ii.thumburl || '') || (ii.width && ii.width < 250)) return null;
    const name = String(p.title || '').replace(/^(File|Datei):/, '').replace(/\.\w{3,4}$/, '').replace(/_/g, ' ');
    return { src: ii.thumburl, big: bigOf(ii), url: ii.descriptionurl || `https://de.wikipedia.org/wiki/${encodeURIComponent(titles[0])}`, site: 'de.wikipedia.org', page: titles[0],
      alt: `${plain(md.ObjectName?.value) || name}${md.ImageDescription ? ` – ${plain(md.ImageDescription.value).slice(0, 160)}` : ''}`.slice(0, 220), license: 'Wikimedia Commons · freie Lizenz' };
  }).filter(Boolean);
}
async function teachingImages(query, { signal, env, en = '' } = {}) {
  const q = String(query || '').trim().slice(0, 90);
  if (!q) return [];
  const health = new Map(), o = { signal, timeoutMs: 6000 };
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  // Lernplattformen über die Websuche (Studyflix, simpleclub …) – höchstens ~9 s, danach zählt, was da ist
  const within = (p, ms, fallback) => Promise.race([p.catch(() => fallback), new Promise((ok) => setTimeout(() => ok(fallback), ms))]);
  const pagesFor = (qq) => searchWeb(qq, { signal, env, min: 3, health }).then(async (l) => {
    const hits = l.filter((r) => IMAGE_PAGES.test(r.host || hostOf(r.url)) && !/wikipedia/.test(r.host || hostOf(r.url))).slice(0, 2);
    // Google-Treffer sind Weiterleitungen → echte Adresse holen
    return (await Promise.all(hits.map(async (r) => (r.host ? { ...r, url: await resolveRedirect(r.url, { signal }).catch(() => null) } : r)))).filter((r) => r.url);
  });
  const platform = within(Promise.all([pagesFor(`${q} studyflix`), pagesFor(`${q} simpleclub`), pagesFor(q)]).then(async ([p1, p2, p3]) => {
    const seen = new Set(), pages = [...p1, ...p2, ...p3].filter((r) => { const k = r.url.replace(/[?#].*$/, ''); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
    return (await Promise.all(pages.map(async (r) => {
      try {
        const res = await fetchPublic(r.url, { ...o, maxBytes: 1500000 });
        const { title } = extractPage(res.body);
        return extractImages(res.body, res.url, 8).map((im) => ({ ...im, url: res.url, site: hostOf(res.url), page: R.sanitizeExternal(title || r.title || '', 160).text }));
      } catch { return []; }
    }))).flat();
  }), 9000, []);
  // Bilder aus der Websuche (Tavily, wie eine Google-Bildersuche) – damit es nicht immer nur Wikimedia ist
  const tkey = String(env?.TAVILY_API_KEY || '').split(/[\s,;]+/).filter(Boolean)[0];
  const webPics = tkey ? within(tavilyImages(en || q, { signal, key: tkey }), 9000, []) : Promise.resolve([]);
  const [fromPages, wiki, commons, pics] = await Promise.all([platform, within(wikiImages(q, o), 7000, []), within(commonsDiagrams(en || q, o), 7000, []), webPics]);
  return [...fromPages, ...pics, ...wiki, ...commons].filter((c) => !/^Titelbild: $/.test(c.alt)).slice(0, 24);
}

/* Link-Vorschau (wie beim Teilen eines Links in einer Chat-App): Titel, Seitenbild (og:image/twitter:image), Website-Name */
async function linkPreview(raw, { signal } = {}) {
  const page = await fetchPublic(raw, { signal, timeoutMs: 7000 });
  const html = page.body.slice(0, 400000);
  const meta = (name) => metaContent(html, new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'))
    || metaContent(html, new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, 'i'));
  let image = meta('og:image') || meta('og:image:url') || meta('twitter:image') || meta('twitter:image:src');
  try { image = image ? new URL(image, page.url).href : ''; } catch { image = ''; }
  if (!/^https:\/\//.test(image)) image = '';
  const { title } = extractPage(html);
  return { url: page.url, title, image, site: meta('og:site_name').slice(0, 60) };
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
  const health = new Map();
  for (const q of (plan.queries || []).slice(0, 3)) {
    if (candidates.length >= limits.maxPages) break;
    emit({ action: 'search', query: q });
    try {
      const results = await searchWeb(q, { signal: sig, env: limits.env, health, news: !!limits.news, domains: limits.domains || null });
      emit({ action: 'search', query: q, results: results.length });
      const ranked = limits.rank
        ? results.map((r) => ({ r, s: limits.rank(r) })).filter((x) => x.s != null).sort((a, b) => b.s - a.s).map((x) => x.r)
        : results;
      // nur passende Treffer lesen, sobald es welche gibt (Bing liefert sonst Fremdes zum gleichen Wort, z. B. linear.app → linear.eu)
      const fitting = ranked.filter((r) => r.fit !== false || r.via === 'tavily');
      (fitting.length ? fitting : ranked.slice(0, 3)).slice(0, 8).forEach((r) => add(r.url, 'search', r.host));
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
      const pre = PREFETCHED.get(c.url);
      const res = pre ? { url: c.url, type: 'text/plain', body: pre.text } : await fetchPublic(c.url, { signal: sig });
      if (!/html|text\/plain/.test(res.type)) throw new Error('Kein lesbarer Text');
      const page = /html/.test(res.type) ? extractPage(res.body) : { title: pre?.title || '', description: '', text: res.body };
      if (limits.crawl && c.origin === 'link' && /html/.test(res.type)) subLinks.push(...sameSiteLinks(res.body, res.url));
      const clean = R.sanitizeExternal(page.text, limits.chars || 9000);
      if (clean.text.length < 150 && !page.description) throw new Error('Kaum lesbarer Inhalt (evtl. nur mit JavaScript)');
      const passage = R.bestPassage(clean.text, plan.topic || topicTerms.join(' '), 300);
      const seen = R.sanitizeExternal(page.description || passage, 300).text;
      const p = {
        url: res.url, domain: R.domainOf(res.url), title: R.sanitizeExternal(page.title || c.domain, 200).text, images: /html/.test(res.type) ? extractImages(res.body, res.url) : [],
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
  // mit Tavily-Schlüssel: alle Seiten in einem Aufruf über Tavily lesen (Server werden oft geblockt) – eigenes Laden nur noch als Ersatz
  const tkey = tavilyKey(limits.env);
  if (tkey && first.length && !sig.aborted) await tavilyExtract(first.map((c) => c.url), { signal: sig, key: tkey }).catch((err) => failures.push({ provider: 'tavily', query: 'extract', error: err.message }));
  // „Lies alles von dieser Website“: mit Tavily Crawl gezielt die passenden Unterseiten
  if (tkey && limits.crawl && !sig.aborted) {
    for (const c of first.filter((x) => x.origin === 'link').slice(0, 2)) {
      const got = await tavilyCrawl(c.url, { signal: sig, key: tkey, instructions: plan.topic || '', limit: Math.min(15, limits.crawl + 3) }).catch((err) => { failures.push({ provider: 'tavily', query: 'crawl', error: err.message }); return []; });
      got.filter((u) => !seenUrl.has(u)).slice(0, limits.crawl).forEach((u) => { seenUrl.add(u); subLinks.push(u); });
    }
  }
  await Promise.all(first.map(visit));
  // „Lies alles von dieser Website“: danach noch Unterseiten derselben Website
  if (limits.crawl && subLinks.length && !sig.aborted) {
    const fresh = [...new Set(subLinks)].filter((u) => !seenUrl.has(u) || PREFETCHED.has(u)).filter((u) => !pages.some((p) => p.url === u)).slice(0, limits.crawl);
    fresh.forEach((u) => seenUrl.add(u));
    await Promise.all(fresh.map((u, i) => visit({ url: u, domain: R.domainOf(u), origin: 'crawl' }, first.length + i)));
  }
  if (signal?.aborted) throw signal.reason || new Error('aborted');
  return { pages: pages.filter((p) => !p.suspicious).sort((a, b) => a.order - b.order), failures, visited: candidates.length };
}

/* Eine Seite lesen (für die Tiefen-Recherche): Text, Titel, beste Stelle zum Thema – wirft bei Fehler oder verdächtigem Inhalt */
async function readPage(url, { signal, topic = '', max = 6000, env = null } = {}) {
  let pre = PREFETCHED.get(String(url).replace(/#.*$/, ''));
  let res = pre ? { url, type: 'text/plain', body: pre.text } : await fetchPublic(url, { signal, timeoutMs: 10000 }).catch(async (err) => {
    // geblockt (403/Captcha/Zeit): mit Tavily-Schlüssel über Tavily Extract lesen
    const key = tavilyKey(env); if (!key) throw err;
    await tavilyExtract([url], { signal, key });
    pre = PREFETCHED.get(String(url).replace(/#.*$/, '')); if (!pre) throw err;
    return { url, type: 'text/plain', body: pre.text };
  });
  if (!/html|text\/plain/.test(res.type)) throw new Error('Kein lesbarer Text');
  const page = /html/.test(res.type) ? extractPage(res.body) : { title: pre?.title || '', description: '', text: res.body };
  const clean = R.sanitizeExternal(page.text, max);
  if (clean.text.length < 200 && !page.description) throw new Error('Kaum lesbarer Inhalt');
  if (clean.suspicious || R.INJECTION.test(page.description || '')) throw new Error('Seite enthält Anweisungen an KI-Systeme – ignoriert');
  return {
    url: res.url, domain: R.domainOf(res.url), title: R.sanitizeExternal(page.title || R.domainOf(res.url), 200).text,
    description: R.sanitizeExternal(page.description, 400).text, text: clean.text, passage: R.bestPassage(clean.text, topic, 300),
  };
}

module.exports = { tavily, tavilyExtract, tavilyCrawl, tavilyKey, PREFETCHED, parseMojeek, extractImages, teachingImages, commonsDiagrams, wikiImages, parseDdg, parseDdgLite, parseBing, findVisuals, linkPreview, bingTarget, geminiSearch, readPage, hooks, browse, searchWeb, fetchPublic, extractPage, urlsInText, assertPublicUrl, isPrivateIp, decodeEntities };
