/* ===================================================================
   „Meine Käufe“ beim Börsen-Bären (ohne Zugriff aufs Planspiel – nur, was der Nutzer im Chat erzählt):
   - Block ```bestand im Chat → Karte: je Kauf Stück, Kaufkurs, aktueller Kurs, Plus/Minus (€ und %), Empfehlung
     (Verkaufen · Beobachten · Behalten · Nachkaufen · Teilgewinn); Klick klappt den Aktienchart auf – Kaufkurs, Kauftag, Stopp
     und „Seit Kauf ±…“ stehen IM Chart (kein Text, keine Knöpfe). Verkauft/geändert wird per Chat beim Bären.
     Daten von /api/boerse/bestand (reine Rechnung).
   - Block ```merken im Chat → kleine Bestätigung „Notiert: 40 × SAP zu 231,00 €“
   - Hinweise: zur Börsenzeit alle 20 min still nachsehen; ändert sich bei EIGENEN Werten etwas Wichtiges (Verkaufen lohnt sich, Teilgewinn,
     genau beobachten), ploppt EINMAL eine kleine Karte oben rechts auf – sie wird nirgends gespeichert und verschwindet von selbst.
   Gestaltung wie der Chancen-Radar: eine graue Fläche, innen nur feine Ränder, Farbe nur als Bedeutung.
   =================================================================== */
const BoerseBestand = (() => {
  const ORDER = { verkaufen: 0, teilgewinn: 1, beobachten: 2, nachkaufen: 3, halten: 4 };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const eur = (x) => (x == null ? '–' : `${nf(x)} €`);
  const signed = (x, unit = ' €') => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${nf(Math.abs(x))}${unit}`);
  const tone = (x) => (x == null || Math.abs(x) < 1e-9 ? '' : x > 0 ? 'up' : 'down');
  const day = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) : '');
  const fi = (n, s = 12) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const bear = (s = 20) => window.PixelDogs?.svg ? window.PixelDogs.svg('boerse', s) : '';

  let memo = null;
  function load(fresh = false) {
    if (!fresh && memo && Date.now() - memo.t < 60000) return memo.p;
    memo = { t: Date.now(), p: fetch(`/api/boerse/bestand${fresh ? '?fresh=1' : ''}`).then((r) => r.json()).catch(() => ({ items: [], error: true })) };
    return memo.p;
  }
  const ask = (q) => {
    const input = document.getElementById('input'), form = document.getElementById('composer');
    if (!input || !form) return;
    input.value = q; input.dispatchEvent(new Event('input', { bubbles: true })); form.requestSubmit?.();
  };

  /* ---------- Karte ```bestand – im Stil der Einstellungen: Überschrift, darunter eine schlichte Karte mit Zeilen ---------- */
  const ACT_TEXT = { verkaufen: 'Verkaufen', teilgewinn: 'Teilgewinn', beobachten: 'Beobachten', halten: 'Behalten', nachkaufen: 'Nachkaufen' };
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  function rows(d, open) {
    // nach Gewinn sortiert: meistes Plus oben, größtes Minus unten (offen und verkauft je für sich; ohne Kurs ganz unten)
    const byPlus = (a, b) => (b.plus ?? -Infinity) - (a.plus ?? -Infinity);
    const items = [...(d.items || [])].sort(byPlus);
    const sold = [...(d.sold || [])].sort(byPlus); // Verkauftes bleibt fest: Kauf- und Verkaufskurs, kein Live-Kurs
    if (!items.length && !sold.length) return '<div class="bst-none">Noch keine Käufe.</div>';
    const soldRows = sold.length ? `<div class="bst-sec">Verkauft</div>${sold.map((x) => `<div class="bst-row sold"><div class="bst-line static">
          <span class="bst-n"><b>${esc(x.name)}</b><small>${nf(x.qty, x.qty % 1 ? 2 : 0)} Stk · ${x.noBuy ? 'Kauf fehlt noch' : eur(x.buyPrice)} → ${eur(x.sellPrice)} · ${day(x.date)}</small></span>
          <span class="bst-grow"></span>
          <span class="bst-p ${tone(x.plus)}"><b>${signed(x.plus)}</b><small>${signed(x.plusPct, ' %')}</small></span>
          <span class="bst-act muted">Verkauft</span></div></div>`).join('')}` : '';
    if (!items.length) return `<div class="bst-none">Gerade keine offenen Positionen.</div>${soldRows}`;
    return items.map((x) => `<div class="bst-row${open === x.symbol ? ' open' : ''}">
        <button type="button" class="bst-line" data-sym="${esc(x.symbol)}" aria-expanded="${open === x.symbol}">
          <span class="bst-n"><b>${esc(x.name)}</b><small>${nf(x.qty, x.qty % 1 ? 2 : 0)} Stk · gekauft zu ${eur(x.buyPrice)} · ${day(x.date)}</small></span>
          <span class="bst-grow"></span>
          <span class="bst-p ${tone(x.plus)}"><b>${signed(x.plus)}</b><small>${signed(x.plusPct, ' %')}</small></span>
          <span class="bst-act${x.action === 'verkaufen' ? ' strong' : ''}">${ACT_TEXT[x.action] || '–'}</span>
        </button>
        <div class="bst-d"><div class="bst-d-in"><div class="bst-chart" data-chart="${esc(x.symbol)}"></div></div></div>
      </div>`).join('') + soldRows;
  }
  // Hinzufügen: je Angabe eine Zeile wie in den Einstellungen – Aktie (Suche), Datum, Uhrzeit, Stück; Kaufkurs optional (sonst Kurs zu diesem Zeitpunkt)
  const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const timeNow = () => new Date().toTimeString().slice(0, 5);
  const form = () => `<form class="bst-add" autocomplete="off">
      <div class="bst-fr"><span class="bst-fl">Aktie</span><div class="bst-fi"><input class="st-field" name="q" placeholder="Name, Kürzel oder ISIN" spellcheck="false" /><div class="bst-sug" hidden></div></div></div>
      <div class="bst-fr"><span class="bst-fl">Gekauft am</span><div class="bst-fi two"><input class="st-field" name="day" type="date" value="${todayIso()}" max="${todayIso()}" /><input class="st-field" name="time" type="time" value="${timeNow()}" /></div></div>
      <div class="bst-fr"><span class="bst-fl">Stück</span><div class="bst-fi"><input class="st-field" name="qty" type="number" min="0" step="any" inputmode="decimal" placeholder="z. B. 40" /></div></div>
      <div class="bst-fr"><span class="bst-fl">Kaufkurs</span><div class="bst-fi"><input class="st-field" name="price" type="number" min="0" step="any" inputmode="decimal" placeholder="leer lassen – wird zum Zeitpunkt ermittelt" /></div></div>
      <div class="bst-fr end"><span class="bst-err"></span><button type="button" class="st-btn dark" data-cancel>Abbrechen</button><button type="submit" class="st-btn light">Hinzufügen</button></div>
    </form>`;
  function figure() {
    const fig = document.createElement('figure');
    fig.className = 'bst';
    window.enterOnce?.(fig);
    fig.innerHTML = `<div class="bst-top"><span class="bst-title"><b>Mein Depot</b><span class="bst-sub"></span></span>
        <button type="button" class="bst-icon" data-reload title="Aktualisieren" aria-label="Aktualisieren"><svg width="16" height="16" aria-hidden="true"><use href="#i-refresh"/></svg></button>
        <button type="button" class="st-btn dark bst-addbtn" data-add>Hinzufügen</button></div>
      <div class="bst-stats" hidden></div><div class="bst-form" hidden></div><div class="bst-rows"></div>`;
    const st = { open: null, d: null, pick: null };
    const sub = fig.querySelector('.bst-sub'), list = fig.querySelector('.bst-rows'), fbox = fig.querySelector('.bst-form'), stats = fig.querySelector('.bst-stats');
    const paint = () => {
      const d = st.d; if (!d) return;
      const pct = d.invested ? (d.plus / d.invested) * 100 : null;
      const dp = d.depot;
      sub.innerHTML = d.error ? 'Gerade nicht erreichbar' : '';
      // Kennzahlen als Abschnitte nebeneinander (wie Einstieg/Stopp/Ziel bei den Chancen): Etikett klein, darunter die Zahl groß in Weiß
      const cell = (label, value, extra = '') => `<span class="bst-stat"><i>${label}</i><span class="bst-stat-v"><b>${value}</b>${extra ? `<small>${extra}</small>` : ''}</span></span>`; // Prozent rechts neben der Zahl
      const cells = d.error ? [] : dp ? [cell('Depotwert', eur(dp.value)), cell('Bargeld', eur(dp.cash)), cell('Seit Start', `<span class="${tone(dp.perf)}">${signed(dp.perf)}</span>`, `<span class="${tone(dp.perf)}">${signed(dp.perfPct, ' %')}</span>`)]
        : (d.items || []).length ? [cell('Investiert', eur(d.invested)), cell('Wert', eur(d.value)), cell('Plus/Minus', `<span class="${tone(d.plus)}">${signed(d.plus)}</span>`, pct != null ? `<span class="${tone(d.plus)}">${signed(pct, ' %')}</span>` : '')] : [];
      stats.innerHTML = cells.join('');
      stats.hidden = !cells.length;
      list.innerHTML = rows(d, st.open);
      list.querySelectorAll('.bst-row').forEach((r, i) => window.enterOnce?.(r, { y: 6, delay: Math.min(i, 6) * 40, dur: 420 }));
      mountCharts();
    };
    // Charts der aufgeklappten Zeilen bleiben erhalten, wenn die Liste neu gezeichnet wird (alle 2 min) – kein Neuladen, kein Flackern
    const charts = new Map();
    const rangeFor = (date) => { const days = date ? (Date.now() - new Date(`${date}T12:00:00`)) / 86400000 : 999; return days <= 170 ? '6M' : '1J'; }; // wie bei den Chancen: 6 Monate (lädt verlässlich, Kauftag liegt drin)
    const mountCharts = () => fig.querySelectorAll('.bst-row.open [data-chart]').forEach((host) => {
      const sym = host.dataset.chart, x = (st.d?.items || []).find((i) => i.symbol === sym);
      if (!x || !window.StockChart) return;
      let c = charts.get(sym);
      if (!c) {
        c = StockChart.figure({ symbol: sym, name: x.name, range: rangeFor(x.date), pos: { buyPrice: x.buyPrice, qty: x.qty, date: x.date }, levels: x.stop ? [{ price: x.stop, label: 'Stopp', kind: 'stop' }] : [] });
        c.classList.add('bst-stk');
        charts.set(sym, c);
      }
      if (c.parentNode !== host) host.replaceChildren(c);
    });
    const draw = async (fresh) => {
      fig.classList.add('busy');
      const d = await load(fresh);
      fig.classList.remove('busy');
      if (st.d && JSON.stringify(st.d) === JSON.stringify(d)) return;
      st.d = d; paint();
    };
    const openForm = (on) => {
      fbox.hidden = !on; fig.querySelector('[data-add]').hidden = on;
      if (on) { fbox.innerHTML = form(); st.pick = null; setTimeout(() => fbox.querySelector('[name="q"]').focus(), 30); }
    };
    // Aktie suchen (Vorschläge wie ein Menü der App)
    let timer = 0;
    fig.addEventListener('input', (e) => {
      if (e.target.name !== 'q') return;
      st.pick = null;
      const q = e.target.value.trim(), box = fbox.querySelector('.bst-sug');
      clearTimeout(timer);
      if (q.length < 2) { box.hidden = true; return; }
      timer = setTimeout(async () => {
        const r = await fetch(`/api/boerse/search?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => []);
        box.innerHTML = (r || []).slice(0, 6).map((x) => `<button type="button" data-pick="${esc(x.symbol)}" data-name="${esc(x.name)}"><span>${esc(x.name)}</span><small>${esc(x.symbol)}${x.exchange ? ` · ${esc(x.exchange)}` : ''}</small></button>`).join('');
        box.hidden = !box.children.length;
      }, 250);
    });
    fig.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, err = f.querySelector('.bst-err');
      const qty = +f.qty.value, price = +f.price.value || null;
      if (!st.pick) { err.textContent = 'Bitte eine Aktie aus der Liste wählen.'; f.q.focus(); return; }
      if (!(qty > 0)) { err.textContent = 'Wie viele Stück?'; f.qty.focus(); return; }
      err.textContent = 'Wird hinzugefügt …';
      const at = f.day.value ? new Date(`${f.day.value}T${f.time.value || '12:00'}`).toISOString() : new Date().toISOString();
      const r = await fetch('/api/boerse/bestand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: st.pick.symbol, name: st.pick.name, qty, price, at }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = j.error || 'Hat nicht geklappt.'; return; }
      memo = null; st.d = j; openForm(false); paint();
    });
    fig.addEventListener('click', async (e) => {
      const pk = e.target.closest('[data-pick]');
      if (pk) { st.pick = { symbol: pk.dataset.pick, name: pk.dataset.name }; const q = fbox.querySelector('[name="q"]'); q.value = `${pk.dataset.name} (${pk.dataset.pick})`; fbox.querySelector('.bst-sug').hidden = true; fbox.querySelector('[name="qty"]').focus(); return; }
      if (e.target.closest('[data-add]')) { openForm(true); return; }
      if (e.target.closest('[data-cancel]')) { openForm(false); return; }
      const row = e.target.closest('[data-sym]');
      if (row) {
        st.open = st.open === row.dataset.sym ? null : row.dataset.sym;
        fig.querySelectorAll('.bst-row').forEach((r) => { const on = r.querySelector('[data-sym]').dataset.sym === st.open; r.classList.toggle('open', on); r.querySelector('[data-sym]').setAttribute('aria-expanded', String(on)); });
        mountCharts();
        return;
      }
      if (e.target.closest('[data-reload]')) draw(true);
    });
    draw(false);
    const iv = setInterval(() => { if (!fig.isConnected) { clearInterval(iv); return; } if (!document.hidden && fbox.hidden) draw(true); }, 120000);
    return fig;
  }

  /* ---------- ```merken: wird still im Hintergrund gespeichert (Server) – im Chat nichts anzeigen ---------- */
  function note() { const el = document.createElement('span'); el.hidden = true; return el; }

  /* ---------- Hinweise: einmal aufploppen, nur bei eigenen Werten ---------- */
  const SEEN = 'bestand.hinweise';
  const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN)) || {}; } catch { return {}; } };
  const remember = (m) => { try { localStorage.setItem(SEEN, JSON.stringify(m)); } catch {} };
  const TEXT = {
    verkaufen: (x) => [`${x.name}: Verkaufen lohnt sich`, `${signed(x.netPlus)} nach Gebühren – ${x.why || 'Gewinn sichern'}`],
    teilgewinn: (x) => [`${x.name}: Teilgewinn mitnehmen`, `${signed(x.netPlus)} nach Gebühren – ${x.why || 'einen Teil verkaufen'}`],
    beobachten: (x) => [`${x.name} beobachten`, x.why || `${signed(x.plusPct, ' %')} seit dem Kauf`],
  };
  let stack = null;
  function toast(x) {
    if (!stack) { stack = document.createElement('div'); stack.className = 'bst-toasts'; document.body.append(stack); }
    const [title, text] = TEXT[x.action](x);
    const t = document.createElement('div');
    t.className = 'bst-toast';
    t.setAttribute('role', 'status');
    t.innerHTML = `<span class="bst-av">${bear(20)}</span><span class="bst-tt"><b></b><span></span></span>
      <button type="button" class="bst-go">Ansehen</button><button type="button" class="bst-x" aria-label="Schließen"><svg width="12" height="12" aria-hidden="true"><use href="#i-x"/></svg></button>`;
    t.querySelector('b').textContent = title;
    t.querySelector('.bst-tt span').textContent = text;
    const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
    t.querySelector('.bst-x').addEventListener('click', close);
    t.querySelector('.bst-go').addEventListener('click', () => {
      close();
      window.PixelDogs?.select('boerse');
      document.querySelector('.sidebar [data-nav="new"]')?.click();
      setTimeout(() => ask(`Schau dir meine Position ${x.name} (${x.symbol}) an: ${x.action === 'beobachten' ? 'worauf muss ich achten?' : 'jetzt verkaufen?'}`), 520);
    });
    stack.append(t);
    setTimeout(close, 14000);
  }
  const tradingNow = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return !['Sat', 'Sun'].includes(p.weekday) && +p.hour >= 8 && +p.hour < 22;
  };
  let busy = false;
  async function check() {
    if (busy || document.hidden || !tradingNow() || !document.querySelector('.sidebar')) return;
    busy = true;
    try {
      const d = await load(true);
      const m = seen(), today = new Date().toISOString().slice(0, 10);
      // pro Wert nur, wenn sich die Empfehlung geändert hat (jede neue Empfehlung genau einmal)
      const fresh = (d.items || []).filter((x) => TEXT[x.action] && !(m[x.symbol] || '').startsWith(`${x.action}|`));
      fresh.slice(0, 3).forEach((x, i) => setTimeout(() => toast(x), i * 600));
      (d.items || []).forEach((x) => { if (x.action) m[x.symbol] = `${x.action}|${today}`; });
      remember(m);
    } catch {} finally { busy = false; }
  }
  setTimeout(check, 15000);
  setInterval(check, 20 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 3000); });

  return { figure, note, check, toast };
})();
window.BoerseBestand = BoerseBestand;
