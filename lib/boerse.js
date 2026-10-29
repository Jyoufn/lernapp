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
const MIN_SELL_GAIN = 100; // nie unter +100 € verkaufen (Wunsch des Nutzers)
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
// Alle im Planspiel handelbaren Aktien (DAX, MDAX, SDAX, TecDAX, EuroStoxx 50, Dow, Nasdaq 100, FTSE MIB, ATX, LuxX, Global Challenges, Selection Europe)
const U = require('./universe');
const FULL = U.LIST;
const NAME_OF = { ...Object.fromEntries(FULL.map((u) => [u.symbol, u.name])), ...Object.fromEntries(UNIVERSE.map((u) => [u.symbol, u.name])) };
// Namen der übrigen Werte als Suchmuster (ab 4 Buchstaben, ganzes Wort; Zusätze wie „AG“, „(Google)“ weg)
const NAME_ALIAS = FULL.filter((u) => !UNIVERSE.some((c) => c.symbol === u.symbol)).map((u) => {
  const base = u.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\b(AG|SE|Inc|plc|Group|Holding|Co)\b\.?/gi, '').trim();
  return base.length >= 4 ? { symbol: u.symbol, alias: new RegExp(`(^|[^\\p{L}\\d])(${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^\\p{L}\\d])`, 'iu') } : null;
}).filter(Boolean);
// ISIN je Wert – damit holen wir den Kurs in Echtzeit (Tradegate, ING); unbekannte Werte laufen über Yahoo
const ISIN = {
  'ADS.DE': 'DE000A1EWWW0', 'AIR.DE': 'NL0000235190', 'ALV.DE': 'DE0008404005', 'BAS.DE': 'DE000BASF111', 'BAYN.DE': 'DE000BAY0017', 'BEI.DE': 'DE0005200000',
  'BMW.DE': 'DE0005190003', 'BNR.DE': 'DE000A1DAHH0', 'CBK.DE': 'DE000CBK1001', 'CON.DE': 'DE0005439004', 'DTG.DE': 'DE000DTR0CK8', 'DBK.DE': 'DE0005140008',
  'DB1.DE': 'DE0005810055', 'DHL.DE': 'DE0005552004', 'DTE.DE': 'DE0005557508', 'EOAN.DE': 'DE000ENAG999', 'FRE.DE': 'DE0005785604', 'G1A.DE': 'DE0006602006',
  'HNR1.DE': 'DE0008402215', 'HEI.DE': 'DE0006047004', 'HEN3.DE': 'DE0006048432', 'IFX.DE': 'DE0006231004', 'MBG.DE': 'DE0007100000', 'MRK.DE': 'DE0006599905',
  'MTX.DE': 'DE000A0D9PT0', 'MUV2.DE': 'DE0008430026', 'P911.DE': 'DE000PAG9113', 'PAH3.DE': 'DE000PAH0038', 'RHM.DE': 'DE0007030009', 'RWE.DE': 'DE0007037129',
  'SAP.DE': 'DE0007164600', 'SRT3.DE': 'DE0007165631', 'SIE.DE': 'DE0007236101', 'ENR.DE': 'DE000ENER6Y0', 'SHL.DE': 'DE000SHL1006', 'SY1.DE': 'DE000SYM9999',
  'VOW3.DE': 'DE0007664039', 'VNA.DE': 'DE000A1ML7J1', 'ZAL.DE': 'DE000ZAL1111', 'G24.DE': 'DE000A12DM80', 'HAG.DE': 'DE000HAG0005', 'R3NK.DE': 'DE000RENK730',
  'LHA.DE': 'DE0008232125', 'TUI1.DE': 'DE000TUAG505',
  AAPL: 'US0378331005', MSFT: 'US5949181045', NVDA: 'US67066G1040', AMZN: 'US0231351067', GOOGL: 'US02079K3059', META: 'US30303M1027', TSLA: 'US88160R1014',
  AMD: 'US0079031078', NFLX: 'US64110L1061', AVGO: 'US11135F1012', PLTR: 'US69608A1088', COST: 'US22160K1051', KO: 'US1912161007', DIS: 'US2546871060',
  JPM: 'US46625H1005', V: 'US92826C8394', 'ASML.AS': 'NL0010273215', 'MC.PA': 'FR0000121014', 'SU.PA': 'FR0000121972', 'NOVO-B.CO': 'DK0062498333',
};

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
  const q = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${opts.range || '2y'}&interval=${opts.interval || '1d'}&includePrePost=false&events=div%2Csplit`;
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
  if (Number.isFinite(m.regularMarketPrice) && bars.length && (opts.interval || '1d') === '1d') {
    const last = bars[bars.length - 1], live = m.regularMarketPrice, lt = (m.regularMarketTime || 0) * 1000;
    if (lt && new Date(lt).toDateString() !== new Date(last.t).toDateString() && lt > last.t) bars.push({ t: lt, o: live, h: live, l: live, c: live, v: 0 });
    else { last.c = live; last.h = Math.max(last.h, live); last.l = Math.min(last.l, live); }
  }
  return { symbol, name: NAME_OF[symbol] || m.shortName || m.longName || symbol, currency: m.currency || 'EUR', exchange: m.fullExchangeName || m.exchangeName || '',
    time: (m.regularMarketTime || 0) * 1000 || bars[bars.length - 1]?.t, bars, source: 'Yahoo Finance',
    prevClose: Number.isFinite(m.chartPreviousClose) ? m.chartPreviousClose : Number.isFinite(m.previousClose) ? m.previousClose : null };
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
  return cached(`s:${symbol}:${cross ? 1 : 0}`, cross ? 5 * 60000 : 15 * 60000, async () => { // gefragte Werte 5 min, Scan 15 min (aktueller Kurs kommt in Echtzeit dazu)
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

/* ---------- Kurs in Echtzeit (sekundengenau) ----------
   Tradegate (Börse, Echtzeit, Euro) und ING (Echtzeit-Kurs des Handelsplatzes) über die ISIN – nur 3 s zwischengespeichert.
   Yahoo liefert nur den Verlauf (für Linien und Signale); der letzte Kurs wird durch den Echtzeitkurs ersetzt. */
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!t) return null;
  const x = t.includes(',') ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t);
  return Number.isFinite(x) ? x : null;
};
async function tradegateQuote(isin, opts) {
  let j;
  try { j = await get(`https://www.tradegate.de/refresh.php?isin=${isin}`, { ...opts, timeoutMs: 5000 }); }
  catch { j = await get(`https://www.tradegatebsx.com/refresh.php?isin=${isin}`, { ...opts, timeoutMs: 5000 }); }
  const bid = num(j?.bid), ask = num(j?.ask), last = num(j?.last);
  const price = last || (bid && ask ? (bid + ask) / 2 : bid || ask);
  if (!price) throw new Error('kein Kurs');
  const delta = num(j?.delta);
  return { price, bid, ask, high: num(j?.high), low: num(j?.low), avg: num(j?.avg), volume: num(j?.stueck), changePct: delta,
    prevClose: delta != null ? price / (1 + delta / 100) : null, time: hooks.now(), source: 'Tradegate (Echtzeit)' };
}
async function ingQuote(isin, opts) {
  const j = await get(`https://component-api.wertpapiere.ing.de/api/v1/components/instrumentheader/${isin}`, { ...opts, timeoutMs: 5000 });
  const cur = String(j?.currency || j?.currencyIsoCode || 'EUR').toUpperCase();
  const price = num(j?.price);
  if (!price || cur !== 'EUR') throw new Error('kein Euro-Kurs');
  const t = Date.parse(j?.priceChangeDate || '') || hooks.now();
  return { price, bid: num(j?.bid), ask: num(j?.ask), changePct: num(j?.changePercent), time: t, source: `ING${j?.exchangeName ? ` (${j.exchangeName})` : ''}` };
}
async function liveQuote(symbol, { signal } = {}) {
  const isin = ISIN[symbol];
  if (!isin) return null;
  return cached(`live:${isin}`, 3000, async () => {
    const [tg, ing] = await Promise.allSettled([tradegateQuote(isin, { signal }), ingQuote(isin, { signal })]);
    const a = tg.status === 'fulfilled' ? tg.value : null, b = ing.status === 'fulfilled' ? ing.value : null;
    const main = a || b;
    if (!main) return null;
    return { ...main, isin, sources: [a?.source, b?.source].filter(Boolean), other: a && b ? { source: b.source, price: b.price } : null };
  });
}
// Echtzeitkurs in den Verlauf einsetzen (heutige Kerze aktualisieren bzw. anhängen). Weicht er stark vom Verlauf ab
// (falsche ISIN, Kapitalmaßnahme), wird er nicht genommen.
function withLive(data, live, fx) {
  if (!live?.price || !data.bars.length) return data;
  const native = live.price / fx;
  const last = data.bars[data.bars.length - 1];
  if (Math.abs(native / last.c - 1) > 0.15) return data;
  const bars = data.bars.slice();
  const today = new Date(live.time).toDateString() === new Date(last.t).toDateString();
  if (today) bars[bars.length - 1] = { ...last, c: native, h: Math.max(last.h, native), l: Math.min(last.l, native) };
  else bars.push({ t: live.time, o: live.prevClose ? live.prevClose / fx : native, h: Math.max(native, (live.high || 0) / fx), l: live.low ? live.low / fx : native, c: native, v: live.volume || 0 });
  return { ...data, bars, time: live.time, live, sources: [...live.sources, `${data.sources?.[0] || data.source} (Verlauf)`] };
}

/* ---------- Aktienchart (Block ```stock im Chat) ----------
   Zeiträume wie in Börsen-Apps; alles in Euro; letzter Punkt = Echtzeitkurs. 20/50-Tage-Linie ab 1 Monat. */
const RANGES = {
  '1T': { range: '1d', interval: '5m', ttl: 15000 }, '1W': { range: '5d', interval: '15m', ttl: 30000 }, '1M': { range: '1mo', interval: '1d', ttl: 60000, sma: true },
  '6M': { range: '6mo', interval: '1d', ttl: 300000, sma: true }, '1J': { range: '1y', interval: '1d', ttl: 300000, sma: true }, '5J': { range: '5y', interval: '1wk', ttl: 3600000 },
};
async function chartData(symbol, rangeKey = '6M', { signal } = {}) {
  const R = RANGES[rangeKey] || RANGES['6M'];
  const sym = String(symbol || '').trim().slice(0, 20);
  if (!/^[\w.^=-]{1,20}$/.test(sym)) throw new Error('Ungültiges Kürzel');
  const [data, lq] = await Promise.all([
    cached(`c:${sym}:${rangeKey}`, R.ttl, () => yahooSeries(sym, { signal, range: R.range, interval: R.interval })),
    liveQuote(sym, { signal }).catch(() => null),
  ]);
  const fx = await fxToEur(data.currency, { signal });
  let bars = data.bars.map((b) => ({ t: b.t, o: round(b.o * fx, 4), h: round(b.h * fx, 4), l: round(b.l * fx, 4), c: round(b.c * fx, 4), v: b.v || 0 }));
  // 20/50-Tage-Linie: aus dem längeren Tagesverlauf rechnen, damit sie schon am linken Rand stimmt
  let sma20 = null, sma50 = null;
  if (R.sma) {
    const long = await series(sym, { signal }).catch(() => null);
    if (long) {
      const c = long.bars.map((b) => b.c), s20 = sma(c, 20), s50 = sma(c, 50), day = (t) => new Date(t).toISOString().slice(0, 10);
      const map = new Map(long.bars.map((b, i) => [day(b.t), [s20[i], s50[i]]]));
      sma20 = bars.map((b) => { const v = map.get(day(b.t))?.[0]; return v == null ? null : round(v * fx, 4); });
      sma50 = bars.map((b) => { const v = map.get(day(b.t))?.[1]; return v == null ? null : round(v * fx, 4); });
    }
  }
  let price = bars[bars.length - 1]?.c ?? null, time = data.time, realtime = false;
  if (lq?.price && price && Math.abs(lq.price / price - 1) < 0.15) {
    price = lq.price; time = lq.time; realtime = true;
    const last = bars[bars.length - 1];
    bars[bars.length - 1] = { ...last, c: price, h: Math.max(last.h, price), l: Math.min(last.l, price) };
  }
  const prev = rangeKey === '1T' ? (lq?.prevClose || (data.prevClose != null ? data.prevClose * fx : null)) : bars[0]?.o;
  return { symbol: sym, name: data.name, currency: 'EUR', native: data.currency, range: rangeKey, interval: R.interval, bars, sma20, sma50,
    price: round(price, 4), prevClose: round(prev, 4), change: prev ? round(price - prev, 4) : null, changePct: prev ? pct(price / prev - 1) : null,
    time, realtime, bid: lq?.bid ?? null, ask: lq?.ask ?? null, source: realtime ? `${lq.sources.join(', ')} · Verlauf Yahoo Finance` : 'Yahoo Finance' };
}
// nur der aktuelle Kurs (für das sekündliche Nachladen im Chart)
async function quoteNow(symbol, { signal } = {}) {
  const sym = String(symbol || '').trim();
  const lq = await liveQuote(sym, { signal }).catch(() => null);
  if (lq) return { symbol: sym, price: lq.price, bid: lq.bid, ask: lq.ask, prevClose: lq.prevClose, changePct: lq.changePct, time: lq.time, realtime: true, source: lq.sources.join(', ') };
  const d = await yahooSeries(sym, { signal, range: '1d', interval: '1m' });
  const fx = await fxToEur(d.currency, { signal });
  const last = d.bars[d.bars.length - 1];
  return { symbol: sym, price: round(last.c * fx, 4), prevClose: d.prevClose ? round(d.prevClose * fx, 4) : null, time: d.time, realtime: false, source: 'Yahoo Finance' };
}

/* ---------- Zeitebenen: Tag, Woche, Monat zusammen ----------
   Ein Tagesanstieg allein sagt wenig: steigt auch die Woche und der Monat, hat der Wert oft noch Luft nach oben; fällt ein Wert heute
   in einem klaren Monats-Aufwärtstrend, ist das oft ein Rücksetzer (Kaufchance). Deshalb wird jede Ebene einzeln bewertet und dann verglichen. */
function frameStats(closes, { base = null } = {}) {
  const v = closes.filter((x) => Number.isFinite(x));
  if (v.length < 4) return null;
  const first = base || v[0], last = v[v.length - 1];
  const n = v.length, mx = (n - 1) / 2, my = v.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  v.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
  const slopePct = den ? ((num / den) * (n - 1) / my) * 100 : 0; // Anstieg der Ausgleichsgeraden über den ganzen Zeitraum in %
  const third = Math.max(1, Math.floor(n / 3));
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const lo1 = Math.min(...v.slice(0, Math.ceil(n / 2))), lo2 = Math.min(...v.slice(Math.floor(n / 2)));
  const hi1 = Math.max(...v.slice(0, Math.ceil(n / 2))), hi2 = Math.max(...v.slice(Math.floor(n / 2)));
  const lo = Math.min(...v), hi = Math.max(...v);
  const changePct = (last / first - 1) * 100;
  const upish = changePct > 0.4 && slopePct > 0 && avg(v.slice(-third)) > avg(v.slice(0, third));
  const downish = changePct < -0.4 && slopePct < 0 && avg(v.slice(-third)) < avg(v.slice(0, third));
  return {
    changePct: round(changePct, 2), slopePct: round(slopePct, 2), trend: upish ? 'auf' : downish ? 'ab' : 'seit',
    higherLows: lo2 > lo1, higherHighs: hi2 > hi1, posInRange: hi > lo ? round(((last - lo) / (hi - lo)) * 100, 0) : 50,
    high: hi, low: lo,
  };
}
async function timeframes(symbol, data, { signal, live } = {}) {
  const [d1, w1] = await Promise.all([
    cached(`tf:${symbol}:1d`, 30000, () => yahooSeries(symbol, { signal, range: '1d', interval: '5m' })).catch(() => null),
    cached(`tf:${symbol}:5d`, 60000, () => yahooSeries(symbol, { signal, range: '5d', interval: '30m' })).catch(() => null),
  ]);
  const withNow = (arr) => (live?.price && data?.currency === 'EUR' ? [...arr, live.price] : arr); // Echtzeitkurs als letzter Punkt (Euro-Werte)
  const day = d1 ? frameStats(withNow(d1.bars.map((b) => b.c)), { base: d1.prevClose || null }) : null;
  const week = w1 ? frameStats(withNow(w1.bars.map((b) => b.c))) : null;
  const month = data?.bars?.length > 22 ? frameStats(data.bars.slice(-22).map((b) => b.c)) : null;
  const quarter = data?.bars?.length > 63 ? frameStats(data.bars.slice(-63).map((b) => b.c)) : null;
  const t = [day?.trend, week?.trend, month?.trend];
  const ups = t.filter((x) => x === 'auf').length, downs = t.filter((x) => x === 'ab').length;
  let verdict;
  if (ups === 3) verdict = 'Tag, Woche und Monat steigen – der Trend ist auf allen Ebenen intakt, eher Luft nach oben';
  else if (month?.trend === 'auf' && week?.trend === 'auf' && day?.trend !== 'auf') verdict = 'Woche und Monat steigen, heute ein Rücksetzer – im Aufwärtstrend oft eine Kaufgelegenheit';
  else if (month?.trend === 'auf' && week?.trend !== 'auf') verdict = 'Monatstrend aufwärts, aber die Woche schwächelt – abwarten, bis die Woche wieder dreht (Stop-Buy über dem Wochenhoch)';
  else if (day?.trend === 'auf' && month?.trend === 'ab') verdict = 'Nur ein Tagesanstieg im fallenden Monat – eher eine Gegenbewegung, Vorsicht';
  else if (downs === 3) verdict = 'Tag, Woche und Monat fallen – kein Einstieg, eher raus';
  else if (week?.trend === 'auf' && month?.trend === 'seit') verdict = 'Die Woche dreht nach oben aus einer Seitwärtsphase – möglicher Ausbruch, beobachten';
  else verdict = 'Die Zeitebenen sind sich uneinig – kein klares Bild, kleiner oder gar nicht einsteigen';
  return { day, week, month, quarter, agree: ups - downs, verdict };
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
function analyze(data, { holding = null, fx = 1, depotValue = null, bench = null } = {}) {
  const bars = data.bars;
  if (bars.length < 30) throw new Error('zu wenig Kursdaten');
  const ind = indicators(bars);
  const fxr = (x) => (x == null ? null : round(x * fx));
  const i = bars.length - 1;
  const c = ind.c[i], a = ind.atr[i] || c * 0.02;
  const sc = scoreAt(ind, i) || { score: 50, parts: [] };
  // relative Stärke zum Index (3 Monate) und Umsatz der letzten Tage im Vergleich
  const r63 = ret(ind.c, i, 63);
  const rel = bench && r63 != null && bench.r63 != null ? r63 - bench.r63 : null;
  const vols = bars.map((b) => b.v || 0);
  const avgV = (n) => { const v = vols.slice(-n - 1, -1).filter((x) => x > 0); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0; };
  const volRatio = avgV(50) ? avgV(5) / avgV(50) : null;
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
    reasons.push(`${why.charAt(0).toUpperCase()}${why.slice(1)}${rel != null && rel > 0.05 ? `, stärker als der ${bench.name}` : ''} – Einstieg jetzt möglich`);
    if (bench && !bench.aboveSma200) reasons.push(`Achtung: der ${bench.name} selbst ist im Abwärtstrend – kleinere Position`);
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
    score: Math.max(0, Math.min(100, sc.score + (rel == null ? 0 : rel > 0.05 ? 5 : rel < -0.1 ? -5 : 0))), signal, setup, reasons,
    relStrength: pct(rel), benchName: bench?.name || null, volRatio: round(volRatio, 2), support: fxr(ind.lo20[i]),
    realtime: !!data.live, bid: data.live?.bid ?? null, ask: data.live?.ask ?? null, dayHigh: data.live?.high ?? null, dayLow: data.live?.low ?? null,
    otherQuote: data.live?.other || null,
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
    // Regel des Nutzers: nie mit Verlust verkaufen – Verkaufen nur ab +100 € Gewinn nach Gebühren, Teilgewinn nur, wenn die Hälfte ≥ 100 € bringt
    const netGain = value - holding.buyPrice * (holding.qty || 0) - buyFee - sellFee;
    if (hs === 'verkaufen' && netGain < MIN_SELL_GAIN) {
      hs = 'beobachten';
      hReasons.splice(0, hReasons.length, `${netGain < 0 ? `Im Minus (${de(round(netGain))} € nach Gebühren)` : `Erst ${de(round(netGain))} € Gewinn nach Gebühren`} – nicht verkaufen, unter +${MIN_SELL_GAIN} € wird nicht verkauft. ${hReasons[0].replace(/ –.*$/, '')}: genau beobachten, auf Erholung warten`);
    } else if (hs === 'teilgewinn' && netGain < 2 * MIN_SELL_GAIN) {
      hs = 'halten';
      hReasons.splice(0, hReasons.length, `Läuft gut, aber erst ${de(round(netGain))} € Gewinn – halten, Teilgewinn erst ab +${2 * MIN_SELL_GAIN} €`);
    }
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
// Vergleichsindex: deutsche/europäische Werte → DAX, US-Werte → Nasdaq 100
const benchOf = (symbol) => (/\.DE$/i.test(symbol) ? '^GDAXI' : /\.[A-Z]{1,3}$/i.test(symbol) ? '^STOXX50E' : '^NDX'); // deutsche Werte → DAX, übriges Europa → EuroStoxx 50, USA → Nasdaq 100
async function benchmark(sym, { signal } = {}) {
  return cached(`bench:${sym}`, 10 * 60000, async () => {
    const d = await series(sym, { signal });
    const ind = indicators(d.bars), i = d.bars.length - 1, c = ind.c[i];
    return { symbol: sym, name: { '^GDAXI': 'DAX', '^STOXX50E': 'EuroStoxx 50' }[sym] || 'Nasdaq 100', price: round(c), r21: ret(ind.c, i, 21), r63: ret(ind.c, i, 63), change1d: pct(ret(ind.c, i, 1)),
      aboveSma50: ind.sma50[i] != null && c > ind.sma50[i], aboveSma200: ind.sma200[i] != null && c > ind.sma200[i], rsi: round(ind.rsi[i], 0) };
  });
}
async function analyzeSymbol(symbol, { signal, holding, depotValue, cross = false, live = true, frames = false } = {}) {
  const [data, lq, bench] = await Promise.all([
    series(symbol, { signal, cross }),
    live ? liveQuote(symbol, { signal }).catch(() => null) : null,
    benchmark(benchOf(symbol), { signal }).catch(() => null),
  ]);
  const fx = await fxToEur(data.currency, { signal }).catch(() => null);
  if (fx == null) throw new Error(`Wechselkurs ${data.currency} → EUR nicht verfügbar`);
  const out = analyze(withLive(data, lq, fx), { holding, fx, depotValue, bench });
  if (frames) {
    out.frames = await timeframes(symbol, data, { signal, live: lq }).catch(() => null);
    // passt das Bild über alle Zeitebenen nicht zum Signal, steht es dabei
    if (out.frames && out.signal === 'kaufen' && out.frames.agree < 0) out.reasons.push('Aber: Woche/Monat sprechen dagegen – kleiner einsteigen oder abwarten');
    if (out.frames && out.signal === 'halten' && out.frames.agree === 3) out.reasons.push('Tag, Woche und Monat steigen gemeinsam – Kandidat für einen Einstieg beim nächsten Rücksetzer');
  }
  return out;
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
  const symbols = [...new Set([...FULL.map((u) => u.symbol), ...UNIVERSE.map((u) => u.symbol), ...extra.filter((s) => typeof s === 'string')])];
  const key = `scan:${extra.length ? symbols.join(',') : 'base'}`;
  return cached(key, 3 * 60000, async () => { // kurz zwischengespeichert – Kurse kommen in Echtzeit
    const all = await pool(symbols, 10, (s) => analyzeSymbol(s, { signal }));
    const ok = all.filter((x) => x && !x.error);
    const light = ({ spark, ...x }) => ({ ...x, spark: spark.slice(-30) });
    // Rangfolge: Score, dazu Trefferquote und relative Stärke
    const rank = (x) => x.score + (x.history.cases >= 5 ? (x.history.winRate - 50) / 5 : 0) + (x.relStrength || 0) / 4;
    const byScore = (a, b) => rank(b) - rank(a);
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
  const found = [...UNIVERSE.filter((u) => u.alias.test(t)).map((u) => u.symbol), ...NAME_ALIAS.filter((u) => u.alias.test(t)).map((u) => u.symbol)];
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
    if (UNIVERSE.some((u) => u.alias.test(n)) || NAME_ALIAS.some((u) => u.alias.test(n))) continue;
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
const clock = (t) => new Date(t).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const SIGNAL_TEXT = { kaufen: 'KAUFEN (jetzt)', bald: 'BALD (beobachten)', ueberhitzt: 'ÜBERHITZT (Rücksetzer abwarten)', halten: 'NEUTRAL', meiden: 'MEIDEN',
  verkaufen: 'VERKAUFEN', teilgewinn: 'TEILGEWINN MITNEHMEN', nachkaufen: 'NACHKAUF MÖGLICH', beobachten: 'BEOBACHTEN (nicht verkaufen – unter +100 € Gewinn)' };
// fertiger Order-Vorschlag fürs Planspiel: Einstieg, Stückzahl (1,5 % Risiko, max. 20 %), Gebühr, Chance:Risiko
function orderPlan(x, depotValue = PLANSPIEL.capital, cash = depotValue) {
  const entry = x.trigger || x.entry || x.price;
  if (!entry || !x.stop || x.stop >= entry) return null;
  const size = positionSize({ price: entry, stop: x.stop, depotValue, cash });
  const crv = (x.target - entry) / (entry - x.stop);
  const type = x.trigger ? `Stop-Buy ${eur(x.trigger)}` : x.signal === 'ueberhitzt' ? `Limit ${eur(x.entry)}` : `Limit ${eur(round(x.ask || entry * 1.002))} (knapp über Brief)`;
  return { type, qty: size.qty, volume: size.volume, fee: size.fee, crv: round(crv, 1), stop: x.stop, target: x.target };
}
const TREND_TEXT = { auf: 'aufwärts', ab: 'abwärts', seit: 'seitwärts' };
const frameText = (label, f) => (f ? `${label} ${TREND_TEXT[f.trend]} (${sgn(round(f.changePct, 1))}, ${f.higherLows ? 'steigende' : 'fallende'} Tiefs, Kurs bei ${f.posInRange} % der Spanne)` : `${label} –`);
function stockLine(x, { depotValue, cash, plan = false } = {}) {
  if (x.error) return `- ${x.symbol}: keine Kursdaten (${x.error})`;
  const h = x.history.cases ? `Trefferquote des Kaufsignals bei dieser Aktie (letzte 2 Jahre): ${x.history.winRate} % von ${x.history.cases} Fällen nach ${x.history.horizonDays} Handelstagen im Plus (Ø ${sgn(x.history.avgPct)})` : 'Trefferquote: zu wenige Fälle';
  const quote = x.realtime
    ? `${eur(x.price)} um ${clock(x.time)} Uhr (Echtzeit${x.bid && x.ask ? `, Geld ${eur(x.bid)} / Brief ${eur(x.ask)}` : ''}${x.dayLow && x.dayHigh ? `, Tagesspanne ${eur(x.dayLow)}–${eur(x.dayHigh)}` : ''})`
    : `${eur(x.price)} (Stand ${clock(x.time)} Uhr, ggf. verzögert)`;
  const p = plan && ['kaufen', 'bald', 'ueberhitzt'].includes(x.signal) ? orderPlan(x, depotValue, cash) : null;
  return `- ${x.name} (${x.symbol}): ${quote}${x.currency !== 'EUR' ? ` (= ${x.priceNative} ${x.currency})` : ''} · Tag ${sgn(x.change1d)} · Woche ${sgn(x.change1w)} · Monat ${sgn(x.change1m)} · 3 Monate ${sgn(x.change3m)} · 1 Jahr ${sgn(x.change1y)}
  Chart: Score ${x.score}/100 · RSI ${x.rsi} · 20/50/200-Tage-Linie ${eur(x.sma20)} / ${eur(x.sma50)} / ${eur(x.sma200)} · Jahreshoch ${eur(x.high52)} · Unterstützung (20-Tage-Tief) ${eur(x.support)} · Tagesschwankung (ATR) ${eur(x.atr)} (${de(x.atrPct)} %)${x.relStrength != null ? ` · 3 Monate ggü. ${x.benchName}: ${sgn(x.relStrength)}` : ''}${x.volRatio ? ` · Umsatz zuletzt ${de(x.volRatio)}× normal` : ''}
  ${x.frames ? `ZEITEBENEN: ${frameText('Tag', x.frames.day)} | ${frameText('Woche', x.frames.week)} | ${frameText('Monat', x.frames.month)} | ${frameText('3 Monate', x.frames.quarter)}
  → ${x.frames.verdict}
  ` : ''}SIGNAL: ${SIGNAL_TEXT[x.signal]} – ${x.reasons.join('; ')}${x.trigger ? ` · Stop-Buy ab ${eur(x.trigger)}` : ''}${x.entry ? ` · Einstieg um ${eur(x.entry)}` : ''} · Stopp ${eur(x.stop)} · Ziel ${eur(x.target)} (${sgn(x.targetPct)})
  ${h}${p ? `
  ORDER-VORSCHLAG: ${p.type} · ${p.qty} Stück (≈ ${eur(p.volume)}, Gebühr ${eur(p.fee)}) · Stop-Loss ${eur(p.stop)} · Ziel ${eur(p.target)} · Chance:Risiko ${de(p.crv)} : 1` : ''}
  Quellen: ${(x.sources || []).join(', ')}${x.otherQuote ? ` (Gegenprüfung ${x.otherQuote.source}: ${eur(x.otherQuote.price)})` : x.crossCheck ? ` (Gegenprüfung ${x.crossCheck.other}: ${x.crossCheck.price} ${x.currency})` : ''}${x.holding ? `
  EIGENE POSITION: ${x.holding.qty} Stück zu ${eur(x.holding.buyPrice)} · Wert ${eur(x.holding.value)} · ${sgn(x.holding.gainPct)} (nach Gebühren ${eur(x.holding.gainEur)})${x.holding.weightPct != null ? ` · ${String(x.holding.weightPct).replace('.', ',')} % vom Depot${x.holding.overWeight ? ' (über 20 % – kein Nachkauf möglich)' : ''}` : ''}
  POSITION: ${SIGNAL_TEXT[x.holding.signal]} – ${x.holding.reasons.join('; ')} · Stopp ${eur(x.holding.stop)}` : ''}`;
}
const benchLine = (b) => `${b.name} ${b.price?.toLocaleString('de-DE')} Punkte (Tag ${sgn(b.change1d)}, Monat ${sgn(pct(b.r21))}, 3 Monate ${sgn(pct(b.r63))}) – ${b.aboveSma200 ? (b.aboveSma50 ? 'Aufwärtstrend' : 'Aufwärtstrend, kurzfristig schwach') : b.aboveSma50 ? 'erholt sich, langfristig noch schwach' : 'Abwärtstrend'}, RSI ${b.rsi}`;

// Worum geht es in der Frage? Danach richtet sich, wie viel gerechnet wird:
//   ideas  – „welche Aktien …“, Empfehlungen, Chancen, „was soll ich kaufen“ → Marktscan über alle ~430 Planspiel-Werte + Chancen-Radar
//   depot  – „mein Depot“, „meine Aktien“, „wie stehe ich“ → nur die eigenen Positionen
//   stocks – bestimmte Aktie(n) genannt → nur diese (+ eigene Position dazu)
//   market – allgemeine Marktfrage („wie läuft der DAX?“) → Indizes und gespeicherte Stimmung, kein Scan
const WANTS_IDEAS = /(welche|was f(ü|ue)r)\s+(\w+\s+){0,3}(aktien?|werte?|titel|papiere?)|was\s+(soll|kann|sollte|könnte)\s+ich\s+(jetzt\s+|heute\s+)?(kaufen|investieren)|wo(rin)?\s+(soll|kann|sollte)\s+ich\s+(\w+\s+){0,2}investieren|empfehl|empfohlen|chancen?\b|potenzial|ideen?\b|tipps?\b|vorschl(a|ä)g|beste[nrs]?\s+(\w+\s+){0,2}(aktien?|werte?|kauf)|alle\s+(aktien|werte)|markt-?scan|\bscan\b|radar|top[- ]?(aktien|werte|\d)|kaufkandidat|lohnt\s+sich\s+gerade|alternative/i;
const WANTS_DEPOT = /depot|portfolio|meine[nmrs]?\s+(käufe|kaeufe|investitionen|investments)|was\s+ich\s+(gekauft|investiert)\s+habe|(übersicht|überblick).{0,30}(meine|investiert|gekauft)|meine[nmrs]?\s+(aktien|positionen|werte|anlagen?|papiere|investments?|trades?|käufe)|mein(em)?\s+(geld|stand|gewinn|verlust)|bargeld|wie\s+(steh|lauf|lieg)(e|t|en)\s+(ich|meine|mein)|meine\s+performance|was\s+habe\s+ich\s+(gekauft|im)|verkaufen\s+soll\s+ich|was\s+soll\s+ich\s+verkaufen/i;
// breiter: Frage-/Bewertungswort + Anlage-Verb oder „Aktie“ („In was kann ich am besten investieren?“, „Gibt es gute Aktien gerade?“, „Wo Geld anlegen?“)
const ASKS_WHAT = /\b(was|wo|worin|wohin|in\s+was|welche[nmrs]?|gute[nr]?|beste[nmrs]?|am\s+besten|lohn(t|en)|sinnvoll|empfehl\w*|tipps?|ideen?|gibt\s+es|sollte\s+ich|kann\s+ich)\b/i;
const INVEST_WORD = /(investier|anlegen|anlage|geld\s+(rein)?stecken|kaufen|einsteigen|aktien?\b|werte?\b|titel\b|chancen?)/i;
function intentOf(question, asked) {
  const q = String(question || '');
  const ownDepot = /depot|portfolio|meine[nmrs]?\s+(aktien|positionen|werte|papiere)/i.test(q) && !/(investier|anlegen|kaufen|nachkaufen|einsteigen)/i.test(q);
  const explain = /^\s*(was|wie)\s+(ist|sind|funktionier\w*|bedeute\w*|hei(ß|ss)\w*|macht\s+man)\b|erkl(ä|ae)r|unterschied/i.test(q) && !/(gute|beste|lohn|kaufen|investier|empfehl|anlegen|chance|gerade|aktuell|heute|jetzt)/i.test(q); // Wissensfrage, keine Empfehlung
  // mehrere Wünsche in einer Frage („Depotübersicht und sag mir, wo ich investieren soll“): Teile getrennt prüfen
  const parts = q.split(/\b(?:und|sowie|außerdem|ausserdem|dazu|plus)\b|[;.!?]/i).map((x) => x.trim()).filter(Boolean);
  const PAST = /(investiert|gekauft)\s+(habe|hab|hatte)|\bhabe\s+.{0,50}(investiert|gekauft)\b/i; // „wo ich investiert habe“ = eigenes Depot, keine Ideen
  const broadIn = (t) => !asked.length && !explain && !PAST.test(t) && ASKS_WHAT.test(t) && INVEST_WORD.test(t)
    && !(/depot|portfolio|meine[nmrs]?\s+(aktien|positionen|werte|papiere)/i.test(t) && !/(investier|anlegen|kaufen|einsteigen)/i.test(t));
  const broad = !ownDepot && broadIn(q) || (parts.length > 1 && parts.some((t) => broadIn(t) && !WANTS_DEPOT.test(t)));
  const ideas = (WANTS_IDEAS.test(q) || broad) && (!asked.length || /(andere|weitere|alternative|ähnliche|statt|besser)/i.test(q));
  const depot = (WANTS_DEPOT.test(q) || (PAST.test(q) && /(übersicht|überblick|wie\s+(steh|läuft|laufen)|was\s+soll\s+ich|verkaufen|behalten)/i.test(q))) && (!ideas || parts.some((t) => (WANTS_DEPOT.test(t) || PAST.test(t)) && !broadIn(t)) || /depot|portfolio/i.test(q));
  return { ideas, depot, mode: ideas && depot ? 'both' : ideas ? 'ideas' : depot ? 'depot' : asked.length ? 'stocks' : 'market' };
}

// Alles, was der Börsen-Agent vor der Antwort braucht. focus = Werte, zu denen zusätzlich Nachrichten/Websites gelesen werden
// Gerechnet wird nur, wonach gefragt ist (siehe intentOf) – der Marktscan über alle Werte läuft NUR bei der Frage nach Ideen/Empfehlungen.
async function contextFor({ question = '', depot = null, store = null, holdings = null } = {}, { signal } = {}) {
  const asked = await symbolsInText(question, { signal }).catch(() => []);
  // „Meine Käufe“ (im Chat notiert) sind das Depot des Nutzers – kein Zugriff aufs Planspiel
  const H = require('./holdings');
  const own = Array.isArray(holdings) ? H.merged(holdings) : [];
  if (!depot && own.length) depot = { positions: own.map((p) => ({ symbol: p.symbol, qty: p.qty, buyPrice: p.price, buyDate: p.date })) };
  const positions = Array.isArray(depot?.positions) ? depot.positions : [];
  const watch = Array.isArray(depot?.watch) ? depot.watch : [];
  const intent = intentOf(question, asked);
  // beim Bären heißt „Gib mir eine Übersicht“ (ohne Markt/Chancen) die Übersicht über die EIGENEN Käufe
  if (Array.isArray(holdings) && !intent.depot && !asked.length && /(übersicht|überblick|zusammenfassung|stand)\b/i.test(question) && !/(markt|dax|nasdaq|index|indizes|chancen|börse heute|wirtschaft)/i.test(question)) {
    intent.depot = true; intent.mode = intent.ideas ? 'both' : 'depot';
  }
  // noch nichts notiert → zur leeren Übersicht ein paar Ideen dazu („das könnte dich interessieren“)
  if (Array.isArray(holdings) && intent.depot && !own.length && !intent.ideas) { intent.ideas = true; intent.mode = 'both'; }
  const general = intent.ideas; // nur dann Marktscan und frischer Radar
  // eigene Positionen nur durchrechnen, wenn es ums Depot oder um Ideen geht (für Ideen: was ist schon im Depot?) – oder eine gefragte Aktie gehört dazu
  const heldAsked = positions.filter((p) => asked.includes(p.symbol));
  const checkPos = intent.depot || intent.ideas ? positions : heldAsked;
  const R = require('./radar');
  const [mine, extra, radar, benches] = await Promise.all([
    checkPos.length || (intent.depot && watch.length) ? check({ positions: checkPos, watch: intent.depot ? watch.filter((s) => !asked.includes(s)) : [], cash: depot?.cash }, { signal }).catch(() => null) : null,
    asked.length ? pool(asked.filter((s) => !positions.some((p) => p.symbol === s)), 5, (s) => analyzeSymbol(s, { signal, cross: true, frames: true })) : [],
    store ? R.latest(store, { signal, maxAgeMs: general ? 20 * 60000 : 6 * 3600000, stored: !general }).catch(() => null) : null, // Ideen: frisch über alle Werte (höchstens 20 min alt), sonst nur Gespeichertes
    intent.mode === 'depot' ? [] : Promise.all(['^GDAXI', '^STOXX50E', '^NDX'].map((b) => benchmark(b, { signal }).catch(() => null))), // Übersicht der Käufe: keine Marktlage
  ]);
  const sc = general ? radar?.scan || await scan({ signal }).catch(() => null) : null;
  // Spitzenkandidaten mit frischem Echtzeitkurs und allen Zeitebenen neu bewerten
  const picks = sc ? await pool([...sc.now.slice(0, 4), ...sc.soon.slice(0, 2)].map((x) => x.symbol), 6, (s) => analyzeSymbol(s, { signal, frames: true })) : [];
  const depotValue = mine?.depotValue || PLANSPIEL.capital, cash = depot?.cash != null ? +depot.cash : depotValue;
  // Nachrichten zu den Werten, um die es geht: gefragte, eigene (nur bei Depot-Fragen), Spitzenkandidaten (je 4 Schlagzeilen, letzte 7 Tage)
  const focus = [...new Set([...asked, ...checkPos.map((p) => p.symbol), ...picks.filter((x) => !x.error && ['kaufen', 'bald'].includes(x.signal)).map((x) => x.symbol)])].slice(0, 5);
  const headlines = await pool(focus, 5, (s) => news(NAME_OF[s] || s, { signal, max: 4 }).then((n) => ({ symbol: s, n }))).catch(() => []);

  const st = planspielStatus(hooks.now(), +depot?.buys || 0);
  const lines = [];
  lines.push(`LIVE-MARKTDATEN (abgerufen am ${new Date(hooks.now()).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} um ${clock(hooks.now())} Uhr; Kurse in Echtzeit von Tradegate/ING, wo angegeben, sonst Yahoo; Börse ${marketOpen() ? 'geöffnet' : 'geschlossen – Kurse vom letzten Handel'}):`);
  const bl = benches.filter(Boolean);
  if (bl.length) lines.push(`MARKTLAGE: ${bl.map(benchLine).join(' | ')}`);
  lines.push(`PLANSPIEL BÖRSE: ${st.running ? `läuft noch ${st.daysLeft} Tage (bis ${PLANSPIEL.end.split('-').reverse().join('.')})` : 'gerade nicht aktiv'} · Startkapital 50.000 € · Gebühr je Order 0,3 % (mind. 15 €) · max. 20 % je Wertpapier (10.000 € bei 50.000 €) · mind. 3 abgerechnete Käufe bis 22.01.2027${depot?.buys != null ? ` (bisher ${st.buys}, ${st.buysMissing ? `es fehlen noch ${st.buysMissing}` : 'erfüllt'})` : ''} · keine Papiere unter 1 € · Order-Arten: Market, Limit, Stop-Loss, Stop-Buy (bis 14 Tage) · abgerechnet wird zu Geld-/Briefkurs.`);
  lines.push(`FRAGE-ART: ${{ both: 'Depot-Überblick UND Ideen/Empfehlungen – erst das Depot, dann die Chancen aus dem Marktscan', ideas: 'Ideen/Empfehlungen – Marktscan über alle Planspiel-Werte', depot: 'Depot-Überblick – nur die eigenen Positionen', stocks: 'bestimmte Aktie(n) – nur diese', market: 'allgemeine Marktlage – kein Scan' }[intent.mode]}`);
  if (Array.isArray(holdings)) lines.push(H.text(holdings));
  lines.push(depot ? `DEPOT DES NUTZERS: ${positions.length} Positionen${depot.cash != null ? ` · Bargeld ${eur(+depot.cash)}` : ''}${mine?.depotValue ? ` · Depotwert ${eur(mine.depotValue)}` : ''}`
    : 'DEPOT DES NUTZERS: unbekannt (die App greift bewusst nicht aufs Planspiel zu) – Stückzahlen sind für 50.000 € gerechnet. Nennt der Nutzer seine Positionen im Chat (z. B. „40 SAP zu 231 €“), nutze diese Angaben.');
  const opt = { depotValue, cash, plan: true };
  if (mine?.holdings?.length) lines.push('EIGENE POSITIONEN:', ...mine.holdings.map((x) => stockLine(x, opt)));
  if (extra.length) lines.push('GEFRAGTE WERTE:', ...extra.map((x, i) => (x.error ? stockLine({ symbol: asked[i], error: x.error }) : stockLine(x, opt))));
  if (mine?.watch?.length) lines.push('BEOBACHTUNGSLISTE:', ...mine.watch.map((x) => stockLine(x, opt)));
  if (sc) {
    lines.push(`MARKTSCAN (${sc.checked} Aktien aus allen Planspiel-Indizes: DAX, MDAX, SDAX, TecDAX, EuroStoxx 50, Dow, Nasdaq 100, FTSE MIB, ATX, LuxX, Global Challenges, Selection Europe; sortiert nach Score, Trefferquote und Stärke ggü. Index):`);
    const okPicks = picks.filter((x) => !x.error);
    if (okPicks.length) lines.push('SPITZENKANDIDATEN (frisch bewertet):', ...okPicks.map((x) => stockLine(x, opt)));
    else lines.push('POTENZIAL JETZT: gerade kein Wert mit klarem Kaufsignal.');
    const more = [...sc.now, ...sc.soon].filter((x) => !okPicks.some((p) => p.symbol === x.symbol)).slice(0, 6);
    if (more.length) lines.push(`WEITERE KANDIDATEN: ${more.map((x) => `${x.name} ${eur(x.price)} (${SIGNAL_TEXT[x.signal]}, Score ${x.score}${x.history.cases ? `, Treffer ${x.history.winRate} %` : ''}) – ${x.reasons[0]}`).join(' | ')}`);
    if (sc.weak.length) lines.push(`SCHWÄCHSTE CHARTS (meiden): ${sc.weak.map((x) => `${x.name} (Score ${x.score}, Monat ${sgn(x.change1m)})`).join(', ')}`);
  }
  const hl = headlines.filter((h) => h && !h.error && h.n?.length);
  // Stimmung je Wert per Schlüsselwörtern (Auftrag, Prognose angehoben … / Gewinnwarnung, Kursziel gesenkt …) – Rechnung, keine KI
  const { sentiment, headlineScore } = require('./radar');
  if (hl.length) {
    lines.push('NACHRICHTEN (Google News, letzte 7 Tage; Stimmung per Schlüsselwörtern berechnet – Zahl in Klammern: + positiv, − negativ):');
    hl.forEach((h) => {
      const st = sentiment(h.n, hooks.now());
      lines.push(`- ${NAME_OF[h.symbol] || h.symbol}: Stimmung ${st.score > 1 ? 'positiv' : st.score < -1 ? 'negativ' : 'neutral'} (${st.score})${st.severe ? ' – ACHTUNG: schwere negative Meldung' : ''}`,
        ...h.n.map((n) => `  · (${headlineScore(n.title) > 0 ? '+' : ''}${headlineScore(n.title)}) ${n.title}${n.source ? ` – ${n.source}` : ''}${n.date ? `, ${new Date(n.date).toLocaleDateString('de-DE')}` : ''}`));
    });
  }
  if (radar) {
    if (general) lines.push(R.radarText(radar));
    else {
      const secs = [...new Set(asked.map((s) => U.bySymbol.get(s)?.sector).filter(Boolean))];
      const sl = radar.sectors.filter((x) => secs.includes(x.name));
      if (sl.length) lines.push(`BRANCHE: ${sl.map((x) => `${x.name} 3 Monate ${x.r63 > 0 ? '+' : ''}${String(x.r63).replace('.', ',')} %, ${x.above200} % der Werte über der 200-Tage-Linie`).join(' · ')}`);
      lines.push(`MARKTSTIMMUNG aus Schlagzeilen: ${radar.mood.score > 2 ? 'positiv' : radar.mood.score < -2 ? 'negativ' : 'neutral'} (${radar.mood.score})`);
      const hit = radar.picks.filter((p) => asked.includes(p.symbol));
      if (hit.length) lines.push(...hit.map((p) => `CHANCEN-RADAR meldet zu ${p.name}: ${p.reason} (Score ${p.score})`));
    }
  }
  const ok = (l) => (l || []).filter((x) => x && !x.error).length;
  const count = ok(mine?.holdings) + ok(extra) + ok(mine?.watch) + (sc?.checked || 0);
  const radarPicks = general && radar ? radar.picks.length : null;
  if (!count && !bl.length) lines.push('KURSE: gerade nicht erreichbar (keine Quelle antwortet) – sag das offen und nenne keine Kurse aus dem Gedächtnis als aktuell.');
  // Werte, zu denen ein Chart passt (gefragte, eigene, Kandidaten) – die App hängt ihn an, wenn die Antwort sie bespricht
  const charts = [...extra, ...(mine?.holdings || []), ...picks, ...(general && radar ? radar.picks : [])].filter((x) => x && !x.error).map((x) => ({ symbol: x.symbol, name: x.name }));
  const frames = [...extra, ...picks, ...(mine?.holdings || [])].filter((x) => x && x.frames).length;
  const depotInfo = null;
  return { text: lines.join('\n'), count, symbols: asked, focus: focus.map((s) => ({ symbol: s, name: NAME_OF[s] || s })), charts, failed: !count && !depotInfo && !bl.length, indices: bl.length, headlines: hl.reduce((n, h) => n + h.n.length, 0), frames, radarPicks, general,
    mode: intent.mode, depot: depotInfo, owned: own.length, showBestand: intent.depot && Array.isArray(holdings), chancen: general && radar ? R.overview(radar) : null };
}

// Chart-Blöcke für die Werte, die in der Antwort vorkommen und noch keinen Chart haben (höchstens 3 Charts je Antwort)
function chartBlocksFor(answer, list) {
  const text = String(answer || '');
  const have = new Set([...text.matchAll(/```stock\s*([\s\S]*?)```/g)].map((m) => { try { return JSON.parse(m[1]).symbol; } catch { return m[1].trim(); } }));
  const free = 3 - have.size;
  if (free <= 0) return '';
  const seen = new Set();
  const want = list.filter((x) => {
    if (have.has(x.symbol) || seen.has(x.symbol)) return false;
    seen.add(x.symbol);
    const short = String(x.name || '').split(/[\s(]/)[0];
    return text.includes(x.symbol) || (short.length >= 3 && new RegExp(`(^|[^\\p{L}])${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu').test(text));
  }).slice(0, free);
  return want.map((x) => `\n\n\`\`\`stock\n${JSON.stringify({ symbol: x.symbol, name: x.name })}\n\`\`\``).join('');
}

module.exports = { MIN_SELL_GAIN, FULL, NAME_OF, chartBlocksFor, intentOf, frameStats, timeframes, PLANSPIEL, UNIVERSE, fee, sma, ema, rsi, atr, indicators, scoreAt, buyNowAt, hitRate, analyze, positionSize, planspielStatus, marketOpen,
  series, fxToEur, check, scan, search, symbolsInText, news, contextFor, stockLine, orderPlan, liveQuote, withLive, chartData, quoteNow, RANGES, ISIN, hooks, cache };
