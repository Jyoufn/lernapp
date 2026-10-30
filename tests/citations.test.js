// Belege im Text: [1], [1][3], [1, 3] und [1; 3] werden alle erkannt
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/research');

const src = (n) => ({ n, text: `Quelle ${n} enthält einen ausreichend langen Satz über das Thema, damit eine Textstelle gefunden wird.` });

test('Belege in allen gängigen Schreibweisen werden gezählt', () => {
  const c = R.collectCitations('Erster Satz [1, 3]. Zweiter Satz [2][4]. Dritter Satz [5; 6]. Falsch [9].', [1, 2, 3, 4, 5, 6].map(src));
  assert.deepEqual(c.cited, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(c.invalid, [9]);
  assert.ok(!c.passages.find((p) => p.n === 1).claim.includes('['));
});

test('Google-Suche: nur Quellen, auf die sich die Antwort stützt (groundingSupports), keine bloßen Treffer', async () => {
  const P = require('../lib/providers');
  const fn = P.geminiStream || P._geminiStream;
  if (!fn) return;
  const chunks = [
    { candidates: [{ content: { parts: [{ text: 'Antwort ' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://a.de/x', title: 'a.de' } }, { web: { uri: 'https://b.de/y', title: 'b.de' } }, { web: { uri: 'https://c.de/z', title: 'c.de' } }] } }] },
    { candidates: [{ content: { parts: [{ text: 'fertig' }] }, finishReason: 'STOP', groundingMetadata: { groundingSupports: [{ segment: { text: 'Antwort' }, groundingChunkIndices: [0, 2] }] } }] },
  ];
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('');
  const old = global.fetch;
  global.fetch = async () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const seen = [];
  try { await fn({ key: 'k', model: 'gemini-2.5-flash', system: 's', messages: [{ role: 'user', text: 'q' }], search: true, onText: () => {}, onSources: (l) => seen.push(l.map((x) => x.title)) }); }
  finally { global.fetch = old; }
  assert.deepEqual(seen.at(-1), ['a.de', 'c.de'], 'b.de wurde nicht benutzt');
  assert.ok(seen.every((l) => l.length), 'ohne Beleg keine Meldung');
});
