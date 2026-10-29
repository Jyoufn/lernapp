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

test('Radar: findet den Rücksetzer in der starken Branche, merkt ihn sich und schreibt die Bilanz', async () => {
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
  assert.equal(sap.type, 'ruecksetzer');
  assert.ok(sap.stop < sap.price && sap.target > sap.price);
  assert.ok(sap.newsScore > 0);
  assert.ok(r.sectors.find((s) => s.name === 'Software & Internet'));
  const hist = JSON.parse(await store.get(R.HIST));
  assert.ok(hist.some((h) => h.symbol === 'SAP.DE' && h.type === 'ruecksetzer'));
  // gespeichert → zweiter Abruf kommt aus dem Speicher (keine neuen Kursabrufe)
  const before = fx.calls.length;
  const again = await R.latest(store);
  assert.equal(again.asOf, r.asOf);
  assert.equal(fx.calls.length, before);
  assert.match(R.radarText(r), /RÜCKSETZER IN STARKER BRANCHE: SAP/);
});

test('Bilanz: nach 5/10 Handelstagen ausgewertet', () => {
  const rec = R.record([{ type: 'ruecksetzer', r5: 3, r10: 5 }, { type: 'ruecksetzer', r5: -1, r10: 2 }, { type: 'ausbruch', r5: 2 }]);
  assert.equal(rec.checked5, 3);
  assert.equal(rec.win5, 67);
  assert.equal(rec.win10, 100);
  assert.equal(rec.byType.ruecksetzer.n, 2);
});
