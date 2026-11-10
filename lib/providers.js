// Anbindung der KI-Anbieter (Gemini, NVIDIA) – ohne Abhängigkeiten.
// Nur offiziell unterstützte Parameter:
//  - Gemini 2.5 Flash: generationConfig.thinkingConfig.thinkingBudget (0 = aus, -1 = dynamisch, sonst Tokens),
//    includeThoughts, maxOutputTokens, responseMimeType, tools: [{ google_search: {} }]
//  - Gemini 3.x (Flash-Lite): thinkingConfig.thinkingLevel ('low' | 'medium' | 'high')
//  - NVIDIA: OpenAI-kompatibles /v1/chat/completions

const GEMINI_MODEL = 'gemini-2.5-flash';         // Hauptmodell (gratis, inkl. Google-Suche)
const GEMINI_NEXT = 'gemini-3.5-flash';          // 1. Ersatz (gratis, schnell, eigenes Tageskontingent)
const GEMINI_BACKUP = 'gemini-3.5-flash-lite';   // 2. Ersatz (gratis, ohne Google-Suche)
/* ---------- Modell-Leiter (kb/ki.md „Modelle“) ----------
   Immer das BESTE Modell, das der Schlüssel wirklich nutzen kann und das gerade nicht am Limit ist; bei Limit (429) oder
   „gibt es nicht“ (404) automatisch das nächste. Verfügbare Modelle fragt der Server bei Google ab (6 h gemerkt).
   Klappt die Abfrage nicht (z. B. Tests ohne Netz), gilt die bewährte Reihenfolge KNOWN_TEXT. */
// Gratis-Schlüssel: jedes 3.x-Flash-Modell hat ein EIGENES Tageskontingent (20 Anfragen) → je mehr gute Modelle in der Leiter, desto
// länger antwortet ein starkes Modell; „gemini-3-flash“ ist bei Google nur als „-preview“ gelistet (wird automatisch zugeordnet)
const TEXT_LADDER = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash', 'gemini-2.5-flash',
  'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
// kleine Hilfsaufgaben (Planung, Bewertung, Übersetzen der Gedanken): die Lite-Modelle mit viel Tageskontingent, verteilt
// 3.5 Flash-Lite zuerst: in Messungen (31.10.) meist < 1 s, 3.1 Flash-Lite oft 4–10 s oder überlastet (503) – Einschätzung und Gedanken warten darauf
const LITE_LADDER = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash'];
// ohne Modell-Liste (selten): bekannte Modelle; ist 2.5 Flash für den Schlüssel abgeschaltet („no longer available to new users“, 03.11.),
// merkt `markLimited` das 30 Tage lang und die Leiter lässt es weg
const KNOWN_TEXT = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const KNOWN_LITE = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash'];
const SEARCH_MODELS = /^gemini-2\.5-flash/; // kostenlose Google-Suche (Grounding) hängt an 2.5 Flash / Flash-Lite
let modelList = null, modelListAt = 0, modelListKey = '';
async function availableModels(key) {
  if (!key) return null;
  if (modelList && modelListKey === key && Date.now() - modelListAt < 6 * 3600 * 1000) return modelList;
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = await r.json();
    modelList = new Set((j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => String(m.name).replace(/^models\//, '')));
    modelListAt = Date.now(); modelListKey = key;
    return modelList;
  } catch { return null; }
}
// Mehrere Schlüssel je Anbieter (in den Einstellungen untereinander eingetragen) → Liste; gesperrt wird je Modell UND Schlüssel
const keysOf = (env, id) => [...new Set(String(env?.[id] || '').split(/[\s,;]+/).map((k) => k.trim()).filter((k) => k.length > 10))];
const kTag = (key) => String(key || '').slice(-8);
const modelCooldown = new Map(); // „Modell|Schlüssel“ → gesperrt bis
const resetLimits = () => modelCooldown.clear(); // Tests
/* Limits über alle Server-Instanzen teilen (Vercel startet viele): gespeichert im Konto-Speicher (Redis) unter „ai:limits“.
   So probiert eine neue Instanz ein Modell am Tageslimit nicht erneut, und sobald Google zurücksetzt, ist das bessere Modell sofort wieder dran. */
let limitStore = null, limitsLoadedAt = 0;
const useLimitStore = (store) => { limitStore = store; };
async function syncLimits() {
  if (!limitStore || Date.now() - limitsLoadedAt < 20000) return;
  limitsLoadedAt = Date.now();
  try { const o = JSON.parse((await limitStore.get('ai:limits')) || '{}'); for (const [k, until] of Object.entries(o)) if (until > Date.now() && until > (modelCooldown.get(k) || 0)) modelCooldown.set(k, until); } catch {}
}
function saveLimits() {
  if (!limitStore) return;
  const live = Object.fromEntries([...modelCooldown].filter(([, u]) => u > Date.now()));
  limitStore.set('ai:limits', JSON.stringify(live), 2 * 86400).catch?.(() => {});
}
// Limit erreicht: Tageslimit → bis Mitternacht (Pazifikzeit, dann setzt Google zurück), sonst kurz; 404 → einen Tag
// Modell für diesen Schlüssel abgeschaltet („no longer available to new users“, „not found“, „deprecated“) → 30 Tage gar nicht mehr probieren
const GONE = /no longer available|not found for api version|is not found|not supported for generatecontent|has been deprecated|was (shut ?down|retired)|is not available to new users/i;
const GONE_MS = 30 * 24 * 3600 * 1000;
function markLimited(model, err, key = '') {
  if (!model || !err) return;
  const msg = String(err.message || '');
  let until = 0;
  if ([400, 403, 404].includes(err.status) && GONE.test(msg)) until = Date.now() + GONE_MS;
  else if (err.status === 404) until = Date.now() + 24 * 3600 * 1000;
  else if (err.status === 429) until = /per.?day|daily|PerDay/i.test(msg) ? limitResetAt() : Date.now() + 90 * 1000;
  else if (err.status === 503) until = Date.now() + 60 * 1000; // überlastet: eine Minute überspringen (sonst kostet jede Hilfsaufgabe erst einen vergeblichen Versuch)
  if (until) { modelCooldown.set(`${model}|${kTag(key)}`, until); saveLimits(); }
}
const coolKey = (model, key) => (modelCooldown.get(`${model}|${kTag(key)}`) || 0) > Date.now();
const goneKey = (model, key) => (modelCooldown.get(`${model}|${kTag(key)}`) || 0) > Date.now() + 7 * 24 * 3600 * 1000;
const isGone = (model) => lastGeminiKeys.every((k) => goneKey(model, k));
// Modell gilt als gesperrt, wenn es bei ALLEN Gemini-Schlüsseln am Limit ist
let lastGeminiKeys = [''];
const isCooling = (model, key) => (key != null ? coolKey(model, key) : lastGeminiKeys.every((k) => coolKey(model, k)));
// freier Schlüssel für dieses Modell (sonst der erste)
const geminiKey = (env, model) => { const ks = keysOf(env, 'GEMINI_API_KEY'); return ks.find((k) => !coolKey(model, k)) || ks[0] || ''; };
// Leiter → konkrete Modell-IDs (auch „…-preview“, wenn nur die Vorschau-Version verfügbar ist), ohne gesperrte
async function ladder(env, kind = 'text') {
  await syncLimits();
  const ks = keysOf(env, 'GEMINI_API_KEY'); lastGeminiKeys = ks.length ? ks : [''];
  let names = null;
  for (const k of ks.slice(0, 3)) { names = await availableModels(k); if (names) break; } // erster Schlüssel ungültig → der nächste liefert die Liste
  let list = !names ? (kind === 'lite' ? KNOWN_LITE : KNOWN_TEXT)
    : (kind === 'lite' ? LITE_LADDER : TEXT_LADDER).map((m) => (names.has(m) ? m : [...names].find((n) => n === `${m}-preview` || n.startsWith(`${m}-preview-`)))).filter(Boolean);
  if (!list.length) list = kind === 'lite' ? KNOWN_LITE : KNOWN_TEXT;
  // abgeschaltete Modelle (bei allen Schlüsseln) nie mehr; sonst: gesperrte überspringen – sind alle gesperrt, trotzdem probieren (Limit evtl. zurückgesetzt)
  const alive = list.filter((m) => !isGone(m));
  const free = alive.filter((m) => !isCooling(m));
  return free.length ? free : alive.length ? alive : list;
}
const modelName = (m) => m.replace(/^gemini-/, 'Gemini ').replace(/-flash-lite/, ' Flash-Lite').replace(/-flash/, ' Flash').replace(/-preview.*$/, ' (Vorschau)');

const NVIDIA_TEXT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';
const NVIDIA_VISION_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';
const RETRYABLE = [429, 500, 503]; // Limit/Überlastung → nächstes Modell probieren

class ProviderError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* Kontingent erschöpft (HTTP 429): Google nennt in RetryInfo, wann es weitergeht (Tageslimit: bis Mitternacht Pazifikzeit).
   limitResetAt() = frühester bekannter Zeitpunkt, ab dem wieder etwas geht – für den Hinweis „wieder verfügbar ab …“ */
let limitUntil = 0;
function noteLimit(body) {
  const d = (body?.error?.details || []).find((x) => /RetryInfo/.test(x['@type'] || ''))?.retryDelay;
  const ms = d ? parseFloat(d) * 1000 : 0;
  if (ms > 60000) limitUntil = Math.max(limitUntil, Date.now() + ms);
}
// Nächste Mitternacht in Kalifornien (dann setzt Google die Gratis-Tageslimits zurück) – falls keine Angabe kam
function nextPacificMidnight(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date(now)).map((p) => [p.type, Number(p.value)]));
  return now + ((24 - parts.hour) * 3600 - parts.minute * 60 - parts.second) * 1000;
}
const limitResetAt = () => (limitUntil > Date.now() ? limitUntil : nextPacificMidnight());

async function upstreamError(response) {
  let detail = '';
  try {
    const j = await response.json();
    if (response.status === 429) noteLimit(j);
    detail = j.error?.message || j.detail || j.message || JSON.stringify(j).slice(0, 300);
    // Gemini nennt die Art des Limits nur in den Details (z. B. „GenerateRequestsPerDayPerProjectPerModel-FreeTier“) – für die Modell-Leiter mitnehmen
    const quota = (j.error?.details || []).flatMap((d) => (d.violations || []).map((v) => v.quotaId)).filter(Boolean);
    if (quota.length) detail += ` [${quota.join(', ')}]`;
  } catch {}
  return new ProviderError(response.status, detail || `HTTP ${response.status}`);
}

/* Abbruch durch den Nutzer UND Zeitlimit kombinieren */
function withTimeout(signal, ms) {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/* Liest einen SSE-Stream eines Anbieters und ruft onData für jedes "data:" auf */
async function readUpstreamSse(response, onData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (data && data !== '[DONE]') {
        try { onData(JSON.parse(data)); } catch {}
      }
    }
  }
}

const nvidiaKeyOf = (env) => keysOf(env, 'NVIDIA_API_KEY')[0] || env.FLUX_API_KEY || env.QWEN_API_KEY || '';

/* Thinking-Konfiguration passend zum Modell. Das Budget ist eine Obergrenze – das Modell denkt nur so lange, wie es selbst für nötig hält. */
function thinkingConfigFor(model, { budget = -1, level = 'medium' } = {}) {
  if (model.startsWith('gemini-2.5')) return { thinkingBudget: budget };
  return level ? { thinkingLevel: level } : {}; // ohne Stufe: Standard von Gemini 3 (dynamisch – denkt so viel wie nötig)
}

/* Eine angehängte Datei als Gemini-Teile: Namensschild (damit die KI jede Quelle einzeln erkennt und nennt) + Inhalt.
   mime 'text/plain' = PDF, das nicht mehr als Datei in die Anfrage passte → nur sein gelesener Text */
// Lupe (app.js `photoTiles`): vergrößerte Ausschnitte DESSELBEN Fotos – Gemini 2.5 sieht ein ganzes Foto nur mit ~768 px,
// kleine Schrift (Buchseiten, Arbeitsblätter) wird erst in den Ausschnitten lesbar. Sie gehören zur Datei, sind keine eigenen Dateien.
// Dateien bei Google (Files API, /api/upload): lesbar nur mit dem Schlüssel, mit dem sie hochgeladen wurden (gleiches Projekt) – fk = dessen Ende
const keyTag = (key) => String(key || '').slice(-6);
function fileParts(img, i = 0, key = '') {
  const label = { text: `[Datei ${i + 1}${img.name ? `: ${String(img.name).slice(0, 120)}` : ''}]` };
  if (img.mime === 'text/plain') return [label, { text: String(img.text || '').slice(0, 600000) || '(kein lesbarer Text)' }];
  const handHint = img.mime === 'application/pdf' && img.hand ? [{ text: `[Datei ${i + 1}: Seite ${String(img.hand).slice(0, 80)} ${/[,–]/.test(img.hand) ? 'sind' : 'ist'} handschriftlich bzw. gescannt – lies diese Seiten direkt im PDF, Wort für Wort (unsichere Wörter mit [?]); sie gehören vollständig zum Inhalt.]` }] : [];
  if (img.gfile && typeof img.gfile === 'string' && /^https:\/\/generativelanguage\.googleapis\.com\//.test(img.gfile)) {
    if (key && img.fk === keyTag(key)) return [label, { file_data: { mime_type: img.mime, file_uri: img.gfile } }, ...handHint];
    if (!img.data) return [label, { text: img.mime === 'application/pdf' && img.text ? String(img.text).slice(0, 600000) : '(Diese Seite liegt bei einem anderen Gemini-Schlüssel und ist gerade nicht lesbar.)' }];
  }
  if (!img.data) return [label, { text: String(img.text || '(Datei nicht verfügbar)').slice(0, 600000) }];
  const tiles = (Array.isArray(img.tiles) ? img.tiles : []).filter((t) => t && /^image\//.test(t.mime) && t.data).slice(0, 6);
  // PDF mit Handschrift/Scan-Seiten: Gemini liest sie direkt im PDF – der Hinweis sorgt dafür, dass es sie Wort für Wort entziffert statt sie zu überspringen
  return [label, { inline_data: { mime_type: img.mime, data: img.data } }, ...handHint,
    ...(tiles.length ? [{ text: `[Lupe zu Datei ${i + 1}: ${tiles.length} vergrößerte Ausschnitte desselben Fotos (${tiles.map((t) => t.pos || '').filter(Boolean).join(', ') || 'Teilbereiche'}) – nur zum genauen Lesen, keine weiteren Dateien]` },
      ...tiles.map((t) => ({ inline_data: { mime_type: t.mime, data: t.data } }))] : [])];
}
function toGeminiContents(messages, key = '') {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [
      ...(m.images || []).flatMap((img, i) => fileParts(img, i, key)),
      ...(m.text ? [{ text: m.text }] : []),
    ],
  })).filter((c) => c.parts.length);
}

// Ersatzmodelle (MiniMax/DeepSeek/Kimi über NVIDIA) lesen keine PDFs: PDFs gehen als ihr gelesener Text mit (in der App ausgelesen),
// Fotos nur bei vision = true als Bild, sonst ein ehrlicher Hinweis
function toOpenAiMessages(system, messages, vision = false) {
  const fileText = (img, i) => {
    const head = `[Datei ${i + 1}${img.name ? `: ${img.name}` : ''}]`;
    if (/^image\//.test(img.mime)) return `${head} (Foto – dieses Ersatzmodell kann Bilder nicht sehen)`;
    return img.text ? `${head}\n${String(img.text).slice(0, 200000)}` : `${head} (PDF ohne lesbaren Text – dieses Ersatzmodell kann es nicht öffnen)`;
  };
  return [
    { role: 'system', content: system },
    ...messages.map((m) => {
      const files = m.images || [];
      const docs = files.map((img, i) => (vision && /^image\//.test(img.mime) ? '' : fileText(img, i))).filter(Boolean).join('\n\n');
      const text = [docs, m.text || ''].filter(Boolean).join('\n\n');
      const pics = vision ? files.filter((img) => /^image\//.test(img.mime)) : [];
      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: pics.length ? [{ type: 'text', text }, ...pics.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } }))] : text,
      };
    }),
  ];
}

/* Gemini, gestreamt. onText bekommt jedes neue Textstück; Grounding-Quellen (Google-Suche) über onSources. */
// onThought: Zusammenfassungen der Gedanken (Gemini) live – werden im Chat als „Thinking“ gezeigt
async function geminiStream({ key, model, system, messages, maxTokens, thinking, search, signal, onText, onSources, onThought }) {
  const body = {
    contents: toGeminiContents(messages, key),
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { ...thinkingConfigFor(model, thinking), ...(onThought ? { includeThoughts: true } : {}) } },
    ...(search ? { tools: [{ google_search: {} }] } : {}),
  };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal,
  });
  if (!response.ok) throw await upstreamError(response);
  let text = '';
  let finishReason = null;
  // Google-Suche: nur Quellen melden, auf die sich die Antwort wirklich stützt (groundingSupports → Chunk-Nummern);
  // Treffer, die das Modell zwar gefunden, aber nicht benutzt hat, bleiben weg
  const chunks = [], usedIdx = new Set();
  let sentKey = '';
  const report = () => {
    const used = chunks.filter((c, i) => c && usedIdx.has(i));
    const key = used.map((c) => c.uri).join('|');
    if (!used.length || key === sentKey) return;
    sentKey = key;
    onSources?.(used);
  };
  await readUpstreamSse(response, (chunk) => {
    const cand = chunk.candidates?.[0];
    if (!cand) return;
    for (const part of cand.content?.parts || []) {
      if (part.thought) { if (part.text) onThought?.(part.text); continue; }
      if (!part.text) continue;
      text += part.text;
      onText?.(part.text);
    }
    const gm = cand.groundingMetadata;
    if (gm) {
      (gm.groundingChunks || []).forEach((c, i) => { if (c.web?.uri) chunks[i] = { uri: c.web.uri, title: c.web.title || '' }; });
      (gm.groundingSupports || []).forEach((sp) => (sp.groundingChunkIndices || []).forEach((i) => usedIdx.add(i)));
      report();
    }
    if (cand.finishReason) finishReason = cand.finishReason;
  });
  return { text, finishReason };
}

/* Gemini, eine Antwort am Stück (für JSON-Aufgaben wie Analyse oder Prüfung) */
async function geminiOnce({ key, model, system, user, maxTokens = 4096, thinking, json = false, signal, files = [] }) { // files: [{ mime, data }] (Bilder, PDFs)
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [...files.flatMap((f, i) => fileParts(f, i, key)), { text: user }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: thinkingConfigFor(model, thinking), ...(json ? { responseMimeType: 'application/json' } : {}) },
    }),
    signal,
  });
  if (!response.ok) throw await upstreamError(response);
  const j = await response.json();
  return (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
}

/* Datei zu Google hochladen (Files API, 48 h gültig): große PDFs und Seitenbilder gehen so NICHT mehr durch die Anfrage (Vercel ≤ 4,5 MB) –
   die Anfrage enthält nur noch den Verweis, Gemini sieht trotzdem jede Seite in voller Qualität. */
async function geminiUpload(key, { mime, data, name = 'Datei' }, signal) {
  const base = 'https://generativelanguage.googleapis.com';
  const start = await fetch(`${base}/upload/v1beta/files`, {
    method: 'POST', signal,
    headers: { 'x-goog-api-key': key, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(data.length), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: { display_name: String(name).slice(0, 120) } }),
  });
  if (!start.ok) throw await upstreamError(start);
  const url = start.headers.get('x-goog-upload-url');
  if (!url) throw new ProviderError(502, 'Kein Upload-Link von Google');
  const up = await fetch(url, { method: 'POST', signal, headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: data });
  if (!up.ok) throw await upstreamError(up);
  let f = (await up.json()).file || {};
  for (let n = 0; f.state === 'PROCESSING' && n < 20; n++) { // PDFs: kurz warten, bis Google sie verarbeitet hat
    await new Promise((ok) => setTimeout(ok, 800));
    const r = await fetch(`${base}/v1beta/${f.name}`, { headers: { 'x-goog-api-key': key }, signal });
    if (r.ok) f = await r.json();
  }
  if (!f.uri || f.state === 'FAILED') throw new ProviderError(502, 'Google konnte die Datei nicht verarbeiten');
  return { uri: f.uri, mime: f.mimeType || mime, exp: Date.parse(f.expirationTime) || Date.now() + 47 * 3600 * 1000, fk: keyTag(key) };
}

/* NVIDIA, gestreamt oder am Stück. Die Gedanken (reasoning_content) gehen an onThought, sonst werden sie verworfen. */
/* OpenAI-kompatible Anbieter – alle über NVIDIA (build.nvidia.com, kostenlos): MiniMax, DeepSeek, Kimi. Gedanken kommen als reasoning/reasoning_content.
   Groq und OpenRouter sind raus (06.11.). */
const NV_BASE = 'https://integrate.api.nvidia.com/v1';
const OPENAI_BASES = { nvidia: NV_BASE, minimax: NV_BASE, deepseek: NV_BASE, kimi: NV_BASE };
const VISION_PROVIDERS = new Set(['nvidia', 'minimax', 'deepseek', 'kimi']); // DeepSeek V4.1 und Kimi K3.x sehen Bilder
// think: false = ohne Nachdenken (schnell, z. B. „Moin“), 'low' = kurz, 'auto' = so viel wie nötig, true = voll
// 'max' = höchste Stufe, die der Anbieter kennt (Aufwand Max). Neue Anbieter: hier ihre Denk-Parameter eintragen – die Stufen kommen überall gleich an.
function thinkExtra(provider, think) {
  if (think === undefined) return {};
  const max = think === 'max';
  if (max) think = true;
  if (provider === 'nvidia') return { chat_template_kwargs: { enable_thinking: think !== false, ...(think === 'low' ? { low_effort: true } : {}) } };
  // DeepSeek V4.1 (NVIDIA): Denken steuert man NUR über chat_template_kwargs – thinking an/aus + reasoning_effort low (25) · high (50, Standard) ·
  // xhigh (75) · max (100). „medium“ gibt es nicht: damit lief die Anfrage ohne Denken (keine Gedanken in der Zeitleiste, Stand 10.11.).
  if (provider === 'deepseek') return { chat_template_kwargs: think === false ? { thinking: false }
    : { thinking: true, reasoning_effort: think === 'low' ? 'low' : think === 'auto' ? 'high' : max ? 'max' : 'xhigh' } };
  if (provider === 'kimi') return { reasoning_effort: think === false || think === 'low' ? 'low' : 'high' }; // Kimi denkt immer – nur wie lange
  return {}; // MiniMax: denkt von selbst, keine Zusatz-Parameter
}
async function openaiChat({ provider = 'nvidia', key, model, system, messages, maxTokens = 4096, stream = false, signal, onText, onThought, think }) {
  const send = (extra) => fetch(`${OPENAI_BASES[provider] || NV_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(stream ? { Accept: 'text/event-stream' } : {}) },
    body: JSON.stringify({ model, messages: toOpenAiMessages(system, messages, VISION_PROVIDERS.has(provider)), max_tokens: maxTokens, stream, ...extra }),
    signal,
  });
  const extra = thinkExtra(provider, think);
  let response = await send(extra);
  // Denk-Parameter kennt das Modell nicht (HTTP 400/422) → einmal ohne sie
  // (DeepSeek: erst die Stufe weglassen, das Denken selbst bleibt an – sonst gäbe es wieder keine Gedanken)
  if (!response.ok && [400, 422].includes(response.status) && provider === 'deepseek' && extra.chat_template_kwargs?.reasoning_effort) response = await send({ chat_template_kwargs: { thinking: true } });
  if (!response.ok && [400, 422].includes(response.status) && Object.keys(extra).length) response = await send({});
  if (!response.ok) throw await upstreamError(response);
  // ohne Stream: Gedanken im Text entfernen – auch wenn nur das schließende </think> kommt (DeepSeek/Kimi beginnen manchmal ohne <think>)
  if (!stream) return String((await response.json()).choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').replace(/<think>[\s\S]*$/, '').trim();
  let text = '', inThink = false;
  // Manche Modelle (DeepSeek, Kimi, MiniMax) denken im Text OHNE öffnendes <think> und schließen nur mit </think> – ohne Puffer landete das lange
  // Nachdenken in der Antwort (Wunsch 10.11.: „mit DeepSeek läuft das nicht gut“). Darum den Anfang kurz halten, bis klar ist, ob ein </think> kommt.
  let pre = think !== false && !['nvidia'].includes(provider) ? '' : null, sawReasoning = false;
  const releasePre = () => { if (pre === null) return; const c = pre; pre = null; if (c) { text += c; onText?.(c); } };
  await readUpstreamSse(response, (chunk) => {
    const delta = chunk.choices?.[0]?.delta || {};
    const thought = delta.reasoning_content || delta.reasoning;
    if (thought) { sawReasoning = true; onThought?.(thought); }
    let c = delta.content || '';
    if (pre !== null && c) {
      if (sawReasoning && !pre && !/<\/?think>/.test(c)) { pre = null; } // Gedanken kommen sauber getrennt → kein Puffer nötig
      else {
        pre += c; c = '';
        const close = pre.indexOf('</think>'), open = pre.indexOf('<think>');
        if (close >= 0 && (open < 0 || open > close)) { onThought?.(pre.slice(0, close)); c = pre.slice(close + 8).replace(/^\s+/, ''); pre = null; }
        else if (open >= 0 || pre.length > 2400) { c = pre; pre = null; }
        else return;
      }
    }
    // manche Modelle schreiben ihre Gedanken als <think>…</think> in den Text → als Gedanken behandeln
    while (c) {
      if (inThink) { const e = c.indexOf('</think>'); if (e < 0) { onThought?.(c); c = ''; } else { onThought?.(c.slice(0, e)); c = c.slice(e + 8); inThink = false; } }
      else { const b = c.indexOf('<think>'); if (b < 0) { text += c; onText?.(c); c = ''; } else { if (b) { text += c.slice(0, b); onText?.(c.slice(0, b)); } c = c.slice(b + 7); inThink = true; } }
    }
  });
  releasePre(); // kurze Antwort ohne </think> → ganz normal als Text
  return text;
}
const nvidiaChat = ({ model = NVIDIA_TEXT_MODEL, ...o }) => openaiChat({ provider: 'nvidia', model, ...o });
// Gratis-Modelle über NVIDIA (build.nvidia.com, ein Schlüssel für alle; bestes zuerst, bei 404/Limit das nächste):
// MiniMax M3.1 Flash (Coden, Mini-Apps) · DeepSeek V4.1 Flash. Beide denken mit und sehen Bilder. (Kimi entfernt 10.11.)
const MINIMAX_MODELS = ['minimaxai/minimax-m3.1-flash'];
const DEEPSEEK_MODELS = ['deepseek-ai/deepseek-v4.1-flash'];
const KIMI_MODELS = []; // entfernt (Wunsch 10.11.)
const FAMILY_MODELS = { minimax: MINIMAX_MODELS, deepseek: DEEPSEEK_MODELS };
const FAMILY_LABELS = { gemini: 'Gemini', minimax: 'MiniMax', deepseek: 'DeepSeek' };

/* Kurze Hilfsaufgabe über NVIDIA (kein Tageslimit) */
function nvidiaComplete(key, system, user, signal, maxTokens = 2048) {
  return nvidiaChat({ key, system, messages: [{ role: 'user', text: user }], maxTokens, signal, think: false }); // Hilfsaufgabe: ohne langes Nachdenken (schnell)
}

/* JSON aus einer Modellantwort holen (auch wenn Text drumherum steht) */
function parseJsonLoose(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Kein JSON');
  return JSON.parse(s.slice(start, end + 1));
}

/* ---------- Anbieter-Phasen (kb/ki.md „Modelle“) ----------
   Eine Anfrage läuft KOMPLETT bei einem Anbieter: Haupt-KI zuerst (Standard Gemini), ist sie aufgebraucht der nächste
   (MiniMax → DeepSeek, beide über NVIDIA). Kein Mischen (Planung, Gedanken, Bewertung, Antwort beim selben Anbieter). Kein Nemotron. */
const FAMILIES = ['gemini', 'minimax', 'deepseek']; // Kimi K3.1 Pro entfernt (Wunsch 10.11.) – alte Wahl „kimi“ → Gemini
// Reihenfolge laut Einstellungen → Verbindung: die Haupt-KI zuerst (Standard Gemini; gilt für alles, auch Coden), danach die anderen
// in der festen Reihenfolge – außer denen, die der Nutzer als Ersatz abgeschaltet hat (AI_OFF)
const familiesFor = (env) => {
  const main = FAMILIES.includes(env?.AI_ORDER) ? env.AI_ORDER : 'gemini';
  const off = new Set(String(env?.AI_OFF || '').split(',').map((x) => x.trim()).filter(Boolean));
  return [main, ...FAMILIES.filter((f) => f !== main && !off.has(f))];
};
// NVIDIA-Anbieter: eigener Schlüssel zuerst, sonst ein anderer aus den Einstellungen (gleicher Zugang build.nvidia.com).
// Der alte Server-Schlüssel NVIDIA_API_KEY zählt bewusst nicht (war nur Nemotron/Bilder).
const NV_KEY_NAMES = ['MINIMAX_API_KEY', 'DEEPSEEK_API_KEY', 'KIMI_API_KEY', 'MISTRAL_API_KEY', 'FLUX3_API_KEY']; // alter Kimi-Schlüssel bleibt als NVIDIA-Schlüssel nutzbar
const OWN_KEY = { minimax: 'MINIMAX_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
const familyKeys = (env, f) => {
  if (f === 'gemini') return keysOf(env, 'GEMINI_API_KEY');
  if (!OWN_KEY[f]) return [];
  for (const k of [OWN_KEY[f], ...NV_KEY_NAMES.filter((n) => n !== OWN_KEY[f])]) { const ks = keysOf(env, k); if (ks.length) return ks; }
  return [];
};
async function familyFor(env) {
  if (env?.__family) return env.__family;
  const order = familiesFor(env);
  for (const f of order) {
    const ks = familyKeys(env, f); if (!ks.length) continue;
    const models = f === 'gemini' ? await ladder(env, 'text') : FAMILY_MODELS[f] || [];
    if (models.some((m) => ks.some((k) => !coolKey(m, k)))) return f;
  }
  return order.find((f) => familyKeys(env, f).length) || 'gemini';
}
// kurze Text-/JSON-Aufgabe beim Anbieter dieser Anfrage (Modelle × Schlüssel durchprobieren, Limits merken)
// strong: das beste Modell statt Lite (z. B. Mini-App reparieren) – Gemini mit Denken, sonst wie gehabt
async function textTask(env, { system, user, maxTokens = 3000, timeoutMs = 30000, signal, json = false, strong = false }) {
  const f = await familyFor(env);
  const ks = familyKeys(env, f);
  if (!ks.length) throw new ProviderError(0, 'Kein API-Key verfügbar');
  const models = f === 'gemini' ? await ladder(env, strong ? 'text' : 'lite') : FAMILY_MODELS[f] || [];
  let last = null;
  const pairs = models.flatMap((m) => ks.map((k) => [m, k]));
  const free = pairs.filter(([m, k]) => !coolKey(m, k));
  for (const [model, key] of (free.length ? free : pairs).slice(0, 6)) { // alles am Limit → trotzdem kurz probieren (evtl. schon zurückgesetzt)
    try {
      if (f === 'gemini') return await geminiOnce({ key, model, system, user, maxTokens, thinking: strong ? {} : model.startsWith('gemini-2.5') ? { budget: 0 } : { level: 'low' }, json, signal: withTimeout(signal, timeoutMs) });
      return await openaiChat({ provider: f, key, model, system, messages: [{ role: 'user', text: user }], maxTokens, signal: withTimeout(signal, timeoutMs), think: strong ? true : false });
    } catch (err) { if (signal?.aborted) throw err; last = err; markLimited(model, err, key); if (![400, 404, 429, 500, 502, 503].includes(err.status)) throw err; }
  }
  throw last || new ProviderError(429, 'Alle Modelle am Limit');
}
const smallJsonTask = async (env, o) => parseJsonLoose(await textTask(env, { ...o, json: true }));

module.exports = {
  GEMINI_MODEL, GEMINI_NEXT, GEMINI_BACKUP, ladder, markLimited, isCooling, isGone, GONE, modelName, SEARCH_MODELS, availableModels, noteLimit, limitResetAt, NVIDIA_TEXT_MODEL, NVIDIA_VISION_MODEL, RETRYABLE,
  keysOf, geminiKey, resetLimits, useLimitStore, familyFor, familiesFor, familyKeys, MINIMAX_MODELS, DEEPSEEK_MODELS, KIMI_MODELS, FAMILY_MODELS, FAMILY_LABELS, textTask, FAMILIES, openaiChat, ProviderError, upstreamError, withTimeout, readUpstreamSse, nvidiaKeyOf, thinkingConfigFor, thinkExtra,
  toGeminiContents, geminiStream, geminiOnce, geminiUpload, keyTag, nvidiaChat, nvidiaComplete, parseJsonLoose, smallJsonTask,
};
