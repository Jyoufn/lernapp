/* ===================================================================
   Einladung zu einem geteilten Workspace – großes Fenster beim Öffnen der App
   - Holt beim Start (und beim Zurückkehren in die App) GET /api/workspaces. Offene Einladungen erscheinen nacheinander.
   - Oben eine kleine Szene: ein Mini-Workspace, in dem mehrere Personen gleichzeitig unterwegs sind (Mauszeiger mit Namen und
     Hund, Nachrichten erscheinen, Avatare oben rechts). Darunter: Name, wer eingeladen hat, Hinweis, dass alles geteilt ist.
   - Annehmen → Workspace kommt dazu und wird geöffnet (Chats/Dokumente laden mit). Ablehnen → Einladung weg.
   =================================================================== */
const WorkspaceInvite = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (name, size = 14) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#f-${name}"/></svg>`;
  const dog = (id, size = 20) => window.PixelDogs?.svg?.(id, size) || '';
  const CURSOR = (c) => `<svg class="wi-arrow" width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M1.5 1.2v12.4l3.3-3.1 2.2 4.6 2.3-1.1-2.2-4.5h4.6z" fill="${c}" stroke="#0e0e0e" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
  let queue = [], shown = false, busy = false;

  // Szene: Mini-Workspace mit Seitenleiste, Nachrichten, Avataren und mehreren Mauszeigern
  function scene(inv) {
    const owner = inv.from || 'Jemand';
    const people = [
      { name: owner, dog: inv.dog || 'general', c: '#6d9fff', k: 'a' },
      { name: 'Du', dog: window.Workspaces?.get?.('main')?.dog || 'research', c: '#4ade80', k: 'b' },
      ...(inv.members > 1 ? [{ name: `+${inv.members - 1}`, dog: 'learn', c: '#f472b6', k: 'c' }] : []),
    ];
    return `<div class="wi-stage" aria-hidden="true">
      <div class="wi-win">
        <div class="wi-bar"><i></i><i></i><i></i><span class="wi-bar-t">${esc(inv.name)}</span>
          <span class="wi-stack">${people.map((p, i) => `<span class="wi-av" style="--i:${i}">${dog(p.dog, 20)}</span>`).join('')}</span></div>
        <div class="wi-body">
          <div class="wi-side"><b></b><b></b><b class="on"></b><b></b></div>
          <div class="wi-main">
            <div class="wi-msg m1"><span class="wi-mav">${dog(people[0].dog, 20)}</span><span class="wi-lines"><i style="width:78%"></i><i style="width:52%"></i></span></div>
            <div class="wi-msg m2 me"><span class="wi-lines"><i style="width:64%"></i></span><span class="wi-mav">${dog(people[1].dog, 20)}</span></div>
            <div class="wi-msg m3"><span class="wi-mav">${dog(people[0].dog, 20)}</span><span class="wi-typing"><i></i><i></i><i></i></span></div>
          </div>
        </div>
      </div>
      ${people.map((p) => `<span class="wi-cur wi-cur-${p.k}">${CURSOR(p.c)}<span class="wi-tag" style="--c:${p.c}">${dog(p.dog, 20)}${esc(p.name)}</span></span>`).join('')}
    </div>`;
  }

  function show(inv) {
    shown = true;
    const root = document.createElement('div');
    root.className = 'wi-overlay';
    root.innerHTML = `<div class="wi-card" role="dialog" aria-modal="true" aria-labelledby="wiTitle">
      ${scene(inv)}
      <div class="wi-info">
        <div class="wi-kicker">${fi('people', 12)}Geteilter Workspace</div>
        <h2 id="wiTitle">Du wurdest zu einem Workspace hinzugefügt</h2>
        <div class="wi-ws"><span class="wi-ws-dog">${dog(inv.dog || 'general', 24)}</span><span class="wi-ws-t"><b>${esc(inv.name)}</b>
          <small>Von ${esc(inv.from || 'jemandem')} · ${inv.members} ${inv.members === 1 ? 'Person' : 'Personen'}</small></span></div>
        <p class="wi-text">Alle im Workspace sehen dieselben Chats und Dokumente – was jemand schreibt oder ändert, ist für alle gleich.</p>
        <p class="wi-err" hidden></p>
        <div class="wi-actions"><button type="button" class="wi-btn" data-no>Ablehnen</button><button type="button" class="wi-btn primary" data-yes>Annehmen</button></div>
      </div></div>`;
    document.body.append(root);
    requestAnimationFrame(() => root.classList.add('open'));
    const close = () => {
      root.classList.remove('open'); root.classList.add('closing');
      setTimeout(() => { root.remove(); shown = false; next(); }, 260);
    };
    const act = async (accept) => {
      if (busy) return;
      busy = true;
      const btn = root.querySelector(accept ? '[data-yes]' : '[data-no]');
      root.querySelectorAll('.wi-btn').forEach((b) => { b.disabled = true; });
      btn.classList.add('wait');
      try { await window.Workspaces.answer(inv.id, accept); close(); }
      catch (err) {
        const e = root.querySelector('.wi-err'); e.textContent = err.message; e.hidden = false;
        root.querySelectorAll('.wi-btn').forEach((b) => { b.disabled = false; }); btn.classList.remove('wait');
        if (/gibt es nicht mehr/.test(err.message)) setTimeout(close, 1400);
      } finally { busy = false; }
    };
    root.querySelector('[data-yes]').addEventListener('click', () => act(true));
    root.querySelector('[data-no]').addEventListener('click', () => act(false));
    setTimeout(() => root.querySelector('[data-yes]')?.focus(), 80);
  }
  function next() { if (!shown && queue.length) show(queue.shift()); }

  async function check() {
    if (shown || !window.Workspaces?.load) return;
    const o = await window.Workspaces.load();
    const seen = new Set(queue.map((i) => i.id));
    (o?.invites || []).forEach((i) => { if (!seen.has(i.id)) queue.push(i); });
    next();
  }
  window.addEventListener('app-layout-ready', () => setTimeout(check, 700));
  setTimeout(check, 3500); // falls das Layout-Ereignis schon vorbei war
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  return { check, show };
})();
window.WorkspaceInvite = WorkspaceInvite;
