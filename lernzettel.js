/* ===================================================================
   Lernzettel (18.11.): Die KI schreibt einen ````lernzettel-Block (Markdown, siehe lib/skills.js). Im Chat steht dafür eine kleine Karte,
   der Zettel selbst öffnet sich rechts neben dem Chat als weißes Blatt (Papier-Stil, Wunsch des Nutzers):
   oben „Lernzettel · Fach · Klasse“, großer Titel, Lesezeit + Kapitel, „Auf einen Blick“-Kasten, Kapitel-Chips, nummerierte Kapitel,
   Merke-/Definition-/Achtung-Kästen, Tabellen, Abbildungen (```illustration), Klausur-Check zum Abhaken.
   Kopfleiste: Als Dokument · PDF · Kopieren · ✕. Während die KI schreibt, wächst das Blatt live mit.
   =================================================================== */
const Lernzettel = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (n, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;

  function parse(raw) {
    const lines = String(raw || '').replace(/\r/g, '').split('\n');
    const out = { title: '', fach: '', klasse: '', body: '' };
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    const t = /^#\s+(.+)$/.exec(lines[i] || '');
    if (t) { out.title = t[1].trim(); i++; }
    for (; i < lines.length; i++) {
      const m = /^\s*(fach|klasse|stufe)\s*:\s*(.+)$/i.exec(lines[i]);
      if (m) { out[/^fach/i.test(m[1]) ? 'fach' : 'klasse'] = m[2].trim(); continue; }
      if (!lines[i].trim()) continue;
      break;
    }
    out.body = lines.slice(i).join('\n');
    return out;
  }
  const chapters = (body) => (String(body).match(/^##\s+(.+)$/gm) || []).map((h) => h.replace(/^##\s+/, '').trim()).filter((h) => !/^auf einen blick/i.test(h));
  const minutes = (body) => Math.max(1, Math.round((String(body).match(/\S+/g) || []).length / 160));

  /* ---------- das Blatt ---------- */
  function sheet(raw, { live = false } = {}) {
    const z = parse(raw);
    const caps = chapters(z.body);
    const box = document.createElement('article');
    box.className = 'lz-sheet';
    const kick = ['Lernzettel', z.fach, z.klasse ? (/^\d/.test(z.klasse) ? `Klasse ${z.klasse}` : z.klasse) : ''].filter(Boolean);
    box.innerHTML = `<div class="lz-kick">${kick.map(esc).join('<i></i>')}</div>
      <h1 class="lz-h1">${esc(z.title || 'Lernzettel')}</h1>
      <div class="lz-meta"><span>Klausur-Vorbereitung</span><span>ca. ${minutes(z.body)} Min. Lesezeit</span>${caps.length ? `<span>${caps.length} Kapitel</span>` : ''}</div>
      <div class="lz-body"></div>`;
    const body = box.querySelector('.lz-body');
    // ==markiert== → <mark>; dann wie eine normale Antwort darstellen (Tabellen, Formeln, Abbildungen …)
    const md = z.body.replace(/==([^=\n]{1,120})==/g, '<mark>$1</mark>');
    try { window.renderMarkdown?.(body, md, { live }); } catch { body.textContent = md; }
    shape(body, caps);
    return box;
  }
  // Nachbearbeitung: „Auf einen Blick“ als Kasten, Kapitel nummerieren, Kästen nach Art, Klausur-Check als Häkchen
  function shape(body, caps) {
    let n = 0;
    body.querySelectorAll(':scope > h2').forEach((h) => {
      if (/^auf einen blick/i.test(h.textContent.trim())) {
        const g = document.createElement('section'); g.className = 'lz-glance';
        const head = document.createElement('h4'); head.textContent = 'Auf einen Blick'; g.append(head);
        let x = h.nextElementSibling;
        while (x && x.tagName !== 'H2') { const nx = x.nextElementSibling; g.append(x); x = nx; }
        h.replaceWith(g);
        if (caps.length > 1) {
          const toc = document.createElement('nav'); toc.className = 'lz-toc';
          toc.innerHTML = caps.map((c, i) => `<button type="button" data-lzgo="${i}"><b>${i + 1}</b>${esc(c.replace(/^\d+[.)]\s*/, ''))}</button>`).join('');
          g.after(toc);
        }
        return;
      }
      n++;
      h.dataset.lzn = String(n);
      h.insertAdjacentHTML('afterbegin', `<span class="lz-n">${String(n).padStart(2, '0')}</span>`);
    });
    body.querySelectorAll('blockquote').forEach((q) => {
      const t = q.textContent.trim().toLowerCase();
      q.classList.add('lz-box', /^(achtung|fehler|vorsicht|typischer fehler)/.test(t) ? 'warn' : /^(definition|begriff)/.test(t) ? 'def' : /^(beispiel)/.test(t) ? 'ex' : 'merke');
    });
    body.querySelectorAll('li').forEach((li) => {
      const cb = li.querySelector(':scope > input[type="checkbox"]');
      const m = !cb && /^\[( |x)\]\s*/i.exec(li.textContent);
      if (!cb && !m) return;
      li.classList.add('lz-check');
      li.closest('ul')?.classList.add('lz-checks');
      if (cb) { cb.disabled = false; cb.removeAttribute('disabled'); }
      else { li.innerHTML = li.innerHTML.replace(/^\s*\[( |x)\]\s*/i, ''); li.insertAdjacentHTML('afterbegin', `<input type="checkbox"${m[1].toLowerCase() === 'x' ? ' checked' : ''}>`); }
    });
  }

  /* ---------- Fenster rechts ---------- */
  let win = null, cur = null; // cur = { raw, key }
  const appEl = () => document.getElementById('app');
  function mount() {
    if (win) return win;
    win = document.createElement('aside');
    win.className = 'lzwin';
    win.setAttribute('aria-label', 'Lernzettel');
    win.innerHTML = `<div class="lz-bar"><span class="lz-bt">Lernzettel</span><span class="lz-chip" hidden></span><span class="lz-grow"></span>
        <button type="button" class="lz-btn g" data-lz="doc">Als Dokument</button><button type="button" class="lz-btn g" data-lz="pdf">PDF</button>
        <button type="button" class="lz-btn" data-lz="copy">Kopieren</button><button type="button" class="lz-btn g lz-x" data-lz="close" aria-label="Schließen">${icon('x', 13)}</button></div>
      <div class="lz-scroll"></div>`;
    appEl()?.insertBefore(win, document.getElementById('rpane'));
    win.addEventListener('click', (e) => {
      const go = e.target.closest('[data-lzgo]');
      if (go) { const h = win.querySelector(`.lz-body h2[data-lzn="${+go.dataset.lzgo + 1}"]`); h?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const b = e.target.closest('[data-lz]'); if (!b || !cur) return;
      const z = parse(cur.raw);
      if (b.dataset.lz === 'close') { close(true); return; }
      if (b.dataset.lz === 'copy') { navigator.clipboard?.writeText(`# ${z.title}\n\n${z.body}`).then(() => flash(b, 'Kopiert')).catch(() => {}); return; }
      if (b.dataset.lz === 'doc') {
        const html = win.querySelector('.lz-body')?.innerHTML || '';
        const d = window.Docs?.add?.({ title: z.title || 'Lernzettel', subtitle: ['Lernzettel', z.fach].filter(Boolean).join(' · '), content: html });
        if (d) { flash(b, 'Gespeichert'); window.Docs?.open?.(d.id); }
        return;
      }
      if (b.dataset.lz === 'pdf') print(z);
    });
    return win;
  }
  function flash(b, txt) { const old = b.textContent; b.textContent = txt; setTimeout(() => { b.textContent = old; }, 1400); }
  function print(z) {
    const s = win.querySelector('.lz-sheet'); if (!s) return;
    const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => `<link rel="stylesheet" href="${l.href}">`).join('');
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${esc(z.title || 'Lernzettel')}</title>${css}<style>@page{margin:14mm}body{background:#fff!important;filter:none!important}.lz-sheet{margin:0 auto;box-shadow:none}</style></head><body class="lz-print">${s.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 600);
  }
  let drawT = 0, lastRaw = '';
  function show(raw, key, { live = false } = {}) {
    mount();
    const changed = !cur || cur.key !== key;
    cur = { raw, key };
    const z = parse(raw);
    const chip = win.querySelector('.lz-chip');
    chip.hidden = !z.fach; chip.textContent = z.fach;
    if (!appEl()?.classList.contains('lz-open')) {
      appEl()?.classList.add('lz-open');
      if (!appEl()?.classList.contains('collapsed')) { win._sb = true; window.setCollapsed?.(true); } // Platz für das Blatt
    }
    const paint = () => {
      if (!cur || cur.raw === lastRaw) return;
      lastRaw = cur.raw;
      const sc = win.querySelector('.lz-scroll'), top = sc.scrollTop;
      sc.replaceChildren(sheet(cur.raw, { live }));
      if (!changed) sc.scrollTop = top;
    };
    clearTimeout(drawT);
    if (changed || !live) { lastRaw = ''; paint(); } else drawT = setTimeout(paint, 350); // live: höchstens ~3× pro Sekunde neu
    document.querySelectorAll('.lz-card').forEach((c) => { const on = c.dataset.key === key; c.classList.toggle('on', on); const g = c.querySelector('.lz-go'); if (g) g.textContent = on ? 'Geöffnet' : 'Öffnen'; });
  }
  function close(user = false) {
    if (!win) return;
    appEl()?.classList.remove('lz-open');
    if (win._sb) { window.setCollapsed?.(false); win._sb = false; }
    if (user && cur) dismissed.add(cur.key);
    cur = null; lastRaw = '';
    document.querySelectorAll('.lz-card.on').forEach((c) => { c.classList.remove('on'); const g = c.querySelector('.lz-go'); if (g) g.textContent = 'Öffnen'; });
  }
  const dismissed = new Set();

  /* ---------- Karte im Chat ---------- */
  function card(raw, key, { live = false } = {}) {
    const z = parse(raw), caps = chapters(z.body).length, pics = (z.body.match(/```illustration/g) || []).length;
    const c = document.createElement('button');
    c.type = 'button';
    c.className = `lz-card${cur?.key === key ? ' on' : ''}`;
    c.dataset.key = key;
    const meta = live ? 'wird geschrieben …' : ['Lernzettel', caps ? `${caps} Kapitel` : '', pics ? `${pics} ${pics === 1 ? 'Abbildung' : 'Abbildungen'}` : ''].filter(Boolean).join(' · ');
    c.innerHTML = `<span class="lz-ti"></span><span class="lz-tx"><b>${esc(z.title || 'Lernzettel')}</b><span>${esc(meta)}</span></span><span class="lz-go">${cur?.key === key ? 'Geöffnet' : 'Öffnen'}</span>`;
    c.addEventListener('click', () => { if (cur?.key === key) close(true); else { dismissed.delete(key); show(raw, key); } });
    return c;
  }
  /* aus renderMarkdown: ````lernzettel-Blöcke → Karte; im offenen Chat öffnet sich das Blatt von selbst (während des Schreibens live) */
  function enhance(target, { live = false } = {}) {
    const pres = target.querySelectorAll('pre:has(code.language-lernzettel)');
    if (!pres.length) return;
    const inChat = target.closest?.('#chat');
    pres.forEach((pre, i) => {
      const raw = pre.querySelector('code').textContent;
      const msg = target.closest('.msg-ai, .msg');
      const host = msg || target;
      host._lzk ||= `lz${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const key = `${host._lzk}:${i}`;
      pre.replaceWith(card(raw, key, { live }));
      if (inChat && live && !msg?._lzFolded) { // Lernzettel entsteht → Zeitleiste einklappen, der Zettel ist jetzt das Wichtige
        const w = msg?.querySelector('.work');
        if (w && !w.classList.contains('collapsed') && typeof window.toggleWork === 'function') { msg._lzFolded = true; window.toggleWork(w, true); }
      }
      if (inChat && !dismissed.has(key) && (live || cur?.key === key)) show(raw, key, { live });
      else if (cur?.key === key) show(raw, key);
    });
  }
  /* Die KI schreibt den Block manchmal mit nur drei Backticks – dann würde ein innerer ```illustration-Block ihn vorzeitig schließen.
     Vor dem Darstellen: Öffnung auf vier Backticks, und das passende Ende (das nicht zu einem inneren Block gehört) ebenso. */
  function fixFence(text) {
    const t = String(text || '');
    if (!/^```lernzettel/m.test(t)) return t;
    const lines = t.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!/^```lernzettel\s*$/.test(lines[i])) continue;
      lines[i] = '````lernzettel';
      let inner = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^```[\w-]+/.test(lines[j]) && !inner) { inner = true; continue; }
        if (/^```\s*$/.test(lines[j])) { if (inner) { inner = false; continue; } lines[j] = '````'; i = j; break; }
      }
    }
    return lines.join('\n');
  }
  window.addEventListener('chat-tab-switched', () => close());
  return { parse, sheet, card, enhance, show, close, fixFence, get open() { return !!cur; } };
})();
window.Lernzettel = Lernzettel;
