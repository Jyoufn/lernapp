// Anbindung der KI-Anbieter (Gemini, NVIDIA) – ohne Abhängigkeiten.
// Nur offiziell unterstützte Parameter:
//  - Gemini 2.5 Flash: generationConfig.thinkingConfig.thinkingBudget (0 = aus, -1 = dynamisch, sonst Tokens),
//    includeThoughts, maxOutputTokens, responseMimeType, tools: [{ google_search: {} }]
//  - Gemini 3.x (Flash-Lite): thinkingConfig.thinkingLevel ('low' | 'medium' | 'high')
//  - NVIDIA: OpenAI-kompatibles /v1/chat/completions

const GEMINI_MODEL = 'gemini-2.5-flash';         // Hauptmodell (gratis, inkl. Google-Suche)
const GEMINI_NEXT = 'gemini-3.5-flash';          // 1. Ersatz (gratis, schnell, eigenes Tageskontingent)
const GEMINI_BACKUP = 'gemini-3.5-flash-lite';   // 2. Ersatz (gratis, ohne Google-Suche)
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

const nvidiaKeyOf = (env) => env.NVIDIA_API_KEY || env.FLUX_API_KEY || env.QWEN_API_KEY || '';

/* Thinking-Konfiguration passend zum Modell. Das Budget ist eine Obergrenze – das Modell denkt nur so lange, wie es selbst für nötig hält. */
function thinkingConfigFor(model, { budget = -1, level = 'medium' } = {}) {
  if (model.startsWith('gemini-2.5')) return { thinkingBudget: budget };
  return { thinkingLevel: level };
}

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [
      ...(m.images || []).map((img) => ({ inline_data: { mime_type: img.mime, data: img.data } })),
      ...(m.text ? [{ text: m.text }] : []),
    ],
  })).filter((c) => c.parts.length);
}

function toOpenAiMessages(system, messages) {
  return [
    { role: 'system', content: system },
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: (m.images || []).some((img) => /^image\//.test(img.mime))
        ? [
          ...(m.text ? [{ type: 'text', text: m.text }] : []),
          ...m.images.filter((img) => /^image\//.test(img.mime)).map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } })),
        ]
        : `${m.text || ''}${(m.images || []).some((img) => img.mime === 'application/pdf') ? '\n[PDF angehängt – dieses Ersatzmodell kann PDFs nicht lesen]' : ''}`,
    })),
  ];
}

/* Gemini, gestreamt. onText bekommt jedes neue Textstück; Grounding-Quellen (Google-Suche) über onSources. */
// onThought: Zusammenfassungen der Gedanken (Gemini) live – werden im Chat als „Thinking“ gezeigt
async function geminiStream({ key, model, system, messages, maxTokens, thinking, search, signal, onText, onSources, onThought }) {
  const body = {
    contents: toGeminiContents(messages),
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
      contents: [{ role: 'user', parts: [...files.map((f) => ({ inline_data: { mime_type: f.mime, data: f.data } })), { text: user }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: thinkingConfigFor(model, thinking), ...(json ? { responseMimeType: 'application/json' } : {}) },
    }),
    signal,
  });
  if (!response.ok) throw await upstreamError(response);
  const j = await response.json();
  return (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
}

/* NVIDIA, gestreamt oder am Stück. Die Gedanken (reasoning_content) gehen an onThought, sonst werden sie verworfen. */
async function nvidiaChat({ key, model = NVIDIA_TEXT_MODEL, system, messages, maxTokens = 4096, stream = false, signal, onText, onThought }) {
  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(stream ? { Accept: 'text/event-stream' } : {}) },
    body: JSON.stringify({ model, messages: toOpenAiMessages(system, messages), max_tokens: maxTokens, stream }),
    signal,
  });
  if (!response.ok) throw await upstreamError(response);
  if (!stream) return String((await response.json()).choices?.[0]?.message?.content || '').trim();
  let text = '';
  await readUpstreamSse(response, (chunk) => {
    const delta = chunk.choices?.[0]?.delta || {};
    const thought = delta.reasoning_content || delta.reasoning;
    if (thought) onThought?.(thought);
    if (delta.content) { text += delta.content; onText?.(delta.content); }
  });
  return text;
}

/* Kurze Hilfsaufgabe über NVIDIA (kein Tageslimit) */
function nvidiaComplete(key, system, user, signal, maxTokens = 2048) {
  return nvidiaChat({ key, system, messages: [{ role: 'user', text: user }], maxTokens, signal });
}

/* JSON aus einer Modellantwort holen (auch wenn Text drumherum steht) */
function parseJsonLoose(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Kein JSON');
  return JSON.parse(s.slice(start, end + 1));
}

/* Kleine JSON-Aufgabe: standardmäßig erst NVIDIA (spart Gemini-Kontingent), sonst Gemini Flash-Lite.
   prefer: 'gemini' dreht die Reihenfolge um – für Aufgaben, bei denen die Wartezeit zählt (Planung vor der Antwort). */
async function smallJsonTask(env, { system, user, maxTokens = 3000, timeoutMs = 30000, signal, prefer = 'nvidia' }) {
  const nvKey = nvidiaKeyOf(env);
  const viaNvidia = async () => parseJsonLoose(await nvidiaComplete(nvKey, system, user, withTimeout(signal, timeoutMs), maxTokens));
  const viaGemini = async () => parseJsonLoose(await geminiOnce({
    key: env.GEMINI_API_KEY, model: GEMINI_BACKUP, system, user, maxTokens, thinking: { level: 'low' }, json: true, signal: withTimeout(signal, timeoutMs),
  }));
  const order = [nvKey && viaNvidia, env.GEMINI_API_KEY && viaGemini].filter(Boolean);
  if (prefer === 'gemini') order.reverse();
  if (!order.length) throw new ProviderError(0, 'Kein API-Key verfügbar');
  let lastErr = null;
  for (const task of order) {
    try { return await task(); } catch (err) { if (signal?.aborted) throw err; lastErr = err; }
  }
  throw lastErr;
}

module.exports = {
  GEMINI_MODEL, GEMINI_NEXT, GEMINI_BACKUP, noteLimit, limitResetAt, NVIDIA_TEXT_MODEL, NVIDIA_VISION_MODEL, RETRYABLE,
  ProviderError, upstreamError, withTimeout, readUpstreamSse, nvidiaKeyOf, thinkingConfigFor,
  toGeminiContents, geminiStream, geminiOnce, nvidiaChat, nvidiaComplete, parseJsonLoose, smallJsonTask,
};
