/* ===================================================================
   Depot (Seitenleiste „Depot“, eigener Tab) – gehört zum Börsen-Agenten (Bulle), fürs Planspiel Börse
   - oben: Depotwert, Gewinn/Verlust, Bargeld (anklickbar zum Abgleichen), Käufe x/3, Tage bis Spielende
   - Meine Positionen: Stück, Kaufkurs, aktueller Kurs, +/-, Signal (halten / nachkaufen / Teilgewinn / verkaufen), Stopp
   - Potenzial: „Jetzt“ (Kaufsignal) und „Bald“ (Einstieg bahnt sich an) aus dem Marktscan, mit Trefferquote
   - Beobachtungsliste: eigene Werte, die der Bulle im Blick behält
   - Benachrichtigungen: prüft alle 5 min (solange die App offen ist) und meldet neue Kauf-/Verkaufssignale –
     als Hinweis unten rechts, in der Inbox und (wenn erlaubt) als Mitteilung des Systems
   Gespeichert im Browser (boerse.v1) – wandert über auth.js mit ins Konto. Kurse/Signale: /api/boerse/* (lib/boerse.js)
   =================================================================== */
const Boerse = (() => {
  const KEY = 'boerse.v1';
  const CAPITAL = 50000, FEE_RATE = 0.003, FEE_MIN = 15, MAX_WEIGHT = 0.2, MIN_BUYS = 3;
  const END = Date.parse('2027-01-25T22:00:00+01:00'), DEADLINE = Date.parse('2027-01-22T22:00:00+01:00');
  const CHECK_MS = 5 * 60000, SCAN_MS = 20 * 60000;
  const fee = (v) => Math.max(FEE_MIN, FEE_RATE * Math.abs(v || 0));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 13) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const eur = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '–' : `${(+x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })} €`);
  const pc = (x) => (x == null || !Number.isFinite(+x) ? '–' : `${x > 0 ? '+' : ''}${(+x).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
  const tone = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
  const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const today = () => new Date().toISOString().slice(0, 10);

  // Signal → Beschriftung + Farbe (Status-Farben aus README 3.1)
  const SIG = {
    kaufen: ['Kaufen', 'green'], bald: ['Bald', 'blue'], ueberhitzt: ['Überhitzt', 'orange'], halten: ['Neutral', 'grey'], meiden: ['Meiden', 'red'],
    verkaufen: ['Verkaufen', 'red'], teilgewinn: ['Teilgewinn', 'orange'], nachkaufen: ['Nachkaufen', 'green'],
  };
  const pill = (sig) => { const [t, c] = SIG[sig] || ['–', 'grey']; return `<span class="bx-sig ${c}">${t}</span>`; };

  /* ---------- Speicher ---------- */
  const blank = () => ({ positions: [], watch: [], cash: CAPITAL, buys: 0, trades: [], notify: false, last: {} });
  let state = blank();
  try { state = { ...blank(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  // letzte Antworten vom Server
  let live = { holdings: {}, watch: {}, scan: null, checkedAt: 0, scannedAt: 0, error: '' };
  let busy = false, tab = 'now', open = false;

  /* ---------- Ansicht ---------- */
  const view = document.createElement('section');
  view.className = 'bx-view';
  view.setAttribute('aria-label', 'Depot');
  view.hidden = true;
  view.innerHTML = `<header class="bx-head">
      <span class="bx-dog" aria-hidden="true"></span>
      <div class="bx-htext"><h2>Depot</h2><span class="bx-sub">Planspiel Börse · <span class="bx-asof"></span></span></div>
      <div class="bx-tools">
        <button type="button" class="tk-ib bx-bell" data-act="notify" title="Benachrichtigungen" aria-pressed="false">${fi('bell', 14)}</button>
        <button type="button" class="tk-ib" data-act="refresh" title="Aktualisieren">${fi('refresh', 14)}</button>
        <button type="button" class="bx-ghost" data-act="ask" title="Mit dem Bullen über dein Depot sprechen">${fi('chat', 13)}<span>Depot besprechen</span></button>
        <button type="button" class="tk-new" data-act="buy">${fi('plus', 13)}<span>Kauf eintragen</span></button>
      </div>
    </header>
    <div class="bx-scroll">
      <div class="bx-stats"></div>
      <section class="bx-sec"><div class="bx-sec-h"><h3>Meine Positionen</h3><span class="bx-count" data-c="pos"></span></div><div class="bx-list" data-list="pos"></div></section>
      <section class="bx-sec"><div class="bx-sec-h"><h3>Potenzial</h3>
        <div class="bx-seg" role="tablist"><button type="button" data-tab="now" role="tab">Jetzt</button><button type="button" data-tab="soon" role="tab">Bald</button><span class="bx-seg-bg"></span></div>
        <span class="bx-count" data-c="scan"></span></div><div class="bx-list" data-list="scan"></div></section>
      <section class="bx-sec"><div class="bx-sec-h"><h3>Beobachtungsliste</h3><span class="bx-count" data-c="watch"></span>
        <label class="tk-search bx-add">${fi('plus', 12)}<input type="search" placeholder="Aktie hinzufügen" aria-label="Aktie zur Beobachtungsliste hinzufügen" autocomplete="off" /></label>
        <div class="bx-results" data-for="watch" hidden></div></div><div class="bx-list" data-list="watch"></div></section>
      <p class="bx-note">Signale aus dem Chart (Trend, Momentum, RSI, Volatilität) – Wahrscheinlichkeiten, keine Garantie; die Trefferquote zeigt, wie oft dasselbe Signal bei der Aktie in den letzten zwei Jahren danach gestiegen ist. Kurse ca. 15 min verzögert · Quellen: Yahoo Finance, Stooq, Google News.</p>
    </div>`;
  const $ = (sel) => view.querySelector(sel);

  // kleiner Kursverlauf (letzte 60 Tage)
  function spark(arr, w = 64, h = 20) {
    const v = (arr || []).filter((x) => Number.isFinite(x));
    if (v.length < 2) return '<span class="bx-spark"></span>';
    const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
    const pts = v.map((x, i) => `${((i / (v.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((x - lo) / r) * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg class="bx-spark ${v[v.length - 1] >= v[0] ? 'up' : 'down'}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  /* ---------- Zahlen ---------- */
  function totals() {
    let value = 0, cost = 0;
    state.positions.forEach((p) => {
      const a = live.holdings[p.id];
      const price = a?.price ?? p.buyPrice;
      value += price * p.qty;
      cost += p.buyPrice * p.qty + fee(p.buyPrice * p.qty);
    });
    const total = value + (+state.cash || 0);
    return { value, cost, total, gain: total - CAPITAL, gainPct: (total / CAPITAL - 1) * 100 };
  }
  // Stückzahl: ~1,5 % Risiko bis zum Stopp, höchstens 20 % vom Depot und nicht mehr als das Bargeld
  function suggestQty(price, stop) {
    const t = totals();
    if (!(price > 0)) return 0;
    const risk = Math.max(price - (stop || price * 0.92), price * 0.01);
    const q = Math.min(Math.floor((t.total * 0.015) / risk), Math.floor((t.total * MAX_WEIGHT) / price), Math.floor(((+state.cash || 0) - FEE_MIN) / (price * (1 + FEE_RATE))));
    return Math.max(0, q);
  }

  function renderStats() {
    const t = totals();
    const days = Math.max(0, Math.ceil((END - Date.now()) / 86400000));
    const missing = Math.max(0, MIN_BUYS - state.buys);
    $('.bx-stats').innerHTML = `
      <div class="bx-stat"><span>Depotwert</span><strong>${eur(t.total)}</strong><em class="${tone(t.gain)}">${pc(t.gainPct)} seit Start</em></div>
      <div class="bx-stat"><span>Gewinn / Verlust</span><strong class="${tone(t.gain)}">${t.gain >= 0 ? '+' : ''}${eur(t.gain)}</strong><em>Start 50.000 €</em></div>
      <button type="button" class="bx-stat bx-cash" data-act="cash" title="Bargeld mit dem Planspiel abgleichen"><span>Bargeld ${fi('pencil', 10)}</span><strong>${eur(state.cash)}</strong><em>investiert ${eur(t.value, 0)}</em></button>
      <div class="bx-stat"><span>Käufe</span><strong>${state.buys} / ${MIN_BUYS}</strong><em class="${missing && Date.now() < DEADLINE ? 'warn' : ''}">${missing ? `noch ${missing} bis 22.01.` : 'Pflicht erfüllt'}</em></div>
      <div class="bx-stat"><span>Spielende</span><strong>${days} Tage</strong><em>25.01.2027</em></div>`;
  }

  function rowPos(p) {
    const a = live.holdings[p.id];
    const h = a?.holding;
    const price = a?.price;
    const gain = price != null ? (price / p.buyPrice - 1) * 100 : null;
    const reason = a?.error ? `Keine Kursdaten (${a.error})` : h ? h.reasons[0] : 'Wird geprüft …';
    return `<div class="bx-row" data-id="${p.id}">
      <div class="bx-name"><strong>${esc(p.name || p.symbol)}</strong><span>${esc(p.symbol)} · ${p.qty} Stück zu ${eur(p.buyPrice)}</span></div>
      ${spark(a?.spark)}
      <div class="bx-num"><strong>${eur(price)}</strong><span class="${tone(gain)}">${pc(gain)}</span></div>
      <div class="bx-num"><strong>${price != null ? eur(price * p.qty, 0) : '–'}</strong><span class="${tone(h?.gainEur)}">${h ? `${h.gainEur >= 0 ? '+' : ''}${eur(h.gainEur, 0)} netto` : ''}</span></div>
      <div class="bx-sigcol">${h ? pill(h.signal) : '<span class="bx-sig grey">…</span>'}<span class="bx-why" title="${esc(reason)}">${esc(reason)}</span></div>
      <div class="bx-num bx-stop"><span>Stopp</span><strong>${eur(h?.stop)}</strong></div>
      <div class="bx-acts"><button type="button" class="bx-btn" data-act="sell" data-id="${p.id}">Verkauf</button><button type="button" class="tk-ib" data-act="del" data-id="${p.id}" title="Ohne Buchung entfernen">${fi('trash', 13)}</button></div>
    </div>`;
  }
  function rowStock(x, kind) {
    if (x.error) return `<div class="bx-row"><div class="bx-name"><strong>${esc(x.name || x.symbol)}</strong><span>${esc(x.symbol)}</span></div><div class="bx-why wide">Keine Kursdaten (${esc(x.error)})</div><div class="bx-acts">${kind === 'watch' ? `<button type="button" class="tk-ib" data-act="unwatch" data-sym="${esc(x.symbol)}" title="Entfernen">${fi('x', 12)}</button>` : ''}</div></div>`;
    const hr = x.history?.cases ? ` · <span class="bx-hit" title="So oft ist die Aktie in den 20 Handelstagen nach diesem Kaufsignal gestiegen (letzte 2 Jahre, ${x.history.cases} Fälle)">Treffer ${x.history.winRate} %</span>` : '';
    const watching = state.watch.some((w) => w.symbol === x.symbol);
    return `<div class="bx-row" data-sym="${esc(x.symbol)}">
      <div class="bx-name"><strong>${esc(x.name)}</strong><span>${esc(x.symbol)} · Score ${x.score}${hr}</span></div>
      ${spark(x.spark)}
      <div class="bx-num"><strong>${eur(x.price)}</strong><span class="${tone(x.change1d)}">${pc(x.change1d)} heute</span></div>
      <div class="bx-num"><strong class="${tone(x.change1m)}">${pc(x.change1m)}</strong><span>1 Monat</span></div>
      <div class="bx-sigcol">${pill(x.signal)}<span class="bx-why" title="${esc(x.reasons[0])}">${esc(x.reasons[0])}</span></div>
      <div class="bx-num bx-stop"><span>${x.trigger ? 'Stop-Buy' : 'Ziel'}</span><strong>${eur(x.trigger || x.target)}</strong></div>
      <div class="bx-acts">${kind === 'watch' ? '' : `<button type="button" class="tk-ib${watching ? ' on' : ''}" data-act="watch" data-sym="${esc(x.symbol)}" data-name="${esc(x.name)}" title="${watching ? 'Wird beobachtet' : 'Beobachten'}">${fi('eye', 13)}</button>`}<button type="button" class="bx-btn" data-act="bought" data-sym="${esc(x.symbol)}">Gekauft</button>${kind === 'watch' ? `<button type="button" class="tk-ib" data-act="unwatch" data-sym="${esc(x.symbol)}" title="Entfernen">${fi('x', 12)}</button>` : ''}</div>
    </div>`;
  }
  const empty = (t) => `<div class="bx-empty">${t}</div>`;

  function render() {
    if (!open) return;
    $('.bx-asof').textContent = live.error ? live.error : live.checkedAt ? `Stand ${new Date(live.checkedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : busy ? 'lädt …' : '';
    const bell = $('.bx-bell');
    bell.classList.toggle('on', !!state.notify);
    bell.setAttribute('aria-pressed', String(!!state.notify));
    bell.title = state.notify ? 'Benachrichtigungen an' : 'Benachrichtigungen aus';
    renderStats();
    $('[data-c="pos"]').textContent = state.positions.length || '';
    $('[data-list="pos"]').innerHTML = state.positions.length ? state.positions.map(rowPos).join('')
      : empty('Noch keine Positionen. Trag deine Käufe aus dem Planspiel ein – der Bulle sagt dir dann, wann du halten, nachkaufen oder verkaufen solltest.');
    const list = live.scan ? live.scan[tab] : null;
    $('[data-c="scan"]').textContent = live.scan ? `${live.scan.checked} Werte geprüft` : '';
    view.querySelectorAll('.bx-seg [data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    $('.bx-seg').dataset.on = tab;
    $('[data-list="scan"]').innerHTML = !live.scan ? empty(busy ? 'Der Bulle prüft gerade die Charts …' : 'Noch kein Marktscan.')
      : list.length ? list.map((x) => rowStock(x, 'scan')).join('')
        : empty(tab === 'now' ? 'Gerade kein Wert mit klarem Kaufsignal – lieber abwarten als hinterherkaufen.' : 'Gerade bahnt sich kein Einstieg an.');
    $('[data-c="watch"]').textContent = state.watch.length || '';
    $('[data-list="watch"]').innerHTML = state.watch.length ? state.watch.map((w) => rowStock(live.watch[w.symbol] || { symbol: w.symbol, name: w.name, error: busy ? 'wird geprüft' : 'noch nicht geprüft' }, 'watch')).join('')
      : empty('Füge Aktien hinzu, die du im Blick behalten willst – du bekommst eine Nachricht, sobald ein Einstieg passt.');
    const dog = $('.bx-dog');
    if (!dog.firstChild && window.PixelDogs) dog.innerHTML = window.PixelDogs.svg('boerse', 32);
  }

  /* ---------- Abruf ---------- */
  const payload = () => ({
    positions: state.positions.map((p) => ({ symbol: p.symbol, qty: p.qty, buyPrice: p.buyPrice, buyDate: p.buyDate })),
    watch: state.watch.map((w) => w.symbol), cash: +state.cash || 0,
  });
  let again = null; // während eines Abrufs angefordert → danach gleich noch einmal (z. B. neue Position eingetragen)
  async function refresh({ scan = false, quiet = false } = {}) {
    if (busy) { again = { scan: scan || again?.scan, quiet: true }; return; }
    busy = true;
    if (!quiet) render();
    try {
      const jobs = [];
      if (state.positions.length || state.watch.length) {
        jobs.push(fetch('/api/boerse/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Fehler ${r.status}`))))
          .then((j) => {
            live.holdings = {};
            state.positions.forEach((p, i) => { live.holdings[p.id] = j.holdings[i]; });
            live.watch = Object.fromEntries((j.watch || []).map((x) => [x.symbol, x]));
            live.checkedAt = Date.now();
          }));
      } else live.checkedAt = Date.now();
      if (scan || !live.scan || Date.now() - live.scannedAt > SCAN_MS) {
        const extra = state.watch.map((w) => w.symbol).join(',');
        jobs.push(fetch(`/api/boerse/scan${extra ? `?extra=${encodeURIComponent(extra)}` : ''}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Fehler ${r.status}`))))
          .then((j) => { live.scan = j; live.scannedAt = Date.now(); }));
      }
      const res = await Promise.allSettled(jobs);
      const bad = res.find((r) => r.status === 'rejected');
      live.error = bad ? 'Kurse gerade nicht erreichbar' : '';
      if (!bad || res.some((r) => r.status === 'fulfilled')) notifyChanges();
    } finally {
      busy = false;
      render();
      if (again) { const a = again; again = null; refresh(a); }
    }
  }

  /* ---------- Benachrichtigungen ---------- */
  const toasts = document.createElement('div');
  toasts.className = 'bx-toasts';
  document.body.append(toasts);
  function toast(title, text) {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'bx-toast';
    t.innerHTML = `<span class="bx-tdog">${window.PixelDogs?.svg('boerse', 24) || ''}</span><span class="bx-ttext"><strong>${esc(title)}</strong><span>${esc(text)}</span></span>`;
    t.addEventListener('click', () => { t.remove(); window.openViewTab?.('boerse'); });
    toasts.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 9000);
  }
  function systemNote(title, body, tag) {
    try {
      if (!state.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
      const n = new Notification(title, { body, tag, icon: 'icon-180.png' });
      n.onclick = () => { window.focus(); window.openViewTab?.('boerse'); n.close(); };
    } catch {}
  }
  function tell(title, text, tag) {
    toast(title, text);
    systemNote(title, text, tag);
    window.Inbox?.add({ from: 'Börse', subject: title, text });
  }
  // Nur Änderungen melden: neues Verkaufs-/Teilgewinn-/Nachkaufsignal, Kaufsignal auf der Beobachtungsliste, neuer Wert mit Kaufsignal im Scan
  function notifyChanges() {
    if (!state.notify) return snapshot();
    const last = state.last || {};
    const first = !Object.keys(last).length;
    const out = [];
    state.positions.forEach((p) => {
      const h = live.holdings[p.id]?.holding;
      if (!h) return;
      const k = `h:${p.id}`;
      if (h.signal !== last[k] && ['verkaufen', 'teilgewinn', 'nachkaufen'].includes(h.signal) && (!first || h.signal === 'verkaufen')) {
        out.push([`${SIG[h.signal][0]}: ${p.name || p.symbol}`, `${h.reasons[0]} · Kurs ${eur(live.holdings[p.id].price)}`, k]);
      }
    });
    if (!first) {
      Object.values(live.watch).forEach((x) => {
        const k = `w:${x.symbol}`;
        if (!x.error && x.signal !== last[k] && ['kaufen', 'bald'].includes(x.signal)) out.push([`${x.signal === 'kaufen' ? 'Jetzt einsteigen' : 'Bald interessant'}: ${x.name}`, `${x.reasons[0]} · ${eur(x.price)}`, k]);
      });
      (live.scan?.now || []).forEach((x) => {
        const k = `s:${x.symbol}`;
        if (!last[k]) out.push([`Neues Kaufsignal: ${x.name}`, `Score ${x.score}/100${x.history?.cases ? ` · Treffer ${x.history.winRate} %` : ''} · ${eur(x.price)}, Stopp ${eur(x.stop)}`, k]);
      });
    }
    out.slice(0, 3).forEach(([t, b, k]) => tell(t, b, k));
    if (out.length > 3) tell(`${out.length - 3} weitere Signale`, 'Öffne das Depot für alle Details.', 'more');
    snapshot();
  }
  function snapshot() {
    const last = {};
    state.positions.forEach((p) => { const h = live.holdings[p.id]?.holding; if (h) last[`h:${p.id}`] = h.signal; });
    Object.values(live.watch).forEach((x) => { if (!x.error) last[`w:${x.symbol}`] = x.signal; });
    (live.scan?.now || []).forEach((x) => { last[`s:${x.symbol}`] = 'kaufen'; });
    // Scan-Einträge 1 Tag merken, damit derselbe Wert nicht ständig neu gemeldet wird
    const keep = state.lastSeen || {};
    Object.keys(last).filter((k) => k.startsWith('s:')).forEach((k) => { keep[k] = Date.now(); });
    Object.keys(keep).forEach((k) => { if (Date.now() - keep[k] < 86400000) last[k] = last[k] || 'kaufen'; else delete keep[k]; });
    state.last = last;
    state.lastSeen = keep;
    save();
  }
  async function toggleNotify() {
    if (!state.notify && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch {}
    }
    state.notify = !state.notify;
    save();
    render();
    if (state.notify) {
      const sys = 'Notification' in window && Notification.permission === 'granted';
      toast('Benachrichtigungen an', sys ? 'Der Bulle meldet sich, sobald ein Kauf- oder Verkaufssignal kommt – solange die App offen ist.'
        : 'Hinweise erscheinen hier in der App und in der Inbox. Für Mitteilungen vom System: App zum Home-Bildschirm hinzufügen und Mitteilungen erlauben.');
      refresh({ quiet: true });
    }
  }

  // regelmäßig prüfen (auch wenn das Depot nicht offen ist), nur bei sichtbarer App und wenn es etwas zu prüfen gibt
  setInterval(() => {
    if (document.hidden) return;
    if (!state.notify && !open) return;
    if (!state.positions.length && !state.watch.length && !state.notify) return;
    refresh({ quiet: true });
  }, CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (state.notify || open) && Date.now() - live.checkedAt > 3 * 60000) refresh({ quiet: true });
  });
  if (state.notify) setTimeout(() => refresh({ quiet: true }), 4000);

  /* ---------- Fenster: Kauf / Verkauf / Bargeld ---------- */
  function modal(html, onSubmit) {
    const m = document.createElement('div');
    m.className = 'tk-modal bx-modal';
    m.innerHTML = `<form class="bx-form">${html}</form>`;
    document.body.append(m);
    const form = m.querySelector('form');
    const close = () => { m.classList.add('closing'); setTimeout(() => m.remove(), 200); };
    m.addEventListener('pointerdown', (e) => { if (e.target === m) close(); });
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    form.querySelector('[data-close]')?.addEventListener('click', close);
    form.addEventListener('submit', (e) => { e.preventDefault(); if (onSubmit(form) !== false) close(); });
    setTimeout(() => form.querySelector('input:not([type=hidden])')?.focus(), 30);
    return form;
  }
  const num = (v) => { const x = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
  const numIn = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));

  // Suche: Name oder Kürzel → Liste (Server: lokale Liste + Yahoo-Suche)
  function attachSearch(input, box, onPick) {
    let t = 0, seq = 0;
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) { box.hidden = true; return; }
      t = setTimeout(async () => {
        const my = ++seq;
        let list = [];
        try { list = await (await fetch(`/api/boerse/search?q=${encodeURIComponent(q)}`)).json(); } catch {}
        if (my !== seq) return;
        box.innerHTML = list.length ? list.map((x) => `<button type="button" data-sym="${esc(x.symbol)}" data-name="${esc(x.name)}"><strong>${esc(x.name)}</strong><span>${esc(x.symbol)}${x.exchange ? ` · ${esc(x.exchange)}` : ''}${x.type === 'ETF' ? ' · ETF' : ''}</span></button>`).join('') : '<div class="bx-none">Nichts gefunden</div>';
        box.hidden = false;
      }, 250);
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); box.querySelector('button')?.click(); }
      if (e.key === 'Escape') box.hidden = true;
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-sym]');
      if (!b) return;
      box.hidden = true;
      onPick({ symbol: b.dataset.sym, name: b.dataset.name });
    });
  }

  function buyForm(pre = {}) {
    const form = modal(`
      <div class="bx-fh">${fi('plus', 14)}<strong>Kauf eintragen</strong></div>
      <label class="bx-field bx-stock"><span>Aktie</span><input name="q" placeholder="Name oder Kürzel, z. B. Siemens" autocomplete="off" value="${esc(pre.name || '')}" /><input type="hidden" name="symbol" value="${esc(pre.symbol || '')}" /></label>
      <div class="bx-results" hidden></div>
      <div class="bx-grid">
        <label class="bx-field"><span>Stück</span><input name="qty" inputmode="numeric" value="${esc(pre.qty || '')}" /></label>
        <label class="bx-field"><span>Kaufkurs (€)</span><input name="price" inputmode="decimal" value="${esc(numIn(pre.price))}" /></label>
        <label class="bx-field"><span>Datum</span><input name="date" type="date" value="${today()}" /></label>
      </div>
      <p class="bx-calc"></p>
      <div class="bx-fbtns"><button type="button" class="bx-ghost" data-close>Abbrechen</button><button type="submit" class="tk-new">Eintragen</button></div>`, (f) => {
      const symbol = f.symbol.value, qty = Math.floor(num(f.qty.value)), price = num(f.price.value);
      if (!symbol || !(qty > 0) || !(price > 0)) { f.querySelector('.bx-calc').innerHTML = '<span class="warn">Bitte Aktie aus der Liste wählen, Stückzahl und Kaufkurs eintragen.</span>'; return false; }
      const cost = qty * price + fee(qty * price);
      state.positions.push({ id: newId(), symbol, name: f.q.value.trim() || symbol, qty, buyPrice: price, buyDate: f.date.value || today() });
      state.cash = Math.round(((+state.cash || 0) - cost) * 100) / 100;
      state.buys = (state.buys || 0) + 1;
      state.trades.push({ type: 'kauf', symbol, qty, price, fee: fee(qty * price), date: f.date.value || today() });
      save();
      render();
      refresh({ quiet: true });
    });
    const box = form.querySelector('.bx-results');
    const calc = () => {
      const qty = Math.floor(num(form.qty.value)), price = num(form.price.value);
      const t = totals();
      const p = form.querySelector('.bx-calc');
      if (!(qty > 0) || !(price > 0)) { p.textContent = pre.hint || ''; return; }
      const vol = qty * price, f = fee(vol), w = vol / t.total;
      p.innerHTML = `Ordervolumen ${eur(vol)} · Gebühr ${eur(f)} (${pc((f / vol) * 100).replace('+', '')})${vol < 5000 ? ' – <span class="warn">unter 5.000 € ist die Mindestgebühr teuer</span>' : ''}`
        + `${w > MAX_WEIGHT ? ' · <span class="warn">über 20 % vom Depot – das Planspiel lehnt den Kauf ab</span>' : ''}${vol + f > (+state.cash || 0) ? ' · <span class="warn">mehr als dein Bargeld</span>' : ''}`;
    };
    attachSearch(form.q, box, (x) => {
      form.q.value = x.name; form.symbol.value = x.symbol;
      const known = live.watch[x.symbol] || [...(live.scan?.now || []), ...(live.scan?.soon || [])].find((s) => s.symbol === x.symbol);
      if (known && !form.price.value) form.price.value = numIn(known.price);
      if (known && !form.qty.value) form.qty.value = suggestQty(known.price, known.stop) || '';
      calc();
      form.qty.focus();
    });
    form.q.addEventListener('input', () => { form.symbol.value = ''; });
    form.addEventListener('input', calc);
    calc();
  }

  function sellForm(p) {
    const a = live.holdings[p.id];
    const form = modal(`
      <div class="bx-fh">${fi('trend', 14)}<strong>Verkauf: ${esc(p.name || p.symbol)}</strong></div>
      <div class="bx-grid">
        <label class="bx-field"><span>Stück (von ${p.qty})</span><input name="qty" inputmode="numeric" value="${p.qty}" /></label>
        <label class="bx-field"><span>Verkaufskurs (€)</span><input name="price" inputmode="decimal" value="${esc(numIn(a?.price ?? ''))}" /></label>
        <label class="bx-field"><span>Datum</span><input name="date" type="date" value="${today()}" /></label>
      </div>
      <p class="bx-calc"></p>
      <div class="bx-fbtns"><button type="button" class="bx-ghost" data-close>Abbrechen</button><button type="submit" class="tk-new">Verkauf eintragen</button></div>`, (f) => {
      const qty = Math.min(p.qty, Math.floor(num(f.qty.value))), price = num(f.price.value);
      if (!(qty > 0) || !(price > 0)) return false;
      state.cash = Math.round(((+state.cash || 0) + qty * price - fee(qty * price)) * 100) / 100;
      state.trades.push({ type: 'verkauf', symbol: p.symbol, qty, price, fee: fee(qty * price), date: f.date.value || today(), buyPrice: p.buyPrice });
      if (qty >= p.qty) state.positions = state.positions.filter((x) => x.id !== p.id); else p.qty -= qty;
      save();
      render();
    });
    const calc = () => {
      const qty = Math.min(p.qty, Math.floor(num(form.qty.value))), price = num(form.price.value);
      if (!(qty > 0) || !(price > 0)) { form.querySelector('.bx-calc').textContent = ''; return; }
      const res = qty * (price - p.buyPrice) - fee(qty * price) - fee(qty * p.buyPrice);
      form.querySelector('.bx-calc').innerHTML = `Erlös ${eur(qty * price - fee(qty * price))} · Ergebnis nach Gebühren <span class="${tone(res)}">${res >= 0 ? '+' : ''}${eur(res)}</span>`;
    };
    form.addEventListener('input', calc);
    calc();
  }

  function cashForm() {
    modal(`
      <div class="bx-fh">${fi('wallet', 14)}<strong>Bargeld abgleichen</strong></div>
      <p class="bx-calc">Trag hier das Restkapital aus deinem Planspiel-Depot ein – Käufe und Verkäufe, die du hier einträgst, verrechnet der Bulle danach selbst (inkl. Gebühren).</p>
      <div class="bx-grid one"><label class="bx-field"><span>Bargeld (€)</span><input name="cash" inputmode="decimal" value="${esc(numIn(state.cash))}" /></label>
      <label class="bx-field"><span>Abgerechnete Käufe</span><input name="buys" inputmode="numeric" value="${state.buys || 0}" /></label></div>
      <div class="bx-fbtns"><button type="button" class="bx-ghost" data-close>Abbrechen</button><button type="submit" class="tk-new">Speichern</button></div>`, (f) => {
      const c = num(f.cash.value), b = Math.floor(num(f.buys.value));
      if (Number.isFinite(c)) state.cash = c;
      if (b >= 0) state.buys = b;
      save();
      render();
    });
  }

  // Neuer Chat mit dem Bullen: Depot durchgehen lassen
  function askAgent(text) {
    window.PixelDogs?.select('boerse');
    document.querySelector('.sidebar [data-nav="new"]')?.click();
    setTimeout(() => {
      const input = document.getElementById('input');
      const form = document.getElementById('composer');
      if (!input || !form) return;
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit?.();
    }, 520);
  }

  /* ---------- Klicks ---------- */
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], [data-tab]');
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
    const act = b.dataset.act;
    if (act === 'refresh') refresh({ scan: true });
    else if (act === 'notify') toggleNotify();
    else if (act === 'buy') buyForm();
    else if (act === 'cash') cashForm();
    else if (act === 'ask') askAgent(state.positions.length ? 'Geh mein Depot durch: Was soll ich halten, nachkaufen, teilweise verkaufen oder verkaufen – und welche Aktien passen jetzt dazu?' : 'Ich fange gerade mit dem Planspiel Börse an. Welche Aktien haben jetzt oder bald Potenzial und wie teile ich die 50.000 € sinnvoll auf?');
    else if (act === 'sell') { const p = state.positions.find((x) => x.id === b.dataset.id); if (p) sellForm(p); }
    else if (act === 'del') {
      if (b.dataset.armed) { state.positions = state.positions.filter((x) => x.id !== b.dataset.id); save(); render(); }
      else { b.dataset.armed = '1'; b.classList.add('armed'); b.title = 'Nochmal klicken zum Entfernen'; setTimeout(() => { delete b.dataset.armed; b.classList.remove('armed'); }, 2500); }
    } else if (act === 'watch') {
      if (state.watch.some((w) => w.symbol === b.dataset.sym)) state.watch = state.watch.filter((w) => w.symbol !== b.dataset.sym);
      else state.watch.push({ symbol: b.dataset.sym, name: b.dataset.name });
      save(); render(); refresh({ quiet: true });
    } else if (act === 'unwatch') { state.watch = state.watch.filter((w) => w.symbol !== b.dataset.sym); delete live.watch[b.dataset.sym]; save(); render(); }
    else if (act === 'bought') {
      const x = live.watch[b.dataset.sym] || [...(live.scan?.now || []), ...(live.scan?.soon || [])].find((s) => s.symbol === b.dataset.sym);
      if (x) buyForm({ symbol: x.symbol, name: x.name, price: x.trigger || x.price, qty: suggestQty(x.trigger || x.price, x.stop) || '', hint: `Vorschlag: Stopp bei ${eur(x.stop)}, Ziel ${eur(x.target)}` });
    }
  });
  attachSearch($('.bx-add input'), $('.bx-results[data-for="watch"]'), (x) => {
    $('.bx-add input').value = '';
    if (!state.watch.some((w) => w.symbol === x.symbol)) state.watch.push(x);
    save(); render(); refresh({ quiet: true });
  });
  document.addEventListener('pointerdown', (e) => { view.querySelectorAll('.bx-results:not([hidden])').forEach((r) => { if (!r.parentElement.contains(e.target)) r.hidden = true; }); });

  /* ---------- Öffnen / Schließen (die Tabs oben steuern das, siehe app.js → openViewTab) ---------- */
  function show() {
    const panel = document.querySelector('.panel');
    if (panel && !view.isConnected) panel.append(view);
    open = true;
    view.hidden = false;
    panel?.classList.add('view-boerse');
    render();
    if (Date.now() - live.checkedAt > 2 * 60000 || !live.scan) refresh();
  }
  function hide() {
    if (!open) return;
    open = false;
    view.hidden = true;
    document.querySelector('.panel')?.classList.remove('view-boerse');
  }

  // fürs Gespräch mit dem Börsen-Agenten (geht mit jeder Chat-Anfrage mit)
  const forAgent = () => ({ ...payload(), buys: state.buys || 0 });

  return { show, hide, refresh, forAgent, get open() { return open; }, get state() { return state; } };
})();
window.Boerse = Boerse;
