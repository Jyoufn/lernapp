// Chancen-Radar des Börsen-Bären – reiner Algorithmus, keine KI (kostet kein Kontingent).
// Läuft automatisch zur Börseneröffnung (Vercel-Cron) und zwischendurch (die App fragt alle 30 min nach) und sucht:
//   1. Rücksetzer in starker Branche: ein Wert aus einer gut laufenden Branche, langfristig intakt, ist kurz und kräftig gefallen
//      (deutlich unter dem 20-Tage-Hoch, RSI tief) und fängt sich gerade (grüne Kerze / über dem Vortagestief) → oft erholt er sich.
//      Genau das Muster, mit dem der Nutzer im Planspiel bisher Plus gemacht hat.
//   2. Nachrichten-Rückenwind: klar positive Schlagzeilen der letzten Tage (Auftrag, Prognose angehoben, Kursziel rauf …) bei intaktem Trend.
//   3. Ausbruch: Kurs knapp unter dem Jahreshoch nach enger Seitwärtsphase (aus dem Signal-Scan).
// Schlechte Nachrichten (Gewinnwarnung, Ermittlungen, Insolvenz …) schließen einen Rücksetzer aus – „fallendes Messer“.
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

  // Kandidaten: Rücksetzer in starker Branche
  const dips = rows.filter((r) => strong.has(SECTOR[r.sym]) && dipAt(r.ind, r.d.bars, r.i));
  // Nachrichten nur für Kandidaten + die besten Signal-Werte (spart Abrufe)
  const newsFor = [...new Set([...dips.map((r) => r.sym), ...scan.now.slice(0, 5).map((x) => x.symbol)])].slice(0, 10);
  const [newsList, marketNews] = await Promise.all([
    Promise.all(newsFor.map((s) => B.news(`${B.NAME_OF[s] || s}`, { signal, max: 6 }).then((n) => [s, sentiment(n, now)]).catch(() => [s, sentiment([], now)]))),
    Promise.all(['DAX Börse', 'Wall Street Börse'].map((q) => B.news(q, { signal, max: 8 }).catch(() => []))),
  ]);
  const sent = Object.fromEntries(newsList);
  const mood = sentiment(marketNews.flat(), now);

  const picks = [];
  const nameOf = (s) => B.NAME_OF[s] || s;
  for (const r of dips) {
    const s = sent[r.sym] || sentiment([], now);
    if (s.severe) continue; // schlechte Nachricht → fallendes Messer, nicht kaufen
    const c = r.ind.c[r.i], a = r.ind.atr[r.i] || c * 0.02, hi20 = r.ind.hi20[r.i];
    const hit = B.hitRate(r.ind, (ind, i) => dipAt(ind, r.d.bars, i), 10);
    const dd = 1 - c / hi20;
    const sec = sectorList.find((x) => x.name === SECTOR[r.sym]);
    const score = Math.round(50 + dd * 150 + (sec.r63 || 0) * 0.8 + (hit.cases >= 3 ? (hit.winRate - 50) * 0.4 : 0) + Math.max(-10, Math.min(10, s.score * 2)));
    picks.push({
      type: 'ruecksetzer', symbol: r.sym, name: nameOf(r.sym), sector: SECTOR[r.sym], price: rnd(c), score: Math.min(99, score),
      reason: `${nameOf(r.sym)} ist ${rnd(dd * 100, 1).toString().replace('.', ',')} % unter dem 20-Tage-Hoch gefallen (RSI ${Math.round(r.ind.rsi[r.i])}), die Branche ${SECTOR[r.sym]} läuft aber (3 Monate ${sec.r63 > 0 ? '+' : ''}${String(sec.r63).replace('.', ',')} %) und der Kurs fängt sich – typische Erholungschance`,
      entry: rnd(c), stop: rnd(Math.min(c - 1.8 * a, r.ind.lo20[r.i] * 0.985)), target: rnd(Math.min(hi20, c + 3 * a)),
      history: hit, news: s.top.map((n) => ({ title: n.title, source: n.source, url: n.url, score: n.score })), newsScore: s.score,
    });
  }
  // Nachrichten-Rückenwind bei intaktem Trend
  for (const x of scan.now.slice(0, 5)) {
    const s = sent[x.symbol];
    if (!s || s.score < 3 || s.severe || picks.some((p) => p.symbol === x.symbol)) continue;
    picks.push({ type: 'nachrichten', symbol: x.symbol, name: x.name, sector: SECTOR[x.symbol] || '', price: x.price, score: Math.min(99, x.score + Math.round(s.score)),
      reason: `Kaufsignal im Chart und klar positive Nachrichten (${s.top[0]?.title || ''})`, entry: x.entry || x.price, stop: x.stop, target: x.target, history: x.history,
      news: s.top.map((n) => ({ title: n.title, source: n.source, url: n.url, score: n.score })), newsScore: s.score });
  }
  // Ausbrüche aus dem Scan
  for (const x of scan.soon.filter((y) => y.setup === 'ausbruch').slice(0, 3)) {
    if (picks.some((p) => p.symbol === x.symbol)) continue;
    picks.push({ type: 'ausbruch', symbol: x.symbol, name: x.name, sector: SECTOR[x.symbol] || '', price: x.price, score: x.score, reason: x.reasons[0],
      entry: x.trigger, stop: x.stop, target: x.target, history: x.history, news: [], newsScore: 0 });
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
  const typ = { ruecksetzer: 'RÜCKSETZER IN STARKER BRANCHE', nachrichten: 'NACHRICHTEN-RÜCKENWIND', ausbruch: 'AUSBRUCH' };
  const e = (x) => (x == null ? '–' : `${x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
  const lines = [`CHANCEN-RADAR (Algorithmus, Stand ${new Date(r.asOf).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} Uhr, ${r.checked} Werte):`];
  lines.push(`BRANCHEN (3 Monate, Anteil über 200-Tage-Linie): ${r.sectors.map((s) => `${s.name} ${s.r63 > 0 ? '+' : ''}${String(s.r63).replace('.', ',')} % (${s.above200} %)`).join(' · ')}`);
  lines.push(`MARKTSTIMMUNG aus Schlagzeilen: ${r.mood.score > 2 ? 'positiv' : r.mood.score < -2 ? 'negativ' : 'neutral'} (${r.mood.score})${r.mood.top.length ? ` – ${r.mood.top.map((n) => n.title).join(' | ')}` : ''}`);
  if (r.picks.length) lines.push(...r.picks.map((p) => `- ${typ[p.type]}: ${p.name} (${p.symbol}) ${e(p.price)} · Score ${p.score} · ${p.reason} · Einstieg ${e(p.entry)}, Stopp ${e(p.stop)}, Ziel ${e(p.target)}${p.history?.cases ? ` · Trefferquote dieses Musters bei der Aktie: ${p.history.winRate} % von ${p.history.cases} (10 Handelstage)` : ''}${p.news?.length ? ` · Nachrichten: ${p.news.map((n) => `${n.score > 0 ? '+' : ''}${n.score} ${n.title}`).join(' | ')}` : ''}`));
  else lines.push('- Gerade keine Chance, die alle Bedingungen erfüllt.');
  const rec = r.record;
  if (rec?.checked5) lines.push(`RADAR-BILANZ (eigenes Gedächtnis, ausgewertet): nach 5 Handelstagen ${rec.win5} % von ${rec.checked5} Chancen im Plus (Ø ${rec.avg5 > 0 ? '+' : ''}${String(rec.avg5).replace('.', ',')} %)${rec.checked10 ? `, nach 10 Tagen ${rec.win10} % (Ø ${String(rec.avg10).replace('.', ',')} %)` : ''}${Object.keys(rec.byType).length ? ` · je Muster: ${Object.entries(rec.byType).map(([t, v]) => `${typ[t]} ${v.win5} % von ${v.n}`).join(', ')}` : ''} – gewichte Muster stärker, die zuletzt funktioniert haben.`);
  return lines.join('\n');
}

// Chancen-Übersicht für die Karte im Chat (```chancen): Kaufen nur, wenn alles passt (Score ≥ 75, Chance:Risiko ≥ 1,5, Einstieg am Kurs;
// Ausbruch = erst beim Auslöser → Beobachten); die schwächsten Charts kommen als „Nicht kaufen“ dazu
const TYPE_TEXT = { ruecksetzer: 'Rücksetzer in starker Branche', nachrichten: 'Nachrichten-Rückenwind', ausbruch: 'Ausbruch' };
function verdictOf(p) {
  const crv = p.entry && p.stop && p.target && p.entry > p.stop ? (p.target - p.entry) / (p.entry - p.stop) : 0;
  const near = p.price && p.entry ? Math.abs(p.entry / p.price - 1) <= 0.015 : false;
  return p.type !== 'ausbruch' && p.score >= 75 && crv >= 1.5 && near ? 'kaufen' : 'beobachten';
}
function overview(r) {
  if (!r) return null;
  const picks = (r.picks || []).map((p) => ({
    symbol: p.symbol, name: p.name, type: TYPE_TEXT[p.type] || p.type, sector: p.sector || '', price: p.price, entry: p.entry, stop: p.stop, target: p.target,
    score: p.score, verdict: verdictOf(p), hit: p.history?.cases ? `${p.history.winRate} % (${p.history.cases})` : '', reason: p.reason || '',
  }));
  // dazu ALLE Kaufsignale und Setups aus dem Scan über alle Planspiel-Werte, die der Radar nicht schon nennt
  const have = new Set(picks.map((p) => p.symbol));
  const fromScan = (x, soon) => {
    const entry = x.trigger || x.entry || x.price;
    const item = { symbol: x.symbol, name: x.name, sector: SECTOR[x.symbol] || '', price: x.price, entry, stop: x.stop, target: x.target, score: x.score,
      type: soon ? (x.signal === 'ueberhitzt' ? 'Überhitzt – Rücksetzer abwarten' : x.setup === 'ausbruch' ? 'Ausbruch bald' : 'Setup bildet sich') : 'Kaufsignal im Chart',
      hit: x.history?.cases ? `${x.history.winRate} % (${x.history.cases})` : '', reason: (x.reasons || []).slice(0, 2).join('; ') };
    const crv = entry && x.stop && x.target && entry > x.stop ? (x.target - entry) / (entry - x.stop) : 0;
    const near = x.price && entry ? Math.abs(entry / x.price - 1) <= 0.015 : false;
    item.verdict = !soon && x.score >= 70 && crv >= 1.5 && near && !(x.history?.cases >= 5 && x.history.winRate < 45) ? 'kaufen' : 'beobachten';
    return item;
  };
  const scanItems = [...(r.scan?.now || []).map((x) => fromScan(x, false)), ...(r.scan?.soon || []).map((x) => fromScan(x, true))]
    .filter((x) => !have.has(x.symbol) && have.add(x.symbol));
  picks.push(...scanItems);
  const weak = (r.scan?.weak || []).slice(0, 3).map((x) => ({
    symbol: x.symbol, name: x.name, type: 'Schwacher Chart', price: x.price, score: x.score, verdict: 'meiden',
    reason: `Abwärtstrend – Score ${x.score}/100${x.change1m != null ? `, 1 Monat ${x.change1m > 0 ? '+' : ''}${String(x.change1m).replace('.', ',')} %` : ''}. Erst kaufen, wenn sich der Trend dreht.`,
  }));
  // gezeigt werden: ALLE Kaufen-Werte, dazu höchstens 10 zum Beobachten (die stärksten); „Nicht kaufen“ nicht in der Karte
  const byScore = (a, b) => (b.score || 0) - (a.score || 0);
  const buy = picks.filter((p) => p.verdict === 'kaufen').sort(byScore);
  const watch = picks.filter((p) => p.verdict !== 'kaufen').sort(byScore).slice(0, 10);
  return { asOf: r.asOf, checked: r.checked || r.scan?.checked || null, mood: r.mood?.score > 2 ? 'positiv' : r.mood?.score < -2 ? 'negativ' : 'neutral',
    picks: [...buy, ...watch], avoid: weak.map((x) => x.name) };
}

module.exports = { verdictOf, overview, SECTOR, headlineScore, sentiment, dipAt, computeRadar, refresh, latest, record, radarText, KEY, HIST };
