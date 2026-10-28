/* ===================================================================
   Inbox (Seitenleiste „Inbox“): links Kopf, Suche und alle Nachrichten (Absender-Kreis, ungelesen mit blauem Punkt),
   rechts die gewählte Nachricht mit Absender, Zeit und Löschen. Gespeichert im Browser.
   =================================================================== */
const Inbox = (() => {
  const KEY = 'inbox.messages';
  const esc = (s) => escapeHtml(String(s ?? ''));
  const fi = (n, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(messages)); } catch {} };

  // Erste Nachricht, solange noch nichts da ist
  let messages = load() || [{
    id: 'm-start', from: 'Agenten', subject: 'Willkommen in deiner Inbox',
    text: 'Hier sammeln sich Nachrichten der App – zum Beispiel Erinnerungen an Termine und Aufgaben.\n\nLinks siehst du alle Nachrichten, rechts die, die du gerade geöffnet hast.',
    time: Date.now(), read: false,
  }];
  let current = messages[0]?.id || null;
  let open = false;
  let query = '';

  const when = (t) => {
    const d = new Date(t);
    const today = new Date().toDateString() === d.toDateString();
    return today ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  };
  // Absender als Kreis mit Anfangsbuchstaben – Farbe fest je Name; Nachrichten der App im Akzent
  const avatar = (name, big = false) => {
    const n = String(name || '?');
    const hue = [...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    const style = n === 'Agenten' ? '--av:var(--accent)' : `--av:hsl(${hue} 55% 62%)`;
    return `<span class="ib-av${big ? ' big' : ''}" style="${style}" aria-hidden="true">${esc(n.trim()[0]?.toUpperCase() || '?')}</span>`;
  };

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
    const list = messages.filter((m) => !query || `${m.from} ${m.subject} ${m.text}`.toLowerCase().includes(query));
    listEl.innerHTML = list.length ? list.map((m) => `<button type="button" class="ib-item${m.id === current ? ' on' : ''}${m.read ? '' : ' unread'}" data-id="${m.id}" role="option" aria-selected="${m.id === current}">
          ${avatar(m.from)}
          <span class="ib-item-text">
            <span class="ib-item-top"><span class="ib-from">${esc(m.from)}</span><span class="ib-time">${when(m.time)}</span></span>
            <span class="ib-subject">${esc(m.subject)}</span>
            <span class="ib-snippet">${esc(m.text.replace(/\s+/g, ' ').slice(0, 90))}</span>
          </span>
        </button>`).join('') : `<div class="ib-empty">${query ? 'Keine Nachricht gefunden' : 'Keine Nachrichten'}</div>`;
    const m = messages.find((x) => x.id === current);
    readEl.innerHTML = m
      ? `<div class="ib-read-in">
          <div class="ib-read-bar"><span class="flex-spacer"></span><button type="button" class="ib-act" data-ib="del" aria-label="Nachricht löschen" title="Löschen">${fi('trash')}</button></div>
          <h1>${esc(m.subject)}</h1>
          <div class="ib-meta">${avatar(m.from, true)}<span class="ib-meta-text"><b>${esc(m.from)}</b><span>${new Date(m.time).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</span></span></div>
          <div class="ib-body">${esc(m.text).replace(/\n/g, '<br>')}</div></div>`
      : `<div class="ib-none">${fi('inbox', 22)}<span>${messages.length ? 'Wähle links eine Nachricht aus' : 'Alles erledigt – keine Nachrichten'}</span></div>`;
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

  /* Neue Nachricht von anderen Teilen der App: Inbox.add({ from, subject, text }) */
  function add({ from = 'Agenten', subject = '', text = '' }) {
    const m = { id: `m-${Date.now().toString(36)}`, from, subject, text, time: Date.now(), read: false };
    messages.unshift(m);
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

  return { show, hide, add, get open() { return open; } };
})();
window.Inbox = Inbox;
