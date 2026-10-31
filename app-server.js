// Lokaler Server ohne Abhängigkeiten: node server.js → http://localhost:3000
// - liefert die App aus (index.html, style.css, app.js)
// - vermittelt zwischen App und KI-Anbietern, damit die API-Keys aus .env
//   niemals im Browser landen
const http = require('http');
const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
// Vorschau des Coding-Agenten auf eigenem Port = eigene Herkunft: getrennt von den Daten der App, aber ohne Sandbox-Einschränkungen
// (localStorage, Module und echte Fehlermeldungen funktionieren – mit Sandbox hieß jeder Fehler nur „Script error.“)
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT) || Number(PORT) + 1;
const APP_ORIGIN = new RegExp(`^https?://(127\\.0\\.0\\.1|localhost|\\[::1\\]):${PORT}$`, 'i');
const HOST = '127.0.0.1'; // nur auf diesem PC erreichbar, nicht im WLAN
const ROOT = __dirname;
// Auf Vercel: Programmdateien nur lesbar → Chats, Dokumente, Zwischenspeicher nach /tmp (geht bei Neustarts verloren, bis sie aufs Gerät wandern)
const ON_VERCEL = !!process.env.VERCEL;
const DATA_ROOT = ON_VERCEL ? path.join(require('os').tmpdir(), 'lern-app') : ROOT;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
// Nur diese Dateien werden ausgeliefert – .env, server.js usw. bleiben privat
const PUBLIC_FILES = new Set(['auth.js', 'settings.js', 'index.html', 'style.css', 'app.js', 'pixel-dogs.js', 'music.js', 'timer.js', 'chat-visuals.js', 'calendar.js', 'tasks.js', 'docs.js', 'docblocks.js', 'ui-kit.js', 'icons.js', 'code-agent.js', 'stock-chart.js', 'chancen-card.js', 'praesentation.js', 'boerse-bestand.js', 'search.js', 'thinking.js', 'workspace-invite.js', 'favicon.png', 'icon-180.png', 'icon-512.png', 'manifest.webmanifest']);

const P = require('./lib/providers');
const W = require('./lib/workflow');
const WEB = require('./lib/web');
const TTS = require('./lib/tts');
const STORE = require('./lib/store');
const ACC = require('./lib/accounts');
const BOERSE = require('./lib/boerse'); // Börsen-Agent: Aktienchart und Echtzeitkurs für den ```stock-Block
const RADAR = require('./lib/radar');
const HOLD = require('./lib/holdings'); // „Meine Käufe“ des Börsen-Bären (im Chat genannt, je Konto) // Chancen-Radar (Algorithmus): zur Börseneröffnung per Cron und zwischendurch aus der App
const WSP = require('./lib/workspaces'); // geteilte Workspaces: teilen, Einladungen annehmen/ablehnen
const AGT = require('./lib/agenttasks'); // Aufgaben, die ein Agent im Hintergrund abarbeitet (Tab „Aufgaben“)
const { GEMINI_MODEL, nvidiaKeyOf } = P;

/* ---------- .env lesen (bei jeder Anfrage neu – Keys wirken ohne Neustart) ----------
   Schlüssel aus den Einstellungen der App (Kopf „X-App-Keys“, bleiben auf dem Gerät) gehen vor – gilt für die ganze Anfrage. */
const DEVICE_KEYS = ['GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY', 'FLUX3_API_KEY', 'SPOTIFY_CLIENT_ID'];
const requestKeys = new AsyncLocalStorage();
function deviceKeysOf(req) {
  const raw = req.headers['x-app-keys'];
  if (!raw || raw.length > 4000) return {};
  try {
    const obj = JSON.parse(Buffer.from(String(raw), 'base64').toString('utf8'));
    const out = {};
    for (const k of DEVICE_KEYS) if (typeof obj[k] === 'string' && /^[!-~]{8,400}$/.test(obj[k].trim())) out[k] = obj[k].trim();
    return out;
  } catch { return {}; }
}
function readEnv() { return { ...readFileEnv(), ...(requestKeys.getStore() || {}) }; }
function readFileEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
  return env;
}

/* ---------- Hilfsfunktionen ---------- */
function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Anfrage zu groß')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('Ungültige Anfrage')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/* Server-Sent Events: Ereignisse live an den Browser schicken */
function startSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* ---------- Automatisierungen ohne offene App: Schlüssel aus dem Konto (Einstellungen → Agenten), sonst die des Servers ---------- */
async function accountKeys(store, uid) {
  try {
    const ls = await ACC.getStorage(store, uid);
    const obj = JSON.parse(ls?.['settings.keys.v1'] || '{}');
    return Object.fromEntries(DEVICE_KEYS.filter((k) => typeof obj[k] === 'string' && /^[!-~]{8,400}$/.test(obj[k].trim())).map((k) => [k, obj[k].trim()]));
  } catch { return {}; }
}
async function runAutomations(store) {
  return AGT.runDue(store, { max: 5, start: async (uid, task) => AGT.run({ store, uid, task, env: { ...serverEnv(), ...(await accountKeys(store, uid)) }, prepareBody: (x) => withAgentData(x, { id: uid }) }) });
}

/* ---------- /api/chat: Ablauf steckt in lib/workflow.js ---------- */
// Was ein Agent zusätzlich braucht (nicht vom Browser setzbar): Börse → gespeicherter Chancen-Radar und „Meine Käufe“ des Kontos
function withAgentData(body, user) {
  delete body.radarStore; delete body.holdingsCtl;
  if (body.agent === 'boerse') {
    const store = accountStore();
    Object.defineProperty(body, 'radarStore', { value: store, enumerable: false });
    if (user?.id && store) Object.defineProperty(body, 'holdingsCtl', { value: { list: () => HOLD.list(store, user.id), book: () => HOLD.book(store, user.id), apply: (c) => HOLD.apply(store, user.id, c) }, enumerable: false });
  }
  return body;
}
async function handleChat(req, res, user = null) {
  const body = withAgentData(await readBody(req), user);
  const sse = startSse(res);
  const controller = new AbortController();
  res.on('close', () => controller.abort()); // Stopp-Button → alle laufenden Anfragen abbrechen
  const send = (event, data) => { if (!res.writableEnded && !res.destroyed) sse(event, data); };
  try {
    await W.runChat({ env: readEnv(), body, send, signal: controller.signal });
  } finally {
    res.end();
  }
}

/* Lernbild: Suche nach passenden freien Fachbildern auf Wikimedia Commons (Vorlage für KI-Bilder und letzter Ersatz) */
async function commonsIllustration(query, count = 1) { // count > 1: Liste der besten Treffer
  const words = String(query || '').trim().slice(0, 100);
  if (!words) return count > 1 ? [] : null;
  const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: words, gsrnamespace: '6', gsrlimit: String(Math.min(30, Math.max(8, count * 2))), prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '900', format: 'json' });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': 'BackboneLearningApp/1.0 (local educational app)' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) return null;
  const pages = Object.values((await response.json()).query?.pages || {});
  const tokens = words.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3);
  const candidates = pages.map((page) => {
    const info = page.imageinfo?.[0];
    const rawUrl = info?.thumburl || info?.url;
    let url;
    try { url = new URL(rawUrl); } catch { return null; }
    if (url.protocol !== 'https:' || !/^(upload|thumb)\.wikimedia\.org$/.test(url.hostname)) return null; // Vorschaubilder kommen heute von thumb.wikimedia.org
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(info?.mime || '')) return null;
    const ratio = Number(info.width) / Number(info.height);
    if (!Number.isFinite(ratio) || ratio < 1.15 || ratio > 3.2 || info.width < 600) return null;
    const meta = info.extmetadata || {};
    const license = String(meta.LicenseShortName?.value || '').trim();
    if (!license) return null;
    const title = String(page.title || '').replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    const plain = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
    const score = tokens.filter((word) => title.toLowerCase().includes(word)).length
      + (/diagram|schem|cycle|kreislauf/i.test(title) ? 2 : 0)
      + (/german|deutsch/i.test(title) ? 1 : 0)
      - (/worksheet|poster|adapted version/i.test(title) ? 3 : 0);
    return { source: 'commons', url: url.href, page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`, title, author: plain(meta.Artist?.value), license: plain(license), licenseUrl: String(meta.LicenseUrl?.value || ''), score };
  }).filter((candidate) => candidate && candidate.score > 0).sort((a, b) => b.score - a.score);
  return count > 1 ? candidates.slice(0, count) : candidates[0] || null;
}
// Fertige Bilder werden in chats/bilder/ gemerkt – gespeicherte Chats zeigen sie beim Öffnen sofort (ohne neu zu erzeugen)
const IMG_CACHE = path.join(DATA_ROOT, 'chats', 'bilder');
const imgKey = (description, query) => require('crypto').createHash('sha1').update(`${description}|${query || ''}`).digest('hex');
function readImgCache(key) { try { return JSON.parse(fs.readFileSync(path.join(IMG_CACHE, `${key}.json`), 'utf8')); } catch { return null; } }
function writeImgCache(key, data) { try { fs.mkdirSync(IMG_CACHE, { recursive: true }); fs.writeFileSync(path.join(IMG_CACHE, `${key}.json`), JSON.stringify(data)); } catch {} }

// Helfer für die Beschriftung der KI-Bilder (Kästchen im Stil von Erklär-Grafiken)
const escXml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Beschriftung clean wie im Schulbuch: grüner Titel als abgerundetes Feld, Begriffe als dunkelgraue Schrift (weißer Rand → auf jedem Grund
// lesbar), feine graue Linien mit kleinem Punkt auf dem Teil. Keine farbigen Kästchen mehr.
const BOX_COLORS = ['#1e3a8a', '#3f6212', '#0f766e', '#7f1d1d', '#a16207', '#6b21a8', '#0369a1', '#be185d', '#475569', '#c2410c', '#155e75', '#4d7c0f'];
const titleSvg = (W, title, font) => {
  if (!title) return '';
  const t = String(title).slice(0, 48), w = Math.round(t.length * 24 * 0.56 + 56);
  return `<rect x="${(W - w) / 2}" y="16" width="${w}" height="46" rx="23" fill="#5daf4a"/><text x="${W / 2}" y="47" text-anchor="middle" font-family="${font}" font-size="24" font-weight="700" fill="#ffffff">${escXml(t)}</text>`;
};
const leaderSvg = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8a94a3" stroke-width="1.3" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="3.2" fill="#4b5563" stroke="#ffffff" stroke-width="1.2"/>`;
// anchor: 'end' (linke Spalte, Text endet an der Linie), 'start' (rechte Spalte) oder 'middle' (Reihen oben/unten)
const labelSvg = (x, y, w, h, text, font, size, color, anchor = 'middle') => {
  const tx = anchor === 'end' ? x + w : anchor === 'start' ? x : x + w / 2;
  return `<text x="${tx}" y="${y + h / 2 + size * 0.36}" text-anchor="${anchor}" font-family="${font}" font-size="${size}" font-weight="500" fill="#374151" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${escXml(text)}</text>`;
};

/* ---------- Echte KI-Bilder über NVIDIA Build: FLUX.3 klein (Key in FLUX3_API_KEY bzw. NVIDIA_API_KEY), FLUX.1 schnell als Ersatz ----------
   Stand 2026-10-27: FLUX.3 klein antwortet in 5–8 s und trifft den Schulbuch-Stil sauber; FLUX.1 schnell lieferte bei NVIDIA nur HTTP 504.
   Eigene Bilder als Vorlage nimmt NVIDIA bei FLUX.3 klein nicht an („image“ erlaubt nur Beispielbilder 0–4) → angepasst wird über
   denselben Startwert + leicht geänderten Auftrag; reine Beschriftungs-Änderungen nehmen das gespeicherte Rohbild.
   Ablauf für Lerngrafiken (Aufbau, Schema, Querschnitt …):
   1. Recherche: Fachwissen (Wikipedia + deutsche Lernseiten) und bis zu 4 Schema-Bilder von Wikimedia Commons als Vorlagen
   2. Gemini vergleicht die Vorlagen (was alle gemeinsam haben = typischer Aufbau) und plant: englischer Bild-Auftrag (ohne Text, Objekt mittig,
      Ränder frei, jedes Teil nummeriert mit Form/Farbe/Lage) + Titel + deutsche Fachbegriffe
   3. FLUX malt das Bild – Stil: klare Schulbuch-Vektorgrafik auf Weiß (realistisch nur auf Wunsch)
   4. Gemini findet die Teile im fertigen Bild, eine Gegenprobe bestätigt jede Stelle
   5. der Server setzt Titel und Beschriftung (dunkle Schrift, feine Linien) darüber → ein SVG
   Rohbild, Auftrag, Startwert und Teile werden gespeichert (`.meta`) → Folgewünsche („Beschriftung fehlt“, „mach … rot“) passen DIESES Bild an. */
const IMAGE_MODELS = [
  { name: 'flux3-klein', url: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein', params: { width: 1344, height: 768 } },
  { name: 'flux1-schnell', url: 'https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/105fe02c-924b-4dfa-9797-92d89c3936ad', params: { width: 1344, height: 768, steps: 4 } },
];
// Keys: FLUX3_API_KEY zuerst, danach die übrigen NVIDIA-Keys – lehnt NVIDIA einen Key ab (401/403), wird automatisch der nächste probiert
const imageKeys = (env) => [...new Set([env.FLUX3_API_KEY, env.FLUX_API_KEY, env.QWEN_API_KEY, env.NVIDIA_API_KEY].map((k) => String(k || '').trim()).filter(Boolean))];
const badImageKeys = new Set(); // abgelehnte Keys bis zum Neustart überspringen
let lastImageFiltered = false; // letzter Versuch scheiterte nur am Inhaltsfilter
const imageModelDownUntil = new Map(); // Bildmodell → übersprungen bis (nach HTTP 5xx/Zeitüberschreitung; spart das Warten auf den Fehler)
// prefer: Name des Bildmodells, das zuerst probiert wird; das Ergebnis enthält den benutzten Startwert (für spätere Anpassungen)
// Wörter, an denen der Inhaltsfilter von FLUX.3 grundlos hängen bleibt (gefunden über chats/bilder/_gefiltert.log) → gleichbedeutend ersetzen
const FILTER_SWAPS = [[/\bviolett?\b/gi, 'purple']];
async function nvcfImage(env, prompt, seed, prefer) {
  lastImageFiltered = false;
  prompt = FILTER_SWAPS.reduce((t, [re, to]) => t.replace(re, to), String(prompt));
  const models = prefer ? [...IMAGE_MODELS].sort((a, b) => (b.name === prefer) - (a.name === prefer)) : IMAGE_MODELS;
  const ready = models.filter((m) => !(imageModelDownUntil.get(m.name) > Date.now()));
  for (const { name, url, params } of ready.length ? ready : models) {
    let modelFailed = false; // Fehler des Modells (nicht des Keys) → nächstes Modell
    for (const key of imageKeys(env).filter((k) => !badImageKeys.has(k))) {
      const H = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json', 'NVCF-POLL-SECONDS': '60' };
      let rejected = false;
      // der Inhaltsfilter schlägt manchmal grundlos an (hängt am Startwert) → bis zu 3 Startwerte
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const used = (seed + attempt * 7919) % 1e6;
          let r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify({ prompt, ...params, seed: used }), signal: AbortSignal.timeout(90000) });
          for (let i = 0; r.status === 202 && i < 4; i++) r = await fetch(`https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/${r.headers.get('nvcf-reqid')}`, { headers: H, signal: AbortSignal.timeout(90000) });
          if (r.status === 401 || r.status === 403) { badImageKeys.add(key); rejected = true; console.warn(`[Bild] ${name}: Key abgelehnt (HTTP ${r.status}) – nehme den nächsten`); break; }
          if (!r.ok) { console.warn(`[Bild] ${name}: HTTP ${r.status}`); modelFailed = true; break; }
          const j = await r.json();
          const b64 = j?.artifacts?.[0]?.base64;
          if (j?.artifacts?.[0]?.finishReason === 'CONTENT_FILTERED') { lastImageFiltered = true; console.warn(`[Bild] ${name}: Filter angeschlagen – neuer Versuch`); continue; }
          if (!b64) { console.warn(`[Bild] ${name}: kein Bild`); modelFailed = true; break; }
          const head = Buffer.from(b64.slice(0, 16), 'base64');
          return { mime: head[0] === 0x89 ? 'image/png' : 'image/jpeg', data: b64, seed: used, model: name };
        } catch (e) { console.warn(`[Bild] ${name}: ${e.message}`); modelFailed = true; break; }
      }
      if (!rejected) break; // nur bei abgelehntem Key den nächsten Key probieren
    }
    if (!modelFailed) break; // nur gefiltert/kein Key → kein anderes Modell (der Auftrag wird umformuliert)
    imageModelDownUntil.set(name, Date.now() + 10 * 60 * 1000);
    console.warn(`[Bild] ${name} nicht verfügbar – nächstes Bildmodell (10 min übersprungen)`);
  }
  return null;
}
// Gemini (Text + optional Bilder) → JSON; Ersatz: NVIDIA (mit Bild: Vision-Modell)
let visionMainSkipUntil = 0; // Hauptmodell nach HTTP 429 (Kontingent erschöpft) eine Weile überspringen
let visionNextSkipUntil = 0;  // dasselbe für den ersten Ersatz (Gemini 3.5 Flash)
async function visionJson(env, system, text, images = [], budget = 1024) { // budget: Denkzeit (Tokens) für Gemini
  if (env.GEMINI_API_KEY) {
    // Hauptmodell, dann Ersatz; ist das Ersatzmodell gerade ausgelastet (429, mehrere Bilder gleichzeitig), ein zweiter Versuch nach kurzer Pause
    for (const [model, wait] of [[P.GEMINI_MODEL, 0], [P.GEMINI_NEXT, 0], [P.GEMINI_BACKUP, 0], [P.GEMINI_BACKUP, 4000]]) {
      if (model === P.GEMINI_MODEL && Date.now() < visionMainSkipUntil) continue;
      if (model === P.GEMINI_NEXT && Date.now() < visionNextSkipUntil) continue;
      const t0 = Date.now();
      try {
        if (wait) await new Promise((ok) => setTimeout(ok, wait));
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } })), { text }] }],
            generationConfig: { maxOutputTokens: budget + 4000, responseMimeType: 'application/json', thinkingConfig: P.thinkingConfigFor(model, { budget, level: budget > 2000 ? 'medium' : 'low' }) } }),
          signal: AbortSignal.timeout(90000),
        });
        if (r.ok) {
          const out = P.parseJsonLoose(((await r.json()).candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join(''));
          if (out) { if (process.env.BILD_ZEITEN) console.log(`[Bild]   ${model}: ${Math.round((Date.now() - t0) / 1000)} s (${images.length} Bild${images.length === 1 ? '' : 'er'})`); return out; }
        }
        console.warn(`[Bild] ${model}: ${r.ok ? 'keine lesbare Antwort' : `HTTP ${r.status}`}`);
        if (r.status === 429) P.noteLimit(await r.json().catch(() => null));
        if (r.status === 429 && model === P.GEMINI_MODEL) visionMainSkipUntil = Date.now() + 5 * 60 * 1000;
        if (r.status === 429 && model === P.GEMINI_NEXT) visionNextSkipUntil = Date.now() + 5 * 60 * 1000;
        if (r.status !== 429 && model === P.GEMINI_BACKUP) break;
      } catch (e) { console.warn(`[Bild] ${model}: ${e.message}`); }
    }
    console.warn('[Bild] Gemini nicht erreichbar – NVIDIA übernimmt');
  }
  const nvKey = P.nvidiaKeyOf(env);
  if (!nvKey) return null;
  try { return P.parseJsonLoose(await P.nvidiaChat({ key: nvKey, model: images.length ? P.NVIDIA_VISION_MODEL : P.NVIDIA_TEXT_MODEL, system, messages: [{ role: 'user', text, images }], maxTokens: 4000, signal: AbortSignal.timeout(60000) })); } catch { return null; }
}
// Bildstil: Standard ist die klare Schulbuch-Grafik (wie gute Biologie-Bücher); realistisch nur, wenn der Nutzer es verlangt
const STYLE_CLEAN = 'Clean modern flat vector textbook illustration like in a high-quality school science book, soft pastel colors, smooth flat shading with subtle gentle gradients, thin clean darker outlines, simple clear shapes, a 3D cutaway view where it helps to show the inside, high detail where it matters, pure white background, the subject centered and occupying only the middle 55 percent of the image width, empty white space on the left, on the right and at the top, every structure large, clearly separated from its neighbours and easy to recognise, no text, no labels, no letters, no numbers';
const STYLE_REAL = 'Highly detailed photorealistic scientific visualization, realistic materials, textures and soft studio lighting, sharp focus, plain light grey seamless background, the subject centered and occupying only the middle 55 percent of the image width, empty background on the left, on the right and at the top, every structure clearly visible, no text, no labels, no letters, no numbers';
const REALISTIC = /(realistisch|fotorealist|hyperreal|naturgetreu|\bfoto\b|fotografie|\bphoto)/i;
const planSystem = (realistic) => `Du planst ein Lernbild für Schüler – im Stil einer sehr guten Schulbuch-Abbildung, auf der man jede Struktur deutlich erkennt. Antworte NUR mit JSON:
{"prompt":"englischer Bild-Auftrag","title":"kurzer deutscher Titel","parts":[{"label":"deutscher Fachbegriff","look":"wie das Teil im Bild aussieht"}]}
- ZUERST überlegen: Was gehört bei diesem Thema fachlich dazu und was ist wirklich wichtig (bei Aufbau-Themen: welche Bestandteile zeigt eine Schulbuch-Abbildung)? Nutze dafür das FACHWISSEN. Erst danach den Bild-Auftrag schreiben.
- Nur Bestandteile, die beim Thema fachlich wirklich vorkommen – nichts aus verwandten Themen (z. B. Tierzelle: keine Zellwand, keine Chloroplasten, keine große Zentralvakuole). Verlangte Teile, die es dort nicht gibt, weglassen.
- "prompt" (Englisch, 90–180 Wörter) für das Bildmodell FLUX: beginnt GENAU mit "${realistic ? STYLE_REAL : STYLE_CLEAN}" + eine genaue, fachlich richtige Beschreibung des Objekts: welche Teile, Form, Lage, Farbe jedes Teils (gut unterscheidbar, keine zwei Teile in derselben Farbe und Form).
  FLUX lässt Teile weg, die nur nebenbei erwähnt werden – deshalb die Teile als nummerierte Liste: "... with ALL of these parts clearly visible and well separated: 1) a large lavender nucleus in the center with ...; 2) ... on the left of the nucleus ...; 3) ..." – je Teil Form, Farbe und Lage im Bild (z. B. "on the right", "below the nucleus").
  Keine Namen echter Personen, Marken oder Werke, keine Raster, Kacheln oder Collagen (blockt der Inhaltsfilter). Wichtiges zuerst, keine widersprüchlichen Angaben.
- VOLLSTÄNDIG: alle Teile, die eine gute Schulbuch-Abbildung zu diesem Thema zeigt (bei Aufbau-Themen meist 8–12; z. B. Tierzelle: Zellmembran, Zellplasma, Zellkern, Kernhülle, Kernkörperchen, raues ER mit Ribosomen, glattes ER, Golgi-Apparat, Mitochondrien, Lysosomen, Zentriolen). Wünscht die Beschreibung bestimmte Teile, gehören diese dazu (sofern fachlich richtig). Jedes Teil im prompt groß genug und gut sichtbar beschreiben.
- PFLICHT: Jedes Teil, das die Beschreibung nennt (z. B. nach „beschriftet:“), steht in "parts" (gleicher Begriff) und im prompt. Auch Füllungen und Hüllen
  gehören dazu, wenn sie fachlich wichtig sind (z. B. Zellplasma, Zellmembran, Kernhülle) – im prompt mit eigener, gut sichtbarer Farbe und Fläche.
- "parts": 6–12 sichtbare Teile – "label": deutscher Fachbegriff, richtig geschrieben und kurz; "look": kurz Form, Farbe und Lage genau so, wie der prompt das Teil beschreibt (danach wird die Beschriftung im fertigen Bild gesucht). Nur Teile, die der prompt auch beschreibt.
- VORLAGEN (mehrere Schema-Bilder angehängt): Vergleiche sie miteinander. Was in allen vorkommt – Form, Lage, Größenverhältnis und typische Merkmale
  jedes Teils –, ist der charakteristische Aufbau und gehört genau so in den prompt (z. B. raues ER = mehrere gestapelte, gefaltete Membransäcke direkt
  am Zellkern, dicht mit kleinen Ribosomen-Punkten besetzt; glattes ER = verzweigtes Netz aus Röhren OHNE Punkte; Golgi-Apparat = Stapel gebogener
  Scheiben mit Bläschen). Einzelne Abweichungen einer Vorlage ignorieren. Das Fachwissen entscheidet, welche Teile dazugehören und wie sie heißen;
  die Vorlagen, wie sie aussehen. Schrift aus den Vorlagen nie übernehmen.
- Farben und Formen klar unterscheidbar wie in einer guten Lehrbuch-Abbildung. Beispiel Tierzelle: hell mintgrünes Zellplasma in einer grünen Zellmembran, großer lavendelfarbener Zellkern mit dunkelviolettem Kernkörperchen, orange bohnenförmige Mitochondrien mit sichtbaren Cristae, raues ER als gestapelte blaue Membranbögen mit dunklen Punkten am Kern, glattes ER als blaues Röhrennetz, rosa Golgi-Apparat aus gebogenen Scheiben, kleine violette Lysosomen, gelbe Zentriolen als Röhrchenbündel.
- Gesamtform fachlich passend und natürlich unregelmäßig (z. B. Tierzelle rundlich-oval mit weichen Ausbuchtungen – nie eckig wie eine Pflanzenzelle;
  Pflanzenzelle eckig mit Zellwand), nie ein perfekter Kreis. Das Objekt bleibt in der mittleren Bildhälfte.`;
/* Einfaches Bild (Tier, Gegenstand, Szene …): kein Fachplan, keine Vorlagen, keine Beschriftung – nur ein guter Bild-Auftrag */
const SIMPLE_PLAN_SYSTEM = `Du schreibst einen Bild-Auftrag für das Bildmodell FLUX. Antworte NUR mit JSON: {"prompt":"englischer Bild-Auftrag"}
- "prompt" (Englisch, 40–90 Wörter): Motiv, Bildaufbau, Perspektive, Licht, Farben und Stil – Wichtiges zuerst, keine widersprüchlichen Angaben.
- Stil wie gewünscht; ohne Angabe eine moderne, klare Illustration (nicht fotorealistisch). Bei Lern- und Fachthemen (Organ, Zelle, Gerät, Pflanze, Tier im Aufbau …):
  saubere Schulbuch-Vektorgrafik mit sanften Pastellfarben, feinen Konturen und weißem Hintergrund, jede Struktur deutlich erkennbar. Verlangt die Beschreibung ein realistisches Bild oder Foto: fotorealistisch.
- Keine Schrift, keine Buchstaben oder Zahlen im Bild (FLUX schreibt Text unzuverlässig). Keine Namen echter Personen, Marken oder Werke, keine Raster, Kacheln oder Collagen (blockt der Inhaltsfilter).`;
// Lerngrafik (Aufbau, Schema, Querschnitt …) – dafür lohnen Fachrecherche und Vorlagebilder (fachlich richtiger Aufbau).
// Beschriftet (Titel + Begriffe) wird nur, wenn danach gefragt wurde (WANTS_LABELS) – sonst nur das klare Bild.
const LABELED_IMAGE = /(beschrift|aufbau|bestandteil|schema|schaubild|infografik|lerngrafik|querschnitt|längsschnitt|anatomie|organell|kreislauf|zyklus|zelle|\borgan(e|s)?\b|\bteile\b)/i;
const WANTS_LABELS = /(beschrift|benenn|mit (den )?namen|label)/i;
const SAFE_SYSTEM = `Ein Bild-Auftrag wurde vom Inhaltsfilter eines Bildmodells abgelehnt. Formuliere ihn so um, dass er sicher durchgeht und trotzdem dasselbe Thema zeigt.
Antworte NUR mit JSON: {"prompt":"englischer Bild-Auftrag"}. Regeln: klares Lehrbuch-Schema statt realistischer Darstellung, keine realistischen Menschen
oder Körper (stattdessen stilisierte, geschlechtsneutrale Umrisse oder nur das Organ/Objekt), keine Namen echter Personen, Marken oder Werke, keine Gewalt, kein Blut, keine Waffen, keine Nacktheit;
KEINE Raster, Kacheln, Reihen gleicher Felder oder Collagen – stattdessen ein zentrales Motiv mit wenigen locker angeordneten Elementen. Stil und übrige Vorgaben (z. B. Hintergrund, Anordnung, ohne Text) unverändert übernehmen.`;
const POINT_SYSTEM = `Du findest Teile in einem Lernbild (Objekterkennung). Antworte NUR mit JSON:
{"box":[ymin,xmin,ymax,xmax],"points":[{"label":"Begriff","box_2d":[ymin,xmin,ymax,xmax],"point":[y,x]}]}
Alle Werte normiert 0–1000 auf das ganze Bild (0,0 = oben links); erst y, dann x.
- "box": Rechteck um das ganze dargestellte Objekt (ohne leeren Hintergrund).
- je Begriff "box_2d": eng um genau dieses Teil (gibt es mehrere gleiche, z. B. Mitochondrien: um das deutlichste, gut freistehende eine).
- je Begriff "point": GENAU auf einer gut sichtbaren Fläche dieses Teils, innerhalb seiner box_2d – nie auf dem Hintergrund, nie auf einem Nachbarteil,
  nie auf einem kleineren Teil, das darin liegt (Zellkern: auf die Kernfläche NEBEN dem Kernkörperchen).
  Sonst: Punkt in der MITTE der sichtbaren Fläche dieses Teils, nicht an seinem Rand.
  Hüllen und Ränder (Zellmembran, Kernhülle, Zellwand …): Punkt GENAU AUF der Randlinie selbst – nicht außen im Hintergrund, nicht innen.
  Liegen mehrere Hüllen dicht übereinander (z. B. Zellwand und Zellmembran): ihre Punkte an VERSCHIEDENEN Stellen des Randes (mindestens 80 Einheiten auseinander).
  Füllungen (Zellplasma …): Punkt auf eine freie Stelle der Füllung, weit weg von anderen Teilen.
  Zu jedem Begriff steht, wie das Teil gemalt wurde (Form, Farbe, Lage) – suche genau diese Form und Farbe.
- Prüfe jeden Punkt einzeln: Was ist genau an dieser Stelle zu sehen? Ist ein Teil nicht eindeutig im Bild, lass es weg. Begriffe unverändert übernehmen.`;
/* Gegenprobe: ein zweiter, unabhängiger Blick sagt, was an jeder Stelle wirklich zu sehen ist */
const CHECK_SYSTEM = `Du prüfst die Beschriftung eines Lernbilds. Zu jeder Nummer gibt es einen Begriff und eine Stelle [y,x] (normiert 0–1000 auf das ganze Bild, 0,0 = oben links).
Schau dir GENAU diese Stelle an. Antworte NUR mit JSON: {"checks":[{"i":1,"seen":"was dort zu sehen ist","ok":true}]}
ok = true nur, wenn die Stelle eindeutig auf dem genannten Teil liegt (bei Hüllen/Rändern: auf der Randlinie).
false, wenn sie auf dem Hintergrund, auf einem Nachbarteil oder auf einem kleineren Teil darin liegt, oder wenn das Teil so nicht aussieht.
Hüllen und Ränder (Zellmembran, Zellwand, Kernhülle …) streng prüfen: liegt die Stelle auch nur knapp daneben – im leeren (weißen) Hintergrund
außerhalb oder schon innen im Zellplasma –, dann false und in "seen" sagen, ob sie zu weit außen oder zu weit innen liegt.`;
/* Breite, flache Motive (z. B. Nervenzelle): Kästchen in einer Reihe über bzw. unter dem Motiv statt seitlich –
   das Bild bleibt groß; jedes Kästchen sitzt möglichst genau über/unter seinem Teil, ohne Überlappung. */
function rowsLayout(img, title, pts, bx) {
  const W = 1024, H = 576, BOX_H = 30, FONT = 16, PAD = 14, GAP = 8, TOP = 84, font = 'Fira Sans, Segoe UI, Arial, sans-serif';
  const boxW = (t) => Math.round(t.length * FONT * 0.55 + 26); // Breite des Kästchens
  const cy = (bx.y0 + bx.y1) / 2;
  let top = pts.filter((p) => p.y < cy), bot = pts.filter((p) => p.y >= cy);
  // gleichmäßig verteilen: höchstens ein Kästchen Unterschied zwischen oben und unten
  while (top.length > bot.length + 1) { top.sort((p, q) => q.y - p.y); bot.push(top.shift()); }
  while (bot.length > top.length + 1) { bot.sort((p, q) => p.y - q.y); top.push(bot.shift()); }
  const rowY = { top: Math.max(TOP + 4, Math.min(bx.y0 - BOX_H - 26, TOP + 30)), bot: Math.min(H - BOX_H - 10, Math.max(bx.y1 + 26, H - BOX_H - 40)) };
  const placeRow = (list) => {
    const items = list.sort((p, q) => p.x - q.x).map((p) => ({ p, w: boxW(p.text), x: p.x - boxW(p.text) / 2 }));
    for (let i = 0; i < items.length; i++) items[i].x = Math.max(i ? items[i - 1].x + items[i - 1].w + GAP : PAD, items[i].x);
    // ragt die Reihe rechts hinaus: von rechts her zurückschieben
    const n = items.length;
    if (n && items[n - 1].x + items[n - 1].w > W - PAD) {
      items[n - 1].x = W - PAD - items[n - 1].w;
      for (let i = n - 2; i >= 0; i--) items[i].x = Math.min(items[i].x, items[i + 1].x - GAP - items[i].w);
    }
    return items;
  };
  const href = `data:${img.mime};base64,${img.data}`;
  // width/height angeben: ohne sie meldet der Browser nur ~267×150 px, und die Grafik würde beim Umwandeln unscharf
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image href="${href}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
  out += titleSvg(W, title, font);
  let marks = '', boxes = '';
  [['top', top], ['bot', bot]].forEach(([row, list]) => placeRow(list).forEach(({ p, w, x }) => {
    const y = rowY[row], lx = Math.max(x + 12, Math.min(x + w - 12, p.x)), ly = row === 'top' ? y + BOX_H - 4 : y + 4;
    marks += leaderSvg(lx, ly, p.x, p.y);
    boxes += labelSvg(x, y, w, BOX_H, p.text, font, FONT, p.color, 'middle');
  }));
  return `${out}${marks}${boxes}</svg>`;
}
/* Beschriftetes Bild: Kästchen links/rechts, Linien mit Kreis auf dem Teil.
   Ragt das Motiv in die Spalten der Kästchen (breite Motive wie Nervenzelle), wird das Bild in die freie Mitte verkleinert;
   der frei werdende Rand wird mit der Hintergrundfarbe aus der Bildecke gefüllt und die Bildkante weich ausgeblendet → nahtlos. */
function composeLabeled(img, title, points, box) {
  const W = 1024, H = 576, BOX_H = 30, GAP = 7, FONT = 16, PAD = 16, font = 'Fira Sans, Segoe UI, Arial, sans-serif';
  const TOP = 84, BOTTOM = H - 8; // Platz unter dem Titel
  let pts = points.map((p, i) => ({ text: String(p.text || '').trim().slice(0, 34), x: Math.max(0, Math.min(W, (+p.x || 0) * W / 1000)), y: Math.max(0, Math.min(H, (+p.y || 0) * H / 1000)), color: BOX_COLORS[i % BOX_COLORS.length] })).filter((p) => p.text).slice(0, 12);
  // Umriss des Motivs (sonst aus den Punkten geschätzt)
  const bx0 = box && [box.x0, box.y0, box.x1, box.y1].every((v) => Number.isFinite(+v)) && +box.x1 > +box.x0 && +box.y1 > +box.y0
    ? { x0: +box.x0 * W / 1000, y0: +box.y0 * H / 1000, x1: +box.x1 * W / 1000, y1: +box.y1 * H / 1000 }
    : pts.length ? { x0: Math.min(...pts.map((p) => p.x)) - 30, y0: Math.min(...pts.map((p) => p.y)) - 30, x1: Math.max(...pts.map((p) => p.x)) + 30, y1: Math.max(...pts.map((p) => p.y)) + 30 } : { x0: W * 0.25, y0: TOP, x1: W * 0.75, y1: BOTTOM };
  const bx = { x0: bx0.x0 - 30, y0: bx0.y0 - 14, x1: bx0.x1 + 30, y1: bx0.y1 + 14 }; // etwas Luft ums Motiv (gemeldeter Umriss ist oft knapp)
  // breites, flaches Motiv (über gut die Hälfte der Breite, höchstens halb so hoch): Kästchen über/unter dem Motiv
  if (bx.x1 - bx.x0 > W * 0.58 && bx.y1 - bx.y0 < H * 0.5 && pts.length) return rowsLayout(img, title, pts, bx);
  // Kästchen-Seite nach Lage zur Motiv-Mitte; höchstens 6 je Seite
  const mid = (bx.x0 + bx.x1) / 2;
  let left = pts.filter((p) => p.x < mid), right = pts.filter((p) => p.x >= mid);
  while (left.length > 6) { left.sort((p, q) => p.x - q.x); right.push(left.pop()); }
  while (right.length > 6) { right.sort((p, q) => p.x - q.x); left.push(right.shift()); }
  const boxW = (t) => Math.round(t.length * FONT * 0.55 + 26); // Breite des Kästchens
  const colL = left.length ? PAD + Math.max(...left.map((p) => boxW(p.text))) + 14 : PAD;
  const colR = right.length ? PAD + Math.max(...right.map((p) => boxW(p.text))) + 14 : PAD;
  // freie Mitte zwischen den Spalten: passt das Motiv nicht hinein, Bild verkleinern und dorthin schieben
  const freeL = colL, freeR = W - colR, freeT = TOP, freeB = BOTTOM;
  const bw = bx.x1 - bx.x0, bh = bx.y1 - bx.y0;
  const fits = bx.x0 >= freeL && bx.x1 <= freeR && bx.y0 >= freeT - 10;
  const k = fits ? 1 : Math.max(0.6, Math.min(1, (freeR - freeL) / bw, (freeB - freeT) / bh)); // das Motiv bleibt groß
  const tx = fits ? 0 : (freeL + freeR) / 2 - k * (bx.x0 + bx.x1) / 2;
  const ty = fits ? 0 : Math.max(freeT - k * bx.y0, Math.min((freeT + freeB) / 2 - k * (bx.y0 + bx.y1) / 2, freeB - k * bx.y1));
  pts.forEach((p) => { p.x = tx + k * p.x; p.y = ty + k * p.y; });
  // Kreise nicht genau übereinander: liegt ein Punkt sehr nah an einem früheren, rückt er nur ein kleines Stück (bleibt auf dem Teil)
  pts.forEach((p, i) => { for (let j = 0; j < i; j++) if (Math.hypot(p.x - pts[j].x, p.y - pts[j].y) < 12) p.x += (left.includes(p) ? -1 : 1) * 12; });
  left = left.sort((p, q) => p.y - q.y); right = right.sort((p, q) => p.y - q.y);
  const place = (list) => {
    const top = TOP + 4, bottom = H - BOX_H - 16;
    let ys = list.map((l) => Math.max(top, Math.min(bottom, l.y - BOX_H / 2)));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + BOX_H + GAP);
    const over = ys.length ? ys[ys.length - 1] - bottom : 0;
    if (over > 0) ys = ys.map((y) => y - over);
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - BOX_H - GAP);
    return ys;
  };
  const href = `data:${img.mime};base64,${img.data}`;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`; // Größe angeben – sonst wird die Grafik beim Umwandeln winzig gerastert
  if (fits) out += `<image href="${href}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
  else {
    // Grund: winziger Ausschnitt aus der leeren linken oberen Ecke, auf die ganze Fläche gezogen → genau die Hintergrundfarbe
    out += `<svg x="0" y="0" width="${W}" height="${H}" viewBox="4 4 24 16" preserveAspectRatio="none"><image href="${href}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/></svg>`;
    out += `<defs><filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter><mask id="fade"><rect x="${tx + 18}" y="${ty + 18}" width="${k * W - 36}" height="${k * H - 36}" fill="#fff" filter="url(#soft)"/></mask></defs>`;
    out += `<image href="${href}" x="${tx}" y="${ty}" width="${k * W}" height="${k * H}" preserveAspectRatio="none" mask="url(#fade)"/>`;
  }
  out += titleSvg(W, title, font);
  let marks = '', boxes = '';
  const drawSide = (list, side) => place(list).forEach((y, i) => {
    const l = list[i], w = boxW(l.text), x = side === 'L' ? PAD : W - PAD - w, cy = y + BOX_H / 2;
    marks += leaderSvg(side === 'L' ? x + w + 6 : x - 6, cy, l.x, l.y);
    boxes += labelSvg(x, y, w, BOX_H, l.text, font, FONT, l.color, side === 'L' ? 'end' : 'start');
  });
  drawSide(left, 'L'); drawSide(right, 'R');
  return `${out}${marks}${boxes}</svg>`;
}
// Recherche-Speicher: Fachwissen und Vorlagebilder je Thema bleiben 14 Tage liegen – ein Thema zum zweiten Mal (Tierzelle, Herz …)
// spart Suche und Downloads. Leere Ergebnisse werden nicht gespeichert (sonst bliebe ein kurzer Ausfall hängen).
const RESEARCH_CACHE = path.join(IMG_CACHE, '_recherche');
async function remembered(kind, id, make) {
  const file = path.join(RESEARCH_CACHE, `${kind}-${require('crypto').createHash('sha1').update(String(id)).digest('hex')}.json`);
  try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (Date.now() - c.t < 14 * 864e5) return c.v; } catch {}
  const v = await make();
  if (v && v.length) try { fs.mkdirSync(RESEARCH_CACHE, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ t: Date.now(), v })); } catch {}
  return v;
}
// Fachwissen zum Bild (Deutsch): Wikipedia-Artikel zum Thema (Einleitung + Abschnitt zum Aufbau) und 2 deutsche Lernseiten
// (studyflix, serlo, lernhelfer … bevorzugt) – daraus leitet die KI ab, welche Teile in die Abbildung gehören und wie sie heißen
async function topicFacts(description) {
  const H = { 'User-Agent': 'BackboneLearningApp/1.0 (local educational app)' };
  const topic = String(description).replace(/\(.*?\)/g, '').replace(/^(erstelle?|zeig|mach)\w*\s+(mir\s+)?(ein(en)?\s+)?(bild|grafik|abbildung)\s+(von|vom|zu|zum|zur)\s+/i, '')
    // englisch formulierter Auftrag („a clean, detailed diagram of an animal cell, …“) → nur das Motiv
    .replace(/^(an?|the)\b[^:]*?\b(diagram|illustration|image|picture|drawing|infographic|cross[- ]section)\s+of\s+(an?\s+|the\s+)?/i, '')
    .replace(/^(aufbau|schema|darstellung|querschnitt|längsschnitt|bau)\s+(eines|einer|des|der|von|durch(\s+(eine?[nms]?|die|das|den))?)?\s*/i, '').split(/\s+(?:mit|im|als|für)\s+|[,.:]/)[0].trim().slice(0, 80);
  if (!topic) return '';
  return remembered('fakten', topic.toLowerCase(), () => topicFactsFresh(topic, H));
}
async function topicFactsFresh(topic, H) {
  const wiki = (async () => {
    try {
      const sr = await (await fetch(`https://de.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(topic)}`, { headers: H, signal: AbortSignal.timeout(12000) })).json();
      const title = sr?.query?.search?.[0]?.title; if (!title) return '';
      const ex = await (await fetch(`https://de.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exchars=6000&redirects=1&format=json&titles=${encodeURIComponent(title)}`, { headers: H, signal: AbortSignal.timeout(12000) })).json();
      const text = String(Object.values(ex?.query?.pages || {})[0]?.extract || '');
      // Einleitung + der Abschnitt über Aufbau/Bestandteile (falls vorhanden)
      const part = /==+\s*(Aufbau|Bau|Bestandteile|Struktur|Anatomie|Organellen)[^=]*==+([\s\S]{0,2500})/i.exec(text);
      return `Wikipedia „${title}“: ${text.split(/\n==/)[0].replace(/\s+/g, ' ').slice(0, 1500)}${part ? ` … Aufbau: ${part[2].replace(/\s+/g, ' ')}` : ''}`;
    } catch { return ''; }
  })();
  const web = WEB.browse({ queries: [`${topic} Aufbau Bestandteile einfach erklärt`], urls: [], topic: `${topic} Aufbau` }, { maxPages: 2, timeMs: 20000, rank: W.rankGerman })
    .then((res) => (res.pages || []).map((p) => `${p.domain}: ${[p.description, p.text].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 2500)}`))
    .catch(() => []);
  const [w, pages] = await Promise.all([wiki, web]);
  const facts = [w, ...pages].filter(Boolean).join('\n\n');
  console.log(`[Bild] Recherche „${topic}“: ${[w ? 'Wikipedia' : '', ...pages.map((p) => p.split(':')[0])].filter(Boolean).join(', ') || 'nichts gefunden'}`);
  return facts.slice(0, 7000);
}
// mehrere Beispielbilder (Commons-Schemata, bis zu 4) als Vorlage – aus dem Vergleich ergibt sich der typische Aufbau
async function referenceImages(query, description, max = 4) {
  const first = String(description || '').replace(/\(.*?\)/g, '').split(/\s+/).slice(0, 5).join(' ');
  return remembered('vorlagen', `${query}|${first}|${max}`, () => referenceImagesFresh(query, first, max));
}
async function referenceImagesFresh(query, first, max) {
  const seen = new Set(), hits = [];
  for (const q of [...new Set([query, query && `${query} diagram`, first].filter(Boolean))]) {
    for (const h of (await commonsIllustration(q, 3).catch(() => null)) || []) if (!seen.has(h.url)) { seen.add(h.url); hits.push(h); }
    if (hits.length >= max) break;
  }
  const out = [];
  for (const hit of hits.slice(0, max + 2)) {
    try {
      const r = await fetch(hit.url, { headers: { 'User-Agent': 'BackboneLearningApp/1.0 (local educational app)' }, signal: AbortSignal.timeout(12000) });
      const type = r.headers.get('content-type') || '';
      const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
      if (buf && buf.length < 2.5e6 && /^image\/(png|jpeg|webp)/.test(type)) out.push({ mime: type.split(';')[0], data: buf.toString('base64') });
    } catch {}
    if (out.length >= max) break;
  }
  return out;
}
// FLUX malt den Auftrag; schlägt nur der Inhaltsfilter an, formuliert Gemini ihn schematischer und neutraler (ein zweiter Durchgang)
async function paint(env, prompt, prefer, seed = Math.floor(Math.random() * 1e6)) {
  let img = await nvcfImage(env, prompt.slice(0, 2000), seed, prefer);
  if (!img && lastImageFiltered) {
    const safe = await visionJson(env, SAFE_SYSTEM, prompt);
    if (String(safe?.prompt || '').length > 30) { console.warn('[Bild] Auftrag wird schematischer formuliert'); img = await nvcfImage(env, String(safe.prompt).slice(0, 2000), seed, prefer); if (img) img.prompt = String(safe.prompt); }
    // auch umformuliert blockiert: Aufträge mitschreiben, damit sich das auslösende Wort finden lässt
    if (!img && lastImageFiltered) try { fs.mkdirSync(IMG_CACHE, { recursive: true }); fs.appendFileSync(path.join(IMG_CACHE, '_gefiltert.log'), `${new Date().toISOString()}\n${prompt}\n--- umformuliert ---\n${safe?.prompt || '–'}\n\n`); } catch {}
  }
  return img;
}
const rawOf = (img) => ({ mime: img.mime, data: img.data });
// Vom Nutzer genannte Teile („beschriftet: Zellwand, Zellplasma …“) → die passenden geplanten Begriffe (Groß/klein, Ein-/Mehrzahl egal)
function requiredLabels(description, labels) {
  const m = /beschrift\w*\s*:?\s*([^\n.]+)/i.exec(String(description));
  if (!m) return [];
  const stem = (t) => String(t).toLowerCase().replace(/[^a-zäöüß]/g, '').replace(/(en|n|e|s)$/, '');
  return m[1].split(/,|\bund\b/).map((t) => stem(t)).filter((t) => t.length > 2)
    .map((want) => labels.find((l) => stem(l) === want || stem(l).includes(want) || want.includes(stem(l)))).filter(Boolean);
}
const labeledSvg = (img, title, res) => ({ mime: 'image/svg+xml', data: Buffer.from(composeLabeled(img, title, res.points, res.box)).toString('base64'), kind: 'flux' });
async function fluxIllustration(env, description, query) {
  if (!imageKeys(env).length) return null;
  if (!LABELED_IMAGE.test(description)) {
    // einfaches Bild: ein kurzer Bild-Auftrag genügt – ohne Recherche, Vorlagen, Titel und Beschriftung
    const plan = await visionJson(env, SIMPLE_PLAN_SYSTEM, `Bild: ${description}`, [], 512);
    const prompt = String(plan?.prompt || '').trim();
    if (prompt.length < 30) { console.warn('[Bild] Planung fehlgeschlagen (kein Bild-Auftrag)'); return null; }
    const img = await paint(env, prompt);
    return img ? { result: { ...rawOf(img), kind: 'flux' }, meta: { prompt: img.prompt || prompt, seed: img.seed, title: '', parts: [], labeled: false, base: rawOf(img) } } : null;
  }
  // Lerngrafik – Recherche vor dem Malen (parallel): was gehört fachlich dazu + mehrere Beispielbilder für den typischen Aufbau
  const T = { t: Date.now(), parts: [] }, lap = (name) => { T.parts.push(`${name} ${Math.round((Date.now() - T.t) / 1000)} s`); T.t = Date.now(); };
  let [facts, refs] = await Promise.all([topicFacts(description), referenceImages(query, description, 4)]);
  if (!facts) facts = await topicFacts(description); // Fachwissen ist Pflicht für Lernbilder → einmal neu versuchen (Ausfälle sind meist kurz)
  console.log(`[Bild] Bildplan bekommt ${facts.length} Zeichen Fachwissen und ${refs.length} Vorlagebild${refs.length === 1 ? '' : 'er'}`);
  lap('Recherche');
  const plan = await visionJson(env, planSystem(REALISTIC.test(description)), `Lernbild: ${description}${facts ? `\n\nFACHWISSEN (deutsche Wikipedia und deutsche Lernseiten – leite daraus ab, welche Teile dazugehören und wie sie richtig heißen; nichts Wichtiges weglassen):\n${facts}` : ''}`, refs, 3000); // gründlich: FLUX kennt den Aufbau nur aus dieser Beschreibung
  const prompt = String(plan?.prompt || '').trim();
  if (prompt.length < 30) { console.warn('[Bild] Planung fehlgeschlagen (kein Bild-Auftrag)'); return null; }
  const parts = Array.isArray(plan.parts) ? plan.parts : [];
  const labels = (parts.length ? parts.map((p) => p?.label) : Array.isArray(plan.labels) ? plan.labels : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12);
  const required = requiredLabels(description, labels);
  // ohne Wunsch nach Beschriftung: nur malen – kein Titel, keine Begriffe (die geplanten Teile bleiben für ein späteres „beschrifte es“ gespeichert)
  if (!WANTS_LABELS.test(description)) {
    lap('Planen');
    const img = await paint(env, prompt);
    lap('Malen');
    console.log(`[Bild] Zeiten: ${T.parts.join(' · ')} (ohne Beschriftung)`);
    return img ? { result: { ...rawOf(img), kind: 'flux' }, meta: { prompt: img.prompt || prompt, seed: img.seed, title: String(plan.title || ''), parts, labeled: false, base: rawOf(img) } } : null;
  }
  // Beschriftet wird nur, was im fertigen Bild gefunden UND bei der Gegenprobe bestätigt wurde. Fehlt zu viel (FLUX hat Teile
  // weggelassen oder unklar gemalt), wird ein zweites Bild gemalt und das vollständigere genommen.
  let best = null;
  for (let round = 0; round < 2; round++) {
    if (!round) lap('Planen');
    const img = await paint(env, prompt);
    lap(round ? 'Malen (2.)' : 'Malen');
    if (!img) break;
    const res = labels.length ? await locateParts(env, img, labels, parts, required) : { points: [], box: null };
    lap(round ? 'Beschriften (2.)' : 'Beschriften');
    console.log(`[Bild] Beschriftung${round ? ' (2. Bild)' : ''}: ${res.points.length}/${labels.length} Teile ${res.checked ? 'gefunden und bestätigt' : 'gefunden (ohne Gegenprobe)'}`
      + (res.points.length < labels.length ? ` · fehlt: ${labels.filter((l) => !res.points.some((p) => p.text === l)).join(', ')}` : ''));
    if (!best || res.points.length > best.res.points.length) best = { img, res };
    if (res.points.length >= Math.ceil(labels.length * 0.75)) break;
  }
  console.log(`[Bild] Zeiten: ${T.parts.join(' · ')}`);
  if (!best) return null;
  const { img, res } = best;
  return { result: labeledSvg(img, plan.title, res), meta: { prompt: img.prompt || prompt, seed: img.seed, title: String(plan.title || ''), parts, labeled: true, base: rawOf(img) } };
}
/* Folgewunsch zu einem früheren Bild („die Beschriftung fehlt“, „mach die Mitochondrien rot“, „füge … hinzu“):
   Gemini sieht das Rohbild und entscheidet, ob nur die Beschriftung neu gesetzt wird (Bild bleibt exakt gleich) oder ob neu gemalt werden
   muss – dann mit demselben Startwert und dem bisherigen Auftrag, in den nur die Änderung eingearbeitet ist (Aufbau und Stil bleiben). */
const EDIT_PLAN_SYSTEM = `Ein Bild aus einer Lern-App soll angepasst werden. Du bekommst das bisherige Bild (ohne Beschriftung), die bisherige und die neue Beschreibung,
den bisherigen englischen Bild-Auftrag, den Titel und die bisher beschrifteten Teile. Antworte NUR mit JSON:
{"repaint":true,"prompt":"englischer Bild-Auftrag","title":"kurzer deutscher Titel","labeled":true,"parts":[{"label":"deutscher Fachbegriff","look":"wie das Teil im Bild aussieht"}]}
- "repaint": false, wenn sich am Gemalten nichts ändern muss (Beschriftung hinzufügen, entfernen, umbenennen, Titel ändern) – dann bleibt das Bild exakt gleich und "prompt" entfällt.
- "repaint": true nur, wenn sich das Gemalte ändern soll (Farbe, Teil hinzufügen oder entfernen, Stil, Perspektive, Ausschnitt …). Dann ist "prompt" der bisherige
  Auftrag WORTGLEICH, nur mit der gewünschten Änderung – alles andere unverändert (gleicher Stil, Hintergrund, Anordnung, ohne Text im Bild).
- REFERENZBILD („Im Stil und Aufbau des Referenzbilds: …“ – ein NEUES Motiv): "repaint": true, und "prompt" behält alle Stil-, Farb-, Hintergrund-
  und Aufbau-Angaben des bisherigen Auftrags WORTGLEICH, nur das Motiv und seine Teile werden durch das neue ersetzt. Ohne Beschriftungswunsch "labeled": false.
- "labeled": soll das neue Bild beschriftet sein? Wie bisher, außer der Wunsch ändert es (z. B. „beschrifte es“ → true, „ohne Beschriftung“ → false).
- "parts" (nur wenn beschriftet): 6–12 Teile, die im Bild nach der Änderung wirklich sichtbar sind, mit fachlich richtigen, kurzen deutschen Begriffen;
  "look": Form, Farbe und Lage so, wie das Teil im Bild aussieht – schau dir dafür das Bild genau an. Bisherige Teile behalten, sofern der Wunsch nichts anderes sagt.`;
async function editIllustration(env, meta, description) {
  const text = `Bisherige Beschreibung: ${meta.description}\nNeue Beschreibung (mit dem Änderungswunsch): ${description}\nBisheriger Bild-Auftrag: ${meta.prompt}\nTitel: ${meta.title || '–'}\nBeschriftet: ${meta.labeled ? 'ja' : 'nein'}\nTeile: ${(meta.parts || []).map((p) => `${p.label} (${p.look || ''})`).join('; ') || '–'}`;
  const plan = await visionJson(env, EDIT_PLAN_SYSTEM, text, [meta.base], 2048);
  if (!plan) { console.warn('[Bild] Anpassung: Planung fehlgeschlagen'); return null; }
  let img = { ...meta.base, seed: meta.seed }, prompt = meta.prompt;
  if (plan.repaint === true && String(plan.prompt || '').trim().length > 30) {
    prompt = String(plan.prompt).trim();
    // echte Bearbeitung des vorhandenen Bildes (nur die Änderung) – neues Motiv nach Referenzbild oder Fehlschlag: neu malen wie bisher
    const edited = /referenzbild/i.test(description) ? null : await geminiImageEdit(env, meta.base, `${description}\n(Bisher: ${meta.description})`);
    const painted = edited ? { ...edited, seed: meta.seed, prompt } : await paint(env, prompt, null, meta.seed); // gleicher Startwert → gleicher Bildaufbau
    if (!painted) return null;
    img = painted;
    prompt = painted.prompt || prompt;
  }
  const labeled = (plan.labeled === true || (plan.labeled == null && meta.labeled)) && (meta.labeled || WANTS_LABELS.test(description)); // neu beschriftet wird nur auf Wunsch
  const parts = labeled ? (Array.isArray(plan.parts) && plan.parts.length ? plan.parts : meta.parts || []) : [];
  const labels = parts.map((p) => String(p?.label || '').trim()).filter(Boolean).slice(0, 12);
  const title = labeled ? String(plan.title || meta.title || '') : '';
  console.log(`[Bild] Anpassung: ${plan.repaint === true ? 'neu gemalt (gleicher Startwert)' : 'gleiches Bild'}${labeled ? `, ${labels.length} Teile beschriften` : ', ohne Beschriftung'}`);
  let result = { ...rawOf(img), kind: 'flux' };
  if (labeled && labels.length) result = labeledSvg(img, title, await locateParts(env, img, labels, parts));
  return { result, meta: { prompt, seed: img.seed ?? meta.seed, title, parts, labeled, base: rawOf(img) } };
}
// Gespeicherte Rohbilder zum Anpassen: <key>.meta.json + kleines Verzeichnis (Beschreibung → key), damit ein Folgewunsch sein Bild findet
const META_INDEX = path.join(IMG_CACHE, '_anpassen.json');
const readMetaIndex = () => { try { return JSON.parse(fs.readFileSync(META_INDEX, 'utf8')); } catch { return []; } };
function saveMeta(key, description, meta) {
  writeImgCache(`${key}.meta`, { ...meta, description });
  const list = readMetaIndex().filter((e) => e.k !== key);
  list.push({ k: key, d: description, t: Date.now() });
  try { fs.writeFileSync(META_INDEX, JSON.stringify(list.slice(-400))); } catch {}
}
// genau dieselbe Beschreibung zuerst; sonst die ähnlichste (Wortüberschneidung), bei Gleichstand die neueste
function findMeta(description) {
  const words = (t) => new Set(String(t).toLowerCase().match(/[a-zäöüß]{3,}/g) || []);
  const want = words(description);
  let best = null;
  for (const e of readMetaIndex()) {
    const have = words(e.d);
    const common = [...want].filter((w) => have.has(w)).length;
    const score = e.d.trim() === description.trim() ? 2 : common / Math.max(1, new Set([...want, ...have]).size);
    if (score >= 0.45 && (!best || score > best.score || (score === best.score && e.t > best.t))) best = { ...e, score };
  }
  return best ? readImgCache(`${best.k}.meta`) : null;
}
const SHELL = /(membran|wand|hülle|plasma|zytoplasma|cytoplasma|haut|rinde|schale|matrix|stroma|grundsubstanz|flüssigkeit)/i; // Hüllen und Füllungen
// Gemini findet die Teile (Rahmen + Punkt); dazu bekommt es die Beschreibung, wie jedes Teil gemalt wurde (sonst verwechselt es ähnliche Formen).
// hints: zu Teilen, deren Punkt bei der Gegenprobe danebenlag – was dort stattdessen zu sehen war
async function findPoints(env, img, labels, parts = [], hints = new Map()) {
  const look = new Map((Array.isArray(parts) ? parts : []).map((p) => [String(p?.label || '').trim(), String(p?.look || '').trim()]));
  const list = labels.map((l) => `- ${l}${look.get(l) ? `: ${look.get(l)}` : ''}${hints.get(l) ? ` (ACHTUNG: ein früherer Punkt lag falsch – dort war ${hints.get(l)})` : ''}`).join('\n');
  const found = await visionJson(env, POINT_SYSTEM, `Finde diese Teile:\n${list}`, [img], 4096); // gründlich: falsche Punkte sind der häufigste Fehler
  const b = found?.box;
  const box = Array.isArray(b) && b.length === 4 ? { y0: +b[0], x0: +b[1], y1: +b[2], x1: +b[3] } : null;
  const inside = (x, y, r, tol) => r && x >= r.x0 - tol && x <= r.x1 + tol && y >= r.y0 - tol && y <= r.y1 + tol;
  const points = (Array.isArray(found?.points) ? found.points : []).map((p) => {
    const [y, x] = Array.isArray(p?.point) ? p.point : [p?.y, p?.x];
    const pb = Array.isArray(p?.box_2d) && p.box_2d.length === 4 ? { y0: +p.box_2d[0], x0: +p.box_2d[1], y1: +p.box_2d[2], x1: +p.box_2d[3] } : null;
      const text = String(p?.label ?? p?.text ?? '').trim();
    // Rahmen erkennt Gemini genauer als Punkte: liegt ein Punkt am Rand seines Teils (äußere 20 %), rückt er in die Rahmenmitte –
    // außer bei Hüllen/Rändern und Füllungen, wo die Mitte auf einem anderen Teil läge
    let px = +x, py = +y;
    if (pb && !SHELL.test(text) && Number.isFinite(px) && Number.isFinite(py)) {
      const w = pb.x1 - pb.x0, h = pb.y1 - pb.y0;
      const inner = { x0: pb.x0 + w * 0.2, x1: pb.x1 - w * 0.2, y0: pb.y0 + h * 0.2, y1: pb.y1 - h * 0.2 };
      if (!inside(px, py, inner, 0)) { px = (pb.x0 + pb.x1) / 2; py = (pb.y0 + pb.y1) / 2; }
    }
    return { text, x: px, y: py, part: pb };
  }).filter((p) => labels.includes(p.text) && Number.isFinite(p.x) && Number.isFinite(p.y)
    // Lageprüfung: der Punkt muss auf dem Objekt (nicht im Hintergrund) und im Rahmen seines Teils liegen
    && (!box || inside(p.x, p.y, box, 20)) && (!p.part || inside(p.x, p.y, p.part, 25)));
  return { points, box };
}
/* Gegenprobe: was liegt wirklich an jeder Stelle? → Map Begriff → { ok, seen } (null, wenn die Prüfung ausfällt) */
async function checkPoints(env, img, points) {
  if (!points.length) return null;
  const list = points.map((p, i) => `${i + 1}. ${p.text} – Stelle [${Math.round(p.y)},${Math.round(p.x)}]`).join('\n');
  const r = await visionJson(env, CHECK_SYSTEM, list, [img], 2048);
  if (!Array.isArray(r?.checks)) return null;
  const out = new Map();
  for (const c of r.checks) { const p = points[Number(c?.i) - 1]; if (p) out.set(p.text, { ok: c.ok === true, seen: String(c?.seen || '').slice(0, 80) }); }
  return out;
}
/* Beschriften mit Prüfung: finden → Gegenprobe → falsche Teile einmal neu suchen → was dann noch falsch ist, bleibt unbeschriftet */
async function locateParts(env, img, labels, parts, required = []) {
  const first = await findPoints(env, img, labels, parts);
  const check = await checkPoints(env, img, first.points);
  if (!check) return first; // Gegenprobe nicht verfügbar → nur Lageprüfung
  let points = first.points.filter((p) => check.get(p.text)?.ok);
  const retry = labels.filter((l) => !points.some((p) => p.text === l));
  if (retry.length) {
    const hints = new Map([...check].filter(([, c]) => !c.ok && c.seen).map(([l, c]) => [l, c.seen]));
    const again = await findPoints(env, img, retry, parts, hints);
    const check2 = await checkPoints(env, img, again.points);
    if (check2) points = [...points, ...again.points.filter((p) => check2.get(p.text)?.ok)];
  }
  // Pflicht-Teile (vom Nutzer genannt), die immer noch fehlen: ein letzter, gezielter Blick nur auf diese Teile; angenommen wird ein Punkt,
  // der auf dem Objekt und im Rahmen seines Teils liegt (die Lageprüfung in findPoints)
  const still = (required || []).filter((l) => labels.includes(l) && !points.some((p) => p.text === l));
  if (still.length) {
    const last = await findPoints(env, img, still, parts, new Map(still.map((l) => [l, 'nicht gefunden – schau genau hin, das Teil ist im Bild']))).catch(() => ({ points: [] }));
    points = [...points, ...last.points.filter((p) => p.part)];
  }
  // Zwei Beschriftungen auf (fast) derselben Stelle – typisch: Zellkern und Kernkörperchen beide auf dem Kernkörperchen.
  // Das kleinere Teil behält die Stelle, das größere (das es umschließt) zeigt auf seine eigene Fläche daneben.
  const area = (r) => (r ? (r.x1 - r.x0) * (r.y1 - r.y0) : Infinity);
  for (const p of points) for (const q of points) {
    if (p === q || !p.part || !q.part || Math.hypot(p.x - q.x, p.y - q.y) > 30 || area(p.part) <= area(q.part) * 1.5) continue;
    p.x = (q.part.x1 + p.part.x1) / 2; // zwischen dem kleinen Teil und dem Rand des großen
    p.y = (q.part.y0 + q.part.y1) / 2;
  }
  // Reihenfolge wie geplant (Farben der Kästchen bleiben stabil)
  points.sort((a, b) => labels.indexOf(a.text) - labels.indexOf(b.text));
  return { points, box: first.box || null, checked: true };
}

/* ---------- Echte Bildbearbeitung: Gemini 2.5 Flash Image („Nano Banana“) ----------
   Bekommt das vorhandene Bild + den Wunsch und ändert NUR das Gewünschte (Rest bleibt pixelgenau gleich).
   FLUX bei NVIDIA kann keine eigenen Bilder bearbeiten – deshalb dieses Modell. Nicht verfügbar (z. B. Kontingent 429) → null,
   dann malt FLUX wie bisher anhand einer Beschreibung neu (Ersatz). */
const IMAGE_EDIT_MODEL = 'gemini-2.5-flash-image';
async function geminiImageEdit(env, img, instruction) {
  if (!env.GEMINI_API_KEY || !img) return null;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_EDIT_MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: img.mime, data: img.data } }, { text: `Bearbeite dieses Bild: ${instruction}\nÄndere NUR das Gewünschte. Stil, Motiv, Aufbau, Farben und Bildformat bleiben sonst genau gleich. Keine Schrift hinzufügen.` }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    });
    if (!r.ok) { console.warn(`[Bild-Bearbeitung] ${IMAGE_EDIT_MODEL}: HTTP ${r.status}`); return null; }
    const j = await r.json();
    const part = (j?.candidates?.[0]?.content?.parts || []).find((x) => (x.inlineData || x.inline_data)?.data);
    const d = part && (part.inlineData || part.inline_data);
    return d ? { mime: d.mimeType || d.mime_type || 'image/png', data: d.data } : null;
  } catch (e) { console.warn(`[Bild-Bearbeitung] ${e.message}`); return null; }
}

/* ---------- /api/image-edit: Bild im Dokument „mit KI bearbeiten“ ----------
   Gemini sieht das Bild, beschreibt es als Bild-Auftrag und baut die gewünschte Änderung ein → FLUX malt das neue Bild.
   (Das Bearbeitungs-Modell FLUX.1 Kontext lehnt bei NVIDIA eigene Bilder ab.) */
const EDIT_SYSTEM = `Du bekommst ein Bild und einen Änderungswunsch auf Deutsch. Antworte NUR mit JSON: {"prompt":"englischer Bild-Auftrag"}
"prompt" (Englisch, 60–140 Wörter) beschreibt das Bild so genau, dass ein Bildmodell es neu malen kann – Motiv, Aufbau, Anordnung, Farben, Stil, Hintergrund –
und enthält die gewünschte Änderung. Alles, was nicht geändert werden soll, bleibt wie im Original. Keine Schrift im Bild, außer der Wunsch verlangt sie ausdrücklich.`;
async function handleImageEdit(req, res) {
  const env = readEnv();
  const { src, instruction } = await readBody(req, 12 * 1024 * 1024);
  const wish = String(instruction || '').trim().slice(0, 500);
  if (!wish) return sendJson(res, 400, { error: 'Was soll am Bild geändert werden?' });
  let img = null;
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(src || ''));
  if (m) img = { mime: m[1], data: m[2] };
  const svg = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)$/.exec(String(src || ''));
  if (svg) { const inner = /href="data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)"/.exec(Buffer.from(svg[1], 'base64').toString()); if (inner) img = { mime: inner[1], data: inner[2] }; }
  else if (/^https:\/\//.test(String(src || ''))) {
    try {
      const r = await fetch(src, { headers: { 'User-Agent': 'BackboneLearningApp/1.0 (local educational app)' }, signal: AbortSignal.timeout(15000) });
      const type = (r.headers.get('content-type') || '').split(';')[0];
      const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
      if (buf && buf.length < 8e6 && /^image\/(png|jpeg|webp)$/.test(type)) img = { mime: type, data: buf.toString('base64') };
    } catch {}
  }
  if (!img) return sendJson(res, 400, { error: 'Dieses Bild kann ich nicht lesen.' });
  const edited = await geminiImageEdit(env, img, wish); // echte Bearbeitung zuerst
  if (edited) return sendJson(res, 200, { src: `data:${edited.mime};base64,${edited.data}`, mode: 'edit' });
  const plan = await visionJson(env, EDIT_SYSTEM, `Änderungswunsch: ${wish}`, [img]);
  const prompt = String(plan?.prompt || '').trim();
  if (prompt.length < 30) return sendJson(res, 502, { error: 'Die KI konnte das Bild gerade nicht beschreiben.' });
  const out = await nvcfImage(env, prompt.slice(0, 2000), Math.floor(Math.random() * 1e6));
  if (!out) return sendJson(res, 502, { error: 'Das Bild konnte gerade nicht erzeugt werden.' });
  sendJson(res, 200, { src: `data:${out.mime};base64,${out.data}` });
}

/* ---------- /api/cover-image: Cover im Dokument „mit KI erstellen“ ----------
   Gemini macht aus dem deutschen Wunsch (und optionalen Vorlage-Fotos) einen englischen Bild-Auftrag im Stil der übrigen Cover
   (farbige flache Illustration mit gemaltem Look, Merkmale klar erkennbar, kreativ angeordnet – nie realistisch, nie skizziert) → FLUX malt (1344×768).
   Die App zeigt das Bild im normalen Banner-Format der Cover (füllt die Fläche, kein eigenes Seitenverhältnis). */
const COVER_STYLE = 'wide panoramic banner composition, all elements in one horizontal band across the vertical center, empty calm background above and below, colorful flat vector-style illustration with a painted look: clean bold shapes, smooth flat color fills with soft subtle shading and a gentle drop shadow under each element, '
  + 'every element clearly recognizable by its characteristic features (scientifically correct structures, e.g. distinct organelles inside a cell), '
  + 'creative composition: many related elements arranged into a pleasing overall shape or pattern, balanced and tidy, wide horizontal banner with the composition centered and some breathing room, '
  + 'harmonious palette, calm soft plain background, not a sketch, no pencil lines, not photorealistic, no 3d render, no photo, no text, no letters, no border';
const COVER_SYSTEM = `Du bekommst einen Wunsch für ein Cover (breites Titelbild über einem Schul-Dokument) auf Deutsch, eventuell mit Fotos als Orientierung. Antworte NUR mit JSON: {"prompt":"englischer Bild-Auftrag"}
"prompt" (Englisch, 60–110 Wörter):
- Das Thema muss man SOFORT erkennen: nenne die typischen Merkmale/Strukturen konkret und fachlich richtig (z. B. Biologie mit Zellen → mehrere Zellen
  im Querschnitt mit klar erkennbarem Zellkern, Mitochondrien, Chloroplasten, Vakuole, endoplasmatischem Retikulum; Chemie → Moleküle, Kolben).
- Stil: farbige, flache Illustration mit gemaltem Look (klare Formen, flächige Farben, weiche Schatten) – wie hochwertige Icon-/Sticker-Illustrationen,
  kreativ angeordnet (viele passende Elemente bilden zusammen eine schöne Form oder ein Muster). Nicht gezeichnet/skizziert, nicht realistisch.
- Nennt der Nutzer Farben (z. B. „in Grün“), bestimmen sie die Palette und den Hintergrund (z. B. "palette of fresh greens on a soft light green background").
- Fotos (falls dabei) nur als Orientierung für Motiv, Farben oder Aufbau – nie nachmalen.
- FORMAT: Das Bild wird als sehr breites Banner gezeigt (etwa 3,6 : 1) – sichtbar ist nur der mittlere Streifen (ca. 45 % der Höhe).
  Plane danach: alle wichtigen Elemente in einer Reihe bzw. einem flachen Band in der Mitte, oben und unten nur ruhiger Hintergrund;
  lieber weniger, dafür gut erkennbare Elemente (etwa 5–12), nichts am oberen/unteren Rand, nichts Wichtiges angeschnitten.
- BEARBEITEN: Steht „BEARBEITEN“ im Auftrag, ist ein bestehendes Cover gegeben (Bild oder Beschreibung). Beschreibe dann dieses Cover so genau,
  dass es neu gemalt werden kann, und baue NUR die gewünschte Änderung ein – alles andere (Motiv, Farben, Anordnung) bleibt gleich.
Der Auftrag endet mit diesem Stil: ${COVER_STYLE}.
Keine Schrift im Bild.`;
async function handleCoverImage(req, res) {
  const env = readEnv();
  const { wish, photos, edit, base, baseDesc } = await readBody(req, 12 * 1024 * 1024);
  const w = String(wish || '').trim().slice(0, 400);
  if (w.length < 3) return sendJson(res, 400, { error: 'Beschreib kurz, was auf dem Cover sein soll.' });
  const imgs = (Array.isArray(photos) ? photos : []).slice(0, 3).map((x) => /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(x || ''))).filter(Boolean).map((m) => ({ mime: m[1], data: m[2] }));
  // Bearbeiten: das aktuelle Cover-Bild kommt als erstes Bild mit (die KI beschreibt es und ändert nur, was gewünscht ist)
  const baseImg = edit && /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(base || ''));
  if (baseImg) imgs.unshift({ mime: baseImg[1], data: baseImg[2] });
  if (baseImg) { // Cover bearbeiten: echtes Bearbeiten des vorhandenen Bildes, nur bei Fehlschlag neu malen
    const edited = await geminiImageEdit(env, { mime: baseImg[1], data: baseImg[2] }, w);
    if (edited) return sendJson(res, 200, { src: `data:${edited.mime};base64,${edited.data}`, mode: 'edit' });
  }
  const editNote = edit ? `\nBEARBEITEN: ${baseImg ? 'Das ERSTE Bild ist das aktuelle Cover.' : `Aktuelles Cover: ${String(baseDesc || 'abstraktes Farb-Cover').slice(0, 200)}.`} Ändere nur, was gewünscht ist.` : '';
  const plan = await visionJson(env, COVER_SYSTEM, `Wunsch: ${w}${editNote}${imgs.length - (baseImg ? 1 : 0) ? `\n(${imgs.length - (baseImg ? 1 : 0)} Foto(s) als Orientierung angehängt)` : ''}`, imgs, 1024).catch(() => null);
  let prompt = String(plan?.prompt || '').trim();
  if (prompt.length < 30) prompt = `${w}. ${COVER_STYLE}`;
  if (!/flat vector-style/i.test(prompt)) prompt = `${prompt}. ${COVER_STYLE}`;
  const out = await nvcfImage(env, prompt.slice(0, 2000), Math.floor(Math.random() * 1e6));
  if (!out) return sendJson(res, 502, { error: 'Das Cover konnte gerade nicht erstellt werden.' });
  sendJson(res, 200, { src: `data:${out.mime};base64,${out.data}` });
}

// Freies Bild aus dem Netz (Wikimedia Commons, mit Quelle/Lizenz) – Gemini schaut sich die Kandidaten an und nimmt nur ein wirklich passendes
const FIT_SYSTEM = `Du prüfst, ob ein Bild für eine Lern-App wirklich zum Thema passt. Antworte NUR mit JSON: {"fits": true|false}
true nur, wenn das Bild genau das gewünschte Thema fachlich richtig und gut erkennbar zeigt (kein ähnliches Thema, kein Ausschnitt von etwas anderem, keine Textseite).`;
async function fittingWebImage(env, description, query) {
  const seen = new Set(), list = [];
  for (const q of [query, `${query || ''} diagram`.trim(), String(description).split(/\s+/).slice(0, 5).join(' ')]) {
    for (const c of await commonsIllustration(q, 4).catch(() => [])) if (!seen.has(c.url)) { seen.add(c.url); list.push(c); }
    if (list.length >= 4) break;
  }
  for (const c of list.slice(0, 4)) {
    try {
      const r = await fetch(c.url, { headers: { 'User-Agent': 'BackboneLearningApp/1.0 (local educational app)' }, signal: AbortSignal.timeout(12000) });
      const type = (r.headers.get('content-type') || '').split(';')[0];
      const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
      if (!buf || buf.length > 4e6 || !/^image\/(png|jpeg|webp)$/.test(type)) continue;
      const v = await visionJson(env, FIT_SYSTEM, `Gewünschtes Bild: ${description}`, [{ mime: type, data: buf.toString('base64') }]);
      if (v?.fits === true) return c;
    } catch {}
  }
  return null;
}

// frühere Schlüssel-Formen (Stil-Versionen), damit bereits erzeugte Bilder in gespeicherten Chats erhalten bleiben
const OLD_IMG_SUFFIXES = [
  ...['gross3', 'gross2', 'gross', 'layout4', 'layout3', 'layout2', 'lernplattform', 'schulbild', 'blau', 'schwarz'].map((v) => (q, s) => `${q}|flux3-${v}|${s}`),
  (q) => `${q}|flux3`, (q) => `${q}|`, (q) => q,
];
async function handleIllustration(req, res) {
  const env = readEnv();
  const { prompt, query, source, edit } = await readBody(req, 8000);
  const description = String(prompt || '').trim().slice(0, 600);
  const editOf = String(edit || '').trim().slice(0, 600); // Beschreibung des früheren Bildes, das angepasst werden soll
  if (description.length < 20) return sendJson(res, 400, { error: 'Bildbeschreibung fehlt.' });
  // Ein einmal erzeugtes Bild bleibt für immer dasselbe – nach Neustart, Neuladen oder Code-Änderungen wird es NICHT neu erzeugt.
  // Fester Schlüssel aus Beschreibung, Suchwörtern und Herkunft; ältere Bilder (frühere Schlüssel-Versionen) werden weiter gefunden.
  const key = imgKey(description, `${query || ''}|${source || ''}${editOf ? `|edit:${editOf}` : ''}`);
  const cached = readImgCache(key) || OLD_IMG_SUFFIXES.map((v) => readImgCache(imgKey(description, v(query || '', source || '')))).find(Boolean);
  if (cached) { if (!readImgCache(key)) writeImgCache(key, cached); res.setHeader('Cache-Control', 'no-store'); return sendJson(res, 200, cached); }
  // Bild aus dem Netz gewünscht: nur nehmen, wenn es wirklich passt – sonst wird eins erzeugt
  if (source === 'web' || source === 'webonly') {
    const web = await fittingWebImage(env, description, query).catch(() => null);
    if (web) { writeImgCache(key, web); res.setHeader('Cache-Control', 'no-store'); return sendJson(res, 200, web); }
  }
  // Präsentationen: erst ein geprüft passendes Foto (oben); sonst ein passendes KI-Bild im ruhigen Fotostil – nie ein unpassender Suchtreffer
  if (source === 'webonly') {
    const img = await paint(env, `${description}. Professional high-quality photograph for a school presentation, realistic, natural light, clean calm composition, subject clearly visible and centered, no text, no letters, no watermark`).catch(() => null);
    if (img) { const out = { source: 'ai', url: `data:${img.mime};base64,${img.data}`, author: 'KI-Bild' }; writeImgCache(key, out); res.setHeader('Cache-Control', 'no-store'); return sendJson(res, 200, out); }
    return sendJson(res, 404, { error: 'Kein passendes Bild gefunden.' });
  }
  // echtes KI-Bild (FLUX über NVIDIA) mit Beschriftung darüber – ein Durchgang (Startwerte und Umformulieren stecken schon drin), sonst ein freies Fachbild.
  // Folgewunsch zu einem früheren Bild: dieses Bild anpassen (findet es kein Rohbild dazu, entsteht ein neues)
  const t0 = Date.now();
  const base = editOf && source !== 'web' ? findMeta(editOf) : null;
  if (editOf) console.log(`[Bild] Anpassung ${base ? 'des früheren Bildes' : '– früheres Bild nicht gefunden, male neu'}`);
  const made = await (base ? editIllustration(env, base, description) : fluxIllustration(env, description, query)).catch((e) => { console.warn(`[Bild] ${e.message}`); return null; });
  const real = made?.result;
  console.log(`[Bild] ${real ? 'fertig' : 'kein KI-Bild'} nach ${Math.round((Date.now() - t0) / 1000)} s${real ? '' : ` · Thema: ${description.slice(0, 80)}`}`);
  if (real) { writeImgCache(key, real); saveMeta(key, description, made.meta); res.setHeader('Cache-Control', 'no-store'); return sendJson(res, 200, real); }
  const fallback = await commonsIllustration(query || description);
  // Kontingent erschöpft → die App zeigt ruhig „Limit erreicht – wieder verfügbar ab …“
  if (!fallback && Date.now() < visionMainSkipUntil) return sendJson(res, 429, { error: 'Limit erreicht', limit: true, resetAt: P.limitResetAt() });
  if (!fallback) return sendJson(res, 502, { error: 'Illustration konnte nicht gefunden werden.' });
  writeImgCache(key, fallback);
  res.setHeader('Cache-Control', 'no-store');
  sendJson(res, 200, fallback);
}

/* ---------- /api/tts: natürliche Stimme über die Sprachmodelle von Gemini (Gratis-Key) ----------
   Liefert WAV-Audio. Mehrere Modelle als Ersatz; schlägt alles fehl, nutzt der Browser seine eigene Stimme. */
const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview']; // schnellstes zuerst
const TTS_VOICES = new Set(['Charon', 'Orus', 'Fenrir', 'Puck', 'Iapetus', 'Algenib', 'Enceladus', 'Umbriel', 'Achird', 'Sadaltager', 'Schedar', 'Alnilam', 'Rasalgethi', 'Zubenelgenubi', 'Algieba']); // männliche Stimmen
let ttsSkipUntil = new Map(); // Modell → Zeitpunkt, bis zu dem es (Limit) übersprungen wird

async function handleTts(req, res) {
  const body = await readBody(req, 100000);
  const env = readEnv();
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  const voice = TTS_VOICES.has(body.voice) ? body.voice : 'Orus';
  if (!text) return sendJson(res, 400, { error: 'Kein Text' });
  const controller = new AbortController();
  res.on('close', () => controller.abort());

  // 1. Wahl: Sprachmodell von Gemini, GESTREAMT – rohes PCM (16 Bit, 24 kHz, mono) geht sofort an den Browser
  if (env.GEMINI_API_KEY) {
    for (const model of TTS_MODELS) {
      if ((ttsSkipUntil.get(model) || 0) > Date.now()) continue;
      let started = false;
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: text }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
          }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        if (r.status === 429) { ttsSkipUntil.set(model, Date.now() + 60 * 1000); continue; } // Minutenlimit → 1 Min. das nächste Modell
        if (!r.ok) continue;
        await P.readUpstreamSse(r, (chunk) => {
          const part = chunk.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
          if (!part) return;
          const pcm = Buffer.from(part.inlineData.data, 'base64');
          if (!started) {
            started = true;
            const rate = Number((String(part.inlineData.mimeType).match(/rate=(\d+)/) || [])[1]) || 24000;
            res.writeHead(200, { 'Content-Type': `audio/l16; rate=${rate}; channels=1`, 'Cache-Control': 'no-store', 'X-TTS-Model': model });
          }
          res.write(pcm);
        });
        if (started) return res.end();
      } catch (err) {
        if (controller.signal.aborted) return;
        if (started) return res.end(); // mitten im Ton abgebrochen – Rest weglassen
      }
    }
  }
  // Ersatz: Piper lokal (Stimme „Thorsten“)
  if (TTS.available()) {
    try {
      const wav = await TTS.synthesize(text);
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'X-TTS-Model': 'piper-thorsten' });
      return res.end(wav);
    } catch {}
  }
  sendJson(res, 503, { error: 'Sprachausgabe gerade nicht verfügbar' });
}

/* ---------- /api/title: kurzer, treffender Chat-Titel aus der ersten Anfrage ----------
   Schnellstes Modell zuerst (Gemini 2.5 Flash ohne Denkphase), sonst Flash-Lite. */
/* ---------- /api/doc-ai: KI schreibt oder bearbeitet Dokumente ----------
   mode "create": aus dem Chat ein neues Dokument · "edit": vorhandenes Dokument nach Anweisung ändern
   mode "rewrite": markierten Text umschreiben (Ask AI im Auswahl-Menü). Antwort immer JSON. */
const DOC_SYSTEM = `Du bist der Schreib-Assistent einer Lern-App und arbeitest in Dokumenten (wie Notion).
Schreibe auf Deutsch, klar gegliedert und lernfreundlich. Kein Quellenverzeichnis, keine Emojis.
Erlaubtes HTML: <h1>, <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <b>, <i>, <u>, <s>, <sup>, <sub>, <blockquote>, <pre><code>, <table>, <thead>, <tbody>, <tr>, <th>, <td>. Tabellen aus dem Gespräch übernimmst du vollständig als <table>. Keine Klassen, keine Styles, kein Markdown.
Formeln (im Gespräch als $…$ bzw. $$…$$) schreibst du als <span data-math="TeX-Formel"></span>, abgesetzte Formeln mit data-display: <span data-math="…" data-display></span> (TeX unverändert, Anführungszeichen als &quot;). Code als <pre><code>…</code></pre> (Zeilen unverändert, < als &lt;).
Ein Hefteintrag (Block heft) wird ein Kasten: <div data-callout="#4fcf8a" data-radius="12"><p><b>So kommt es ins Heft</b></p><p>Zeile</p>…</div>.
VOLLSTÄNDIG ÜBERNEHMEN: Sollen Inhalte aus dem Gespräch ins Dokument (z. B. „mach daraus ein Dokument“, „schreib das ins Dokument“, „füge das hinzu“), übernimmst du sie KOMPLETT – jeden Abschnitt, jeden Stichpunkt, alle Tabellen, Beispiele, Rechenwege, Formeln, Code, Hefteinträge und Diagramme. Nichts kürzen, nichts zusammenfassen, nichts weglassen – außer die Anweisung verlangt es ausdrücklich. Nur Gesprächsfloskeln („Gern!“, Rückfragen) lässt du weg.
Gliedere streng in Ebenen, damit man jeden Abschnitt einklappen und verschieben kann:
- <h2> = Kapitel, <h3> = Unterkapitel, <h4> = Unterpunkt. Nie tiefer als <h4> (tiefere Punkte als Liste darunter).
- Jede Zwischenüberschrift ist ein echtes <h2>/<h3>/<h4> – nie ein fett gedruckter Absatz (<p><b>…</b></p>) und nie loser Text.
- Ebenen nicht überspringen (nach <h2> kommt <h3>, nicht direkt <h4>). Nummerierung wie „1.2.1“ nur, wenn sie hilft, dann einheitlich.
- Unter jeder Überschrift steht Inhalt (Absatz, Liste oder Tabelle).
Diagramme, Mindmaps und Zeitstrahlen aus dem Gespräch (Blöcke chart, mindmap, timeline) übernimmst du als <div data-viz="chart" data-spec="…"></div> (bzw. "mindmap", "timeline"); in data-spec steht der Inhalt des Blocks unverändert (JSON, Anführungszeichen als &quot;).
Besondere Blöcke (wie in Notion) – nutze sie, wenn der Nutzer sie verlangt, und auch ungefragt, wenn sie den Inhalt klar besser zeigen (Zahlenreihen → Diagramm, Termine → Kalender, Frist/Prüfung → Zeit, Ort → Karte, Wichtiges → Hervorhebung):
- Aufgabenliste: <ul data-todo><li>offen</li><li data-done>erledigt</li></ul>
- Hervorhebung (Kasten): <div data-callout="#Farbe" data-radius="12"><p>…</p></div> (Farbe z. B. #2f86ff, #4fcf8a, #f0913a, #f07a6e; data-solid für deckend statt transparent; data-radius 0–24) · Trennlinie: <hr>
- alle weiteren als <div data-blk="TYP" data-cfg='JSON'></div> (JSON in einfachen Anführungszeichen, gültiges JSON):
  · chart – Diagramm: {"type":"bar|hbar|line","title":"…","unit":"…","labels":["…"],"series":[{"name":"…","values":[Zahlen, je Beschriftung eine]}]} (bar = Säulen, hbar = Balken, line = Linie; mehrere Datenreihen erlaubt)
  · dashboard – Übersicht aus Kacheln: {"items":[{"kind":"chart","chart":Diagramm-JSON},{"kind":"list","title":"…","items":["…"]},{"kind":"table","title":"…","rows":[["Kopf 1","Kopf 2"],["…","…"]]},{"kind":"tasks","title":"…","items":[{"t":"…","done":false}]},{"kind":"map","title":"…","q":"Ort"}]} (beliebige Mischung, 1–6 Kacheln)
  · board – Aufgaben-Board nur für dieses Dokument (Spalten Offen/In Arbeit/Erledigt): {"tasks":[{"title":"…","notes":"…","status":"backlog|doing|done","prio":"none|low|medium|high|urgent","date":"JJJJ-MM-TT"}]} (notes/prio/date optional)
  · image – Bild: {"query":"Suchbegriff"} (das Bild wird gesucht) oder {"src":"upload:1"} für das 1. hochgeladene Bild oder {"src":"https://…"}; optional "caption"
  · gallery – Galerie: {"query":"Suchbegriff","count":6} oder {"items":[{"src":"upload:1","title":"…"}]}
  · video – Video: {"query":"Suchbegriff"} (ein passendes YouTube-Video wird gesucht) oder {"src":"https://www.youtube.com/watch?v=…"}
  · audio – Audio: {"src":"https://…","name":"…"} · web – Website-Karte: {"url":"https://…","title":"…"} oder {"query":"…"}
  · map – Karte: {"q":"Ort oder Adresse"} ("locked":true = fester Ausschnitt ohne Verschieben)
  · calendar – Kalender: {"events":[{"date":"JJJJ-MM-TT","title":"Termin","time":"HH:MM","end":"HH:MM"}]} (time/end optional)
  · time – Zeit: {"mode":"countdown|range|since","title":"…","start":"JJJJ-MM-TTTHH:MM","end":"JJJJ-MM-TTTHH:MM"}
Bestehende Blöcke (data-blk, data-todo, data-callout, data-doclink) behältst du unverändert bei, wenn sie nicht geändert werden sollen.
GEZIELT ÄNDERN: Lies das bestehende Dokument genau. Nichts doppeln – steht ein Thema schon drin, verbessere/ergänze genau diese Stelle statt es erneut einzufügen. Löschen, Kürzen, Ersetzen und Umstellen sind erlaubt, wenn die Anweisung es verlangt. Alles Übrige bleibt wörtlich unverändert.
Antworte NUR mit JSON.`;
const DOC_FORMAT = {
  create: 'Erstelle ein neues Dokument aus dem Gespräch nach der Anweisung. JSON: {"title": "kurzer Titel", "subtitle": "ein Satz Beschreibung", "html": "Inhalt", "reply": "ein kurzer Satz an den Nutzer, was du angelegt hast"}',
  edit: 'Bearbeite das vorhandene Dokument nach der Anweisung. Behalte ALLES unverändert bei, was nicht geändert werden soll – jeden Abschnitt, jede Tabelle, jeden Block; der Inhalt darf nur kürzer werden, wenn die Anweisung das verlangt. JSON: {"title": "Titel (ggf. unverändert)", "html": "kompletter neuer Inhalt", "reply": "ein kurzer Satz, was du geändert hast"}',
  // Ergänzen: nur das Neue schreiben – das vorhandene Dokument bleibt, wie es ist (die App fügt es ein); so geht nichts verloren
  append: 'Ergänze das vorhandene Dokument nach der Anweisung. Schreibe NUR den NEUEN Inhalt, der hinzukommt – wiederhole das vorhandene Dokument NICHT (es bleibt vollständig erhalten, die App fügt dein HTML ein). Geht es um Inhalte aus dem Gespräch (meist die letzte Antwort unter „Zu übernehmen“), übernimm sie vollständig. Gehört das Neue unter eine vorhandene Überschrift, nenne deren Text genau in "after"; sonst "" (dann kommt es ans Ende). JSON: {"html": "nur der neue Inhalt", "after": "Überschrift oder leer", "reply": "ein kurzer Satz, was du ergänzt hast"}',
  meta: 'Schlage für ein Dokument aus diesem Inhalt einen kurzen Titel (höchstens 6 Wörter) und eine Beschreibung (ein Satz, höchstens 18 Wörter) vor. Ist ein Chat-Titel angegeben, übernimm ihn als Titel, wenn er passt. JSON: {"title": "…", "subtitle": "…", "html": "-"}',
  rewrite: 'Bearbeite NUR den markierten Text nach der Anweisung. JSON: {"html": "Ersatz für den markierten Text (Inline-HTML oder Absätze)"}',
};
/* Blöcke, die die KI nur mit Suchbegriff anlegt, hier fertig machen:
   Bild/Galerie → freie Bilder von Wikimedia Commons, Video → YouTube-Treffer der Websuche,
   Website → erster Suchtreffer, Karte → Koordinaten über OpenStreetMap (Nominatim) */
const attrDecode = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrEncode = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
async function commonsImages(query, count) {
  const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: String(query).slice(0, 100), gsrnamespace: '6', gsrlimit: String(Math.min(30, count * 3)), prop: 'imageinfo', iiprop: 'url|mime|size', iiurlwidth: '1200', format: 'json' });
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': 'BackboneLearningApp/1.0 (local educational app)' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) return [];
  return Object.values((await r.json()).query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map((page) => {
    const info = page.imageinfo?.[0];
    if (!/^image\/(png|jpeg|webp)$/.test(info?.mime || '') || info.width < 400) return null;
    const url = info.thumburl || info.url;
    return /^https:\/\/upload\.wikimedia\.org\//.test(url) ? { src: url, title: String(page.title || '').replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80) } : null;
  }).filter(Boolean).slice(0, count);
}
async function resolveBlock(type, cfg) {
  if (type === 'image' && !cfg.src && cfg.query) {
    const hit = (await commonsImages(cfg.query, 1).catch(() => []))[0] || (await commonsIllustration(cfg.query).catch(() => null)); // bester Suchtreffer zuerst (Foto), sonst Schaubild
    if (hit) { cfg.src = hit.url || hit.src; cfg.caption ||= [hit.title, hit.author && `Bild: ${hit.author}`, hit.license].filter(Boolean).join(' · ').slice(0, 160); }
  } else if (type === 'gallery' && !(cfg.items || []).length && cfg.query) {
    cfg.items = await commonsImages(cfg.query, Math.max(2, Math.min(12, Number(cfg.count) || 6))).catch(() => []);
  } else if (type === 'video' && !cfg.src && cfg.query) {
    const hits = await WEB.searchWeb(`${cfg.query} youtube`).catch(() => []);
    cfg.src = hits.map((h) => h.url).find((u) => /youtube\.com\/watch\?v=[\w-]{11}|youtu\.be\/[\w-]{11}/.test(u)) || '';
  } else if (type === 'web' && !cfg.url && cfg.query) {
    const [hit] = await WEB.searchWeb(cfg.query).catch(() => []);
    if (hit) { cfg.url = hit.url; cfg.title ||= hit.title; }
  } else if (type === 'map' && cfg.q && cfg.lat == null) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=de&q=${encodeURIComponent(String(cfg.q).slice(0, 160))}`, { headers: { 'User-Agent': 'BackboneLearningApp/1.0 (local educational app)' }, signal: AbortSignal.timeout(10000) }).catch(() => null);
    const [hit] = r?.ok ? await r.json().catch(() => []) : [];
    if (hit) Object.assign(cfg, { label: hit.display_name.split(',').slice(0, 3).join(',').trim(), lat: +(+hit.lat).toFixed(5), lon: +(+hit.lon).toFixed(5), zoom: 14 });
  } else if (type === 'dashboard' && Array.isArray(cfg.items)) {
    await Promise.all(cfg.items.filter((x) => x?.kind === 'map').map((x) => resolveBlock('map', x).catch(() => x))); // Karten-Kacheln wie Karten-Blöcke
  }
  delete cfg.query; delete cfg.count;
  return cfg;
}
async function resolveBlocks(html) {
  const tags = [...String(html).matchAll(/<div\b[^>]*\bdata-blk=["'](\w+)["'][^>]*>/gi)];
  if (!tags.length) return html;
  const done = await Promise.all(tags.map(async ([tag, type]) => {
    // data-cfg robust lesen: auch wenn die KI das JSON mit normalen Anführungszeichen in "…" schreibt
    const at = tag.search(/\bdata-cfg=/i), open = at < 0 ? -1 : tag.indexOf('{', at), close = tag.lastIndexOf('}');
    let cfg = {};
    try { cfg = open < 0 || close < open ? {} : JSON.parse(attrDecode(tag.slice(open, close + 1))) || {}; } catch { return `<div data-blk="${type}" data-cfg="{}">`; }
    try { cfg = await resolveBlock(type, cfg); } catch {}
    return `<div data-blk="${type}" data-cfg="${attrEncode(JSON.stringify(cfg))}">`;
  }));
  let i = 0;
  return String(html).replace(/<div\b[^>]*\bdata-blk=["'](\w+)["'][^>]*>/gi, () => done[i++]);
}

// Ergänzen: das Dokument nur als Gliederung (Überschriften + Anfang jedes Abschnitts) – die KI muss es nicht wiederholen, nur wissen, wohin das Neue gehört
function docOutline(html) {
  const out = [];
  String(html || '').replace(/<(h[1-4])[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<h[1-4][^>]*>|$)/gi, (m, tag, head, body) => {
    const text = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    out.push(`<${tag}>${text(head)}</${tag}> ${text(body).slice(0, 200)}${text(body).length > 200 ? ' …' : ''}`);
    return m;
  });
  return out.length ? out.join('\n').slice(0, 30000) : String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000);
}
async function handleDocAi(req, res) {
  const body = await readBody(req, 2 * 1024 * 1024);
  const env = readEnv();
  const mode = DOC_FORMAT[body.mode] ? body.mode : 'create';
  const cut = (t, n) => String(t || '').slice(0, n);
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const uploads = Math.max(0, Math.min(12, Number(body.uploads) || 0));
  const user = [
    `Aufgabe: ${DOC_FORMAT[mode]}`,
    `Heute ist ${today}.`,
    uploads ? `Der Nutzer hat ${uploads} Bild(er) hochgeladen: im Block als "upload:1" bis "upload:${uploads}" verwenden.` : '',
    `Anweisung: ${cut(body.instruction, 2000)}`,
    // Gespräch: das ENDE zählt (dort steht die Antwort, die ins Dokument soll) – deshalb von hinten kürzen, nicht von vorn
    body.chat ? `Gespräch (Auszug):\n${String(body.chat).slice(-60000)}` : '',
    body.source ? `Zu übernehmen (letzte Antwort im Chat, vollständig):\n${cut(body.source, 80000)}` : '',
    body.doc ? `Vorhandenes Dokument – Titel: ${cut(body.doc.title, 200)}\nInhalt (HTML):\n${mode === 'append' ? docOutline(body.doc.html) : cut(body.doc.html, 200000)}` : '',
    body.chatTitle ? `Chat-Titel: ${cut(body.chatTitle, 120)}` : '',
    body.selection ? `Markierter Text:\n${cut(body.selection, 8000)}` : '',
  ].filter(Boolean).join('\n\n');
  const ok = (o) => o && typeof o.html === 'string' && o.html.trim();
  // Hauptmodell, bei Überlastung/Fehler das nächste Gemini-Modell, dann NVIDIA – Fehler werden protokolliert (früher still verschluckt)
  const errs = [];
  if (env.GEMINI_API_KEY) {
    for (const model of [P.GEMINI_MODEL, P.GEMINI_NEXT]) {
      try {
        const o = P.parseJsonLoose(await P.geminiOnce({ key: env.GEMINI_API_KEY, model, system: DOC_SYSTEM, user, maxTokens: 65536, thinking: model === P.GEMINI_MODEL ? { budget: 0 } : { level: 'low' }, json: true, signal: AbortSignal.timeout(120000) }));
        if (ok(o)) { o.html = await resolveBlocks(o.html); return sendJson(res, 200, o); }
        errs.push(`${model}: kein HTML`);
      } catch (err) { errs.push(`${model}: ${err.message}`); }
    }
  }
  try {
    const o = await P.smallJsonTask(env, { system: DOC_SYSTEM, user, maxTokens: 32768, timeoutMs: 120000 });
    if (ok(o)) { o.html = await resolveBlocks(o.html); return sendJson(res, 200, o); }
    errs.push('ersatz: kein HTML');
  } catch (err) { errs.push(`ersatz: ${err.message}`); }
  console.log(`[doc-ai ${mode}] fehlgeschlagen · ${errs.join('; ')}`);
  sendJson(res, 502, { error: 'Die KI hat gerade nicht geantwortet.' });
}

/* ---------- /api/doc-intent: Will der Nutzer WIRKLICH jetzt ein Dokument / eine Notiz anlegen? ----------
   Die App fragt nur nach, wenn in der Nachricht „Dokument“/„Notiz“ vorkommt und es nicht eindeutig ist. */
const DOC_INTENT_SYSTEM = `Du entscheidest für eine Lern-App, ob der Nutzer mit seiner Nachricht AUSDRÜCKLICH verlangt, dass JETZT ein Dokument oder eine Notiz angelegt wird
(z. B. „erstelle mir eine Notiz dazu“, „mach daraus ein Dokument“, „schreib das in ein Dokument“).
NEIN, wenn er nur über Dokumente, Notizen, Randnotizen, Mitschriften o. Ä. spricht, etwas dazu fragt, erzählt oder erklärt haben will
(z. B. „wie mache ich gute Randnotizen?“, „ich schreibe mir immer Notizen an den Rand“, „was ist ein Dokument?“). Im Zweifel: NEIN.
Antworte NUR mit JSON: {"create": true} oder {"create": false}`;
async function handleDocIntent(req, res) {
  const body = await readBody(req, 20000);
  const env = readEnv();
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  const ask = (raw) => /"create"\s*:\s*true/.test(String(raw || ''));
  if (text && env.GEMINI_API_KEY) {
    for (const [model, thinking] of [[P.GEMINI_MODEL, { budget: 0 }], [P.GEMINI_NEXT, { level: 'low' }]]) {
      try { return sendJson(res, 200, { create: ask(await P.geminiOnce({ key: env.GEMINI_API_KEY, model, system: DOC_INTENT_SYSTEM, user: text, maxTokens: 60, thinking, signal: AbortSignal.timeout(8000) })) }); } catch {}
    }
  }
  const nvKey = nvidiaKeyOf(env);
  if (text && nvKey) { try { return sendJson(res, 200, { create: ask(await P.nvidiaComplete(nvKey, DOC_INTENT_SYSTEM, text, AbortSignal.timeout(20000), 800)) }); } catch {} }
  sendJson(res, 200, { create: null }); // keine KI erreichbar → die App entscheidet selbst (nur eindeutige Bitten)
}

const TITLE_SYSTEM = `Du gibst einem Lern-Chat einen kurzen, treffenden Titel – wie in einer Chat-Liste.
Regeln: 2 bis 5 Wörter, Sprache der Anfrage (meist Deutsch), Thema statt Frageform, kein Punkt, keine Anführungszeichen, keine Emojis,
keine Füllwörter wie „Frage zu“ oder „Hilfe bei“. Beispiele: „Photosynthese einfach erklärt“, „Quadratische Gleichungen lösen“, „Ursachen des Ersten Weltkriegs“.
Antworte NUR mit dem Titel.`;
async function handleTitle(req, res) {
  const body = await readBody(req, 50000);
  const env = readEnv();
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!text) return sendJson(res, 400, { error: 'Kein Text' });
  const clean = (t) => String(t || '').split('\n')[0].replace(/^["„“'»«\s]+|["„“'»«.\s]+$/g, '').replace(/^titel:\s*/i, '').slice(0, 60).trim();
  // Gemini 2.5 Flash (nach HTTP 429 eine Weile übersprungen) → Flash-Lite → Nemotron (kein Tageslimit) – damit nicht einfach der Prompt zum Titel wird
  if (env.GEMINI_API_KEY) {
    for (const [model, thinking] of [[P.GEMINI_MODEL, { budget: 0 }], [P.GEMINI_NEXT, { level: 'low' }], [P.GEMINI_BACKUP, { level: 'low' }]]) {
      if (model === P.GEMINI_MODEL && Date.now() < visionMainSkipUntil) continue;
      try {
        const t = clean(await P.geminiOnce({ key: env.GEMINI_API_KEY, model, system: TITLE_SYSTEM, user: text, maxTokens: 200, thinking, signal: AbortSignal.timeout(10000) }));
        if (t) return sendJson(res, 200, { title: t });
      } catch (e) { if (e.status === 429 && model === P.GEMINI_MODEL) visionMainSkipUntil = Date.now() + 5 * 60 * 1000; }
    }
  }
  const nvKey = nvidiaKeyOf(env);
  if (nvKey) {
    try {
      const t = clean(await P.nvidiaComplete(nvKey, TITLE_SYSTEM, text, AbortSignal.timeout(30000), 2000));
      if (t) return sendJson(res, 200, { title: t });
    } catch {}
  }
  sendJson(res, 200, { title: '' });
}

/* ---------- /api/icon: Logo (Favicon) einer Quellen-Website ----------
   Holt das Icon zuerst direkt von der Website (<link rel="icon"> der Startseite, sonst /favicon.ico),
   erst danach über einen Icon-Dienst. Der Browser fragt nur diesen Server; Ergebnis wird zwischengespeichert. */
const iconCache = new Map(); // Domain → { type, data } | null
const ICON_TYPES = /^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|jpeg|gif|webp)$/;
const DOMAIN_OK = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

async function fetchIconFrom(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'follow', headers: { 'User-Agent': 'LernApp/0.2 (favicon)' } });
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!res.ok || !ICON_TYPES.test(type)) return null;
  const data = Buffer.from(await res.arrayBuffer());
  return data.length > 0 && data.length < 300000 ? { type, data } : null;
}

async function loadIcon(domain) {
  try {
    const page = await fetch(`https://${domain}/`, { signal: AbortSignal.timeout(5000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (LernApp favicon)' } });
    if (page.ok && /text\/html/.test(page.headers.get('content-type') || '')) {
      const html = (await page.text()).slice(0, 200000);
      const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
        .filter((tag) => /rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(tag) && !/mask-icon/i.test(tag));
      // größeres Icon bevorzugen (apple-touch-icon / sizes), dann normales Icon
      links.sort((a, b) => (/apple-touch|sizes\s*=\s*["']?(1[2-9]\d|[2-9]\d\d)/i.test(b) ? 1 : 0) - (/apple-touch|sizes\s*=\s*["']?(1[2-9]\d|[2-9]\d\d)/i.test(a) ? 1 : 0));
      for (const tag of links.slice(0, 3)) {
        const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
        if (!href || href.startsWith('data:')) continue;
        const url = new URL(href.replace(/&amp;/g, '&'), page.url);
        if (url.protocol !== 'https:') continue;
        const icon = await fetchIconFrom(url).catch(() => null);
        if (icon) return icon;
      }
    }
  } catch {}
  // Viele Verlage (ACS, PNAS, Cambridge …) blockieren automatische Abrufe → öffentliche Icon-Dienste als Ersatz.
  // Die Anfrage geht vom Server aus; übermittelt wird nur der Domainname.
  for (const url of [
    `https://${domain}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
  ]) {
    const icon = await fetchIconFrom(url).catch(() => null);
    if (icon) return icon;
  }
  return null;
}

async function handleIcon(req, res, query) {
  const domain = String(query.get('domain') || '').toLowerCase();
  if (!DOMAIN_OK.test(domain) || /(^|\.)(localhost|local|internal|lan|home)$/.test(domain)) { res.writeHead(400); return res.end(); }
  if (!iconCache.has(domain)) iconCache.set(domain, loadIcon(domain));
  const icon = await iconCache.get(domain);
  if (!icon) { res.writeHead(404, { 'Cache-Control': 'max-age=86400' }); return res.end(); }
  res.writeHead(200, { 'Content-Type': icon.type, 'Cache-Control': 'max-age=604800', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
  res.end(icon.data);
}

/* ---------- Alte Ablage am PC (vor den Konten): wird nur noch gelesen – das erste Konto übernimmt sie (adoptLegacyData) ---------- */
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
const tombstones = (dir) => new Set(readJson(path.join(dir, '_geloescht.json'))?.ids || []);

/* Chats (früher „chats/“, eine JSON-Datei pro Chat) */
const CHATS_DIR = path.join(DATA_ROOT, 'chats');
const CHAT_ID = /^c[a-z0-9]{4,30}$/;
function loadChats() {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(path.join(CHATS_DIR, '_reihenfolge.json'), 'utf8')); } catch {}
  let files = [];
  try { files = fs.readdirSync(CHATS_DIR).filter((f) => CHAT_ID.test(f.replace(/\.json$/, ''))); } catch {}
  const dead = tombstones(CHATS_DIR);
  const chats = files.map((f) => { try { return JSON.parse(fs.readFileSync(path.join(CHATS_DIR, f), 'utf8')); } catch { return null; } }).filter((c) => c && CHAT_ID.test(c.id) && !dead.has(c.id));
  const order = Array.isArray(state.order) ? state.order : [];
  chats.sort((a, b) => ((order.indexOf(a.id) + 1) || 1e9) - ((order.indexOf(b.id) + 1) || 1e9));
  return { active: state.active, chats };
}

/* Dokumente (früher „dokumente/“, eine JSON-Datei pro Dokument) */
const DOCS_DIR = path.join(DATA_ROOT, 'dokumente');
const DOC_ID = /^d[a-z0-9]{4,30}$/;
function loadDocs() {
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(DOCS_DIR, '_projekte.json'), 'utf8')); } catch {}
  let files = [];
  try { files = fs.readdirSync(DOCS_DIR).filter((f) => DOC_ID.test(f.replace(/\.json$/, ''))); } catch {}
  const dead = tombstones(DOCS_DIR);
  const docs = files.map((f) => { try { return JSON.parse(fs.readFileSync(path.join(DOCS_DIR, f), 'utf8')); } catch { return null; } }).filter((d) => d && DOC_ID.test(d.id) && !dead.has(d.id));
  return { docs, projects: Array.isArray(meta.projects) ? meta.projects : [] };
}

/* ---------- Vorschau des Coding-Agenten ----------
   Die Dateien eines Projekts liegen nur im Speicher (noch nicht auf dem PC) und werden unter /vorschau/<chat-id>/ ausgeliefert –
   mit „sandbox“: der erzeugte Code läuft abgeschottet und kommt weder an die Daten der App noch an ihre /api. */
const PREVIEWS = new Map(); // id → { files: Map(pfad → inhalt), at }
const PREVIEW_ID = /^c[a-z0-9]{4,30}$/;
const PREVIEW_TYPES = { ...TYPES, '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
function storePreview({ id, files }) {
  if (!PREVIEW_ID.test(id || '') || !files || typeof files !== 'object') throw new Error('Ungültige Vorschau');
  const map = new Map();
  let bytes = 0;
  for (const [p, content] of Object.entries(files).slice(0, 300)) {
    const clean = String(p).replace(/\\/g, '/').split('/').filter((x) => x && x !== '.' && x !== '..').join('/');
    if (!clean) continue;
    bytes += String(content).length;
    if (bytes > 8 * 1024 * 1024) break;
    map.set(clean, String(content));
  }
  PREVIEWS.set(id, { files: map, at: Date.now() });
  if (PREVIEWS.size > 30) PREVIEWS.delete([...PREVIEWS.entries()].sort((a, b) => a[1].at - b[1].at)[0][0]); // älteste zuerst weg
}
function servePreview(res, urlPath) {
  const [, , id, ...rest] = urlPath.split('/');
  const proj = PREVIEWS.get(id);
  let file = rest.join('/') || 'index.html';
  if (proj && !proj.files.has(file) && proj.files.has(`${file.replace(/\/$/, '')}/index.html`)) file = `${file.replace(/\/$/, '')}/index.html`;
  const content = proj?.files.get(file);
  if (content == null) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
  // HTML: kleiner Melder ganz vorne – Laufzeitfehler gehen an die App (Code-Fenster zeigt sie mit „Beheben“)
  const html = /\.html?$/i.test(file);
  const body = html ? injectReporter(content) : content;
  res.writeHead(200, {
    'Content-Type': PREVIEW_TYPES[path.extname(file).toLowerCase()] || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}
const REPORTER = `<script>(function(){var s=function(m,f,l){try{parent.postMessage({type:'ca-error',message:String(m).slice(0,300),file:String(f||'').split('/').pop(),line:l||null},'*')}catch(e){}};`
  + `addEventListener('error',function(e){if(e.message)s(e.message,e.filename,e.lineno)});addEventListener('unhandledrejection',function(e){s('Promise: '+((e.reason&&e.reason.message)||e.reason))})})();</script>`;
function injectReporter(content) {
  const m = content.match(/<head[^>]*>/i) || content.match(/<html[^>]*>/i);
  return m ? content.replace(m[0], `${m[0]}${REPORTER}`) : REPORTER + content;
}

/* ---------- Server ---------- */
// gleiche Adresse wie die App selbst (z. B. deine-app.vercel.app) – die Vorschau auf Port 3001 bleibt fremd
/* ---------- Konten: Speicher, Cookie, Anmeldung (Ablauf in lib/accounts.js) ---------- */
// Geheime Einstellungen: .env am PC, Umgebungsvariablen auf Vercel
const serverEnv = () => ({ ...readFileEnv(), ...process.env });
let storeCache = { sig: null, store: null };
function accountStore() {
  if (process.env.APP_TEST_STORE === 'memory') return storeCache.store || (storeCache.store = STORE.memoryStore());
  const env = serverEnv();
  const sig = [env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL, env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN].join('|');
  if (storeCache.sig !== sig || !storeCache.store) storeCache = { sig, store: STORE.pickStore(env, { onVercel: ON_VERCEL, dataRoot: DATA_ROOT }) };
  return storeCache.store;
}
function cookiesOf(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const isHttps = (req) => ON_VERCEL || req.headers['x-forwarded-proto'] === 'https';
const sessionCookie = (req, token, maxAge) => `sid=${token ? encodeURIComponent(token) : ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
async function handleAuth(req, res, urlPath, store) {
  if (req.method === 'POST' && urlPath === '/api/auth/start') {
    const r = await ACC.startLogin(store, serverEnv(), await readBody(req, 4000), { onVercel: ON_VERCEL });
    if (r.session) { // feste Zugangsdaten ohne Code: gleich angemeldet
      const { session } = r;
      res.setHeader('Set-Cookie', sessionCookie(req, session.token, session.maxAge));
      return sendJson(res, 200, { ok: true, mode: 'direct', email: r.email, user: { email: r.email }, fresh: session.fresh });
    }
    return sendJson(res, 200, r);
  }
  if (req.method === 'POST' && urlPath === '/api/auth/verify') {
    const r = await ACC.verifyLogin(store, serverEnv(), await readBody(req, 4000));
    if (r.fresh && !ON_VERCEL) await adoptLegacyData(store, r.user.id);
    res.setHeader('Set-Cookie', sessionCookie(req, r.token, r.maxAge));
    return sendJson(res, 200, { ok: true, user: { email: r.user.email }, fresh: r.fresh && await ACC.isFresh(store, r.user.id) });
  }
  if (req.method === 'POST' && urlPath === '/api/auth/logout') {
    await ACC.logout(store, cookiesOf(req).sid);
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'GET' && urlPath === '/api/auth/me') {
    const user = await ACC.sessionUser(store, cookiesOf(req).sid);
    if (user?.renewed) res.setHeader('Set-Cookie', sessionCookie(req, cookiesOf(req).sid, ACC.SESSION_TTL));
    return user ? sendJson(res, 200, { ok: true }) : sendJson(res, 401, { error: 'Nicht angemeldet', auth: true });
  }
  return sendJson(res, 404, { error: 'Unbekannt' });
}
// Am PC: das erste Konto übernimmt die Chats und Dokumente, die schon in „chats/“ und „dokumente/“ liegen (Dateien bleiben liegen)
async function adoptLegacyData(store, uid) {
  try {
    if (await store.get('legacy:uebernommen')) return;
    const { chats, active } = loadChats();
    const { docs, projects } = loadDocs();
    if (!chats.length && !docs.length) return;
    await ACC.storeChats(store, uid, { chats, active, order: chats.map((c) => c.id) });
    await ACC.storeDocs(store, uid, { docs, projects });
    await store.set('legacy:uebernommen', uid);
    console.log(`[Anmeldung] ${chats.length} Chats und ${docs.length} Dokumente ins Konto übernommen`);
  } catch (e) { console.log('[Anmeldung] Übernahme alter Daten:', e.message); }
}

const planspielCleaned = new Set();
function sameHost(req) { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; } }
function handler(req, res) { return requestKeys.run(deviceKeysOf(req), () => handle(req, res)); }
async function handle(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  try {
    // Fremde Herkunft (z. B. die Vorschau auf dem eigenen Port) darf die /api der App nicht benutzen
    if (urlPath.startsWith('/api/') && req.headers.origin && !APP_ORIGIN.test(req.headers.origin) && !sameHost(req)) { res.writeHead(403); return res.end(); }
    let store = null, user = null;
    if (urlPath.startsWith('/api/')) {
      store = accountStore();
      if (!store) return sendJson(res, 503, { error: 'Der Speicher für Konten ist noch nicht eingerichtet (Upstash Redis in Vercel verbinden).', setup: true });
      if (urlPath.startsWith('/api/auth/')) return await handleAuth(req, res, urlPath, store);
      // Chancen-Radar per Zeitplan (Vercel-Cron zur Börseneröffnung, oder ein externer Dienst wie cron-job.org): ohne Anmeldung,
      // aber mit CRON_SECRET (Vercel schickt „Authorization: Bearer …“, extern geht auch ?key=…). Ohne Geheimnis höchstens alle 10 min neu.
      if (urlPath === '/api/boerse/radar-cron') {
        const secret = serverEnv().CRON_SECRET, q = new URL(req.url, 'http://x').searchParams;
        const ok = secret && (req.headers.authorization === `Bearer ${secret}` || q.get('key') === secret);
        if (secret && !ok) return sendJson(res, 401, { error: 'Nicht erlaubt' });
        const r = ok ? await RADAR.refresh(store) : await RADAR.latest(store, { maxAgeMs: 10 * 60000 });
        return sendJson(res, 200, { ok: true, asOf: r.asOf, picks: r.picks.map((p) => `${p.name} (${p.type})`) });
      }
      // Automatisierungen per Zeitplan (cron-job.org o. Ä. alle 5–15 min, oder Vercel-Cron): fällige Aufgaben aller Konten abarbeiten.
      // Mit CRON_SECRET nur mit „Authorization: Bearer …“ bzw. ?key=…; gestartet wird immer nur, was wirklich fällig ist.
      if (urlPath === '/api/agent-tasks/cron') {
        const secret = serverEnv().CRON_SECRET, q = new URL(req.url, 'http://x').searchParams;
        if (secret && req.headers.authorization !== `Bearer ${secret}` && q.get('key') !== secret) return sendJson(res, 401, { error: 'Nicht erlaubt' });
        return sendJson(res, 200, { ok: true, started: await runAutomations(store) });
      }
      user = await ACC.sessionUser(store, cookiesOf(req).sid);
      if (!user) return sendJson(res, 401, { error: 'Nicht angemeldet', auth: true });
      if (user.renewed) res.setHeader('Set-Cookie', sessionCookie(req, cookiesOf(req).sid, ACC.SESSION_TTL)); // Cookie mit verlängern
    }
    if (req.method === 'POST' && urlPath === '/api/vorschau') { storePreview(await readBody(req, 10 * 1024 * 1024)); return sendJson(res, 200, { ok: true, port: PREVIEW_PORT }); }
    if (req.method === 'POST' && urlPath === '/api/chat') return await handleChat(req, res, user);
    // Aktienchart im Chat (```stock): Verlauf je Zeitraum und der Kurs in Echtzeit zum Nachladen
    if (req.method === 'GET' && urlPath === '/api/boerse/chart') { const q = new URL(req.url, 'http://x').searchParams; return sendJson(res, 200, await BOERSE.chartData(q.get('symbol'), q.get('range') || '6M')); }
    if (req.method === 'GET' && urlPath === '/api/boerse/radar') return sendJson(res, 200, await RADAR.latest(store));
    // „Meine Käufe“: Übersicht mit Kurs, Plus/Minus und Empfehlung (Karte ```bestand und Hinweise) – reine Rechnung; DELETE nimmt einen Wert aus der Liste
    if (urlPath === '/api/boerse/bestand') {
      const q = new URL(req.url, 'http://x').searchParams;
      if (req.method === 'DELETE' && q.get('symbol')) { await HOLD.apply(store, user.id, { remove: [q.get('symbol')] }); return sendJson(res, 200, await HOLD.overview(store, user.id, { maxAgeMs: 0 })); }
      if (req.method === 'GET') return sendJson(res, 200, await HOLD.overview(store, user.id, { maxAgeMs: q.get('fresh') ? 20000 : 120000 }));
      // Hinzufügen aus der Karte: Aktie, Zeitpunkt, Stückzahl – den Kaufkurs sucht die App zu diesem Zeitpunkt (oder der Nutzer gibt ihn an)
      if (req.method === 'POST') {
        const b = await readBody(req, 4000);
        const symbol = String(b.symbol || '').trim();
        if (!/^[\w.^=-]{1,20}$/.test(symbol) || !(+b.qty > 0)) return sendJson(res, 400, { error: 'Aktie und Stückzahl angeben.' });
        let price = +b.price > 0 ? +b.price : null, info = null;
        if (!price) { try { info = await HOLD.priceAt(symbol, b.at); price = info.price; } catch { return sendJson(res, 400, { error: 'Zu diesem Zeitpunkt gibt es keinen Kurs – bitte den Kaufkurs selbst eintragen.' }); } }
        await HOLD.apply(store, user.id, { add: [{ symbol, name: b.name || info?.name, qty: +b.qty, price, date: String(b.at || '').slice(0, 16) }] });
        return sendJson(res, 200, { ...(await HOLD.overview(store, user.id, { maxAgeMs: 0 })), added: { symbol, price, how: info?.how || 'eigener Kurs' } });
      }
    }
    // Aktie suchen (Name, Kürzel, ISIN) – für „Hinzufügen“
    if (req.method === 'GET' && urlPath === '/api/boerse/search') return sendJson(res, 200, await BOERSE.search(new URL(req.url, 'http://x').searchParams.get('q') || ''));
    // Chancen-Übersicht für die Karte im Chat (```chancen): NUR der gespeicherte Radar – hier wird nichts neu gerechnet
    if (req.method === 'GET' && urlPath === '/api/boerse/chancen') return sendJson(res, 200, RADAR.overview(await RADAR.latest(store, { stored: true }).catch(() => null)) || { picks: [] });
    // Planspiel-Börse-Zugang (Einstellungen → Agenten): verschlüsselt im Konto; zurück kommt nur „verbunden als …“, nie das Passwort
    // Planspiel-Zugang gibt es nicht mehr (kein Login beim Spiel): früher gespeicherte, verschlüsselte Zugangsdaten einmal löschen
    if (user && store && !planspielCleaned.has(user.id)) { planspielCleaned.add(user.id); Promise.all(['planspiel', 'planspiel-token', 'planspiel-fail'].map((k) => store.del(`u:${user.id}:${k}`))).catch(() => {}); }
    if (req.method === 'GET' && urlPath === '/api/boerse/quote') return sendJson(res, 200, await BOERSE.quoteNow(new URL(req.url, 'http://x').searchParams.get('symbol')));
    // Aufgaben für die Agenten: Zustand holen / Aufgabe abarbeiten (läuft weiter, auch wenn die App geschlossen wird) / Zustand entfernen
    if (req.method === 'GET' && urlPath === '/api/agent-tasks') return sendJson(res, 200, await AGT.list(store, user.id));
    if (req.method === 'POST' && urlPath === '/api/agent-tasks/run') {
      const b = await readBody(req, 8 * 1024 * 1024);
      return sendJson(res, 200, await AGT.run({ store, uid: user.id, task: b.task || {}, env: readEnv(), prepareBody: (x) => withAgentData(x, user) }));
    }
    // Automatisierungen: speichern/entfernen, auflisten, fällige anstoßen (bei offener App)
    if (urlPath === '/api/agent-tasks/automation' && req.method === 'POST') { const b = await readBody(req, 8 * 1024 * 1024); return sendJson(res, 200, { automation: await AGT.saveAuto(store, user.id, b.task || {}) }); }
    if (urlPath === '/api/agent-tasks/automation' && req.method === 'DELETE') { const b = await readBody(req, 4000); await AGT.removeAuto(store, user.id, String(b.id || '')); return sendJson(res, 200, { ok: true }); }
    if (req.method === 'GET' && urlPath === '/api/agent-tasks/automations') return sendJson(res, 200, await AGT.listAuto(store, user.id));
    if (req.method === 'POST' && urlPath === '/api/agent-tasks/due') {
      const env = readEnv();
      return sendJson(res, 200, { started: await AGT.runDue(store, { uid: user.id, start: (u, task) => AGT.run({ store, uid: u, task, env, prepareBody: (x) => withAgentData(x, user) }) }) });
    }
    if (req.method === 'DELETE' && urlPath === '/api/agent-tasks') { const b = await readBody(req, 8 * 1024 * 1024); await AGT.remove(store, user.id, (b.ids || []).map(String).slice(0, 200)); return sendJson(res, 200, { ok: true }); }
    // Geteilte Workspaces (lib/workspaces.js)
    if (req.method === 'GET' && urlPath === '/api/workspaces') return sendJson(res, 200, await WSP.overview(store, serverEnv(), user.id));
    if (req.method === 'POST' && urlPath.startsWith('/api/workspaces/')) {
      const b = await readBody(req, 8000), act = urlPath.slice('/api/workspaces/'.length);
      const fn = { share: WSP.share, answer: WSP.answer, update: WSP.update, remove: WSP.remove }[act];
      if (fn) return sendJson(res, 200, await fn(store, serverEnv(), user.id, b));
    }
    if (req.method === 'POST' && urlPath === '/api/illustration') return await handleIllustration(req, res);
    // Präsentation bearbeiten: echte Fotos zur Auswahl (Wikimedia Commons, freie Lizenz)
    if (req.method === 'GET' && urlPath === '/api/photos') {
      const q = String(new URL(req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 80);
      if (!q) return sendJson(res, 400, { error: 'Suchbegriff fehlt' });
      const items = await commonsIllustration(q, 12).catch(() => []);
      return sendJson(res, 200, { items: (Array.isArray(items) ? items : [items]).filter(Boolean).slice(0, 12) });
    }
    if (req.method === 'POST' && urlPath === '/api/image-edit') return await handleImageEdit(req, res);
    if (req.method === 'POST' && urlPath === '/api/cover-image') return await handleCoverImage(req, res);
    if (req.method === 'GET' && urlPath === '/api/spotify/config') {
      // Die Client-ID ist kein Geheimnis (PKCE-Anmeldung ohne Secret) – darf an den Browser
      return sendJson(res, 200, { clientId: readEnv().SPOTIFY_CLIENT_ID || '' });
    }
    if (req.method === 'POST' && urlPath === '/api/tts') return await handleTts(req, res);
    if (req.method === 'POST' && urlPath === '/api/title') return await handleTitle(req, res);
    if (req.method === 'POST' && urlPath === '/api/doc-intent') return await handleDocIntent(req, res);
    if (req.method === 'POST' && urlPath === '/api/doc-ai') return await handleDocAi(req, res);
    // Chats, Dokumente, Darstellung, Browser-Speicher: je Konto (lib/accounts.js)
    if (req.method === 'GET' && urlPath === '/api/chats') return sendJson(res, 200, await ACC.loadChats(store, user.id));
    if (req.method === 'PUT' && urlPath === '/api/chats') { await ACC.storeChats(store, user.id, await readBody(req, 80 * 1024 * 1024)); return sendJson(res, 200, { ok: true }); }
    if (req.method === 'GET' && urlPath === '/api/docs') return sendJson(res, 200, await ACC.loadDocs(store, user.id));
    if (req.method === 'PUT' && urlPath === '/api/docs') { await ACC.storeDocs(store, user.id, await readBody(req, 80 * 1024 * 1024)); return sendJson(res, 200, { ok: true }); }
    // Darstellung (Modus, Akzent, Kacheln) – im Konto, damit sie auf jedem Gerät und nach jedem Neustart gleich bleibt
    if (req.method === 'GET' && urlPath === '/api/appearance') return sendJson(res, 200, await ACC.getAppearance(store, user.id));
    if (req.method === 'PUT' && urlPath === '/api/appearance') { await ACC.setAppearance(store, user.id, await readBody(req, 4000)); return sendJson(res, 200, { ok: true }); }
    if (req.method === 'GET' && urlPath === '/api/account/storage') return sendJson(res, 200, { data: await ACC.getStorage(store, user.id) });
    if (req.method === 'PUT' && urlPath === '/api/account/storage') { await ACC.patchStorage(store, user.id, await readBody(req, 4 * 1024 * 1024)); return sendJson(res, 200, { ok: true }); }
    // Notfall-Sicherung aus einem offenen Tab: landet im Konto (löscht nie etwas)
    if (req.method === 'POST' && urlPath === '/api/recovery') { await ACC.addRecovery(store, user.id, await readBody(req, 80 * 1024 * 1024)); return sendJson(res, 200, { ok: true }); }
    if (req.method === 'GET' && urlPath === '/api/icon') return await handleIcon(req, res, new URL(req.url, 'http://x').searchParams);
    if (req.method === 'GET' && urlPath === '/api/status') {
      const env = readEnv();
      const file = readFileEnv(); // für die Einstellungen: welche Schlüssel in .env stehen (nur ja/nein, nie die Werte)
      return sendJson(res, 200, { gemini: !!env.GEMINI_API_KEY, nvidia: !!nvidiaKeyOf(env), model: GEMINI_MODEL, env: Object.fromEntries(DEVICE_KEYS.map((k) => [k, !!file[k]])) });
    }
  } catch (err) {
    if (!res.headersSent) return sendJson(res, err.status || 400, { error: err.message });
    return res.end();
  }

  // Spotify erlaubt als Rücksprung nur 127.0.0.1 – damit Anmeldung und App dieselbe Adresse nutzen, immer dorthin
  if (req.method === 'GET' && (urlPath === '/' || urlPath === '/spotify-callback') && /^localhost(:\d+)?$/i.test(req.headers.host || '')) {
    res.writeHead(302, { Location: `http://127.0.0.1:${PORT}${req.url}` });
    return res.end();
  }
  const name = urlPath === '/' || urlPath === '/spotify-callback' ? 'index.html' : urlPath.replace(/^\/+/, '');
  if (!PUBLIC_FILES.has(name)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(ROOT, name), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// Nur auf diesem PC erreichbar: IPv4 (127.0.0.1) und IPv6 (::1) – „localhost“ kann beides sein
// Auf Vercel startet hier nichts: api/index.js ruft handler() für jede Anfrage auf
if (require.main === module) {
  http.createServer(handler).listen(PORT, HOST, () => console.log(`Läuft auf http://localhost:${PORT}`));
  // Vorschau-Server: liefert nur /vorschau/<chat-id>/… aus dem Speicher
  http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (req.method === 'GET' && p.startsWith('/vorschau/')) return servePreview(res, p);
    res.writeHead(404); res.end('Nicht gefunden');
  }).listen(PREVIEW_PORT, HOST, () => console.log(`Vorschau auf http://localhost:${PREVIEW_PORT}`)).on('error', (e) => console.log(`Vorschau-Port ${PREVIEW_PORT} nicht frei: ${e.message}`));
  http.createServer(handler).listen(PORT, '::1').on('error', () => {}); // ohne IPv6 einfach weglassen
  // am PC läuft der Server dauerhaft: jede Minute nachsehen, ob eine Automatisierung fällig ist
  setInterval(() => { const st = accountStore(); if (st) runAutomations(st).catch(() => {}); }, 60000).unref?.();
}
module.exports = { handler, PUBLIC_FILES };
