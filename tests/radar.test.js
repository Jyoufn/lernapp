// Tests für den Chancen-Radar (lib/radar.js) – reiner Algorithmus, alles simuliert.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../lib/boerse');
const R = require('../lib/radar');
const STORE = require('../lib/store');
const M = require('./mock');

function bars(n, drift, vol = 0.01, start = 100, seed = 11) {
  let x = start, s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  return Array.from({ length: n }, (_, i) => { const o = x; x *= 1 + drift + vol * r(); return { t: Date.UTC(2025, 0, 1) + i * 86400000, o, h: Math.max(o, x) * 1.004, l: Math.min(o, x) * 0.996, c: x, v: 1000 }; });
}
// starker Aufwärtstrend, dann ein kräftiger Rücksetzer (−12 % in 6 Tagen), heute eine grüne Erholungskerze
function dipBars() {
  const b = bars(300, 0.0025, 0.006);
  let x = b[b.length - 1].c;
  for (let k = 0; k < 6; k++) { const o = x; x *= 0.978; b.push({ t: b[b.length - 1].t + 86400000, o, h: o * 1.002, l: x * 0.997, c: x, v: 3000 }); }
  const o = x; x *= 1.012; b.push({ t: b[b.length - 1].t + 86400000, o, h: x * 1.002, l: o * 0.998, c: x, v: 3000 });
  return b;
}
const yahoo = (b, currency = 'EUR') => M.json({ chart: { result: [{ meta: { currency, regularMarketPrice: b[b.length - 1].c, regularMarketTime: b[b.length - 1].t / 1000 },
  timestamp: b.map((x) => x.t / 1000), indicators: { quote: [{ open: b.map((x) => x.o), high: b.map((x) => x.h), low: b.map((x) => x.l), close: b.map((x) => x.c), volume: b.map((x) => x.v) }] } }] } });

let fx = null;
test.afterEach(() => { fx?.restore(); fx = null; B.cache.clear(); });

test('Nachrichten-Stimmung: Auftrag/Prognose rauf positiv, Gewinnwarnung schwer negativ', () => {
  assert.ok(R.headlineScore('Rheinmetall erhält Großauftrag über 2 Milliarden') >= 3);
  assert.ok(R.headlineScore('Analyst hebt Kursziel für SAP') >= 2);
  assert.ok(R.headlineScore('Zalando: Gewinnwarnung – Prognose gesenkt') <= -3);
  const s = R.sentiment([{ title: 'Siemens hebt Prognose an', date: new Date().toUTCString() }, { title: 'Siemens im Fokus' }]);
  assert.ok(s.score >= 4 && !s.severe);
  assert.equal(R.sentiment([{ title: 'Ermittlungen gegen Vorstand – Razzia', date: new Date().toUTCString() }]).severe, true);
});

test('Rücksetzer-Regel: starker Wert, kräftig gefallen, fängt sich → ja; im Abwärtstrend → nein', () => {
  const d = dipBars(), ind = B.indicators(d);
  assert.equal(R.dipAt(ind, d, d.length - 1), true);
  const down = bars(320, -0.002, 0.006), ind2 = B.indicators(down);
  assert.equal(R.dipAt(ind2, down, down.length - 1), false);
});

test('Radar: findet den kräftig gefallenen Wert mit Grund für die Erholung (Großauftrag), merkt ihn sich und schreibt die Bilanz', async () => {
  const strong = bars(320, 0.0015, 0.004);
  const dip = dipBars();
  fx = M.installFetch([
    { match: (c) => c.url.includes('finance.yahoo.com/v8') && c.url.includes('SAP.DE'), respond: () => yahoo(dip) },
    { match: (c) => c.url.includes('finance.yahoo.com/v8') && c.url.includes('EUR%3DX'), respond: () => yahoo(bars(30, 0, 0, 0.9)) },
    { match: (c) => c.url.includes('finance.yahoo.com/v8'), respond: () => yahoo(strong) },
    { match: (c) => c.url.includes('news.google.com') && c.url.includes('SAP'), respond: () => new Response(`<rss><item><title>SAP erhält Großauftrag</title><pubDate>${new Date().toUTCString()}</pubDate><source>Test</source></item></rss>`) },
    { match: () => true, respond: () => new Response('weg', { status: 503 }) },
  ]);
  const store = STORE.memoryStore();
  const r = await R.refresh(store);
  const sap = r.picks.find((p) => p.symbol === 'SAP.DE');
  assert.ok(sap, JSON.stringify(r.picks.map((p) => p.symbol)));
  assert.equal(sap.type, 'erholung');
  assert.ok(sap.drop >= 8 && sap.turning && sap.catalyst, JSON.stringify(sap));
  assert.ok(sap.stop < sap.price && sap.target > sap.price);
  assert.ok(!r.picks.some((p) => p.type !== 'erholung'), 'nur die Strategie des Nutzers – kein Momentum, kein Ausbruch');
  assert.ok(sap.newsScore > 0);
  assert.ok(r.sectors.find((s) => s.name === 'Software & Internet'));
  const hist = JSON.parse(await store.get(R.HIST));
  assert.ok(hist.some((h) => h.symbol === 'SAP.DE' && h.type === 'erholung'));
  // gespeichert → zweiter Abruf kommt aus dem Speicher (keine neuen Kursabrufe)
  const before = fx.calls.length;
  const again = await R.latest(store);
  assert.equal(again.asOf, r.asOf);
  assert.equal(fx.calls.length, before);
  assert.match(R.radarText(r), /STARKER RÜCKGANG MIT ERHOLUNGSCHANCE: SAP/);
});

test('Bilanz: nach 5/10 Handelstagen ausgewertet', () => {
  const rec = R.record([{ type: 'ruecksetzer', r5: 3, r10: 5 }, { type: 'ruecksetzer', r5: -1, r10: 2 }, { type: 'ausbruch', r5: 2 }]);
  assert.equal(rec.checked5, 3);
  assert.equal(rec.win5, 67);
  assert.equal(rec.win10, 100);
  assert.equal(rec.byType.ruecksetzer.n, 2);
});

test('Planspiel-Universum: alle Aktien-Indizes des Planspiels, ohne doppelte Werte', () => {
  const U = require('../lib/universe');
  for (const k of ['DAX', 'MDAX', 'SDAX', 'TecDAX', 'EuroStoxx 50', 'Dow Jones', 'Nasdaq 100', 'FTSE MIB', 'ATX', 'LuxX', 'Global Challenges', 'Selection Europe']) {
    assert.ok(U.INDICES[k]?.length, `Index ${k} fehlt`);
  }
  assert.ok(U.LIST.length >= 400, `nur ${U.LIST.length} Werte`);
  assert.equal(new Set(U.LIST.map((u) => u.symbol)).size, U.LIST.length);
  assert.ok(U.LIST.every((u) => u.symbol && u.name && u.sector));
});

test('Chancen-Übersicht: nur „Starker Rückgang · Erholung“; Kaufen erst, wenn er dreht und es einen Grund gibt; Momentum aus dem Scan kommt nicht dazu', () => {
  const R2 = require('../lib/radar');
  const base = { type: 'erholung', price: 100, entry: 100, stop: 95, target: 110, drop: 9.5, dropDays: 2 };
  const o = R2.overview({ asOf: '2026-10-29T10:00:00Z', checked: 427, mood: { score: 3 }, picks: [
    { ...base, symbol: 'A.DE', name: 'A', score: 82, turning: true, catalyst: true, newsScore: 4 },
    { ...base, symbol: 'B.DE', name: 'B', score: 85, turning: false, catalyst: true, newsScore: 4 },
    { ...base, symbol: 'C.DE', name: 'C', score: 80, turning: true, catalyst: false, history: { cases: 4, winRate: 40 }, newsScore: 0 },
    { ...base, symbol: 'E.DE', name: 'E', score: 78, turning: true, catalyst: false, history: { cases: 5, winRate: 70 }, newsScore: 0 },
    { symbol: 'X.DE', name: 'X', type: 'ausbruch', price: 100, entry: 101, stop: 95, target: 115, score: 90 },
  ], scan: { weak: [{ symbol: 'D.DE', name: 'D', price: 10, score: 12, change1m: -9.5 }] } });
  const v = Object.fromEntries(o.picks.map((p) => [p.symbol, p.verdict]));
  assert.deepEqual(v, { 'A.DE': 'kaufen', 'E.DE': 'kaufen', 'B.DE': 'beobachten', 'C.DE': 'beobachten' }, 'fällt noch / kein Grund → Beobachten; Ausbruch gar nicht');
  assert.equal(o.picks[0].symbol, 'A.DE');
  assert.equal(o.picks[0].drop, 9.5);
  assert.deepEqual(o.avoid, ['D']);
  assert.equal(o.mood, 'positiv');
  const o2 = R2.overview({ picks: [], scan: { checked: 427, now: [{ symbol: 'FTNT', name: 'Fortinet', price: 80, entry: 80, stop: 76, target: 88, score: 78, signal: 'kaufen', reasons: ['Trend'], history: { cases: 8, winRate: 62 } }], soon: [], weak: [] } });
  assert.deepEqual(o2.picks, [], 'Kaufsignale aus dem Trend-Scan sind nicht die Strategie des Nutzers');
  assert.equal(o2.checked, 427);
});

test('Regel „Starker Rückgang“: kleiner Dip zählt nicht, Dauer-Abwärtstrend auch nicht', () => {
  const d = dipBars(), ind = B.indicators(d);
  const R2 = require('../lib/radar');
  assert.equal(R2.reboundAt(ind, d, d.length - 1), true);
  const small = bars(300, 0.0025, 0.006); const last = small[small.length - 1]; small.push({ t: last.t + 86400000, o: last.c, h: last.c * 1.001, l: last.c * 0.985, c: last.c * 0.99, v: 1000 });
  small.push({ t: last.t + 2 * 86400000, o: last.c * 0.99, h: last.c, l: last.c * 0.985, c: last.c * 0.995, v: 1000 });
  assert.equal(R2.reboundAt(B.indicators(small), small, small.length - 1), false, '−1 % ist kein Rutsch');
  const down = bars(320, -0.004, 0.006); const l2 = down[down.length - 1];
  for (let k = 1; k <= 3; k++) down.push({ t: l2.t + k * 86400000, o: l2.c * (1 - 0.04 * (k - 1)), h: l2.c * (1 - 0.04 * (k - 1)), l: l2.c * (1 - 0.04 * k), c: l2.c * (1 - 0.04 * k) * (k === 3 ? 1.03 : 1), v: 1000 });
  assert.equal(R2.reboundAt(B.indicators(down), down, down.length - 1), false, 'Dauer-Abwärtstrend = fallendes Messer');
});

test('Kein Zugriff aufs Planspiel: es gibt keine Planspiel-Schnittstelle mehr, die App liest kein Depot', () => {
  const fs = require('fs'), path = require('path');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'lib', 'planspiel.js')));
  const server = fs.readFileSync(path.join(__dirname, '..', 'app-server.js'), 'utf8');
  assert.ok(!/trading\.planspiel-boerse\.de|\/api\/planspiel/.test(server));
});
