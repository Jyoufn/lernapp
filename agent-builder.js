/* =====================================================================
   Eigene Agenten
   - Agenten-Feld → letzte Karte „Neuer Agent“ → großes Fenster: ein normaler Chat (Allgemein-Hund, Denken, Rückfragen im Eingabefeld),
     der NUR die Einrichtung macht (Server: body.setup = 'agent' → Prompt AGENT_SETUP, keine Suche, keine anderen Themen).
   - Die KI schreibt am Ende einen ```agentprofil-Block: Name, Beschreibung, Figur + Fellfarbe (nur die Pixel-Figuren der App, umgefärbt),
     Grundlage (allgemein/lernen/research/coden), Begrüßung und eine ausführliche Anweisung (prompt) → Karte mit Vorschau → „Agent erstellen“.
   - Gespeichert in localStorage 'agents.custom.v1' (geht ins Konto), erscheint im Agenten-Feld und in Einstellungen → Agenten (bearbeiten, löschen).
   - Anfragen mit eigenem Agenten: agent = Grundlage, custom = { name, prompt } (Server hängt die Anweisung an).
   ===================================================================== */
const AgentBuilder = (() => {
  const KEY = 'agents.custom.v1';
  const MODES = { allgemein: 'general', lernen: 'learn', research: 'research', coden: 'code' };
  const MODE_NAMES = { general: 'Allgemein', learn: 'Lernen', research: 'Research', code: 'Coden' };
  const FIG_NAMES = { havaneser: 'Havaneser', collie: 'Border Collie', golden: 'Golden Retriever', oktopus: 'Oktopus', baer: 'Bär' };
  const FUR_NAMES = { original: 'Original', creme: 'Creme', weiss: 'Weiß', grau: 'Grau', schwarz: 'Schwarz', braun: 'Braun', gold: 'Gold', rot: 'Rot', orange: 'Orange', rosa: 'Rosa', blau: 'Blau', tuerkis: 'Türkis', gruen: 'Grün' };
  const IDEAS = ['Mathe-Nachhilfe, die nur Tipps gibt', 'Vokabeltrainer für Englisch', 'Bewerbungs-Coach', 'Spiele-Programmierer'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 14) => (window.FadeIcons ? FadeIcons.svg(n, s) : '');
  const list = () => { try { const l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } };
  const store = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, 24))); } catch {} window.PixelDogs?.reloadCustom?.(l); window.Settings?.redraw?.(); };
  const byId = (id) => list().find((a) => a.id === id);
  const app = document.getElementById('app');
  const panel = document.querySelector('.panel');
  const tabNow = () => (typeof activeTab === 'function' ? activeTab() : null);
  const chatData = (tab) => (tab && typeof chatOf === 'function' ? chatOf(tab) : null);
  const isSetup = (tab) => !!tab && !tab.dataset.view && chatData(tab)?.setup === 'agent';

  /* ---------- Profil aus dem Block lesen (streng: nur bekannte Figuren/Farben) ---------- */
  function parseProfile(raw) {
    let o = null;
    try { o = JSON.parse(String(raw || '').replace(/[„“]/g, '"')); } catch { return null; }
    if (!o || typeof o !== 'object') return null;
    const name = String(o.name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    const prompt = String(o.prompt || '').trim().slice(0, 9000);
    if (!name || prompt.length < 20) return null;
    const figur = FIG_NAMES[o.figur] ? o.figur : 'havaneser';
    const farbe = FUR_NAMES[o.farbe] ? o.farbe : 'original';
    return { name, prompt, figur, farbe, beschreibung: String(o.beschreibung || '').trim().slice(0, 140), begruessung: String(o.begruessung || '').trim().slice(0, 80),
      verhalten: MODES[String(o.verhalten || '').toLowerCase()] ? String(o.verhalten).toLowerCase() : 'allgemein' };
  }

  /* ---------- Fenster „Neuer Agent“ ---------- */
  let prevDog = null;
  const head = document.createElement('div');
  head.className = 'ags-head';
  head.innerHTML = `<span class="ags-dog"></span><div class="ags-tt"><b>Neuen Agenten erstellen</b><span>Beschreib, wofür er da sein soll – die KI fragt nach, was noch fehlt.</span></div><span class="ags-grow"></span><button type="button" class="ags-x" aria-label="Schließen">${fi('x', 15)}</button>`;
  const ideas = document.createElement('div');
  ideas.className = 'ags-ideas';
  ideas.innerHTML = IDEAS.map((t) => `<button type="button" class="ags-idea">${esc(t)}</button>`).join('');
  if (panel) panel.append(head);
  document.querySelector('.composer-area')?.append(ideas);
  head.querySelector('.ags-x').addEventListener('click', () => close());
  ideas.addEventListener('click', (e) => {
    const b = e.target.closest('.ags-idea'); if (!b) return;
    const inp = document.getElementById('input'); if (!inp) return;
    inp.value = `Ich möchte einen Agenten: ${b.textContent}.`; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus();
  });

  function open(edit = null) {
    if (typeof createTab !== 'function') return;
    window.Settings?.close?.();
    prevDog = window.PixelDogs?.mode || 'general';
    if (prevDog !== 'general') window.PixelDogs?.select('general');
    const tab = createTab(edit ? `${edit.name} bearbeiten` : 'Neuer Agent');
    const c = chatData(tab);
    c.setup = 'agent';
    if (edit) { c.setupBase = edit.id; c.title = `${edit.name} bearbeiten`; c.auto = false; }
    sync();
    if (edit) {
      const inp = document.getElementById('input');
      if (inp) { inp.value = `Ich möchte meinen Agenten „${edit.name}“ ändern: `; inp.dispatchEvent(new Event('input', { bubbles: true })); setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 120); }
    } else setTimeout(() => document.getElementById('input')?.focus(), 120);
  }
  function close(selectId = null) {
    const tab = tabNow();
    if (isSetup(tab) && typeof deleteChat === 'function') deleteChat(tab); // Einrichtungs-Chat verschwindet (neuer leerer Chat an seiner Stelle)
    app?.classList.remove('agent-setup');
    const to = selectId || (prevDog && window.PixelDogs?.DOGS?.[prevDog] ? prevDog : null);
    if (to && to !== window.PixelDogs?.mode) setTimeout(() => window.PixelDogs?.select(to), 60);
    prevDog = null;
    setTimeout(sync, 0);
  }
  let heroText = '';
  function sync() {
    const on = isSetup(tabNow());
    const was = app?.classList.contains('agent-setup');
    app?.classList.toggle('agent-setup', on);
    if (on && !was) requestAnimationFrame(() => app?.classList.add('ags-in'));
    if (!on) app?.classList.remove('ags-in');
    head.querySelector('.ags-dog').innerHTML = window.PixelDogs?.svg('general', 24) || '';
    const base = on && chatData(tabNow())?.setupBase ? byId(chatData(tabNow()).setupBase) : null;
    head.querySelector('.ags-tt b').textContent = base ? `${base.name} bearbeiten` : 'Neuen Agenten erstellen';
    const inp = document.getElementById('input');
    if (inp) { if (on) { inp.dataset.ph0 ||= inp.placeholder; inp.placeholder = 'Wofür soll dein Agent da sein?'; } else if (inp.dataset.ph0) { inp.placeholder = inp.dataset.ph0; delete inp.dataset.ph0; } }
    greet();
  }
  // Hund mittig im leeren Chat: Einrichtung bzw. Begrüßung des eigenen Agenten
  function greet() {
    const t = document.querySelector('#composer .dh-title'); if (!t) return;
    heroText ||= t.textContent;
    const a = byId(window.PixelDogs?.mode);
    t.textContent = isSetup(tabNow()) ? 'Was soll dein Agent können?' : a?.begruessung || heroText;
  }
  window.addEventListener('chat-tab-switched', () => setTimeout(sync, 0));
  document.addEventListener('dogmodechange', () => setTimeout(greet, 0));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app?.classList.contains('agent-setup') && !document.querySelector('.agent-picker.open, .cbx-overlay') && !e.target.closest?.('textarea, input')) close(); });
  setTimeout(sync, 0);

  /* ---------- Profil-Karte im Chat ---------- */
  function card(p, done) {
    const fig = document.createElement('figure');
    fig.className = 'agp';
    if (!done) {
      fig.classList.add('agp-wait');
      fig.innerHTML = `<div class="agp-art"><span class="agp-dot"></span></div><div class="agp-main"><div class="agp-name shimmer">Agent wird zusammengestellt</div></div>`;
      return fig;
    }
    const tab = tabNow(), editId = chatData(tab)?.setupBase || null;
    const existing = list().find((a) => a.id === editId) || list().find((a) => a.name.toLowerCase() === p.name.toLowerCase());
    const art = window.PixelDogs?.previewArt?.(p.figur, p.farbe, 64) || '';
    fig.innerHTML = `<div class="agp-art">${art}</div><div class="agp-main">
        <div class="agp-name">${esc(p.name)}</div>
        <p class="agp-desc">${esc(p.beschreibung || 'Eigener Agent')}</p>
        <div class="agp-tags"><span>${fi('agent', 11)}${esc(MODE_NAMES[MODES[p.verhalten]])}</span><span>${esc(FIG_NAMES[p.figur])}</span><span>${esc(FUR_NAMES[p.farbe])}</span></div>
        <button type="button" class="agp-more" aria-expanded="false">${fi('chevron-right', 10)}<span>Anweisung ansehen</span></button>
        <div class="agp-prompt"><div class="agp-prompt-in">${esc(p.prompt)}</div></div>
      </div>
      <div class="agp-acts"><button type="button" class="agp-btn primary" data-agp="save">${existing ? 'Übernehmen' : 'Agent erstellen'}</button></div>`;
    fig.addEventListener('click', (e) => {
      const more = e.target.closest('.agp-more');
      if (more) { const on = !fig.classList.contains('open'); fig.classList.toggle('open', on); more.setAttribute('aria-expanded', String(on)); more.querySelector('span').textContent = on ? 'Anweisung ausblenden' : 'Anweisung ansehen'; return; }
      const b = e.target.closest('[data-agp]'); if (!b) return;
      if (b.dataset.agp === 'save') {
        const l = list(), id = existing?.id || `u-${Date.now().toString(36)}`;
        const item = { id, ...p, at: Date.now() };
        const i = l.findIndex((a) => a.id === id);
        if (i >= 0) l[i] = item; else l.unshift(item);
        store(l);
        fig.querySelector('.agp-acts').innerHTML = `<span class="agp-ok">${fi('check', 12)}${i >= 0 ? 'Übernommen' : 'Erstellt'}</span><button type="button" class="agp-btn primary" data-agp="start" data-id="${esc(id)}">Chat starten</button>`;
      } else if (b.dataset.agp === 'start') close(b.dataset.id);
    });
    return fig;
  }
  function render(target, text, opts = {}) {
    const pres = target.querySelectorAll('pre:has(code.language-agentprofil)');
    if (!pres.length) return;
    const closed = (String(text).match(/```agentprofil[^\n]*\n[\s\S]*?\n```/g) || []).length;
    const keep = (target._agp ||= new Map());
    pres.forEach((pre, i) => {
      const raw = pre.querySelector('code').textContent;
      const done = !opts.live || i < closed;
      const p = done ? parseProfile(raw) : null;
      const k = done ? `${i}|${raw}` : `${i}|wait`;
      if (done && !p) { pre.remove(); return; }
      if (!keep.has(k)) { const f = card(p, done); if (done && keep.has(`${i}|wait`)) f.classList.add('agp-reveal'); keep.set(k, f); }
      pre.replaceWith(keep.get(k));
    });
  }

  /* ---------- Anfrage: welcher Agent, eigene Anweisung, Einrichtung, Design der Mini-Apps ---------- */
  window.agentPayload = (id, tab = tabNow()) => {
    const look = window.CodeBox?.look?.();
    const extra = look ? { look } : {};
    if (isSetup(tab)) { const base = byId(chatData(tab)?.setupBase); return { agent: 'general', setup: 'agent', ...(base ? { setupBase: { name: base.name, beschreibung: base.beschreibung, figur: base.figur, farbe: base.farbe, verhalten: base.verhalten, begruessung: base.begruessung, prompt: base.prompt } } : {}), ...extra }; }
    const a = byId(id);
    if (a) return { agent: MODES[a.verhalten] || 'general', custom: { name: a.name, prompt: a.prompt, mode: a.verhalten }, ...extra };
    return { agent: id, ...extra };
  };

  /* ---------- Einstellungen → Agenten: eigene Agenten ---------- */
  let delArm = null;
  function settingsHtml() {
    const l = list();
    const rows = l.map((a) => `<div class="st-row ags-row"><span class="st-dog">${window.PixelDogs?.svg(a.id, 24) || ''}</span><span class="st-name">${esc(a.name)}</span><span class="st-muted ags-meta">${esc(MODE_NAMES[MODES[a.verhalten]] || 'Allgemein')}</span><span class="grow"></span>`
      + `${window.PixelDogs?.mode === a.id ? `<span class="st-ok">${fi('check', 12)}Aktiv</span>` : `<button type="button" class="st-btn dark" data-ags-use="${esc(a.id)}">Auswählen</button>`}`
      + `<button type="button" class="ags-ib" data-ags-edit="${esc(a.id)}" aria-label="Bearbeiten">${fi('pencil', 13)}</button><button type="button" class="ags-ib del${delArm === a.id ? ' sure' : ''}" data-ags-del="${esc(a.id)}" aria-label="Löschen">${delArm === a.id ? 'Wirklich?' : fi('trash', 13)}</button></div>`).join('');
    return `<h2>Eigene Agenten</h2><div class="st-card">${rows}<div class="st-row ags-new" data-ags-new role="button" tabindex="0"><span class="ags-plus">${fi('plus', 13)}</span><span class="st-name">Neuen Agenten erstellen</span><span class="grow"></span><span class="st-ws-chev"><svg width="12" height="12" aria-hidden="true"><use href="#o-chev"/></svg></span></div></div>`;
  }
  function settingsClick(e, redraw) {
    const t = e.target;
    if (t.closest('[data-ags-new]')) { open(); return true; }
    const u = t.closest('[data-ags-use]'); if (u) { window.PixelDogs?.select(u.dataset.agsUse); setTimeout(redraw, 60); return true; }
    const ed = t.closest('[data-ags-edit]'); if (ed) { const a = byId(ed.dataset.agsEdit); if (a) open(a); return true; }
    const d = t.closest('[data-ags-del]');
    if (d) {
      const id = d.dataset.agsDel;
      if (delArm !== id) { delArm = id; redraw(); setTimeout(() => { if (delArm === id) { delArm = null; redraw(); } }, 3000); }
      else { delArm = null; store(list().filter((a) => a.id !== id)); }
      return true;
    }
    return false;
  }
  (window.SettingsHooks ||= []).push({ page: 'agents', order: 1, html: settingsHtml, click: settingsClick });

  return { open, close, render, list, parseProfile };
})();
window.AgentBuilder = AgentBuilder;
