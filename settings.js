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
    // fam = Text-Anbieter (Haupt-KI wählbar); image = malt Bilder
    { id: 'GEMINI_API_KEY', name: 'Google Gemini', logo: 'gemini', where: 'aistudio.google.com', multi: true, fam: 'gemini' },
    { id: 'MINIMAX_API_KEY', name: 'MiniMax (NVIDIA)', logo: 'nvidia', where: 'build.nvidia.com', multi: true, fam: 'minimax' },
    // DeepSeek V4.1: kostenlos über NVIDIA (06.11.; Groq und OpenRouter sind raus). Ein NVIDIA-Schlüssel reicht für alle drei –
    // eigene Schlüssel je Modell verteilen nur das Limit (ca. 40 Anfragen/Minute je Schlüssel).
    { id: 'DEEPSEEK_API_KEY', name: 'DeepSeek V4.1 (NVIDIA)', logo: 'nvidia', where: 'build.nvidia.com', multi: true, fam: 'deepseek' },
    // Claude und Groq (Diktat) aus der Liste genommen (16.11. abends, Wunsch: keine Schlüssel dafür) – der Server kann beide weiter nutzen
    // kein NVIDIA/Nemotron mehr in der Anzeige: der Bild-Schlüssel (build.nvidia.com) steht unter „FLUX (Bilder)“
    { id: 'TAVILY_API_KEY', name: 'Tavily (Websuche)', logo: 'tavily', where: 'app.tavily.com', multi: true }, // Recherche: echte Treffer samt Text
    { id: 'FLUX3_API_KEY', name: 'FLUX (Bilder)', logo: 'flux', where: 'build.nvidia.com', multi: true, image: true },
    { id: 'SPOTIFY_CLIENT_ID', name: 'Spotify', logo: 'spotify', where: 'developer.spotify.com', label: 'Client-ID' },
  ];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (name, size = 16) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#f-${name}"/></svg>`;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  /* ---------- Schlüssel vom Gerät an jede /api-Anfrage hängen ---------- */
  let deviceKeys = read(KEYS_KEY, {});
  // Mistral ist raus (03.11.): „Mistral zuerst“ → MiniMax zuerst; ein dort eingetragener NVIDIA-Schlüssel gilt für MiniMax
  if (deviceKeys.AI_ORDER === 'mistral') deviceKeys.AI_ORDER = 'minimax';
  if (deviceKeys.MISTRAL_API_KEY && !deviceKeys.MINIMAX_API_KEY) { deviceKeys.MINIMAX_API_KEY = deviceKeys.MISTRAL_API_KEY; delete deviceKeys.MISTRAL_API_KEY; write(KEYS_KEY, deviceKeys); }
  // Groq und OpenRouter sind raus (06.11.): alte Schlüssel und Rollen aufräumen (Haupt-KI fällt dann auf Gemini zurück)
  if (['groq', 'openrouter'].includes(deviceKeys.AI_ORDER) || deviceKeys.GROQ_API_KEY || deviceKeys.OPENROUTER_API_KEY || /groq|openrouter/.test(deviceKeys.AI_OFF || '')) {
    if (['groq', 'openrouter'].includes(deviceKeys.AI_ORDER)) delete deviceKeys.AI_ORDER;
    delete deviceKeys.GROQ_API_KEY; delete deviceKeys.OPENROUTER_API_KEY;
    if (deviceKeys.AI_OFF) deviceKeys.AI_OFF = String(deviceKeys.AI_OFF).split(',').filter((f) => f && !['groq', 'openrouter'].includes(f)).join(',');
    write(KEYS_KEY, deviceKeys);
  }
  // 16.11. abends (Wunsch „nur den Gemini-Schlüssel nutzen“): einmalig MiniMax/DeepSeek als Ersatz abschalten, solange Gemini die Haupt-KI ist
  // (sonst sprang die App bei kurzer Überlastung auf die langsamen NVIDIA-Modelle). In Einstellungen → Agenten → Rolle wieder einschaltbar.
  if (!read('settings.onlygemini.v1', false)) {
    if (!deviceKeys.AI_ORDER || deviceKeys.AI_ORDER === 'gemini') { deviceKeys.AI_OFF = 'minimax,deepseek,claude'; write(KEYS_KEY, deviceKeys); }
    write('settings.onlygemini.v1', true);
  }
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
  const PAGES = { general: 'Allgemein', look: 'Aussehen', agents: 'Agenten' }; // „Gespeichert“ entfällt (Wunsch 05.11.)
  // Erweiterungen anderer Dateien (code-box.js, chat-bg.js, agent-builder.js): { page, order, html(), click(e, redraw), input(e), change(e) }
  const hooks = (pg) => (window.SettingsHooks || []).filter((h) => !pg || h.page === pg).sort((a, b) => (a.order || 0) - (b.order || 0));
  const hooksHtml = (pg) => hooks(pg).map((h) => { try { return h.html(); } catch { return ''; } }).join('');
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
  // Anbieter: Logo, Name, rechts „N Schlüssel“ bzw. „Verbinden“ + Pfeil. Antippen klappt darunter die Schlüssel auf (schiebt die anderen nach unten):
  // jeder Schlüssel als Zeile (••••1234, × entfernt), darunter ein Feld zum Hinzufügen. Mehrere Schlüssel = mehr Gratis-Kontingent, die App wechselt selbst.
  const keyView = { shown: new Set(), edit: null }; // angezeigte Schlüssel („Anbieter:Index“) und der gerade bearbeitete
  const keyList = (id) => String(deviceKeys[id] || '').split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
  // 17.11.: Ergebnis von „Verbindung testen“ (je Modell und Schlüssel: OK mit Zeit, sonst der Fehler)
  let diag = null;
  const diagHtml = () => !diag ? '' : diag.busy ? '<p class="st-ws-note">Wird geprüft …</p>'
    : !diag.results?.length ? `<p class="st-ws-note">${diag.keys === 0 ? 'Kein Gemini-Schlüssel gefunden – die App schickt keinen mit.' : 'Keine Antwort vom Server.'}</p>`
    : diag.results.map((r) => `<div class="stk-diag-r${r.ok ? ' ok' : ''}"><span class="stk-diag-m">${esc(r.model)} <em>${esc(r.key)}</em></span><span class="grow"></span><span>${r.ok ? `OK · ${(r.ms / 1000).toFixed(1)} s` : esc(r.status === 429 ? 'Limit erreicht' : r.status === 404 ? 'Modell nicht verfügbar' : r.status === 400 || r.status === 403 ? `Abgelehnt (${r.status})` : r.error || 'Fehler')}</span></div>`).join('');
  function providerRow(p) {
    const keys = keyList(p.id), open = editing === p.id, what = p.label || 'API-Key';
    const status = keys.length ? `<span class="st-ok">${fi('check', 12)}${p.multi ? `${keys.length} ${keys.length === 1 ? 'Schlüssel' : 'Schlüssel'}` : 'Verbunden'}</span>`
      : fileKeys[p.id] ? `<span class="st-ok">${fi('check', 12)}Verbunden</span>` : '<span class="st-muted">Verbinden</span>';
    const isMain = p.fam && mainFam() === p.fam;
    const head = `<div class="st-row st-prov${open ? ' open' : ''}" data-edit="${p.id}" role="button" tabindex="0" aria-expanded="${open}">${logo(p)}<span class="st-name">${esc(p.name)}</span>${isMain ? '<span class="st-main-tag">Haupt-KI</span>' : p.image && (keys.length || fileKeys[p.id]) ? '<span class="st-main-tag soft">Bild-KI</span>' : ''}<span class="grow"></span>${status}<span class="st-ws-chev"><svg width="12" height="12" aria-hidden="true"><use href="#o-chev"/></svg></span></div>`;
    if (!open) return head;
    // aufgeklappt (Wunsch 10.11. schöner): Abschnitt „Schlüssel“ (je Schlüssel eine Zeile mit Schlüssel-Icon, darunter ein Feld mit Knopf darin),
    // darunter durch eine Linie getrennt „Rolle“ mit erklärendem Satz und dem Umschalter rechts
    return head + `<div class="st-keys"><div class="st-keys-in">
        <div class="stk-sec"><div class="stk-lab"><span>${esc(what === 'API-Key' ? 'Schlüssel' : what)}</span>${p.multi ? '<em>mehrere Schlüssel = mehr Gratis-Kontingent</em>' : ''}</div>
        ${keys.map((k, i) => keyView.edit === `${p.id}:${i}`
          // Schlüssel bearbeiten (Wunsch 10.11.): Feld mit dem ganzen Schlüssel, Speichern ersetzt genau diesen
          ? `<form class="stk-add stk-edit" data-key-edit="${i}" autocomplete="off"><input class="st-key-in" type="text" value="${esc(k)}" aria-label="Schlüssel bearbeiten" spellcheck="false" /><button type="button" class="st-key-x" data-key-cancel aria-label="Abbrechen">${fi('x', 11)}</button><button type="submit" class="stk-btn">Speichern</button></form>`
          : `<div class="st-key stk-key"><span class="stk-ki">${fi('lock', 12)}</span><span class="st-key-dots${keyView.shown.has(`${p.id}:${i}`) ? ' full' : ''}" data-key-ed="${i}" role="button" tabindex="0" title="Zum Bearbeiten antippen">${keyView.shown.has(`${p.id}:${i}`) ? esc(k) : `••••  ${esc(k.slice(-4))}`}</span><span class="grow"></span>`
            + `<button type="button" class="st-key-x" data-key-show="${i}" aria-label="${keyView.shown.has(`${p.id}:${i}`) ? 'Schlüssel verbergen' : 'Schlüssel anzeigen'}">${fi('eye', 12)}</button>`
            + `<button type="button" class="st-key-x" data-key-ed="${i}" aria-label="Schlüssel bearbeiten">${fi('pencil', 11)}</button>`
            + `<button type="button" class="st-key-x" data-key-rm="${i}" aria-label="Schlüssel entfernen">${fi('x', 11)}</button></div>`).join('')}
        ${fileKeys[p.id] && !keys.length ? '<p class="st-ws-note">Ein Schlüssel ist auf dem Server hinterlegt.</p>' : ''}
        ${p.multi || !keys.length ? `<form class="st-key-add stk-add" data-key="${p.id}" autocomplete="off"><input class="st-key-in" type="password" placeholder="${keys.length ? 'Weiteren ' : ''}${esc(what)} von ${esc(p.where)} einfügen" aria-label="${esc(what)} für ${esc(p.name)}" spellcheck="false" /><button type="submit" class="stk-btn">Hinzufügen</button></form>` : ''}</div>
        ${rolesHtml(p, keys.length || fileKeys[p.id])}
        ${p.fam === 'gemini' ? `<div class="st-role stk-role stk-diag"><div class="stk-l"><span>Verbindung</span><em>Prüft jedes Modell mit jedem Schlüssel – zeigt, was antwortet und was nicht.</em></div><button type="button" class="st-btn" data-diag>Verbindung testen</button></div><div class="stk-diag-out" data-diag-out>${diagHtml()}</div>` : ''}
      </div></div>`;
  }
  /* Rolle des Anbieters (unter seinen Schlüsseln): Haupt-KI – wird für ALLES zuerst genutzt (auch Coden, Agenten, Hintergründe);
     Ersatz – springt nur ein, wenn die Haupt-KI gerade nicht kann (Kontingent). FLUX malt die Bilder. */
  const FAMS = ['gemini', 'minimax', 'deepseek']; // Kimi entfernt (10.11.), Claude wieder raus (16.11. abends)
  const mainFam = () => (FAMS.includes(deviceKeys.AI_ORDER) ? deviceKeys.AI_ORDER : 'gemini');
  window.AiMain = () => mainFam(); // Name im Modell-Knopf
  /* Modell-Auswahl im Eingabefeld (Wunsch 10.11.): nur verbundene Anbieter (eigener Schlüssel oder Server-Schlüssel),
     antippen macht ihn zur Haupt-KI – genau wie Einstellungen → Agenten → Rolle „Haupt-KI“ */
  const FAM_KEY = { gemini: 'GEMINI_API_KEY', minimax: 'MINIMAX_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
  window.AiConnected = () => FAMS.filter((f) => keyList(FAM_KEY[f]).length || fileKeys[FAM_KEY[f]]);
  window.setAiMain = (f) => {
    if (!FAMS.includes(f)) return;
    if (f === 'gemini') delete deviceKeys.AI_ORDER; else deviceKeys.AI_ORDER = f;
    const off = new Set(offFams()); off.delete(f); if (off.size) deviceKeys.AI_OFF = [...off].join(','); else delete deviceKeys.AI_OFF;
    delete deviceKeys.CODE_ORDER;
    write(KEYS_KEY, deviceKeys);
    if (app.classList.contains('settings-open')) drawView();
  };
  const offFams = () => String(deviceKeys.AI_OFF || '').split(',').filter((f) => FAMS.includes(f));
  const useMap = () => Object.fromEntries(String(deviceKeys.AI_USE || '').split(',').map((x) => x.split(':')).filter(([f, u]) => FAMS.includes(f) && ['code', 'chat'].includes(u)));
  const useOf = (f) => useMap()[f] || 'all';
  function rolesHtml(p, has) {
    if (!p.fam) return '';
    const main = mainFam() === p.fam, role = main ? 'main' : offFams().includes(p.fam) ? 'off' : 'backup';
    const why = { main: 'Wird für alles zuerst genutzt – Antworten, Coden, Agenten, Hintergründe.', backup: 'Springt nur ein, wenn die Haupt-KI gerade nicht kann.', off: 'Wird nie genutzt.' }[role]
      + (main && !has ? ' Noch kein Schlüssel – bis dahin übernimmt die nächste.' : '');
    const opt = (v, label) => `<button type="button" role="radio" aria-checked="${role === v}" class="${role === v ? 'on' : ''}" data-ai-role="${p.fam}:${v}"${main && v !== 'main' ? ' disabled' : ''}>${label}</button>`;
    // 16.11.: Einsatz – wofür dieser Anbieter genutzt wird (alles, nur Coden, nur Chat)
    const use = useOf(p.fam);
    const uwhy = { all: 'Für Chat und Coden.', code: 'Nur beim Coden (Coden-Agent, Mini-Apps).', chat: 'Nur für Chats – beim Coden übernimmt ein anderer.' }[use];
    const uopt = (v, label) => `<button type="button" role="radio" aria-checked="${use === v}" class="${use === v ? 'on' : ''}" data-ai-use="${p.fam}:${v}">${label}</button>`;
    return `<div class="st-role stk-role"><div class="stk-l"><span>Rolle</span><em>${esc(why)}</em></div><span class="st-seg st-role-seg" role="radiogroup" aria-label="Rolle von ${esc(p.name)}">${opt('main', 'Haupt-KI')}${opt('backup', 'Ersatz')}${opt('off', 'Aus')}</span></div>`
      + (role === 'off' ? '' : `<div class="st-role stk-role"><div class="stk-l"><span>Einsatz</span><em>${esc(uwhy)}</em></div><span class="st-seg st-role-seg" role="radiogroup" aria-label="Einsatz von ${esc(p.name)}">${uopt('all', 'Alles')}${uopt('code', 'Coden')}${uopt('chat', 'Chat')}</span></div>`);
  }




  function agentRow(m) {
    const dogs = window.PixelDogs;
    const off = dogs?.UNAVAILABLE?.has(m.id);
    let cur = 'general';
    try { cur = localStorage.getItem('dogMode') || 'general'; } catch {}
    const right = off ? '<span class="st-muted">Nicht verfügbar</span>' : ''; // nur auflisten – keiner „aktiv“ (Wunsch 05.11.)
    return `<div class="st-row${off ? ' off' : ''}"><span class="st-dog">${dogs ? dogs.svg(m.id, 24) : ''}</span><span class="st-name">${esc(m.name)}</span><span class="grow"></span>${right}</div>`;
  }

  // Aussehen: Modus und Hintergrund als Umschalter (wie „Allow · Ask me · Block“ in der Vorlage), Akzent als runde Farben
  const seg = (attr, items, on) => `<span class="st-seg" role="radiogroup">${items.map(([label, val]) => `<button type="button" role="radio" aria-checked="${val === on}" class="${val === on ? 'on' : ''}" ${attr}="${val}">${esc(label)}</button>`).join('')}</span>`;
  const ACC_OWN = 'appearance.ownAccents';
  const ownAccents = () => { try { return (JSON.parse(localStorage.getItem(ACC_OWN)) || []).filter((c) => /^#[0-9a-f]{6}$/.test(c)).slice(0, 12); } catch { return []; } };
  const addAccent = (hex) => { try { localStorage.setItem(ACC_OWN, JSON.stringify([hex, ...ownAccents().filter((c) => c !== hex)].slice(0, 12))); } catch {} };
  const accDot = (c, cur) => `<button type="button" class="${c === cur ? 'on' : ''}" data-ap-accent="${c}" style="--c:${c}" aria-label="Akzent ${c}"></button>`;
  function lookPage() {
    const ap = window.Appearance;
    if (!ap) return '';
    ap.previewFonts?.();
    const cfg = ap.get();
    const accent = String(cfg.accent || '').toLowerCase();
    // Akzentfarbe wie im Kalender (16.11.): Vorschläge in einer Reihe, ganz rechts der bunte Knopf für eine eigene Farbe,
    // darunter die selbst gewählten (gespeichert, neueste zuerst, gleich ausgewählt)
    const own = ownAccents(); if (/^#[0-9a-f]{6}$/.test(accent) && !ap.ACCENTS.includes(accent) && !own.includes(accent)) own.unshift(accent);
    const near = TILES.reduce((a, b) => (Math.abs(b[1] - cfg.tiles) < Math.abs(a[1] - cfg.tiles) ? b : a))[1];
    // Wunsch 10.11.: Vorschau als kleine App (Sidebar mit Zeilen, Nachricht, Antwort, Eingabefeld), gewählt = heller Ring statt blauem Rahmen;
    // „Kacheln“ steht im selben Kasten unter der Akzentfarbe (mit Trennlinie), darunter die Sprache. Kein eigener Abschnitt „Chat-Hintergrund“ mehr.
    const lang = window.I18n?.lang() || 'de';
    return `<h2>Aussehen</h2><div class="st-card">
        <div class="st-row st-modes-row"><span class="st-name">Modus</span><div class="ap-modes st-ap-modes">${Object.entries(ap.MODES).map(([id, label]) => { const pv = ap.PREVIEW?.[id] || {};
          return `<button type="button" class="ap-mode${id === cfg.mode ? ' on' : ''}" data-ap-mode="${id}" style="--pv-main:${pv.main};--pv-side:${pv.side};--pv-line:${pv.line};--pv-field:${pv.field}"><span class="ap-prev apv"><span class="apv-side"><i></i><i></i><i></i></span><span class="apv-main"><span class="apv-msg"></span><span class="apv-ans"><i></i><i></i><i class="s"></i></span><span class="apv-in"><em></em></span></span></span><span class="ap-mode-name">${esc(label)}</span></button>`; }).join('')}</div></div>
        <div class="st-row st-acc-row"><span class="st-name">Akzentfarbe</span><span class="grow"></span><div class="st-acc">
          <div class="tk-colors st-acc-dots">${ap.ACCENTS.map((c) => accDot(c, accent)).join('')}<button type="button" class="tk-custom" data-ap-custom aria-label="Eigene Farbe"></button></div>
          ${own.length ? `<div class="tk-colors st-acc-dots st-acc-own">${own.map((c) => accDot(c, accent)).join('')}</div>` : ''}</div></div>
        <div class="st-acc-picker" data-acc-host></div>`
        + `
        ${cfg.mode === 'glass' && ap.DESKTOP ? `<div class="st-row"><span class="st-name">Glas</span><span class="grow"></span>${seg('data-ap-glasstone', [['Hell', 'light'], ['Dunkel', 'dark']], cfg.glassTone === 'light' ? 'light' : 'dark')}</div>` : ''}
        <div class="st-row"><span class="st-name">Kacheln im neuen Chat</span><span class="grow"></span>${seg('data-ap-tiles', TILES.map(([l, v]) => [l, String(v)]), String(near))}</div>
        <div class="st-row"><span class="st-name">Schriftart</span><span class="grow"></span>${seg('data-ap-font', Object.entries(ap.FONTS || {}).map(([id, label]) => [label, id]), cfg.font).replace(/data-ap-font="(\w+)"/g, (m, id) => `${m} style="font-family:${ap.FONT_CSS?.[id] || 'inherit'}"`)}</div>
        <div class="st-row"><span class="st-name">Schriftstärke</span><span class="grow"></span><span class="st-fw-val" data-fw-val>${cfg.weight} %</span><label class="ui-slider st-fw" style="--p:${((cfg.weight - ap.W_MIN) / (ap.W_MAX - ap.W_MIN)) * 100}%"><input type="range" min="${ap.W_MIN}" max="${ap.W_MAX}" step="1" value="${cfg.weight}" data-ap-wrange aria-label="Schriftstärke in Prozent" /><i class="st-fw-mark" style="left:${((100 - ap.W_MIN) / (ap.W_MAX - ap.W_MIN)) * 100}%"></i></label></div>
        <div class="st-row"><span class="st-name">Sprache</span><span class="grow"></span>${seg('data-lang', [['Deutsch', 'de'], ['English', 'en']], lang)}</div></div>`
      + hooksHtml('look');
  }

  /* ---------- Workspaces: Zeile antippen klappt sie auf (Symbol, Name, Öffnen, Personen einladen, Löschen) ---------- */
  const wst = { open: null, anim: false, ic: false, del: false, msg: null };
  function wsSection() {
    const W = window.Workspaces; if (!W) return '';
    const dogs = window.PixelDogs;
    const icons = [...(dogs?.MODES || []).map((m) => [m.id, m.name]).filter(([d]) => !dogs.UNAVAILABLE?.has(d)), ...Object.entries(dogs?.ANIMALS || {})];
    const rows = W.list().map((w) => {
      const id = w.id, on = wst.open === id, own = !w.guest;
      const pick = !wst.ic || w.guest ? '' : `<div class="st-ws-menu" role="listbox">
          ${icons.map(([d, name]) => `<button type="button" class="st-ws-ic${!w.img && (w.dog || 'general') === d ? ' on' : ''}" data-ws-dog="${d}" aria-label="${esc(name)}">${dogs.svg(d, 32)}<span>${esc(name)}</span></button>`).join('')}
          <button type="button" class="st-ws-ic up${w.img ? ' on' : ''}" data-ws-up aria-label="Eigenes Bild">${w.img ? `<img src="${w.img}" alt="" width="32" height="32" />` : `<span class="st-ws-upi">${fi('upload', 14)}</span>`}<span>Bild</span></button>
          ${w.img ? `<button type="button" class="st-ws-ic" data-ws-noimg aria-label="Eigenes Bild entfernen"><span class="st-ws-upi">${fi('trash', 13)}</span><span>Bild weg</span></button>` : ''}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden data-ws-file />
        </div>`;
      const head = `<div class="st-row st-ws${on ? ' open' : ''}" data-ws-row="${id}" role="button" tabindex="0" aria-expanded="${on}">
        ${on && own ? `<button type="button" class="st-ws-dog st-ws-avbtn${wst.ic ? ' on' : ''}" data-ws-ic aria-label="Symbol ändern" aria-expanded="${wst.ic}">${W.avatar(id, 24)}</button>` : `<span class="st-ws-dog">${W.avatar(id, 24)}</span>`}
        ${on && own ? `<input class="st-ws-name" data-ws-name maxlength="32" value="${esc(W.nameOf(id))}" aria-label="Name des Workspace" spellcheck="false" />` : `<span class="st-name">${esc(W.nameOf(id))}</span>`}
        <span class="grow"></span>
        ${w.shared ? `<span class="st-ws-badge">${fi('people', 12)}${esc(W.sub(id).replace(/^Geteilt · /, ''))}</span>` : ''}
        <span class="st-ws-chev"><svg width="12" height="12" aria-hidden="true"><use href="#o-chev"/></svg></span>
        ${on && own && wst.ic ? pick : ''}
      </div>`;
      if (!on) return head;
      const ppl = (w.members || []).map((m) => {
        const who = m.state === 'self' ? 'Du' : m.name || m.email || 'Mitglied';
        const tag = { owner: 'Besitzer', pending: 'Eingeladen', member: 'Mitglied', self: 'Mitglied' }[m.state] || '';
        return `<div class="st-ws-person"><span class="st-ws-pav">${fi('user', 11)}</span><span class="st-ws-pn">${esc(who)}</span><span class="st-ws-tag${m.state === 'pending' ? ' wait' : ''}">${tag}</span>${own && m.email ? `<button type="button" class="st-ws-x" data-ws-unshare="${esc(m.email)}" aria-label="Entfernen">${fi('x', 11)}</button>` : ''}</div>`;
      });
      const people = w.guest ? `<p class="st-ws-note">Geteilt von ${esc(w.from || 'jemandem')}.</p>`
        : id === 'main' ? '<p class="st-ws-note">Dein erster Workspace bleibt privat. Zum Teilen legst du einen weiteren an.</p>'
        : `<form class="st-ws-share" data-ws-share><input class="st-field" type="email" name="email" placeholder="E-Mail-Adresse" autocomplete="off" aria-label="E-Mail-Adresse" /><button type="submit" class="st-btn light">Einladen</button></form>
           ${wst.msg ? `<p class="st-ws-msg${wst.msg.err ? ' err' : ''}">${esc(wst.msg.text)}</p>` : ''}
           ${ppl.length ? `<div class="st-ws-people">${ppl.join('')}</div>` : ''}`;
      return head + `<div class="st-ws-panel${wst.anim ? ' in' : ''}"><div class="st-ws-pin">
        <div class="st-ws-h">Personen</div>
        ${people}
        ${id === 'main' ? '' : `<div class="st-ws-foot"><button type="button" class="st-ws-del${wst.del ? ' sure' : ''}" data-ws-del>${fi(w.guest ? 'back' : 'trash', 13)}${wst.del ? 'Wirklich?' : (w.guest ? 'Verlassen' : 'Löschen')}</button></div>`}
      </div></div>`;
    }).join('');
    wst.anim = false;
    return `<h2>Workspaces</h2><div class="st-card st-ws-card">${rows}</div>`;
  }
  // eigenes Bild: quadratisch zuschneiden, 128 px, JPEG (klein genug fürs Konto)
  function wsUpload(id, file) {
    if (!file || !/^image\//.test(file.type)) return;
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas'), S = 128, m = Math.min(img.width, img.height);
      c.width = c.height = S;
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
      URL.revokeObjectURL(url);
      window.Workspaces.setImg(id, c.toDataURL('image/jpeg', 0.86)); drawView();
    };
    img.src = url;
  }
  function wsClick(e) {
    const W = window.Workspaces, t = e.target, id = wst.open;
    if (id && t.closest('.st-ws.open') && (t.closest('[data-ws-name]') || t.closest('.st-ws-menu'))) {
      if (t.closest('[data-ws-name]')) return true;
    } else if (id && t.closest('[data-ws-ic]')) { wst.ic = !wst.ic; drawView(); return true; }
    const row = !t.closest('.st-ws-menu') && t.closest('[data-ws-row]');
    if (row) {
      const n = row.dataset.wsRow;
      foldTo('.st-ws-panel', '.st-ws', () => Object.assign(wst, { open: wst.open === n ? null : n, anim: false, ic: false, del: false, msg: null }));
      // Mitglieder nachladen – erst nach dem Aufziehen neu zeichnen (sonst springt die Animation)
      if (wst.open !== n) W.load().then(() => setTimeout(() => { if (wst.open === n && !view.querySelector('.st-ws-pin input:focus')) drawView(); }, 420));
      return true;
    }
    if (!id || !(t.closest('.st-ws-pin') || t.closest('.st-ws-menu'))) { if (wst.ic) { wst.ic = false; drawView(); } return false; }
        const dg = t.closest('[data-ws-dog]'); if (dg) { W.setDog(id, dg.dataset.wsDog); wst.ic = false; drawView(); return true; }
    if (t.closest('[data-ws-up]')) { view.querySelector('[data-ws-file]')?.click(); return true; }
    if (t.closest('[data-ws-noimg]')) { W.setImg(id, null); drawView(); return true; }
    const un = t.closest('[data-ws-unshare]'); if (un) { W.unshare(id, un.dataset.wsUnshare).then(drawView, drawView); return true; }
    if (t.closest('[data-ws-del]')) {
      if (!wst.del) { wst.del = true; drawView(); return true; }
      Promise.resolve(W.remove(id)).then(() => { wst.open = null; wst.del = false; drawView(); }); return true;
    }
    return true;
  }
  /* 16.11.: weiches Auf-/Zuklappen (Verbindungen, Workspaces): offenes Feld erst zuziehen, dann neu zeichnen und das neue Feld aufziehen;
     der Pfeil dreht mit. panelSel = das aufklappende Feld, rowSel = die Kopfzeile. */
  const REDUCE_FOLD = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE_FOLD = 'cubic-bezier(0.32, 0.72, 0, 1)';
  function foldTo(panelSel, rowSel, change) {
    const old = view.querySelector(panelSel);
    const go = () => {
      change(); drawView();
      const nw = view.querySelector(panelSel); if (!nw || REDUCE_FOLD) return;
      const h = nw.offsetHeight; nw.style.overflow = 'hidden';
      nw.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: 340, easing: EASE_FOLD }).finished.then(() => { nw.style.overflow = ''; }, () => {});
      nw.previousElementSibling?.querySelector('.st-ws-chev')?.animate([{ transform: 'rotate(-90deg)' }, { transform: 'rotate(0deg)' }], { duration: 300, easing: EASE_FOLD });
    };
    if (!old || REDUCE_FOLD) { go(); return; }
    old.style.overflow = 'hidden';
    old.previousElementSibling?.classList.remove('open'); // Pfeil dreht per CSS zurück
    old.animate([{ height: `${old.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 230, easing: EASE_FOLD, fill: 'forwards' }).finished.then(go, go);
  }
  function drawView() {
    const title = PAGES[page];
    let body;
    if (page === 'general') {
      const onDevice = Object.values(deviceKeys).some(Boolean);
      const account = window.Auth?.user();
      body = `<h2>Profil</h2><div class="st-card">
          <div class="st-row"><span class="st-name">Name</span><span class="grow"></span><input class="st-name-edit" data-name-live maxlength="32" value="${esc(nameOf())}" aria-label="Name" spellcheck="false" autocomplete="off" /></div></div>
        ${account ? `<h2>Konto</h2><div class="st-card">
          <div class="st-row"><span class="st-name">${esc(account.email)}</span><span class="grow"></span><button type="button" class="st-btn dark" data-logout>Abmelden</button></div></div>` : ''}
        ${wsSection()}
        <h2>Daten</h2><div class="st-card">
          <div class="st-row"><span class="st-name">Chats und Dokumente</span><span class="grow"></span><span class="st-muted">Im Konto</span></div>
          <div class="st-row"><span class="st-name">Einstellungen und Aufgaben</span><span class="grow"></span><span class="st-muted">Im Konto</span></div>
          <div class="st-row"><span class="st-name">API-Keys</span><span class="grow"></span><span class="st-muted">${onDevice ? 'Im Konto' : 'Aus .env'}</span></div></div>`;
    } else if (page === 'look') {
      body = lookPage();
    } else if (page === 'saved') {
      body = hooksHtml('saved') || '<h2>Gespeichert</h2><div class="st-card"><div class="st-row"><span class="st-muted">Noch nichts gespeichert.</span></div></div>';
    } else {
      const modes = window.PixelDogs?.MODES || [];
      body = `<h2>Verbindung</h2><div class="st-card">${PROVIDERS.map(providerRow).join('')}</div>`
        + (modes.length ? `<h2>Agenten</h2><div class="st-card">${modes.filter((m) => !m.custom).map(agentRow).join('')}${window.AgentSettingsRows?.() || ''}</div>` : '')
        + hooksHtml('agents');
    }
    // gleiche Seite neu gezeichnet (z. B. Hintergrund gewählt) → Scroll-Position behalten, nicht nach oben springen. Die neue Seite behält kurz
    // mindestens die alte Höhe (Teile, die erst danach laden – Vorschaubilder, Listen –, ließen die Position sonst nach oben klemmen)
    const sc0 = view.querySelector('.st-scroll'), same = drawView.page === page;
    const keepTop = same ? Math.max(sc0?.scrollTop || 0, drawView.top || 0) : 0, keepH = same ? sc0?.querySelector('.st-page')?.offsetHeight || 0 : 0;
    drawView.page = page; drawView.top = keepTop;
    view.innerHTML = `<div class="st-top">${title}</div><div class="st-scroll"><div class="st-page">${body}</div></div>`;
    const sc = view.querySelector('.st-scroll'), pg = sc.querySelector('.st-page');
    if (keepTop) {
      if (keepH) pg.style.minHeight = `${keepH}px`;
      sc.scrollTop = keepTop;
      requestAnimationFrame(() => { if (sc.isConnected && Math.abs(sc.scrollTop - keepTop) > 2) sc.scrollTop = keepTop; });
      clearTimeout(drawView.t); drawView.t = setTimeout(() => { pg.style.minHeight = ''; }, 1500);
    }
    sc.addEventListener('scroll', () => { drawView.top = sc.scrollTop; }, { passive: true });
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
    const wasOpen = app.classList.contains('settings-open');
    drawView.page = null;
    app.classList.remove('settings-open');
    editing = null;
    // 16.11.: Zurück blendet den Hauptteil und die Sidebar einmal weich ein – 17.11.: NUR wenn die Einstellungen wirklich offen waren
    // (close() läuft bei jedem Klick in der Sidebar → Sidebar und Ansicht ruckelten bei jedem Wechsel), nur Einblenden ohne Verschieben
    if (wasOpen && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // 17.11.: zurück – Sidebar gleitet ein kleines Stück von rechts zurück an ihren Platz, der Hauptteil blendet weich ein
      const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
      document.querySelectorAll('.sidebar :is(.sb-head, .sb-main, .sb-scroll)').forEach((n) => n.animate?.([{ opacity: 0, transform: 'translateX(10px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: ease }));
      document.querySelectorAll('.panel > :is(.content, .composer-area, .dc-view, .cal-view, .tk-view):not([hidden])').forEach((n) => n.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: ease }));
    }
  }

  /* ---------- Bedienung ---------- */
  document.getElementById('sbSettings')?.addEventListener('click', () => (app.classList.contains('settings-open') ? close() : open()));
  side.addEventListener('click', (e) => {
    if (e.target.closest('.st-back')) { close(); return; }
    const a = e.target.closest('[data-st]');
    if (!a) return;
    e.preventDefault();
    page = a.dataset.st; write(PAGE_KEY, page); editing = null; drawView.top = 0; drawView();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.classList.contains('settings-open') && !e.target.closest?.('input')) close();
  });

  view.addEventListener('click', (e) => {
    const sh = e.target.closest('[data-key-show]');
    if (sh && editing) { const k = `${editing}:${sh.dataset.keyShow}`; keyView.shown.has(k) ? keyView.shown.delete(k) : keyView.shown.add(k); drawView(); return; }
    const ked = e.target.closest('[data-key-ed]');
    if (ked && editing) { keyView.edit = `${editing}:${ked.dataset.keyEd}`; drawView(); const inp = view.querySelector('.stk-edit input'); inp?.focus(); inp?.select(); return; }
    if (e.target.closest('[data-key-cancel]')) { keyView.edit = null; drawView(); return; }
    const rm = e.target.closest('[data-key-rm]');
    if (rm && editing) { keyView.shown.clear(); keyView.edit = null; const ks = keyList(editing); ks.splice(+rm.dataset.keyRm, 1); if (ks.length) deviceKeys[editing] = ks.join('\n'); else delete deviceKeys[editing]; write(KEYS_KEY, deviceKeys); drawView(); return; }
    const ro = e.target.closest('[data-ai-role]');
    if (ro && !ro.disabled) {
      const [f, v] = ro.dataset.aiRole.split(':');
      const off = new Set(offFams());
      if (v === 'main') { if (f === 'gemini') delete deviceKeys.AI_ORDER; else deviceKeys.AI_ORDER = f; off.delete(f); delete deviceKeys.CODE_ORDER; }
      else if (v === 'off') off.add(f); else off.delete(f);
      if (off.size) deviceKeys.AI_OFF = [...off].join(','); else delete deviceKeys.AI_OFF;
      write(KEYS_KEY, deviceKeys); drawView(); window.renderModelChip?.(); return;
    }
    if (e.target.closest('[data-diag]')) {
      diag = { busy: true }; const out = view.querySelector('[data-diag-out]'); if (out) out.innerHTML = diagHtml();
      fetch('/api/diag/gemini').then((r) => r.json()).then((j) => { diag = j; }).catch(() => { diag = { results: [] }; }).finally(() => { const o = view.querySelector('[data-diag-out]'); if (o) o.innerHTML = diagHtml(); });
      return;
    }
    const us = e.target.closest('[data-ai-use]');
    if (us) {
      const [f, v] = us.dataset.aiUse.split(':'); const m = useMap();
      if (v === 'all') delete m[f]; else m[f] = v;
      const str = Object.entries(m).map(([a, b]) => `${a}:${b}`).join(',');
      if (str) deviceKeys.AI_USE = str; else delete deviceKeys.AI_USE;
      write(KEYS_KEY, deviceKeys); drawView(); return;
    }
    if (e.target.closest('.st-keys')) return; // Klicks im aufgeklappten Bereich (Feld) klappen nicht zu
    const ed = e.target.closest('[data-edit]');
    if (ed) { const id = ed.dataset.edit; foldTo('.st-keys', '.st-prov', () => { editing = editing === id ? null : id; keyView.shown.clear(); keyView.edit = null; }); return; }
    if (e.target.closest('[data-cancel]')) { editing = null; drawView(); return; }
    if (e.target.closest('[data-remove]')) {
      delete deviceKeys[editing]; write(KEYS_KEY, deviceKeys); editing = null; drawView(); return;
    }
    const md = e.target.closest('[data-ap-mode]');
    if (md) { window.Appearance?.set({ mode: md.dataset.apMode }); drawView(); return; }
    const cu = e.target.closest('[data-ap-custom]');
    if (cu) {
      // eigener Farbwähler (derselbe wie im Kalender): Vorschau live, „Übernehmen“ legt die Farbe in die Reihe darunter
      const host = view.querySelector('[data-acc-host]'), ap = window.Appearance;
      if (host.firstChild) { ap.set({ accent: host._before }); host.replaceChildren(); return; }
      host._before = ap.get().accent;
      host.append(UIKit.colorPicker(ap.ACCENTS.includes(host._before) ? '#5b8cff' : host._before, (hex, done) => {
        hex = hex.toLowerCase(); ap.set({ accent: hex });
        if (done) { addAccent(hex); drawView(); }
      }));
      return;
    }
    if (e.target.closest('.tk-picker')) return;
    const ac = e.target.closest('[data-ap-accent]');
    if (ac) { window.Appearance?.set({ accent: ac.dataset.apAccent }); drawView(); return; }
    const gt = e.target.closest('[data-ap-glasstone]');
    if (gt) { window.Appearance?.set({ glassTone: gt.dataset.apGlasstone }); drawView(); return; }
    const lg = e.target.closest('[data-lang]');
    if (lg) { window.I18n?.set(lg.dataset.lang); drawView(); return; }
    const ft = e.target.closest('[data-ap-font]');
    if (ft) { window.Appearance?.set({ font: ft.dataset.apFont }); drawView(); return; }
    const tl = e.target.closest('[data-ap-tiles]');
    if (tl) { window.Appearance?.set({ tiles: Number(tl.dataset.apTiles) }); drawView(); return; }
    for (const h of hooks(page)) { try { if (h.click?.(e, drawView)) return; } catch {} }
    // Name: steht immer als Feld da (Text links); Enter oder Wegtippen übernimmt – siehe „focusout“ unten
    const nb = e.target.closest('[data-name-edit]');
    if (nb) {
      const inp = document.createElement('input');
      inp.className = 'st-name-edit'; inp.maxLength = 32; inp.value = nameOf(); inp.setAttribute('data-name', ''); inp.setAttribute('aria-label', 'Name'); inp.spellcheck = false;
      const back = () => { if (!inp.isConnected) return; write(NAME_KEY, inp.value.trim()); applyName(); nb.textContent = nameOf(); inp.replaceWith(nb); };
      inp.addEventListener('blur', back);
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); inp.blur(); } });
      nb.replaceWith(inp); inp.focus(); inp.select();
      return;
    }
    const lo = e.target.closest('[data-logout]');
    if (lo) { lo.disabled = true; lo.textContent = 'Abmelden …'; window.Auth?.logout(); return; }
    if (wsClick(e)) return;
    const ag = e.target.closest('[data-agent]');
    if (ag) { window.PixelDogs?.select(ag.dataset.agent); setTimeout(drawView, 50); }
  });
  // Schriftstärke (16.11.): Regler in Prozent – Zahl und Spur sofort, die Schrift selbst kurz nach dem Ziehen (lädt evtl. neu)
  let fwT = 0;
  view.addEventListener('input', (e) => {
    const r = e.target.closest?.('[data-ap-wrange]'); if (!r) return;
    const ap = window.Appearance, v = Number(r.value);
    r.parentElement.style.setProperty('--p', `${((v - ap.W_MIN) / (ap.W_MAX - ap.W_MIN)) * 100}%`);
    const lab = view.querySelector('[data-fw-val]'); if (lab) lab.textContent = `${v} %`;
    clearTimeout(fwT); fwT = setTimeout(() => ap.set({ weight: v }), 220);
  });
  view.addEventListener('focusout', (e) => { if (!e.target.matches?.('[data-name-live]')) return; write(NAME_KEY, e.target.value.trim()); applyName(); e.target.value = nameOf(); });
  view.addEventListener('keydown', (e) => { if (e.target.matches?.('[data-name-live]') && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); e.target.blur(); } });
  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ef = e.target.closest('form[data-key-edit]');
    if (ef && editing) { // bearbeiteten Schlüssel übernehmen (leer = unverändert lassen)
      const v = ef.querySelector('input').value.trim(), ks = keyList(editing), i = +ef.dataset.keyEdit;
      if (v.length >= 8) { ks[i] = v.slice(0, 400); deviceKeys[editing] = [...new Set(ks)].join('\n'); write(KEYS_KEY, deviceKeys); }
      keyView.edit = null; drawView(); return;
    }
    const sf = e.target.closest('[data-ws-share]');
    if (sf) {
      const inp = sf.querySelector('input'), btn = sf.querySelector('button'), mail = inp.value.trim();
      if (!mail) { inp.focus(); return; }
      btn.disabled = true; btn.textContent = 'Senden …';
      try { await window.Workspaces.share(wst.open, mail); wst.msg = { text: `Einladung an ${mail} gesendet.` }; } catch (err) { wst.msg = { text: err.message, err: true }; }
      drawView(); return;
    }
    const form = e.target.closest('form[data-key]');
    const v = form?.querySelector('.st-key-in').value.trim();
    if (!form || !v) { form?.querySelector('.st-key-in').focus(); return; }
    const id = form.dataset.key, multi = PROVIDERS.find((x) => x.id === id)?.multi;
    const add = v.split(/[\s,;]+/).map((k) => k.trim()).filter((k) => k.length >= 8).map((k) => k.slice(0, 400));
    deviceKeys[id] = (multi ? [...new Set([...keyList(id), ...add])].slice(0, 10) : add.slice(0, 1)).join('\n');
    write(KEYS_KEY, deviceKeys);
    drawView(); // bleibt aufgeklappt – man sieht den neuen Schlüssel in der Liste
    view.querySelector('.st-key-in')?.focus();
  });
  // Workspace-Name: übernommen beim Verlassen des Felds oder mit Enter
  view.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editing) { e.stopPropagation(); editing = null; drawView(); }
    if (e.key === 'Enter' && e.target.matches('[data-ws-name]')) { e.preventDefault(); e.target.blur(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-ws-row]') && e.target === e.target.closest('[data-ws-row]')) { e.preventDefault(); e.target.click(); }
  });
  view.addEventListener('change', (e) => {
    for (const h of hooks(page)) { try { if (h.change?.(e)) return; } catch {} }
    if (e.target.matches('[data-ws-file]')) wsUpload(wst.open, e.target.files?.[0]);
    if (e.target.matches('[data-ws-name]') && !e.target.readOnly) { window.Workspaces.rename(wst.open, e.target.value); drawView(); }
  });
  view.addEventListener('input', (e) => {
    for (const h of hooks(page)) { try { if (h.input?.(e)) return; } catch {} }
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

  // Symbol-Menü schließt bei Klick daneben
  document.addEventListener('pointerdown', (e) => { if (wst.ic && !e.target.closest('.st-ws-menu, [data-ws-ic]')) { wst.ic = false; drawView(); } }, true);
  loadStatus();
  // von außen neu zeichnen (z. B. Mini-App gespeichert, Agent erstellt) – nur wenn offen und kein Feld gerade bearbeitet wird
  const redraw = () => { if (app.classList.contains('settings-open') && !view.querySelector('textarea:focus, input:focus')) drawView(); };
  window.Settings = { open, close, redraw };
})();
