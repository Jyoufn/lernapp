// Geteilte Workspaces (lib/workspaces.js + Weiterleitung in lib/accounts.js) und weitere feste Konten (LOGIN_EMAIL_2)
const test = require('node:test');
const assert = require('node:assert');
const A = require('../lib/accounts');
const W = require('../lib/workspaces');
const { memoryStore } = require('../lib/store');

const env = { LOGIN_EMAIL: 'julian@example.de', LOGIN_PASSWORD: 'geheim123', LOGIN_EMAIL_2: 'freund@example.de', LOGIN_PASSWORD_2: 'anderes99' };
const login = async (store, email, password) => {
  const r = await A.startLogin(store, env, { email, password });
  return A.sessionUser(store, r.session.token).then((u) => u.id);
};

test('zweites festes Konto (LOGIN_EMAIL_2) meldet sich an und ist ein eigenes Konto; falsches Passwort → 401', async () => {
  const store = memoryStore();
  const a = await login(store, 'julian@example.de', 'geheim123');
  const b = await login(store, 'freund@example.de', 'anderes99');
  assert.ok(a && b && a !== b);
  assert.strictEqual(await login(store, 'julian@example.de', 'geheim123'), a, 'Hauptkonto bleibt gleich');
  await assert.rejects(() => A.startLogin(store, env, { email: 'freund@example.de', password: 'geheim123' }), /stimmt nicht/);
  await assert.rejects(() => A.startLogin(store, env, { email: 'fremd@example.de', password: 'geheim123' }), /stimmt nicht/);
});

test('teilen → Einladung → annehmen: Mitglied sieht dieselben Chats/Dokumente und schreibt beim Besitzer mit', async () => {
  const store = memoryStore();
  const a = await login(store, 'julian@example.de', 'geheim123');
  const b = await login(store, 'freund@example.de', 'anderes99');
  await A.storeChats(store, a, { chats: [{ id: 'cteam1', title: 'Team-Chat', ws: 'wteam1', updated: 5, history: [{ role: 'user', text: 'Hallo' }] }, { id: 'cpriv1', title: 'Privat', updated: 5, history: [] }], order: ['cteam1', 'cpriv1'] });
  await A.storeDocs(store, a, { docs: [{ id: 'dteam1', title: 'Protokoll', ws: 'wteam1', updated: 5, content: '<p>x</p>' }] });

  await assert.rejects(() => W.share(store, env, a, { ws: { id: 'main' }, email: 'freund@example.de' }), /nicht teilen/);
  await assert.rejects(() => W.share(store, env, a, { ws: { id: 'wteam1' }, email: 'julian@example.de' }), /eigene/);
  const o = await W.share(store, env, a, { ws: { id: 'wteam1', name: 'Lerngruppe', dog: 'learn' }, email: 'Freund@Example.de', from: 'Julian' });
  assert.deepStrictEqual(o.shared[0].members.map((m) => [m.email, m.state]), [['freund@example.de', 'pending']]);

  const inv = (await W.overview(store, env, b)).invites;
  assert.strictEqual(inv.length, 1);
  assert.strictEqual(inv[0].name, 'Lerngruppe');
  assert.strictEqual(inv[0].from, 'Julian');
  assert.strictEqual((await A.loadChats(store, b)).chats.length, 0, 'vor dem Annehmen nichts sichtbar');

  const r = await W.answer(store, env, b, { id: inv[0].id, accept: true, name: 'Max' });
  assert.strictEqual(r.joined.ws, 'wteam1');
  assert.strictEqual(r.invites.length, 0);
  const seen = await A.loadChats(store, b);
  assert.deepStrictEqual(seen.chats.map((c) => c.id), ['cteam1'], 'nur Chats des geteilten Workspace');
  assert.deepStrictEqual((await A.loadDocs(store, b)).docs.map((d) => d.id), ['dteam1']);

  // Mitglied schreibt weiter und legt einen neuen Chat an → landet beim Besitzer; eigener Chat bleibt bei ihm
  await A.storeChats(store, b, { chats: [{ ...seen.chats[0], updated: 9, history: [...seen.chats[0].history, { role: 'assistant', text: 'Hi' }] }, { id: 'cteam2', title: 'Neu', ws: 'wteam1', updated: 9, history: [] }, { id: 'cmein1', title: 'Meins', updated: 9, history: [] }], order: [] });
  const owner = await A.loadChats(store, a);
  assert.strictEqual(owner.chats.find((c) => c.id === 'cteam1').history.length, 2);
  assert.ok(owner.chats.some((c) => c.id === 'cteam2'));
  assert.ok(!owner.chats.some((c) => c.id === 'cmein1'));
  // Löschen durch das Mitglied löscht beim Besitzer
  await A.storeChats(store, b, { chats: [], deleted: ['cteam2'], order: [] });
  assert.ok(!(await A.loadChats(store, a)).chats.some((c) => c.id === 'cteam2'));

  // Name gilt für alle; Mitglied sieht Besitzer + sich
  const after = await W.update(store, env, b, { ws: 'wteam1', owner: a, name: 'Abi-Gruppe' });
  assert.strictEqual(after.shared[0].name, 'Abi-Gruppe');
  assert.deepStrictEqual(after.shared[0].members.map((m) => m.state), ['owner', 'self']);
  assert.strictEqual((await W.overview(store, env, a)).shared[0].members[0].state, 'member');

  // Besitzer entfernt die Person → sie sieht nichts mehr
  await W.remove(store, env, a, { ws: 'wteam1', email: 'freund@example.de' });
  assert.deepStrictEqual((await A.loadChats(store, b)).chats.map((c) => c.id), ['cmein1']);
  assert.strictEqual((await W.overview(store, env, b)).shared.length, 0);
});

test('ablehnen, austreten und Teilen beenden; Einladung an ein Konto, das es noch nicht gibt, wartet bis zur Anmeldung', async () => {
  const store = memoryStore();
  const a = await login(store, 'julian@example.de', 'geheim123');
  await W.share(store, env, a, { ws: { id: 'wabc12', name: 'Projekt' }, email: 'freund@example.de', from: 'Julian' });
  const b = await login(store, 'freund@example.de', 'anderes99'); // meldet sich erst jetzt zum ersten Mal an
  let inv = (await W.overview(store, env, b)).invites;
  assert.strictEqual(inv.length, 1);
  await W.answer(store, env, b, { id: inv[0].id, accept: false });
  assert.strictEqual((await W.overview(store, env, b)).invites.length, 0);
  assert.strictEqual((await W.overview(store, env, a)).shared[0].members.length, 0, 'abgelehnt → nicht mehr eingeladen');

  await W.share(store, env, a, { ws: { id: 'wabc12', name: 'Projekt' }, email: 'freund@example.de', from: 'Julian' });
  inv = (await W.overview(store, env, b)).invites;
  await W.answer(store, env, b, { id: inv[0].id, accept: true });
  await W.remove(store, env, b, { ws: 'wabc12', owner: a }); // austreten
  assert.strictEqual((await W.overview(store, env, b)).shared.length, 0);

  await W.share(store, env, a, { ws: { id: 'wabc12' }, email: 'freund@example.de' });
  await W.remove(store, env, a, { ws: 'wabc12' }); // Workspace gelöscht → Einladung verschwindet
  assert.strictEqual((await W.overview(store, env, b)).invites.length, 0);
  assert.strictEqual((await W.overview(store, env, a)).shared.length, 0);
});
