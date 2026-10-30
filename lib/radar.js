// Chancen-Radar des Börsen-Bären – reiner Algorithmus, keine KI (kostet kein Kontingent).
// Läuft automatisch zur Börseneröffnung (Vercel-Cron) und zwischendurch (die App fragt alle 30 min nach) und sucht nach der STRATEGIE DES NUTZERS
// (mäßiges Daytrading, kurze Haltedauer): STARKER RÜCKGANG MIT ERHOLUNGSCHANCE –
//   - kräftig gefallen: in 2 Tagen ≥ 5 % bzw. in 5 Tagen ≥ 8 % und mehr als die normale Schwankung (2–3 × ATR) – keine Mini-Dips,
//   - kein fallendes Messer: vorher kein Dauer-Abwärtstrend, langfristig nicht eingebrochen, keine schwere negative Nachricht,
//   - Grund für die Erholung: positive Nachricht (Auftrag, Prognose/Kursziel rauf, Rückkauf …) oder gute Trefferquote dieses Musters bei der Aktie,
//   - Kaufen erst, wenn der Kurs dreht (grüne Kerze / über dem Vortag) – sonst „Beobachten“.
//   Ziel = Teil-Erholung des Rutsches, Stopp knapp unter dem Tief der letzten Tage.
// Werte, die einfach gerade gut laufen (Momentum, Ausbruch, Jahreshoch), empfiehlt der Radar bewusst NICHT – das Risiko ist dem Nutzer zu hoch.
// Gedächtnis: jede Chance wird mit Kurs gespeichert; nach 5 und 10 Handelstagen wird nachgerechnet, ob sie im Plus war (Radar-Bilanz).
const B = require('./boerse');
const U = require('./universe');

/* ---------- Branchen: aus der Liste aller Planspiel-Werte (lib/universe.js) ---------- */
const SECTOR = Object.fromEntries(U.LIST.map((u) => [u.symbol, u.sector]));

/* ---------- Nachrichten-Stimmung per Schlüsselwörtern (deutsch + englisch) ---------- */
const POS = [
  [/großauftrag|rekordauftrag|milliardenauftrag|auftrag(seingang)? (über|im wert)|erhält auftrag|wins? (a )?(contract|order)/i, 3],
  [/prognose (angehoben|erhöht)|hebt (die )?prognose|anhebung der prognose|raises? (guidance|outlook|forecast)/i, 3],
  [/übertrifft|über (den )?erwartungen|besser als erwartet|beats? (estimates|expectations)|rekordumsatz|rekordgewinn|record (revenue|profit)/i, 2],
  [/kursziel (angehoben|erhöht|rauf)|hebt (das )?kursziel|upgrade|hochgestuft|kaufempfehlung|raises? price target/i, 2],
  [/übernahme(angebot)?|aktienrückkauf|rückkaufprogramm|buyback|dividende (erhöht|angehoben)/i, 2],
  [/zulassung|genehmigung|durchbruch|partnerschaft|kooperation|approval|breakthrough|partnership/i, 1],
  [/zinssenkung|senkt (die )?zinsen|rate cut|inflation (sinkt|fällt|geht zurück)|handelsabkommen|trade deal|rekordhoch|allzeithoch/i, 1],
];
const NEG = [
  [/gewinnwarnung|prognose (gesenkt|gekappt)|senkt (die )?prognose|cuts? (guidance|outlook)|profit warning/i, -3],
  [/insolvenz|pleite|bankrott|betrug|bilanzskandal|ermittlung|razzia|fraud|bankruptcy|investigation/i, -4],
  [/verfehlt|unter (den )?erwartungen|schwächer als erwartet|misses? (estimates|expectations)|verlust ausgeweitet/i, -2],
  [/kursziel (gesenkt|reduziert)|senkt (das )?kursziel|downgrade|herabgestuft|verkaufsempfehlung|cuts? price target/i, -2],
  [/klage|rückruf|stellenabbau|streik|sanktion|recall|lawsuit|layoffs?/i, -1],
  [/zinserhöhung|erhöht (die )?zinsen|rate hike|rezession|zölle|crash|recession|tariffs?/i, -1],
];
function headlineScore(title) {
  let s = 0;
  for (const [re, w] of POS) if (re.test(title)) s += w;
  for (const [re, w] of NEG) if (re.test(title)) s += w;
  return s;
}
// Schlagzeilen der letzten Tage → Stimmung (Summe, frische zählen doppelt), dazu die stärksten Meldungen
function sentiment(items, now = Date.now()) {
  let score = 0, severe = false;
  const scored = (items || []).map((n) => {
    const s = headlineScore(n.title || '');
    const ageH = n.date ? (now - Date.parse(n.date)) / 3600000 : 48;
    const w = ageH <= 36 ? 2 : ageH <= 96 ? 1 : 0.5;
    score += s * w;
    if (s <= -3) severe = true;
    return { ...n, score: s };
  });
  return { score: Math.round(score * 10) / 10, severe, top: scored.filter((x) => x.score).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 3) };
}

/* ---------- Rücksetzer-Regel (auch für die Trefferquote je Aktie) ---------- */
// i = Tag; kräftig gefallen, langfristig intakt, fängt sich
function dipAt(ind, bars, i) {
  if (i < 200) return false;
  const c = ind.c[i], hi20 = ind.hi20[i], a = ind.atr[i] || c * 0.02;
  const dd = hi20 ? 1 - c / hi20 : 0;
  const longOk = ind.sma200[i] != null && c > ind.sma200[i] * 0.92 && ind.sma50[i] > ind.sma200[i] * 0.95;
  const deep = dd >= Math.max(0.07, (2.5 * a) / c);
  const oversold = ind.rsi[i] != null && ind.rsi[i] <= 38;
  const b = bars[i], p = bars[i - 1];
  const turning = b.c > b.o || b.c > p.c || (b.h > b.l && (b.c - b.l) / (b.h - b.l) > 0.55);
  return longOk && deep && oversold && turning;
}

/* ---------- Starker Rückgang mit Erholungschance (Strategie des Nutzers) ---------- */
function reboundInfo(ind, bars, i) {
  if (i < 70 || !bars[i]) return null;
  const c = ind.c[i], a = ind.atr[i] || c * 0.02;
  const hiN = (n) => Math.max(...bars.slice(Math.max(0, i - n), i + 1).map((b) => b.h));
  const drop2 = 1 - c / hiN(2), drop5 = 1 - c / hiN(5);
  const sharp2 = drop2 >= Math.max(0.05, (2 * a) / c), sharp5 = drop5 >= Math.max(0.08, (3 * a) / c);
  // vorher kein Dauer-Abwärtstrend (3 Monate vor dem Rutsch höchstens −12 %) und langfristig nicht eingebrochen
  const pre = ind.c[i - 68] ? ind.c[i - 6] / ind.c[i - 68] - 1 : 0;
  const notKnife = pre > -0.12 && (ind.sma200[i] == null || c > ind.sma200[i] * 0.8);
  const b = bars[i], p = bars[i - 1];
  const turning = b.c > b.o || b.c > p.c || (b.h > b.l && (b.c - b.l) / (b.h - b.l) > 0.55);
  return { drop2, drop5, sharp: sharp2 || sharp5, days: sharp2 && !(sharp5 && drop5 > drop2 * 1.3) ? 2 : 5, notKnife, turning, rsi: ind.rsi[i], atr: a,
    hi5: hiN(5), lo3: Math.min(...bars.slice(Math.max(0, i - 2), i + 1).map((x) => x.l)) };
}
// als Regel (Trefferquote je Aktie): kräftig gefallen, kein Messer, dreht heute
const reboundAt = (ind, bars, i) => { const x = reboundInfo(ind, bars, i); return !!x && x.sharp && x.notKnife && x.turning && (x.rsi == null || x.rsi <= 45); };

/* ---------- Radar ---------- */
async function pool(items, n, fn) {
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i]).catch(() => null); } }));
  return out;
}
const rnd = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(d));
async function computeRadar({ signal, now = Date.now() } = {}) {
  const scan = await B.scan({ signal });
  // alle Werte aus dem Scan neu mit Kursverlauf (für Branchen-Stärke und Rücksetzer-Regel); Verlauf ist zwischengespeichert
  const symbols = Object.keys(SECTOR); // alle ~430 Aktien aus den Planspiel-Indizes
  const rows = (await pool(symbols, 10, async (sym) => {
    try {
      const d = await B.series(sym, { signal });
      const live = await B.liveQuote(sym, { signal }).catch(() => null);
      const data = live?.price && d.currency === 'EUR' ? B.withLive(d, live, 1) : d; // Euro-Werte bekommen den Echtzeitkurs direkt (prüft selbst auf Ausreißer)
      const ind = B.indicators(data.bars), i = data.bars.length - 1;
      return { sym, d: data, ind, i, r63: ind.c[i - 63] ? ind.c[i] / ind.c[i - 63] - 1 : null, above200: ind.sma200[i] != null && ind.c[i] > ind.sma200[i] };
    } catch { return null; }
  })).filter(Boolean);

  // Branchen: Durchschnitt 3 Monate und Anteil über der 200-Tage-Linie
  const sectors = {};
  rows.forEach((r) => { const s = SECTOR[r.sym]; (sectors[s] ||= { name: s, n: 0, r63: 0, above: 0 }); sectors[s].n++; sectors[s].r63 += r.r63 || 0; sectors[s].above += r.above200 ? 1 : 0; });
  const sectorList = Object.values(sectors).map((s) => ({ name: s.name, r63: rnd((s.r63 / s.n) * 100, 1), above200: Math.round((s.above / s.n) * 100), n: s.n }))
    .sort((a, b) => b.r63 - a.r63);
  const strong = new Set(sectorList.filter((s) => s.r63 > 2 || s.above200 >= 60).map((s) => s.name));

  // Kandidaten: kräftig gefallen und kein fallendes Messer – die stärksten Rutsche zuerst (Nachrichten nur für diese, spart Abrufe)
  const cands = rows.map((r) => ({ r, x: reboundInfo(r.ind, r.d.bars, r.i) })).filter(({ x }) => x && x.sharp && x.notKnife)
    .sort((a, b) => Math.max(b.x.drop2, b.x.drop5) - Math.max(a.x.drop2, a.x.drop5)).slice(0, 14);
  const newsFor = cands.map(({ r }) => r.sym);
  const [newsList, marketNews] = await Promise.all([
    Promise.all(newsFor.map((s) => B.news(`${B.NAME_OF[s] || s}`, { signal, max: 6 }).then((n) => [s, sentiment(n, now)]).catch(() => [s, sentiment([], now)]))),
    Promise.all(['DAX Börse', 'Wall Street Börse'].map((q) => B.news(q, { signal, max: 8 }).catch(() => []))),
  ]);
  const sent = Object.fromEntries(newsList);
  const mood = sentiment(marketNews.flat(), now);

  const picks = [];
  const nameOf = (s) => B.NAME_OF[s] || s;
  const de1 = (x) => String(rnd(x, 1)).replace('.', ',');
  for (const { r, x } of cands) {
    const s = sent[r.sym] || sentiment([], now);
    if (s.severe) continue; // schwere schlechte Nachricht → fallendes Messer, nicht kaufen
    const c = r.ind.c[r.i], a = x.atr;
    const drop = x.days === 2 ? x.drop2 : x.drop5;
    const hit = B.hitRate(r.ind, (ind, i) => reboundAt(ind, r.d.bars, i), 5);
    const catalyst = s.score >= 2, negative = s.score <= -2;
    const sec = sectorList.find((y) => y.name === SECTOR[r.sym]);
    const score = Math.round(50 + Math.min(30, drop * 200) + Math.max(-15, Math.min(15, s.score * 3)) + (x.turning ? 8 : -6)
      + (x.rsi != null ? Math.max(0, 40 - x.rsi) * 0.5 : 0) + (hit.cases >= 3 ? (hit.winRate - 50) * 0.3 : 0) + (strong.has(SECTOR[r.sym]) ? 4 : 0));
    const stop = rnd(Math.min(x.lo3 - 0.5 * a, c - 0.8 * a));
    const target = rnd(c + 0.6 * Math.max(x.hi5 - c, a)); // Teil-Erholung des Rutsches (Daytrading), nicht das alte Hoch
    const why = catalyst ? `Nachricht spricht für Erholung: „${s.top.find((n) => n.score > 0)?.title || s.top[0]?.title || ''}“`
      : negative ? 'Nachrichten eher negativ – nur beobachten' : hit.cases >= 3 ? `keine schlechte Nachricht; nach solchen Rutschen bei ${nameOf(r.sym)} in ${hit.winRate} % der Fälle nach 5 Tagen im Plus` : 'keine schlechte Nachricht, aber auch noch kein klarer Grund für die Erholung';
    picks.push({
      type: 'erholung', symbol: r.sym, name: nameOf(r.sym), sector: SECTOR[r.sym], price: rnd(c), score: Math.max(1, Math.min(99, score)),
      reason: `${nameOf(r.sym)} ist in ${x.days} Tagen um ${de1(drop * 100)} % gefallen${x.rsi != null ? ` (RSI ${Math.round(x.rsi)})` : ''}; ${why}; ${x.turning ? 'der Kurs fängt sich heute' : 'fällt noch – erst einsteigen, wenn er dreht'}${sec ? ` · Branche ${sec.name} 3 Monate ${sec.r63 > 0 ? '+' : ''}${de1(sec.r63)} %` : ''}`,
      entry: rnd(c), stop, target, drop: rnd(drop * 100, 1), dropDays: x.days, turning: x.turning, catalyst, history: hit,
      news: s.top.map((n) => ({ title: n.title, source: n.source, url: n.url, score: n.score })), newsScore: s.score,
    });
  }
  picks.sort((a, b) => b.score - a.score);
  const light = (x) => ({ symbol: x.symbol, name: x.name, price: x.price, signal: x.signal, setup: x.setup, score: x.score, reasons: x.reasons, history: x.history, change1m: x.change1m,
    entry: x.entry, trigger: x.trigger, stop: x.stop, target: x.target });
  return { asOf: new Date(now).toISOString(), marketOpen: B.marketOpen(now), checked: rows.length, sectors: sectorList, mood: { score: mood.score, top: mood.top }, picks: picks.slice(0, 20),
    scan: { checked: scan.checked, now: scan.now.map(light), soon: scan.soon.map(light), weak: scan.weak } };
}

/* ---------- Speichern, Gedächtnis, Bilanz ---------- */
const KEY = 'boerse:radar:latest', HIST = 'boerse:radar:hist';
async function evaluateHistory(hist, { signal } = {}) {
  const open = hist.filter((h) => h.r10 == null && Date.now() - h.t > 6 * 86400000).slice(0, 30);
  await Promise.all(open.map(async (h) => {
    try {
      const d = await B.series(h.symbol, { signal });
      const k = d.bars.findIndex((b) => b.t >= h.t - 12 * 3600000);
      if (k < 0) return;
      const base = d.bars[k].c, at = (n) => d.bars[k + n]?.c;
      if (at(5) != null && h.r5 == null) h.r5 = rnd((at(5) / base - 1) * 100, 1);
      if (at(10) != null) h.r10 = rnd((at(10) / base - 1) * 100, 1);
    } catch {}
  }));
  return hist;
}
function record(hist) {
  const done5 = hist.filter((h) => h.r5 != null), done10 = hist.filter((h) => h.r10 != null);
  const rate = (l, k) => (l.length ? Math.round((l.filter((h) => h[k] > 0).length / l.length) * 100) : null);
  const avg = (l, k) => (l.length ? rnd(l.reduce((s, h) => s + h[k], 0) / l.length, 1) : null);
  const byType = {};
  done5.forEach((h) => { (byType[h.type] ||= []).push(h); });
  return { picks: hist.length, checked5: done5.length, win5: rate(done5, 'r5'), avg5: avg(done5, 'r5'), checked10: done10.length, win10: rate(done10, 'r10'), avg10: avg(done10, 'r10'),
    byType: Object.fromEntries(Object.entries(byType).map(([t, l]) => [t, { n: l.length, win5: rate(l, 'r5'), avg5: avg(l, 'r5') }])) };
}
// neu rechnen, speichern und die neuen Chancen ins Gedächtnis schreiben (je Wert höchstens einmal am Tag)
async function refresh(store, { signal, now = Date.now() } = {}) {
  const radar = await computeRadar({ signal, now });
  let hist = [];
  try { hist = JSON.parse(await store?.get(HIST) || '[]'); } catch {}
  const day = new Date(now).toISOString().slice(0, 10);
  radar.picks.forEach((p) => { if (!hist.some((h) => h.symbol === p.symbol && h.day === day)) hist.push({ symbol: p.symbol, type: p.type, price: p.price, day, t: now }); });
  hist = (await evaluateHistory(hist, { signal })).slice(-300);
  radar.record = record(hist);
  if (store) { await store.set(KEY, JSON.stringify(radar)); await store.set(HIST, JSON.stringify(hist)); }
  return radar;
}
// gespeicherten Radar liefern; ist er älter als 30 min (Börse offen) bzw. 6 h, neu rechnen
async function latest(store, { signal, maxAgeMs, stored = false } = {}) {
  let r = null;
  try { r = JSON.parse(await store?.get(KEY) || 'null'); } catch {}
  const age = r ? Date.now() - Date.parse(r.asOf) : Infinity;
  const limit = maxAgeMs ?? (B.marketOpen() ? 30 * 60000 : 6 * 3600000);
  if (r && age < limit) return r;
  if (stored) return r && age < 24 * 3600000 ? r : null; // nur Gespeichertes (Frage zu einem bestimmten Wert: kein Neu-Rechnen über alle Werte)
  return refresh(store, { signal }).catch((err) => { if (r) return r; throw err; });
}
// kurz für die KI
function radarText(r) {
  if (!r) return '';
  const typ = { erholung: 'STARKER RÜCKGANG MIT ERHOLUNGSCHANCE', ruecksetzer: 'RÜCKSETZER IN STARKER BRANCHE', nachrichten: 'NACHRICHTEN-RÜCKENWIND', ausbruch: 'AUSBRUCH' };
  const e = (x) => (x == null ? '–' : `${x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
  const lines = [`CHANCEN-RADAR (Algorithmus, Stand ${new Date(r.asOf).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} Uhr, ${r.checked} Werte):`];
  lines.push(`BRANCHEN (3 Monate, Anteil über 200-Tage-Linie): ${r.sectors.map((s) => `${s.name} ${s.r63 > 0 ? '+' : ''}${String(s.r63).replace('.', ',')} % (${s.above200} %)`).join(' · ')}`);
  lines.push(`MARKTSTIMMUNG aus Schlagzeilen: ${r.mood.score > 2 ? 'positiv' : r.mood.score < -2 ? 'negativ' : 'neutral'} (${r.mood.score})${r.mood.top.length ? ` – ${r.mood.top.map((n) => n.title).join(' | ')}` : ''}`);
  if (r.picks.length) lines.push(...r.picks.map((p) => `- ${typ[p.type]}: ${p.name} (${p.symbol}) ${e(p.price)} · Score ${p.score} · ${p.reason} · Einstieg ${e(p.entry)}, Stopp ${e(p.stop)}, Ziel ${e(p.target)}${p.history?.cases ? ` · Trefferquote dieses Musters bei der Aktie: ${p.history.winRate} % von ${p.history.cases} (10 Handelstage)` : ''}${p.news?.length ? ` · Nachrichten: ${p.news.map((n) => `${n.score > 0 ? '+' : ''}${n.score} ${n.title}`).join(' | ')}` : ''}`));
  else lines.push('- Gerade kein Wert, der kräftig gefallen ist und einen Grund für die Erholung hat – abwarten.');
  const rec = r.record;
  if (rec?.checked5) lines.push(`RADAR-BILANZ (eigenes Gedächtnis, ausgewertet): nach 5 Handelstagen ${rec.win5} % von ${rec.checked5} Chancen im Plus (Ø ${rec.avg5 > 0 ? '+' : ''}${String(rec.avg5).replace('.', ',')} %)${rec.checked10 ? `, nach 10 Tagen ${rec.win10} % (Ø ${String(rec.avg10).replace('.', ',')} %)` : ''}${Object.keys(rec.byType).length ? ` · je Muster: ${Object.entries(rec.byType).map(([t, v]) => `${typ[t]} ${v.win5} % von ${v.n}`).join(', ')}` : ''} – gewichte Muster stärker, die zuletzt funktioniert haben.`);
  return lines.join('\n');
}

// Chancen-Übersicht für die Karte im Chat (```chancen) – nur die Strategie des Nutzers (starker Rückgang mit Erholungschance):
// Kaufen nur, wenn der Kurs dreht, ein Grund für die Erholung da ist (positive Nachricht oder Trefferquote ≥ 55 %), keine negativen
// Nachrichten, Chance:Risiko ≥ 1,5 und Score ≥ 70; sonst Beobachten. Kaufsignale aus dem allgemeinen Scan (Momentum) kommen NICHT dazu.
const TYPE_TEXT = { erholung: 'Starker Rückgang · Erholung', ruecksetzer: 'Rücksetzer in starker Branche', nachrichten: 'Nachrichten-Rückenwind', ausbruch: 'Ausbruch' };
function verdictOf(p) {
  const crv = p.entry && p.stop && p.target && p.entry > p.stop ? (p.target - p.entry) / (p.entry - p.stop) : 0;
  const near = p.price && p.entry ? Math.abs(p.entry / p.price - 1) <= 0.015 : false;
  if (p.type === 'erholung') {
    const reason = p.catalyst || (p.history?.cases >= 3 && p.history.winRate >= 55);
    return p.turning && reason && (p.newsScore ?? 0) >= 0 && p.score >= 70 && crv >= 1.5 && near ? 'kaufen' : 'beobachten';
  }
  return p.type !== 'ausbruch' && p.score >= 75 && crv >= 1.5 && near ? 'kaufen' : 'beobachten'; // ältere gespeicherte Radare
}
function overview(r) {
  if (!r) return null;
  const picks = (r.picks || []).filter((p) => p.type === 'erholung' || p.type === 'ruecksetzer').map((p) => ({
    symbol: p.symbol, name: p.name, index: U.indexOf(p.symbol), type: TYPE_TEXT[p.type] || p.type, sector: p.sector || '', price: p.price, entry: p.entry, stop: p.stop, target: p.target,
    score: p.score, verdict: verdictOf(p), hit: p.history?.cases ? `${p.history.winRate} % (${p.history.cases})` : '', reason: p.reason || '',
    ...(p.drop != null ? { drop: p.drop, dropDays: p.dropDays } : {}),
  }));
  const weak = (r.scan?.weak || []).slice(0, 3).map((x) => ({
    symbol: x.symbol, name: x.name, index: U.indexOf(x.symbol), type: 'Schwacher Chart', price: x.price, score: x.score, verdict: 'meiden',
    reason: `Abwärtstrend – Score ${x.score}/100${x.change1m != null ? `, 1 Monat ${x.change1m > 0 ? '+' : ''}${String(x.change1m).replace('.', ',')} %` : ''}. Erst kaufen, wenn sich der Trend dreht.`,
  }));
  // gezeigt werden: ALLE Kaufen-Werte, dazu höchstens 10 zum Beobachten (die stärksten); „Nicht kaufen“ nicht in der Karte
  const byScore = (a, b) => (b.score || 0) - (a.score || 0);
  const buy = picks.filter((p) => p.verdict === 'kaufen').sort(byScore);
  const watch = picks.filter((p) => p.verdict !== 'kaufen').sort(byScore).slice(0, 10);
  return { asOf: r.asOf, checked: r.checked || r.scan?.checked || null, mood: r.mood?.score > 2 ? 'positiv' : r.mood?.score < -2 ? 'negativ' : 'neutral',
    picks: [...buy, ...watch], avoid: weak.map((x) => x.name) };
}

module.exports = { verdictOf, overview, SECTOR, headlineScore, sentiment, dipAt, reboundAt, reboundInfo, computeRadar, refresh, latest, record, radarText, KEY, HIST };
