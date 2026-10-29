/* ===================================================================
   „Meine Käufe“ beim Börsen-Bären (ohne Zugriff aufs Planspiel – nur, was der Nutzer im Chat erzählt):
   - Block ```bestand im Chat → Karte: je Kauf Stück, Kaufkurs, aktueller Kurs, Plus/Minus (€ und %), Empfehlung
     (Verkaufen · Beobachten · Behalten · Nachkaufen · Teilgewinn); Klick klappt Grund und Stopp auf. Daten von /api/boerse/bestand (reine Rechnung).
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
    const items = [...(d.items || [])].sort((a, b) => (ORDER[a.action] ?? 5) - (ORDER[b.action] ?? 5) || (b.value || 0) - (a.value || 0));
    if (!items.length) return '<div class="st-row bst-none"><span class="bst-muted">Noch nichts hinzugefügt.</span></div>';
    return items.map((x) => `<div class="bst-row${open === x.symbol ? ' open' : ''}">
        <button type="button" class="st-row bst-line" data-sym="${esc(x.symbol)}" aria-expanded="${open === x.symbol}">
          <span class="bst-n"><b>${esc(x.name)}</b><small>${nf(x.qty, x.qty % 1 ? 2 : 0)} Stk · gekauft zu ${eur(x.buyPrice)} · ${day(x.date)}</small></span>
          <span class="grow"></span>
          <span class="bst-p ${tone(x.plus)}"><b>${signed(x.plus)}</b><small>${signed(x.plusPct, ' %')}</small></span>
          <span class="bst-act${x.action === 'verkaufen' ? ' strong' : ''}">${ACT_TEXT[x.action] || '–'}</span>
        </button>
        <div class="bst-d"><div class="bst-d-in">
          ${x.why ? `<p>${esc(x.why)}</p>` : ''}
          <p class="bst-meta">Kurs jetzt ${eur(x.price)}${x.stop ? ` · Stopp ${eur(x.stop)}` : ''} · nach Gebühren ${signed(x.netPlus)}${x.error ? ` · ${esc(x.error)}` : ''}</p>
          <div class="bst-acts"><button type="button" class="st-btn dark" data-ask="${esc(`Schau dir meine Position ${x.name} (${x.symbol}) an: verkaufen, behalten oder beobachten?`)}">Mit dem Bären besprechen</button>
            <button type="button" class="st-btn dark" data-del="${esc(x.symbol)}">Entfernen</button></div>
        </div></div>
      </div>`).join('');
  }
  // Hinzufügen: Aktie (Suche), Zeitpunkt, Stückzahl – Kaufkurs optional (sonst Kurs zu diesem Zeitpunkt)
  const form = () => `<form class="bst-add" autocomplete="off">
      <div class="bst-f wide"><label>Aktie</label><input class="st-field" name="q" placeholder="Name, Kürzel oder ISIN" spellcheck="false" /><div class="bst-sug" hidden></div></div>
      <div class="bst-f"><label>Gekauft am</label><input class="st-field" name="at" type="datetime-local" value="${nowLocal()}" max="${nowLocal()}" /></div>
      <div class="bst-f small"><label>Stück</label><input class="st-field" name="qty" type="number" min="0" step="any" inputmode="decimal" placeholder="z. B. 40" /></div>
      <div class="bst-f small"><label>Kaufkurs</label><input class="st-field" name="price" type="number" min="0" step="any" inputmode="decimal" placeholder="automatisch" /></div>
      <div class="bst-f-btns"><span class="bst-err"></span><button type="button" class="st-btn dark" data-cancel>Abbrechen</button><button type="submit" class="st-btn light">Hinzufügen</button></div>
    </form>`;
  function figure() {
    const fig = document.createElement('figure');
    fig.className = 'bst';
    fig.innerHTML = `<div class="bst-top"><h3>Meine Käufe</h3><span class="grow"></span>
        <button type="button" class="bst-icon" data-reload title="Aktualisieren" aria-label="Aktualisieren"><svg width="16" height="16" aria-hidden="true"><use href="#i-refresh"/></svg></button>
        <button type="button" class="st-btn dark" data-add>Hinzufügen</button></div>
      <p class="bst-sub">wird geladen …</p>
      <div class="st-card bst-card"><div class="bst-form" hidden></div><div class="bst-rows"></div></div>`;
    const st = { open: null, d: null, pick: null };
    const sub = fig.querySelector('.bst-sub'), list = fig.querySelector('.bst-rows'), fbox = fig.querySelector('.bst-form');
    const paint = () => {
      const d = st.d; if (!d) return;
      const pct = d.invested ? (d.plus / d.invested) * 100 : null;
      sub.innerHTML = d.error ? 'Gerade nicht erreichbar.' : (d.items || []).length
        ? `Investiert ${eur(d.invested)} · Wert ${eur(d.value)} · <span class="${tone(d.plus)}">${signed(d.plus)}${pct != null ? ` (${signed(pct, ' %')})` : ''}</span>`
        : 'Füge hinzu, was du gekauft hast – der Bär sagt dir dann, was du damit machen solltest.';
      list.innerHTML = rows(d, st.open);
    };
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
      const at = f.at.value ? new Date(f.at.value).toISOString() : new Date().toISOString();
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
        return;
      }
      const a = e.target.closest('[data-ask]'); if (a) { ask(a.dataset.ask); return; }
      const del = e.target.closest('[data-del]');
      if (del) {
        if (!del.classList.contains('danger')) { del.classList.add('danger'); del.textContent = 'Wirklich entfernen?'; setTimeout(() => { del.classList.remove('danger'); del.textContent = 'Entfernen'; }, 2500); return; }
        st.d = await fetch(`/api/boerse/bestand?symbol=${encodeURIComponent(del.dataset.del)}`, { method: 'DELETE' }).then((r) => r.json()).catch(() => st.d);
        memo = null; st.open = null; paint();
        return;
      }
      if (e.target.closest('[data-reload]')) draw(true);
    });
    draw(false);
    const iv = setInterval(() => { if (!fig.isConnected) { clearInterval(iv); return; } if (!document.hidden && fbox.hidden) draw(true); }, 120000);
    return fig;
  }

  /* ---------- Bestätigung ```merken ---------- */
  function note(raw) {
    let c = {};
    try { c = JSON.parse(String(raw || '').trim() || '{}'); } catch {}
    const parts = [
      ...(c.add || []).map((x) => `${nf(x.qty, x.qty % 1 ? 2 : 0)} × ${esc(x.name || x.symbol)} zu ${eur(x.price)}${x.date ? ` (${day(x.date)})` : ''}`),
      ...(c.sell || []).map((x) => `verkauft: ${x.qty ? `${nf(x.qty, x.qty % 1 ? 2 : 0)} × ` : ''}${esc(x.name || x.symbol)}`),
      ...(c.remove || []).map((x) => `entfernt: ${esc(x.symbol || x)}`),
    ];
    const el = document.createElement('div');
    el.className = 'bst-note';
    el.innerHTML = parts.length ? `${fi('check-circle', 13)}<span>Notiert: ${parts.join(' · ')}</span>` : '';
    if (!parts.length) el.hidden = true;
    return el;
  }

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
