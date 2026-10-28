// Deutsche Fachquellen werden bevorzugt – aber nur, wenn sie zum Thema passen
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/workflow');
const WEBLIB = require('../lib/web');
const M = require('./mock');

const html = (s) => new Response(s, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const page = (title, body) => `<html><head><title>${title}</title></head><body><main><p>${body}</p></main></body></html>`;
const ddg = (urls) => urls.map((u) => `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(u)}">${u}</a>`).join('\n');
const ANALYSIS = {
  effort: 'high', domain: 'history', approach: 'x', points: ['x'], research: true, verify: false,
  topic: 'causes of the French Revolution', queriesDe: ['Französische Revolution Ursachen'], queriesEn: ['French Revolution causes'],
};

let fx = null;
let lookup = null;
test.beforeEach(() => { lookup = WEBLIB.hooks.lookup; WEBLIB.hooks.lookup = async () => [{ address: '93.184.216.34' }]; });
test.afterEach(() => { fx?.restore(); fx = null; WEBLIB.hooks.lookup = lookup; });

test('Deutsche Fachseite (bpb.de) kommt als Quelle Nr. 1; Pinterest wird aussortiert, unpassende deutsche Seite nicht genutzt', async () => {
  fx = M.installFetch([
    { match: M.is.analyze, respond: () => M.nvidiaJson(ANALYSIS) },
    { match: (c) => c.url.includes('html.duckduckgo.com'), respond: () => html(ddg(['https://www.pinterest.de/pin/1', 'https://www.bpb.de/revolution', 'https://www.kochrezepte.de/kuchen'])) },
    { match: (c) => c.url.includes('bpb.de'), respond: () => html(page('Ursachen der Französischen Revolution | bpb.de',
      'Die Französische Revolution hatte mehrere Ursachen: Die Staatsschulden, die Ständegesellschaft und die Ideen der Aufklärung führten 1789 zur Revolution in Frankreich.')) },
    { match: (c) => c.url.includes('kochrezepte.de'), respond: () => html(page('Kuchenrezepte', 'Hier finden Sie leckere Rezepte für Kuchen, Torten und Gebäck für jeden Anlass und jede Jahreszeit.')) },
    { match: (c) => c.url.includes('wikipedia.org') || c.url.includes('openalex.org'), respond: () => M.json({ error: 'down' }, 503) },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['Die Ursachen waren vielfältig [1].'])) },
  ]);
  const c = M.collect();
  const result = await W.runChat({ env: M.ENV, body: { log: false, messages: [{ role: 'user', text: 'Erkläre die Ursachen der Französischen Revolution.' }], effort: 'high' }, send: c.send, signal: new AbortController().signal });
  assert.equal(result.status, 'completed');
  const done = c.of('research').filter((e) => e.status === 'done' || e.status === 'failed').at(-1);
  assert.equal(done.sources[0].domain, 'bpb.de');
  assert.equal(done.sources[0].n, 1);
  assert.ok(!done.sources.some((s) => /pinterest|kochrezepte/.test(s.domain)));
  assert.ok(!fx.calls.some((x) => x.url.includes('pinterest')));
  assert.match(M.systemOf(fx.calls.find(M.is.geminiStream)), /bpb\.de/);
});
