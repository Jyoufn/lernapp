/* ===================================================================
   Inbox (Seitenleiste „Inbox“): links Kopf, Suche und alle Nachrichten (Absender-Bild, ungelesen mit blauem Punkt),
   rechts die gewählte Nachricht als abgesetzte Karte (Absender, Zeit, Löschen in der Absenderzeile). Gespeichert im Browser.
   In der Seitenleiste mit Zahl der ungelesenen Nachrichten.
   Absender ist NUR der Börsen-Bär (andere Absender werden nicht angenommen):
   - kind 'boerse-digest': Tages-Überblick des Chancen-Radars – Fazit (kaufen / abwarten) und alle Kandidaten in einer Liste
   - kind 'boerse': einzelne große Chance (nur, wenn im Lauf des Tages eine starke neue dazukommt)
   =================================================================== */
const Inbox = (() => {
  const KEY = 'inbox.messages';
  const SENDER = 'Börsen-Bär';
  const esc = (s) => escapeHtml(String(s ?? ''));
  const fi = (n, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  // nur Nachrichten des Bären; alte Einzelmeldungen des Radars (vor dem Tages-Überblick) fallen weg
  const keep = (m) => m && m.from === SENDER && (m.kind === 'boerse-digest' || (m.kind === 'boerse' && String(m.key || '').startsWith('boerse|alert|')));
  const load = () => { try { const l = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(l) ? l.filter(keep) : null; } catch { return null; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(messages.slice(0, 200))); } catch {} badge(); };
  const nf = (x, d = 2) => (x == null || isNaN(x) ? '–' : (+x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const eur = (x) => (x == null || isNaN(x) ? '–' : `${nf(x)} €`);
  const crvOf = (d) => (d?.entry && d.stop && d.target && d.entry > d.stop ? (d.target - d.entry) / (d.entry - d.stop) : null);
  // Zahl der ungelesenen Nachrichten an „Inbox“ in der Seitenleiste
  function badge() {
    const el = document.querySelector('.sidebar [data-nav="inbox"] .nav-badge'); if (!el) return;
    const n = messages.filter((m) => !m.read).length;
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = !n;
  }

  let messages = load() || [];
  try { if (messages.length !== (JSON.parse(localStorage.getItem(KEY) || '[]') || []).length) setTimeout(save, 0); } catch {} // Aufgeräumtes gleich speichern
  let current = messages[0]?.id || null;
  let open = false;
  let query = '';

  const when = (t) => {
    const d = new Date(t);
    const today = new Date().toDateString() === d.toDateString();
    return today ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  };
  // Absender-Bild: der Bär (Pixel-Hund mit Sonnenbrille)
  const avatar = (big = false) => (window.PixelDogs?.svg
    ? `<span class="ib-av ib-av-dog${big ? ' big' : ''}" aria-hidden="true">${window.PixelDogs.svg('boerse', big ? 24 : 20)}</span>`
    : `<span class="ib-av${big ? ' big' : ''}" style="--av:var(--accent)" aria-hidden="true">B</span>`);
  const snippetOf = (m) => {
    if (m.kind === 'boerse-digest' && m.data) {
      const n = m.data.picks?.length || 0, buy = (m.data.picks || []).filter((p) => p.verdict === 'kaufen').length;
      return n ? `${buy ? `${buy} kaufen · ` : ''}${n - buy} beobachten · Markt ${m.data.mood || 'neutral'}` : `Keine Chance erfüllt alle Bedingungen · Markt ${m.data.mood || 'neutral'}`;
    }
    if (m.kind === 'boerse' && m.data) return `${m.data.type} · ${eur(m.data.price)}`;
    return String(m.text || '').replace(/\s+/g, ' ').slice(0, 90);
  };
  const tone = (m) => (m.data?.verdict === 'kaufen' || (m.kind === 'boerse-digest' && (m.data?.picks || []).some((p) => p.verdict === 'kaufen')) ? 'buy' : 'wait');

  const view = document.createElement('section');
  view.className = 'ib-view';
  view.hidden = true;
  view.innerHTML = `<div class="ib-side">
      <header class="ib-head"><h2>Inbox</h2></header>
      <label class="ib-search">${fi('search', 13)}<input type="search" placeholder="Nachrichten durchsuchen" aria-label="Nachrichten durchsuchen" /></label>
      <div class="ib-list" role="listbox" aria-label="Nachrichten"></div>
    </div>
    <article class="ib-read"></article>`;
  const listEl = view.querySelector('.ib-list');
  const readEl = view.querySelector('.ib-read');
  const search = view.querySelector('.ib-search input');

  function render() {
    const list = messages.filter((m) => !query || `${m.from} ${m.subject} ${m.text} ${snippetOf(m)}`.toLowerCase().includes(query));
    listEl.innerHTML = list.length ? list.map((m) => `<button type="button" class="ib-item${m.id === current ? ' on' : ''}${m.read ? '' : ' unread'}" data-id="${m.id}" role="option" aria-selected="${m.id === current}">
          ${avatar(false)}
          <span class="ib-item-text">
            <span class="ib-item-top"><span class="ib-title">${esc(m.subject)}</span><span class="ib-time">${when(m.time)}</span></span>
            <span class="ib-snippet"><i class="ib-dot ${tone(m)}" aria-hidden="true"></i>${esc(snippetOf(m))}</span>
          </span>
        </button>`).join('') : `<div class="ib-empty">${query ? 'Keine Nachricht gefunden' : 'Noch keine Nachrichten.<br>Der Börsen-Bär meldet sich hier mit dem Überblick zur Börsenzeit.'}</div>`;
    const m = messages.find((x) => x.id === current);
    readEl.innerHTML = m
      ? `<div class="ib-read-in">
          <div class="ib-meta">${avatar(true)}<span class="ib-meta-text"><b>${esc(m.from)}</b><span>${new Date(m.time).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} Uhr</span></span>
            <button type="button" class="ib-act" data-ib="del" aria-label="Nachricht löschen" title="Löschen">${fi('trash')}</button></div>
          <h1>${esc(m.subject)}</h1>
          ${m.kind === 'boerse-digest' && m.data ? digestCard(m) : m.kind === 'boerse' && m.data ? stockCard(m) : `<div class="ib-body">${esc(m.text).replace(/\n/g, '<br>')}</div>`}</div>`
      : `<div class="ib-none">${fi('inbox', 22)}<span>${messages.length ? 'Wähle links eine Nachricht aus' : 'Alles erledigt – keine Nachrichten'}</span></div>`;
  }

  // Fazit oben: farbiges Etikett + ein Satz, was zu tun ist
  const verdictBox = (buy, text) => `<div class="ib-verdict ${buy ? 'buy' : 'wait'}"><span class="ib-vtag">${buy ? 'Kaufen' : 'Abwarten'}</span><span>${esc(text)}</span></div>`;
  const askBtn = (q, label = 'Mit dem Bären besprechen') => `<button type="button" class="ib-ask" data-ib="ask" data-q="${esc(q)}">${window.PixelDogs?.svg('boerse', 20) || ''}<span>${label}</span></button>`;
  const NOTE = '<p class="ib-note">Signale aus dem Chancen-Radar (Algorithmus) – Wahrscheinlichkeiten, keine Garantie.</p>';

  // Tages-Überblick: alle Kandidaten in einer Liste, Kaufen zuerst
  function digestCard(m) {
    const d = m.data, picks = d.picks || [];
    const buys = picks.filter((p) => p.verdict === 'kaufen');
    const summary = buys.length
      ? `${buys.map((p) => p.name).join(', ')} ${buys.length === 1 ? 'erfüllt' : 'erfüllen'} alle Bedingungen – Einstieg, Stopp und Ziel stehen unten.`
      : picks.length ? 'Keine Chance ist stark genug für einen Kauf jetzt. Die Werte unten im Blick behalten.' : 'Gerade erfüllt kein Wert alle Bedingungen – heute nichts überstürzen.';
    const row = (p) => {
      const crv = crvOf(p);
      return `<div class="ib-pick ${p.verdict === 'kaufen' ? 'buy' : 'wait'}">
          <div class="ib-pick-top"><span class="ib-pick-name"><b>${esc(p.name)}</b><small>${esc(p.type)}${p.sector ? ` · ${esc(p.sector)}` : ''}</small></span>
            <span class="ib-badge ${p.verdict === 'kaufen' ? 'buy' : 'wait'}">${p.verdict === 'kaufen' ? 'Kaufen' : 'Beobachten'}</span></div>
          <div class="ib-pick-nums"><span><i>Kurs</i>${eur(p.price)}</span><span><i>Einstieg</i>${eur(p.entry)}</span><span><i>Stopp</i><em class="neg">${eur(p.stop)}</em></span><span><i>Ziel</i><em class="pos">${eur(p.target)}</em></span>${crv ? `<span><i>Chance : Risiko</i>${nf(crv, 1)} : 1</span>` : ''}${p.hit ? `<span><i>Treffer</i>${p.hit}</span>` : ''}</div>
          ${p.reason ? `<p class="ib-pick-why">${esc(p.reason)}</p>` : ''}
          <button type="button" class="ib-link" data-ib="ask" data-q="${esc(p.ask)}">Mit dem Bären besprechen ${fi('chevron-right', 11)}</button>
        </div>`;
    };
    return `<div class="ib-stock">
        ${verdictBox(buys.length > 0, summary)}
        ${d.moodText ? `<p class="ib-mood"><b>Markt:</b> ${esc(d.moodText)}</p>` : ''}
        ${picks.length ? `<div class="ib-picks">${[...buys, ...picks.filter((p) => p.verdict !== 'kaufen')].map(row).join('')}</div>` : ''}
        ${askBtn(d.ask || 'Gib mir einen Überblick über die heutigen Chancen aus dem Chancen-Radar – welche soll ich kaufen?')}
        ${NOTE}
      </div>`;
  }

  // einzelne große Chance als Karte: Fazit, Zahlen-Raster, Begründung, Schlagzeilen, Aktion
  function stockCard(m) {
    const d = m.data;
    const cell = (k, v, cls = '') => `<div class="ib-k${cls}"><span>${k}</span><b>${v}</b></div>`;
    const crv = crvOf(d);
    return `<div class="ib-stock">
        ${verdictBox(d.verdict === 'kaufen', d.verdict === 'kaufen' ? `${d.name} jetzt kaufen – Einstieg um ${eur(d.entry)}, Stop-Loss ${eur(d.stop)}.` : `${d.name} beobachten – noch kein klarer Einstieg.`)}
        <div class="ib-stock-head"><span class="ib-tag">${esc(d.type)}</span><span class="ib-sym">${esc(d.symbol)}</span></div>
        <div class="ib-grid">${cell('Kurs', eur(d.price))}${cell('Einstieg', eur(d.entry))}${cell('Stop-Loss', eur(d.stop), ' neg')}${cell('Ziel', eur(d.target), ' pos')}
          ${crv ? cell('Chance : Risiko', `${nf(crv, 1)} : 1`) : ''}${d.history?.cases ? cell('Trefferquote', `${d.history.winRate} % <small>(${d.history.cases})</small>`) : ''}</div>
        ${m.text ? `<p class="ib-why">${esc(m.text)}</p>` : ''}
        ${d.news?.length ? `<div class="ib-news"><span class="ib-news-h">Nachrichten</span>${d.news.map((n) => `<a ${n.url ? `href="${esc(n.url)}" target="_blank" rel="noopener"` : ''}>${esc(n.title)}${n.source ? ` <i>${esc(n.source)}</i>` : ''}</a>`).join('')}</div>` : ''}
        ${d.ask ? askBtn(d.ask) : ''}
        ${NOTE}
      </div>`;
  }

  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('.ib-item'); if (!b) return;
    current = b.dataset.id;
    const m = messages.find((x) => x.id === current);
    if (m && !m.read) { m.read = true; save(); }
    render();
  });
  // Löschen: erster Klick färbt rot, zweiter löscht – danach die nächste Nachricht
  readEl.addEventListener('click', (e) => {
    const ask = e.target.closest('[data-ib="ask"]');
    if (ask) { if (ask.dataset.q) document.dispatchEvent(new CustomEvent('inbox:ask', { detail: ask.dataset.q })); return; }
    const b = e.target.closest('[data-ib="del"]'); if (!b) return;
    if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.title = 'Nochmal klicken zum Löschen'; setTimeout(() => b.classList.remove('confirm'), 2500); return; }
    const i = messages.findIndex((x) => x.id === current);
    messages.splice(i, 1);
    current = (messages[i] || messages[i - 1])?.id || null;
    const next = messages.find((x) => x.id === current);
    if (next) next.read = true;
    save();
    render();
  });
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); render(); });
  search.addEventListener('keydown', (e) => e.stopPropagation());

  /* Neue Nachricht: Inbox.add({ subject, text, kind, data, key, quiet })
     – nur vom Börsen-Bären; gleiche key → ersetzt die alte. quiet: nur den Inhalt auffrischen (Platz und gelesen bleiben). */
  function add({ from = SENDER, subject = '', text = '', kind = '', data = null, key = '', quiet = false }) {
    if (from !== SENDER) return null;
    const i = key ? messages.findIndex((x) => x.key === key) : -1;
    if (i >= 0 && quiet) {
      Object.assign(messages[i], { subject, text, ...(kind ? { kind, data } : {}) });
      save(); if (open) render();
      return messages[i];
    }
    if (i >= 0) messages.splice(i, 1);
    const m = { id: `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, from, subject, text, time: Date.now(), read: false, ...(kind ? { kind, data } : {}), ...(key ? { key } : {}) };
    messages.unshift(m);
    if (!current || !messages.some((x) => x.id === current)) current = m.id;
    save();
    if (open) render();
    return m;
  }

  /* ---------- Öffnen / Schließen (die Tabs oben steuern das, siehe app.js → openViewTab) ---------- */
  function show() {
    const panel = document.querySelector('.panel');
    if (panel && !view.isConnected) panel.append(view);
    open = true;
    const m = messages.find((x) => x.id === current);
    if (m && !m.read) { m.read = true; save(); }
    render();
    view.hidden = false;
    panel?.classList.add('view-inbox');
  }
  function hide() {
    if (!open) return;
    open = false;
    view.hidden = true;
    document.querySelector('.panel')?.classList.remove('view-inbox');
  }

  // Konto-Abgleich (auth.js) kann die Nachrichten ersetzen → neu laden
  window.addEventListener('storage', (e) => { if (e.key === KEY) { messages = load() || []; badge(); if (open) render(); } });
  setTimeout(badge, 0);

  return { show, hide, add, has: (key) => messages.some((m) => m.key === key), get unread() { return messages.filter((m) => !m.read).length; }, get open() { return open; } };
})();
window.Inbox = Inbox;
