// Tests für die Tiefen-Recherche (lib/deepresearch.js) – Modelle, Websuche und Seiten simuliert, kein Netz.
const test = require('node:test');
const assert = require('node:assert/strict');
const DEEP = require('../lib/deepresearch');
const P = require('../lib/providers');
const WEB = require('../lib/web');
const R = require('../lib/research');

const quality = { trusted: /(^|\.)bpb\.de$/, academic: /(^|\.)(nature\.com|edu)$/, poor: /(^|\.)(reddit\.com|gutefrage\.net)$/, news: /(^|\.)tagesschau\.de$/ };
const orig = { task: P.smallJsonTask, search: WEB.searchWeb, read: WEB.readPage, research: R.research };
test.afterEach(() => { P.smallJsonTask = orig.task; WEB.searchWeb = orig.search; WEB.readPage = orig.read; R.research = orig.research; });

test('Tiefen-Recherche: plant Teilfragen, sucht und liest viele Quellen (ohne Foren), vergleicht, schließt Lücken, meldet jede Phase', async () => {
  const calls = [];
  P.smallJsonTask = async (env, { system }) => {
    calls.push(system === DEEP.PLAN_SYSTEM ? 'plan' : 'compare');
    if (system === DEEP.PLAN_SYSTEM) return { topic: 'Klimawandel', subs: [{ q: 'Ursachen?', web: ['ursachen klimawandel', 'causes climate change'], academic: 'climate change causes' }, { q: 'Folgen?', web: ['folgen klimawandel'], academic: 'climate impacts' }] };
    return { subs: [{ id: 1, claims: [{ claim: 'CO2 ist Hauptursache', sources: [1, 2, 99], status: 'agree' }, { claim: 'Sonne spielt große Rolle', sources: [3], status: 'agree' }], gaps: ['Zahlen fehlen'] },
      { id: 2, claims: [{ claim: 'Meeresspiegel steigt', sources: [2, 4], status: 'conflict', note: 'Höhe unterschiedlich' }], gaps: [] }],
      quality: [{ n: 1, rating: 'hoch', why: 'Institution' }, { n: 7, rating: 'super' }], followUp: ['klimawandel zahlen 2025'] };
  };
  let page = 0;
  WEB.searchWeb = async (q) => [
    { url: `https://www.bpb.de/${encodeURIComponent(q)}`, title: `bpb ${q}`, snippet: '' },
    { url: `https://www.reddit.com/r/x/${encodeURIComponent(q)}`, title: 'reddit', snippet: '' },
    { url: `https://news${page++}.tagesschau.de/${encodeURIComponent(q)}`, title: `ts ${q}`, snippet: '' },
  ];
  WEB.readPage = async (url) => ({ url, domain: R.domainOf(url), title: `Seite ${url}`, description: '', text: 'Langer Text über den Klimawandel. '.repeat(30), passage: 'x' });
  R.research = async () => ({ status: 'ok', sources: [{ title: 'Nature-Artikel', domain: 'nature.com', url: 'https://nature.com/a', type: 'article', text: 'Abstract zum Klima', publisher: 'Nature' }], counts: { queries: 2, found: 5, evaluated: 3 }, failures: [] });
  const events = [];
  const r = await DEEP.run({ env: {}, question: 'Was sind Ursachen und Folgen des Klimawandels?', quality, emit: (e) => events.push(e), limits: { maxPages: 6 } });
  assert.deepEqual(calls, ['plan', 'compare']);
  assert.equal(r.subs.length, 2);
  assert.ok(r.sources.length >= 5, `viele Quellen: ${r.sources.length}`);
  assert.ok(!r.sources.some((s) => /reddit/.test(s.domain)), 'Foren fallen raus');
  assert.equal(r.sources[0].domain, 'nature.com', 'Fachliteratur dabei');
  assert.ok(r.sources.every((s, i) => s.n === i + 1), 'fortlaufend nummeriert');
  // Vergleich abgesichert: unbekannte Quelle 99 raus, „agree“ mit nur einer Quelle → „single“, unbekannte Bewertung raus
  const c1 = r.comparison.subs[0].claims;
  assert.deepEqual(c1[0].sources, [1, 2]);
  assert.equal(c1[1].status, 'single');
  assert.deepEqual(r.comparison.stats, { claims: 3, agree: 1, conflict: 1, single: 1, high: 1 });
  assert.equal(r.comparison.quality.length, 1);
  assert.match(r.sources[0].note, /Qualität: hoch/);
  // Phasen in der richtigen Reihenfolge, Lücken wurden nachgesucht
  const phases = events.map((e) => e.phase).filter((p, i, a) => p !== a[i - 1]);
  assert.deepEqual(phases, ['plan', 'search', 'read', 'compare', 'deepen', 'search', 'read', 'deepen', 'write']);
  assert.ok(events.some((e) => e.phase === 'search' && e.query === 'klimawandel zahlen 2025'), 'Folgesuche');
  // Block für die Antwort
  const block = DEEP.comparisonBlock(r);
  assert.match(block, /\[ÜBEREINSTIMMEND\] CO2 ist Hauptursache \(Quellen \[1\] \[2\]\)/);
  assert.match(block, /\[WIDERSPRÜCHLICH\] Meeresspiegel steigt/);
  assert.match(block, /Was die Quellen sagen/);
});

test('Tiefen-Recherche: ohne Plan-Modell trotzdem Suche aus der Frage; ohne Quellen Status „failed“', async () => {
  P.smallJsonTask = async () => { throw new Error('kein Modell'); };
  WEB.searchWeb = async () => [];
  R.research = async () => ({ status: 'failed', sources: [], counts: { queries: 0, found: 0 }, failures: [] });
  const r = await DEEP.run({ env: {}, question: 'Was ist Photosynthese?', quality, emit: () => {} });
  assert.equal(r.subs.length, 1);
  assert.equal(r.status, 'failed');
  assert.equal(r.comparison, null);
});

test('Quellen-Rang: Wissenschaft vor Fachseite vor Nachrichten vor Rest, Foren gar nicht', () => {
  const rk = (u) => DEEP.rankDeep({ url: u }, quality);
  assert.ok(rk('https://nature.com/x') > rk('https://bpb.de/x'));
  assert.ok(rk('https://bpb.de/x') > rk('https://tagesschau.de/x'));
  assert.ok(rk('https://tagesschau.de/x') > rk('https://irgendwas.com/x'));
  assert.equal(rk('https://reddit.com/x'), null);
});
