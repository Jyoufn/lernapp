// Tests für den Börsen-Agenten (lib/boerse.js) und seinen Weg durch den KI-Ablauf – alles simuliert, kein Netz.
// Geprüft wird die Rechnung (Kennzahlen, Signale, Planspiel-Regeln) und dass Kurse aus mehreren Quellen im Prompt landen.
// Ob die Signale an der echten Börse „stimmen“, lässt sich so nicht testen – das zeigt die Trefferquote je Aktie.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../lib/boerse');
const W = require('../lib/workflow');
const M = require('./mock');

// gleichmäßiger Kursverlauf mit Rauschen (fester Startwert → immer gleich)
function bars(n, drift, vol = 0.015, start = 100, seed = 7) {
  let x = start, s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  return Array.from({ length: n }, (_, i) => { x *= 1 + drift + vol * r(); return { t: Date.UTC(2025, 0, 1) + i * 86400000, o: x, h: x * 1.01, l: x * 0.99, c: x, v: 1000 }; });
}
const yahoo = (b, currency = 'EUR', name = 'Test AG') => M.json({ chart: { result: [{
  meta: { currency, longName: name, regularMarketPrice: b[b.length - 1].c, regularMarketTime: b[b.length - 1].t / 1000, fullExchangeName: 'XETRA' },
  timestamp: b.map((x) => x.t / 1000), indicators: { quote: [{ open: b.map((x) => x.o), high: b.map((x) => x.h), low: b.map((x) => x.l), close: b.map((x) => x.c), volume: b.map((x) => x.v) }] },
}] } });
const stooqCsv = (b) => new Response(`Date,Open,High,Low,Close,Volume\n${b.map((x) => `${new Date(x.t).toISOString().slice(0, 10)},${x.o},${x.h},${x.l},${x.c},${x.v}`).join('\n')}`);

let fx = null;
test.afterEach(() => { fx?.restore(); fx = null; B.cache.clear(); });

test('Kennzahlen: SMA, RSI und ATR rechnen richtig', () => {
  assert.deepEqual(B.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const up = B.rsi(Array.from({ length: 30 }, (_, i) => i + 1));
  assert.equal(up[29], 100); // nur Gewinne
  const flat = B.atr(Array.from({ length: 20 }, () => ({ h: 11, l: 9, c: 10 })), 14);
  assert.equal(flat[19], 2);
});

test('Signale: Aufwärtstrend → Kaufen mit Stopp unter und Ziel über dem Kurs; Abwärtstrend → Meiden', () => {
  const upA = B.analyze({ symbol: 'UP.DE', name: 'Steigt', currency: 'EUR', bars: bars(500, 0.002) });
  assert.ok(upA.score >= 65, `Score ${upA.score}`);
  assert.ok(['kaufen', 'ueberhitzt', 'halten'].includes(upA.signal));
  assert.ok(upA.stop < upA.price && upA.target > upA.price);
  assert.ok(upA.history.cases > 0 && upA.history.winRate >= 50, 'im stetigen Aufwärtstrend hat das Kaufsignal meist funktioniert');
  const down = B.analyze({ symbol: 'DN.DE', name: 'Fällt', currency: 'EUR', bars: bars(500, -0.002) });
  assert.equal(down.signal, 'meiden');
  assert.ok(down.score < 35);
});

test('Position: unter dem Stopp → Verkaufen; Gewinn nach Gebühren (0,3 %, mind. 15 €)', () => {
  const b = bars(500, -0.002);
  const a = B.analyze({ symbol: 'DN.DE', name: 'Fällt', currency: 'EUR', bars: b }, { holding: { qty: 10, buyPrice: b[400].c, buyDate: new Date(b[400].t).toISOString() } });
  assert.equal(a.holding.signal, 'verkaufen');
  assert.ok(a.holding.gainEur < 0);
  const value = a.price * 10;
  assert.ok(Math.abs(a.holding.gainEur - (value - b[400].c * 10 - 15 - 15)) < 0.05, 'Mindestgebühr bei Kauf und Verkauf');
});

test('Planspiel: Gebühr, 20-%-Regel und Stückzahl', () => {
  assert.equal(B.fee(1000), 15);
  assert.equal(B.fee(10000), 30);
  const s = B.positionSize({ price: 100, stop: 90, depotValue: 50000, cash: 50000 });
  assert.ok(s.qty * 100 <= 10000, 'höchstens 20 % vom Depot');
  assert.equal(s.qty, 75); // 1,5 % Risiko = 750 € / 10 € Abstand
  const st = B.planspielStatus(Date.parse('2026-10-29T10:00:00+01:00'), 1);
  assert.equal(st.running, true);
  assert.equal(st.buysMissing, 2);
});

test('Werte im Text: Namen, Kürzel und „X-Aktie“ (per Suche)', async () => {
  fx = M.installFetch([{ match: (c) => c.url.includes('/v1/finance/search'), respond: () => M.json({ quotes: [{ symbol: 'HOOD', shortname: 'Robinhood', quoteType: 'EQUITY', exchange: 'NMS' }] }) }]);
  const s = await B.symbolsInText('Soll ich Siemens Energy, die Robinhood-Aktie oder $NVDA kaufen? Und SAP.DE?');
  assert.deepEqual(s.sort(), ['ENR.DE', 'HOOD', 'NVDA', 'SAP.DE'].sort());
});

test('Mehrere Quellen: Yahoo + Stooq zum Gegenprüfen; fällt Yahoo aus, übernimmt Stooq', async () => {
  const b = bars(300, 0.001);
  fx = M.installFetch([
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(b) },
    { match: (c) => c.url.includes('stooq.com'), respond: () => stooqCsv(b.map((x) => ({ ...x, c: x.c * 1.001 }))) },
  ]);
  const a = (await B.check({ positions: [{ symbol: 'SAP.DE', qty: 5, buyPrice: 100 }], cash: 1000 })).holdings[0];
  assert.deepEqual(a.sources, ['Yahoo Finance', 'Stooq']);
  assert.ok(Math.abs(a.crossCheck.diffPct - 0.1) < 0.01);
  fx.restore(); B.cache.clear();
  fx = M.installFetch([
    { match: (c) => c.url.includes('finance.yahoo.com'), respond: () => new Response('weg', { status: 503 }) },
    { match: (c) => c.url.includes('stooq.com'), respond: () => stooqCsv(b) },
  ]);
  const w = (await B.check({ watch: ['SAP.DE'] })).watch[0];
  assert.deepEqual(w.sources, ['Stooq']);
  assert.ok(w.price > 0);
});

test('US-Werte werden in Euro umgerechnet', async () => {
  const b = bars(300, 0.001, 0.01, 200);
  fx = M.installFetch([
    { match: (c) => c.url.includes('USDEUR%3DX') || c.url.includes('USDEUR=X'), respond: () => yahoo(bars(30, 0, 0, 0.9), 'EUR', 'USD/EUR') },
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(b, 'USD', 'Nvidia') },
  ]);
  const w = (await B.check({ watch: ['NVDA'] })).watch[0];
  assert.equal(w.currency, 'USD');
  assert.ok(Math.abs(w.price - w.priceNative * 0.9) < 0.02, `${w.price} vs ${w.priceNative}`);
});

test('Börsen-Agent: Live-Marktdaten, Depot und Planspiel-Regeln landen im Prompt; Stufe „market“ wird gemeldet', async () => {
  const b = bars(400, 0.0015);
  fx = M.installFetch([
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(b) },
    { match: (c) => c.url.includes('stooq.com'), respond: () => stooqCsv(b) },
    { match: (c) => c.url.includes('/v1/finance/search'), respond: () => M.json({ quotes: [] }) },
    { match: (c) => c.url.includes('news.google.com'), respond: () => new Response('<rss><item><title>Rheinmetall erhält Großauftrag</title><link>https://x.de</link><pubDate>Wed, 28 Oct 2026 10:00:00 GMT</pubDate><source>Test</source></item></rss>') },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['Rheinmetall: **Halten**.'])) },
  ]);
  const r = await W.runChat({ env: M.ENV, body: { log: false, effort: 'low', agent: 'boerse', messages: [{ role: 'user', text: 'Soll ich Rheinmetall kaufen?' }], depot: { positions: [{ symbol: 'SAP.DE', qty: 10, buyPrice: 100 }], cash: 40000, buys: 1 } }, send: M.collect().send, signal: new AbortController().signal })
    .then(() => null);
  const gen = fx.calls.filter(M.is.geminiStream).pop();
  const sys = M.systemOf(gen);
  assert.match(sys, /AGENT: BÖRSE/);
  assert.match(sys, /LIVE-MARKTDATEN/);
  assert.match(sys, /Rheinmetall \(RHM\.DE/);
  assert.match(sys, /EIGENE POSITION: 10 Stück/);
  assert.match(sys, /mind\. 3 abgerechnete Käufe bis 22\.01\.2027 \(bisher 1, es fehlen noch 2\)/);
  assert.match(sys, /Rheinmetall erhält Großauftrag/);
  assert.ok(fx.calls.some((c) => c.url.includes('stooq.com')), 'zweite Quelle wurde gefragt');
  assert.equal(r, null);
});

test('Börsen-Agent: Stufe „market“ in der Zeitleiste, auch wenn keine Kurse kommen', async () => {
  fx = M.installFetch([
    { match: (c) => /yahoo|stooq|news\.google/.test(c.url), respond: () => new Response('weg', { status: 503 }) },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['Gerade keine Kurse.'])) },
  ]);
  const c = M.collect();
  await W.runChat({ env: M.ENV, body: { log: false, effort: 'low', agent: 'boerse', messages: [{ role: 'user', text: 'Wie steht die SAP-Aktie?' }] }, send: c.send, signal: new AbortController().signal });
  assert.ok(c.stages().includes('market:active') && c.stages().includes('market:done'));
  const done = c.of('status').find((s) => s.stage === 'market' && s.status === 'done');
  assert.equal(done.meta.count, 0);
  assert.match(M.systemOf(fx.calls.filter(M.is.geminiStream).pop()), /nicht erreichbar/);
});
