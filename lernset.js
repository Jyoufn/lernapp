/* ===================================================================
   Lernsets: Karteikarten, Quiz und Probeklausur (Block ```lernset von der KI)
   - parse(raw): KI-JSON tolerant lesen und prüfen (nur vollständige, auswertbare Fragen)
   - figure(raw): Vorschau im Chat und im Dokument – zeigt den Inhalt selbst (Kartenstapel, erste Frage, Klausurblatt); Antippen → Vollbild
   - open(set): Vollbild-Lernansicht im Fokus: Karteikarten umdrehen und sortieren, Quiz mit Erklärung, Probeklausur mit Zeit,
     Punkten, Korrektur (offene Antworten bewertet die KI: /api/lernset/grade) und Note
   - dialog(opts): Erstellen-Fenster – Art, Thema, Quellen (Dateien, Links, Text, @Chat/@Dokument, Abschnitte des Dokuments), Einstellungen
   =================================================================== */
const Lernset = (() => {
  const fi = (n, s = 14) => (window.FadeIcons ? FadeIcons.svg(n, s) : '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const str = (x, n) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const rich = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'); // **fett** aus der KI, sonst reiner Text
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const KINDS = {
    karten: { name: 'Karteikarten', icon: 'stack', verb: 'Lernen', unit: ['Karte', 'Karten'] },
    quiz: { name: 'Quiz', icon: 'target', verb: 'Quiz starten', unit: ['Frage', 'Fragen'] },
    klausur: { name: 'Probeklausur', icon: 'clipboard', verb: 'Klausur schreiben', unit: ['Aufgabe', 'Aufgaben'] },
  };
  const ALIAS = { karten: 'karten', karteikarten: 'karten', lernkarten: 'karten', flashcards: 'karten', quiz: 'quiz', test: 'quiz', klausur: 'klausur', probeklausur: 'klausur', exam: 'klausur' };
  const TYPE_NAMES = { mc: 'Multiple Choice', wf: 'Wahr/Falsch', luecke: 'Lückentext', zuordnen: 'Zuordnung', offen: 'Offene Fragen' };
  const GAP = /_{3,}|\[\s*…?\s*\]|\[\.\.\.\]/g; // Lücke im Lückentext

  /* ---------- KI-JSON lesen und prüfen ---------- */
  function parse(raw) {
    let o = null;
    const src = String(raw || '').trim();
    try { o = JSON.parse(src); } catch {
      try { o = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1).replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
    }
    if (!o || typeof o !== 'object') return null;
    const kind = ALIAS[String(o.art || o.kind || '').toLowerCase()] || (Array.isArray(o.karten) ? 'karten' : Array.isArray(o.aufgaben) ? 'klausur' : 'quiz');
    const set = { kind, title: str(o.titel || o.title || KINDS[kind].name, 120), subject: str(o.fach, 40), minutes: +o.dauer > 0 ? Math.max(5, Math.min(240, Math.round(+o.dauer))) : 0, cards: [], items: [] };
    if (kind === 'karten') {
      set.cards = (Array.isArray(o.karten) ? o.karten : []).map((c) => ({ front: str(c?.vorne ?? c?.front, 400), back: str(c?.hinten ?? c?.back, 900) })).filter((c) => c.front && c.back).slice(0, 80);
      return set.cards.length ? set : null;
    }
    const list = Array.isArray(o.aufgaben) ? o.aufgaben : Array.isArray(o.fragen) ? o.fragen : [];
    set.items = list.map(item).filter(Boolean).slice(0, 40);
    if (kind === 'klausur' && !set.minutes) set.minutes = Math.min(180, Math.max(20, set.items.reduce((n, x) => n + x.points, 0) * 1.5));
    return set.items.length ? set : null;
  }
  const idx = (v, n) => { if (typeof v === 'string' && /^[A-Fa-f]$/.test(v.trim())) v = v.trim().toUpperCase().charCodeAt(0) - 65; const k = Math.round(+v); return Number.isInteger(k) && k >= 0 && k < n ? k : null; };
  function item(x) {
    if (!x || typeof x !== 'object') return null;
    const typ = String(x.typ || x.type || '').toLowerCase().replace(/[^a-z]/g, '');
    const t = { mc: 'mc', multiplechoice: 'mc', auswahl: 'mc', wf: 'wf', wahrfalsch: 'wf', truefalse: 'wf', luecke: 'luecke', lueckentext: 'luecke', zuordnen: 'zuordnen', zuordnung: 'zuordnen', offen: 'offen', offenefrage: 'offen', frei: 'offen' }[typ];
    const q = str(x.frage || x.question, 700), why = str(x.erklaerung || x.erklärung, 600), pts = (d) => Math.max(1, Math.min(20, Math.round(+x.punkte || d)));
    const material = str(x.material, 1500);
    if (t === 'mc') {
      const options = (Array.isArray(x.optionen) ? x.optionen : []).map((s) => str(s, 240)).filter(Boolean).slice(0, 6);
      const right = [...new Set((Array.isArray(x.richtig) ? x.richtig : [x.richtig]).map((v) => idx(v, options.length)).filter((v) => v != null))];
      return q && options.length >= 2 && right.length ? { type: 'mc', q, options, right, why, material, points: pts(right.length > 1 ? 2 : 1) } : null;
    }
    if (t === 'wf') {
      const r = x.richtig, right = typeof r === 'boolean' ? r : /^(wahr|richtig|true|ja)$/i.test(String(r)) ? true : /^(falsch|false|nein)$/i.test(String(r)) ? false : null;
      return q && right != null ? { type: 'wf', q, right, why, material, points: pts(1) } : null;
    }
    if (t === 'luecke') {
      const text = str(x.text || x.frage, 900), gaps = (text.match(GAP) || []).length;
      const sol = (Array.isArray(x.loesungen || x.lösungen) ? (x.loesungen || x.lösungen) : []).map((s) => str(s, 80)).filter(Boolean);
      return gaps && sol.length >= gaps ? { type: 'luecke', q: str(x.frage && x.text ? x.frage : 'Ergänze die Lücken.', 300), text, sol: sol.slice(0, gaps), why, material, points: pts(gaps) } : null;
    }
    if (t === 'zuordnen') {
      const pairs = (Array.isArray(x.paare) ? x.paare : []).map((p) => (Array.isArray(p) ? [str(p[0], 160), str(p[1], 200)] : [str(p?.links, 160), str(p?.rechts, 200)])).filter(([a, b]) => a && b).slice(0, 8);
      return pairs.length >= 2 ? { type: 'zuordnen', q: q || 'Ordne richtig zu.', pairs, why, material, points: pts(pairs.length) } : null;
    }
    if (t === 'offen') {
      const expect = str(x.erwartung || x.loesung || x.lösung || x.musterloesung, 1600);
      return q && expect ? { type: 'offen', q, expect, why, material, points: pts(4) } : null;
    }
    return null;
  }

  /* ---------- Vorschau im Chat / Dokument ---------- */
  const countText = (set) => { const n = set.kind === 'karten' ? set.cards.length : set.items.length, [one, many] = KINDS[set.kind].unit; return `${n} ${n === 1 ? one : many}`; };
  const pointsOf = (set) => set.items.reduce((n, x) => n + x.points, 0);
  function preview(set) {
    if (set.kind === 'karten') {
      const c = set.cards[0];
      return `<div class="ls-pv ls-pv-stack"><span class="ls-pv-sheet3"></span><span class="ls-pv-sheet2"></span><div class="ls-pv-card"><span class="ls-pv-k">Karte 1 von ${set.cards.length}</span><p>${rich(c.front)}</p></div></div>`;
    }
    if (set.kind === 'quiz') {
      const x = set.items[0];
      const opts = x.type === 'mc' ? x.options.slice(0, 3) : x.type === 'wf' ? ['Wahr', 'Falsch'] : [];
      return `<div class="ls-pv ls-pv-quiz"><span class="ls-pv-k">Frage 1 von ${set.items.length}</span><p>${rich(x.q)}</p>${opts.map((o) => `<span class="ls-pv-opt">${rich(o)}</span>`).join('')}</div>`;
    }
    const x = set.items[0];
    return `<div class="ls-pv ls-pv-paper"><div class="ls-pv-ph"><b>${esc(set.subject || 'Probeklausur')}</b><span>${set.minutes} Min · ${pointsOf(set)} Punkte</span></div>
      <p><span class="ls-pv-n">1</span>${rich(x.q || x.text)}</p><i></i><i></i><i></i></div>`;
  }
  // Warten, solange die KI den Block schreibt: dieselbe Wellen-Animation wie bei Bildern, dazu der Fortschritt
  function progress(fig, raw) {
    const n = (String(raw || '').match(/"(vorne|frage|text|typ)"\s*:/g) || []).length;
    const k = fig.querySelector('.ls-wait-n');
    if (k) k.textContent = n ? ` · ${n}` : '';
  }
  function figure(raw) {
    const fig = el('figure', 'ls');
    const set = parse(raw);
    if (!set) {
      fig.classList.add('ls-waiting');
      fig.innerHTML = `<div class="ls-wait">${window.illustrationWave?.() || ''}</div><div class="ls-wait-l"><span class="shimmer">Lernset wird erstellt</span><span class="ls-wait-n"></span></div>`;
      progress(fig, raw);
      return fig;
    }
    // Kopfzeile: Art · Titel, rechts Zähler und Vollbild – darunter direkt zum Lernen (Karteikarten und Quiz im Chat spielbar)
    fig.classList.add(`ls-k-${set.kind}`);
    fig.innerHTML = `<div class="ls-top"><span class="ls-top-t">${KINDS[set.kind].name}<b>${esc(set.title)}</b></span><span class="ls-top-n"></span>
      <button type="button" class="ls-exp" aria-label="Im Vollbild öffnen">${fi('expand', 13)}</button></div><div class="ls-in"></div>`;
    const inner = fig.querySelector('.ls-in'), count = fig.querySelector('.ls-top-n');
    fig.querySelector('.ls-exp').addEventListener('click', (e) => { e.stopPropagation(); open(set); });
    const ui = { body: inner, sub: count, right: null, setBar: () => {}, cleanup: [], inline: true };
    if (set.kind === 'karten') deck(set, ui);
    else if (set.kind === 'quiz') quiz(set, ui);
    else {
      inner.innerHTML = `${preview(set)}<div class="ls-start"><button type="button" class="ls-pill">${KINDS.klausur.verb}</button><span>${set.minutes} Min · ${pointsOf(set)} Punkte · ${countText(set)}</span></div>`;
      inner.querySelector('.ls-pill').addEventListener('click', () => open(set));
    }
    return fig;
  }

  /* ---------- Karteikarten-Stapel (im Chat und im Vollbild) ----------
     Aktuelle Karte groß in der Mitte, links/rechts nur die Kanten der Nachbarkarten (ohne Text). Antippen dreht um. Darunter Daumen
     hoch / seitlich / runter: die Karte färbt sich kurz (grün/orange/rot) und gleitet weiter; die Bewertung wird gemerkt (Punkte unten). */
  const THUMB = (rot) => `<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style="transform:rotate(${rot}deg)"><path fill="currentColor" d="M2 7h2.2v7H2a.7.7 0 0 1-.7-.7V7.7A.7.7 0 0 1 2 7Zm3.3 7V6.9l2.6-4.3a1.1 1.1 0 0 1 2 .7l-.4 2.5h3.3a1.6 1.6 0 0 1 1.6 1.9l-.9 4.8A1.8 1.8 0 0 1 11.7 14H5.3Z"/></svg>`;
  const RATES = [{ r: 2, label: 'Gewusst', rot: 0 }, { r: 1, label: 'Unsicher', rot: -90 }, { r: 0, label: 'Nicht gewusst', rot: 180 }];
  const keyOf = (raw) => { let h = 5381; const t = String(raw || ''); for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return `ls.rate.${h.toString(36)}`; };
  function deck(set, ui, base = set) {
    const store = keyOf(JSON.stringify(base.cards));
    const idOf = (i) => base.cards.indexOf(set.cards[i]); // Bewertung je Karte des Original-Stapels (auch wenn gemischt)
    let rates = {};
    try { rates = JSON.parse(localStorage.getItem(store) || '{}') || {}; } catch {}
    const save = () => { try { localStorage.setItem(store, JSON.stringify(rates)); } catch {} };
    let order = set.cards.map((_, i) => i), at = 0, busy = false;
    ui.body.innerHTML = `<div class="ls-stage"><span class="ls-peek l"></span><span class="ls-peek r"></span>
        <div class="ls-card" tabindex="0" aria-label="Karte umdrehen"><div class="ls-card-in"><div class="ls-side front"><p></p></div><div class="ls-side back"><p></p></div></div></div></div>
      <div class="ls-rate">${RATES.map((x) => `<button type="button" class="ls-r r${x.r}" data-r="${x.r}" aria-label="${x.label}">${THUMB(x.rot)}</button>`).join('')}</div>
      <div class="ls-dots"></div>`;
    const stage = ui.body.querySelector('.ls-stage'), card = stage.querySelector('.ls-card'), rateRow = ui.body.querySelector('.ls-rate'), dots = ui.body.querySelector('.ls-dots');
    const front = card.querySelector('.front p'), back = card.querySelector('.back p');
    const draw = () => {
      const done = at >= order.length;
      stage.classList.toggle('end', done);
      stage.querySelector('.l').hidden = at === 0;
      stage.querySelector('.r').hidden = at >= order.length - 1;
      rateRow.hidden = done;
      card.classList.remove('flipped', 'r0', 'r1', 'r2');
      if (done) {
        const n = (r) => set.cards.filter((_, i) => rates[idOf(i)] === r).length;
        front.innerHTML = `<span class="ls-sum3"><i class="g">${n(2)}</i><i class="o">${n(1)}</i><i class="r">${n(0)}</i></span><span class="ls-end-t">gewusst · unsicher · nicht gewusst</span>
          <span class="ls-end-b">${n(0) + n(1) ? '<button type="button" class="ls-pill" data-hard>Schwierige wiederholen</button>' : ''}<button type="button" class="ls-pill ghost" data-again>Von vorn</button></span>`;
        front.querySelector('[data-hard]')?.addEventListener('click', (e) => { e.stopPropagation(); order = set.cards.map((_, i) => i).filter((i) => rates[idOf(i)] !== 2); at = 0; slide(1, true); });
        front.querySelector('[data-again]').addEventListener('click', (e) => { e.stopPropagation(); order = set.cards.map((_, i) => i); at = 0; slide(1, true); });
      } else {
        const c = set.cards[order[at]];
        front.innerHTML = rich(c.front); back.innerHTML = rich(c.back);
        const r = rates[idOf(order[at])];
        if (r != null) card.classList.add(`was${r}`); else card.classList.remove('was0', 'was1', 'was2');
      }
      ui.sub && (ui.sub.textContent = done ? `${set.cards.length} Karten` : `${at + 1} / ${order.length}`);
      ui.setBar(Math.min(1, at / order.length));
      dots.innerHTML = order.length <= 48 ? order.map((i, k) => `<button type="button" class="${rates[idOf(i)] != null ? `d${rates[idOf(i)]}` : ''}${k === at ? ' on' : ''}" data-at="${k}" aria-label="Karte ${k + 1}"></button>`).join('') : '';
    };
    // weich weiter: raus zur Seite, neue Karte kommt von der anderen Seite (wie ein Stapel, der sich verschiebt)
    const slide = async (dir, reset = false) => {
      if (busy) return; busy = true;
      if (!reduced()) await card.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 38}%) scale(.94)`, opacity: 0 }], { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.catch(() => {});
      if (!reset) at = Math.max(0, Math.min(order.length, at + dir));
      draw();
      if (!reduced()) await card.animate([{ transform: `translateX(${dir * 38}%) scale(.94)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }).finished.catch(() => {});
      busy = false;
    };
    const flip = () => { if (at < order.length && !busy) card.classList.toggle('flipped'); };
    const rate = async (r) => {
      if (busy || at >= order.length) return;
      rates[idOf(order[at])] = r; save();
      card.classList.add(`r${r}`);
      rateRow.querySelector(`.r${r}`).classList.add('hit');
      await new Promise((ok) => setTimeout(ok, reduced() ? 0 : 280));
      rateRow.querySelector(`.r${r}`).classList.remove('hit');
      slide(1);
    };
    card.addEventListener('click', flip);
    rateRow.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) rate(+b.dataset.r); });
    dots.addEventListener('click', (e) => { const b = e.target.closest('[data-at]'); if (b) { const k = +b.dataset.at; if (k !== at) { const d = k > at ? 1 : -1; at = k - d; slide(d); } } });
    // Wischen: links/rechts blättern (ohne Bewertung)
    let sx = null;
    stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) { if (dx < 0 && at < order.length) slide(1); else if (dx > 0 && at > 0) slide(-1); } }, { passive: true });
    ui.key = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight') { if (at < order.length) slide(1); } else if (e.key === 'ArrowLeft') { if (at > 0) slide(-1); }
      else if (e.key === '1') rate(2); else if (e.key === '2') rate(1); else if (e.key === '3') rate(0);
    };
    // im Chat: Tastatur nur, wenn die Karte den Fokus hat (sonst stört sie das Eingabefeld)
    if (ui.inline && !ui.body._keys) { ui.body._keys = true; ui.body.addEventListener('keydown', (e) => { if (e.target.closest?.('.ls-card')) ui.key?.(e); }); }
    draw();
  }

  /* ---------- Vollbild-Lernansicht (Fokus) ---------- */
  function open(set) {
    const prevFocus = document.activeElement;
    const root = el('div', 'ls-full');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', set.title);
    root.innerHTML = `<div class="ls-head"><button type="button" class="ls-x" aria-label="Schließen">${fi('x', 14)}</button>
      <div class="ls-head-t"><b>${esc(set.title)}</b><span class="ls-head-s"></span></div><div class="ls-head-r"></div></div>
      <div class="ls-bar"><i></i></div><div class="ls-body"></div>`;
    document.body.append(root);
    document.documentElement.classList.add('ls-open');
    const body = root.querySelector('.ls-body'), sub = root.querySelector('.ls-head-s'), right = root.querySelector('.ls-head-r'), bar = root.querySelector('.ls-bar i');
    const ui = { root, body, sub, right, setBar: (p) => { bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`; }, cleanup: [] };
    const close = () => {
      ui.cleanup.forEach((f) => f());
      document.removeEventListener('keydown', onKey, true);
      root.classList.add('closing');
      document.documentElement.classList.remove('ls-open');
      setTimeout(() => root.remove(), reduced() ? 0 : 220);
      prevFocus?.focus?.();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } else ui.key?.(e); };
    document.addEventListener('keydown', onKey, true);
    root.querySelector('.ls-x').addEventListener('click', close);
    (set.kind === 'karten' ? flashcards : set.kind === 'quiz' ? quiz : exam)(set, ui);
    root.querySelector('.ls-x').focus();
  }

  // Vollbild: derselbe Stapel, größer – oben rechts „Mischen“
  function flashcards(set, ui) {
    ui.right.innerHTML = `<button type="button" class="ls-hbtn" data-shuffle>${fi('refresh', 13)}<span>Mischen</span></button>`;
    const shuffled = () => { const s = { ...set, cards: set.cards.slice() }; for (let i = s.cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s.cards[i], s.cards[j]] = [s.cards[j], s.cards[i]]; } return s; };
    ui.right.querySelector('[data-shuffle]').addEventListener('click', () => deck(shuffled(), ui, set));
    deck(set, ui, set);
  }

  /* Eine Frage zeichnen (Quiz und Klausur): Eingabe je Fragetyp; read() liefert die Antwort, mark() zeigt richtig/falsch */
  function question(x, n, { exam = false } = {}) {
    const w = el('div', `ls-q ls-q-${x.type}`);
    const head = exam ? `<div class="ls-q-h"><b>Aufgabe ${n}</b><span class="ls-pts">${x.points} ${x.points === 1 ? 'Punkt' : 'Punkte'}</span></div>` : '';
    const mat = x.material ? `<div class="ls-mat">${rich(x.material)}</div>` : '';
    if (x.type === 'luecke') {
      let k = 0;
      const text = esc(x.text).replace(/_{3,}|\[\s*…?\s*\]|\[\.\.\.\]/g, () => `<input class="ls-gap" data-g="${k++}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Lücke ${k}">`);
      w.innerHTML = `${head}${mat}<p class="ls-q-t">${rich(x.q)}</p><p class="ls-cloze">${text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')}</p>`;
    } else if (x.type === 'zuordnen') {
      const rights = x.pairs.map((p) => p[1]).map((v, i) => ({ v, i })).sort((a, b) => a.v.localeCompare(b.v, 'de'));
      w.innerHTML = `${head}${mat}<p class="ls-q-t">${rich(x.q)}</p><div class="ls-match">${x.pairs.map((p, i) => `<label class="ls-mrow"><span>${rich(p[0])}</span>
        <select data-m="${i}"><option value="">Auswählen …</option>${rights.map((r) => `<option value="${r.i}">${esc(r.v)}</option>`).join('')}</select></label>`).join('')}</div>`;
    } else if (x.type === 'offen') {
      w.innerHTML = `${head}${mat}<p class="ls-q-t">${rich(x.q)}</p><textarea class="ls-answer" rows="5" placeholder="Deine Antwort …"></textarea>`;
      const ta = w.querySelector('textarea');
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 520)}px`; });
    } else {
      const opts = x.type === 'wf' ? ['Wahr', 'Falsch'] : x.options;
      const multi = x.type === 'mc' && x.right.length > 1;
      w.innerHTML = `${head}${mat}<p class="ls-q-t">${rich(x.q)}${multi ? ' <span class="ls-hint">(mehrere richtig)</span>' : ''}</p>
        <div class="ls-opts">${opts.map((o, i) => `<button type="button" class="ls-opt" data-o="${i}"><span class="ls-ck">${fi('check', 11)}</span><span>${rich(o)}</span></button>`).join('')}</div>`;
      w.querySelectorAll('.ls-opt').forEach((b) => b.addEventListener('click', () => {
        if (w.classList.contains('done')) return;
        if (!multi) w.querySelectorAll('.ls-opt.on').forEach((o) => o !== b && o.classList.remove('on'));
        b.classList.toggle('on', multi ? !b.classList.contains('on') : true);
        w.dispatchEvent(new CustomEvent('ls-pick'));
      }));
    }
    const read = () => {
      if (x.type === 'luecke') return [...w.querySelectorAll('.ls-gap')].map((i) => i.value.trim());
      if (x.type === 'zuordnen') return [...w.querySelectorAll('select')].map((s) => (s.value === '' ? null : +s.value));
      if (x.type === 'offen') return w.querySelector('textarea').value.trim();
      return [...w.querySelectorAll('.ls-opt.on')].map((b) => +b.dataset.o);
    };
    const answered = () => { const a = read(); return Array.isArray(a) ? a.some((v) => v != null && v !== '') : !!a; };
    // Punkte für geschlossene Fragen (offene bewertet die KI); Lücken: Groß/Klein und Leerzeichen egal, Alternativen mit „/“
    const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '').trim();
    const score = () => {
      const a = read();
      if (x.type === 'mc') { const ok = a.length === x.right.length && a.every((v) => x.right.includes(v)); const part = a.filter((v) => x.right.includes(v)).length - a.filter((v) => !x.right.includes(v)).length; return ok ? x.points : x.right.length > 1 ? Math.max(0, Math.round((part / x.right.length) * x.points)) : 0; }
      if (x.type === 'wf') return a.length && (a[0] === 0) === x.right ? x.points : 0;
      if (x.type === 'luecke') return x.sol.reduce((n, s, k) => n + (s.split('/').some((alt) => norm(alt) === norm(a[k] || '')) ? 1 : 0), 0) * (x.points / x.sol.length);
      if (x.type === 'zuordnen') return x.pairs.reduce((n, _, k) => n + (a[k] === k ? 1 : 0), 0) * (x.points / x.pairs.length);
      return null;
    };
    const mark = () => {
      w.classList.add('done');
      w.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
      if (x.type === 'mc' || x.type === 'wf') {
        const right = x.type === 'wf' ? [x.right ? 0 : 1] : x.right;
        w.querySelectorAll('.ls-opt').forEach((b) => { const i = +b.dataset.o; b.classList.toggle('right', right.includes(i)); b.classList.toggle('wrong', b.classList.contains('on') && !right.includes(i)); });
      } else if (x.type === 'luecke') {
        w.querySelectorAll('.ls-gap').forEach((g, k) => { const ok = x.sol[k].split('/').some((alt) => norm(alt) === norm(g.value)); g.classList.add(ok ? 'right' : 'wrong'); if (!ok) g.insertAdjacentHTML('afterend', `<span class="ls-sol">${esc(x.sol[k].split('/')[0])}</span>`); });
      } else if (x.type === 'zuordnen') {
        w.querySelectorAll('.ls-mrow').forEach((r, k) => { const s = r.querySelector('select'), ok = +s.value === k && s.value !== ''; r.classList.add(ok ? 'right' : 'wrong'); if (!ok) r.insertAdjacentHTML('beforeend', `<span class="ls-sol">${esc(x.pairs[k][1])}</span>`); });
      }
    };
    return { el: w, read, answered, score, mark };
  }

  /* Quiz: eine Frage nach der anderen, sofortige Rückmeldung mit Erklärung, am Ende Ergebnis und „Falsche wiederholen“ */
  function quiz(set, ui) {
    if (ui.inline && !ui.body._keys) { ui.body._keys = true; ui.body.addEventListener('keydown', (e) => ui.key?.(e)); } // im Chat: Enter prüft
    let list = set.items.slice(), at = 0, got = 0, wrong = [];
    const start = (items) => { list = items; at = 0; got = 0; wrong = []; step(); };
    function step() {
      ui.setBar(at / list.length);
      ui.sub.textContent = at >= list.length ? `${got} von ${list.length} richtig` : `Frage ${at + 1} von ${list.length}`;
      if (at >= list.length) {
        const pct = Math.round((got / list.length) * 100);
        ui.body.innerHTML = `<div class="ls-end"><div class="ls-ring" style="--p:${pct}"><b>${pct}%</b></div><p>${got} von ${list.length} richtig</p>
          ${wrong.length ? `<div class="ls-wrong">${wrong.map((x) => `<div><b>${rich(x.q || x.text)}</b><span>${rich(solution(x))}</span></div>`).join('')}</div>` : ''}
          <div class="ls-row">${wrong.length ? '<button type="button" class="ls-btn2" data-wrong>Falsche wiederholen</button>' : ''}<button type="button" class="ls-btn" data-all>Neu starten</button></div></div>`;
        ui.body.querySelector('[data-wrong]')?.addEventListener('click', () => start(wrong.slice()));
        ui.body.querySelector('[data-all]').addEventListener('click', () => start(set.items.slice()));
        ui.key = null;
        return;
      }
      const x = list[at], q = question(x, at + 1);
      const wrap = el('div', 'ls-quiz');
      const fb = el('div', 'ls-fb');
      const btn = el('button', 'ls-btn', 'Prüfen'); btn.type = 'button'; btn.disabled = true;
      const row = el('div', 'ls-row ls-row-end'); row.append(btn);
      wrap.append(q.el, fb, row);
      ui.body.replaceChildren(wrap);
      const check = () => {
        if (btn.dataset.next) { at++; step(); return; }
        const s = q.score(), ok = s >= x.points - 0.001;
        if (ok) got++; else wrong.push(x);
        q.mark();
        fb.className = `ls-fb ${ok ? 'ok' : 'no'}`;
        fb.innerHTML = `<b>${ok ? 'Richtig' : 'Nicht ganz'}</b>${!ok ? `<span>Richtig: ${rich(solution(x))}</span>` : ''}${x.why ? `<p>${rich(x.why)}</p>` : ''}`;
        btn.textContent = at === list.length - 1 ? 'Ergebnis' : 'Weiter'; btn.dataset.next = '1'; btn.disabled = false; btn.focus();
      };
      const update = () => { if (!btn.dataset.next) btn.disabled = !q.answered(); };
      q.el.addEventListener('ls-pick', () => { update(); if ((x.type === 'wf' || (x.type === 'mc' && x.right.length === 1)) && q.answered()) check(); });
      q.el.addEventListener('input', update); q.el.addEventListener('change', update);
      btn.addEventListener('click', check);
      ui.key = (e) => { if (e.key === 'Enter' && !btn.disabled && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); check(); } };
    }
    start(list);
  }
  function solution(x) {
    if (x.type === 'mc') return x.right.map((i) => x.options[i]).join(' · ');
    if (x.type === 'wf') return x.right ? 'Wahr' : 'Falsch';
    if (x.type === 'luecke') return x.sol.map((s) => s.split('/')[0]).join(' · ');
    if (x.type === 'zuordnen') return x.pairs.map((p) => `${p[0]} → ${p[1]}`).join(' · ');
    return x.expect;
  }

  /* Probeklausur: Klausurblatt mit Zeit, Abgeben → geschlossene Fragen sofort, offene über die KI bewertet → Punkte, Note, Musterlösung */
  const NOTE = (p) => (p >= 0.92 ? 1 : p >= 0.81 ? 2 : p >= 0.67 ? 3 : p >= 0.5 ? 4 : p >= 0.3 ? 5 : 6);
  function exam(set, ui) {
    const total = pointsOf(set);
    const sheet = el('div', 'ls-sheet');
    sheet.innerHTML = `<div class="ls-sheet-h"><b>${esc(set.title)}</b><span>${esc(set.subject ? `${set.subject} · ` : '')}${set.minutes} Minuten · ${total} Punkte · ${set.items.length} Aufgaben</span></div>`;
    const qs = set.items.map((x, i) => question(x, i + 1, { exam: true }));
    qs.forEach((q) => sheet.append(q.el));
    const foot = el('div', 'ls-row ls-row-end ls-sheet-f');
    const give = el('button', 'ls-btn', 'Abgeben'); give.type = 'button';
    foot.append(give); sheet.append(foot);
    ui.body.replaceChildren(sheet);
    // Zeit läuft (oben rechts); abgelaufen → rot, Abgeben bleibt möglich
    const end = Date.now() + set.minutes * 60000;
    ui.right.innerHTML = '<span class="ls-timer"></span>';
    const timer = ui.right.querySelector('.ls-timer');
    const tick = () => { const s = Math.max(0, Math.round((end - Date.now()) / 1000)); timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; timer.classList.toggle('over', !s); ui.setBar(1 - s / (set.minutes * 60)); };
    tick();
    const t = setInterval(tick, 1000);
    ui.cleanup.push(() => clearInterval(t));
    const answered = () => { const n = qs.filter((q) => q.answered()).length; ui.sub.textContent = `${n} von ${qs.length} bearbeitet`; };
    answered();
    sheet.addEventListener('input', answered); sheet.addEventListener('change', answered); sheet.addEventListener('ls-pick', answered);
    give.addEventListener('click', async () => {
      if (give.disabled) return;
      const open = qs.map((q, i) => ({ q, i, x: set.items[i] })).filter((o) => o.x.type === 'offen');
      give.disabled = true; give.innerHTML = '<span class="shimmer">Wird korrigiert …</span>';
      clearInterval(t);
      let graded = new Map();
      if (open.length) {
        try {
          const r = await fetch('/api/lernset/grade', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: set.subject, title: set.title, items: open.map((o) => ({ i: o.i, frage: o.x.q, material: o.x.material, erwartung: o.x.expect, punkte: o.x.points, antwort: o.q.read() })) }) });
          if (r.ok) (await r.json()).results?.forEach((g) => graded.set(+g.i, g));
        } catch {}
      }
      const pts = qs.map((q, i) => { const x = set.items[i]; if (x.type !== 'offen') return q.score(); const g = graded.get(i); return g ? Math.max(0, Math.min(x.points, +g.punkte || 0)) : null; });
      qs.forEach((q, i) => {
        const x = set.items[i], p = pts[i];
        q.mark();
        const badge = q.el.querySelector('.ls-pts');
        if (badge) { badge.textContent = p == null ? `– / ${x.points}` : `${Math.round(p * 10) / 10} / ${x.points}`; badge.className = `ls-pts ${p == null ? '' : p >= x.points - 0.001 ? 'full' : p > 0 ? 'part' : 'zero'}`; }
        const g = graded.get(i);
        const res = el('div', 'ls-res');
        res.innerHTML = `${g?.feedback ? `<p>${rich(g.feedback)}</p>` : x.type === 'offen' ? '<p>Konnte gerade nicht automatisch bewertet werden – vergleiche mit der Musterlösung.</p>' : ''}
          <details><summary>Musterlösung</summary><p>${rich(solution(x))}</p>${x.why ? `<p class="ls-why">${rich(x.why)}</p>` : ''}</details>`;
        q.el.append(res);
      });
      const got = pts.reduce((n, p) => n + (p || 0), 0), unknown = pts.some((p) => p == null);
      const pct = total ? got / total : 0;
      const sum = el('div', 'ls-sum');
      sum.innerHTML = `<div class="ls-sum-n"><span>Note</span><b>${NOTE(pct)}</b></div><div class="ls-sum-t"><b>${Math.round(got * 10) / 10} von ${total} Punkten · ${Math.round(pct * 100)} %</b>
        <span>${unknown ? 'Ohne die nicht bewerteten Aufgaben · ' : ''}Richtwert nach üblichem Notenschlüssel</span></div><button type="button" class="ls-btn2" data-redo>Neu schreiben</button>`;
      sheet.querySelector('.ls-sheet-h').after(sum);
      sum.querySelector('[data-redo]').addEventListener('click', () => { ui.cleanup.forEach((f) => f()); ui.cleanup.length = 0; exam(set, ui); });
      foot.remove();
      ui.sub.textContent = `${Math.round(got * 10) / 10} / ${total} Punkte`;
      ui.setBar(pct);
      sum.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    });
  }

  /* ---------- Erstellen-Fenster ----------
     opts: { kind, mode: 'chat'|'doc', sections: [{ title, text }], mentions: () => [{ kind, id, title }], mentionText: async (m) => text, onSubmit(spec) }
     onSubmit bekommt { kind, topic, count, minutes, level, types, files: [File], links, texts: [{ name, text }], sections: [{ title, text }] } */
  const COUNTS = { karten: [10, 20, 30, 40], quiz: [5, 10, 15, 20], klausur: [30, 45, 60, 90] };
  const LEVELS = [['leicht', 'Leicht'], ['mittel', 'Mittel'], ['schwer', 'Schwer'], ['gemischt', 'Gemischt']];
  function dialog(opts = {}) {
    const st = { kind: KINDS[opts.kind] ? opts.kind : 'karten', count: null, level: 'gemischt', types: new Set(['mc', 'wf', 'luecke', 'zuordnen', 'offen']), files: [], links: [], texts: [], mentions: [],
      sections: new Set((opts.sections || []).map((_, i) => i)) };
    const m = el('div', 'ls-modal');
    const w = el('div', 'ls-win');
    m.append(w);
    document.body.append(m);
    const close = () => { document.removeEventListener('keydown', key, true); m.classList.add('closing'); setTimeout(() => m.remove(), 200); };
    const key = (e) => { if (e.key === 'Escape' && !w.classList.contains('busy')) { e.preventDefault(); e.stopPropagation(); close(); } };
    document.addEventListener('keydown', key, true);
    m.addEventListener('pointerdown', (e) => { if (e.target === m && !w.classList.contains('busy')) close(); });
    const seg = (name, items, cur) => `<div class="ls-seg" data-seg="${name}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    function draw() {
      const k = st.kind;
      if (!COUNTS[k].includes(st.count)) st.count = COUNTS[k][1];
      const srcChips = [
        ...st.files.map((f, i) => `<span class="ls-chip">${fi(/^image\//.test(f.type) ? 'image' : 'file', 12)}<span>${esc(f.name)}</span><button type="button" data-rm="files:${i}" aria-label="Entfernen">${fi('x', 9)}</button></span>`),
        ...st.links.map((u, i) => `<span class="ls-chip">${fi('link', 12)}<span>${esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</span><button type="button" data-rm="links:${i}" aria-label="Entfernen">${fi('x', 9)}</button></span>`),
        ...st.texts.map((t, i) => `<span class="ls-chip">${fi('pencil', 12)}<span>${esc(t.name)}</span><button type="button" data-rm="texts:${i}" aria-label="Entfernen">${fi('x', 9)}</button></span>`),
        ...st.mentions.map((x, i) => `<span class="ls-chip at">${fi(x.kind === 'chat' ? 'chat' : 'file', 12)}<span>${esc(x.title)}</span><button type="button" data-rm="mentions:${i}" aria-label="Entfernen">${fi('x', 9)}</button></span>`),
      ].join('');
      const secs = opts.sections || [];
      w.innerHTML = `<div class="ls-win-h"><b>Lernset erstellen</b><button type="button" class="ls-x2" data-close aria-label="Schließen">${fi('x', 12)}</button></div>
        ${seg('kind', Object.entries(KINDS).map(([v, x]) => [v, x.name]), k)}
        <textarea class="ls-topic" rows="2" placeholder="Worum soll es gehen? z. B. „Zellatmung, Kapitel 4“ – leer lassen, dann nutzt die KI deine Quellen.">${esc(st.topic || '')}</textarea>
        <div class="ls-sec"><span class="ls-lab">Quellen</span>
          <div class="ls-chips">${srcChips}</div>
          <div class="ls-add"><button type="button" data-add="files">${fi('upload', 12)}Dateien</button><button type="button" data-add="link">${fi('link', 12)}Link</button>
            <button type="button" data-add="text">${fi('pencil', 12)}Text</button><button type="button" data-add="at"><b>@</b>Chat oder Dokument</button></div>
          <div class="ls-inline" hidden></div></div>
        ${secs.length ? `<div class="ls-sec"><div class="ls-lab-row"><span class="ls-lab">Abschnitte aus diesem Dokument</span><button type="button" class="ls-all" data-all>${st.sections.size === secs.length ? 'Keine' : 'Alle'}</button></div>
          <div class="ls-secs">${secs.map((s, i) => `<button type="button" class="ls-check${st.sections.has(i) ? ' on' : ''}" data-sec="${i}"><span class="ls-ck">${fi('check', 11)}</span><span>${esc(s.title || 'Ohne Überschrift')}</span></button>`).join('')}</div></div>` : ''}
        <div class="ls-sec ls-opts2">
          <div><span class="ls-lab">${k === 'klausur' ? 'Dauer' : 'Anzahl'}</span>${seg('count', COUNTS[k].map((n) => [n, k === 'klausur' ? `${n} Min` : String(n)]), st.count)}</div>
          <div><span class="ls-lab">Schwierigkeit</span>${seg('level', LEVELS, st.level)}</div>
          ${k !== 'karten' ? `<div><span class="ls-lab">Aufgabentypen</span><div class="ls-types">${Object.entries(TYPE_NAMES).filter(([t]) => k === 'klausur' || t !== 'offen').map(([t, l]) => `<button type="button" class="ls-check${st.types.has(t) ? ' on' : ''}" data-type="${t}"><span class="ls-ck">${fi('check', 11)}</span><span>${l}</span></button>`).join('')}</div></div>` : ''}
        </div>
        <div class="ls-win-f"><span class="ls-win-s"></span><button type="button" class="ls-btn" data-make>Erstellen</button></div>`;
      const ta = w.querySelector('.ls-topic');
      ta.addEventListener('input', () => { st.topic = ta.value; });
    }
    const inline = (html, onOk) => {
      const box = w.querySelector('.ls-inline');
      box.hidden = false; box.innerHTML = html;
      const f = box.querySelector('input, textarea');
      f?.focus();
      box.querySelector('[data-ok]')?.addEventListener('click', () => { if (onOk(f.value.trim()) !== false) { box.hidden = true; box.innerHTML = ''; } });
      f?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && f.tagName === 'INPUT') { e.preventDefault(); box.querySelector('[data-ok]').click(); } });
    };
    w.addEventListener('click', async (e) => {
      const t = e.target.closest('button'); if (!t || w.classList.contains('busy')) return;
      if (t.dataset.close != null) { close(); return; }
      const sg = t.closest('[data-seg]');
      if (sg) { const v = t.dataset.v; const name = sg.dataset.seg; st[name] = name === 'count' ? +v : v; draw(); return; }
      if (t.dataset.rm) { const [k, i] = t.dataset.rm.split(':'); st[k].splice(+i, 1); draw(); return; }
      if (t.dataset.sec != null) { const i = +t.dataset.sec; if (st.sections.has(i)) st.sections.delete(i); else st.sections.add(i); draw(); return; }
      if (t.dataset.all != null) { st.sections = st.sections.size === (opts.sections || []).length ? new Set() : new Set((opts.sections || []).map((_, i) => i)); draw(); return; }
      if (t.dataset.type) { const ty = t.dataset.type; if (st.types.has(ty) && st.types.size > 1) st.types.delete(ty); else st.types.add(ty); draw(); return; }
      const add = t.dataset.add;
      if (add === 'files') {
        const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'image/*,application/pdf,.goodnotes';
        inp.addEventListener('change', () => { st.files.push(...[...inp.files].slice(0, 12)); draw(); });
        inp.click(); return;
      }
      if (add === 'link') { inline('<input type="url" placeholder="https://…" /><button type="button" class="ls-btn" data-ok>Hinzufügen</button>', (v) => { if (!/^https?:\/\/\S+\.\S+/.test(v)) return false; st.links.push(v); draw(); return true; }); return; }
      if (add === 'text') { inline('<textarea rows="4" placeholder="Text einfügen, z. B. Notizen oder ein Tafelbild …"></textarea><button type="button" class="ls-btn" data-ok>Hinzufügen</button>', (v) => { if (!v) return false; st.texts.push({ name: `Text ${st.texts.length + 1}: ${v.slice(0, 24)}${v.length > 24 ? '…' : ''}`, text: v }); draw(); return true; }); return; }
      if (add === 'at') { pickMention(t, opts.mentions?.() || [], (x) => { if (!st.mentions.some((y) => y.kind === x.kind && y.id === x.id)) st.mentions.push(x); draw(); }); return; }
      if (t.dataset.make != null) {
        const secs = (opts.sections || []).filter((_, i) => st.sections.has(i));
        const hasSource = st.files.length || st.links.length || st.texts.length || st.mentions.length || secs.length;
        if (!String(st.topic || '').trim() && !hasSource) { w.querySelector('.ls-win-s').textContent = 'Gib ein Thema an oder füge eine Quelle hinzu.'; w.querySelector('.ls-topic').focus(); return; }
        const texts = st.texts.slice();
        for (const x of st.mentions) { const txt = await opts.mentionText?.(x).catch(() => ''); if (txt) texts.push({ name: `${x.kind === 'chat' ? 'Chat' : 'Dokument'}: ${x.title}`, text: txt }); }
        const spec = { kind: st.kind, topic: String(st.topic || '').trim(), count: st.count, minutes: st.kind === 'klausur' ? st.count : 0, level: st.level,
          types: st.kind === 'karten' ? [] : [...st.types].filter((ty) => st.kind === 'klausur' || ty !== 'offen'), files: st.files.slice(), links: st.links.slice(), texts, sections: secs };
        const keep = await opts.onSubmit?.(spec, { busy: (txt) => { w.classList.add('busy'); w.querySelector('.ls-win-s').innerHTML = txt ? `<span class="shimmer">${esc(txt)}</span>` : ''; }, done: close, fail: (msg) => { w.classList.remove('busy'); w.querySelector('.ls-win-s').textContent = msg; } });
        if (keep !== true) close(); // true: das Fenster zeigt den Fortschritt selbst und schließt sich später (done)
      }
    });
    draw();
    w.querySelector('.ls-topic')?.focus();
    return { close };
  }

  /* @-Auswahl: Chats und Dokumente durchsuchen und anhängen (im Erstellen-Fenster und im Chat-Eingabefeld) */
  let picker = null;
  function pickMention(anchor, items, onPick, { query = '' } = {}) {
    picker?.close();
    const p = el('div', 'ls-at');
    p.innerHTML = `<div class="ls-at-s">${fi('search', 12)}<input placeholder="Chat oder Dokument suchen …" value="${esc(query)}" /></div><div class="ls-at-l"></div>`;
    document.body.append(p);
    const r = anchor.getBoundingClientRect(), pw = Math.min(320, innerWidth - 16);
    p.style.width = `${pw}px`;
    p.style.left = `${Math.max(8, Math.min(innerWidth - pw - 8, r.left))}px`;
    const below = r.bottom + 6 + 300 < innerHeight;
    p.style[below ? 'top' : 'bottom'] = below ? `${r.bottom + 6}px` : `${innerHeight - r.top + 6}px`;
    const inp = p.querySelector('input'), list = p.querySelector('.ls-at-l');
    let sel = 0, shown = [];
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      shown = items.filter((x) => !q || x.title.toLowerCase().includes(q)).slice(0, 30);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.innerHTML = shown.length ? shown.map((x, i) => `<button type="button" class="ls-at-i${i === sel ? ' on' : ''}" data-i="${i}">${fi(x.kind === 'chat' ? 'chat' : 'file', 13)}<span>${esc(x.title)}</span><small>${x.kind === 'chat' ? 'Chat' : 'Dokument'}</small></button>`).join('')
        : '<div class="ls-at-e">Nichts gefunden</div>';
    };
    const done = (x) => { close(); if (x) onPick(x); };
    const close = () => { document.removeEventListener('pointerdown', outside, true); p.remove(); if (picker?.el === p) picker = null; };
    const outside = (e) => { if (!p.contains(e.target) && e.target !== anchor) close(); };
    document.addEventListener('pointerdown', outside, true);
    inp.addEventListener('input', () => { sel = 0; draw(); });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); done(shown[sel]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) done(shown[+b.dataset.i]); });
    draw();
    inp.focus();
    picker = { el: p, close };
    return picker;
  }

  /* Abschnitte eines Dokuments (nach Überschriften) als Text – für die Auswahl im Erstellen-Fenster */
  function sectionsOf(html) {
    const box = document.createElement('div');
    box.innerHTML = String(html || '');
    const out = [];
    let cur = { title: '', text: '' };
    [...box.children].forEach((n) => {
      if (/^H[1-4]$/.test(n.tagName)) { if (cur.title || cur.text.trim()) out.push(cur); cur = { title: n.textContent.trim(), text: '' }; return; }
      if (n.hasAttribute?.('data-blk')) return; // Blöcke (Diagramme, Karten …) sind kein Lernstoff
      const t = n.innerText || n.textContent || '';
      if (t.trim()) cur.text += `${t.trim()}\n`;
    });
    if (cur.title || cur.text.trim()) out.push(cur);
    return out.filter((s) => s.text.trim()).map((s) => ({ title: s.title || 'Einleitung', text: s.text.trim().slice(0, 20000) }));
  }

  /* Auftrag an die KI aus dem Erstellen-Fenster (sichtbarer Text der Nachricht; die Einstellungen gehen zusätzlich als „lernset“ mit) */
  function requestText(spec) {
    const k = KINDS[spec.kind].name;
    const what = spec.kind === 'klausur' ? `eine ${k} (${spec.minutes} Minuten)` : `${spec.count} ${k}`;
    const parts = [`Erstelle ${spec.kind === 'quiz' ? `ein Quiz mit ${spec.count} Fragen` : what}${spec.topic ? ` zu: ${spec.topic}` : ' aus meinen Quellen'}.`];
    if (spec.level !== 'gemischt') parts.push(`Schwierigkeit: ${spec.level}.`);
    if (spec.types.length && spec.kind !== 'karten') parts.push(`Aufgabentypen: ${spec.types.map((t) => TYPE_NAMES[t]).join(', ')}.`);
    if (spec.links.length) parts.push(`Quellen (Links): ${spec.links.join(' ')}`);
    return parts.join(' ');
  }
  const settingsOf = (spec) => ({ kind: spec.kind, count: spec.count, minutes: spec.minutes, level: spec.level, types: spec.types, topic: spec.topic.slice(0, 300) });

  return { parse, figure, progress, open, dialog, pickMention, sectionsOf, requestText, settingsOf, KINDS, TYPE_NAMES };
})();
if (typeof window !== 'undefined') window.Lernset = Lernset;
if (typeof module !== 'undefined') module.exports = Lernset;
