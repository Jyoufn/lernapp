/* ===================================================================
   Coding-Agent (nur Agent „Coden“): die KI schreibt Dateien und Terminal-Befehle als Blöcke
     ````file:pfad/datei.ext   …Inhalt…   ````        ```terminal   befehl   ```
   Der Server prüft danach den Code (lib/codecheck.js) und hängt einen ```check-Block an; bei Fehlern folgt eine Korrekturrunde.
   - im Chat werden daraus Arbeitsschritte untereinander: „Ordner angelegt“, „Datei angelegt/geändert“ (je Datei eine Zeile,
     Icon nach Dateityp), „Terminal“, „Code geprüft“ bzw. „Fehler gefunden“
   - Code-Fenster rechts (Symbol oben rechts im Chat): erst schmal mit der Dateistruktur, dann breit mit Code (Baum daneben) bzw. Vorschau
   - Vorschau: die Dateien liegen nur im Speicher des Servers (noch nicht auf dem PC) unter /vorschau/<chat-id>/;
     Laufzeitfehler darin erscheinen unten in der Vorschau mit „Beheben“
   - Befehle werden vorerst nur angezeigt, nicht ausgeführt
   =================================================================== */
const CodeAgent = (() => {
  const OPEN = /^(`{3,})(?:file:\s*(\S[^`]*?)|(terminal|check|read|plan|run))\s*$/;

  /* Text in Abschnitte zerlegen: Text · Datei · Befehl · Prüfung (offene Blöcke am Ende = wird gerade geschrieben) */
  function split(text) {
    const lines = String(text || '').split('\n');
    const out = [];
    let buf = [];
    const flush = () => { if (buf.length) out.push({ type: 'text', text: buf.join('\n') }); buf = []; };
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(OPEN);
      if (!m) { buf.push(lines[i]); continue; }
      const close = new RegExp(`^\`{${m[1].length},}\\s*$`);
      const body = [];
      let done = false;
      for (i++; i < lines.length; i++) {
        if (close.test(lines[i])) { done = true; break; }
        body.push(lines[i]);
      }
      flush();
      if (m[3] === 'terminal') out.push({ type: 'term', cmd: body.join('\n').trim(), done });
      else if (m[3] === 'check') { if (done) out.push({ type: 'check', ...parseCheck(body.join('\n')) }); }
      else if (m[3] === 'run') { if (done) { try { out.push({ type: 'run', ...JSON.parse(body.join('\n')) }); } catch {} } }
      else if (m[3] === 'read') { if (done) out.push({ type: 'read', path: body.join('\n').trim() }); }
      else if (m[3] === 'plan') { if (done) { try { out.push({ type: 'plan', steps: JSON.parse(body.join('\n')).steps || [] }); } catch {} } }
      else out.push({ type: 'file', path: cleanPath(m[2]), content: body.join('\n'), done });
    }
    flush();
    return out;
  }
  function parseCheck(json) {
    try { const o = JSON.parse(json); return { round: o.round || 1, problems: Array.isArray(o.problems) ? o.problems : [] }; } catch { return { round: 1, problems: [] }; }
  }
  // nur relative Pfade im Projekt: keine Laufwerke, kein „..“, nur „/“
  function cleanPath(p) {
    return String(p || '').replace(/["'`]/g, '').replace(/\\/g, '/').split('/')
      .filter((s) => s && s !== '.' && s !== '..' && !/:/.test(s)).join('/').slice(0, 200) || 'datei.txt';
  }
  // Einblenden (makeRenderer): steht die Anzeige mitten in einem Block, der schon vollständig angekommen ist,
  // springt sie ans Blockende – der Schritt erscheint als fertige Zeile statt Zeichen für Zeichen mit Lade-Kreisel
  function revealTo(text, shown) {
    let pos = 0;
    while (pos < text.length) {
      const nl = text.indexOf('\n', pos);
      const lineEnd = nl < 0 ? text.length : nl;
      const m = text.slice(pos, lineEnd).match(OPEN);
      if (m) {
        const close = new RegExp(`\n\`{${m[1].length},}[ \t]*(?=\n|$)`, 'g');
        close.lastIndex = lineEnd;
        const c = close.exec(text);
        const end = c ? c.index + c[0].length : -1;
        if (pos >= shown) return shown;
        if (end < 0) return shown; // Block wird noch geschrieben
        if (shown < end) return end;
        pos = end;
        continue;
      }
      if (nl < 0) break;
      pos = nl + 1;
    }
    return shown;
  }
  const has = (text) => /^`{3,}(?:file:|(?:terminal|check|read|plan|run)\s*$)/m.test(String(text || ''));

  /* ---------- Dateityp-Icons (wie im Dateibaum eines Editors: farbiges Zeichen, ohne Kachel) ---------- */
  const ext = (p) => (p.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const GLYPH = { html: ['g-html', '&lt;&gt;'], htm: ['g-html', '&lt;&gt;'], css: ['g-css', '#'], scss: ['g-css', '#'], json: ['g-json', '{}'], md: ['g-md', 'M↓'], py: ['g-py', 'py'] };
  const BOX = { js: ['b-js', 'JS'], mjs: ['b-js', 'JS'], cjs: ['b-js', 'JS'], jsx: ['b-js', 'JS'], ts: ['b-ts', 'TS'], tsx: ['b-ts', 'TS'] };
  function fileIcon(p) {
    const e = ext(p);
    if (BOX[e]) return `<span class="ca-fic box ${BOX[e][0]}">${BOX[e][1]}</span>`;
    if (GLYPH[e]) return `<span class="ca-fic glyph ${GLYPH[e][0]}">${GLYPH[e][1]}</span>`;
    if (/^(png|jpe?g|gif|webp|svg|ico|avif)$/.test(e)) return `<span class="ca-fic img">${icon('f-image', 14)}</span>`;
    return `<span class="ca-fic doc">${icon('f-file', 14)}</span>`;
  }
  const folderIcon = () => `<span class="ca-fic dir">${icon('f-folder', 14)}</span>`;
  const lineCount = (s) => (s ? s.split('\n').length : 0);
  const chev = '<svg class="ca-chev" width="14" height="14"><use href="#f-chevron-down"/></svg>';

  /* ---------- Im Chat: Blöcke durch Platzhalter ersetzen (vor Markdown) und danach als Arbeitsschritte einsetzen ---------- */
  function mark(text, store) {
    store.parts = [];
    return split(text).map((s) => {
      if (s.type === 'text') return s.text;
      store.parts.push(s);
      return `\n\n@@CA${store.parts.length - 1}@@\n\n`;
    }).join('');
  }
  const row = (ic, title, extra = '', body = '') => `<div class="ca-step${body ? ' foldable' : ''}"><button type="button" class="ca-step-h">`
    + `<span class="ca-ic">${ic}</span><span class="ca-t">${title}</span>${extra}${body ? chev : ''}</button>`
    + (body ? `<div class="ca-step-b"><div>${body}</div></div>` : '') + '</div>';
  function fileRow(f, existed) {
    const name = f.path.split('/').pop(), dir = f.path.split('/').slice(0, -1).join('/');
    const verb = !f.done ? 'Schreibt' : existed ? 'Datei geändert' : 'Datei angelegt';
    return `<div class="ca-step ca-file" data-path="${escapeHtml(f.path)}"><button type="button" class="ca-step-h ca-open">`
      + `<span class="ca-ic">${f.done ? fileIcon(f.path) : '<i class="ca-spin"></i>'}</span>`
      + `<span class="ca-t"><span class="ca-v">${verb}</span> <b>${escapeHtml(name)}</b>${dir ? ` <span class="ca-m">${escapeHtml(dir)}</span>` : ''}</span>`
      + `${f.done ? `<span class="ca-plus">+${lineCount(f.content)}</span>` : ''}</button></div>`;
  }
  const dirRow = (d) => row(folderIcon(), `<span class="ca-v">Ordner angelegt</span> <b>${escapeHtml(d.split('/').pop())}</b>${d.includes('/') ? ` <span class="ca-m">${escapeHtml(d.split('/').slice(0, -1).join('/'))}</span>` : ''}`);
  function termRow(t) {
    const cmds = t.cmd.split('\n').filter(Boolean);
    return row(`<span class="ca-fic term">${icon('f-terminal', 14)}</span>`, `<span class="ca-v">Terminal</span> <code>${escapeHtml(cmds[0] || '…')}</code>${cmds.length > 1 ? ` <span class="ca-m">+${cmds.length - 1}</span>` : ''}`, '',
      `<div class="ca-termbox">${cmds.map((c) => `<div><span class="ca-ps">$</span> ${escapeHtml(c)}</div>`).join('')}<div class="ca-note">Wird vorerst nur angezeigt, nicht ausgeführt</div></div>`);
  }
  // Lesen (lokaler Agent): „Projekt angesehen“ bzw. „Datei gelesen name“
  const readRow = (r) => (r.path === '*' ? row(`<span class="ca-fic dir">${icon('f-search', 14)}</span>`, '<span class="ca-v">Projekt angesehen</span>')
    : r.path.startsWith('bild:') ? row(`<span class="ca-fic img">${icon('f-image', 14)}</span>`, `<span class="ca-v">Bild angesehen</span> <b>${escapeHtml(r.path.slice(5))}</b>`)
      : row(fileIcon(r.path), `<span class="ca-v">Datei gelesen</span> <b>${escapeHtml(r.path.split('/').pop())}</b>`));
  // Aufgabenliste des Agenten (nur die neueste einer Antwort wird gezeigt, ganz oben) – ohne Kopfzeile,
  // erledigte Punkte mit blauem Haken (nicht durchgestrichen)
  function planRow(pl) {
    return '<div class="ca-step ca-plan">'
      + `<div class="ca-plan-list">${pl.steps.map((x) => `<div class="ca-pi${x.done ? ' done' : ''}"><span class="ca-pm">${x.done ? icon('f-check-circle', 13) : ''}</span>${escapeHtml(x.text)}</div>`).join('')}</div></div>`;
  }
  // Lauftest: App im unsichtbaren Browser gestartet, Knöpfe geklickt, Tasten gedrückt
  function runRow(r) {
    const errs = r.errors || [];
    const what = [(r.clicked || []).length ? `${r.clicked.length} ${r.clicked.length === 1 ? 'Knopf' : 'Knöpfe'} geklickt` : '', r.canvas === false ? 'Canvas leer' : ''].filter(Boolean).join(' · ');
    if (!errs.length) return row(`<span class="ca-fic ok">${icon('f-play', 14)}</span>`, `<span class="ca-v">App getestet</span> <span class="ca-m">keine Fehler${what ? ` · ${escapeHtml(what)}` : ''}</span>`);
    return row(`<span class="ca-fic warn">${icon('f-play', 14)}</span>`, `<span class="ca-v">App getestet</span> <span class="ca-m">${errs.length} Laufzeitfehler – wird behoben</span>`, '',
      `<div class="ca-problems">${errs.map((p) => `<div><b>${escapeHtml(p.file || 'App')}${p.line ? `:${p.line}` : ''}</b> ${escapeHtml(p.message || '')}</div>`).join('')}</div>`);
  }
  function checkRow(c) {
    if (!c.problems.length) return row(`<span class="ca-fic ok">${icon('f-check-circle', 14)}</span>`, `<span class="ca-v">Code geprüft</span> <span class="ca-m">keine Fehler</span>`);
    const n = c.problems.length;
    return row(`<span class="ca-fic warn">${icon('f-alert', 14)}</span>`,
      `<span class="ca-v">${c.round > 1 ? 'Noch offen' : 'Code geprüft'}</span> <span class="ca-m">${n} Fehler gefunden${c.round > 1 ? '' : ' – wird behoben'}</span>`, '',
      `<div class="ca-problems">${c.problems.map((p) => `<div><b>${escapeHtml(p.file || '')}${p.line ? `:${p.line}` : ''}</b> ${escapeHtml(p.message || '')}</div>`).join('')}</div>`);
  }
  // Dateien, die es vor dieser Antwort schon gab (→ „geändert“ statt „angelegt“, Ordner nur beim ersten Mal)
  function knownBefore(target) {
    const msg = target.closest?.('.msg-ai');
    const hist = historyOf(activeTab());
    const upto = msg?._historyAt ?? hist.length;
    const files = new Set();
    hist.slice(0, upto).forEach((m) => { if (m.role === 'assistant' && has(m.text)) split(m.text).forEach((s) => { if (s.type === 'file') files.add(s.path); }); });
    return files;
  }
  // Gruppe gleicher Schritte: eine aufklappbare Zeile „Dateien angelegt · 5“, aufgeklappt die Namen (Dateien anklickbar)
  function groupRow(kind, list) {
    const busy = list.some((f) => f.done === false);
    const cfg = {
      read: [`<span class="ca-fic doc">${icon('f-eye', 14)}</span>`, 'Dateien gelesen'],
      dirs: [folderIcon(), 'Ordner angelegt'],
      created: [busy ? '<i class="ca-spin"></i>' : `<span class="ca-fic doc">${icon('f-files', 15)}</span>`, busy ? 'Schreibt Dateien…' : 'Dateien angelegt'],
      changed: [busy ? '<i class="ca-spin"></i>' : `<span class="ca-fic doc">${icon('f-pencil', 13)}</span>`, busy ? 'Ändert Dateien…' : 'Dateien geändert'],
    }[kind];
    const total = kind === 'created' || kind === 'changed' ? list.reduce((n, f) => n + (f.done ? lineCount(f.content) : 0), 0) : 0;
    const items = list.map((f) => {
      const path = typeof f === 'string' ? f : f.path;
      const name = path.split('/').pop(), dir = path.split('/').slice(0, -1).join('/');
      if (kind === 'dirs') return `<div class="ca-fl dir">${folderIcon()}<span class="ca-fname">${escapeHtml(name)}</span><span class="ca-dir">${escapeHtml(dir)}</span></div>`;
      return `<button type="button" class="ca-fl" data-path="${escapeHtml(path)}">${f.done === false ? '<i class="ca-spin"></i>' : fileIcon(path)}<span class="ca-fname">${escapeHtml(name)}</span>`
        + `<span class="ca-dir">${escapeHtml(dir)}</span>${f.content != null && f.done ? `<span class="ca-plus">+${lineCount(f.content)}</span>` : ''}</button>`;
    }).join('');
    return row(cfg[0], `<span class="ca-v">${cfg[1]}</span> <span class="ca-m">${list.length}</span>`, total ? `<span class="ca-plus">+${total}</span>` : '', `<div class="ca-flist">${items}</div>`);
  }
  // nach dem Markdown: Platzhalter-Absätze durch Arbeitsschritte ersetzen. Direkt aufeinanderfolgende Datei-/Lese-Schritte werden
  // zusammengefasst: Dateien gelesen · Ordner angelegt · Dateien angelegt · Dateien geändert – je eine Zeile (bei nur einem Eintrag
  // die Einzelzeile mit Namen). Prüfung, Lauftest und Terminal bleiben eigene Zeilen dazwischen; die Aufgabenliste steht ganz oben.
  function build(target, store) {
    const parts = store.parts || [];
    if (!parts.length) return;
    const open = target._caOpen || (target._caOpen = new Set());
    const known = knownBefore(target);
    const dirs = new Set([...known].map((p) => p.split('/').slice(0, -1).join('/')));
    const lastPlan = [...parts].reverse().find((x) => x.type === 'plan');
    // Platzhalter in Reihenfolge; Plan-Platzhalter fallen weg (der Plan steht oben), Läufe gleichartiger Schritte sammeln
    const runs = [];
    let cur = null;
    target.querySelectorAll('p').forEach((p) => {
      const m = p.textContent.trim().match(/^@@CA(\d+)@@$/);
      if (!m) return;
      const part = parts[+m[1]];
      if (part.type === 'plan') { p.remove(); return; }
      const groupable = part.type === 'file' || (part.type === 'read' && part.path !== '*' && !part.path.startsWith('bild:'));
      if (groupable && cur && cur.last.nextElementSibling === p) { cur.items.push(part); cur.nodes.push(p); cur.last = p; return; }
      if (groupable) { cur = { items: [part], nodes: [p], last: p }; runs.push(cur); return; }
      cur = null;
      runs.push({ single: part, nodes: [p] });
    });
    let k = 0, first = true;
    runs.forEach((r) => {
      let html = '';
      if (r.single) {
        const part = r.single;
        html = part.type === 'term' ? termRow(part) : part.type === 'read' ? readRow(part) : part.type === 'run' ? runRow(part) : checkRow(part);
      } else {
        const read = [], newDirs = [], created = new Map(), changed = new Map();
        r.items.forEach((it) => {
          if (it.type === 'read') { if (!read.includes(it.path)) read.push(it.path); return; }
          const segs = it.path.split('/').slice(0, -1);
          segs.forEach((_, i) => { const d = segs.slice(0, i + 1).join('/'); if (!dirs.has(d)) { dirs.add(d); newDirs.push(d); } });
          if (created.has(it.path)) created.set(it.path, it);
          else if (known.has(it.path)) changed.set(it.path, it);
          else { created.set(it.path, it); known.add(it.path); }
        });
        if (read.length === 1) html += readRow({ path: read[0] }); else if (read.length) html += groupRow('read', read);
        if (newDirs.length === 1) html += dirRow(newDirs[0]); else if (newDirs.length) html += groupRow('dirs', newDirs);
        if (created.size === 1) html += fileRow([...created.values()][0], false); else if (created.size) html += groupRow('created', [...created.values()]);
        if (changed.size === 1) html += fileRow([...changed.values()][0], true); else if (changed.size) html += groupRow('changed', [...changed.values()]);
      }
      if (first && lastPlan) html = planRow(lastPlan) + html;
      first = false;
      const wrap = el('div', 'ca-run');
      wrap.innerHTML = html;
      wrap.querySelectorAll('.ca-step.foldable').forEach((st) => { st.dataset.k = k++; st.classList.toggle('open', open.has(st.dataset.k)); });
      r.nodes.slice(1).forEach((n) => n.remove());
      if (wrap.childNodes.length) r.nodes[0].replaceWith(...wrap.childNodes); else r.nodes[0].remove();
    });
    // nur ein Plan, aber noch kein Schritt: Plan trotzdem zeigen
    if (!runs.length && lastPlan) { const w = el('div'); w.innerHTML = planRow(lastPlan); target.prepend(...w.childNodes); }
    // aufeinanderfolgende Schritte als ruhige Gruppe (ohne Abstand dazwischen)
    target.querySelectorAll('.ca-step').forEach((st) => st.classList.toggle('ca-cont', st.previousElementSibling?.classList.contains('ca-step')));
    live = { target, files: parts.filter((x) => x.type === 'file') };
    queueRefresh();
  }

  /* ---------- Projekt des offenen Chats: alle Dateien aus den Antworten (spätere überschreiben frühere) ---------- */
  let live = null;
  function projectFiles(tab = activeTab()) {
    const files = new Map();
    if (!tab || tab.dataset.view) return files;
    historyOf(tab).forEach((m) => { if (m.role === 'assistant' && has(m.text)) split(m.text).forEach((s) => { if (s.type === 'file') files.set(s.path, s.content); }); });
    if (live?.target.isConnected && tab.classList.contains('active') && chat.contains(live.target)) live.files.forEach((f) => files.set(f.path, f.content));
    return new Map([...files].sort(([a], [b]) => a.localeCompare(b)));
  }

  /* ---------- Code-Fenster ----------
     Klick aufs Code-Symbol → erst ein schmales Fenster mit der Dateistruktur (der Chat bleibt groß).
     Klick auf eine Datei bzw. „Vorschau“ → das Fenster wird breit: Code mit dem Dateibaum daneben, oder die Vorschau;
     „‹“ führt zurück zur schmalen Liste. Die Breite lässt sich am linken Rand ziehen (gemerkt, Doppelklick = Standard). */
  let win = null, btn = null;
  const ui = { file: null, view: 'files', open: false, query: '', sent: '' };
  const WIDTH_KEY = 'code.width';
  const appEl = () => document.getElementById('app');
  const searchBox = (cls) => `<label class="cw-search ${cls}">${icon('f-search', 13)}<input type="search" placeholder="Dateien suchen" aria-label="Dateien suchen"></label>`;
  function mount() {
    if (win) return;
    btn = el('button', 'icon-btn ca-btn', icon('f-codewin', 16));
    btn.type = 'button';
    btn.id = 'codeBtn';
    btn.hidden = true;
    btn.setAttribute('aria-label', 'Code-Fenster');
    btn.title = 'Code-Fenster ein-/ausklappen';
    btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!ui.open); });
    document.querySelector('.chats-wrap')?.prepend(btn);

    win = el('aside', 'codewin');
    win.id = 'codeWin';
    win.setAttribute('aria-label', 'Code-Fenster');
    win.innerHTML = `<div class="cw-grip" role="separator" aria-orientation="vertical" aria-label="Breite des Code-Fensters ändern" title="Ziehen: Breite ändern · Doppelklick: Standard"><i></i></div>
      <div class="cw-head">
        <button type="button" class="icon-btn cw-back" aria-label="Alle Dateien" title="Alle Dateien">${icon('f-back', 14)}</button>
        <span class="cw-title"></span><span class="flex-spacer"></span>
        <div class="cw-seg" role="tablist"><span class="cw-seg-pill" aria-hidden="true"></span>
          <button type="button" data-view="code" role="tab">${icon('f-codewin', 13)}Code</button><button type="button" data-view="preview" role="tab">${icon('f-globe', 13)}Vorschau</button></div>
        <button type="button" class="icon-btn cw-close" aria-label="Code-Fenster schließen" title="Schließen">${icon('f-x', 14)}</button>
      </div>
      <div class="cw-stage">
        <div class="cw-view" data-view="files">
          ${searchBox('')}
          <div class="cw-list"></div>
          <button type="button" class="cw-prevbtn">${icon('f-globe', 14)}Vorschau öffnen</button>
        </div>
        <div class="cw-view" data-view="code">
          <div class="cw-code"></div>
          <nav class="cw-tree" aria-label="Dateien">${searchBox('small')}<div class="cw-list"></div></nav>
        </div>
        <div class="cw-view" data-view="preview">
          <div class="cw-pvbar"><button type="button" class="icon-btn cw-reload" aria-label="Neu laden" title="Neu laden">${icon('f-refresh', 14)}</button>
            <div class="cw-url">${icon('f-globe', 13)}<span></span></div>
            <button type="button" class="cw-openext">${icon('f-link', 13)}Im Browser öffnen</button></div>
          <div class="cw-pvstage"></div>
          <div class="cw-err" hidden><span class="cw-err-ic">${icon('f-alert', 14)}</span><span class="cw-err-t"></span><button type="button" class="cw-err-fix">Beheben</button><button type="button" class="icon-btn cw-err-x" aria-label="Ausblenden">${icon('f-x', 12)}</button></div>
        </div>
      </div>`;
    appEl()?.insertBefore(win, document.getElementById('rpane'));
    try { const w = Number(localStorage.getItem(WIDTH_KEY)); if (w) appEl()?.style.setProperty('--cw-w', `${w}px`); } catch {}
    win.querySelector('.cw-close').addEventListener('click', () => setOpen(false));
    win.querySelector('.cw-back').addEventListener('click', () => setView('files'));
    win.querySelectorAll('.cw-seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    win.querySelector('.cw-prevbtn').addEventListener('click', () => setView('preview'));
    win.querySelectorAll('.cw-list').forEach((l) => l.addEventListener('click', (e) => { const f = e.target.closest('[data-path]'); if (f) { ui.file = f.dataset.path; setView('code'); } }));
    win.querySelectorAll('.cw-search input').forEach((inp) => inp.addEventListener('input', (e) => {
      ui.query = e.target.value.trim().toLowerCase();
      win.querySelectorAll('.cw-search input').forEach((o) => { if (o !== inp) o.value = e.target.value; });
      renderList(projectFiles());
    }));
    win.querySelector('.cw-reload').addEventListener('click', () => { ui.sent = ''; preview(true); });
    win.querySelector('.cw-openext').addEventListener('click', async () => {
      if (typeof runOf === 'function' && runOf(activeTab())) { showHint('Der Agent programmiert noch – gleich fertig'); return; }
      if (await sync()) window.open(previewUrl(), '_blank', 'noopener');
    });
    win.querySelector('.cw-err-x').addEventListener('click', () => { win.querySelector('.cw-err').hidden = true; });
    win.querySelector('.cw-err-fix').addEventListener('click', fixRuntimeError);
    wireGrip(win.querySelector('.cw-grip'));
    window.addEventListener('message', onPreviewMessage);
    window.addEventListener('resize', clampWidth);
    // Chat: Datei-Zeile öffnet die Datei, andere Schritte klappen auf/zu. pointerdown statt click: während des Schreibens
    // wird die Antwort laufend neu gezeichnet – ein Klick (Drücken + Loslassen auf demselben Element) käme sonst nie an.
    document.getElementById('chat')?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const f = e.target.closest('.ca-file, .ca-fl[data-path]'); // Einzelzeile oder Eintrag in einer Gruppe
      if (f) { e.preventDefault(); ui.file = f.dataset.path; setOpen(true, 'code'); return; }
      const h = e.target.closest('.ca-step.foldable > .ca-step-h');
      if (!h) return;
      e.preventDefault();
      const step = h.parentElement;
      let md = step.parentElement;
      while (md && !md._caOpen) md = md.parentElement; // die Antwort, die sich offene Schritte merkt (build)
      md = md || step.parentElement;
      step.classList.toggle('open');
      const set = md._caOpen || (md._caOpen = new Set());
      if (step.classList.contains('open')) set.add(step.dataset.k); else set.delete(step.dataset.k);
    });
    window.addEventListener('chat-tab-switched', () => { stopPreview(); ui.file = null; ui.sent = ''; ui.view = 'files'; live = null; refresh(); });
  }
  // Breite ziehen: links am Fenster; Grenze = so breit, dass der Chat (bei offener Sidebar) mindestens 600 px behält
  const maxWidth = () => Math.max(380, (appEl()?.clientWidth || 1200) - (document.querySelector('.sidebar')?.getBoundingClientRect().width || 0) - 616); // Chat behält mind. 600 px
  function clampWidth() {
    const cur = parseFloat(appEl()?.style.getPropertyValue('--cw-w'));
    if (cur && cur > maxWidth()) appEl()?.style.setProperty('--cw-w', `${maxWidth()}px`);
  }
  function wireGrip(grip) {
    const setW = (w) => { const c = Math.round(Math.min(maxWidth(), Math.max(380, w))); appEl()?.style.setProperty('--cw-w', `${c}px`); return c; };
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const startX = e.clientX, startW = win.getBoundingClientRect().width;
      let last = startW;
      appEl()?.classList.add('cw-resizing');
      const move = (ev) => { last = setW(startW + (startX - ev.clientX)); };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        appEl()?.classList.remove('cw-resizing');
        try { localStorage.setItem(WIDTH_KEY, String(last)); } catch {}
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up, { once: true });
      grip.addEventListener('pointercancel', up, { once: true });
    });
    grip.addEventListener('dblclick', () => { appEl()?.style.removeProperty('--cw-w'); try { localStorage.removeItem(WIDTH_KEY); } catch {} });
  }
  function setOpen(open, view = 'files') {
    mount();
    ui.open = open && projectFiles().size > 0;
    appEl()?.classList.toggle('cw-open', ui.open);
    btn.classList.toggle('on', ui.open);
    btn.setAttribute('aria-expanded', String(ui.open));
    if (ui.open) { clampWidth(); setView(view); } else { stopPreview(); appEl()?.classList.remove('cw-wide'); }
  }
  function setView(v) {
    ui.view = v;
    appEl()?.classList.toggle('cw-wide', ui.open && v !== 'files');
    win.classList.toggle('wide', v !== 'files');
    win.querySelector('.cw-seg').dataset.on = v;
    win.querySelectorAll('.cw-seg button').forEach((b) => { b.classList.toggle('on', b.dataset.view === v); b.setAttribute('aria-selected', String(b.dataset.view === v)); });
    win.querySelectorAll('.cw-view').forEach((x) => x.classList.toggle('on', x.dataset.view === v));
    if (v !== 'preview') stopPreview();
    render();
  }
  // Vorschau nicht sichtbar (Fenster zu, Code/Dateiliste, anderer Chat) → die App darin ganz beenden: kein Ton, keine Meldungen,
  // keine Rechenlast im Hintergrund. Beim nächsten Öffnen startet sie frisch.
  function stopPreview() {
    win?.querySelector('.cw-pvstage')?.replaceChildren();
    if (win) win.querySelector('.cw-err').hidden = true;
  }

  let refreshT = 0;
  function queueRefresh() { clearTimeout(refreshT); refreshT = setTimeout(refresh, 250); }
  function refresh() {
    mount();
    const files = projectFiles();
    const tab = activeTab();
    btn.hidden = !files.size || !tab || !!tab.dataset.view;
    if (!files.size || btn.hidden) { if (ui.open) setOpen(false); return; }
    if (ui.open) render(files);
  }
  function render(files = projectFiles()) {
    if (!win || !ui.open) return;
    if (!ui.file || !files.has(ui.file)) ui.file = files.has('index.html') ? 'index.html' : [...files.keys()][0];
    const name = ui.file || '';
    const title = win.querySelector('.cw-title');
    if (ui.view === 'files') title.innerHTML = `<b>${escapeHtml(chatOf(activeTab())?.title || 'Projekt')}</b><span class="cw-count">${files.size} ${files.size === 1 ? 'Datei' : 'Dateien'}</span>`;
    else if (ui.view === 'code') title.innerHTML = name ? `${fileIcon(name)}<span class="cw-fname">${escapeHtml(name)}</span>` : '';
    else title.innerHTML = `<span class="cw-fname">${escapeHtml(chatOf(activeTab())?.title || 'Vorschau')}</span>`;
    const code = win.querySelector('.cw-code');
    const src = files.get(name) ?? '';
    if (code._src !== src || code._name !== name) {
      const same = code._name === name;
      code._src = src; code._name = name;
      code.innerHTML = src.split('\n').map((l, i) => `<div class="cw-ln"><span class="cw-n">${i + 1}</span><span class="cw-c">${highlight(l, ext(name)) || ' '}</span></div>`).join('');
      if (!same) code.scrollTo({ top: 0, left: 0 });
    }
    renderList(files);
    win.querySelector('.cw-prevbtn').hidden = !entryOf(files);
    if (ui.view === 'preview') preview();
  }
  function renderList(files) {
    const rows = [];
    const shown = new Set();
    [...files.keys()].filter((p) => !ui.query || p.toLowerCase().includes(ui.query)).forEach((p) => {
      const parts = p.split('/');
      parts.slice(0, -1).forEach((seg, i) => {
        const d = parts.slice(0, i + 1).join('/');
        if (shown.has(d)) return;
        shown.add(d);
        rows.push(`<div class="cw-dir" style="--d:${i}">${folderIcon()}<span>${escapeHtml(seg)}</span></div>`);
      });
      rows.push(`<button type="button" class="cw-fi${p === ui.file && ui.view === 'code' ? ' on' : ''}" data-path="${escapeHtml(p)}" style="--d:${parts.length - 1}">${fileIcon(p)}<span>${escapeHtml(parts[parts.length - 1])}</span></button>`);
    });
    const html = rows.join('') || '<div class="cw-empty">Keine Treffer</div>';
    win.querySelectorAll('.cw-list').forEach((l) => { l.innerHTML = html; });
  }
  const entryOf = (files) => (files.has('index.html') ? 'index.html' : [...files.keys()].find((p) => /\.html?$/i.test(p)));

  /* ---------- Vorschau: Dateien an den Server (nur Speicher), dann im Rahmen bzw. im Browser ---------- */
  // Vorschau läuft auf eigenem Port (App-Port + 1) – eigene Herkunft, getrennt von den Daten der App
  const previewUrl = () => `${location.protocol}//${location.hostname}:${ui.port || (Number(location.port || 80) + 1)}/vorschau/${chatId(activeTab())}/`;
  async function sync() {
    const files = projectFiles();
    if (!files.size) return false;
    const body = JSON.stringify({ id: chatId(activeTab()), files: Object.fromEntries(files) });
    if (body === ui.sent) return true;
    try {
      const r = await fetch('/api/vorschau', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error();
      ui.port = (await r.json()).port || ui.port;
      ui.sent = body;
      return true;
    } catch { showHint('Vorschau konnte nicht vorbereitet werden'); return false; }
  }
  async function preview(force = false) {
    if (!win) return;
    const stage = win.querySelector('.cw-pvstage');
    const files = projectFiles();
    const entry = entryOf(files);
    win.querySelector('.cw-url span').textContent = previewUrl().replace(/^https?:\/\//, '') + (entry && entry !== 'index.html' ? entry : '');
    if (!entry) { stage.innerHTML = '<div class="cw-noprev">Keine HTML-Datei – für dieses Projekt gibt es keine Vorschau.</div>'; return; }
    // Agent arbeitet noch → Vorschau wartet (halbfertiger Code würde nur Fehler zeigen); endRun in app.js stößt sie danach an
    if (typeof runOf === 'function' && runOf(activeTab())) {
      if (!stage.querySelector('.cw-wait')) stage.innerHTML = '<div class="cw-noprev cw-wait"><i class="ca-spin"></i>Der Agent programmiert noch – die Vorschau startet, sobald er fertig ist.</div>';
      return;
    }
    if (stage.querySelector('.cw-wait')) force = true;
    const before = ui.sent;
    if (!(await sync())) return;
    if (!ui.open || ui.view !== 'preview') return; // inzwischen zugeklappt oder auf „Code“ gewechselt → nicht starten
    if (!force && before === ui.sent && stage.querySelector('iframe')) return; // nichts geändert
    const frame = document.createElement('iframe');
    frame.title = 'Vorschau';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-pointer-lock'); // eigene Herkunft (anderer Port) → kein Zugriff auf die App
    frame.src = `${previewUrl()}${entry === 'index.html' ? '' : entry}?t=${Date.now()}`;
    win.querySelector('.cw-err').hidden = true;
    ui.errors = [];
    stage.replaceChildren(frame);
  }
  // Laufzeitfehler aus der Vorschau (Melder vom Server, siehe servePreview) → unten in der Vorschau, „Beheben“ fragt den Agenten
  function onPreviewMessage(e) {
    const frame = win?.querySelector('.cw-pvstage iframe');
    if (!frame || e.source !== frame.contentWindow || e.data?.type !== 'ca-error') return;
    ui.errors = [...(ui.errors || []), e.data].slice(-5);
    const last = e.data;
    win.querySelector('.cw-err-t').textContent = `${last.message}${last.file ? ` · ${last.file}${last.line ? `:${last.line}` : ''}` : ''}`;
    win.querySelector('.cw-err').hidden = false;
  }
  function fixRuntimeError() {
    const list = (ui.errors || []).map((x) => `- ${x.message}${x.file ? ` (${x.file}${x.line ? `, Zeile ${x.line}` : ''})` : ''}`);
    if (!list.length || typeof input === 'undefined') return;
    win.querySelector('.cw-err').hidden = true;
    input.value = `In der Vorschau treten diese Fehler auf:\n${[...new Set(list)].join('\n')}\nBitte finde die Ursache und behebe sie.`;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    composer.requestSubmit();
  }

  /* ---------- kleine Hervorhebung: Kommentare, Texte, Schlüsselwörter, Zahlen, Tags ---------- */
  function highlight(line, kind) {
    const s = escapeHtml(line);
    if (kind === 'md' || kind === 'txt') return /^\s*#/.test(line) ? `<span class="hl-c">${s}</span>` : s;
    if (kind === 'html' || kind === 'htm' || kind === 'svg') {
      return s.replace(/(&lt;!--.*?--&gt;)|(&lt;\/?[a-z][\w-]*)|(\s[\w-:]+)(=)|(&quot;[^&]*?&quot;|"[^"]*")|(\/?&gt;)/gi, (m, c, tag, attr, eq, str, end) =>
        c ? `<span class="hl-c">${c}</span>` : tag ? `<span class="hl-t">${tag}</span>` : attr ? `<span class="hl-a">${attr}</span>${eq}` : str ? `<span class="hl-s">${str}</span>` : `<span class="hl-t">${end}</span>`);
    }
    // Kommentar am Zeilenende abtrennen (grob: nicht in Texten)
    let code = s, comment = '';
    const cm = s.match(/(^|[^:"'`])(\/\/.*|#(?![\w-]*\s*[{,:;]).*$)/);
    if (cm && kind !== 'css' && kind !== 'json') { code = s.slice(0, cm.index + cm[1].length); comment = `<span class="hl-c">${cm[2]}</span>`; }
    if (kind === 'css') {
      return code.replace(/(\/\*.*?\*\/)|(&quot;.*?&quot;|'.*?')|(#[0-9a-f]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|%|ms|s|vh|vw)?\b)|^([^{}:]+)(?=\s*\{)/gi, (m, c, str, num, sel) =>
        c ? `<span class="hl-c">${c}</span>` : str ? `<span class="hl-s">${str}</span>` : num ? `<span class="hl-n">${num}</span>` : `<span class="hl-f">${sel}</span>`);
    }
    return code.replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\()|\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|of|in|true|false|null|undefined|this|def|self|None|True|False|elif|pass|lambda)\b/g,
      (m, str, num, fn, kw) => str ? `<span class="hl-s">${str}</span>` : num ? `<span class="hl-n">${num}</span>` : fn ? `<span class="hl-f">${fn}</span>` : `<span class="hl-k">${kw}</span>`) + comment;
  }

  if (typeof document !== 'undefined') {
    const start = () => { mount(); refresh(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
  /* Live-Zeile unter der Antwort, solange der Agent arbeitet: „Datei wird angelegt: src/game.js“, „Prüft den Code“ …
     (Ereignis codestatus vom Server; leerer Text = weg). Steht immer ganz unten, Text wechselt weich. */
  function status(msgEl, text) {
    let live = msgEl.querySelector(':scope > .ca-live');
    if (!text) { if (live) { live.classList.add('out'); setTimeout(() => live.remove(), 200); } return; }
    if (!live || live.classList.contains('out')) {
      live?.remove();
      live = el('div', 'ca-live', '<i class="ca-spin"></i><span class="ca-live-t"></span>');
    }
    if (msgEl.lastElementChild !== live) msgEl.append(live); // immer unter dem bisher Geschriebenen
    const t = live.querySelector('.ca-live-t');
    if (t.textContent !== `${text} …`) { t.textContent = `${text} …`; t.classList.remove('in'); void t.offsetWidth; t.classList.add('in'); }
    if (chat.contains(msgEl)) scrollToBottom();
  }
  return { has, mark, build, refresh: queueRefresh, split, revealTo, status };
})();
window.CodeAgent = CodeAgent;
