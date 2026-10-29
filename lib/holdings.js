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
const BOOK = (uid) => `u:${uid}:bestand-book`; // Orderbuch: ALLE Buchungen (Kauf/Verkauf) – daraus Positionen, Bargeld, Depotwert, Verkäufe
const START = 50000; // Startkapital im Planspiel
async function book(store, uid) { try { const l = JSON.parse(await store.get(BOOK(uid)) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } }
const feeOf = (x, qty) => (num(x?.fee) != null && num(x.fee) >= 0 ? num(x.fee) : B.fee((qty ?? 0) * (num(x?.price) || 0)));
const stamp = (x) => `${x.date || ''}T${x.time || '00:00'}`;
// Gleiche Buchung = gleiche Art, Aktie, Tag, Uhrzeit, Stückzahl, Kurs (bzw. gleiche Order-Nummer aus dem Tagebuch)
const sameAs = (x, y) => x.kind === y.kind && ((x.ref && y.ref && x.ref === y.ref)
  || (x.symbol === y.symbol && x.date === y.date && (x.time || '') === (y.time || '') && r2(x.qty, 4) === r2(y.qty, 4) && r2(x.price, 4) === r2(y.price, 4)));

/* Orderbuch nachspielen (zeitlich sortiert, am selben Zeitpunkt Käufe vor Verkäufen): Verkäufe nehmen die ältesten Käufe zuerst.
   So stimmt alles auch dann, wenn Käufe und Verkäufe in verschiedenen Uploads oder in falscher Reihenfolge kommen.
   Ergebnis: offene Käufe (items), Verkäufe mit Kaufwert (sells), Bargeld (50.000 € − Käufe inkl. Gebühr + Verkäufe nach Gebühr). */
function replay(log) {
  const order = log.map((x, i) => ({ x, i })).sort((a, b) => stamp(a.x).localeCompare(stamp(b.x)) || (a.x.kind === 'buy' ? 0 : 1) - (b.x.kind === 'buy' ? 0 : 1) || a.i - b.i);
  const lots = [], sells = [];
  let cash = START, fees = 0;
  for (const { x } of order) {
    if (x.kind === 'buy') {
      const f = feeOf(x, x.qty);
      lots.push({ id: x.id || `b${lots.length}`, symbol: x.symbol, name: x.name, qty: x.qty, price: x.price, date: x.date, ...(x.time ? { time: x.time } : {}) });
      cash -= x.qty * x.price + f; fees += f;
      continue;
    }
    const own = lots.filter((l) => l.symbol === x.symbol && l.qty > 1e-9);
    const have = own.reduce((t, l) => t + l.qty, 0);
    const want = num(x.qty) > 0 ? num(x.qty) : have; // ohne Stückzahl = alles verkauft
    let left = want, basis = 0;
    for (const l of own) { if (left <= 1e-9) break; const take = Math.min(l.qty, left); basis += take * l.price; l.qty = r2(l.qty - take, 4); left -= take; }
    const matched = want - Math.max(0, left);
    const f = x.price ? feeOf(x, want) : 0;
    if (x.price) { cash += want * x.price - f; fees += f; }
    sells.push({ ...x, qty: r2(want, 4), name: x.name || own[0]?.name || x.symbol, basis: matched > 0 ? r2(basis * (want / matched), 4) : null, unmatched: r2(Math.max(0, left), 4) || 0, fee: r2(f) });
  }
  return { items: lots.filter((l) => l.qty > 1e-9), sells, cash: r2(cash), fees: r2(fees), trades: log.length };
}

async function apply(store, uid, changes = {}) {
  const done = { added: [], sold: [], removed: [], skipped: 0, unknown: [] };
  let log = await book(store, uid);
  // ältere Konten: Käufe, die nur in der Liste stehen (vor dem Orderbuch), einmal ins Orderbuch übernehmen
  if (!log.some((x) => x.kind === 'buy')) {
    const old = await list(store, uid);
    log = [...old.map((x) => ({ kind: 'buy', id: x.id, symbol: x.symbol, name: x.name, qty: x.qty, price: x.price, date: x.date, ...(x.time ? { time: x.time } : {}), fee: r2(B.fee(x.qty * x.price)) })), ...log];
  }
  const fromJournal = (e) => !!(e?.ref || e?.isin || e?.date);
  const entry = (kind, e, symbol) => {
    const raw = String(e?.date || '');
    const date = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : today();
    const time = /T\d{2}:\d{2}/.test(raw) ? raw.slice(11, 16) : (/^\d{2}:\d{2}$/.test(String(e?.time || '')) ? e.time : null);
    return { kind, id: `${kind[0]}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, symbol, name: String(e?.name || B.NAME_OF[symbol] || symbol).slice(0, 60),
      qty: num(e?.qty), price: num(e?.price), date, ...(time ? { time } : {}), ...(num(e?.fee) != null && num(e.fee) >= 0 ? { fee: num(e.fee) } : {}), ...(String(e?.ref || '').trim() ? { ref: String(e.ref).trim().slice(0, 40) } : {}) };
  };
  // exakt gleiche Buchung schon im Orderbuch (z. B. dasselbe Tagebuch/derselbe Screenshot nochmal) → nicht doppelt
  const push = (x, e) => { if (fromJournal(e) && log.some((y) => sameAs(x, y))) { done.skipped++; return false; } log.push(x); return true; };
  for (const a of (Array.isArray(changes.add) ? changes.add : []).slice(0, 80)) {
    const symbol = await resolveSymbol(a);
    if (!symbol) { done.unknown.push(String(a?.name || a?.isin || a?.symbol || '?').slice(0, 40)); continue; }
    const x = entry('buy', a, symbol);
    if (!SYM.test(symbol) || !(x.qty > 0) || !(x.price > 0)) continue;
    if (push(x, a)) done.added.push(x);
  }
  const newSells = [];
  for (const s of (Array.isArray(changes.sell) ? changes.sell : []).slice(0, 80)) {
    const symbol = await resolveSymbol(s) || String(s?.symbol || '').trim().toUpperCase();
    if (!SYM.test(symbol)) { done.unknown.push(String(s?.name || s?.isin || '?').slice(0, 40)); continue; }
    const x = entry('sell', s, symbol);
    if (!(x.qty > 0)) x.qty = null; // „alles verkauft“ – Stückzahl ergibt sich beim Nachspielen
    if (push(x, s)) newSells.push(x);
  }
  for (const r of (Array.isArray(changes.remove) ? changes.remove : []).slice(0, 20)) {
    const symbol = String(r?.symbol || r || '').trim().toUpperCase();
    const hit = log.find((x) => x.symbol === symbol);
    if (hit) done.removed.push({ symbol, name: hit.name });
    log = log.filter((x) => x.symbol !== symbol); // Versehen → ganz aus dem Orderbuch
  }
  log = log.slice(-600);
  const r = replay(log);
  newSells.forEach((x) => { const s = r.sells.find((y) => y.id === x.id); if (s) done.sold.push({ symbol: s.symbol, name: s.name, qty: s.qty, price: s.price, unmatched: s.unmatched }); });
  await store.set(KEY(uid), JSON.stringify(r.items.slice(-120)));
  await store.set(BOOK(uid), JSON.stringify(log));
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
  const log = await book(store, uid);
  const r = log.length ? replay(log) : { items: await list(store, uid), sells: [], cash: null };
  const pos = merged(r.items);
  // Depot: Bargeld aus dem Orderbuch (Startkapital, Käufe, Verkäufe, Gebühren); Depotwert = Bargeld + Wert der offenen Positionen
  const depotOf = (openValue) => (r.cash == null ? null : {
    start: START, cash: r.cash, value: r2(r.cash + (openValue || 0)), perf: r2(r.cash + (openValue || 0) - START),
    perfPct: r2(((r.cash + (openValue || 0) - START) / START) * 100, 2), fees: r.fees, trades: r.trades });
  const sold = r.sells.map((x) => ({ symbol: x.symbol, name: x.name, qty: x.qty, date: x.date, time: x.time || null,
    buyPrice: x.basis != null && x.qty ? r2(x.basis / x.qty, 4) : null, sellPrice: x.price, fee: x.fee,
    plus: x.price != null && x.basis != null ? r2(x.qty * x.price - x.basis) : null,
    plusPct: x.price != null && x.basis ? r2(((x.qty * x.price - x.basis) / x.basis) * 100, 2) : null, noBuy: x.unmatched > 0 })).reverse();
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
  const r = log.length ? replay(log) : null;
  const sells = r?.sells || [];
  if (!items.length && !sells.length) return 'MEINE KÄUFE: noch nichts notiert.';
  const out = ['MEINE KÄUFE (vom Nutzer genannt bzw. aus Handelstagebuch/Screenshot übernommen – Kaufkurs ohne Gebühren):',
    ...merged(items).map((p) => `- ${p.name} (${p.symbol}): ${r2(p.qty, 4)} Stück · Ø Kaufkurs ${r2(p.price, 2)} € · seit ${p.date.split('-').reverse().join('.')}`)];
  if (sells.length) out.push('SCHON VERKAUFT:', ...sells.slice(-15).map((x) => `- ${x.name}: ${x.qty} Stück zu ${x.price ?? '?'} € am ${x.date.split('-').reverse().join('.')}${x.basis != null ? ` (Kaufwert ${r2(x.basis, 2)} €${x.price ? `, Plus/Minus ${r2(x.qty * x.price - x.basis, 2)} € ohne Gebühren` : ''})` : ' (Kauf dazu fehlt im Orderbuch)'}`));
  if (r) out.push(`BARGELD (berechnet: 50.000 € Start − Käufe + Verkäufe, Gebühren 0,3 %/mind. 15 € je Order): ${r2(r.cash, 2)} € · Gebühren bisher ${r2(r.fees, 2)} € · ${log.length} Orders`);
  return out.join('\n');
}

module.exports = { replay, book, START, resolveSymbol, priceAt, list, apply, overview, merged, text, KEY, memo };
