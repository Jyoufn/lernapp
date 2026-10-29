/* ===================================================================
   Planspiel Börse (Sparkasse/LzO): Zugangsdaten je Konto – sicher auf dem Server – und das Depot live aus dem Spiel.
   - Benutzername + Passwort/Code werden mit AES-256-GCM verschlüsselt im Konto-Speicher abgelegt (u:<uid>:planspiel).
   - Schlüssel: PLANSPIEL_SECRET (Umgebungsvariable, empfohlen) – sonst ein zufälliger Schlüssel, der einmal im Speicher angelegt wird.
   - Das Passwort geht NIE zurück an den Browser: status() liefert nur „verbunden“ und den Benutzernamen.
   - Depot: Der Server meldet sich bei der Web-App des Spiels an (trading.planspiel-boerse.de, dieselbe JSON-Schnittstelle, die die
     Seite im Browser benutzt) und liest Depotwert, Bargeld, Gewinn und die Buchungen. Aus den Buchungen entstehen die Positionen
     (Stück, Kaufkurs, Gebühren), bewertet zum Geldkurs des Spiels. Nur lesen – es wird nichts gekauft oder verkauft.
   - Schutz vor Kontosperre: Schlägt die Anmeldung wegen falscher Daten fehl, wird 15 min lang nicht erneut probiert.
   =================================================================== */
const crypto = require('crypto');

const KEY = (uid) => `u:${uid}:planspiel`;
const TOKEN_KEY = (uid) => `u:${uid}:planspiel-token`;
const FAIL_KEY = (uid) => `u:${uid}:planspiel-fail`;
const KEY_STORE = 'cfg:planspiel-key';
const API = 'https://trading.planspiel-boerse.de/stockcontest/services/api/';
const XHEADER = '3abab342352e088ab2edde2c495acabd'; // fester Wert aus der Web-App des Spiels (Kopfzeile x-angular-connect-string)

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
const authError = (msg = 'Anmeldung beim Planspiel Börse fehlgeschlagen – Benutzername oder Passwort stimmt nicht.') => Object.assign(new Error(msg), { status: 400, auth: true });

/* ---------- Schnittstelle des Spiels ---------- */
async function call(path, { token, body, signal, env = {} } = {}) {
  const r = await fetch(API + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', 'x-angular-connect-string': env.PLANSPIEL_XHEADER || XHEADER, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Sitzung abgelaufen'), { status: r.status, expired: true });
  if (!r.ok) throw Object.assign(new Error(`Planspiel antwortet mit HTTP ${r.status}`), { status: r.status });
  return r.json();
}
// Anmelden → Token und Depot-Nummer (erstes Depot = Wettbewerbsdepot)
async function login(user, code, { signal, env } = {}) {
  let d;
  try { d = await call('v-ms7/authenticate', { body: { userName: user, password: code }, signal, env }); }
  catch (e) { if ([400, 401, 403, 404].includes(e.status)) throw authError(); throw e; }
  const token = d?.result?.token?.accessToken;
  if (!d?.success || !token) throw authError();
  const ports = d.result.user?.userPortfolios || [];
  return { token, portfolioId: ports[0]?.id != null ? String(ports[0].id) : null, portfolios: ports.map((p) => ({ id: String(p.id), name: p.name || '' })) };
}

async function save(store, env, uid, { user, code } = {}, { signal, verify = true } = {}) {
  const u = clean(user, 80), c = String(code ?? '').slice(0, 200);
  if (!u || !c.trim()) throw Object.assign(new Error('Benutzername und Passwort/Code fehlen.'), { status: 400 });
  // erst prüfen, ob die Anmeldung beim Spiel klappt – falsche Daten werden nicht gespeichert; ist das Spiel nicht erreichbar, wird trotzdem gespeichert
  let checked = null;
  if (verify) {
    try { checked = await login(u, c, { signal, env }); }
    catch (e) { if (e.auth) throw e; }
  }
  const key = await secretKey(store, env);
  await store.set(KEY(uid), JSON.stringify({ user: u, secret: seal(key, c), at: Date.now(), checked: !!checked }));
  await store.del(FAIL_KEY(uid));
  await store.del(TOKEN_KEY(uid));
  if (checked) await keepToken(store, env, uid, checked);
  memo.delete(uid);
  return status(store, uid);
}
async function status(store, uid) {
  let r = null;
  try { r = JSON.parse(await store.get(KEY(uid)) || 'null'); } catch {}
  return r?.user ? { connected: true, user: r.user, since: r.at || null, checked: r.checked ?? null } : { connected: false };
}
async function remove(store, uid) { await store.del(KEY(uid)); await store.del(TOKEN_KEY(uid)); await store.del(FAIL_KEY(uid)); memo.delete(uid); return { connected: false }; }
// nur serverseitig – nie an den Browser schicken
async function credentials(store, env, uid) {
  let r = null;
  try { r = JSON.parse(await store.get(KEY(uid)) || 'null'); } catch {}
  if (!r?.secret) return null;
  try { return { user: r.user, code: open(await secretKey(store, env), r.secret) }; } catch { return null; }
}

// Token verschlüsselt im Konto (auf Vercel lebt der Arbeitsspeicher nicht lange) – 50 min gültig
async function keepToken(store, env, uid, t) {
  const key = await secretKey(store, env);
  await store.set(TOKEN_KEY(uid), seal(key, JSON.stringify({ token: t.token, portfolioId: t.portfolioId })), 50 * 60);
}
async function session(store, env, uid, { signal, fresh = false } = {}) {
  if (!fresh) {
    try { const s = await store.get(TOKEN_KEY(uid)); if (s) return JSON.parse(open(await secretKey(store, env), s)); } catch {}
  }
  if (await store.get(FAIL_KEY(uid))) throw authError('Die letzte Anmeldung beim Planspiel ist fehlgeschlagen – bitte in den Einstellungen Benutzername und Passwort prüfen.');
  const cred = await credentials(store, env, uid);
  if (!cred) return null;
  try {
    const t = await login(cred.user, cred.code, { signal, env });
    await keepToken(store, env, uid, t);
    return t;
  } catch (e) {
    if (e.auth) await store.set(FAIL_KEY(uid), '1', 15 * 60);
    throw e;
  }
}

/* ---------- Depot ---------- */
const num = (x) => (x == null || x === '' || !Number.isFinite(+x) ? null : +x);
const r2 = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(d));
const first = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k]; return null; };

// Positionen aus den Buchungen: Kauf erhöht Stück und Kosten, Verkauf verringert sie anteilig (Kaufgebühr bleibt bis zum letzten Stück)
function positionsFromTrades(trades) {
  const pos = new Map();
  const list = (Array.isArray(trades) ? trades : trades?.result || trades?.transactions || []).filter(Boolean);
  list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.id || 0) - (b.id || 0));
  let buys = 0;
  for (const t of list) {
    const o = t.order || {}, ins = o.instrument || t.instrument || {};
    const kind = String(t.transactionType || t.type || '').toUpperCase();
    if (!['BUY', 'SELL'].includes(kind) || !ins.isin) continue;
    const qty = num(o.quantity ?? t.quantity), px = num(o.executionPrice ?? t.price), fee = num(o.transactionCosts ?? t.fee) || 0;
    if (!qty || px == null) continue;
    let p = pos.get(ins.isin);
    if (kind === 'BUY') {
      buys++;
      if (!p) pos.set(ins.isin, p = { isin: ins.isin, name: ins.name || ins.isin, qty: 0, cost: 0, fees: 0, bought: String(t.date || '').slice(0, 10) || null, green: !!ins.sustainability });
      p.qty += qty; p.cost += qty * px; p.fees += fee;
    } else if (p) {
      const part = Math.min(1, qty / p.qty);
      p.cost -= p.cost * part; p.qty -= qty;
      if (p.qty <= 1e-9) pos.delete(ins.isin);
    }
  }
  return { positions: [...pos.values()], buys };
}

// Kürzel für die Kursdaten der App (ISIN → Yahoo), bekannte Werte direkt, sonst per Suche
async function symbolFor(isin, { signal } = {}) {
  const B = require('./boerse');
  const known = Object.entries(B.ISIN).find(([, v]) => v === isin);
  if (known) return known[0];
  const hit = await B.search(isin, { signal }).catch(() => []);
  return hit[0]?.symbol || null;
}

const memo = new Map(); // uid → { t, data } – 30 s, damit Chat und Grafik nicht doppelt fragen
async function depot(store, env, uid, { signal, maxAgeMs = 30000 } = {}) {
  const hit = memo.get(uid);
  if (hit && Date.now() - hit.t < maxAgeMs) return hit.data;
  const st = await status(store, uid);
  if (!st.connected) return { connected: false };
  let data;
  try {
    let s = await session(store, env, uid, { signal });
    const get = async (path) => {
      try { return await call(path, { token: s.token, signal, env }); }
      catch (e) { if (!e.expired) throw e; s = await session(store, env, uid, { signal, fresh: true }); return call(path, { token: s.token, signal, env }); }
    };
    if (!s.portfolioId) s.portfolioId = String((await get('v-ms8/user/getUser'))?.userPortfolios?.[0]?.id ?? '');
    const [port, trades] = await Promise.all([
      get(`v-ms1/portfolio/getPortfolioWithItems?portfolioId=${encodeURIComponent(s.portfolioId)}&withItems=true`),
      get(`v-ms1/transaction/getTransactions?portfolioId=${encodeURIComponent(s.portfolioId)}`).catch(() => []),
    ]);
    data = build(port, trades, st.user);
    await Promise.all(data.positions.map(async (p) => { p.symbol = await symbolFor(p.isin, { signal }).catch(() => null); }));
  } catch (e) {
    if (signal?.aborted) throw e;
    data = { connected: true, user: st.user, error: e.auth ? e.message : 'Das Planspiel Börse ist gerade nicht erreichbar – später noch einmal versuchen.' };
  }
  memo.set(uid, { t: Date.now(), data });
  return data;
}

// Antwort des Spiels → Depot der App
function build(port, trades, user) {
  const p = port?.portfolio || port || {};
  const items = Array.isArray(port?.items) ? port.items : [];
  const { positions: fromTrades, buys } = positionsFromTrades(trades);
  const byIsin = new Map(fromTrades.map((x) => [x.isin, x]));
  const positions = [];
  // aktuelle Positionen aus dem Depot (Kurse vom Spiel); Stück und Kaufkurs aus den Buchungen, sonst aus dem Depot selbst
  for (const it of items) {
    const ins = it.instrument || {};
    const isin = ins.isin; if (!isin) continue;
    const t = byIsin.get(isin);
    const qty = t?.qty ?? num(first(it, ['quantity', 'amount', 'units', 'numberOfUnits', 'pieces', 'nominal']));
    if (!qty) continue;
    const bid = num(first(ins, ['bid', 'last', 'price'])) ?? num(first(it, ['bid', 'price', 'currentPrice']));
    const buyPrice = t ? t.cost / t.qty : num(first(it, ['purchasePrice', 'averagePrice', 'buyPrice', 'entryPrice', 'avgPrice']));
    const value = num(first(it, ['value', 'marketValue', 'currentValue'])) ?? (bid != null ? bid * qty : null);
    const cost = buyPrice != null ? buyPrice * qty : null;
    const fees = t?.fees ?? 0;
    positions.push({
      isin, name: ins.name || t?.name || isin, qty: r2(qty, 4), buyPrice: r2(buyPrice, 4), price: r2(bid, 4), ask: r2(num(ins.ask), 4),
      value: r2(value), gainEur: value != null && cost != null ? r2(value - cost - fees) : null, gainPct: value != null && cost ? r2(((value - cost - fees) / cost) * 100, 1) : null,
      fees: r2(fees), bought: t?.bought || null, green: !!(ins.sustainability ?? t?.green),
    });
    byIsin.delete(isin);
  }
  // Positionen, die nur in den Buchungen stehen (falls das Depot sie ohne Einträge liefert)
  if (!items.length) for (const t of byIsin.values()) positions.push({ isin: t.isin, name: t.name, qty: r2(t.qty, 4), buyPrice: r2(t.cost / t.qty, 4), price: null, value: null, gainEur: null, gainPct: null, fees: r2(t.fees), bought: t.bought, green: t.green });
  const cash = num(first(p, ['credit', 'cash', 'balance']));
  const invested = positions.reduce((s, x) => s + (x.value || 0), 0);
  const value = num(first(p, ['value', 'totalValue'])) ?? (cash != null ? cash + invested : null);
  positions.forEach((x) => { x.weightPct = value && x.value != null ? r2((x.value / value) * 100, 1) : null; });
  positions.sort((a, b) => (b.value || 0) - (a.value || 0));
  return {
    connected: true, user, asOf: new Date().toISOString(), name: p.name || 'Wettbewerbsdepot',
    value: r2(value), cash: r2(cash), invested: r2(invested), start: 50000,
    gainEur: r2(num(p.performanceAbsTotal) ?? (value != null ? value - 50000 : null)), gainPct: r2(value != null ? ((value - 50000) / 50000) * 100 : num(p.performanceRelTotal), 2), // selbst gerechnet – die Einheit des Spiels (Anteil oder %) ist nicht dokumentiert
    greenGainEur: r2(num(p.performanceAbsSustainability)), trades: num(p.numTrades), buys, positions,
  };
}

module.exports = { save, status, remove, credentials, depot, login, build, positionsFromTrades, KEY, API, memo };
