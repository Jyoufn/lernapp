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

test('Planspiel-Universum: alle Aktien-Indizes des Planspiels, ohne doppelte Werte', () => {
  const U = require('../lib/universe');
  for (const k of ['DAX', 'MDAX', 'SDAX', 'TecDAX', 'EuroStoxx 50', 'Dow Jones', 'Nasdaq 100', 'FTSE MIB', 'ATX', 'LuxX', 'Global Challenges', 'Selection Europe']) {
    assert.ok(U.INDICES[k]?.length, `Index ${k} fehlt`);
  }
  assert.ok(U.LIST.length >= 400, `nur ${U.LIST.length} Werte`);
  assert.equal(new Set(U.LIST.map((u) => u.symbol)).size, U.LIST.length);
  assert.ok(U.LIST.every((u) => u.symbol && u.name && u.sector));
});

test('Planspiel-Zugang: verschlüsselt gespeichert, Status ohne Passwort, Trennen löscht', async () => {
  const P = require('../lib/planspiel');
  const store = STORE.memoryStore();
  await assert.rejects(P.save(store, {}, 'u1', { user: 'julian', code: '' }), /fehlen/);
  const st = await P.save(store, { PLANSPIEL_SECRET: 'geheim' }, 'u1', { user: 'julian08', code: 'Code-1234' });
  assert.deepEqual({ connected: st.connected, user: st.user }, { connected: true, user: 'julian08' });
  assert.equal(JSON.stringify(st).includes('Code-1234'), false, 'Status ohne Passwort');
  const raw = await store.get(P.KEY('u1'));
  assert.equal(raw.includes('Code-1234'), false, 'nicht im Klartext gespeichert');
  assert.deepEqual(await P.credentials(store, { PLANSPIEL_SECRET: 'geheim' }, 'u1'), { user: 'julian08', code: 'Code-1234' });
  assert.equal(await P.credentials(store, { PLANSPIEL_SECRET: 'falsch' }, 'u1'), null, 'falscher Schlüssel → nichts');
  assert.deepEqual(await P.status(store, 'u2'), { connected: false }, 'andere Konten sehen nichts');
  await P.remove(store, 'u1');
  assert.deepEqual(await P.status(store, 'u1'), { connected: false });
});

test('Chancen-Übersicht: Kaufen nur wenn alles passt, Ausbruch = Beobachten, schwache Charts = Nicht kaufen', () => {
  const R2 = require('../lib/radar');
  const o = R2.overview({ asOf: '2026-10-29T10:00:00Z', checked: 427, mood: { score: 3 }, picks: [
    { symbol: 'A.DE', name: 'A', type: 'ruecksetzer', price: 100, entry: 100, stop: 95, target: 110, score: 82 },
    { symbol: 'B.DE', name: 'B', type: 'ausbruch', price: 100, entry: 101, stop: 95, target: 115, score: 90 },
    { symbol: 'C.DE', name: 'C', type: 'nachrichten', price: 100, entry: 100, stop: 95, target: 104, score: 80 },
  ], scan: { weak: [{ symbol: 'D.DE', name: 'D', price: 10, score: 12, change1m: -9.5 }] } });
  const v = Object.fromEntries(o.picks.map((p) => [p.symbol, p.verdict]));
  assert.deepEqual(v, { 'A.DE': 'kaufen', 'B.DE': 'beobachten', 'C.DE': 'beobachten' }, '„Nicht kaufen“ kommt nicht in die Karte');
  assert.equal(o.picks[0].symbol, 'A.DE');
  assert.deepEqual(o.avoid, ['D']);
  const many = R2.overview({ picks: Array.from({ length: 15 }, (_, i) => ({ symbol: `W${i}`, name: `W${i}`, type: 'ausbruch', price: 10, entry: 10.5, stop: 9, target: 13, score: 60 + i })), scan: {} });
  assert.equal(many.picks.length, 10, 'höchstens 10 zum Beobachten');
  assert.equal(o.mood, 'positiv');
  const o2 = R2.overview({ picks: [], scan: { checked: 427, now: [{ symbol: 'FTNT', name: 'Fortinet', price: 80, entry: 80, stop: 76, target: 88, score: 78, signal: 'kaufen', reasons: ['Trend'], history: { cases: 8, winRate: 62 } }],
    soon: [{ symbol: 'SAP.DE', name: 'SAP', price: 240, trigger: 244, stop: 233, target: 262, score: 70, signal: 'bald', setup: 'ausbruch', reasons: ['Ausbruch'] }], weak: [] } });
  assert.deepEqual(o2.picks.map((p) => `${p.symbol}:${p.verdict}`), ['FTNT:kaufen', 'SAP.DE:beobachten'], 'Kaufsignale aus dem Scan über alle Werte kommen dazu');
  assert.equal(o2.checked, 427);
});
