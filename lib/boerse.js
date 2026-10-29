// Börsen-Agent (Bulle): Kurse aus mehreren Quellen, Chart-Kennzahlen, Kauf-/Verkaufssignale und die Regeln des Planspiels Börse.
//
// Quellen (ohne Schlüssel): Yahoo Finance (Kursverlauf, Suche) als Hauptquelle, Stooq als zweite Quelle zum Gegenprüfen
// bzw. als Ersatz, Google News (RSS) für aktuelle Schlagzeilen. Alle Abrufe mit Zeitlimit; fällt eine Quelle aus, geht es mit
// der anderen weiter. Zwischenspeicher im Arbeitsspeicher (Kurse 5 min, Marktscan 15 min).
//
// WICHTIG: Die Signale sind Wahrscheinlichkeiten aus dem Chart (Trend, Momentum, Überhitzung, Volatilität) – keine Garantie.
// Deshalb wird zu jedem Kaufsignal ehrlich mitgerechnet, wie oft dasselbe Signal bei dieser Aktie in den letzten zwei Jahren
// danach gestiegen ist („Trefferquote“).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const hooks = { fetch: (...a) => fetch(...a), now: () => Date.now() }; // in Tests austauschbar

/* ---------- Planspiel Börse 2026/27 (Sparkassen) ----------
   1.10.2026 – 25.1.2027 · 50.000 € Startkapital · je Kauf/Verkauf 0,3 % vom Kurswert, mindestens 15 € · eine Position höchstens
   20 % des Depotwerts (beim Kauf) · bis 22.1.2027 mindestens 3 abgerechnete Käufe · keine Papiere unter 1 € · Market, Limit,
   Stop-Loss, Stop-Buy (bis 14 Tage gültig) · Handelszeiten der Börse Stuttgart (ca. 8–22 Uhr) */
const PLANSPIEL = {
  name: 'Planspiel Börse 2026/27', start: '2026-10-01', end: '2027-01-25', passiveDeadline: '2027-01-22',
  capital: 50000, feeRate: 0.003, feeMin: 15, maxWeight: 0.2, minBuys: 3, minPrice: 1, cancelFee: 2.5, orderDays: 14,
};
const fee = (volume) => Math.max(PLANSPIEL.feeMin, PLANSPIEL.feeRate * Math.abs(volume || 0));

/* ---------- Beobachtete Werte (Marktscan) ----------
   Große Werte aus DAX, MDAX/TecDAX, Nasdaq 100, Dow Jones und EuroStoxx – alle im Planspiel handelbar. Aliase: Namen, unter denen
   man nach ihnen fragt. Deutsche Werte über Xetra (Euro), US-Werte in Dollar (wird in Euro umgerechnet). */
const UNIVERSE = [
  ['ADS.DE', 'adidas', 'adidas'], ['AIR.DE', 'Airbus', 'airbus'], ['ALV.DE', 'Allianz', 'allianz'], ['BAS.DE', 'BASF', 'basf'],
  ['BAYN.DE', 'Bayer', 'bayer'], ['BEI.DE', 'Beiersdorf', 'beiersdorf|nivea'], ['BMW.DE', 'BMW', 'bmw'], ['BNR.DE', 'Brenntag', 'brenntag'],
  ['CBK.DE', 'Commerzbank', 'commerzbank'], ['CON.DE', 'Continental', 'continental'], ['DTG.DE', 'Daimler Truck', 'daimler truck'],
  ['DBK.DE', 'Deutsche Bank', 'deutsche bank'], ['DB1.DE', 'Deutsche Börse', 'deutsche börse|deutsche boerse'], ['DHL.DE', 'DHL Group', 'dhl|deutsche post'],
  ['DTE.DE', 'Deutsche Telekom', 'telekom|deutsche telekom'], ['EOAN.DE', 'E.ON', 'e\\.on|eon'], ['FRE.DE', 'Fresenius', 'fresenius'],
  ['G1A.DE', 'GEA Group', 'gea'], ['HNR1.DE', 'Hannover Rück', 'hannover rück|hannover rueck|hannover re'], ['HEI.DE', 'Heidelberg Materials', 'heidelberg materials|heidelbergcement'],
  ['HEN3.DE', 'Henkel', 'henkel'], ['IFX.DE', 'Infineon', 'infineon'], ['MBG.DE', 'Mercedes-Benz', 'mercedes|mercedes-benz'],
  ['MRK.DE', 'Merck KGaA', 'merck'], ['MTX.DE', 'MTU Aero Engines', 'mtu'], ['MUV2.DE', 'Münchener Rück', 'münchener rück|munich re|muenchener rueck'],
  ['P911.DE', 'Porsche AG', 'porsche'], ['PAH3.DE', 'Porsche SE', 'porsche se'], ['QIA.DE', 'Qiagen', 'qiagen'], ['RHM.DE', 'Rheinmetall', 'rheinmetall'],
  ['RWE.DE', 'RWE', 'rwe'], ['SAP.DE', 'SAP', 'sap'], ['SRT3.DE', 'Sartorius', 'sartorius'], ['SIE.DE', 'Siemens', 'siemens'],
  ['ENR.DE', 'Siemens Energy', 'siemens energy'], ['SHL.DE', 'Siemens Healthineers', 'healthineers|siemens healthineers'], ['SY1.DE', 'Symrise', 'symrise'],
  ['VOW3.DE', 'Volkswagen', 'volkswagen|vw'], ['VNA.DE', 'Vonovia', 'vonovia'], ['ZAL.DE', 'Zalando', 'zalando'], ['G24.DE', 'Scout24', 'scout24'],
  ['HAG.DE', 'Hensoldt', 'hensoldt'], ['R3NK.DE', 'Renk', 'renk'], ['LHA.DE', 'Lufthansa', 'lufthansa'], ['TUI1.DE', 'TUI', 'tui'],
  ['AAPL', 'Apple', 'apple'], ['MSFT', 'Microsoft', 'microsoft'], ['NVDA', 'Nvidia', 'nvidia'], ['AMZN', 'Amazon', 'amazon'],
  ['GOOGL', 'Alphabet (Google)', 'alphabet|google'], ['META', 'Meta (Facebook)', 'meta|facebook'], ['TSLA', 'Tesla', 'tesla'], ['AMD', 'AMD', 'amd'],
  ['NFLX', 'Netflix', 'netflix'], ['AVGO', 'Broadcom', 'broadcom'], ['PLTR', 'Palantir', 'palantir'], ['COST', 'Costco', 'costco'],
  ['ASML.AS', 'ASML', 'asml'], ['MC.PA', 'LVMH', 'lvmh|louis vuitton'], ['SU.PA', 'Schneider Electric', 'schneider electric'], ['NOVO-B.CO', 'Novo Nordisk', 'novo nordisk|novo'],
  ['KO', 'Coca-Cola', 'coca-cola|coca cola'], ['DIS', 'Disney', 'disney'], ['JPM', 'JPMorgan', 'jpmorgan|jp morgan'], ['V', 'Visa', 'visa'],
].map(([symbol, name, alias]) => ({ symbol, name, alias: new RegExp(`(^|[^\\p{L}\\d])(${alias})(?=$|[^\\p{L}\\d])`, 'iu') }));
const NAME_OF = Object.fromEntries(UNIVERSE.map((u) => [u.symbol, u.name]));

/* ---------- Abruf ---------- */
const cache = new Map();
async function cached(key, ttlMs, make) {
  const hit = cache.get(key);
  if (hit && hooks.now() - hit.t < ttlMs) return hit.v;
  const p = make();
  cache.set(key, { t: hooks.now(), v: p });
  try { const v = await p; cache.set(key, { t: hooks.now(), v }); return v; } catch (err) { cache.delete(key); throw err; }
}
async function get(url, { signal, timeoutMs = 8000, type = 'json' } = {}) {
  const sig = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean));
  const res = await hooks.fetch(url, { headers: { 'User-Agent': UA, Accept: type === 'json' ? 'application/json' : '*/*' }, signal: sig });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return type === 'json' ? res.json() : res.text();
}

// Yahoo Finance: Tageskerzen (2 Jahre) + aktueller Kurs (meist 15 min verzögert)
async function yahooSeries(symbol, opts = {}) {
  const q = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&includePrePost=false&events=div%2Csplit`;
  let j;
  try { j = await get(`https://query1.finance.yahoo.com${q}`, opts); } catch { j = await get(`https://query2.finance.yahoo.com${q}`, opts); }
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp?.length) throw new Error(j?.chart?.error?.description || 'keine Kursdaten');
  const qd = r.indicators?.quote?.[0] || {};
  const bars = [];
  r.timestamp.forEach((t, i) => {
    const c = qd.close?.[i];
    if (c == null || !Number.isFinite(c)) return;
    bars.push({ t: t * 1000, o: qd.open?.[i] ?? c, h: qd.high?.[i] ?? c, l: qd.low?.[i] ?? c, c, v: qd.volume?.[i] ?? 0 });
  });
  const m = r.meta || {};
  // aktueller Kurs: letzte Kerze auf den Live-Kurs setzen (gleicher Tag) bzw. neue Kerze anhängen
  if (Number.isFinite(m.regularMarketPrice) && bars.length) {
    const last = bars[bars.length - 1], live = m.regularMarketPrice, lt = (m.regularMarketTime || 0) * 1000;
    if (lt && new Date(lt).toDateString() !== new Date(last.t).toDateString() && lt > last.t) bars.push({ t: lt, o: live, h: live, l: live, c: live, v: 0 });
    else { last.c = live; last.h = Math.max(last.h, live); last.l = Math.min(last.l, live); }
  }
  return { symbol, name: NAME_OF[symbol] || m.shortName || m.longName || symbol, currency: m.currency || 'EUR', exchange: m.fullExchangeName || m.exchangeName || '',
    time: (m.regularMarketTime || 0) * 1000 || bars[bars.length - 1]?.t, bars, source: 'Yahoo Finance' };
}

// Stooq: Tageskerzen als CSV (zweite Quelle). Nur für Xetra (.DE) und US-Werte.
function stooqSymbol(symbol) {
  if (/\.DE$/i.test(symbol)) return symbol.toLowerCase();
  if (/^[A-Z.-]{1,6}$/.test(symbol) && !symbol.includes('.')) return `${symbol.toLowerCase()}.us`;
  return null;
}
async function stooqSeries(symbol, opts = {}) {
  const s = stooqSymbol(symbol);
  if (!s) throw new Error('bei Stooq nicht verfügbar');
  const csv = await get(`https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`, { ...opts, type: 'text' });
  const lines = String(csv).trim().split(/\r?\n/);
  if (!/^date/i.test(lines[0] || '')) throw new Error('keine Kursdaten');
  const bars = lines.slice(1).map((l) => l.split(',')).filter((p) => p.length >= 5 && Number.isFinite(+p[4]))
    .map(([d, o, h, l, c, v]) => ({ t: Date.parse(`${d}T17:30:00Z`), o: +o, h: +h, l: +l, c: +c, v: +v || 0 })).slice(-520);
  if (!bars.length) throw new Error('keine Kursdaten');
  return { symbol, name: NAME_OF[symbol] || symbol, currency: /\.DE$/i.test(symbol) ? 'EUR' : 'USD', exchange: /\.DE$/i.test(symbol) ? 'XETRA' : 'US', time: bars[bars.length - 1].t, bars, source: 'Stooq' };
}

// Wechselkurs → Euro (1 Einheit Fremdwährung = x €); GBp (Pence, London) = GBP / 100
async function fxToEur(currency, opts = {}) {
  const pence = currency === 'GBp' || currency === 'GBX';
  const base = pence ? 'GBP' : String(currency || 'EUR').toUpperCase();
  if (base === 'EUR') return 1;
  const rate = await cached(`fx:${base}`, 30 * 60000, async () => {
    const s = await yahooSeries(`${base}EUR=X`, opts);
    return s.bars[s.bars.length - 1].c;
  });
  return pence ? rate / 100 : rate;
}

// Kursverlauf einer Aktie: Yahoo zuerst, Stooq als Ersatz; mit cross=true zusätzlich Stooq zum Gegenprüfen des letzten Kurses
async function series(symbol, { signal, cross = false } = {}) {
  return cached(`s:${symbol}:${cross ? 1 : 0}`, 5 * 60000, async () => {
    const hasStooq = !!stooqSymbol(symbol);
    const [y, s] = await Promise.allSettled([yahooSeries(symbol, { signal }), cross && hasStooq ? stooqSeries(symbol, { signal }) : Promise.resolve(null)]);
    let main = y.status === 'fulfilled' ? y.value : null;
    let second = s.status === 'fulfilled' ? s.value : null;
    if (!main) {
      // Yahoo nicht erreichbar → Stooq als Ersatz
      main = second || (hasStooq && !cross ? await stooqSeries(symbol, { signal }).catch(() => null) : null);
      second = null;
      if (!main) throw new Error(y.reason?.message || 'keine Kursdaten');
    }
    const out = { ...main, sources: [main.source] };
    if (second) {
      const a = main.bars[main.bars.length - 1].c, b = second.bars[second.bars.length - 1].c;
      out.sources.push(second.source);
      out.crossCheck = { other: second.source, price: b, diffPct: a ? ((b - a) / a) * 100 : 0 };
    }
    return out;
  });
}

/* ---------- Kennzahlen (je Tag eine Reihe) ---------- */
function sma(v, n) {
  const out = new Array(v.length).fill(null);
  let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
function ema(v, n) {
  const out = new Array(v.length).fill(null), k = 2 / (n + 1);
  let e = null;
  for (let i = 0; i < v.length; i++) {
    if (v[i] == null) continue;
    e = e == null ? v[i] : v[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}
function rsi(c, n = 14) { // Wilder
  const out = new Array(c.length).fill(null);
  let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } continue; }
    g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
function atr(bars, n = 14) {
  const tr = bars.map((b, i) => (i ? Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)) : b.h - b.l));
  const out = new Array(bars.length).fill(null);
  let a = null;
  for (let i = 0; i < tr.length; i++) {
    if (i < n - 1) continue;
    a = a == null ? tr.slice(0, n).reduce((x, y) => x + y, 0) / n : (a * (n - 1) + tr[i]) / n;
    out[i] = a;
  }
  return out;
}
function indicators(bars) {
  const c = bars.map((b) => b.c);
  const e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = c.map((_, i) => (e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null));
  const sig = ema(macd.map((x) => x), 9);
  const hist = macd.map((m, i) => (m != null && sig[i] != null ? m - sig[i] : null));
  const hi = c.map((_, i) => Math.max(...c.slice(Math.max(0, i - 251), i + 1)));
  return { c, sma20: sma(c, 20), sma50: sma(c, 50), sma200: sma(c, 200), rsi: rsi(c), atr: atr(bars), macd, hist, hi52: hi,
    lo20: c.map((_, i) => Math.min(...c.slice(Math.max(0, i - 19), i + 1))), hi20: c.map((_, i) => Math.max(...c.slice(Math.max(0, i - 19), i + 1))) };
}
const ret = (c, i, n) => (i - n >= 0 && c[i - n] ? c[i] / c[i - n] - 1 : null);

// Bullen-Score 0–100 an Tag i: Trend (35) + Momentum (30) + RSI (15) + Stärke nahe Jahreshoch (10) + Ruhe (10)
function scoreAt(ind, i) {
  const { c, sma20, sma50, sma200, rsi: r, hist, hi52, atr: a } = ind;
  if (i < 60 || sma50[i] == null) return null;
  let s = 0;
  const parts = [];
  if (c[i] > sma50[i]) { s += 10; parts.push('über der 50-Tage-Linie'); }
  if (sma200[i] != null && sma50[i] > sma200[i]) { s += 10; parts.push('Aufwärtstrend'); }
  if (sma200[i] != null && c[i] > sma200[i]) s += 5;
  if (sma50[i - 10] != null && sma50[i] > sma50[i - 10]) { s += 10; parts.push('Trend steigt'); }
  const r63 = ret(c, i, 63), r21 = ret(c, i, 21);
  if (r63 != null) s += r63 > 0.1 ? 10 : r63 > 0 ? 5 : 0;
  if (r21 != null && r21 > 0) s += 5;
  if (hist[i] != null && hist[i] > 0) { s += 8; parts.push('MACD positiv'); }
  if (hist[i] != null && hist[i - 3] != null && hist[i] > hist[i - 3]) s += 7;
  if (r[i] != null) s += r[i] >= 45 && r[i] <= 68 ? 15 : r[i] > 68 && r[i] <= 75 ? 6 : r[i] > 75 ? -8 : r[i] >= 32 ? 5 : 0;
  if (hi52[i] && c[i] >= hi52[i] * 0.95) { s += 10; parts.push('nahe Jahreshoch'); }
  else if (hi52[i] && c[i] < hi52[i] * 0.7) s -= 5;
  if (a[i] && c[i] && a[i] / c[i] < 0.025) s += 10; else if (a[i] && c[i] && a[i] / c[i] < 0.04) s += 5; // ruhige Werte schwanken weniger gegen einen
  return { score: Math.max(0, Math.min(100, Math.round(s))), parts };
}

// Kaufsignal „jetzt“ an Tag i (dieselbe Regel für die Trefferquote)
function buyNowAt(ind, i) {
  const sc = scoreAt(ind, i);
  if (!sc) return false;
  const ext = ind.sma20[i] ? ind.c[i] / ind.sma20[i] - 1 : 0;
  return sc.score >= 70 && ind.rsi[i] < 72 && ext < 0.07 && ind.hist[i] > 0;
}

// Wie oft ist die Aktie in den 20 Handelstagen nach demselben Kaufsignal gestiegen? (letzte ~2 Jahre, Signale mind. 5 Tage auseinander)
function hitRate(ind, rule = buyNowAt, horizon = 20) {
  const res = [];
  let lastI = -99;
  for (let i = 200; i < ind.c.length - horizon; i++) {
    if (i - lastI < 5 || !rule(ind, i)) continue;
    lastI = i;
    res.push(ind.c[i + horizon] / ind.c[i] - 1);
  }
  if (!res.length) return { cases: 0 };
  const wins = res.filter((x) => x > 0).length;
  return { cases: res.length, winRate: Math.round((wins / res.length) * 100), avgPct: +(res.reduce((x, y) => x + y, 0) / res.length * 100).toFixed(1), horizonDays: horizon };
}

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(d));
const pct = (x) => (x == null ? null : round(x * 100, 1));
const de = (x) => String(x ?? '–').replace('.', ',');

/* ---------- Analyse einer Aktie ----------
   signal: kaufen (jetzt) · bald (Einstieg bahnt sich an) · ueberhitzt (stark, aber Rücksetzer abwarten) · halten · meiden
   Für eigene Positionen (holding = {buyPrice, buyDate, qty}): halten · nachkaufen · teilgewinn · verkaufen */
function analyze(data, { holding = null, fx = 1, depotValue = null } = {}) {
  const bars = data.bars;
  if (bars.length < 30) throw new Error('zu wenig Kursdaten');
  const ind = indicators(bars);
  const fxr = (x) => (x == null ? null : round(x * fx));
  const i = bars.length - 1;
  const c = ind.c[i], a = ind.atr[i] || c * 0.02;
  const sc = scoreAt(ind, i) || { score: 50, parts: [] };
  const ext20 = ind.sma20[i] ? c / ind.sma20[i] - 1 : 0;
  const up = ind.sma200[i] != null && ind.sma50[i] > ind.sma200[i];
  const range20 = ind.hi20[i] && ind.lo20[i] ? (ind.hi20[i] - ind.lo20[i]) / c : 1;
  const reasons = [];
  let signal = 'halten', setup = null, trigger = null, entry = null;

  const hist = hitRate(ind);
  const weakHistory = hist.cases >= 5 && hist.winRate < 50; // dasselbe Signal hat bei dieser Aktie meist nicht funktioniert
  if (buyNowAt(ind, i) && !weakHistory) {
    signal = 'kaufen';
    const why = ['Aufwärtstrend', 'nahe Jahreshoch', 'MACD positiv', 'Trend steigt', 'über der 50-Tage-Linie'].filter((x) => sc.parts.includes(x)).slice(0, 3).join(', ');
    reasons.push(`${why.charAt(0).toUpperCase()}${why.slice(1)} – Einstieg jetzt möglich`);
    entry = c;
  } else if (buyNowAt(ind, i)) {
    signal = 'halten';
    reasons.push(`Chart sieht gut aus, aber dasselbe Signal hat bei dieser Aktie nur in ${hist.winRate} % der Fälle funktioniert – lieber nicht darauf setzen`);
  } else if (sc.score >= 65 && (ind.rsi[i] >= 72 || ext20 >= 0.07)) {
    signal = 'ueberhitzt';
    entry = ind.sma20[i];
    reasons.push(`Stark, aber kurzfristig heiß gelaufen (RSI ${round(ind.rsi[i], 0)}, ${de(pct(ext20))} % über der 20-Tage-Linie) – Rücksetzer Richtung ${de(round(ind.sma20[i] * fx))} € abwarten`);
  } else if (up && ind.c[i] >= ind.hi52[i] * 0.97 && range20 < 0.09) {
    signal = 'bald'; setup = 'ausbruch'; trigger = ind.hi52[i] * 1.005;
    reasons.push(`Kurz vor dem Ausbruch über das Jahreshoch (${de(round(ind.hi52[i] * fx))} €) nach enger Seitwärtsphase – Stop-Buy knapp darüber`);
  } else if (up && ind.sma50[i] != null && c >= ind.sma50[i] * 0.97 && c <= ind.sma50[i] * 1.03 && ind.rsi[i] >= 35 && ind.rsi[i] <= 55) {
    signal = 'bald'; setup = 'ruecksetzer'; entry = c;
    reasons.push(`Rücksetzer im Aufwärtstrend bis an die 50-Tage-Linie (${de(round(ind.sma50[i] * fx))} €) – typische Kaufzone, Einstieg sobald der Kurs wieder dreht`);
  } else if (ind.hist[i] < 0 && ind.hist[i] > ind.hist[i - 1] && ind.hist[i - 1] > ind.hist[i - 2] && ind.hist[i - 2] > ind.hist[i - 3] && ind.sma200[i] != null && c > ind.sma200[i]) {
    signal = 'bald'; setup = 'dreht';
    reasons.push('Momentum dreht nach oben (MACD erholt sich seit 3 Tagen) – noch kein Kaufsignal, beobachten');
  } else if (sc.score < 35) {
    signal = 'meiden';
    reasons.push(`Schwacher Chart (Score ${sc.score}/100)${ind.sma200[i] != null && c < ind.sma200[i] ? ', unter der 200-Tage-Linie' : ''} – kein Einstieg`);
  } else {
    reasons.push(`Kein klares Signal (Score ${sc.score}/100)`);
  }

  // Risiko: Stopp 2 ATR unter dem Einstieg (nie über der letzten Kerze), Ziel 3 ATR darüber (Chance:Risiko 1,5)
  const base = entry ?? trigger ?? c;
  const stop = Math.min(base - 2 * a, c * 0.995);
  const target = base + 3 * a;
  const out = {
    symbol: data.symbol, name: data.name, currency: data.currency, exchange: data.exchange, sources: data.sources || [data.source], crossCheck: data.crossCheck || null,
    time: data.time, price: round(c * fx), priceNative: round(c, 4), fx: round(fx, 6),
    change1d: pct(ret(ind.c, i, 1)), change1w: pct(ret(ind.c, i, 5)), change1m: pct(ret(ind.c, i, 21)), change3m: pct(ret(ind.c, i, 63)), change1y: pct(ret(ind.c, i, 250)),
    sma20: fxr(ind.sma20[i]), sma50: fxr(ind.sma50[i]), sma200: fxr(ind.sma200[i]),
    rsi: round(ind.rsi[i], 0), macdHist: round(ind.hist[i], 4), atr: round(a * fx), atrPct: pct(a / c), high52: round(ind.hi52[i] * fx),
    score: sc.score, signal, setup, reasons,
    entry: fxr(entry), trigger: fxr(trigger),
    stop: round(stop * fx), target: round(target * fx), targetPct: pct(target / c - 1),
    history: hist,
    spark: ind.c.slice(-60).map((x) => round(x * fx)),
  };

  if (holding && holding.buyPrice > 0) {
    // Position: Stopp = Einstiegs-Stopp (2 ATR unter Kaufkurs) bzw. nachgezogen 2,5 ATR unter dem höchsten Schlusskurs seit dem Kauf
    const bp = holding.buyPrice / fx; // Kaufkurs (Euro) in der Kurswährung
    const since = holding.buyDate ? Date.parse(holding.buyDate) : 0;
    const highSince = Math.max(bp, ...bars.filter((b) => b.t >= since).map((b) => b.c));
    const hStop = Math.max(bp - 2 * a, highSince - 2.5 * a);
    const gain = c / bp - 1;
    const hReasons = [];
    let hs = 'halten';
    if (c < hStop) { hs = 'verkaufen'; hReasons.push(`Kurs unter dem Stopp (${de(round(hStop * fx))} €) – ${gain < 0 ? 'Verlust begrenzen, bevor er größer wird' : 'Gewinn sichern'}`); }
    else if (ind.sma50[i] != null && c < ind.sma50[i] * 0.98 && ind.hist[i] < 0 && (ind.sma200[i] == null || ind.sma50[i] < ind.sma50[i - 5])) { hs = 'verkaufen'; hReasons.push('Trend gebrochen: unter der 50-Tage-Linie, MACD negativ'); }
    else if (ind.rsi[i] > 78 || ext20 > 0.12) { hs = 'teilgewinn'; hReasons.push(`Heiß gelaufen (RSI ${round(ind.rsi[i], 0)}) – einen Teil verkaufen und Gewinn sichern, Rest mit Stopp ${de(round(hStop * fx))} € laufen lassen`); }
    else if (c >= bp + 3 * a && gain > 0.08 && ind.rsi[i] > 70) { hs = 'teilgewinn'; hReasons.push(`Ziel erreicht (+${de(pct(gain))} %) – Teilgewinn mitnehmen`); }
    else if (signal === 'kaufen' || (signal === 'bald' && setup === 'ruecksetzer' && gain > 0)) { hs = 'nachkaufen'; hReasons.push('Trend intakt und wieder in der Kaufzone – Nachkauf möglich (20-%-Regel beachten)'); }
    else hReasons.push(`Trend intakt – halten, Stopp bei ${de(round(hStop * fx))} €`);
    const value = c * fx * (holding.qty || 0);
    const buyFee = fee(holding.buyPrice * (holding.qty || 0)), sellFee = fee(value);
    out.holding = {
      signal: hs, reasons: hReasons, stop: round(hStop * fx), qty: holding.qty || 0, buyPrice: round(holding.buyPrice), value: round(value),
      gainPct: pct(gain), gainEur: round(value - holding.buyPrice * (holding.qty || 0) - buyFee - sellFee), // nach Gebühren (Kauf + Verkauf)
      weightPct: depotValue ? pct(value / depotValue) : null,
      overWeight: depotValue ? value / depotValue > PLANSPIEL.maxWeight : false,
    };
  }
  return out;
}

/* ---------- Positionsgröße nach Planspiel-Regeln ----------
   Risiko je Kauf ~1,5 % des Depots bis zum Stopp, höchstens 20 % des Depots, Gebühr 0,3 % (min. 15 €) – unter ~5.000 € wird es teuer */
function positionSize({ price, stop, depotValue = PLANSPIEL.capital, cash = depotValue, riskPct = 0.015 }) {
  if (!(price > 0)) return null;
  const risk = Math.max(price - (stop || price * 0.92), price * 0.01);
  let qty = Math.floor((depotValue * riskPct) / risk);
  qty = Math.min(qty, Math.floor((depotValue * PLANSPIEL.maxWeight) / price), Math.floor((cash - PLANSPIEL.feeMin) / (price * (1 + PLANSPIEL.feeRate))));
  qty = Math.max(0, qty);
  const volume = qty * price;
  return { qty, volume: round(volume), fee: round(fee(volume)), breakEvenPct: volume ? pct((2 * fee(volume)) / volume) : null, cheapAbove: PLANSPIEL.feeMin / PLANSPIEL.feeRate };
}

/* ---------- Planspiel-Stand ---------- */
function planspielStatus(now = hooks.now(), buys = 0) {
  const day = 86400000;
  const end = Date.parse(`${PLANSPIEL.end}T22:00:00+01:00`), dl = Date.parse(`${PLANSPIEL.passiveDeadline}T22:00:00+01:00`), start = Date.parse(`${PLANSPIEL.start}T08:00:00+02:00`);
  return { ...PLANSPIEL, running: now >= start && now <= end, daysLeft: Math.max(0, Math.ceil((end - now) / day)), daysToDeadline: Math.max(0, Math.ceil((dl - now) / day)), buys, buysMissing: Math.max(0, PLANSPIEL.minBuys - buys) };
}
// Börse Stuttgart: Mo–Fr ca. 8–22 Uhr (deutsche Zeit)
function marketOpen(now = hooks.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return !['Sat', 'Sun'].includes(p.weekday) && +p.hour >= 8 && +p.hour < 22;
}

/* ---------- Mehrere Werte (mit Währungsumrechnung) ---------- */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i], i).catch((err) => ({ error: err.message })); } }));
  return out;
}
async function analyzeSymbol(symbol, { signal, holding, depotValue, cross = false } = {}) {
  const data = await series(symbol, { signal, cross });
  const fx = await fxToEur(data.currency, { signal }).catch(() => null);
  if (fx == null) throw new Error(`Wechselkurs ${data.currency} → EUR nicht verfügbar`);
  return analyze(data, { holding, fx, depotValue });
}

// Depot + Beobachtungsliste prüfen: positions = [{symbol, qty, buyPrice, buyDate}], watch = [symbol]
async function check({ positions = [], watch = [], cash = null } = {}, { signal } = {}) {
  const pos = positions.filter((p) => p && typeof p.symbol === 'string').slice(0, 40);
  const w = [...new Set(watch.filter((s) => typeof s === 'string'))].filter((s) => !pos.some((p) => p.symbol === s)).slice(0, 40);
  // Depotwert zuerst grob (Kaufkurse), dann mit aktuellen Kursen
  const first = await pool(pos, 6, (p) => analyzeSymbol(p.symbol, { signal, holding: { qty: +p.qty || 0, buyPrice: +p.buyPrice || 0, buyDate: p.buyDate }, cross: true }));
  const invested = first.reduce((s, x) => s + (x.holding?.value || 0), 0);
  const depotValue = invested + (Number.isFinite(+cash) && cash !== null ? +cash : 0) || null;
  const holdings = first.map((x, i) => {
    if (x.error || !x.holding || !depotValue) return x.error ? { symbol: pos[i].symbol, error: x.error } : x;
    x.holding.weightPct = pct(x.holding.value / depotValue);
    x.holding.overWeight = x.holding.value / depotValue > PLANSPIEL.maxWeight;
    return x;
  });
  const watched = await pool(w, 6, (s) => analyzeSymbol(s, { signal }));
  return { asOf: new Date(hooks.now()).toISOString(), marketOpen: marketOpen(), depotValue: round(depotValue), holdings, watch: watched.map((x, i) => (x.error ? { symbol: w[i], error: x.error } : x)) };
}

// Marktscan: alle beobachteten Werte → Potenzial jetzt (Kaufsignal) und bald (Setup bildet sich)
async function scan({ signal, extra = [] } = {}) {
  const symbols = [...new Set([...UNIVERSE.map((u) => u.symbol), ...extra.filter((s) => typeof s === 'string')])];
  const key = `scan:${symbols.length > UNIVERSE.length ? symbols.join(',') : 'base'}`;
  return cached(key, 15 * 60000, async () => {
    const all = await pool(symbols, 10, (s) => analyzeSymbol(s, { signal }));
    const ok = all.filter((x) => x && !x.error);
    const light = ({ spark, ...x }) => ({ ...x, spark: spark.slice(-30) });
    const byScore = (a, b) => b.score - a.score || (b.history.winRate || 0) - (a.history.winRate || 0);
    return {
      asOf: new Date(hooks.now()).toISOString(), marketOpen: marketOpen(), checked: ok.length, failed: all.length - ok.length,
      now: ok.filter((x) => x.signal === 'kaufen').sort(byScore).slice(0, 10).map(light),
      soon: ok.filter((x) => x.signal === 'bald' || x.signal === 'ueberhitzt').sort(byScore).slice(0, 10).map(light),
      weak: ok.filter((x) => x.signal === 'meiden').sort((a, b) => a.score - b.score).slice(0, 5).map((x) => ({ symbol: x.symbol, name: x.name, score: x.score, price: x.price, change1m: x.change1m })),
    };
  });
}

/* ---------- Suche (Name oder Kürzel → Symbol) ---------- */
async function search(q, { signal } = {}) {
  const text = String(q || '').trim().slice(0, 60);
  if (!text) return [];
  const local = UNIVERSE.filter((u) => u.alias.test(text) || u.symbol.toLowerCase().startsWith(text.toLowerCase()) || u.name.toLowerCase().includes(text.toLowerCase()))
    .slice(0, 6).map((u) => ({ symbol: u.symbol, name: u.name, exchange: /\.DE$/.test(u.symbol) ? 'Xetra' : '', type: 'Aktie' }));
  let remote = [];
  try {
    const j = await cached(`q:${text.toLowerCase()}`, 60 * 60000, () => get(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(text)}&quotesCount=10&newsCount=0&lang=de-DE&region=DE`, { signal, timeoutMs: 6000 }));
    // Euro-Börsen zuerst (Xetra, Frankfurt, Stuttgart) – so stimmt der Kurs mit dem Planspiel überein
    const rank = (x) => ({ GER: 0, FRA: 1, STU: 2 }[x.exchange] ?? 5);
    remote = (j.quotes || []).filter((x) => x.symbol && ['EQUITY', 'ETF'].includes(x.quoteType))
      .sort((a, b) => rank(a) - rank(b))
      .map((x) => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, exchange: x.exchDisp || x.exchange || '', type: x.quoteType === 'ETF' ? 'ETF' : 'Aktie' }));
  } catch {}
  const seen = new Set();
  return [...local, ...remote].filter((x) => !seen.has(x.symbol) && seen.add(x.symbol)).slice(0, 10);
}

// Werte, nach denen in einem Text gefragt wird: bekannte Namen, Kürzel (SAP.DE, $NVDA) und „X-Aktie“/„Aktie von X“ (per Suche)
async function symbolsInText(text, { signal, max = 5 } = {}) {
  const t = String(text || '');
  const found = UNIVERSE.filter((u) => u.alias.test(t)).map((u) => u.symbol);
  // „Porsche SE“ soll nicht zusätzlich „Porsche AG“ bringen, „Siemens Energy“ nicht „Siemens“
  const drop = new Set();
  if (found.includes('PAH3.DE')) drop.add('P911.DE');
  if (found.includes('ENR.DE') || found.includes('SHL.DE')) { if (!/siemens(?!\s*(energy|healthineers))/i.test(t)) drop.add('SIE.DE'); }
  if (found.includes('DTG.DE') && !/daimler(?!\s*truck)/i.test(t)) drop.add('MBG.DE');
  const tick = [...t.matchAll(/(?:\$([A-Z]{1,5})\b|\b([A-Z0-9]{1,6}\.(?:DE|F|SG|AS|PA|MI|L|CO|SW|VI))\b)/g)].map((m) => m[1] || m[2]);
  const names = [...t.matchAll(/(?:\b([A-ZÄÖÜ][\w&.]{1,30})(?:-Aktie|\s+Aktie)|Aktien?\s+(?:von|der|des)\s+([A-ZÄÖÜ][\w&.]{1,30}))/g)].map((m) => m[1] || m[2])
    .filter((n) => !/^(die|der|das|eine?|welche|jede|diese|meine|deine|unsere)$/i.test(n));
  const out = [...found.filter((s) => !drop.has(s)), ...tick];
  for (const n of names) {
    if (out.length >= max) break;
    if (UNIVERSE.some((u) => u.alias.test(n))) continue;
    const r = await search(n, { signal }).catch(() => []);
    if (r[0]) out.push(r[0].symbol);
  }
  return [...new Set(out)].slice(0, max);
}

/* ---------- Schlagzeilen (Google News RSS, deutsch) ---------- */
async function news(query, { signal, max = 5 } = {}) {
  const xml = await cached(`n:${query}`, 20 * 60000, () => get(`https://news.google.com/rss/search?q=${encodeURIComponent(`${query} Aktie when:7d`)}&hl=de&gl=DE&ceid=DE:de`, { signal, timeoutMs: 6000, type: 'text' }));
  const dec = (s) => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, max).map(([, it]) => ({
    title: dec((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]),
    url: dec((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]),
    date: dec((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]),
    source: dec((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]),
  })).filter((n) => n.title);
}

/* ---------- Kontext für die KI ---------- */
const eur = (x) => (x == null ? '–' : `${x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const sgn = (x) => (x == null ? '–' : `${x > 0 ? '+' : ''}${String(x).replace('.', ',')} %`);
const SIGNAL_TEXT = { kaufen: 'KAUFEN (jetzt)', bald: 'BALD (beobachten)', ueberhitzt: 'ÜBERHITZT (Rücksetzer abwarten)', halten: 'NEUTRAL', meiden: 'MEIDEN',
  verkaufen: 'VERKAUFEN', teilgewinn: 'TEILGEWINN MITNEHMEN', nachkaufen: 'NACHKAUF MÖGLICH' };
function stockLine(x) {
  if (x.error) return `- ${x.symbol}: keine Kursdaten (${x.error})`;
  const h = x.history.cases ? `Trefferquote des Kaufsignals bei dieser Aktie (letzte 2 Jahre): ${x.history.winRate} % von ${x.history.cases} Fällen nach ${x.history.horizonDays} Handelstagen im Plus (Ø ${sgn(x.history.avgPct)})` : 'Trefferquote: zu wenige Fälle';
  return `- ${x.name} (${x.symbol}, ${x.exchange || x.currency}): ${eur(x.price)}${x.currency !== 'EUR' ? ` (= ${x.priceNative} ${x.currency})` : ''} · Tag ${sgn(x.change1d)} · Woche ${sgn(x.change1w)} · Monat ${sgn(x.change1m)} · 3 Monate ${sgn(x.change3m)} · 1 Jahr ${sgn(x.change1y)}
  Chart: Score ${x.score}/100 · RSI ${x.rsi} · 20/50/200-Tage-Linie ${eur(x.sma20)} / ${eur(x.sma50)} / ${eur(x.sma200)} · Jahreshoch ${eur(x.high52)} · typische Tagesschwankung (ATR) ${eur(x.atr)} (${de(x.atrPct)} %)
  SIGNAL: ${SIGNAL_TEXT[x.signal]} – ${x.reasons.join('; ')}${x.trigger ? ` · Stop-Buy ab ${eur(x.trigger)}` : ''}${x.entry ? ` · Einstieg um ${eur(x.entry)}` : ''} · Stopp ${eur(x.stop)} · Ziel ${eur(x.target)} (${sgn(x.targetPct)})
  ${h}${x.crossCheck ? ` · Gegenprüfung ${x.crossCheck.other}: ${x.crossCheck.price} ${x.currency} (Abweichung ${sgn(round(x.crossCheck.diffPct, 2))})` : ''} · Quellen: ${x.sources.join(', ')}${x.holding ? `
  EIGENE POSITION: ${x.holding.qty} Stück zu ${eur(x.holding.buyPrice)} · Wert ${eur(x.holding.value)} · ${sgn(x.holding.gainPct)} (nach Gebühren ${eur(x.holding.gainEur)})${x.holding.weightPct != null ? ` · ${String(x.holding.weightPct).replace('.', ',')} % vom Depot${x.holding.overWeight ? ' (über 20 % – kein Nachkauf möglich)' : ''}` : ''}
  POSITION: ${SIGNAL_TEXT[x.holding.signal]} – ${x.holding.reasons.join('; ')} · Stopp ${eur(x.holding.stop)}` : ''}`;
}
async function contextFor({ question = '', depot = null } = {}, { signal } = {}) {
  const positions = Array.isArray(depot?.positions) ? depot.positions : [];
  const watch = Array.isArray(depot?.watch) ? depot.watch : [];
  const asked = await symbolsInText(question, { signal }).catch(() => []);
  const wantsScan = /(welche|was soll|was kann|tipps?|empfehl|potenzial|potential|kaufen\?|investier|chancen|lohnt|top|beste|steig|einsteigen|reingehen)/i.test(question) || (!asked.length && !positions.length);
  const [mine, extra, sc, headlines] = await Promise.all([
    positions.length || watch.length ? check({ positions, watch: watch.filter((s) => !asked.includes(s)), cash: depot?.cash }, { signal }).catch(() => null) : null,
    asked.length ? pool(asked.filter((s) => !positions.some((p) => p.symbol === s)), 5, (s) => analyzeSymbol(s, { signal, cross: true })) : [],
    wantsScan ? scan({ signal }).catch(() => null) : null,
    asked.length ? pool(asked.slice(0, 2), 2, (s) => news(NAME_OF[s] || s, { signal, max: 4 }).then((n) => ({ symbol: s, n }))) : [],
  ]);
  const st = planspielStatus(hooks.now(), +depot?.buys || 0);
  const lines = [];
  lines.push(`LIVE-MARKTDATEN (abgerufen ${new Date(hooks.now()).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} Uhr, Kurse ca. 15 min verzögert, Börse ${marketOpen() ? 'geöffnet' : 'geschlossen'}):`);
  lines.push(`PLANSPIEL BÖRSE: ${st.running ? `läuft noch ${st.daysLeft} Tage (bis ${PLANSPIEL.end.split('-').reverse().join('.')})` : 'gerade nicht aktiv'} · Startkapital 50.000 € · Gebühr je Order 0,3 % (mind. 15 €) · max. 20 % je Wertpapier · mind. 3 abgerechnete Käufe bis 22.01.2027${depot?.buys != null ? ` (bisher ${st.buys}, ${st.buysMissing ? `es fehlen noch ${st.buysMissing}` : 'erfüllt'})` : ''} · keine Papiere unter 1 € · Order-Arten: Market, Limit, Stop-Loss, Stop-Buy (bis 14 Tage).`);
  if (depot) lines.push(`DEPOT DES NUTZERS: ${positions.length} Positionen${depot.cash != null ? ` · Bargeld ${eur(+depot.cash)}` : ''}${mine?.depotValue ? ` · Depotwert ${eur(mine.depotValue)}` : ''}`);
  if (mine?.holdings?.length) lines.push('EIGENE POSITIONEN:', ...mine.holdings.map(stockLine));
  if (extra.length) lines.push('GEFRAGTE WERTE:', ...extra.map((x, i) => (x.error ? stockLine({ symbol: asked[i], error: x.error }) : stockLine(x))));
  if (mine?.watch?.length) lines.push('BEOBACHTUNGSLISTE:', ...mine.watch.map(stockLine));
  if (sc) {
    lines.push(`MARKTSCAN (${sc.checked} große Werte aus DAX, MDAX, Nasdaq 100, Dow, EuroStoxx):`);
    lines.push(sc.now.length ? `POTENZIAL JETZT (Kaufsignal): ${sc.now.slice(0, 6).map((x) => `${x.name} ${eur(x.price)} Score ${x.score}${x.history.cases ? `, Treffer ${x.history.winRate} %/${x.history.cases}` : ''}, Stopp ${eur(x.stop)}, Ziel ${eur(x.target)}`).join(' | ')}` : 'POTENZIAL JETZT: gerade kein Wert mit klarem Kaufsignal.');
    if (sc.soon.length) lines.push(`POTENZIAL BALD: ${sc.soon.slice(0, 6).map((x) => `${x.name} ${eur(x.price)} – ${x.reasons[0]}`).join(' | ')}`);
    if (sc.weak.length) lines.push(`SCHWÄCHSTE CHARTS (meiden): ${sc.weak.map((x) => `${x.name} (Score ${x.score}, Monat ${sgn(x.change1m)})`).join(', ')}`);
  }
  const hl = headlines.filter((h) => !h.error && h.n?.length);
  if (hl.length) lines.push('SCHLAGZEILEN (Google News, letzte 7 Tage – unbestätigt, nur als Hinweis):', ...hl.flatMap((h) => h.n.map((n) => `- [${NAME_OF[h.symbol] || h.symbol}] ${n.title}${n.source ? ` (${n.source}` : ''}${n.date ? `, ${new Date(n.date).toLocaleDateString('de-DE')})` : n.source ? ')' : ''}`)));
  const ok = (l) => (l || []).filter((x) => x && !x.error).length;
  const count = ok(mine?.holdings) + ok(extra) + ok(mine?.watch) + (sc?.checked || 0);
  if (!count) lines.push('KURSE: gerade nicht erreichbar (Yahoo Finance und Stooq antworten nicht) – sag das offen und nenne keine Kurse aus dem Gedächtnis als aktuell.');
  return { text: lines.join('\n'), count, symbols: asked, failed: !count };
}

module.exports = { PLANSPIEL, UNIVERSE, fee, sma, ema, rsi, atr, indicators, scoreAt, buyNowAt, hitRate, analyze, positionSize, planspielStatus, marketOpen,
  series, check, scan, search, symbolsInText, news, contextFor, stockLine, hooks, cache };
