/* ===================================================================
   Konten: Anmelden mit E-Mail + Passwort + 6-stelligem Code per E-Mail, Sitzungen,
   und alles, was zu einem Konto gehört (Chats, Dokumente, Einstellungen/API-Keys aus dem Browser).
   Ablauf:
   1. /api/auth/start  – E-Mail + Passwort. Gibt es das Konto, muss das Passwort stimmen; sonst wird es mit
                         diesem Passwort neu angelegt (erst nach dem Code). Dann geht ein Code per E-Mail raus.
   2. /api/auth/verify – Code prüfen (10 Minuten gültig, höchstens 5 Versuche) → Sitzung (Cookie „sid“, 180 Tage).
   Gespeichert wird nie das Passwort oder der Code selbst, nur ihr Hash.
   =================================================================== */
const crypto = require('crypto');

class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }

const CODE_TTL = 10 * 60;              // Sekunden
const CODE_TRIES = 5;
const SEND_PER_HOUR = 6;
const SESSION_TTL = 180 * 24 * 3600;   // Sekunden
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

const normEmail = (e) => String(e || '').trim().toLowerCase();
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/* ---------- Passwort (scrypt) ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(want, got);
}

/* Geheimer Zusatz für Code-Hashes: einmal erzeugt und im Speicher abgelegt (oder AUTH_SECRET) */
async function pepper(store, env) {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  let p = await store.get('cfg:pepper');
  if (!p) { p = crypto.randomBytes(32).toString('hex'); await store.set('cfg:pepper', p); }
  return p;
}
const codeHash = (pep, email, code) => crypto.createHmac('sha256', pep).update(`${email}|${code}`).digest('hex');

/* Wer darf ein Konto anlegen? ALLOWED_EMAILS (Komma-Liste) – leer = alle */
function allowed(env, email) {
  const list = String(env.ALLOWED_EMAILS || '').split(/[,;\s]+/).map(normEmail).filter(Boolean);
  return !list.length || list.includes(email);
}

/* ---------- E-Mail mit dem Code (Resend, ohne Abhängigkeiten) ---------- */
function mailHtml(code, isNew) {
  const digits = code.split('').map((d) => `<td style="width:40px;height:48px;border:1px solid #2a2a2a;border-radius:10px;background:#1c1c1c;color:#f2f2f2;font:600 22px Inter,Arial,sans-serif;text-align:center">${d}</td>`).join('<td style="width:6px"></td>');
  return `<div style="background:#141414;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#e6e6e6">
  <div style="max-width:420px;margin:0 auto;background:#171717;border:1px solid #242424;border-radius:14px;padding:28px">
    <div style="font-size:15px;font-weight:600;color:#f2f2f2;margin-bottom:6px">${isNew ? 'Willkommen bei Agenten' : 'Anmelden bei Agenten'}</div>
    <div style="font-size:13px;color:#a3a3a3;margin-bottom:22px">Dein Code (10 Minuten gültig):</div>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 22px"><tr>${digits}</tr></table>
    <div style="font-size:12px;color:#6e6e6e">Wenn du das nicht warst, kannst du diese E-Mail ignorieren.</div>
  </div></div>`;
}
async function sendCodeMail(env, email, code, isNew, { onVercel }) {
  const key = env.RESEND_API_KEY;
  if (!key) {
    if (onVercel) throw new HttpError(503, 'Der E-Mail-Versand ist noch nicht eingerichtet (RESEND_API_KEY fehlt in Vercel).');
    console.log(`\n[Anmeldung] Code für ${email}: ${code}  (kein RESEND_API_KEY – Code nur hier im Terminal)\n`);
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM || 'Agenten <onboarding@resend.dev>',
      to: [email],
      subject: `${code} ist dein Code für Agenten`,
      text: `Dein Code: ${code}\n\nEr ist 10 Minuten gültig. Wenn du das nicht warst, ignoriere diese E-Mail.`,
      html: mailHtml(code, isNew),
    }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    console.log('[Anmeldung] Resend:', r.status, j.message || j.name || '');
    throw new HttpError(502, r.status === 403 && /domain|testing|own email/i.test(j.message || '')
      ? 'Die E-Mail konnte nicht gesendet werden: Ohne eigene Domain verschickt Resend nur an die E-Mail-Adresse deines Resend-Kontos.'
      : 'Die E-Mail mit dem Code konnte nicht gesendet werden. Versuch es gleich noch einmal.');
  }
}

/* ---------- Schritt 1: Passwort prüfen, Code schicken ---------- */
async function startLogin(store, env, { email, password }, opts = {}) {
  email = normEmail(email);
  password = String(password || '');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Bitte gib eine gültige E-Mail-Adresse ein.');
  if (!password) throw new HttpError(400, 'Bitte gib dein Passwort ein.');
  if (password.length > 200) throw new HttpError(400, 'Das Passwort ist zu lang.');
  const uid = await store.get(`user:email:${email}`);
  let pwHash = null;
  if (uid) {
    const user = JSON.parse((await store.get(`user:${uid}`)) || 'null');
    // falsche Versuche bremsen (pro E-Mail)
    const fails = Number(await store.get(`rate:pw:${email}`)) || 0;
    if (fails >= 10) throw new HttpError(429, 'Zu viele falsche Versuche. Warte ein paar Minuten.');
    if (!user || !checkPassword(password, user.pw)) {
      await store.incr(`rate:pw:${email}`, 15 * 60);
      throw new HttpError(401, 'E-Mail oder Passwort stimmt nicht.');
    }
  } else {
    if (!allowed(env, email)) throw new HttpError(403, 'Mit dieser E-Mail-Adresse kann kein Konto angelegt werden.');
    if (password.length < 8) throw new HttpError(400, 'Neues Konto: Das Passwort braucht mindestens 8 Zeichen.');
    pwHash = hashPassword(password);
  }
  const sent = await store.incr(`rate:send:${email}`, 3600);
  if (sent > SEND_PER_HOUR) throw new HttpError(429, 'Zu viele Codes angefordert. Versuch es in einer Stunde wieder.');
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  const pep = await pepper(store, env);
  await store.set(`code:${email}`, JSON.stringify({ h: codeHash(pep, email, code), tries: 0, pw: pwHash, exp: Date.now() + CODE_TTL * 1000 }), CODE_TTL);
  await sendCodeMail(env, email, code, !uid, opts);
  return { ok: true, isNew: !uid, email };
}

/* ---------- Schritt 2: Code prüfen → Sitzung ---------- */
async function verifyLogin(store, env, { email, code }) {
  email = normEmail(email);
  code = String(code || '').replace(/\D/g, '');
  if (code.length !== 6) throw new HttpError(400, 'Der Code hat 6 Ziffern.');
  const rec = JSON.parse((await store.get(`code:${email}`)) || 'null');
  if (!rec || rec.exp < Date.now()) throw new HttpError(410, 'Der Code ist abgelaufen. Fordere einen neuen an.');
  if (rec.tries >= CODE_TRIES) { await store.del(`code:${email}`); throw new HttpError(429, 'Zu viele falsche Versuche. Fordere einen neuen Code an.'); }
  const pep = await pepper(store, env);
  const ok = crypto.timingSafeEqual(Buffer.from(rec.h, 'hex'), Buffer.from(codeHash(pep, email, code), 'hex'));
  if (!ok) {
    rec.tries++;
    await store.set(`code:${email}`, JSON.stringify(rec), Math.max(1, Math.ceil((rec.exp - Date.now()) / 1000)));
    throw new HttpError(401, rec.tries >= CODE_TRIES ? 'Zu viele falsche Versuche. Fordere einen neuen Code an.' : 'Der Code stimmt nicht.');
  }
  await store.del(`code:${email}`);
  await store.del(`rate:pw:${email}`);
  let uid = await store.get(`user:email:${email}`);
  let created = false;
  if (!uid) {
    if (!rec.pw) throw new HttpError(400, 'Bitte melde dich noch einmal an.');
    uid = `u${crypto.randomBytes(9).toString('hex')}`;
    await store.set(`user:${uid}`, JSON.stringify({ id: uid, email, pw: rec.pw, created: Date.now() }));
    await store.set(`user:email:${email}`, uid);
    created = true;
  }
  const token = crypto.randomBytes(32).toString('base64url');
  await store.set(`sess:${sha(token)}`, JSON.stringify({ uid, email, at: Date.now() }), SESSION_TTL);
  return { token, maxAge: SESSION_TTL, user: { id: uid, email }, created, fresh: created || await isFresh(store, uid) };
}

async function sessionUser(store, token) {
  if (!token || token.length > 100) return null;
  const key = `sess:${sha(token)}`;
  const s = JSON.parse((await store.get(key)) || 'null');
  if (!s?.uid) return null;
  // angemeldet bleiben: wer die App benutzt, bekommt einmal am Tag wieder volle 180 Tage
  let renewed = false;
  if (Date.now() - (s.seen || s.at || 0) > 24 * 3600 * 1000) { s.seen = Date.now(); await store.set(key, JSON.stringify(s), SESSION_TTL); renewed = true; }
  return { id: s.uid, email: s.email, renewed };
}
async function logout(store, token) { if (token) await store.del(`sess:${sha(token)}`); }

/* ===================================================================
   Daten eines Kontos
   =================================================================== */
const K = (uid, what) => `u:${uid}:${what}`;
const CHAT_ID = /^c[a-z0-9]{4,30}$/;
const DOC_ID = /^d[a-z0-9]{4,30}$/;
const parse = (s, d = null) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

async function isFresh(store, uid) {
  const [ls, chats, docs] = await Promise.all([store.hkeys(K(uid, 'ls')), store.hkeys(K(uid, 'chats')), store.hkeys(K(uid, 'docs'))]);
  return !ls.length && !chats.length && !docs.length;
}

// neuer als der gespeicherte Stand? (Zeitstempel; bei Chats zählt zusätzlich die Länge des Verlaufs) – wie bei den Dateien am PC
function isNewer(incoming, existing) {
  if (!existing) return true;
  const a = Number(incoming.updated) || 0, b = Number(existing.updated) || 0;
  if (a !== b) return a > b;
  const la = Array.isArray(incoming.history) ? incoming.history.length : (incoming.content || '').length;
  const lb = Array.isArray(existing.history) ? existing.history.length : (existing.content || '').length;
  return la >= lb;
}

/* Gemeinsam für Chats und Dokumente: nie stilles Löschen (nur ausdrücklich „deleted“ → Papierkorb),
   gelöscht bleibt gelöscht, alter Stand überschreibt nie neueren. Fehlende Einträge bleiben einfach liegen. */
async function storeItems(store, uid, kind, items, deleted, idRe) {
  const tombKey = K(uid, `${kind}:geloescht`);
  const dead = new Set(parse(await store.get(tombKey), []));
  const gone = (Array.isArray(deleted) ? deleted : []).map(String).filter((id) => idRe.test(id) && !dead.has(id));
  if (gone.length) { gone.forEach((id) => dead.add(id)); await store.set(tombKey, JSON.stringify([...dead])); }
  const live = items.filter((it) => !dead.has(it.id));
  const existing = await store.hmget(K(uid, kind), live.map((it) => it.id));
  const write = {};
  live.forEach((it, i) => { if (isNewer(it, parse(existing[i]))) write[it.id] = JSON.stringify(it); });
  await store.hset(K(uid, kind), write);
  if (gone.length) {
    const old = await store.hmget(K(uid, kind), gone);
    const trash = {};
    gone.forEach((id, i) => { if (old[i] != null) trash[`${Date.now()}_${id}`] = old[i]; });
    await store.hset(K(uid, `${kind}:papierkorb`), trash);
    await store.hdel(K(uid, kind), gone);
  }
  return dead;
}

async function loadChats(store, uid) {
  const [all, meta, tomb] = await Promise.all([store.hgetall(K(uid, 'chats')), store.get(K(uid, 'chats:meta')), store.get(K(uid, 'chats:geloescht'))]);
  const dead = new Set(parse(tomb, []));
  const state = parse(meta, {});
  const chats = Object.values(all).map((s) => parse(s)).filter((c) => c && CHAT_ID.test(c.id) && !dead.has(c.id));
  const order = Array.isArray(state.order) ? state.order : [];
  chats.sort((a, b) => ((order.indexOf(a.id) + 1) || 1e9) - ((order.indexOf(b.id) + 1) || 1e9));
  return { active: state.active || null, chats };
}
// chats: nur die geänderten (oder alle); order: Reihenfolge aller Chats im Browser
async function storeChats(store, uid, { active, chats, deleted, order }) {
  const list = (Array.isArray(chats) ? chats : []).filter((c) => c && CHAT_ID.test(c.id));
  const dead = await storeItems(store, uid, 'chats', list, deleted, CHAT_ID);
  const known = (await store.hkeys(K(uid, 'chats'))).filter((id) => !dead.has(id));
  const want = (Array.isArray(order) ? order : list.map((c) => c.id)).map(String).filter((id) => CHAT_ID.test(id) && known.includes(id));
  const full = [...new Set([...want, ...known])]; // Chats nur auf dem Server hinten anhängen (nie verlieren)
  await store.set(K(uid, 'chats:meta'), JSON.stringify({ active: CHAT_ID.test(active) ? active : null, order: full }));
}

async function loadDocs(store, uid) {
  const [all, meta, tomb] = await Promise.all([store.hgetall(K(uid, 'docs')), store.get(K(uid, 'docs:meta')), store.get(K(uid, 'docs:geloescht'))]);
  const dead = new Set(parse(tomb, []));
  const docs = Object.values(all).map((s) => parse(s)).filter((d) => d && DOC_ID.test(d.id) && !dead.has(d.id));
  return { docs, projects: parse(meta, {}).projects || [] };
}
async function storeDocs(store, uid, { docs, projects, deleted }) {
  const list = (Array.isArray(docs) ? docs : []).filter((d) => d && DOC_ID.test(d.id));
  await storeItems(store, uid, 'docs', list, deleted, DOC_ID);
  if (Array.isArray(projects) && projects.length) await store.set(K(uid, 'docs:meta'), JSON.stringify({ projects: projects.slice(0, 200) }));
}

/* Browser-Speicher des Kontos (Einstellungen, API-Keys, Aufgaben, Kalender, Tags, Darstellung …) */
const LS_KEY = /^[\w.:\-]{1,120}$/;
const LS_MAX = 3 * 1024 * 1024; // je Wert
async function getStorage(store, uid) { return store.hgetall(K(uid, 'ls')); }
async function patchStorage(store, uid, { set, del }) {
  const put = {};
  for (const [k, v] of Object.entries(set && typeof set === 'object' ? set : {})) {
    if (!LS_KEY.test(k) || typeof v !== 'string' || v.length > LS_MAX) continue;
    put[k] = v;
  }
  if (Object.keys(put).length > 400) throw new HttpError(400, 'Zu viele Einträge auf einmal.');
  await store.hset(K(uid, 'ls'), put);
  const rm = (Array.isArray(del) ? del : []).map(String).filter((k) => LS_KEY.test(k) && !(k in put));
  await store.hdel(K(uid, 'ls'), rm);
}

async function getAppearance(store, uid) { return parse(await store.get(K(uid, 'darstellung')), {}); }
async function setAppearance(store, uid, b) {
  const clean = { mode: ['dark', 'black', 'light'].includes(b.mode) ? b.mode : 'dark', accent: /^#[0-9a-f]{6}$/i.test(b.accent) ? b.accent : '#2f86ff', tiles: Math.max(0, Math.min(100, Number(b.tiles) || 0)) };
  await store.set(K(uid, 'darstellung'), JSON.stringify(clean));
}
async function addRecovery(store, uid, body) {
  const s = JSON.stringify(body);
  if (s.length > 8 * 1024 * 1024) throw new HttpError(413, 'Zu groß');
  await store.hset(K(uid, 'wiederherstellung'), { [new Date().toISOString()]: s });
}

module.exports = {
  HttpError, normEmail, hashPassword, checkPassword, startLogin, verifyLogin, sessionUser, logout, isFresh,
  loadChats, storeChats, loadDocs, storeDocs, getStorage, patchStorage, getAppearance, setAppearance, addRecovery,
  SESSION_TTL, CODE_TTL,
};
