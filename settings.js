/* ---------- Einstellungen ----------
   Zahnrad oben in der Sidebar neben der Lupe → die Sidebar wird zur Einstellungs-Leiste („‹ Zurück“, Allgemein, Agenten),
   der Hauptteil zeigt die gewählte Seite. Kein Fenster, sondern eine eigene Ansicht wie Chatverlauf oder Bibliothek.
   API-Keys, die hier eingetragen werden, stehen im Browser (localStorage) und damit auch im Konto (auth.js überträgt sie);
   sie gehen bei jeder Anfrage an /api im Kopf „X-App-Keys“ mit; der Server nimmt sie statt der Werte aus .env (siehe readEnv in server.js).
   Wird vor app.js geladen, damit schon die ersten Anfragen die Schlüssel mitschicken. */
(() => {
  const KEYS_KEY = 'settings.keys.v1', NAME_KEY = 'settings.name.v1', PAGE_KEY = 'settings.page.v1';
  // Logos: #b-… in index.html (offizielle Marken)
  const PROVIDERS = [
    { id: 'GEMINI_API_KEY', name: 'Google Gemini', logo: 'gemini', where: 'aistudio.google.com' },
    { id: 'OPENROUTER_API_KEY', name: 'OpenRouter', logo: 'openrouter', where: 'openrouter.ai/keys' },
    { id: 'NVIDIA_API_KEY', name: 'NVIDIA', logo: 'nvidia', where: 'build.nvidia.com' },
    { id: 'FLUX3_API_KEY', name: 'FLUX', logo: 'flux', where: 'build.nvidia.com' },
    { id: 'SPOTIFY_CLIENT_ID', name: 'Spotify', logo: 'spotify', where: 'developer.spotify.com', label: 'Client-ID' },
  ];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (name, size = 16) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#f-${name}"/></svg>`;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  /* ---------- Schlüssel vom Gerät an jede /api-Anfrage hängen ---------- */
  let deviceKeys = read(KEYS_KEY, {});
  const keyHeader = () => {
    const list = Object.entries(deviceKeys).filter(([, v]) => v);
    return list.length ? btoa(unescape(encodeURIComponent(JSON.stringify(Object.fromEntries(list))))) : '';
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const h = keyHeader();
    if (!h || !/^\/api\//.test(url.replace(location.origin, ''))) return nativeFetch(input, init);
    const headers = new Headers(init.headers || (typeof input === 'string' ? undefined : input.headers));
    headers.set('X-App-Keys', h);
    return nativeFetch(input, { ...init, headers });
  };

  /* ---------- Name oben in der Sidebar ---------- */
  const nameOf = () => read(NAME_KEY, '') || 'Julian';
  const applyName = () => document.querySelectorAll('.sb-ws-name').forEach((n) => { n.textContent = nameOf(); });
  applyName();

  /* ---------- Aufbau ---------- */
  const app = document.getElementById('app');
  const inner = document.querySelector('.sidebar-inner');
  const panel = document.querySelector('.panel');
  const PAGES = { general: 'Allgemein', look: 'Aussehen', agents: 'Agenten' };
  let page = PAGES[read(PAGE_KEY, 'agents')] ? read(PAGE_KEY, 'agents') : 'agents';
  // Kacheln im Hintergrund des neuen Chats: Stufen statt Regler (Wert = Deckkraft in %)
  const TILES = [['Aus', 0], ['Leicht', 18], ['Mittel', 33], ['Stark', 60]];
  let fileKeys = {}; // Schlüssel, die in .env stehen (nur ja/nein vom Server)
  let editing = null; // Anbieter, dessen Schlüssel gerade eingegeben wird
  // Planspiel Börse: Zugang liegt verschlüsselt im Konto auf dem Server (lib/planspiel.js) – hier nur „verbunden als …“
  let planspiel = { connected: false, loaded: false }, psBusy = false, psError = '';

  const side = document.createElement('nav');
  side.className = 'nav st-side';
  side.setAttribute('aria-label', 'Einstellungen');
  side.innerHTML = `<button type="button" class="st-back"><svg width="14" height="14"><use href="#o-chev"/></svg><span>Zurück</span></button>
    <a class="st-item" href="#" data-st="general"><svg width="15" height="15"><use href="#o-user"/></svg><span>Allgemein</span></a>
    <a class="st-item" href="#" data-st="look"><svg width="15" height="15"><use href="#o-look"/></svg><span>Aussehen</span></a>
    <a class="st-item" href="#" data-st="agents"><svg width="15" height="15"><use href="#o-agent"/></svg><span>Agenten</span></a>`;
  inner?.append(side);

  const view = document.createElement('section');
  view.className = 'st-view';
  view.setAttribute('aria-label', 'Einstellungen');
  panel?.append(view);

  const connected = (p) => (deviceKeys[p.id] ? 'device' : fileKeys[p.id] ? 'env' : '');
  const logo = (p) => `<svg class="st-logo" width="20" height="20" aria-hidden="true"><use href="#b-${p.logo}"/></svg>`;

  function drawSide() {
    side.querySelectorAll('[data-st]').forEach((a) => a.classList.toggle('active', a.dataset.st === page));
  }

  // Anbieter: Logo, Name; rechts „✓ Verbunden“ (Klick → ändern) bzw. heller Knopf „Verbinden“.
  // Eingabe direkt in der Zeile: Feld (grau) + Abbrechen + Speichern; ein auf dem Gerät gespeicherter Schlüssel lässt sich trennen.
  function providerRow(p) {
    const how = connected(p);
    if (editing === p.id) {
      const what = p.label || 'API-Key';
      return `<form class="st-row editing" data-key="${p.id}" autocomplete="off">${logo(p)}<span class="st-name">${esc(p.name)}</span>
        <input class="st-field st-key-in" type="password" placeholder="${esc(what)} von ${esc(p.where)} einfügen" aria-label="${esc(what)} für ${esc(p.name)}" spellcheck="false" />
        ${deviceKeys[p.id] ? '<button type="button" class="st-btn dark danger" data-remove>Trennen</button>' : ''}<button type="button" class="st-btn dark" data-cancel>Abbrechen</button><button type="submit" class="st-btn light">Speichern</button></form>`;
    }
    const right = how
      ? `<button type="button" class="st-ok" data-edit="${p.id}" title="${how === 'env' ? 'Schlüssel aus .env – Klick zum Ändern' : 'Schlüssel auf diesem Gerät – Klick zum Ändern'}">${fi('check', 12)}Verbunden</button>`
      : `<button type="button" class="st-btn light" data-edit="${p.id}">Verbinden</button>`;
    return `<div class="st-row">${logo(p)}<span class="st-name">${esc(p.name)}</span><span class="grow"></span>${right}</div>`;
  }

  // Planspiel Börse: Bär als Logo; verbunden → „✓ Verbunden als …“ (Klick → ändern/trennen), sonst „Verbinden“.
  // Eingabe in der Zeile: Benutzername + Passwort/Code; gespeichert wird nur auf dem Server, verschlüsselt im Konto.
  function planspielRow() {
    const bear = `<span class="st-dog">${window.PixelDogs?.svg('boerse', 24) || ''}</span>`;
    if (editing === 'planspiel') {
      return `<form class="st-row editing st-ps" data-ps autocomplete="off">${bear}<span class="st-name">Planspiel Börse</span>
        <input class="st-field st-ps-user" name="user" placeholder="Benutzername" aria-label="Benutzername für Planspiel Börse" spellcheck="false" autocapitalize="off" value="${esc(planspiel.user || '')}" maxlength="80" />
        <input class="st-field st-ps-code" name="code" type="password" placeholder="Passwort / Code" aria-label="Passwort oder Code für Planspiel Börse" maxlength="200" />
        ${planspiel.connected ? '<button type="button" class="st-btn dark danger" data-ps-remove>Trennen</button>' : ''}<button type="button" class="st-btn dark" data-cancel>Abbrechen</button><button type="submit" class="st-btn light"${psBusy ? ' disabled' : ''}>${psBusy ? 'Speichern …' : 'Speichern'}</button></form>
        ${psError ? `<div class="st-row st-ps-note err">${esc(psError)}</div>` : ''}`;
    }
    const right = !planspiel.loaded ? '<span class="st-muted">…</span>'
      : planspiel.connected ? `<button type="button" class="st-ok" data-edit="planspiel" title="Klick zum Ändern oder Trennen">${fi('check', 12)}Verbunden als ${esc(planspiel.user)}</button>`
      : '<button type="button" class="st-btn light" data-edit="planspiel">Verbinden</button>';
    return `<div class="st-row">${bear}<span class="st-name">Planspiel Börse</span><span class="grow"></span>${right}</div>`;
  }
  async function loadPlanspiel() {
    try { const r = await (await nativeFetch('/api/planspiel')).json(); planspiel = { ...r, loaded: true }; } catch { planspiel = { connected: false, loaded: true }; }
    if (app.classList.contains('settings-open') && page === 'agents' && editing !== 'planspiel') drawView();
  }

  function agentRow(m) {
    const dogs = window.PixelDogs;
    const off = dogs?.UNAVAILABLE?.has(m.id);
    let cur = 'general';
    try { cur = localStorage.getItem('dogMode') || 'general'; } catch {}
    const right = off ? '<span class="st-muted">Nicht verfügbar</span>'
      : cur === m.id ? `<span class="st-ok">${fi('check', 12)}Aktiv</span>`
      : `<button type="button" class="st-btn dark" data-agent="${m.id}">Auswählen</button>`;
    return `<div class="st-row${off ? ' off' : ''}"><span class="st-dog">${dogs ? dogs.svg(m.id, 24) : ''}</span><span class="st-name">${esc(m.name)}</span><span class="grow"></span>${right}</div>`;
  }

  // Aussehen: Modus und Hintergrund als Umschalter (wie „Allow · Ask me · Block“ in der Vorlage), Akzent als runde Farben
  const seg = (attr, items, on) => `<span class="st-seg" role="radiogroup">${items.map(([label, val]) => `<button type="button" role="radio" aria-checked="${val === on}" class="${val === on ? 'on' : ''}" ${attr}="${val}">${esc(label)}</button>`).join('')}</span>`;
  function lookPage() {
    const ap = window.Appearance;
    if (!ap) return '';
    const cfg = ap.get();
    const accent = String(cfg.accent || '').toLowerCase();
    const custom = !ap.ACCENTS.includes(accent);
    const near = TILES.reduce((a, b) => (Math.abs(b[1] - cfg.tiles) < Math.abs(a[1] - cfg.tiles) ? b : a))[1];
    return `<h2>Aussehen</h2><div class="st-card">
        <div class="st-row"><span class="st-name">Modus</span><span class="grow"></span>${seg('data-ap-mode', Object.entries(ap.MODES).map(([id, label]) => [label, id]), cfg.mode)}</div>
        <div class="st-row"><span class="st-name">Akzentfarbe</span><span class="grow"></span><span class="st-swatches">${ap.ACCENTS.map((c) => `<button type="button" class="st-sw${c === accent ? ' on' : ''}" style="--sw:${c}" data-ap-accent="${c}" aria-label="Akzent ${c}"></button>`).join('')}`
        + `<label class="st-sw st-sw-own${custom ? ' on' : ''}" style="--sw:${custom ? accent : 'transparent'}" title="Eigene Farbe"><input type="color" value="${esc(accent || '#2f86ff')}" aria-label="Eigene Akzentfarbe" /></label></span></div></div>
      <h2>Neuer Chat</h2><div class="st-card">
        <div class="st-row"><span class="st-name">Hintergrund</span><span class="grow"></span>${seg('data-ap-tiles', TILES.map(([l, v]) => [l, String(v)]), String(near))}</div></div>`;
  }

  function drawView() {
    const title = PAGES[page];
    let body;
    if (page === 'general') {
      const onDevice = Object.values(deviceKeys).some(Boolean);
      const account = window.Auth?.user();
      body = `<h2>Profil</h2><div class="st-card">
          <div class="st-row"><span class="st-name">Name</span><span class="grow"></span><input class="st-field st-name-in" data-name maxlength="32" value="${esc(nameOf())}" aria-label="Name" /></div></div>
        ${account ? `<h2>Konto</h2><div class="st-card">
          <div class="st-row"><span class="st-name">${esc(account.email)}</span><span class="grow"></span><button type="button" class="st-btn dark" data-logout>Abmelden</button></div></div>` : ''}
        <h2>Daten</h2><div class="st-card">
          <div class="st-row"><span class="st-name">Chats und Dokumente</span><span class="grow"></span><span class="st-muted">Im Konto</span></div>
          <div class="st-row"><span class="st-name">Einstellungen und Aufgaben</span><span class="grow"></span><span class="st-muted">Im Konto</span></div>
          <div class="st-row"><span class="st-name">API-Keys</span><span class="grow"></span><span class="st-muted">${onDevice ? 'Im Konto' : 'Aus .env'}</span></div></div>`;
    } else if (page === 'look') {
      body = lookPage();
    } else {
      const modes = window.PixelDogs?.MODES || [];
      body = `<h2>Verbindung</h2><div class="st-card">${PROVIDERS.map(providerRow).join('')}</div>`
        + `<h2>Planspiel Börse</h2><div class="st-card">${planspielRow()}</div>
          <p class="st-hint">Für den Börsen-Bären: Zugang zu deinem Depot beim Planspiel Börse. Wird verschlüsselt in deinem Konto gespeichert und nie angezeigt.</p>`
        + (modes.length ? `<h2>Agenten</h2><div class="st-card">${modes.map(agentRow).join('')}</div>` : '');
    }
    view.innerHTML = `<div class="st-top">${title}</div><div class="st-scroll"><div class="st-page">${body}</div></div>`;
    drawSide();
  }

  async function loadStatus() {
    try { fileKeys = (await (await nativeFetch('/api/status')).json()).env || {}; } catch {}
    if (app.classList.contains('settings-open')) drawView(); else drawSide();
  }

  function open(to) {
    if (to) page = to;
    editing = null;
    app.classList.add('settings-open');
    drawView();
    loadStatus();
    loadPlanspiel();
  }
  function close() {
    app.classList.remove('settings-open');
    editing = null;
  }

  /* ---------- Bedienung ---------- */
  document.getElementById('sbSettings')?.addEventListener('click', () => (app.classList.contains('settings-open') ? close() : open()));
  side.addEventListener('click', (e) => {
    if (e.target.closest('.st-back')) { close(); return; }
    const a = e.target.closest('[data-st]');
    if (!a) return;
    e.preventDefault();
    page = a.dataset.st; write(PAGE_KEY, page); editing = null; drawView();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.classList.contains('settings-open') && !e.target.closest?.('input')) close();
  });

  view.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { editing = editing === ed.dataset.edit ? null : ed.dataset.edit; psError = ''; drawView(); view.querySelector('.st-key-in, .st-ps-user')?.focus(); return; }
    if (e.target.closest('[data-cancel]')) { editing = null; psError = ''; drawView(); return; }
    if (e.target.closest('[data-ps-remove]')) {
      nativeFetch('/api/planspiel', { method: 'DELETE' }).then((r) => r.json()).then((r) => { planspiel = { ...r, loaded: true }; editing = null; drawView(); }).catch(() => {});
      return;
    }
    if (e.target.closest('[data-remove]')) {
      delete deviceKeys[editing]; write(KEYS_KEY, deviceKeys); editing = null; drawView(); return;
    }
    const md = e.target.closest('[data-ap-mode]');
    if (md) { window.Appearance?.set({ mode: md.dataset.apMode }); drawView(); return; }
    const ac = e.target.closest('[data-ap-accent]');
    if (ac) { window.Appearance?.set({ accent: ac.dataset.apAccent }); drawView(); return; }
    const tl = e.target.closest('[data-ap-tiles]');
    if (tl) { window.Appearance?.set({ tiles: Number(tl.dataset.apTiles) }); drawView(); return; }
    const lo = e.target.closest('[data-logout]');
    if (lo) { lo.disabled = true; lo.textContent = 'Abmelden …'; window.Auth?.logout(); return; }
    const ag = e.target.closest('[data-agent]');
    if (ag) { window.PixelDogs?.select(ag.dataset.agent); setTimeout(drawView, 50); }
  });
  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ps = e.target.closest('form[data-ps]');
    if (ps) {
      const user = ps.querySelector('.st-ps-user').value.trim(), code = ps.querySelector('.st-ps-code').value;
      if (!user) { ps.querySelector('.st-ps-user').focus(); return; }
      if (!code) { ps.querySelector('.st-ps-code').focus(); return; }
      psBusy = true; psError = ''; drawView();
      try {
        const r = await nativeFetch('/api/planspiel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, code }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Konnte nicht gespeichert werden.');
        planspiel = { ...j, loaded: true }; editing = null;
      } catch (err) { psError = err.message; }
      psBusy = false; drawView();
      if (psError) view.querySelector('.st-ps-user')?.focus();
      return;
    }
    const form = e.target.closest('form[data-key]');
    const v = form?.querySelector('.st-key-in').value.trim();
    if (!form || !v) { form?.querySelector('.st-key-in').focus(); return; }
    deviceKeys[form.dataset.key] = v.slice(0, 400);
    write(KEYS_KEY, deviceKeys);
    editing = null;
    drawView();
  });
  view.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editing) { e.stopPropagation(); editing = null; drawView(); }
  });
  view.addEventListener('input', (e) => {
    if (e.target.matches('.st-sw-own input')) { // eigene Akzentfarbe live, ohne neu zu zeichnen (der Farbwähler bliebe sonst nicht offen)
      window.Appearance?.set({ accent: e.target.value });
      const own = e.target.parentElement;
      own.style.setProperty('--sw', e.target.value);
      view.querySelectorAll('.st-sw').forEach((b) => b.classList.toggle('on', b === own));
      return;
    }
    if (!e.target.matches('[data-name]')) return;
    write(NAME_KEY, e.target.value.trim());
    applyName();
  });
  document.addEventListener('dogmodechange', () => { if (app.classList.contains('settings-open') && page === 'agents') drawView(); });
  window.addEventListener('chat-tab-switched', () => close()); // anderer Chat/Bereich geöffnet → Einstellungen zu

  loadStatus();
  window.Settings = { open, close };
})();
