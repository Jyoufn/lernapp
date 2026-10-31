// Test-Hilfen: simuliertes fetch für Gemini, NVIDIA, Wikipedia und OpenAlex – keine echten Netzanfragen.
const ENV = { GEMINI_API_KEY: 'test-gemini', NVIDIA_API_KEY: 'test-nvidia' };

function sseResponse(chunks, { delayMs = 0, failAfter = null, signal } = {}) {
  const enc = new TextEncoder();
  let i = 0;
  return new Response(new ReadableStream({
    async pull(controller) {
      if (signal?.aborted) { controller.error(signal.reason || new Error('aborted')); return; }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (failAfter != null && i >= failAfter) { controller.error(new TypeError('network error mid-stream')); return; }
      if (i >= chunks.length) { controller.close(); return; }
      controller.enqueue(enc.encode(`data: ${JSON.stringify(chunks[i++])}\n\n`));
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

/* Gemini-Stream aus Textstücken */
function geminiChunks(parts, finishReason = 'STOP') {
  return parts.map((text, i) => ({
    candidates: [{ content: { parts: [{ text }] }, ...(i === parts.length - 1 ? { finishReason } : {}) }],
  }));
}

/* Wartet, bis der Abbruch kommt – für „hängende“ Anfragen */
function hang(signal) {
  return new Promise((_, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener('abort', () => reject(signal.reason || new Error('aborted')), { once: true });
  });
}

/* Router: jede Anfrage wird protokolliert und an die erste passende Regel gegeben */
function installFetch(routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch {}
    const call = { url, body, init };
    calls.push(call);
    for (const route of routes) {
      if (route.match(call)) return route.respond(call);
    }
    throw new Error(`Unerwartete Anfrage im Test: ${url}`);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/* Typische Regeln */
// Hilfsaufgaben (Planung, Prüfung, Bewertung) laufen beim Anbieter der Anfrage – in den Tests Gemini (generateContent, nicht gestreamt)
const helper = (c) => (c.url.includes('generativelanguage') && c.url.includes(':generateContent')) || c.url.includes('integrate.api.nvidia.com');
const sysText = (c) => c.body?.systemInstruction?.parts?.[0]?.text || c.body?.messages?.[0]?.content || '';
const is = {
  geminiStream: (c) => c.url.includes('generativelanguage') && c.url.includes('streamGenerateContent'),
  nvidia: (c) => c.url.includes('integrate.api.nvidia.com'),
  analyze: (c) => helper(c) && /plan how a learning assistant/.test(sysText(c)),
  verify: (c) => helper(c) && /strict reviewer/.test(sysText(c)),
  judge: (c) => helper(c) && /rate candidate sources/.test(sysText(c)),
  nvidiaStream: (c) => c.url.includes('integrate.api.nvidia.com') && c.body?.stream === true,
  wikiSearch: (c) => c.url.includes('wikipedia.org') && c.url.includes('list=search'),
  wikiPage: (c) => c.url.includes('wikipedia.org') && c.url.includes('prop=extracts'),
  openAlex: (c) => c.url.includes('api.openalex.org'),
};
// Antwort einer Hilfsaufgabe – passt für Gemini (candidates) und OpenAI-Form (choices)
const nvidiaJson = (obj) => json({ choices: [{ message: { content: JSON.stringify(obj) } }], candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const userOf = (c) => c.body?.messages?.[1]?.content || (c.body?.contents?.[0]?.parts || []).map((x) => x.text || '').join('');
const systemOf = (call) => call.body?.systemInstruction?.parts?.[0]?.text || call.body?.messages?.[0]?.content || '';

/* OpenAlex-Treffer mit Abstract (als inverted index) */
function openAlexWork({ title, abstract, year = 2020, type = 'article', venue = 'Journal of Testing', cited = 120, doi }) {
  const inv = {};
  abstract.split(' ').forEach((w, i) => { (inv[w] ||= []).push(i); });
  return {
    id: `https://openalex.org/W${Math.abs(title.length * 7919)}`, title, doi: doi || `https://doi.org/10.1000/${encodeURIComponent(title.slice(0, 12))}`,
    publication_year: year, publication_date: `${year}-05-01`, cited_by_count: cited, type,
    abstract_inverted_index: inv, primary_location: { source: { display_name: venue } },
    authorships: [{ author: { display_name: 'A. Muster' }, institutions: [{ display_name: 'Universität Test' }] }, { author: { display_name: 'B. Beispiel' } }],
  };
}

function collect() {
  const events = [];
  const send = (event, data) => events.push({ event, data });
  const stages = () => events.filter((e) => e.event === 'status').map((e) => `${e.data.stage}:${e.data.status}`);
  const text = () => {
    const last = events.map((e) => e.event).lastIndexOf('reset');
    return events.slice(last + 1).filter((e) => e.event === 'text').map((e) => e.data.text).join('');
  };
  const of = (name) => events.filter((e) => e.event === name).map((e) => e.data);
  return { events, send, stages, text, of };
}

module.exports = { userOf, ENV, sseResponse, json, geminiChunks, hang, installFetch, is, nvidiaJson, systemOf, openAlexWork, collect };
