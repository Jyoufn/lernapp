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
  // Kopf oben links: Name des aktiven Workspace (der erste heißt wie der Nutzer)
  const applyName = () => document.querySelectorAll('.sb-ws-name').forEach((n) => { n.textContent = window.Workspaces?.label?.() || nameOf(); });
  window.userName = nameOf;
  window.applyWorkspaceName = applyName;
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
        <div class="st-row st-modes-row"><span class="st-name">Modus</span><div class="ap-modes st-ap-modes">${Object.entries(ap.MODES).map(([id, label]) => { const pv = ap.PREVIEW?.[id] || {};
          return `<button type="button" class="ap-mode${id === cfg.mode ? ' on' : ''}" data-ap-mode="${id}" style="--pv-main:${pv.main};--pv-side:${pv.side};--pv-line:${pv.line};--pv-field:${pv.field}"><span class="ap-prev"><span class="pv-side"></span><span class="pv-body"><i></i><i></i><i class="acc"></i><i class="acc short"></i><b><em></em></b></span></span><span class="ap-mode-name">${esc(label)}</span></button>`; }).join('')}</div></div>
        <div class="st-row"><span class="st-name">Akzentfarbe</span><span class="grow"></span><span class="st-swatches">${ap.ACCENTS.map((c) => `<button type="button" class="st-sw${c === accent ? ' on' : ''}" style="--sw:${c}" data-ap-accent="${c}" aria-label="Akzent ${c}"></button>`).join('')}`
        + `<label class="st-sw st-sw-own${custom ? ' on' : ''}" style="--sw:${custom ? accent : 'transparent'}" title="Eigene Farbe"><input type="color" value="${esc(accent || '#2f86ff')}" aria-label="Eigene Akzentfarbe" /></label></span></div></div>
      <h2>Neuer Chat</h2><div class="st-card">
        <div class="st-row"><span class="st-name">Hintergrund</span><span class="grow"></span>${seg('data-ap-tiles', TILES.map(([l, v]) => [l, String(v)]), String(near))}</div></div>`;
  }

  function wsSection() {
    const W = window.Workspaces; if (!W) return '';
    const rows = W.list().map((w) => `<div class="st-row st-ws" data-ws-row="${w.id}" role="button" tabindex="0">
        <span class="st-ws-dog">${W.avatar(w.id, 24)}</span>
        <span class="st-name">${esc(W.nameOf(w.id))}</span>
        <span class="grow"></span>
        ${w.shared ? `<span class="st-ws-badge">${fi('people', 12)}${esc(W.sub(w.id).replace(/^Geteilt · /, ''))}</span>` : ''}
        <span class="st-ws-chev"><svg width="12" height="12" aria-hidden="true"><use href="#o-chev"/></svg></span>
      </div>`).join('');
    return `<h2>Workspaces</h2><div class="st-card st-ws-card">${rows}</div>`;
  }

  /* ---------- Workspace bearbeiten: großes Fenster (fast ganzer Bildschirm), aufgebaut wie die Einstellungen ----------
     Symbol (Pixel-Tiere oder eigenes Bild), Name, Teilen, Personen, Inhalte, Löschen/Verlassen */
  let wsm = null;
  function wsModal(id) {
    const W = window.Workspaces; if (!W?.get(id)) return;
    wsm?.close(true);
    const ov = document.createElement('div'); ov.className = 'st-wsm-ov';
    const st = { id, msg: null, del: false };
    const dogs = window.PixelDogs;
    const icons = [...(dogs?.MODES || []).map((m) => [m.id, m.name]).filter(([d]) => !dogs.UNAVAILABLE?.has(d)), ...Object.entries(dogs?.ANIMALS || {})];
    const count = () => {
      let chats = 0;
      document.querySelectorAll('#tabs .tab:not(.uil-tab):not([data-view])').forEach((t) => { try { const c = window.chatOf?.(t); if (c && (c.history || []).length && (c.ws || 'main') === id) chats++; } catch {} });
      const docs = (window.Docs?.docs || []).filter((d) => (d.ws || 'main') === id && (d.title || d.content)).length;
      return { chats, docs };
    };
    const draw = () => {
      const w = W.get(id); if (!w) { close(); return; }
      const own = !w.guest, n = count();
      const ppl = (w.members || []).map((m) => {
        const who = m.state === 'self' ? 'Du' : m.name || m.email || 'Mitglied';
        const tag = { owner: 'Besitzer', pending: 'Eingeladen', member: 'Mitglied', self: 'Mitglied' }[m.state] || '';
        const rm = own && m.email ? `<button type="button" class="st-btn dark st-wsm-rm" data-wsm-unshare="${esc(m.email)}">Entfernen</button>` : '';
        return `<div class="st-row"><span class="st-wsm-pav">${fi('user', 13)}</span><span class="st-name">${esc(who)}</span>${m.email && m.name ? `<span class="st-muted">${esc(m.email)}</span>` : ''}<span class="grow"></span><span class="st-ws-tag${m.state === 'pending' ? ' wait' : ''}">${tag}</span>${rm}</div>`;
      });
      if (own && ppl.length) ppl.unshift('<div class="st-row"><span class="st-wsm-pav">' + fi('user', 13) + '</span><span class="st-name">Du</span><span class="grow"></span><span class="st-ws-tag">Besitzer</span></div>');
      const shareBody = w.guest ? `<div class="st-row"><span class="st-muted">Geteilt von ${esc(w.from || 'jemandem')} – Chats und Dokumente sind für alle gleich.</span></div>`
        : id === 'main' ? '<div class="st-row"><span class="st-muted">Dein erster Workspace bleibt privat. Zum Teilen legst du oben links einen weiteren an.</span></div>'
        : `<form class="st-row st-wsm-share" data-wsm-share><input class="st-field" type="email" name="email" placeholder="E-Mail-Adresse" autocomplete="off" aria-label="E-Mail-Adresse" /><button type="submit" class="st-btn light">Einladen</button></form>
           ${st.msg ? `<div class="st-row"><span class="st-wsm-msg${st.msg.err ? ' err' : ''}">${esc(st.msg.text)}</span></div>` : ''}`;
      ov.innerHTML = `<div class="st-wsm" role="dialog" aria-label="Workspace bearbeiten">
        <div class="st-wsm-head"><span class="st-wsm-av">${W.avatar(id, 32)}</span>
          <input class="st-wsm-name" data-wsm-name maxlength="32" value="${esc(W.nameOf(id))}" aria-label="Name des Workspace" spellcheck="false" ${w.guest ? 'readonly' : ''} />
          <span class="grow"></span>${W.active() === id ? '<span class="st-muted">Geöffnet</span>' : '<button type="button" class="st-btn dark" data-wsm-open>Öffnen</button>'}</div>
        <div class="st-wsm-body">
          <h2>Symbol</h2><div class="st-card st-wsm-icons">
            ${icons.map(([d, name]) => `<button type="button" class="st-wsm-ic${!w.img && (w.dog || 'general') === d ? ' on' : ''}" data-wsm-dog="${d}" aria-label="${esc(name)}"${w.guest ? ' disabled' : ''}>${dogs.svg(d, 32)}<span>${esc(name)}</span></button>`).join('')}
            <button type="button" class="st-wsm-ic up${w.img ? ' on' : ''}" data-wsm-up>${w.img ? `<img src="${w.img}" alt="" width="32" height="32" />` : `<span class="st-wsm-upi">${fi('upload', 16)}</span>`}<span>${w.img ? 'Eigenes Bild' : 'Bild hochladen'}</span></button>
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden data-wsm-file />
          </div>
          ${w.img ? '<div class="st-wsm-under"><button type="button" class="st-link" data-wsm-noimg>Eigenes Bild entfernen</button></div>' : ''}
          <h2>Teilen</h2><div class="st-card">${shareBody}</div>
          ${ppl.length ? `<h2>Personen</h2><div class="st-card">${ppl.join('')}</div>` : ''}
          <h2>Inhalte</h2><div class="st-card">
            <div class="st-row"><span class="st-name">Chats</span><span class="grow"></span><span class="st-muted">${n.chats}</span></div>
            <div class="st-row"><span class="st-name">Dokumente</span><span class="grow"></span><span class="st-muted">${n.docs}</span></div>
            ${id !== 'main' && own ? '<div class="st-row"><span class="st-muted">Beim Löschen wandern Chats und Dokumente in deinen ersten Workspace – nichts geht verloren.</span></div>' : ''}</div>
          ${id === 'main' ? '' : `<h2>${w.guest ? 'Verlassen' : 'Löschen'}</h2><div class="st-card"><div class="st-row"><span class="st-name">${w.guest ? 'Workspace verlassen' : 'Workspace löschen'}</span><span class="grow"></span>
            <button type="button" class="st-btn danger${st.del ? ' sure' : ''}" data-wsm-del>${st.del ? (w.guest ? 'Wirklich verlassen?' : 'Wirklich löschen?') : (w.guest ? 'Verlassen' : 'Löschen')}</button></div></div>`}
        </div>
        <div class="st-wsm-foot"><span class="grow"></span><button type="button" class="st-btn light" data-wsm-done>Fertig</button></div></div>`;
    };
    // eigenes Bild: quadratisch zuschneiden, 128 px, JPEG (klein genug fürs Konto)
    const upload = (file) => {
      if (!file || !/^image\//.test(file.type)) return;
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const c = document.createElement('canvas'), S = 128, m = Math.min(img.width, img.height);
        c.width = c.height = S;
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
        URL.revokeObjectURL(url);
        W.setImg(id, c.toDataURL('image/jpeg', 0.86)); draw(); drawView();
      };
      img.src = url;
    };
    const rename = () => { const i = ov.querySelector('[data-wsm-name]'); if (i && !i.readOnly) { W.rename(id, i.value); drawView(); } };
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
    ov.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-wsm-done]')) { close(); return; }
      if (t.closest('[data-wsm-open]')) { W.set(id); draw(); return; }
      const dg = t.closest('[data-wsm-dog]'); if (dg && !dg.disabled) { W.setDog(id, dg.dataset.wsmDog); draw(); drawView(); return; }
      if (t.closest('[data-wsm-up]')) { ov.querySelector('[data-wsm-file]').click(); return; }
      if (t.closest('[data-wsm-noimg]')) { W.setImg(id, null); draw(); drawView(); return; }
      const un = t.closest('[data-wsm-unshare]'); if (un) { W.unshare(id, un.dataset.wsmUnshare).then(() => { draw(); drawView(); }, draw); return; }
      if (t.closest('[data-wsm-del]')) {
        if (!st.del) { st.del = true; draw(); return; }
        Promise.resolve(W.remove(id)).then(() => { close(); drawView(); }); return;
      }
    });
    ov.addEventListener('change', (e) => { if (e.target.matches('[data-wsm-file]')) upload(e.target.files?.[0]); if (e.target.matches('[data-wsm-name]')) rename(); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-wsm-name]')) { e.preventDefault(); e.target.blur(); } });
    ov.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target.closest('[data-wsm-share]'); if (!f) return;
      const inp = f.querySelector('input'), btn = f.querySelector('button');
      if (!inp.value.trim()) { inp.focus(); return; }
      btn.disabled = true; btn.textContent = 'Senden …';
      try { await W.share(id, inp.value.trim()); st.msg = { text: `Einladung an ${inp.value.trim()} gesendet.` }; } catch (err) { st.msg = { text: err.message, err: true }; }
      draw(); drawView();
    });
    const key = (e) => { if (e.key === 'Escape' && !e.target.matches?.('input')) { e.stopPropagation(); close(); } };
    function close(now) {
      document.removeEventListener('keydown', key, true);
      rename();
      if (now) { ov.remove(); return; }
      ov.classList.add('closing'); setTimeout(() => ov.remove(), 220);
      wsm = null;
    }
    document.addEventListener('keydown', key, true);
    draw(); document.body.append(ov);
    W.load().then(() => { if (ov.isConnected && !ov.querySelector('input:focus')) draw(); });
    wsm = { close };
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
        ${wsSection()}
        <h2>Daten</h2><div class="st-card">
          <div class="st-row"><span class="st-name">Chats und Dokumente</span><span class="grow"></span><span class="st-muted">Im Konto</span></div>
          <div class="st-row"><span class="st-name">Einstellungen und Aufgaben</span><span class="grow"></span><span class="st-muted">Im Konto</span></div>
          <div class="st-row"><span class="st-name">API-Keys</span><span class="grow"></span><span class="st-muted">${onDevice ? 'Im Konto' : 'Aus .env'}</span></div></div>`;
    } else if (page === 'look') {
      body = lookPage();
    } else {
      const modes = window.PixelDogs?.MODES || [];
      body = `<h2>Verbindung</h2><div class="st-card">${PROVIDERS.map(providerRow).join('')}</div>`
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
    // nur beim Öffnen: Abschnitte gleiten nacheinander herein (beim Neuzeichnen nach Klicks nicht)
    view.classList.add('st-enter'); clearTimeout(open.t); open.t = setTimeout(() => view.classList.remove('st-enter'), 700);
    view.querySelectorAll('.st-page > *').forEach((n, i) => n.style.setProperty('--i', Math.min(i, 8)));
    loadStatus();
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
    if (ed) { editing = editing === ed.dataset.edit ? null : ed.dataset.edit; drawView(); view.querySelector('.st-key-in')?.focus(); return; }
    if (e.target.closest('[data-cancel]')) { editing = null; drawView(); return; }
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
    const wrow = e.target.closest('[data-ws-row]');
    if (wrow) { wsModal(wrow.dataset.wsRow); return; }
    const ag = e.target.closest('[data-agent]');
    if (ag) { window.PixelDogs?.select(ag.dataset.agent); setTimeout(drawView, 50); }
  });
  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target.closest('form[data-key]');
    const v = form?.querySelector('.st-key-in').value.trim();
    if (!form || !v) { form?.querySelector('.st-key-in').focus(); return; }
    deviceKeys[form.dataset.key] = v.slice(0, 400);
    write(KEYS_KEY, deviceKeys);
    editing = null;
    drawView();
  });
  // Workspace-Name: übernommen beim Verlassen des Felds oder mit Enter
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
