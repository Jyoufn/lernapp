/* ===================================================================
   Depot-Grafik (Block ```depot im Chat, vom Börsen-Bären): das echte Depot aus dem Planspiel Börse, live vom Server
   (/api/planspiel/depot – der Server meldet sich mit den gespeicherten Zugangsdaten an; an den Browser gehen nur Zahlen). Keine KI.
   Drei Reiter wie im Spiel:
   - Übersicht: Depotwert, Gewinn seit Start, Wertverlauf als Graph (1W · 1M · Gesamt, Fadenkreuz, DAX zum Vergleich),
     Bargeld / Investiert / Gewinn als farbige Kacheln, Aufteilung als Ring mit Legende (Hover hebt hervor)
   - Positionen: je Wert Farbe, Stück, Kaufkurs, 30-Tage-Verlauf, Wert, Gewinn, Empfehlung (Behalten · Beobachten · Nachkaufen ·
     Teilgewinn · Verkaufen); Klick klappt Details auf (Stopp, Tag/Woche, Grund, „Mit dem Bären besprechen“)
   - Performance: Gesamt, unrealisiert, realisiert, Gebühren, Vergleich mit dem DAX, Gewinn je Position als Balken,
     Pflicht-Käufe und Restlaufzeit, letzte Orders
   Aktualisiert sich jede Minute, solange die Karte zu sehen ist. Farben: README 3.1.
   =================================================================== */
const DepotCard = (() => {
  const COLORS = ['#6d9fff', '#a78bfa', '#fb923c', '#f472b6', '#facc15', '#4ade80', '#f87171', '#6aa8ff'];
  const CASH = '#2dd4bf';
  const UP = '#4fcf8a', DOWN = '#f07a6e';
  const ACTION = { halten: ['Behalten', 'grey'], beobachten: ['Beobachten', 'orange'], nachkaufen: ['Nachkaufen', 'green'], teilgewinn: ['Teilgewinn', 'blue'], verkaufen: ['Verkaufen', 'red'] };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const eur = (x, d = 2) => (x == null ? '–' : `${nf(x, d)} €`);
  const signed = (x, unit = ' €', d = 2) => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : '±'}${nf(Math.abs(x), d)}${unit}`);
  const tone = (x) => (x == null || Math.abs(x) < 1e-9 ? '' : x > 0 ? 'up' : 'down');
  const fi = (n, s = 13) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const day = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const clock = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const colorOf = (i) => COLORS[i % COLORS.length];

  // eine Anfrage für alle Karten (die Antwort wird beim Schreiben mehrfach neu gezeichnet)
  let memo = null;
  function load(fresh = false) {
    if (!fresh && memo && Date.now() - memo.t < 30000) return memo.p;
    const m = { t: Date.now(), d: memo?.d || null };
    m.p = fetch(`/api/planspiel/depot${fresh ? '?fresh=1' : ''}`).then((r) => r.json()).catch(() => ({ connected: true, error: 'Depot gerade nicht erreichbar.' }))
      .then((d) => { m.d = d; return d; });
    memo = m;
    return m.p;
  }

  /* ---------- Bausteine ---------- */
  const tile = (label, value, sub, color, cls = '') => `<div class="dpt-tile${cls}" style="--c:${color}"><span class="dpt-tl"><i></i>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const badge = (a) => { const [t, c] = ACTION[a] || ACTION.halten; return `<span class="dpt-badge ${c}">${t}</span>`; };
  function spark(v, w = 64, h = 22) {
    if (!v || v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
    const pts = v.map((x, i) => `${((i / (v.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((x - lo) / r) * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg class="dpt-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${v.at(-1) >= v[0] ? UP : DOWN}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  // Ring: je Position ein Bogen in ihrer Farbe, Bargeld türkis; Mitte zeigt Gesamtwert bzw. das gezeigte Stück
  function donut(parts, total) {
    const R = 52, W = 14, C = 2 * Math.PI * R;
    let off = 0;
    const arcs = parts.map((p, i) => {
      const len = (p.v / total) * C, gap = parts.length > 1 ? Math.min(2, len / 3) : 0;
      const a = `<circle class="dpt-arc" data-i="${i}" r="${R}" cx="64" cy="64" fill="none" stroke="${p.c}" stroke-width="${W}" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 64 64)"/>`;
      off += len;
      return a;
    }).join('');
    return `<div class="dpt-donut"><svg viewBox="0 0 128 128" width="128" height="128" aria-hidden="true"><circle r="${R}" cx="64" cy="64" fill="none" stroke="#2a2a2a" stroke-width="${W}"/>${arcs}</svg>
      <div class="dpt-dc"><b>${eur(total, 0)}</b><span>Depotwert</span></div></div>`;
  }

  /* ---------- Reiter: Übersicht ---------- */
  function overview(d, st) {
    const pos = d.positions || [];
    const parts = [...pos.filter((p) => p.value > 0).map((p, i) => ({ n: p.name, v: p.value, c: colorOf(i) })), ...(d.cash > 0 ? [{ n: 'Bargeld', v: d.cash, c: CASH }] : [])];
    const total = parts.reduce((s, p) => s + p.v, 0) || 1;
    return `<div class="dpt-hero">
        <div class="dpt-value">${eur(d.value)}</div>
        <div class="dpt-chg ${tone(d.gainEur)}">${signed(d.gainEur)} <span>${signed(d.gainPct, ' %')}</span></div>
        <span class="dpt-since">seit Start (50.000 €)${d.vsDax != null ? ` · <em class="${tone(d.vsDax)}">${signed(d.vsDax, ' %-Pkt.')}</em> ggü. DAX` : ''}</span>
      </div>
      ${d.history?.length > 1 ? `<div class="dpt-chart">
        <div class="dpt-ranges" role="tablist">${[['1W', 'Woche'], ['1M', 'Monat'], ['ALL', 'Gesamt']].map(([k, l]) => `<button type="button" data-range="${k}" class="${st.range === k ? 'on' : ''}">${l}</button>`).join('')}
          ${d.bench ? '<span class="dpt-leg"><i class="me"></i>Depot<i class="dax"></i>DAX</span>' : ''}</div>
        <div class="dpt-plot"><div class="dpt-tip" hidden></div></div></div>` : ''}
      <div class="dpt-tiles">
        ${tile('Bargeld', eur(d.cash), d.value ? `${nf((d.cash / d.value) * 100, 1)} % frei` : '', CASH)}
        ${tile('Investiert', eur(d.invested), `${pos.length} ${pos.length === 1 ? 'Position' : 'Positionen'}`, '#6d9fff')}
        ${tile('Gewinn / Verlust', signed(d.gainEur), signed(d.gainPct, ' %'), d.gainEur >= 0 ? UP : DOWN, ` ${tone(d.gainEur)}`)}
      </div>
      <div class="dpt-alloc">
        ${donut(parts, total)}
        <div class="dpt-legend">${parts.map((p, i) => `<div class="dpt-li" data-i="${i}"><i style="background:${p.c}"></i><span>${esc(p.n)}</span><b>${nf((p.v / total) * 100, 1)} %</b><small>${eur(p.v, 0)}</small></div>`).join('')}</div>
      </div>`;
  }

  /* ---------- Reiter: Positionen ---------- */
  function positions(d, st) {
    const pos = d.positions || [];
    if (!pos.length) return '<div class="dpt-msg"><span>Noch keine Aktien im Depot – alles liegt als Bargeld bereit.</span></div>';
    const order = { verkaufen: 0, beobachten: 1, teilgewinn: 2, nachkaufen: 3, halten: 4 };
    const counts = Object.keys(ACTION).map((a) => [a, pos.filter((p) => (p.action || 'halten') === a).length]).filter(([, n]) => n);
    return `<div class="dpt-sum">${counts.sort((a, b) => order[a[0]] - order[b[0]]).map(([a, n]) => `${badge(a)}<span class="dpt-n">${n}</span>`).join('')}</div>
      <div class="dpt-rows">${pos.map((p, i) => ({ p, i })).sort((a, b) => (order[a.p.action || 'halten'] - order[b.p.action || 'halten']) || (b.p.value || 0) - (a.p.value || 0)).map(({ p, i }) => {
        const open = st.open === p.isin;
        return `<div class="dpt-pos${open ? ' open' : ''}" style="--c:${colorOf(i)}">
          <button type="button" class="dpt-ph" data-pos="${esc(p.isin)}" aria-expanded="${open}">
            <span class="dpt-pn"><b>${esc(p.name)}</b><small>${nf(p.qty, p.qty % 1 ? 2 : 0)} Stk · Ø ${eur(p.buyPrice)}</small></span>
            ${spark(p.spark)}
            <span class="dpt-pv"><b>${eur(p.value)}</b><small class="${tone(p.gainEur)}">${signed(p.gainEur)} · ${signed(p.gainPct, ' %', 1)}</small></span>
            ${p.action ? badge(p.action) : ''}
            <span class="dpt-chev">${fi('chevron-down', 12)}</span>
          </button>
          <div class="dpt-pd">
            <div class="dpt-kv">
              <span><i>Kurs im Spiel</i>${eur(p.price)}</span><span><i>Kaufkurs</i>${eur(p.buyPrice)}</span>${p.stop ? `<span><i>Stopp</i><em class="down">${eur(p.stop)}</em></span>` : ''}
              ${p.day != null ? `<span><i>Heute</i><em class="${tone(p.day)}">${signed(p.day, ' %')}</em></span>` : ''}${p.week != null ? `<span><i>Woche</i><em class="${tone(p.week)}">${signed(p.week, ' %')}</em></span>` : ''}
              <span><i>Anteil</i>${p.weightPct != null ? `${nf(p.weightPct, 1)} %` : '–'}</span>${p.bought ? `<span><i>Gekauft</i>${day(p.bought)}</span>` : ''}
            </div>
            ${p.weightPct != null ? `<div class="dpt-wbar"><span style="width:${Math.min(100, p.weightPct * 5)}%"></span><i title="20-%-Grenze"></i></div>` : ''}
            ${p.why ? `<p class="dpt-why">${esc(p.why)}</p>` : ''}
            <button type="button" class="dpt-link" data-ask="${esc(`Schau dir meine Position ${p.name}${p.symbol ? ` (${p.symbol})` : ''} an: behalten, beobachten oder verkaufen?`)}">Mit dem Bären besprechen ${fi('chevron-right', 11)}</button>
          </div>
        </div>`;
      }).join('')}</div>`;
  }

  /* ---------- Reiter: Performance ---------- */
  function performance(d) {
    const pos = d.positions || [];
    const max = Math.max(1, ...pos.map((p) => Math.abs(p.gainEur || 0)));
    const s = d.status || {};
    const buys = d.buys ?? 0, need = s.minBuys || 3;
    const orders = [...(d.events || [])].filter((e) => e.kind === 'BUY' || e.kind === 'SELL').reverse().slice(0, 8);
    return `<div class="dpt-tiles four">
        ${tile('Gesamt', signed(d.gainEur), signed(d.gainPct, ' %'), d.gainEur >= 0 ? UP : DOWN, ` ${tone(d.gainEur)}`)}
        ${tile('Offene Positionen', signed(d.unrealized), 'noch nicht verkauft', d.unrealized >= 0 ? UP : DOWN, ` ${tone(d.unrealized)}`)}
        ${tile('Realisiert', signed(d.realized), 'aus Verkäufen', d.realized >= 0 ? UP : DOWN, ` ${tone(d.realized)}`)}
        ${tile('Gebühren', eur(d.feesPaid), `${d.trades ?? orders.length} Orders`, '#fb9a52')}
      </div>
      ${d.daxPct != null ? `<div class="dpt-vs"><div><span>Dein Depot</span><b class="${tone(d.gainPct)}">${signed(d.gainPct, ' %')}</b></div><div><span>DAX im selben Zeitraum</span><b class="${tone(d.daxPct)}">${signed(d.daxPct, ' %')}</b></div>
        <p>${d.vsDax >= 0 ? `Du liegst <b class="up">${nf(d.vsDax, 2)} Prozentpunkte vor</b> dem DAX.` : `Du liegst <b class="down">${nf(-d.vsDax, 2)} Prozentpunkte hinter</b> dem DAX.`}</p></div>` : ''}
      ${pos.length ? `<h4 class="dpt-h">Gewinn je Position</h4><div class="dpt-bars">${[...pos].sort((a, b) => (b.gainEur || 0) - (a.gainEur || 0)).map((p) => {
        const w = (Math.abs(p.gainEur || 0) / max) * 50;
        return `<div class="dpt-bar-row"><span class="dpt-bn">${esc(p.name)}</span><span class="dpt-track"><i class="${tone(p.gainEur)}" style="${(p.gainEur || 0) >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`}"></i></span><b class="${tone(p.gainEur)}">${signed(p.gainEur)}</b></div>`;
      }).join('')}</div>` : ''}
      <h4 class="dpt-h">Planspiel</h4>
      <div class="dpt-rules">
        <div><span>Pflicht-Käufe</span><b>${Math.min(buys, need)} von ${need}</b><div class="dpt-prog"><i style="width:${Math.min(100, (buys / need) * 100)}%" class="${buys >= need ? 'ok' : ''}"></i></div></div>
        ${s.daysLeft != null ? `<div><span>Spielende</span><b>noch ${s.daysLeft} Tage</b><small>bis ${String(s.end || '').split('-').reverse().join('.')}</small></div>` : ''}
        ${d.greenGainEur != null ? `<div><span>Nachhaltig</span><b class="${tone(d.greenGainEur)}">${signed(d.greenGainEur)}</b><small>Nachhaltigkeits-Wertung</small></div>` : ''}
      </div>
      ${orders.length ? `<h4 class="dpt-h">Letzte Orders</h4><div class="dpt-orders">${orders.map((e) => `<div class="dpt-or"><span class="dpt-ok ${e.kind === 'BUY' ? 'buy' : 'sell'}">${e.kind === 'BUY' ? 'Kauf' : 'Verkauf'}</span>
          <span class="dpt-on"><b>${esc(e.name)}</b><small>${day(e.date.slice(0, 10))} · ${nf(e.qty, e.qty % 1 ? 2 : 0)} × ${eur(e.px)}</small></span>
          <span class="dpt-oa">${e.kind === 'SELL' && e.gain != null ? `<b class="${tone(e.gain)}">${signed(e.gain)}</b>` : `<b>${eur(Math.abs(e.amount))}</b>`}<small>Gebühr ${eur(e.fee)}</small></span></div>`).join('')}</div>` : ''}`;
  }

  /* ---------- Wertverlauf: Fläche, Startlinie, DAX gestrichelt, Fadenkreuz ---------- */
  function drawChart(fig, d, st) {
    const plot = fig.querySelector('.dpt-plot'); if (!plot || !d.history?.length) return;
    const all = d.history.map((h, i) => ({ ...h, b: d.bench?.[i] ?? null }));
    const n = st.range === '1W' ? 6 : st.range === '1M' ? 22 : all.length;
    const pts = all.slice(-Math.max(2, n));
    const W = Math.max(280, plot.clientWidth || 600), H = 150, P = { l: 4, r: 54, t: 10, b: 20 };
    const vals = pts.flatMap((p) => [p.v, p.b]).filter((x) => x != null);
    const start = d.start || 50000;
    let lo = Math.min(...vals, start), hi = Math.max(...vals, start);
    const pad = (hi - lo || hi * 0.01) * 0.15; lo -= pad; hi += pad;
    const x = (i) => P.l + (i / (pts.length - 1)) * (W - P.l - P.r), y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const up = pts.at(-1).v >= pts[0].v, col = up ? UP : DOWN;
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const bench = d.bench ? pts.map((p, i) => (p.b == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.b).toFixed(1)}`)).join('') : '';
    const ticks = [hi - pad, (hi + lo) / 2, lo + pad].map((v) => `<text x="${W - P.r + 6}" y="${y(v) + 4}" class="dpt-ax">${nf(v / 1000, 1)}k</text>`).join('');
    const labels = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map((i, k) => `<text x="${x(i)}" y="${H - 4}" class="dpt-ax" text-anchor="${k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}">${day(pts[i].d)}</text>`).join('');
    const gid = `dg${Math.random().toString(36).slice(2, 7)}`;
    plot.querySelector('svg')?.remove();
    plot.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-label="Wertverlauf des Depots">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <line x1="${P.l}" x2="${W - P.r}" y1="${y(start)}" y2="${y(start)}" class="dpt-start"/>
      <path d="${line}L${x(pts.length - 1)},${H - P.b}L${x(0)},${H - P.b}Z" fill="url(#${gid})"/>
      ${bench ? `<path d="${bench}" class="dpt-bench"/>` : ''}
      <path d="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(pts.length - 1)}" cy="${y(pts.at(-1).v)}" r="3.5" fill="${col}"/>
      ${ticks}${labels}
      <g class="dpt-cross" visibility="hidden"><line class="dpt-cl" y1="${P.t}" y2="${H - P.b}"/><circle r="4" fill="${col}" stroke="#212121" stroke-width="2"/></g></svg>`);
    const svg = plot.querySelector('svg'), cross = svg.querySelector('.dpt-cross'), tip = plot.querySelector('.dpt-tip');
    const move = (cx) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(((cx - r.left) / r.width * W - P.l) / (W - P.l - P.r) * (pts.length - 1))));
      const p = pts[i];
      cross.setAttribute('visibility', 'visible');
      cross.querySelector('line').setAttribute('x1', x(i)); cross.querySelector('line').setAttribute('x2', x(i));
      cross.querySelector('circle').setAttribute('cx', x(i)); cross.querySelector('circle').setAttribute('cy', y(p.v));
      const g = p.v - start;
      tip.innerHTML = `<span>${day(p.d)}</span><b>${eur(p.v)}</b><em class="${tone(g)}">${signed(g)} · ${signed((g / start) * 100, ' %')}</em>${p.b != null ? `<small>DAX ${signed(((p.b / start) - 1) * 100, ' %')}</small>` : ''}`;
      tip.hidden = false;
      tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, Math.max(4, (x(i) / W) * r.width - tip.offsetWidth / 2))}px`;
    };
    const leave = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    svg.addEventListener('pointermove', (e) => move(e.clientX));
    svg.addEventListener('pointerleave', leave);
  }

  /* ---------- Karte ---------- */
  function figure() {
    const fig = document.createElement('figure');
    fig.className = 'dpt';
    const bear = window.PixelDogs?.svg ? window.PixelDogs.svg('boerse', 24) : '';
    const TABS = [['over', 'Übersicht'], ['pos', 'Positionen'], ['perf', 'Performance']];
    fig.innerHTML = `<div class="dpt-head"><span class="dpt-av">${bear}</span><span class="dpt-title"><strong>Dein Depot</strong><span class="dpt-sub">Planspiel Börse</span></span>
        <button type="button" class="dpt-refresh" data-dpt="reload" title="Jetzt aktualisieren">${fi('refresh', 12)}<span>…</span></button></div>
      <div class="dpt-tabs" role="tablist">${TABS.map(([k, l], i) => `<button type="button" role="tab" data-tab="${k}"${i ? '' : ' class="on" aria-selected="true"'}>${l}</button>`).join('')}<span class="dpt-tabs-bg"></span></div>
      <div class="dpt-body"><div class="dpt-skel"><span></span><span></span><span></span></div></div>`;
    const st = { tab: 'over', range: 'ALL', open: null, d: null };
    const host = fig.querySelector('.dpt-body'), sub = fig.querySelector('.dpt-sub'), stamp = fig.querySelector('.dpt-refresh span');
    const paint = () => {
      const d = st.d; if (!d) return;
      fig.querySelectorAll('.dpt-tabs [data-tab]').forEach((b, i) => { const on = b.dataset.tab === st.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); if (on) fig.querySelector('.dpt-tabs').style.setProperty('--i', i); });
      if (!d.connected) {
        fig.classList.add('bare');
        host.innerHTML = '<div class="dpt-msg"><span>Dein Depot ist noch nicht mit dem Planspiel Börse verbunden.</span><button type="button" class="dpt-btn" data-dpt="settings">Verbinden</button></div>';
        return;
      }
      if (d.error) { fig.classList.add('bare'); host.innerHTML = `<div class="dpt-msg err"><span>${esc(d.error)}</span><button type="button" class="dpt-btn" data-dpt="reload">Nochmal</button></div>`; return; }
      fig.classList.remove('bare');
      sub.textContent = `Planspiel Börse · ${d.name || 'Wettbewerbsdepot'}`;
      stamp.textContent = clock(d.asOf || Date.now());
      host.innerHTML = `<div class="dpt-pane">${st.tab === 'pos' ? positions(d, st) : st.tab === 'perf' ? performance(d) : overview(d, st)}</div>`;
      if (st.tab === 'over') requestAnimationFrame(() => drawChart(fig, d, st));
    };
    const draw = async (fresh) => {
      fig.classList.add('busy');
      st.d = await load(fresh);
      fig.classList.remove('busy');
      paint();
    };
    // Bedienung: Reiter, Zeitraum, Position aufklappen, Ring/Legende hervorheben, Bär fragen
    fig.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]'); if (t) { st.tab = t.dataset.tab; paint(); return; }
      const r = e.target.closest('[data-range]'); if (r) { st.range = r.dataset.range; fig.querySelectorAll('.dpt-ranges [data-range]').forEach((b) => b.classList.toggle('on', b === r)); drawChart(fig, st.d, st); return; }
      const p = e.target.closest('[data-pos]'); if (p) { st.open = st.open === p.dataset.pos ? null : p.dataset.pos; const row = p.parentElement; fig.querySelectorAll('.dpt-pos.open').forEach((x) => { if (x !== row) { x.classList.remove('open'); x.querySelector('[data-pos]').setAttribute('aria-expanded', 'false'); } }); row.classList.toggle('open', st.open === p.dataset.pos); p.setAttribute('aria-expanded', String(st.open === p.dataset.pos)); return; }
      const a = e.target.closest('[data-ask]');
      if (a) {
        const input = document.getElementById('input'), form = document.getElementById('composer');
        if (input && form) { input.value = a.dataset.ask; input.dispatchEvent(new Event('input', { bubbles: true })); form.requestSubmit?.(); }
        return;
      }
      const b = e.target.closest('[data-dpt]'); if (!b) return;
      if (b.dataset.dpt === 'reload') draw(true);
      if (b.dataset.dpt === 'settings') window.Settings?.open('agents');
    });
    const hl = (i) => {
      fig.querySelectorAll('.dpt-arc').forEach((c) => c.classList.toggle('dim', i != null && c.dataset.i !== i));
      fig.querySelectorAll('.dpt-li').forEach((c) => c.classList.toggle('dim', i != null && c.dataset.i !== i));
      const dc = fig.querySelector('.dpt-dc'); if (!dc || !st.d) return;
      const li = i != null ? fig.querySelector(`.dpt-li[data-i="${i}"]`) : null;
      dc.innerHTML = li ? `<b>${li.querySelector('b').textContent}</b><span>${esc(li.querySelector('span').textContent)}</span>` : `<b>${eur(st.d.value, 0)}</b><span>Depotwert</span>`;
    };
    fig.addEventListener('pointerover', (e) => { const t = e.target.closest('.dpt-arc, .dpt-li'); hl(t ? t.dataset.i : null); });
    fig.addEventListener('pointerleave', () => hl(null));
    // schon geladen (die Antwort wird beim Schreiben neu gezeichnet) → sofort zeigen, ohne Ladebalken
    if (memo?.d && Date.now() - memo.t < 30000) { st.d = memo.d; paint(); } else draw(false);
    // jede Minute neu, solange die Karte zu sehen ist; Breite ändert sich → Graph neu
    const timer = setInterval(() => { if (!fig.isConnected) { clearInterval(timer); return; } if (!document.hidden) draw(true); }, 60000);
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (st.tab === 'over' && st.d?.history) drawChart(fig, st.d, st); }).observe(fig);
    return fig;
  }
  return { figure };
})();
window.DepotCard = DepotCard;
