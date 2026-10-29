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
