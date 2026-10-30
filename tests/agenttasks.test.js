// Aufgaben für die Agenten (lib/agenttasks.js): Server arbeitet ab, Ergebnis als Chat oder Dokument, Zustand für die App
const test = require('node:test');
const assert = require('node:assert');
const T = require('../lib/agenttasks');
const A = require('../lib/accounts');
const { memoryStore } = require('../lib/store');

const fakeChat = (answer, seen = []) => async ({ body, send }) => {
  seen.push(body);
  send('research', { status: 'done', sources: [{ n: 1, title: 'Lexikon', domain: 'bpb.de', url: 'https://bpb.de/a' }] });
  send('text', { text: answer });
};

test('Agenten-Aufgabe → neuer Chat im Verlauf (zu, nicht aktiv), Zustand „done“ mit Chat-ID; keine Rückfragen im Auftrag', async () => {
  const store = memoryStore(), seen = [];
  await A.storeChats(store, 'u1', { chats: [{ id: 'calt1', title: 'Alt', updated: 1, history: [] }], active: 'calt1', order: ['calt1'] });
  const st = await T.run({ store, uid: 'u1', task: { id: 'tabc12', title: 'Lernplan Bio', notes: 'Klausur Freitag', agent: 'learn' }, env: {}, runChat: fakeChat('## Plan\nMontag: Zellbiologie [1]', seen) });
  assert.strictEqual(st.state, 'done');
  assert.match(seen[0].messages[0].text, /KEINE Rückfragen/);
  assert.strictEqual(seen[0].agent, 'learn');
  const { chats, active } = await A.loadChats(store, 'u1');
  const c = chats.find((x) => x.id === st.chatId);
  assert.ok(c && c.closed && c.agent === 'learn' && c.title === 'Lernplan Bio');
  assert.strictEqual(c.history[1].sources[0].domain, 'bpb.de');
  assert.strictEqual(active, 'calt1', 'aktiver Chat bleibt');
  assert.strictEqual((await T.list(store, 'u1')).tabc12.chatId, st.chatId);
});

test('Agenten-Aufgabe → Dokument (Markdown als HTML, Quellen am Ende); leere Antwort → „failed“; hängengeblieben → „failed“', async () => {
  const store = memoryStore();
  const st = await T.run({ store, uid: 'u1', task: { id: 'tdoc12', title: 'Referat', agent: 'research', output: 'doc' }, env: {}, runChat: fakeChat('# Titel\n\n- **eins**\n- zwei [1]\n\n| a | b |\n|---|---|\n| 1 | 2 |') });
  const d = (await A.loadDocs(store, 'u1')).docs.find((x) => x.id === st.docId);
  assert.match(d.content, /<h1>Titel<\/h1><ul><li><strong>eins<\/strong><\/li><li>zwei <sup>\[1\]<\/sup><\/li><\/ul><table>/);
  assert.match(d.content, /<h2>Quellen<\/h2><ol><li><a href="https:\/\/bpb.de\/a">Lexikon<\/a>/);
  const bad = await T.run({ store, uid: 'u1', task: { id: 'tbad12', title: 'x' }, env: {}, runChat: async () => {} });
  assert.strictEqual(bad.state, 'failed');
  await T.setState(store, 'u1', 'thang1', { state: 'running' }, Date.now() - 10 * 60000);
  assert.strictEqual((await T.list(store, 'u1')).thang1.state, 'failed');
  await assert.rejects(T.run({ store, uid: 'u1', task: { id: '../x', title: 'x' }, env: {} }), /ungültig/);
});

test('Automatisierung: nächster Lauf in Berliner Zeit (täglich, werktags, wöchentlich, über die Zeitumstellung)', () => {
  const A = require('../lib/agenttasks');
  const de = (t) => new Date(t).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const fr = Date.parse('2026-10-30T17:40:00Z'); // Freitag 18:40
  assert.equal(de(A.nextRun({ every: 'daily', time: '07:00' }, fr)), '31.10.2026, 07:00:00');
  assert.equal(de(A.nextRun({ every: 'weekdays', time: '07:00' }, fr)), '2.11.2026, 07:00:00');
  assert.equal(de(A.nextRun({ every: 'weekly', time: '08:30', day: 3 }, fr)), '4.11.2026, 08:30:00');
  assert.equal(de(A.nextRun({ every: 'daily', time: '07:00' }, Date.parse('2026-10-24T12:00:00Z'))), '25.10.2026, 07:00:00');
  assert.equal(A.cleanRepeat({ every: 'stündlich', time: '07:00' }), null);
});

test('Automatisierung: fällige Läufe starten genau einmal und werden weitergestellt; Entfernen löscht auch den Index', async () => {
  const A = require('../lib/agenttasks');
  const store = require('../lib/store').memoryStore();
  const t0 = Date.parse('2026-10-30T05:00:00Z'); // 06:00 Berlin
  const a = await A.saveAuto(store, 'u1', { id: 'tauto1', title: 'Börsen-Update', agent: 'boerse', repeat: { every: 'daily', time: '07:00' } }, t0);
  assert.ok(a.next > t0);
  const ran = [];
  const start = async (uid, task) => { ran.push(`${uid}:${task.id}:${task.output}`); };
  assert.deepEqual(await A.runDue(store, { now: t0, start }), [], 'noch nicht fällig');
  const due = a.next + 1000;
  await Promise.all([A.runDue(store, { now: due, start }), A.runDue(store, { now: due, start })]);
  assert.equal(ran.length, 1, 'zwei gleichzeitige Aufrufe → nur ein Lauf');
  assert.equal(ran[0], 'u1:tauto1:doc', 'Ergebnis immer als Dokument');
  const after = await A.listAuto(store, 'u1');
  assert.ok(after.tauto1.next > due, 'nächster Termin weitergestellt');
  assert.deepEqual(await A.runDue(store, { now: due + 5000, start }), [], 'nicht nochmal');
  await A.removeAuto(store, 'u1', 'tauto1');
  assert.deepEqual(await A.listAuto(store, 'u1'), {});
  assert.deepEqual(await store.hgetall(A.AINDEX), {});
});

test('Aufgabe im Hintergrund: Titel geht immer mit, keine Rückfragen (noClarify)', async () => {
  const store = memoryStore(), seen = [];
  await T.run({ store, uid: 'u1', task: { id: 'tnurtitel1', title: 'Referat über Vulkane', agent: 'learn', output: 'doc' }, env: {}, runChat: fakeChat('# Vulkane\n\nText', seen) });
  assert.strictEqual(seen[0].noClarify, true);
  assert.match(seen[0].messages[0].text, /AUFGABE: Referat über Vulkane/);
});

test('Automatisierung mit Limit: läuft genau so oft, danach aus dem Zeitplan', async () => {
  const store = require('../lib/store').memoryStore();
  const t0 = Date.UTC(2026, 9, 26, 5, 0); // Mo 06:00 Berlin
  assert.strictEqual(T.cleanRepeat({ every: 'daily', time: '7:00', limit: 2 }).limit, 2);
  assert.strictEqual(T.cleanRepeat({ every: 'daily', time: '07:00', limit: 0 }).limit, undefined, '0 = ohne Limit');
  await T.saveAuto(store, 'u1', { id: 'tlim01', title: 'Vokabeln', repeat: { every: 'daily', time: '07:00', limit: 2 } }, t0);
  const start = async () => {};
  let now = t0;
  const runs = [];
  for (let i = 0; i < 4; i++) { now += 86400000; runs.push((await T.runDue(store, { now, start })).length); }
  assert.deepEqual(runs, [1, 1, 0, 0]);
  const a = (await T.listAuto(store, 'u1')).tlim01;
  assert.ok(a.finished && a.runs === 2);
});
