/* ===================================================================
   Geteilte Workspaces: Workspaces gehören zu einem Konto und können mit anderen Konten geteilt werden.
   - Teilen (Besitzer): E-Mail eintragen → Einladung. Gibt es das Konto noch nicht, wartet sie, bis es sich anmeldet.
   - Eingeladene sehen beim nächsten Öffnen der App ein großes Fenster: Annehmen → der Workspace erscheint bei ihnen,
     mit denselben Chats und Dokumenten (Inhalt liegt beim Besitzer, siehe lib/accounts.js → routeShared). Ablehnen → weg.
   - Name und Hund gelten für alle; Mitglieder können austreten, der Besitzer kann Mitglieder entfernen oder das Teilen beenden.
   Speicher:
     ws:<besitzer>:<wsId>        { ws, owner, name, dog, from, members: [{ email, state: 'pending'|'member', uid?, name? }], created }
     u:<id>:ws-eigen              [wsId, …]  – eigene geteilte Workspaces
     u:<id>:ws-geteilt            [{ ws, owner }, …]  – Mitgliedschaften (lib/accounts.js)
     ws:einladungen:<emailId>     [{ id, ws, owner, name, dog, from, at }, …]
   E-Mails stehen nur im Workspace des Besitzers (er hat sie selbst eingetippt), nie als Schlüssel.
   =================================================================== */
const crypto = require('crypto');
const ACC = require('./accounts');

const { HttpError, parse, K, WS_ID, SHARED_KEY } = ACC;
const META = (owner, ws) => `ws:${owner}:${ws}`;
const OWN = (uid) => K(uid, 'ws-eigen');
const INV = (eid) => `ws:einladungen:${eid}`;
const DOGS = ['general', 'research', 'learn', 'boerse', 'code', 'cat', 'fox', 'panda', 'penguin'];
const MAX_MEMBERS = 8;
const clean = (s, n = 32) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const dogOf = (d) => (DOGS.includes(d) ? d : 'general');

const getJson = async (store, key, d) => parse(await store.get(key), d);
const setJson = (store, key, v) => store.set(key, JSON.stringify(v));
const metaOf = (store, owner, ws) => getJson(store, META(owner, ws), null);

async function invitesOf(store, env, uid) {
  const eid = await ACC.emailIdOf(store, env, uid);
  return eid ? { eid, list: await getJson(store, INV(eid), []) } : { eid: null, list: [] };
}
async function dropInvite(store, eid, pred) {
  const list = await getJson(store, INV(eid), []);
  const rest = list.filter((i) => !pred(i));
  if (rest.length !== list.length) await setJson(store, INV(eid), rest);
}
async function setMembership(store, uid, ws, owner, on) {
  const list = (await getJson(store, SHARED_KEY(uid), [])).filter((x) => !(x.ws === ws && x.owner === owner));
  if (on) list.push({ ws, owner });
  await setJson(store, SHARED_KEY(uid), list);
}

/* Überblick für die App: geteilte Workspaces (eigene und fremde) + offene Einladungen */
async function overview(store, env, uid) {
  const shared = [];
  for (const ws of await getJson(store, OWN(uid), [])) {
    const m = await metaOf(store, uid, ws);
    if (m) shared.push({ ws, owner: uid, mine: true, name: m.name, dog: m.dog, members: m.members.map(({ email, state, name }) => ({ email, state, name: name || '' })) });
  }
  for (const r of await ACC.sharedWs(store, uid)) {
    const m = await metaOf(store, r.owner, r.ws);
    if (!m || !m.members.some((x) => x.uid === uid && x.state === 'member')) { await setMembership(store, uid, r.ws, r.owner, false); continue; }
    shared.push({ ws: r.ws, owner: r.owner, mine: false, name: m.name, dog: m.dog, from: m.from,
      members: [{ email: '', state: 'owner', name: m.from }, ...m.members.filter((x) => x.state === 'member').map(({ uid: id, name }) => ({ email: '', state: id === uid ? 'self' : 'member', name: name || '' }))] });
  }
  const { list } = await invitesOf(store, env, uid);
  const invites = [];
  for (const i of list) { // Workspace inzwischen gelöscht / Einladung zurückgezogen → nicht mehr zeigen
    const m = await metaOf(store, i.owner, i.ws);
    if (m) invites.push({ id: i.id, name: m.name, dog: m.dog, from: m.from, at: i.at, members: 1 + m.members.filter((x) => x.state === 'member').length });
  }
  return { shared, invites };
}

/* Besitzer teilt einen Workspace mit einer E-Mail */
async function share(store, env, uid, { ws, email, from }) {
  const id = String(ws?.id || '');
  if (!WS_ID.test(id)) throw new HttpError(400, 'Diesen Workspace kann man nicht teilen – lege dafür einen eigenen Workspace an.');
  email = ACC.normEmail(email);
  if (!ACC.EMAIL_RE.test(email)) throw new HttpError(400, 'Bitte gib eine gültige E-Mail-Adresse ein.');
  const target = await ACC.uidForEmail(store, env, email);
  if (target.uid === uid || target.eid === await ACC.emailIdOf(store, env, uid)) throw new HttpError(400, 'Das ist deine eigene E-Mail-Adresse.');
  const m = (await metaOf(store, uid, id)) || { ws: id, owner: uid, members: [], created: Date.now() };
  Object.assign(m, { name: clean(ws.name) || m.name || 'Workspace', dog: dogOf(ws.dog || m.dog), from: clean(from, 40) || m.from || 'Jemand' });
  const had = m.members.find((x) => x.email === email);
  if (had?.state === 'member') throw new HttpError(409, 'Diese Person ist schon im Workspace.');
  if (!had && m.members.length >= MAX_MEMBERS) throw new HttpError(400, `Höchstens ${MAX_MEMBERS} Personen pro Workspace.`);
  if (!had) m.members.push({ email, state: 'pending', eid: target.eid });
  await setJson(store, META(uid, id), m);
  const own = await getJson(store, OWN(uid), []);
  if (!own.includes(id)) await setJson(store, OWN(uid), [...own, id]);
  await dropInvite(store, target.eid, (i) => i.ws === id && i.owner === uid);
  const list = await getJson(store, INV(target.eid), []);
  list.push({ id: `i${crypto.randomBytes(6).toString('hex')}`, ws: id, owner: uid, at: Date.now() });
  await setJson(store, INV(target.eid), list.slice(-20));
  return overview(store, env, uid);
}

/* Eingeladene Person nimmt an oder lehnt ab */
async function answer(store, env, uid, { id, accept, name }) {
  const { eid, list } = await invitesOf(store, env, uid);
  const inv = list.find((i) => i.id === id);
  if (!eid || !inv) throw new HttpError(404, 'Diese Einladung gibt es nicht mehr.');
  await dropInvite(store, eid, (i) => i.id === id);
  const m = await metaOf(store, inv.owner, inv.ws);
  if (!m) throw new HttpError(404, 'Diesen Workspace gibt es nicht mehr.');
  const me = m.members.find((x) => x.eid === eid || (x.state === 'pending' && !x.eid));
  if (accept) {
    if (me) Object.assign(me, { state: 'member', uid, name: clean(name, 40) || me.name || '' });
    else m.members.push({ email: '', state: 'member', uid, eid, name: clean(name, 40) });
    await setMembership(store, uid, inv.ws, inv.owner, true);
  } else if (me) m.members = m.members.filter((x) => x !== me);
  await setJson(store, META(inv.owner, inv.ws), m);
  const out = await overview(store, env, uid);
  return { ...out, joined: accept ? out.shared.find((s) => s.ws === inv.ws && s.owner === inv.owner) || null : null };
}

/* Name/Hund ändern – gilt für alle im Workspace */
async function update(store, env, uid, { ws, owner, name, dog }) {
  owner = owner || uid;
  const m = await metaOf(store, owner, ws);
  if (!m) return overview(store, env, uid);
  if (owner !== uid && !m.members.some((x) => x.uid === uid && x.state === 'member')) throw new HttpError(403, 'Kein Zugriff auf diesen Workspace.');
  if (name != null) m.name = clean(name) || m.name;
  if (dog != null) m.dog = dogOf(dog);
  await setJson(store, META(owner, ws), m);
  return overview(store, env, uid);
}

/* Entfernen: Besitzer nimmt eine Person (oder Einladung) heraus · ohne E-Mail beendet er das Teilen ganz (Workspace gelöscht).
   Mitglied (owner ≠ eigenes Konto): tritt aus. */
async function remove(store, env, uid, { ws, owner, email }) {
  owner = owner || uid;
  const m = await metaOf(store, owner, ws);
  if (!m) return overview(store, env, uid);
  if (owner !== uid) { // austreten
    m.members = m.members.filter((x) => x.uid !== uid);
    await setJson(store, META(owner, ws), m);
    await setMembership(store, uid, ws, owner, false);
    return overview(store, env, uid);
  }
  const gone = email ? m.members.filter((x) => x.email === ACC.normEmail(email)) : m.members;
  for (const x of gone) {
    if (x.uid) await setMembership(store, x.uid, ws, owner, false);
    if (x.eid) await dropInvite(store, x.eid, (i) => i.ws === ws && i.owner === owner);
  }
  m.members = m.members.filter((x) => !gone.includes(x));
  if (email) await setJson(store, META(owner, ws), m);
  else {
    await store.del(META(owner, ws));
    await setJson(store, OWN(uid), (await getJson(store, OWN(uid), [])).filter((x) => x !== ws));
  }
  return overview(store, env, uid);
}

module.exports = { overview, share, answer, update, remove, MAX_MEMBERS };
