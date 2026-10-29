/* ===================================================================
   Planspiel Börse (Sparkasse/LzO): Zugangsdaten je Konto – sicher auf dem Server.
   - Benutzername + Passwort/Code werden mit AES-256-GCM verschlüsselt im Konto-Speicher abgelegt (u:<uid>:planspiel).
   - Schlüssel: PLANSPIEL_SECRET (Umgebungsvariable, empfohlen) – sonst ein zufälliger Schlüssel, der einmal im Speicher angelegt wird.
   - Das Passwort geht NIE zurück an den Browser: status() liefert nur „verbunden“ und den Benutzernamen.
   - credentials() ist nur für den Server gedacht (spätere Order-Automatik); es gibt dafür keine Route.
   =================================================================== */
const crypto = require('crypto');

const KEY = (uid) => `u:${uid}:planspiel`;
const KEY_STORE = 'cfg:planspiel-key';

async function secretKey(store, env = {}) {
  if (env.PLANSPIEL_SECRET) return crypto.createHash('sha256').update(String(env.PLANSPIEL_SECRET)).digest();
  let k = await store.get(KEY_STORE);
  if (!k) { k = crypto.randomBytes(32).toString('base64'); await store.set(KEY_STORE, k); }
  return Buffer.from(k, 'base64');
}
function seal(key, text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
function open(key, sealed) {
  const [iv, tag, data] = String(sealed).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

async function save(store, env, uid, { user, code } = {}) {
  const u = clean(user, 80), c = String(code ?? '').slice(0, 200);
  if (!u || !c.trim()) throw Object.assign(new Error('Benutzername und Passwort/Code fehlen.'), { status: 400 });
  const key = await secretKey(store, env);
  await store.set(KEY(uid), JSON.stringify({ user: u, secret: seal(key, c), at: Date.now() }));
  return status(store, uid);
}
async function status(store, uid) {
  let r = null;
  try { r = JSON.parse(await store.get(KEY(uid)) || 'null'); } catch {}
  return r?.user ? { connected: true, user: r.user, since: r.at || null } : { connected: false };
}
async function remove(store, uid) { await store.del(KEY(uid)); return { connected: false }; }
// nur serverseitig (z. B. für eine spätere, vom Nutzer bestätigte Order) – nie an den Browser schicken
async function credentials(store, env, uid) {
  let r = null;
  try { r = JSON.parse(await store.get(KEY(uid)) || 'null'); } catch {}
  if (!r?.secret) return null;
  try { return { user: r.user, code: open(await secretKey(store, env), r.secret) }; } catch { return null; }
}

module.exports = { save, status, remove, credentials, KEY };
