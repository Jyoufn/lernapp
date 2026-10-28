/* ===================================================================
   Musikplayer mit Spotify
   - Anmeldung: Authorization Code mit PKCE (nur Client-ID aus .env, kein Secret)
   - Abspielen direkt im Browser: Spotify Web Playback SDK (Spotify Premium nötig – Vorgabe von Spotify)
   - Ansicht: Player-Karte unter dem Agenten; darunter immer nur EINE Ansicht: Playlists · Suche · Lautstärke
   - Sprachbefehle über den Agenten: „spiele …“, „suche …“, „pause“, „weiter“, „nächster Song“, „lauter/leiser“, „zeige Playlists“
   =================================================================== */
const Music = (() => {
  const SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative user-library-read';
  const REDIRECT_PATH = '/spotify-callback';
  const store = {
    get: (k) => { try { return JSON.parse(localStorage.getItem('spotify.' + k)); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem('spotify.' + k, JSON.stringify(v)); } catch {} },
    del: (k) => { try { localStorage.removeItem('spotify.' + k); } catch {} },
  };
  const m = { clientId: '', token: store.get('token'), player: null, deviceId: null, state: null, view: null, open: false, volume: store.get('volume') ?? 0.6, shuffle: false, tick: null, sdkLoading: null,
    agentOpen: false, ducked: false, duckTimer: null };
  const esc = (s) => escapeHtml(String(s ?? ''));
  const fmt = (ms) => { const s = Math.max(0, Math.floor((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  /* ---------- Anmeldung (PKCE) ---------- */
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function config() {
    if (m.clientId) return m.clientId;
    const r = await fetch('/api/spotify/config').then((x) => x.json()).catch(() => ({}));
    m.clientId = r.clientId || '';
    return m.clientId;
  }
  const redirectUri = () => `http://127.0.0.1:${location.port || 80}${REDIRECT_PATH}`;
  async function login() {
    const id = await config();
    if (!id) { toast('Spotify: Client-ID fehlt – bitte in .env eintragen (SPOTIFY_CLIENT_ID=…).'); return; }
    // Spotify erlaubt als Weiterleitung nur 127.0.0.1 (nicht „localhost“) → Anmeldung immer dort
    if (location.hostname !== '127.0.0.1') { location.href = `http://127.0.0.1:${location.port}/?spotify=login`; return; }
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    store.set('verifier', verifier);
    const u = new URL('https://accounts.spotify.com/authorize');
    Object.entries({ response_type: 'code', client_id: id, scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge, redirect_uri: redirectUri() })
      .forEach(([k, v]) => u.searchParams.set(k, v));
    location.href = u.href;
  }
  async function tokenRequest(params) {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: await config(), ...params }),
    });
    if (!r.ok) throw new Error('Spotify-Anmeldung fehlgeschlagen');
    const j = await r.json();
    m.token = { access: j.access_token, refresh: j.refresh_token || m.token?.refresh, expires: Date.now() + (j.expires_in - 60) * 1000 };
    store.set('token', m.token);
  }
  async function handleCallback() {
    if (location.pathname !== REDIRECT_PATH) return false;
    const code = new URLSearchParams(location.search).get('code');
    window.history.replaceState(null, '', '/');
    if (!code) return true;
    try {
      await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: store.get('verifier') || '' });
      store.del('verifier');
      m.error = '';
      show('playlists');
    } catch (err) { toast(err.message); }
    return true;
  }
  async function accessToken() {
    if (!m.token) return null;
    if (Date.now() > m.token.expires && m.token.refresh) {
      try { await tokenRequest({ grant_type: 'refresh_token', refresh_token: m.token.refresh }); } catch { logout(); return null; }
    }
    return m.token.access;
  }
  function logout() { m.token = null; store.del('token'); m.player?.disconnect(); m.player = null; m.deviceId = null; render(); }
  const connected = () => !!m.token;

  /* ---------- Web-API ---------- */
  async function api(path, opts = {}) {
    const t = await accessToken();
    if (!t) throw new Error('Nicht mit Spotify verbunden');
    const r = await fetch(`https://api.spotify.com/v1${path}`, { ...opts, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    if (r.status === 401) { m.token.expires = 0; return api(path, opts); }
    if (r.status === 403) throw new Error('Spotify erlaubt das nur mit Premium.');
    if (r.status === 204 || r.status === 202) return null;
    if (!r.ok) throw new Error(`Spotify-Fehler (${r.status})`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }

  /* ---------- Abspielen im Browser (Web Playback SDK) ---------- */
  function loadSdk() {
    if (m.sdkLoading) return m.sdkLoading;
    m.sdkLoading = new Promise((resolve) => {
      window.onSpotifyWebPlaybackSDKReady = resolve;
      const s = document.createElement('script');
      s.src = 'https://sdk.scdn.co/spotify-player.js';
      document.head.append(s);
    });
    return m.sdkLoading;
  }
  async function ensurePlayer() {
    if (m.deviceId) return m.deviceId;
    await loadSdk();
    if (!m.player) {
      m.player = new window.Spotify.Player({ name: 'Lern-App', volume: m.volume, getOAuthToken: async (cb) => cb(await accessToken()) });
      m.player.addListener('player_state_changed', (st) => {
        m.state = st;
        if (st && !st.paused && m.mixActive) {
          const index = m.mixUris?.indexOf(st.track_window?.current_track?.uri) ?? -1;
          if (index >= 0 && index >= m.mixUris.length - 3) refillMix(st.track_window.current_track);
        }
        if (st && !st.paused && m.ended && !m.ending) m.ended = false; // woanders wieder gestartet → wieder anzeigen
        // Wechsel „nichts läuft“ ↔ „läuft“ → ganze Karte neu (kompakt ↔ voller Player)
        if (!!st?.track_window?.current_track !== !!m.hadTrack && m.open) {
          if (!m.hadTrack && m.view === 'search') m.view = null; // erster Song läuft → Suche zu, Player normal
          render();
        } else renderNow();
        renderMini();
        syncButton();
      });
      m.player.addListener('account_error', () => toast('Spotify: Für das Abspielen im Browser ist Spotify Premium nötig.'));
      m.player.addListener('authentication_error', () => { toast('Spotify: Bitte neu verbinden.'); logout(); });
    }
    const ready = new Promise((resolve) => m.player.addListener('ready', ({ device_id: id }) => resolve(id)));
    await m.player.connect();
    m.deviceId = await Promise.race([ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
    if (!m.deviceId) throw new Error('Spotify-Player konnte nicht gestartet werden');
    return m.deviceId;
  }
  async function playUris(body) {
    m.ended = false;
    m.pending = false;
    m.query = '';
    document.dispatchEvent(new Event('music:played'));
    const id = await ensurePlayer();
    await api(`/me/player/play?device_id=${id}`, { method: 'PUT', body: JSON.stringify(body) });
    m.view = null; // Song gewählt → Liste/Suche zu, Player ganz normal
    if (m.agentOpen && !m.open) { renderMini(); syncButton(); } // mit Agent: Song steht als Chip in der Leiste
    else show(null);
  }
  // Playlist ab dem gewählten Song – danach geht es in der Playlist weiter (Offset per Song, nicht per Index)
  const playContext = async (uri, offset = 0) => {
    m.mixToken = 0;
    m.mixActive = false;
    m.mixUris = [];
    await playUris({ context_uri: uri, offset: typeof offset === 'string' ? { uri: offset } : { position: offset } });
    try { await api(`/me/player/shuffle?state=false&device_id=${m.deviceId}`, { method: 'PUT' }); } catch {} // immer der Reihe nach
  };
  /* Passende Songs aus Künstler- und Genre-Suche zusammenstellen. */
  async function similarTracks(tr, excluded = new Set()) {
    const seen = new Set([tr.uri, ...excluded]);
    const names = new Set([String(tr.name).toLowerCase()]);
    const out = [];
    const add = (arr) => (arr || []).forEach((t) => {
      const n = String(t?.name || '').toLowerCase();
      if (!t?.uri || seen.has(t.uri) || names.has(n) || t.is_playable === false) return;
      seen.add(t.uri); names.add(n); out.push(t);
    });
    const artists = (tr.artists || []).filter((a) => a.id).slice(0, 2);
    await Promise.all(artists.map(async (a) => { try { add((await api(`/artists/${a.id}/top-tracks?market=from_token`))?.tracks?.slice(0, 6)); } catch {} }));
    try {
      const genres = artists.length ? (await api(`/artists/${artists[0].id}`))?.genres || [] : [];
      for (const g of genres.slice(0, 2)) add((await api(`/search?type=track&limit=10&q=${encodeURIComponent(`genre:"${g}"`)}`))?.tracks?.items);
    } catch {}
    if (out.length < 10) { try { add(await searchTracks(artists.map((a) => a.name).join(' ') || tr.name)); } catch {} }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    // nicht zweimal derselbe Künstler direkt hintereinander
    for (let i = 1; i < out.length; i++) {
      if (out[i].artists?.[0]?.id && out[i].artists[0].id === out[i - 1].artists?.[0]?.id) {
        const k = out.findIndex((t, j) => j > i && t.artists?.[0]?.id !== out[i - 1].artists?.[0]?.id);
        if (k > 0) [out[i], out[k]] = [out[k], out[i]];
      }
    }
    return out.slice(0, 20);
  }
  async function playMix(tr) {
    if (!tr?.uri) return;
    const token = (m.mixToken = (m.mixToken || 0) + 1);
    m.mixActive = false;
    m.mixSeen = new Set([tr.uri]);
    m.mixRefillFor = '';
    const more = await similarTracks(tr).catch(() => []);
    if (m.mixToken !== token) return;
    more.forEach((t) => m.mixSeen.add(t.uri));
    m.mixUris = [tr.uri, ...more.map((t) => t.uri)];
    // Spotify spielt diese Liste in Reihenfolge. Einzelne Queue-Aufrufe nach dem Start
    // können von anderen Player-Befehlen überholt werden und die Folge verlieren.
    await playUris({ uris: m.mixUris });
    if (m.mixToken === token) m.mixActive = true;
  }
  async function refillMix(tr) {
    if (!tr?.uri || m.mixRefillFor === tr.uri || m.mixRefilling) return;
    const token = m.mixToken;
    m.mixRefillFor = tr.uri;
    m.mixRefilling = true;
    try {
      const more = await similarTracks(tr, m.mixSeen || new Set());
      for (const nextTrack of more) {
        if (m.mixToken !== token || !m.state || m.state.paused) break;
        await api(`/me/player/queue?uri=${encodeURIComponent(nextTrack.uri)}&device_id=${m.deviceId}`, { method: 'POST' });
        m.mixSeen.add(nextTrack.uri);
        m.mixUris.push(nextTrack.uri);
      }
    } catch (err) { console.warn('Musik-Fortsetzung:', err); }
    finally { m.mixRefilling = false; }
  }
  async function toggle() { if (!m.player) return; m.ended = false; await m.player.togglePlay(); }
  async function resume() { m.ended = false; await m.player?.resume(); syncButton(); renderMini(); }
  async function next() { await m.player?.nextTrack(); }
  async function prev() { await m.player?.previousTrack(); }
  async function setVolume(v) { m.volume = Math.max(0, Math.min(1, v)); store.set('volume', m.volume); await m.player?.setVolume(m.volume); renderView(); }
  async function setShuffle(on) {
    m.shuffle = on;
    try { if (m.deviceId) await api(`/me/player/shuffle?state=${on}&device_id=${m.deviceId}`, { method: 'PUT' }); } catch {}
    renderView();
  }

  /* ---------- Suchen / Playlists ---------- */
  async function searchTracks(q) {
    let j;
    try { j = await api(`/search?type=track&limit=10&q=${encodeURIComponent(q)}`); }
    catch (err) {
      if (/Premium|verbunden/.test(err.message)) throw err;
      j = await api(`/search?type=track&q=${encodeURIComponent(q)}`); // ohne limit (Spotify-Standard)
    }
    return (j?.tracks?.items || []).filter(Boolean);
  }
  async function playlists() { return (await api('/me/playlists?limit=40'))?.items || []; }
  async function playlistTracks(id) {
    let j;
    try { j = await api(`/playlists/${id}/items?limit=60`); } catch { j = await api(`/playlists/${id}/tracks?limit=60`); }
    return (j?.items || []).map((x) => x.item || x.track).filter((t) => t && t.uri);
  }

  /* ---------- Oberfläche ---------- */
  const root = el('div', 'music');
  root.hidden = true;
  // Hinweise/Fehler: sichtbar im Player (und kurz im Agenten-Status)
  const toast = (text) => {
    m.error = text;
    if (typeof vaLogLine === 'function') vaLogLine('note', text);
    if (!connected()) show(null); else render();
  };
  function mount() {
    const stack = document.getElementById('topStack');
    if (stack && !root.isConnected) stack.append(root);
  }
  const hasTrack = () => !!m.state?.track_window?.current_track;
  const syncButton = () => {
    const b = document.getElementById('vaMusic');
    if (!b) return;
    b.hidden = !hasTrack() || m.ended; // Musik-Icon im Agenten nur, wenn etwas läuft (nicht nach „Musik beenden“)
    b.classList.toggle('on', m.open);
    b.setAttribute('aria-pressed', String(m.open));
  };

  /* ---------- Mini-Player in der Leiste: allein als volle Leiste (Cover, Titel, Knöpfe), neben dem Agenten nur als
     kleines Cover mit Balken – ein Klick klappt den Player darunter auf ---------- */
  const mini = el('div', 'mu-mini');
  mini.hidden = true;
  mini.innerHTML = `<div class="mu-mini-cover"><span class="mu-eq" aria-hidden="true"><i></i><i></i><i></i></span></div>
    <div class="mu-mini-text"><div class="mu-mini-title"></div><div class="mu-mini-sub"></div></div>
    <div class="mu-mini-actions">
      <button class="va-btn" type="button" data-mini="prev" title="Zurück">${icon('i-prev')}</button>
      <button class="va-btn mu-mini-play" type="button" data-mini="toggle" title="Abspielen/Pause">${icon('i-play')}</button>
      <button class="va-btn" type="button" data-mini="next" title="Weiter">${icon('i-next')}</button>
      <button class="va-btn mu-mini-expand" type="button" data-mini="expand" title="Player ausklappen">${icon('i-chevron-down')}</button>
    </div>`;
  mini.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mini]');
    if (!b) { if (m.open) hide(); else show(null); return; } // Klick auf Cover/Titel: Player auf/zu
    const a = b.dataset.mini;
    if (a === 'prev') await prev();
    else if (a === 'next') await next();
    else if (a === 'toggle') await toggle();
    else if (a === 'expand') { if (m.open) hide(); else show(null); }
  });
  function renderMini() {
    const tr = m.state?.track_window?.current_track;
    const want = !!tr && !m.ended; // Baustein in der Leiste – der große Player klappt darunter auf
    if (want && mini.hidden) {
      const stack = document.getElementById('topStack');
      if (stack && !mini.isConnected) stack.prepend(mini);
      const show = () => { mini.hidden = false; };
      if (window.dockFlip) window.dockFlip(show); else show();
      window.dockEnter?.(mini);
      mini.classList.remove('closing');
    } else if (want && mini.classList.contains('closing')) {
      mini.classList.remove('closing');
    } else if (!want && !mini.hidden && !mini.classList.contains('closing')) {
      mini.classList.add('closing');
      setTimeout(() => {
        if (!mini.classList.contains('closing')) return;
        const hide = () => { mini.hidden = true; mini.classList.remove('closing'); };
        if (window.dockFlip) window.dockFlip(hide); else hide();
      }, 240);
    }
    renderMini.fill();
  }
  renderMini.fill = () => {
    const tr = m.state?.track_window?.current_track;
    const dock = document.getElementById('topStack');
    const amb = document.getElementById('dockAmbient');
    const img0 = tr?.album?.images?.[0]?.url;
    if (amb && img0 && amb.dataset.src !== img0) { amb.dataset.src = img0; amb.style.setProperty('--cover', `url("${img0}")`); }
    dock?.classList.toggle('has-cover', !!(tr && img0 && !m.ended));
    if (!tr) return;
    const img = tr.album?.images?.[0]?.url;
    mini.querySelector('.mu-mini-cover').style.backgroundImage = img ? `url("${img}")` : '';
    mini.querySelector('.mu-mini-title').textContent = tr.name;
    mini.querySelector('.mu-mini-sub').textContent = tr.artists.map((x) => x.name).join(', ');
    mini.querySelector('.mu-mini-play').innerHTML = icon(m.state && !m.state.paused ? 'i-pause' : 'i-play');
    mini.classList.toggle('playing', !!(m.state && !m.state.paused)); // kleine Balken auf dem Cover (neben dem Agenten)
    mini.querySelector('.mu-mini-expand').classList.toggle('open', m.open);
  };
  // Ein anderes Fenster der Leiste geht auf (Agent, Timer) oder Klick daneben → Player zuklappen
  document.addEventListener('dock:open', (e) => { if (e.detail !== 'music' && m.open && !root.hidden) hide(); });
  function setAgentOpen(open) {
    m.agentOpen = open;
    if (open && root.isConnected) document.getElementById('topStack')?.append(root); // Player wieder unter den Agenten

    renderMini();
    // Agent zu → aus dem Cover-Chip wird wieder die volle Leiste: Titel und Knöpfe blenden weich ein
    if (!open && !mini.hidden) window.dockEnter?.(mini);
    syncButton();
  }

  /* ---------- Musik leiser, solange der Agent spricht (weich ein- und ausblenden) ---------- */
  function duck(on) {
    if (!m.player || on === m.ducked) return;
    m.ducked = on;
    clearInterval(m.duckTimer);
    const from = on ? m.volume : m.volume * 0.22;
    const to = on ? m.volume * 0.22 : m.volume;
    let step = 0;
    m.duckTimer = setInterval(() => {
      step++;
      const t = Math.min(1, step / 8);
      m.player?.setVolume(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t >= 1) clearInterval(m.duckTimer);
    }, 40);
  }

  /* ---------- Musik beenden (Power): Pause, Karte und Mini-Player weg – bis wieder etwas abgespielt wird ---------- */
  async function endMusic() {
    m.mixToken = 0;
    m.mixActive = false;
    m.mixUris = [];
    m.ended = true;
    m.ending = true; // Statusmeldungen während des Pausierens nicht als „wieder gestartet“ werten
    m.pending = false;
    m.query = '';
    m.open = false;
    m.view = null;
    syncButton();
    renderMini();
    root.classList.add('closing');
    setTimeout(() => { if (!m.open) { root.hidden = true; root.classList.remove('closing'); } }, 260);
    try { await m.player?.pause(); } finally { setTimeout(() => { m.ending = false; }, 800); }
  }

  function show(view) {
    mount();
    m.open = true;
    m.view = view;
    root.hidden = false;
    root.classList.remove('closing');
    document.dispatchEvent(new CustomEvent('dock:open', { detail: 'music' })); // nur ein Fenster unter der Leiste
    syncButton();
    render();
    renderMini();
    root.style.setProperty('--h', `${root.scrollHeight}px`); // Höhe fürs weiche Aufklappen
  }
  function hide() {

    m.open = false;
    syncButton();
    renderMini();
    root.style.setProperty('--h', `${root.offsetHeight}px`); // Höhe fürs weiche Zuklappen
    root.classList.add('closing');
    setTimeout(() => { if (!m.open) { root.hidden = true; root.classList.remove('closing'); } }, 320);
  }
  function toggleView(view) { m.view = m.view === view ? null : view; renderView(); }

  function render() {
    if (!connected()) {
      root.innerHTML = `<div class="mu-card mu-connect">
        <div class="mu-cover mu-cover-empty">${icon('i-music')}</div>
        <div class="mu-meta"><div class="mu-title">Spotify verbinden</div><div class="mu-sub${m.error ? ' mu-err' : ''}">${esc(m.error || 'Musik direkt hier abspielen (Spotify Premium nötig)')}</div></div>
        <button class="mu-pill" type="button" data-act="login">Verbinden</button>
        <button class="mu-ico" type="button" data-act="close" title="Schließen">${icon('i-x')}</button></div>`;
      return;
    }
    const hasTrack = !!m.state?.track_window?.current_track;
    m.hadTrack = hasTrack;
    root.classList.toggle('mu-waiting', !hasTrack); // noch nichts geladen → unsichtbar, bis der Song startet
    if (!hasTrack && (m.view === 'search' || !m.view)) { // Suche nur anzeigen – nicht als Ansicht merken (sonst bleibt sie nach dem Abspielen offen)
      root.innerHTML = `<div class="mu-card mu-compact mu-searchcard">
        <div class="mu-searchbar">${icon('i-search')}<input type="text" aria-label="Song suchen" autocomplete="off" spellcheck="false">
          <button class="mu-ico" type="button" data-act="close" title="Schließen">${icon('i-x')}</button></div>
        <div class="mu-list mu-results"></div></div>`;
      wireSearch(root.querySelector('.mu-searchbar input'), root.querySelector('.mu-results'), m.query || '');
      return;
    }
    if (!hasTrack) {
      root.innerHTML = `<div class="mu-card mu-compact">
        <div class="mu-compact-head"><span class="mu-compact-title">${m.view === 'playlists' || m.view === 'playlist' ? 'Playlists' : 'Song suchen'}</span>
        <button class="mu-ico" type="button" data-act="close" title="Schließen">${icon('i-x')}</button></div>
        <div class="mu-view"></div></div>`;
      if (!m.view) m.view = 'search';
      renderView();
      return;
    }
    root.innerHTML = `<div class="mu-card">
      <div class="mu-top">
        <div class="mu-cover"></div>
        <div class="mu-meta"><div class="mu-title">Nichts läuft</div><div class="mu-sub">Sag „Spiele …“ oder such einen Song</div></div>
        <div class="mu-tools">
          <button class="mu-ico" type="button" data-act="view" data-view="playlists" title="Playlists">${icon('i-list')}</button>
          <button class="mu-ico" type="button" data-act="view" data-view="volume" title="Lautstärke">${icon('i-volume')}</button>
          <button class="mu-ico" type="button" data-act="view" data-view="search" title="Suchen">${icon('i-search')}</button>
          <button class="mu-ico" type="button" data-act="power" title="Musik beenden">${icon('i-power')}</button>
          <button class="mu-ico mu-collapse" type="button" data-act="close" title="Einklappen">${icon('i-chevron-down')}</button>
        </div>
      </div>
      <div class="mu-controls">
        <button class="mu-ico" type="button" data-act="prev" title="Zurück">${icon('i-prev')}</button>
        <button class="mu-play" type="button" data-act="toggle" title="Abspielen/Pause">${icon('i-play')}</button>
        <button class="mu-ico" type="button" data-act="next" title="Weiter">${icon('i-next')}</button>
        <span class="mu-time" data-el="pos">0:00</span>
        <div class="mu-bar" data-el="bar"><div class="mu-rail"><div class="mu-ghost"></div><div class="mu-fill"><span class="mu-knob"></span></div></div><span class="mu-tip"></span></div>
        <span class="mu-time" data-el="dur">0:00</span>
      </div>
      <div class="mu-view"></div>
    </div>`;
    renderNow();
    renderView();
  }

  function renderNow() {
    if (!root.isConnected || !connected()) return;
    const st = m.state;
    const tr = st?.track_window?.current_track;
    const cover = root.querySelector('.mu-cover');
    if (!cover) return;
    if (tr) {
      const img = tr.album?.images?.[0]?.url;
      cover.style.backgroundImage = img ? `url("${img}")` : '';
      root.querySelector('.mu-title').textContent = tr.name;
      root.querySelector('.mu-sub').textContent = tr.artists.map((a) => a.name).join(', ');
    }
    root.querySelector('.mu-play').innerHTML = icon(st && !st.paused ? 'i-pause' : 'i-play');
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === m.view));
    clearInterval(m.tick);
    const bar = root.querySelector('[data-el="bar"]');
    const upd = () => {
      if (!m.state) return;
      const dur = m.state.duration || 1;
      let pos = m.state.paused ? m.state.position : m.state.position + (Date.now() - m.state.timestamp);
      if (m.seeking != null) pos = m.seeking * dur; // während des Ziehens die Zielposition zeigen
      pos = Math.min(pos, dur);
      root.querySelector('[data-el="pos"]').textContent = fmt(pos);
      root.querySelector('[data-el="dur"]').textContent = `-${fmt(dur - pos)}`; // Restzeit
      root.querySelector('.mu-fill').style.width = `${(pos / dur) * 100}%`;
    };
    if (bar && !bar.dataset.wired) {
      bar.dataset.wired = '1';
      const ratio = (e) => { const r = bar.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
      const tip = bar.querySelector('.mu-tip');
      const ghost = bar.querySelector('.mu-ghost');
      const hover = (e) => { // über die ganze Leiste: Zeit an der Mausposition anzeigen
        if (!m.state) return;
        const r = ratio(e);
        tip.textContent = fmt(r * m.state.duration);
        tip.style.left = `${r * 100}%`;
        ghost.style.width = `${r * 100}%`;
      };
      bar.addEventListener('pointerenter', hover);
      bar.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // nichts markieren beim Ziehen
        window.getSelection()?.removeAllRanges();
        bar.setPointerCapture(e.pointerId); bar.classList.add('drag'); m.seeking = ratio(e); hover(e); upd();
      });
      bar.addEventListener('pointermove', (e) => { hover(e); if (bar.hasPointerCapture(e.pointerId)) { m.seeking = ratio(e); upd(); } });
      bar.addEventListener('pointerup', async (e) => {
        bar.classList.remove('drag');
        const r = m.seeking ?? ratio(e);
        m.seeking = null;
        if (m.state) { m.state.position = Math.round(r * m.state.duration); m.state.timestamp = Date.now(); upd(); await m.player?.seek(m.state.position); }
      });
    }
    upd();
    if (st && !st.paused) m.tick = setInterval(upd, 500);
  }

  function trackRow(t, i, onClick, numbered = false) {
    const row = el('button', 'mu-row mu-row-in');
    row.style.animationDelay = `${Math.min(i, 10) * 40}ms`;
    row.type = 'button';
    const img = t.album?.images?.at(-1)?.url || t.album?.images?.[0]?.url || '';
    row.innerHTML = `<span class="mu-thumb" style="${img ? `background-image:url('${esc(img)}')` : ''}"></span>
      <span class="mu-row-text"><span class="mu-row-title">${esc(t.name)}</span><span class="mu-row-sub">${esc(t.artists?.map((a) => a.name).join(', '))}</span></span>
      ${numbered ? `<span class="mu-row-n">${i + 1}</span>` : ''}`;
    row.addEventListener('click', onClick);
    return row;
  }

  /* Suche verdrahten (kompakte Leiste und Suche im Player) */
  function wireSearch(input, list, query = '') {
    let timer = null;
    const run = async () => {
      const q = input.value.trim();
      m.query = q;
      if (q) m.pending = false; // es wurde etwas eingegeben
      if (!q) { list.replaceChildren(); return; }
      let items;
      try { items = await searchTracks(q); }
      catch (err) { if (input.value.trim() === q) list.innerHTML = `<div class="mu-loading">${esc(err.message)}</div>`; return; }
      if (input.value.trim() !== q) return;
      if (!items.length) { list.innerHTML = '<div class="mu-loading">Keine Treffer</div>'; return; }
      const before = list.offsetHeight;
      list.replaceChildren(...items.map((t, i) => {
        const row = trackRow(t, i, () => playMix(t));
        row.style.animationDelay = `${Math.min(i, 8) * 40}ms`;
        row.classList.add('mu-row-in');
        return row;
      }));
      const after = list.offsetHeight;
      if (before !== after) list.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: 420, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)' });
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 140); }); // Treffer schon beim Tippen
    input.addEventListener('keydown', (e) => e.stopPropagation());
    if (query) { input.value = query; run(); }
    setTimeout(() => input.focus({ preventScroll: true }), 60);
  }

  /* ---------- Im Agenten-Menü: Suchleiste bzw. Playlists (wie die Fragen) ---------- */
  const agentClose = (container) => container.dispatchEvent(new CustomEvent('music-close', { bubbles: true }));
  function mountSearch(container, query = '') {
    const wrap = el('div', 'mu-in-agent');
    wrap.innerHTML = `<div class="mu-searchbar">${icon('i-search')}<input type="text" aria-label="Song suchen" autocomplete="off" spellcheck="false">
      <button class="mu-ico" type="button" title="Schließen">${icon('i-x')}</button></div><div class="mu-list mu-results"></div>`;
    container.replaceChildren(wrap);
    wrap.querySelector('.mu-searchbar .mu-ico').addEventListener('click', () => { m.pending = false; m.query = ''; agentClose(container); });
    wireSearch(wrap.querySelector('input'), wrap.querySelector('.mu-results'), query || m.query || '');
  }
  async function mountPlaylists(container) {
    const wrap = el('div', 'mu-in-agent');
    wrap.innerHTML = `<div class="mu-agent-head"><span>Playlists</span><button class="mu-ico" type="button" title="Schließen">${icon('i-x')}</button></div><div class="mu-list"><div class="mu-skel">${'<div class="mu-skel-row"><span></span><span><i></i><i></i></span></div>'.repeat(4)}</div></div>`;
    container.replaceChildren(wrap);
    wrap.querySelector('.mu-agent-head .mu-ico').addEventListener('click', () => agentClose(container));
    const list = wrap.querySelector('.mu-list');
    try {
      const lists = await playlists();
      list.replaceChildren(...lists.map((p, i) => {
        const row = el('button', 'mu-row mu-row-in');
        row.style.animationDelay = `${Math.min(i, 10) * 40}ms`;
        row.type = 'button';
        const img = p.images?.at(-1)?.url || p.images?.[0]?.url || '';
        row.innerHTML = `<span class="mu-thumb" style="${img ? `background-image:url('${esc(img)}')` : ''}"></span>
          <span class="mu-row-text"><span class="mu-row-title">${esc(p.name)}</span><span class="mu-row-sub">${(p.items || p.tracks)?.total ?? ''} Songs</span></span>`;
        row.addEventListener('click', () => openPlaylist(p, container));
        return row;
      }));
      if (!lists.length) list.innerHTML = '<div class="mu-loading">Keine Playlists gefunden</div>';
    } catch (err) { list.innerHTML = `<div class="mu-loading">${esc(err.message)}</div>`; }
  }

  async function renderView(query) {
    if (root.querySelector('.mu-searchcard')) { // kompakte Suche
      const input = root.querySelector('.mu-searchbar input');
      if (query != null && query !== '') { input.value = query; input.dispatchEvent(new Event('input')); }
      return;
    }
    const box = root.querySelector('.mu-view');
    if (!box) return;
    const ct = root.querySelector('.mu-compact-title');
    if (ct) ct.textContent = m.view === 'playlists' || m.view === 'playlist' ? 'Playlists' : 'Song suchen';
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === m.view));
    box.className = `mu-view${m.view ? ' open' : ''}${root.querySelector('.mu-compact') ? ' flat' : ''}`;
    if (!m.view) { box.replaceChildren(); return; }
    const inner = el('div', 'mu-view-inner');
    box.replaceChildren(inner);
    try {
      if (m.view === 'volume') {
        inner.innerHTML = `<div class="mu-vol">${icon('i-volume')}<input class="mu-range" type="range" min="0" max="100" value="${Math.round(m.volume * 100)}" aria-label="Lautstärke"></div>`;
        const range = inner.querySelector('input');
        const paint = () => range.style.setProperty('--val', `${range.value}%`);
        paint();
        range.addEventListener('input', () => { paint(); m.player?.setVolume(range.value / 100); });
        range.addEventListener('change', () => setVolume(range.value / 100));
      } else if (m.view === 'search') {
        inner.innerHTML = `<div class="mu-searchbar">${icon('i-search')}<input type="text" aria-label="Song suchen" autocomplete="off" spellcheck="false"></div><div class="mu-list"></div>`;
        wireSearch(inner.querySelector('input'), inner.querySelector('.mu-list'), query || '');
      } else if (m.view === 'playlists') {
        inner.innerHTML = `<div class="mu-skel">${'<div class="mu-skel-row"><span></span><span><i></i><i></i></span></div>'.repeat(4)}</div>`;
        const lists = await playlists();
        const list = el('div', 'mu-list');
        lists.forEach((p, i) => {
          const row = el('button', 'mu-row mu-row-in');
          row.style.animationDelay = `${Math.min(i, 10) * 40}ms`;
          row.type = 'button';
          const img = p.images?.at(-1)?.url || p.images?.[0]?.url || '';
          row.innerHTML = `<span class="mu-thumb" style="${img ? `background-image:url('${esc(img)}')` : ''}"></span>
            <span class="mu-row-text"><span class="mu-row-title">${esc(p.name)}</span><span class="mu-row-sub">${(p.items || p.tracks)?.total ?? ''} Songs</span></span>`;
          row.addEventListener('click', () => openPlaylist(p));
          list.append(row);
        });
        inner.replaceChildren(list);
        if (!lists.length) inner.innerHTML = '<div class="mu-loading">Keine Playlists gefunden</div>';
      }
    } catch (err) {
      inner.innerHTML = `<div class="mu-loading">${esc(err.message)}</div>`;
    }
  }

  async function openPlaylist(p, container = null) {
    let inner;
    if (container) {
      inner = el('div', 'mu-in-agent slide');
      container.replaceChildren(inner);
    } else {
      m.view = 'playlist';
      const box = root.querySelector('.mu-view');
      box.className = 'mu-view open';
      inner = el('div', 'mu-view-inner slide');
      box.replaceChildren(inner);
    }
    const img = p.images?.[0]?.url || '';
    inner.innerHTML = `<div class="mu-pl-head">
        <button class="mu-ico" type="button" data-back title="Zurück">${icon('i-back')}</button>
        <span class="mu-thumb big" style="${img ? `background-image:url('${esc(img)}')` : ''}"></span>
        <span class="mu-row-text"><span class="mu-row-title">${esc(p.name)}</span><span class="mu-row-sub">${(p.items || p.tracks)?.total ?? ''} Songs</span></span>
        <button class="mu-play small" type="button" data-playall title="Playlist abspielen">${icon('i-play')}</button>
      </div><div class="mu-list"><div class="mu-skel">${'<div class="mu-skel-row"><span></span><span><i></i><i></i></span></div>'.repeat(4)}</div></div>`;
    inner.querySelector('[data-back]').addEventListener('click', () => { if (container) mountPlaylists(container); else { m.view = 'playlists'; renderView(); } });
    inner.querySelector('[data-playall]').addEventListener('click', () => playContext(p.uri, 0));
    try {
      const tracks = await playlistTracks(p.id);
      inner.querySelector('.mu-list').replaceChildren(...tracks.map((t, i) => trackRow(t, i, () => playContext(p.uri, t.uri))));
    } catch (err) {
      inner.querySelector('.mu-list').innerHTML = `<div class="mu-loading">${esc(err.message)}</div>`;
    }
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    try {
      const act = b.dataset.act;
      if (act === 'login') await login();
      else if (act === 'close') { m.pending = false; m.query = ''; hide(); }
      else if (act === 'power') await endMusic();
      else if (act === 'view') toggleView(b.dataset.view);
      else if (act === 'toggle') await toggle();
      else if (act === 'next') await next();
      else if (act === 'prev') await prev();
      else if (act === 'seek-old' && m.state) {
        const r = b.getBoundingClientRect();
        await m.player?.seek(Math.round(((e.clientX - r.left) / r.width) * m.state.duration));
      }
    } catch (err) { toast(err.message); }
  });

  /* ---------- Sprachbefehle (vom Agenten) ----------
     Gibt einen kurzen Satz zurück, den der Agent spricht – oder null, wenn es kein Musikbefehl ist. */
  async function command(text) {
    const t = text.trim().replace(/[.!?]+$/, '');
    const low = t.toLowerCase();
    const musicWord = /\b(musik|song|lied|track|spotify|playlist|album)\b/;
    let mm;
    if (!connected() && (/^(spiel|spiele|spieler|play)\b/.test(low) || musicWord.test(low))) { show(null); return 'Verbinde zuerst Spotify, dann kann ich Musik abspielen.'; }
    if (!connected()) return null;
    try {
      if (/playlist/.test(low) && /(lass mich|ich (will|möchte)|zeig|öffne|such|wähl|auswählen)/.test(low)) {
        await run({ action: 'playlists' });
        return ''; // still öffnen
      }
      // Selbst suchen wollen („lass mich einen Song suchen“, „ich will suchen“, „öffne die Suche“) → leere Suchleiste
      if (/(lass mich|ich (will|möchte|würde gern)|kann ich|darf ich|öffne|zeig).{0,40}(such|suche)/.test(low) && (musicWord.test(low) || m.open || /such(e|leiste|feld)\b/.test(low))) {
        await run({ action: 'open_search' });
        return ''; // still öffnen
      }
      if ((mm = low.match(/^(?:such|suche|finde?)\s+(?:mir\s+)?(?:mal\s+)?(?:nach\s+)?(.*)$/)) && (musicWord.test(low) || m.open)) {
        // „einen Song“, „ein Lied“ … sind keine Suchbegriffe
        const q = mm[1].replace(/^(?:einen|ein|den|das|die|eine)\s+/, '').replace(/^(?:song|lied|track|musik|titel)\b\s*(?:von\s+)?/, '').trim();
        await run({ action: q ? 'search' : 'open_search', query: q });
        return '';
      }
      if ((mm = t.match(/^(?:spiel|spiele|spieler|spiel mal|play)\s+(?:mir\s+)?(?:den\s+song\s+|das\s+lied\s+|den\s+track\s+)?(.+)$/i))) {
        const q = mm[1].replace(/\s+(?:ab|bitte)$/i, '').trim();
        if (/^(musik|weiter|was)$/i.test(q)) { await resume(); show(m.view); return 'Okay.'; }
        const [first] = await searchTracks(q);
        if (!first) return `Ich habe zu ${q} nichts gefunden.`;
        await playMix(first);
        return '';
      }
      if (/^(pause|pausiere|stopp|stop|halt)\b|musik (aus|stopp)/.test(low)) { await m.player?.pause(); return 'Pausiert.'; }
      if (/^(weiter|fortsetzen|resume)$|musik (an|weiter)/.test(low)) { await resume(); return 'Weiter geht’s.'; }
      if (/(nächste[rn]?|skip|überspringe?)\s*(song|lied|track)?$/.test(low)) { await next(); return 'Nächster Song.'; }
      if (/(vorherige[rn]?|letzte[rn]?)\s*(song|lied|track)/.test(low)) { await prev(); return 'Vorheriger Song.'; }
      if ((mm = low.match(/lautstärke (?:auf )?(\d{1,3})/))) { await setVolume(Number(mm[1]) / 100); return `Lautstärke ${mm[1]} Prozent.`; }
      if (/\blauter\b/.test(low)) { await setVolume(m.volume + 0.15); return 'Lauter.'; }
      if (/\bleiser\b/.test(low)) { await setVolume(m.volume - 0.15); return 'Leiser.'; }
      if (/(zeig|öffne).*(playlist|playlists|musik|player)/.test(low)) { if (/playlist/.test(low)) await run({ action: 'playlists' }); else show(null); return ''; }
    } catch (err) {
      return err.message;
    }
    return null;
  }

  /* Aktion ausführen – auch vom Sprachmodell (```music {...}``` in der Antwort) */
  async function run(a) {
    if (!a || !a.action) return;
    if (!connected()) { show(null); return; }
    switch (a.action) {
      case 'open_search':
        m.pending = true;
        m.query = '';
        window.vaShowMusic?.('search', '');
        break;
      case 'search':
        m.pending = true;
        window.vaShowMusic?.('search', String(a.query || ''));
        break;
      case 'play': {
        const [first] = await searchTracks(String(a.query || ''));
        if (first) await playMix(first);
        break;
      }
      case 'pause': await m.player?.pause(); break;
      case 'resume': await resume(); break;
      case 'next': await next(); break;
      case 'prev': await prev(); break;
      case 'volume': if (Number.isFinite(+a.volume)) await setVolume(+a.volume / 100); break;
      case 'playlists': window.vaShowMusic?.('playlists'); break;
      case 'open': show(m.view); break;
      default: break;
    }
  }

  // Start: Rückkehr von der Spotify-Anmeldung oder Anmeldung auf 127.0.0.1 fortsetzen
  (async () => {
    if (await handleCallback()) return;
    if (new URLSearchParams(location.search).get('spotify') === 'login') { window.history.replaceState(null, '', '/'); login(); }
  })();

  const isOpen = () => m.open;
  const isPending = () => m.open && m.pending;
  const isPlaying = () => !!(m.state && !m.state.paused);
  function toggleOpen() { if (m.open) hide(); else show(m.view); }
  const clearPending = () => { m.pending = false; m.query = ''; };
  document.getElementById('vaMusic')?.addEventListener('click', toggleOpen);
  return { show, hide, toggleOpen, isOpen, isPending, isPlaying, command, run, mountSearch, mountPlaylists, setAgentOpen, duck, clearPending, connected, login, logout, root };
})();

window.Music = Music; // für den Agenten (app.js) erreichbar
