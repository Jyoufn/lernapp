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
  assert.doesNotMatch(sys, /EIGENE POSITION: 10 Stück/, 'Frage nach einer bestimmten Aktie: andere Depot-Werte werden nicht durchgerechnet');
  assert.match(sys, /FRAGE-ART: bestimmte Aktie/);
  assert.doesNotMatch(sys, /MARKTSCAN/, 'kein Scan über alle Werte');
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

test('Echtzeit: Tradegate-Kurs (auch mit deutschem Komma) ersetzt den letzten Kurs; ING prüft gegen; falsche ISIN wird verworfen', async () => {
  const b = bars(300, 0.001, 0.01, 100);
  const last = b[b.length - 1].c;
  fx = M.installFetch([
    { match: (c) => c.url.includes('tradegate'), respond: () => M.json({ bid: '1.0,00', ask: String(last * 1.01).replace('.', ','), last: String((last * 1.01).toFixed(2)).replace('.', ','), delta: '+1,00%', high: last * 1.02, low: last * 0.99, stueck: 5000 }) },
    { match: (c) => c.url.includes('wertpapiere.ing.de'), respond: () => M.json({ price: last * 1.011, currency: 'EUR', priceChangeDate: new Date().toISOString(), exchangeName: 'Tradegate' }) },
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(b) },
  ]);
  const a = (await B.check({ watch: ['SAP.DE'] })).watch[0];
  assert.equal(a.realtime, true);
  assert.ok(Math.abs(a.price - last * 1.01) < 0.02, `${a.price}`);
  assert.equal(a.sources[0], 'Tradegate (Echtzeit)');
  assert.ok(a.sources.some((s) => s.startsWith('ING')));
  assert.match(B.stockLine(a), /um \d{2}:\d{2}:\d{2} Uhr \(Echtzeit/);
  // Echtzeitkurs weit weg vom Verlauf (z. B. falsche ISIN) → nicht verwenden
  const off = B.withLive({ bars: b, sources: ['Yahoo Finance'] }, { price: last * 3, time: Date.now(), sources: ['Tradegate (Echtzeit)'] }, 1);
  assert.equal(off.bars[off.bars.length - 1].c, last);
});

test('Aktienchart: Zeiträume, Euro, 20/50-Tage-Linie und Echtzeitkurs als letzter Punkt', async () => {
  const day = bars(400, 0.001, 0.01, 50);
  const intraday = bars(100, 0, 0.002, 50).map((x, i) => ({ ...x, t: Date.now() - (100 - i) * 300000 }));
  fx = M.installFetch([
    { match: (c) => c.url.includes('USDEUR'), respond: () => yahoo(bars(30, 0, 0, 0.9), 'EUR') },
    { match: (c) => c.url.includes('finance.yahoo.com/v8') && c.url.includes('interval=5m'), respond: () => yahoo(intraday, 'USD', 'Nvidia') },
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(day, 'USD', 'Nvidia') },
    { match: (c) => c.url.includes('tradegate'), respond: () => M.json({ bid: 45.1, ask: 45.2, last: 45.15, delta: '+0,50%' }) },
  ]);
  const six = await B.chartData('NVDA', '6M');
  assert.equal(six.currency, 'EUR');
  assert.ok(six.sma20 && six.sma50 && six.sma20.length === six.bars.length);
  const one = await B.chartData('NVDA', '1T');
  assert.equal(one.interval, '5m');
  assert.equal(one.realtime, true);
  assert.equal(one.price, 45.15);
  assert.equal(one.bars[one.bars.length - 1].c, 45.15);
  assert.ok(Math.abs(one.prevClose - 45.15 / 1.005) < 0.01);
  await assert.rejects(B.chartData('<script>', '1T'));
});

test('Order-Vorschlag: Limit/Stop-Buy, Stückzahl nach Risiko und 20-%-Regel, Chance:Risiko', () => {
  const p = B.orderPlan({ signal: 'kaufen', price: 100, ask: 100.2, stop: 94, target: 109, entry: 100 }, 50000, 50000);
  assert.match(p.type, /^Limit 100,20/);
  assert.equal(p.qty, 100); // 750 € Risiko / 6 € = 125 → max. 20 % = 10.000 € → 100 Stück
  assert.equal(p.crv, 1.5);
  const sb = B.orderPlan({ signal: 'bald', price: 98, trigger: 100.5, stop: 95, target: 110 }, 50000, 50000);
  assert.match(sb.type, /^Stop-Buy 100,50/);
});

test('Börsen-Agent: fester Ablauf (kein Planungs-Aufruf), liest nur Nachrichten seriöser Seiten zum gefragten Wert, denkt auf High', async () => {
  const b = bars(400, 0.0015);
  const html = (body) => new Response(body, { headers: { 'content-type': 'text/html' } });
  const ddg = (urls) => urls.map((u) => `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(u)}">${u}</a>`).join('\n');
  const WEBLIB = require('../lib/web');
  const lookup = WEBLIB.hooks.lookup;
  WEBLIB.hooks.lookup = async () => [{ address: '93.184.216.34' }];
  test.after(() => { WEBLIB.hooks.lookup = lookup; });
  const article = '<html><head><title>Rheinmetall: Großauftrag</title></head><body><article><p>' + 'Rheinmetall meldet einen Großauftrag der Bundeswehr und hebt die Prognose an. '.repeat(20) + '</p></article></body></html>';
  fx = M.installFetch([
    { match: (c) => c.url.includes('html.duckduckgo.com'), respond: () => html(ddg(['https://www.wallstreet-forum.de/thread/1', 'https://www.handelsblatt.com/rheinmetall-auftrag', 'https://aktien-tipps-blog.example/rheinmetall'])) },
    { match: (c) => c.url.includes('handelsblatt.com'), respond: () => html(article) },
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(b) },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['**Rheinmetall halten.**'])) },
    { match: () => true, respond: () => new Response('weg', { status: 503 }) },
  ]);
  const c = M.collect();
  await W.runChat({ env: M.ENV, body: { log: false, effort: 'auto', agent: 'boerse', messages: [{ role: 'user', text: 'Soll ich Rheinmetall kaufen?' }] }, send: c.send, signal: new AbortController().signal });
  WEBLIB.hooks.lookup = lookup;
  const charts = fx.calls.filter((x) => x.url.includes('finance.yahoo.com/v8')).map((x) => decodeURIComponent(x.url.split('/chart/')[1].split('?')[0]));
  assert.deepEqual([...new Set(charts)].filter((x) => !x.startsWith('^')), ['RHM.DE'], 'bei einer Frage zu einem Wert wird nur dieser Wert gerechnet');
  const browse = c.of('status').find((s) => s.stage === 'browsing' && s.status === 'active');
  assert.ok(browse?.meta?.news, 'Nachrichten werden gelesen');
  const queries = fx.calls.filter((x) => x.url.includes('html.duckduckgo.com')).map((x) => decodeURIComponent(new URL(x.url).searchParams.get('q')));
  assert.ok(queries.length && queries.every((q) => /Rheinmetall/.test(q)), `nur der gefragte Wert: ${queries}`);
  assert.ok(!fx.calls.some((x) => /wallstreet-forum|aktien-tipps-blog/.test(x.url)), 'Foren und Tipp-Blogs werden nicht gelesen');
  assert.ok(fx.calls.some((x) => x.url.includes('handelsblatt.com')), 'Handelsblatt wird gelesen');
  assert.ok(!fx.calls.some(M.is.analyze), 'kein Planungs-Aufruf');
  const plan = c.of('status').find((s) => s.stage === 'thinking' && s.status === 'done');
  assert.deepEqual(plan.meta.points, ['Marktlage und Stimmung', 'Tag, Woche und Monat je Wert', 'Nachrichten und Chancen-Radar', 'Risiko-Check und Order-Plan']);
  const gen = fx.calls.filter(M.is.geminiStream).pop();
  assert.equal(gen.body.generationConfig.thinkingConfig.thinkingBudget, 8192, 'High');
  assert.equal(gen.body.tools, undefined, 'keine Google-Suche im Modell');
  const sys = M.systemOf(gen);
  assert.match(sys, /DENKWEG/);
  assert.doesNotMatch(sys, /CHANCEN-RADAR \(Algorithmus/, 'Frage zu einem Wert: kein Radar über alle Werte');
  assert.match(sys, /MARKTLAGE: DAX/);
  assert.match(sys, /NACHRICHTEN-WIRKUNG/);
  assert.match(sys, /Großauftrag/, 'Artikeltext im Prompt');
  assert.doesNotMatch(sys, /BULLEN-ANALYST/);
});

test('Zeitebenen: Tag, Woche und Monat zusammen – Rücksetzer im Aufwärtstrend wird erkannt', async () => {
  const up = bars(300, 0.003, 0.004, 100);
  const weekUp = bars(60, 0.0015, 0.002, 100).map((x, i) => ({ ...x, t: Date.now() - (60 - i) * 1800000 }));
  const dayDown = bars(80, -0.0006, 0.0005, 110).map((x, i) => ({ ...x, t: Date.now() - (80 - i) * 300000 }));
  fx = M.installFetch([
    { match: (c) => c.url.includes('interval=5m'), respond: () => yahoo(dayDown) },
    { match: (c) => c.url.includes('interval=30m'), respond: () => yahoo(weekUp) },
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(up) },
    { match: () => true, respond: () => new Response('weg', { status: 503 }) },
  ]);
  const ctx = await B.contextFor({ question: 'Soll ich SAP kaufen?' });
  assert.match(ctx.text, /ZEITEBENEN: Tag abwärts .* \| Woche aufwärts .* \| Monat aufwärts/);
  assert.match(ctx.text, /heute ein Rücksetzer – im Aufwärtstrend oft eine Kaufgelegenheit/);
  assert.equal(ctx.charts[0].symbol, 'SAP.DE');
});

test('Chart-Block wird angehängt, wenn die Antwort einen Wert bespricht und keinen Chart hat', () => {
  const list = [{ symbol: 'SAP.DE', name: 'SAP' }, { symbol: 'RHM.DE', name: 'Rheinmetall' }];
  assert.equal(B.chartBlocksFor('Rheinmetall ist stark.', list), '\n\n```stock\n{"symbol":"RHM.DE","name":"Rheinmetall"}\n```');
  assert.equal(B.chartBlocksFor('Nichts dazu.', list), '');
  assert.equal(B.chartBlocksFor('SAP\n```stock\n{"symbol":"SAP.DE"}\n```', list), '');
});

test('Börsen-Agent: Chart wird angehängt, wenn die Antwort einen Wert ohne Chart bespricht', async () => {
  const b = bars(400, 0.0015);
  fx = M.installFetch([
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(b) },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['**SAP kaufen.** Rheinmetall eher nicht.'])) },
    { match: () => true, respond: () => new Response('weg', { status: 503 }) },
  ]);
  const c = M.collect();
  await W.runChat({ env: M.ENV, body: { log: false, effort: 'auto', agent: 'boerse', messages: [{ role: 'user', text: 'Soll ich SAP oder Rheinmetall kaufen?' }] }, send: c.send, signal: new AbortController().signal });
  assert.match(c.text(), /```stock\n\{"symbol":"(SAP\.DE|RHM\.DE)"/);
});

test('Frage-Art: Scan über alle Werte nur bei Ideen/Empfehlungen – Depot, einzelne Aktie und Marktlage ohne Scan', () => {
  const m = (q, asked = []) => B.intentOf(q, asked).mode;
  assert.equal(m('Gib mir einen Überblick von meinem Depot'), 'depot');
  assert.equal(m('Wie stehen meine Aktien?'), 'depot');
  assert.equal(m('Welche Aktien soll ich jetzt kaufen?'), 'ideas');
  assert.equal(m('Was ist gerade empfohlen?'), 'ideas');
  assert.equal(m('Zeig mir die besten Chancen'), 'ideas');
  assert.equal(m('Soll ich SAP kaufen?', ['SAP.DE']), 'stocks');
  assert.equal(m('Gibt es eine bessere Alternative zu SAP?', ['SAP.DE']), 'ideas');
  assert.equal(m('Wie läuft der DAX heute?'), 'market');
  assert.equal(m('In was kann ich aktuell am besten investieren?'), 'ideas');
  assert.equal(m('Was sind gerade gute Aktien?'), 'ideas');
  assert.equal(m('Wo kann ich mein Geld anlegen?'), 'ideas');
  assert.equal(m('Was ist eine Aktie?'), 'market', 'Wissensfrage → kein Scan');
});

test('Planspiel: Depot aus Portfolio und Buchungen – Stück, Kaufkurs, Gewinn nach Gebühr, Anteil', () => {
  const trades = [
    { id: 1, date: '2026-10-02 10:00:00', transactionType: 'BUY', amount: -10015, order: { quantity: 50, executionPrice: 200, transactionCosts: 15, instrument: { isin: 'DE0007164600', name: 'SAP SE' } } },
    { id: 2, date: '2026-10-05 10:00:00', transactionType: 'BUY', amount: -5015, order: { quantity: 100, executionPrice: 50, transactionCosts: 15, instrument: { isin: 'DE000ZAL1111', name: 'Zalando SE' } } },
    { id: 3, date: '2026-10-09 10:00:00', transactionType: 'SELL', amount: 2985, order: { quantity: 50, executionPrice: 60, transactionCosts: 15, instrument: { isin: 'DE000ZAL1111', name: 'Zalando SE' } } },
    { id: 4, date: '2026-10-10 10:00:00', transactionType: 'DIVIDEND', amount: 20, order: {} },
  ];
  const port = { portfolio: { name: 'Wettbewerbsdepot', credit: 37955, value: 51205, numTrades: 3 },
    items: [{ instrument: { isin: 'DE0007164600', name: 'SAP SE', bid: 210, ask: 210.2 } }, { instrument: { isin: 'DE000ZAL1111', name: 'Zalando SE', bid: 55 } }] };
  const P = require('../lib/planspiel');
  const d = P.build(port, trades, 'julian');
  assert.equal(d.value, 51205);
  assert.equal(d.cash, 37955);
  assert.equal(d.buys, 2);
  assert.equal(d.positions.length, 2);
  const sap = d.positions.find((x) => x.isin === 'DE0007164600');
  assert.equal(sap.qty, 50);
  assert.equal(sap.buyPrice, 200);
  assert.equal(sap.value, 10500);
  assert.equal(sap.gainEur, 485); // 10.500 − 10.000 − 15 Gebühr
  const zal = d.positions.find((x) => x.isin === 'DE000ZAL1111');
  assert.equal(zal.qty, 50, 'Teilverkauf verringert die Stückzahl');
  assert.equal(zal.buyPrice, 50);
  assert.equal(d.gainPct, 2.41);
  assert.ok(sap.weightPct > 20 && sap.weightPct < 21);
});

test('Planspiel: Server meldet sich an, liest das Depot und gibt nie das Passwort heraus; falsches Passwort wird nicht gespeichert', async () => {
  const P = require('../lib/planspiel');
  const STORE = require('../lib/store');
  const store = STORE.memoryStore();
  const env = { PLANSPIEL_SECRET: 'test' };
  let logins = 0;
  fx = M.installFetch([
    { match: (c) => c.url.includes('v-ms7/authenticate'), respond: (c) => {
      logins++;
      const b = JSON.parse(c.init.body);
      if (b.password !== 'richtig') return new Response('{}', { status: 401 });
      return M.json({ success: true, result: { token: { accessToken: 'tok' }, user: { userPortfolios: [{ id: 77, name: 'Wettbewerb' }] } } });
    } },
    { match: (c) => c.url.includes('getPortfolioWithItems') && c.url.includes('portfolioId=77'), respond: (c) => (c.init.headers.Authorization === 'Bearer tok'
      ? M.json({ portfolio: { credit: 40000, value: 50100 }, items: [{ instrument: { isin: 'DE0007164600', name: 'SAP SE', bid: 201 } }] }) : new Response('', { status: 401 })) },
    { match: (c) => c.url.includes('getTransactions'), respond: () => M.json([{ id: 1, date: '2026-10-02', transactionType: 'BUY', order: { quantity: 50, executionPrice: 200, transactionCosts: 15, instrument: { isin: 'DE0007164600', name: 'SAP SE' } } }]) },
  ]);
  await assert.rejects(P.save(store, env, 'u1', { user: 'julian', code: 'falsch' }), /fehlgeschlagen/);
  assert.equal((await P.status(store, 'u1')).connected, false);
  const st = await P.save(store, env, 'u1', { user: 'julian', code: 'richtig' });
  assert.deepEqual(Object.keys(st).sort(), ['checked', 'connected', 'since', 'user']);
  const d = await P.depot(store, env, 'u1');
  assert.equal(d.connected, true);
  assert.equal(d.positions[0].symbol, 'SAP.DE', 'ISIN wird dem Kürzel der App zugeordnet');
  assert.equal(d.positions[0].qty, 50);
  assert.ok(!JSON.stringify(d).includes('richtig'), 'kein Passwort in der Antwort');
  assert.equal(logins, 2, 'Token wird wiederverwendet');
});

test('Börsen-Agent: „Überblick von meinem Depot“ liest das Planspiel-Depot, rechnet nur die eigenen Werte und hängt die Depot-Grafik an', async () => {
  const b = bars(400, 0.0015);
  fx = M.installFetch([
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(b) },
    { match: (c) => c.url.includes('stooq.com'), respond: () => stooqCsv(b) },
    { match: (c) => c.url.includes('/v1/finance/search'), respond: () => M.json({ quotes: [] }) },
    { match: (c) => c.url.includes('news.google.com'), respond: () => new Response('<rss></rss>') },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['**Dein Depot: 50.100 €.**'])) },
  ]);
  const ps = { connected: true, user: 'julian', asOf: new Date().toISOString(), value: 50100, cash: 40000, invested: 10100, gainEur: 100, gainPct: 0.2, trades: 1, buys: 1,
    positions: [{ isin: 'DE0007164600', symbol: 'SAP.DE', name: 'SAP SE', qty: 50, buyPrice: 200, price: 202, value: 10100, gainEur: 85, gainPct: 0.9, weightPct: 20.2, bought: '2026-10-02' }] };
  const body = { log: false, effort: 'low', agent: 'boerse', messages: [{ role: 'user', text: 'Gib mir einen Überblick von meinem Depot' }] };
  Object.defineProperty(body, 'loadDepot', { value: async () => ps, enumerable: false });
  const out = M.collect();
  await W.runChat({ env: M.ENV, body, send: out.send, signal: new AbortController().signal });
  const sys = M.systemOf(fx.calls.filter(M.is.geminiStream).pop());
  assert.match(sys, /FRAGE-ART: Depot-Überblick/);
  assert.match(sys, /live aus dem Planspiel Börse/);
  assert.match(sys, /EIGENE POSITION: 50 Stück/);
  assert.doesNotMatch(sys, /MARKTSCAN/, 'kein Scan über alle ~430 Werte');
  const yahooCalls = fx.calls.filter((c) => c.url.includes('finance.yahoo.com/v8')).map((c) => decodeURIComponent(c.url));
  assert.ok(yahooCalls.every((u) => /SAP\.DE|\^GDAXI|\^STOXX50E|\^NDX|EURUSD|=X/.test(u)), `nur eigene Werte und Indizes: ${yahooCalls.filter((u) => !/SAP\.DE|\^/.test(u)).slice(0, 3)}`);
  const text = out.events.filter((e) => e.event === 'text').map((e) => e.data.text).join('');
  assert.match(text, /```depot/);
});

test('Börsen-Agent: „In was kann ich aktuell am besten investieren?“ → Scan über alle Werte und die Chancen-Kästchen hängen an', async () => {
  const b = bars(400, 0.0015);
  fx = M.installFetch([
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(b) },
    { match: (c) => c.url.includes('stooq.com'), respond: () => stooqCsv(b) },
    { match: (c) => c.url.includes('/v1/finance/search'), respond: () => M.json({ quotes: [] }) },
    { match: (c) => c.url.includes('news.google.com'), respond: () => new Response('<rss></rss>') },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['**Heute kaufen: Fortinet.**'])) },
  ]);
  const store = require('../lib/store').memoryStore();
  const R = require('../lib/radar');
  await store.set(R.KEY, JSON.stringify({ asOf: new Date().toISOString(), checked: 427, sectors: [], mood: { score: 0, top: [] }, record: null,
    picks: [{ type: 'ruecksetzer', symbol: 'RHM.DE', name: 'Rheinmetall', sector: 'Rüstung', price: 100, entry: 100, stop: 95, target: 110, score: 82, reason: 'Rücksetzer', history: { cases: 5, winRate: 60 }, news: [] }],
    scan: { checked: 427, now: [{ symbol: 'FTNT', name: 'Fortinet', price: 80, entry: 80, stop: 76, target: 88, score: 78, signal: 'kaufen', reasons: ['Trend'], history: { cases: 8, winRate: 62 } }], soon: [], weak: [] } }));
  const body = { log: false, effort: 'low', agent: 'boerse', messages: [{ role: 'user', text: 'In was kann ich aktuell am besten investieren?' }] };
  Object.defineProperty(body, 'radarStore', { value: store, enumerable: false });
  const out = M.collect();
  await W.runChat({ env: M.ENV, body, send: out.send, signal: new AbortController().signal });
  assert.match(M.systemOf(fx.calls.filter(M.is.geminiStream).pop()), /FRAGE-ART: Ideen/);
  const text = out.text();
  const m = text.match(/```chancen\n([\s\S]*?)\n```/);
  assert.ok(m, 'Chancen-Block hängt an');
  const data = JSON.parse(m[1]);
  assert.deepEqual(data.picks.map((p) => `${p.symbol}:${p.verdict}`), ['RHM.DE:kaufen', 'FTNT:kaufen']);
});
