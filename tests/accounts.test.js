// Konten: Anmelden mit Passwort + Code, Sitzungen, Speicher je Konto (lib/accounts.js, lib/store.js)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../lib/accounts');
const { memoryStore, fileStore } = require('../lib/store');

// Code abfangen statt E-Mail zu schicken (ohne RESEND_API_KEY am PC: Code im Terminal)
async function startAndCatch(store, body, env = {}) {
  const log = console.log;
  let code = null;
  console.log = (msg) => { const m = String(msg).match(/Code für \S+: (\d{6})/); if (m) code = m[1]; };
  try { const r = await A.startLogin(store, env, body, { onVercel: false }); return { ...r, code }; }
  finally { console.log = log; }
}

test('neues Konto: Code, dann Sitzung; falsches Passwort und falscher Code werden abgelehnt', async () => {
  const store = memoryStore();
  await assert.rejects(A.startLogin(store, {}, { email: 'kein-mail', password: 'geheim123' }, {}), /gültige E-Mail/);
  await assert.rejects(A.startLogin(store, {}, { email: 'a@b.de', password: 'kurz' }, {}), /mindestens 8/);
  const s = await startAndCatch(store, { email: ' A@B.de ', password: 'geheim123' });
  assert.equal(s.isNew, true);
  assert.equal(s.email, 'a@b.de');
  assert.match(s.code, /^\d{6}$/);
  const wrong = s.code === '000000' ? '111111' : '000000';
  await assert.rejects(A.verifyLogin(store, {}, { email: 'a@b.de', code: wrong }), /stimmt nicht/);
  const v = await A.verifyLogin(store, {}, { email: 'a@b.de', code: s.code });
  assert.ok(v.token && v.created && v.fresh);
  assert.equal((await A.sessionUser(store, v.token)).id, v.user.id);
  // E-Mail steht nirgends im Klartext im Speicher
  assert.ok(!JSON.stringify([...(await Promise.all(['cfg:owner', `user:${v.user.id}`].map((k) => store.get(k))))]).includes('a@b.de'));
  // nur EIN Konto: andere E-Mail wird abgewiesen (gleiche Meldung wie falsches Passwort)
  await assert.rejects(A.startLogin(store, {}, { email: 'zweiter@b.de', password: 'geheim123' }, {}), /E-Mail oder Passwort stimmt nicht/);
  // Code ist nur einmal gültig
  await assert.rejects(A.verifyLogin(store, {}, { email: 'a@b.de', code: s.code }), /abgelaufen/);
  // bestehendes Konto: Passwort muss stimmen
  await assert.rejects(A.startLogin(store, {}, { email: 'a@b.de', password: 'falsch999' }, {}), /stimmt nicht/);
  const again = await startAndCatch(store, { email: 'a@b.de', password: 'geheim123' });
  assert.equal(again.isNew, false);
  await A.logout(store, v.token);
  assert.equal(await A.sessionUser(store, v.token), null);
});

test('nach 5 falschen Codes ist Schluss', async () => {
  const store = memoryStore();
  const s = await startAndCatch(store, { email: 'x@y.de', password: 'geheim123' });
  const wrong = s.code === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) await assert.rejects(A.verifyLogin(store, {}, { email: 'x@y.de', code: wrong }));
  await assert.rejects(A.verifyLogin(store, {}, { email: 'x@y.de', code: s.code }), /Zu viele|abgelaufen/);
});

test('ALLOWED_EMAILS begrenzt neue Konten', async () => {
  const store = memoryStore();
  await assert.rejects(A.startLogin(store, { ALLOWED_EMAILS: 'ich@mail.de' }, { email: 'fremd@mail.de', password: 'geheim123' }, {}), /kein Konto/);
  const s = await startAndCatch(store, { email: 'Ich@Mail.de', password: 'geheim123' }, { ALLOWED_EMAILS: 'ich@mail.de, du@mail.de' });
  assert.equal(s.isNew, true);
});

test('auf Vercel ohne RESEND_API_KEY: klare Fehlermeldung statt stillem Fehlschlag', async () => {
  await assert.rejects(A.startLogin(memoryStore(), {}, { email: 'a@b.de', password: 'geheim123' }, { onVercel: true }), /E-Mail-Versand/);
});

test('Chats je Konto: nur geänderte schicken, nie stilles Löschen, alter Stand überschreibt keinen neuen', async () => {
  const store = memoryStore();
  const chat = (id, updated, n) => ({ id, title: id, updated, history: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: String(i) })) });
  await A.storeChats(store, 'u1', { chats: [chat('caaaa1', 10, 2), chat('cbbbb2', 10, 2)], order: ['caaaa1', 'cbbbb2'], active: 'cbbbb2' });
  // nur ein Chat geändert, Reihenfolge umgedreht – der andere bleibt
  await A.storeChats(store, 'u1', { chats: [chat('cbbbb2', 20, 4)], order: ['cbbbb2', 'caaaa1'], active: 'cbbbb2' });
  let r = await A.loadChats(store, 'u1');
  assert.deepEqual(r.chats.map((c) => c.id), ['cbbbb2', 'caaaa1']);
  assert.equal(r.chats[0].history.length, 4);
  // veralteter Stand aus einem alten Tab
  await A.storeChats(store, 'u1', { chats: [chat('cbbbb2', 15, 1)] });
  r = await A.loadChats(store, 'u1');
  assert.equal(r.chats.find((c) => c.id === 'cbbbb2').history.length, 4);
  // ausdrücklich gelöscht → weg und bleibt weg
  await A.storeChats(store, 'u1', { chats: [], deleted: ['caaaa1'] });
  await A.storeChats(store, 'u1', { chats: [chat('caaaa1', 99, 9)] });
  r = await A.loadChats(store, 'u1');
  assert.deepEqual(r.chats.map((c) => c.id), ['cbbbb2']);
  // anderes Konto sieht nichts
  assert.equal((await A.loadChats(store, 'u2')).chats.length, 0);
});

test('Browser-Speicher des Kontos: setzen, löschen, ungültige Schlüssel ignorieren', async () => {
  const store = memoryStore();
  await A.patchStorage(store, 'u1', { set: { 'settings.keys.v1': '{"GEMINI_API_KEY":"x"}', 'tasks.v1': '[]', 'bad key!': 'x' } });
  await A.patchStorage(store, 'u1', { del: ['tasks.v1'] });
  assert.deepEqual(await A.getStorage(store, 'u1'), { 'settings.keys.v1': '{"GEMINI_API_KEY":"x"}' });
  assert.equal(await A.isFresh(store, 'u1'), false);
  assert.equal(await A.isFresh(store, 'u2'), true);
});

test('Dateispeicher (am PC) kann dasselbe wie der Arbeitsspeicher', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konten-'));
  try {
    const store = fileStore(dir);
    await store.set('a', '1', 1);
    assert.equal(await store.get('a'), '1');
    assert.equal(await store.incr('n', 60), 1);
    assert.equal(await store.incr('n', 60), 2);
    await store.hset('u:x:chats', { 'c:1': 'eins', 'c/2': 'zwei' });
    assert.deepEqual(await store.hgetall('u:x:chats'), { 'c:1': 'eins', 'c/2': 'zwei' });
    assert.deepEqual(await store.hmget('u:x:chats', ['c/2', 'fehlt']), ['zwei', null]);
    await store.hdel('u:x:chats', ['c:1']);
    assert.deepEqual(await store.hkeys('u:x:chats'), ['c/2']);
    await store.del('a');
    assert.equal(await store.get('a'), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('feste Zugangsdaten aus Vercel: LOGIN_EMAIL/LOGIN_PASSWORD, direkt ohne Code', async () => {
  const store = memoryStore();
  const env = { LOGIN_EMAIL: 'Ich@Mail.de', LOGIN_PASSWORD: 'MeinPasswort!' };
  await assert.rejects(A.startLogin(store, env, { email: 'ich@mail.de', password: 'falsch' }, {}), /stimmt nicht/);
  await assert.rejects(A.startLogin(store, env, { email: 'du@mail.de', password: 'MeinPasswort!' }, {}), /stimmt nicht/);
  // ohne Code: direkt angemeldet
  const d = await A.startLogin(store, env, { email: ' ich@mail.de ', password: 'MeinPasswort!' }, {});
  assert.equal(d.mode, 'direct');
  const uid = (await A.sessionUser(store, d.session.token)).id;
  // LOGIN_CODE wird nicht mehr benutzt: weiterhin direkt, gleiches Konto
  const d2 = await A.startLogin(store, { ...env, LOGIN_CODE: '482915' }, { email: 'ich@mail.de', password: 'MeinPasswort!' }, {});
  assert.equal(d2.mode, 'direct');
  assert.equal((await A.sessionUser(store, d2.session.token)).id, uid);
});

test('Löschen ist endgültig: kein Papierkorb, auch aus Rettungs-Kopien entfernt, kommt von anderen Geräten nicht zurück', async () => {
  const ACC = require('../lib/accounts');
  const store = require('../lib/store').memoryStore();
  await store.hset('u:u9:chats:papierkorb', { alt: '{"id":"calt01"}' }); // Rest aus einer früheren Version
  await ACC.storeChats(store, 'u9', { chats: [{ id: 'cabcde1', title: 'Geheim', history: [{ role: 'user', text: 'x' }], updated: 1 }, { id: 'cabcde2', title: 'Bleibt', history: [], updated: 1 }] });
  await ACC.addRecovery(store, 'u9', { chats: [{ id: 'cabcde1', title: 'Geheim' }, { id: 'cabcde2', title: 'Bleibt' }] });
  await ACC.storeChats(store, 'u9', { chats: [], deleted: ['cabcde1'] });
  const { chats } = await ACC.loadChats(store, 'u9');
  assert.deepEqual(chats.map((c) => c.id), ['cabcde2']);
  assert.deepEqual(await store.hgetall('u:u9:chats:papierkorb'), {}, 'kein Papierkorb');
  const rec = Object.values(await store.hgetall('u:u9:wiederherstellung')).map((v) => JSON.parse(v));
  assert.ok(rec.every((b) => !b.chats.some((c) => c.id === 'cabcde1')), 'auch aus der Rettungs-Kopie entfernt');
  await ACC.storeChats(store, 'u9', { chats: [{ id: 'cabcde1', title: 'Geheim', history: [], updated: 9 }] }); // altes Gerät schickt ihn noch
  assert.deepEqual((await ACC.loadChats(store, 'u9')).chats.map((c) => c.id), ['cabcde2'], 'gelöscht bleibt gelöscht');
});
