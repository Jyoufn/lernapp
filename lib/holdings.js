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
// Kürzel für die Kursdaten: angegebenes Kürzel, sonst über ISIN oder Namen suchen (z. B. aus einem Handelstagebuch)
async function resolveSymbol(e, { signal } = {}) {
  const sym = String(e?.symbol || '').trim().toUpperCase();
  if (SYM.test(sym) && !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(sym)) return sym;
  const isin = String(e?.isin || (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(sym) ? sym : '')).trim().toUpperCase();
  if (isin) {
    const known = Object.entries(B.ISIN).find(([, v]) => v === isin);
    if (known) return known[0];
    const hit = await B.search(isin, { signal }).catch(() => []);
    if (hit[0]) return hit[0].symbol;
  }
  const name = String(e?.name || '').trim();
  if (name) { const hit = await B.search(name, { signal }).catch(() => []); if (hit[0]) return hit[0].symbol; }
  return null;
}
// Schlüssel einer Buchung – dasselbe Handelstagebuch zweimal hochgeladen → nichts doppelt
const refOf = (kind, e, symbol) => String(e?.ref || '').trim() ? `${kind}|${String(e.ref).trim()}` : `${kind}|${symbol}|${String(e?.date || '').slice(0, 16)}|${num(e?.qty)}|${num(e?.price)}`;
const SEEN = (uid) => `u:${uid}:bestand-seen`;
const BOOK = (uid) => `u:${uid}:bestand-book`; // alle Buchungen (Kauf/Verkauf mit Gebühr) – daraus Bargeld, Depotwert, Verkäufe
const START = 50000; // Startkapital im Planspiel
async function book(store, uid) { try { const l = JSON.parse(await store.get(BOOK(uid)) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } }

async function apply(store, uid, changes = {}) {
  const items = await list(store, uid);
  const done = { added: [], sold: [], removed: [], skipped: 0, unknown: [] };
  let seen = [];
  try { seen = JSON.parse(await store.get(SEEN(uid)) || '[]'); } catch {}
  const seenSet = new Set(seen);
  const fromJournal = (e) => !!(e?.ref || e?.isin);
  const log = await book(store, uid);
  const feeOf = (e, volume) => (num(e?.fee) != null && num(e.fee) >= 0 ? num(e.fee) : B.fee(volume));
  for (const a of (Array.isArray(changes.add) ? changes.add : []).slice(0, 60)) {
    const symbol = await resolveSymbol(a);
    if (!symbol) { done.unknown.push(String(a?.name || a?.isin || a?.symbol || '?').slice(0, 40)); continue; }
    if (fromJournal(a) || a?.date) { const k = refOf('add', a, symbol); if (seenSet.has(k)) { done.skipped++; continue; } seenSet.add(k); }
    const qty = num(a?.qty), price = num(a?.price);
    if (!SYM.test(symbol) || !(qty > 0) || !(price > 0)) continue;
    const date = /^\d{4}-\d{2}-\d{2}/.test(String(a?.date || '')) ? String(a.date).slice(0, 10) : today();
    const time = /T\d{2}:\d{2}/.test(String(a?.date || '')) ? String(a.date).slice(11, 16) : (/^\d{2}:\d{2}$/.test(String(a?.time || '')) ? a.time : null);
    const it = { id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, symbol, name: String(a?.name || B.NAME_OF[symbol] || symbol).slice(0, 60), qty, price, date, ...(time ? { time } : {}), added: Date.now() };
    items.push(it);
    done.added.push(it);
    log.push({ kind: 'buy', symbol, name: it.name, qty, price, date, ...(time ? { time } : {}), fee: r2(feeOf(a, qty * price)) });
  }
  items.sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`));
  for (const s of (Array.isArray(changes.sell) ? changes.sell : []).slice(0, 60)) {
    const symbol = await resolveSymbol(s) || String(s?.symbol || '').trim().toUpperCase();
    if (fromJournal(s) || s?.date) { const k = refOf('sell', s, symbol); if (seenSet.has(k)) { done.skipped++; continue; } seenSet.add(k); }
    let qty = num(s?.qty);
    const own = items.filter((x) => x.symbol === symbol);
    if (!own.length) continue;
    const total = own.reduce((t, x) => t + x.qty, 0);
    if (!(qty > 0) || qty > total) qty = total; // „alles verkauft“
    let left = qty, basis = 0;
    for (const x of own) { // älteste Käufe zuerst
      if (left <= 0) break;
      const take = Math.min(x.qty, left);
      basis += take * x.price;
      x.qty = r2(x.qty - take, 4); left -= take;
    }
    const price = num(s?.price);
    const date = /^\d{4}-\d{2}-\d{2}/.test(String(s?.date || '')) ? String(s.date).slice(0, 10) : today();
    const time = /T\d{2}:\d{2}/.test(String(s?.date || '')) ? String(s.date).slice(11, 16) : null;
    done.sold.push({ symbol, name: own[0].name, qty, price });
    log.push({ kind: 'sell', symbol, name: own[0].name, qty, price, date, ...(time ? { time } : {}), basis: r2(basis, 4), fee: price ? r2(feeOf(s, qty * price)) : 0 });
  }
  for (const r of (Array.isArray(changes.remove) ? changes.remove : []).slice(0, 20)) {
    const symbol = String(r?.symbol || r || '').trim().toUpperCase();
    if (items.some((x) => x.symbol === symbol)) done.removed.push({ symbol, name: items.find((x) => x.symbol === symbol).name });
    for (let i = items.length - 1; i >= 0; i--) if (items[i].symbol === symbol) items.splice(i, 1);
    for (let i = log.length - 1; i >= 0; i--) if (log[i].symbol === symbol) log.splice(i, 1); // Versehen → auch aus dem Orderbuch
  }
  const kept = items.filter((x) => x.qty > 1e-9).slice(-80);
  await store.set(KEY(uid), JSON.stringify(kept));
  await store.set(SEEN(uid), JSON.stringify([...seenSet].slice(-500)));
  await store.set(BOOK(uid), JSON.stringify(log.slice(-400)));
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
  const log = await book(store, uid);
  const depotOf = (openValue) => {
    // Bargeld = Startkapital − Käufe (mit Gebühr) + Verkäufe (nach Gebühr); Depotwert = Bargeld + Wert der offenen Positionen
    const buys = log.filter((x) => x.kind === 'buy'), sells = log.filter((x) => x.kind === 'sell' && x.price);
    if (!buys.length) return null;
    const cash = START - buys.reduce((t, x) => t + x.qty * x.price + (x.fee || 0), 0) + sells.reduce((t, x) => t + x.qty * x.price - (x.fee || 0), 0);
    const value = cash + (openValue || 0);
    return { start: START, cash: r2(cash), value: r2(value), perf: r2(value - START), perfPct: r2(((value - START) / START) * 100, 2),
      fees: r2(log.reduce((t, x) => t + (x.fee || 0), 0)), trades: log.length };
  };
  const sold = log.filter((x) => x.kind === 'sell').map((x) => ({ symbol: x.symbol, name: x.name, qty: x.qty, date: x.date, time: x.time || null,
    buyPrice: x.qty ? r2(x.basis / x.qty, 4) : null, sellPrice: x.price, plus: x.price != null ? r2(x.qty * x.price - x.basis) : null,
    plusPct: x.price != null && x.basis ? r2(((x.qty * x.price - x.basis) / x.basis) * 100, 2) : null })).reverse();
  if (!pos.length) { const data = { asOf: new Date().toISOString(), items: [], sold, depot: depotOf(0) }; memo.set(uid, { t: Date.now(), data }); return data; }
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
  const data = { asOf: new Date().toISOString(), items, sold, invested: r2(pos.reduce((s, p) => s + p.cost, 0)), value: sum('value'), plus: sum('plus'), depot: depotOf(sum('value')) };
  memo.set(uid, { t: Date.now(), data });
  return data;
}

// Kurs zu einem Zeitpunkt (für „Hinzufügen“: Nutzer nennt nur Aktie, Zeitpunkt und Stückzahl): letzte Kerze bis zu diesem Moment –
// innerhalb der letzten 5 Tage aus dem 15-Minuten-Verlauf, sonst Tagesschluss; in der Zukunft/jetzt → aktueller Kurs
async function priceAt(symbol, at, { signal } = {}) {
  const t = Date.parse(at);
  if (!Number.isFinite(t) || t > Date.now() - 60000) {
    const q = await B.quoteNow(symbol).catch(() => null);
    if (q?.price) return { price: r2(q.price, 4), at: new Date().toISOString(), how: 'aktueller Kurs' };
  }
  const recent = Date.now() - t < 5 * 86400000;
  const d = await B.chartData(symbol, recent ? '1W' : Date.now() - t < 330 * 86400000 ? '1J' : '5J', { signal });
  const before = d.bars.filter((b) => b.t <= t);
  const bar = before.at(-1) || d.bars[0];
  if (!bar) throw new Error('Kein Kurs zu diesem Zeitpunkt');
  return { price: r2(bar.c, 4), at: new Date(bar.t).toISOString(), how: recent ? 'Kurs zu dieser Uhrzeit' : 'Schlusskurs dieses Tages', name: d.name };
}

// kurz für die KI
function text(items, log = []) {
  const sells = log.filter((x) => x.kind === 'sell');
  if (!items.length && !sells.length) return 'MEINE KÄUFE: noch nichts notiert.';
  const out = ['MEINE KÄUFE (vom Nutzer genannt bzw. aus Handelstagebuch/Screenshot übernommen – Kaufkurs ohne Gebühren):',
    ...merged(items).map((p) => `- ${p.name} (${p.symbol}): ${r2(p.qty, 4)} Stück · Ø Kaufkurs ${r2(p.price, 2)} € · seit ${p.date.split('-').reverse().join('.')}`)];
  if (sells.length) out.push('SCHON VERKAUFT:', ...sells.slice(-15).map((x) => `- ${x.name}: ${x.qty} Stück zu ${x.price ?? '?'} € am ${x.date.split('-').reverse().join('.')} (Kaufwert ${r2(x.basis, 2)} €${x.price ? `, Plus/Minus ${r2(x.qty * x.price - x.basis, 2)} € ohne Gebühren` : ''})`));
  const buys = log.filter((x) => x.kind === 'buy');
  if (buys.length) {
    const cash = START - buys.reduce((t, x) => t + x.qty * x.price + (x.fee || 0), 0) + sells.filter((x) => x.price).reduce((t, x) => t + x.qty * x.price - (x.fee || 0), 0);
    out.push(`BARGELD (berechnet: 50.000 € Start − Käufe + Verkäufe, mit Gebühren): ${r2(cash, 2)} € · ${log.length} Orders`);
  }
  return out.join('\n');
}

module.exports = { book, START, resolveSymbol, priceAt, list, apply, overview, merged, text, KEY, memo };
