/* ===================================================================
   „Meine Käufe“ des Börsen-Bären: was der Nutzer im Chat erzählt („Ich habe 40 SAP zu 231 € am 2.10. gekauft“), merkt sich der Bär
   als Liste im Konto (u:<uid>:bestand). Kein Zugriff aufs Planspiel – nur, was der Nutzer selbst sagt.
   - apply(): Änderungen aus dem Block ```merken der Antwort (add = Kauf, sell = Verkauf, remove = aus der Liste nehmen)
   - overview(): jede Position mit aktuellem Kurs, Plus/Minus und Empfehlung (Behalten · Beobachten · Nachkaufen · Teilgewinn · Verkaufen)
     – reine Chart-Rechnung, keine KI. Regel des Nutzers: Verkaufen erst ab +100 € nach Gebühren, nie mit Verlust.
   =================================================================== */
const B = require('./boerse');

const KEY = (uid) => `u:${uid}:bestand`;
const SYM = /^[\w.^=-]{1,20}$/;
const num = (x) => (x == null || x === '' || !Number.isFinite(+x) ? null : +x);
const r2 = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(d));
const today = () => new Date().toISOString().slice(0, 10);

async function list(store, uid) {
  try { const l = JSON.parse(await store.get(KEY(uid)) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}

// Änderungen übernehmen; gibt zurück, was wirklich geändert wurde (für die Bestätigung im Chat)
async function apply(store, uid, changes = {}) {
  const items = await list(store, uid);
  const done = { added: [], sold: [], removed: [] };
  for (const a of (Array.isArray(changes.add) ? changes.add : []).slice(0, 20)) {
    const symbol = String(a?.symbol || '').trim().toUpperCase().replace(/\.DE$/i, '.DE');
    const qty = num(a?.qty), price = num(a?.price);
    if (!SYM.test(symbol) || !(qty > 0) || !(price > 0)) continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(a?.date || '')) ? a.date : today();
    const it = { id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, symbol, name: String(a?.name || B.NAME_OF[symbol] || symbol).slice(0, 60), qty, price, date, added: Date.now() };
    items.push(it);
    done.added.push(it);
  }
  for (const s of (Array.isArray(changes.sell) ? changes.sell : []).slice(0, 20)) {
    const symbol = String(s?.symbol || '').trim().toUpperCase();
    let qty = num(s?.qty);
    const own = items.filter((x) => x.symbol === symbol);
    if (!own.length) continue;
    const total = own.reduce((t, x) => t + x.qty, 0);
    if (!(qty > 0) || qty > total) qty = total; // „alles verkauft“
    let left = qty;
    for (const x of own) { // älteste Käufe zuerst
      if (left <= 0) break;
      const take = Math.min(x.qty, left);
      x.qty = r2(x.qty - take, 4); left -= take;
    }
    done.sold.push({ symbol, name: own[0].name, qty, price: num(s?.price) });
  }
  for (const r of (Array.isArray(changes.remove) ? changes.remove : []).slice(0, 20)) {
    const symbol = String(r?.symbol || r || '').trim().toUpperCase();
    if (items.some((x) => x.symbol === symbol)) done.removed.push({ symbol, name: items.find((x) => x.symbol === symbol).name });
    for (let i = items.length - 1; i >= 0; i--) if (items[i].symbol === symbol) items.splice(i, 1);
  }
  const kept = items.filter((x) => x.qty > 1e-9).slice(-60);
  await store.set(KEY(uid), JSON.stringify(kept));
  memo.delete(uid);
  return done;
}

// je Wert zusammengefasst (mehrere Käufe → Durchschnittskurs, frühestes Datum)
function merged(items) {
  const m = new Map();
  for (const x of items) {
    const p = m.get(x.symbol) || { symbol: x.symbol, name: x.name, qty: 0, cost: 0, date: x.date };
    p.qty += x.qty; p.cost += x.qty * x.price; if (x.date < p.date) p.date = x.date;
    m.set(x.symbol, p);
  }
  return [...m.values()].map((p) => ({ ...p, price: p.cost / p.qty }));
}

const memo = new Map(); // uid → { t, data } – 2 min (Kurse sind ohnehin zwischengespeichert)
async function overview(store, uid, { signal, maxAgeMs = 120000 } = {}) {
  const hit = memo.get(uid);
  if (hit && Date.now() - hit.t < maxAgeMs) return hit.data;
  const pos = merged(await list(store, uid));
  if (!pos.length) { const data = { asOf: new Date().toISOString(), items: [] }; memo.set(uid, { t: Date.now(), data }); return data; }
  const chk = await B.check({ positions: pos.map((p) => ({ symbol: p.symbol, qty: p.qty, buyPrice: p.price, buyDate: p.date })) }, { signal }).catch(() => null);
  const bySym = new Map((chk?.holdings || []).filter((x) => x && !x.error).map((x) => [x.symbol, x]));
  const items = pos.map((p) => {
    const x = bySym.get(p.symbol);
    const price = x?.price ?? null, value = price != null ? price * p.qty : null;
    const plus = value != null ? value - p.cost : null;
    const h = x?.holding;
    let action = h?.signal || null, why = h?.reasons?.[0] || '';
    if (action === 'halten' && h?.stop && price && (price - h.stop) / price < 0.03) { action = 'beobachten'; why = `Nahe am Stopp (${h.stop.toLocaleString('de-DE')} €) – genau beobachten`; }
    // Verkaufen/Teilgewinn nur mit echtem Plus nach Gebühren (≥ 100 € bzw. 200 €)
    if (action === 'verkaufen' && !(h?.gainEur >= B.MIN_SELL_GAIN)) action = 'beobachten';
    if (action === 'teilgewinn' && !(h?.gainEur >= 2 * B.MIN_SELL_GAIN)) action = 'halten';
    return { symbol: p.symbol, name: x?.name || p.name, qty: r2(p.qty, 4), buyPrice: r2(p.price, 4), date: p.date, price: r2(price, 4), value: r2(value),
      plus: r2(plus), plusPct: p.cost && plus != null ? r2((plus / p.cost) * 100, 2) : null, netPlus: r2(h?.gainEur ?? null), action, why, stop: h?.stop ?? null,
      day: x?.change1d ?? null, error: x ? null : 'Kurs gerade nicht erreichbar' };
  });
  const sum = (k) => r2(items.reduce((s, x) => s + (x[k] || 0), 0));
  const data = { asOf: new Date().toISOString(), items, invested: r2(pos.reduce((s, p) => s + p.cost, 0)), value: sum('value'), plus: sum('plus') };
  memo.set(uid, { t: Date.now(), data });
  return data;
}

// kurz für die KI
function text(items) {
  if (!items.length) return 'MEINE KÄUFE: noch nichts notiert.';
  return ['MEINE KÄUFE (vom Nutzer im Chat genannt, vom Bären notiert – Kaufkurs ohne Gebühren):',
    ...merged(items).map((p) => `- ${p.name} (${p.symbol}): ${r2(p.qty, 4)} Stück · Ø Kaufkurs ${r2(p.price, 2)} € · seit ${p.date.split('-').reverse().join('.')}`)].join('\n');
}

module.exports = { list, apply, overview, merged, text, KEY, memo };
