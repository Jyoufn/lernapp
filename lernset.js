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
    klausur: { name: 'Probeklausur', icon: 'book-open', verb: 'Klausur schreiben', unit: ['Aufgabe', 'Aufgaben'] },
  };
  // Eigene zweifarbige Icons je Art (Karteikarten wie die Vorlage: blaue Karte vorn, zwei graue dahinter aufgefächert)
  const KICON = (kind, n = 14) => {
    const card = (r, c, o = 1) => `<rect x="2.6" y="3.2" width="7.2" height="10.2" rx="1.5" transform="rotate(${r} 4.6 13.4)" fill="${c}" opacity="${o}" stroke="#171717" stroke-width=".9"/>`;
    const back = (r, c, o) => card(r, c, o), front = (c) => card(-7, c);
    const inner = kind === 'karten' ? `${back(38, '#9a9a9a', '.7')}${back(17, '#c9c9c9', '.9')}${front('#5ec2da')}`
      : kind === 'quiz' ? `${back(20, '#9a9a9a', '.75')}${front('#6aa8ff')}<g transform="rotate(-7 4.6 13.4)"><path d="M4.7 6.6a1.5 1.5 0 1 1 2.2 1.3c-.5.3-.8.7-.8 1.2" fill="none" stroke="#0f2340" stroke-width="1.3" stroke-linecap="round"/><circle cx="6.1" cy="10.9" r=".8" fill="#0f2340"/></g>`
      : `${back(20, '#9a9a9a', '.75')}${front('#f0b37a')}<path d="M4.3 6h3.8M4.3 8.2h3.8M4.3 10.4h2.4" transform="rotate(-7 4.6 13.4)" stroke="#3a2410" stroke-width="1.1" stroke-linecap="round"/>`;
    return `<svg class="ls-kicon" width="${n}" height="${n}" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
  };
  const ALIAS = { karten: 'karten', karteikarten: 'karten', lernkarten: 'karten', flashcards: 'karten', quiz: 'quiz', test: 'quiz', klausur: 'klausur', probeklausur: 'klausur', exam: 'klausur' };
  const TYPE_NAMES = { mc: 'Multiple Choice', wf: 'Wahr/Falsch', luecke: 'Lückentext', zuordnen: 'Zuordnung', offen: 'Offene Fragen' };
  const GAP = /_{3,}|\[\s*…?\s*\]|\[\.\.\.\]/g; // Lücke im Lückentext

  /* ---------- KI-JSON lesen und prüfen ---------- */
  // Teilstück retten, solange die KI noch schreibt (oder die Antwort abgeschnitten wurde): Kopf + alle schon vollständigen Einträge
  function salvage(src) {
    const m = /"(karten|fragen|aufgaben)"\s*:\s*\[/.exec(src);
    if (!m) return null;
    const before = src.slice(0, m.index);
    const head = (k) => { const h = new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(before); try { return h ? JSON.parse(`"${h[1]}"`) : ''; } catch { return ''; } };
    const list = [];
    let depth = 0, start = -1, inStr = false, bs = false;
    for (let i = m.index + m[0].length; i < src.length; i++) {
      const c = src[i];
      if (inStr) { if (bs) bs = false; else if (c === '\\') bs = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') { if (!depth && c === '{') start = i; depth++; }
      else if (c === '}' || c === ']') { if (!depth) break; depth--; if (!depth && start >= 0) { try { list.push(JSON.parse(src.slice(start, i + 1))); } catch {} start = -1; } }
    }
    return { art: head('art'), titel: head('titel'), fach: head('fach'), dauer: +(/"dauer"\s*:\s*(\d+)/.exec(before)?.[1] || 0), [m[1]]: list };
  }
  function parse(raw) {
    let o = null, partial = false;
    const src = String(raw || '').trim();
    try { o = JSON.parse(src); } catch {
      try { o = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1).replace(/,\s*([}\]])/g, '$1')); } catch { o = salvage(src); partial = true; }
    }
    if (!o || typeof o !== 'object') return null;
    const kind = ALIAS[String(o.art || o.kind || '').toLowerCase()] || (Array.isArray(o.karten) ? 'karten' : Array.isArray(o.aufgaben) ? 'klausur' : 'quiz');
    const set = { kind, title: str(o.titel || o.title || KINDS[kind].name, 120), subject: str(o.fach, 40), minutes: +o.dauer > 0 ? Math.max(5, Math.min(240, Math.round(+o.dauer))) : 0, cards: [], items: [], partial };
    if (kind === 'karten') {
      set.cards = (Array.isArray(o.karten) ? o.karten : []).map((c) => ({ front: str(c?.vorne ?? c?.front ?? c?.frage ?? c?.begriff, 400), back: str(c?.hinten ?? c?.back ?? c?.antwort ?? c?.erklaerung, 900) })).filter((c) => c.front && c.back).slice(0, 80);
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
  // Warten, solange die KI die ersten Einträge schreibt: Wellen-Kachelfeld über die volle Breite (Fortschritt steht in der Zeitleiste)
  let waveSvg = '';
  const wave = () => waveSvg || (waveSvg = (() => {
    const W = 1024, H = 352, S = 24, G = 8, C = 31, R = 10, ox = (W - C * S - (C - 1) * G) / 2, oy = (H - R * S - (R - 1) * G) / 2;
    let t = '';
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) t += `<rect x="${ox + c * (S + G)}" y="${oy + r * (S + G)}" width="${S}" height="${S}" rx="6" style="animation-delay:${Math.round((c / (C - 1) * 0.85 + r / (R - 1) * 0.15) * 2600)}ms"/>`;
    return `<div class="ill-frame" aria-hidden="true"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><g fill="#fff" fill-opacity="0.09">${t}</g></svg></div>`;
  })());
  const sizeOf = (s) => (s ? (s.kind === 'karten' ? s.cards.length : s.items.length) : 0);
  const kindOf = (raw) => { const t = String(raw || ''); return ALIAS[String(/"art"\s*:\s*"([^"]*)"/.exec(t)?.[1] || '').toLowerCase()] || (/"karten"\s*:/.test(t) ? 'karten' : /"aufgaben"\s*:/.test(t) ? 'klausur' : 'quiz'); };
  // Text für den Schritt in der Zeitleiste, solange die KI schreibt („Fragen schreiben · 4“) bzw. danach („Quiz erstellt · 9 Fragen“)
  function status(raw) { const n = sizeOf(parse(raw)), w = { karten: 'Karteikarten schreiben', quiz: 'Fragen schreiben', klausur: 'Aufgaben schreiben' }[kindOf(raw)]; return n ? `${w} · ${n}` : w; }
  function wrote(raw) { const s = parse(raw); return s ? `${KINDS[s.kind].name} erstellt · ${countText(s)}` : ''; }
  function progress() {} // alt: Fortschritt steht jetzt in der Zeitleiste (status)
  // Zähler „3 / 9“ – solange noch erstellt wird, pulsiert statt der Gesamtzahl ein Punkt
  const counter = (node, at, total, loading) => { if (node) node.innerHTML = `<span>${at}</span><span class="ls-of">/</span>${loading ? '<i class="ls-load"></i>' : `<span>${total}</span>`}`; };
  const MIN_SHOW = 3; // ab so vielen fertigen Einträgen kann man schon lernen, der Rest entsteht im Hintergrund

  /* Lernset im Chat. live: die KI schreibt noch – fig.update(raw, done) bekommt jeden neuen Stand; neue Einträge hängen sich an, ohne
     dass der Lernstand verloren geht (set.subs meldet sie den Ansichten) */
  function figure(raw, { live = false } = {}) {
    const fig = el('figure', 'ls');
    let set = null;
    fig.update = (raw2, done = true) => {
      const s = parse(raw2);
      if (!set) {
        if (s && (done || sizeOf(s) >= (s.kind === 'klausur' ? 1 : MIN_SHOW))) {
          const waited = fig.classList.contains('ls-waiting');
          set = s; set.loading = !done; set.subs = new Set();
          mount(fig, set);
          if (waited) fig.classList.add('ls-reveal');
        } else if (done) { fig.className = 'ls ls-fail'; fig.textContent = 'Das Lernset konnte nicht erstellt werden – bitte noch einmal versuchen.'; }
        else if (!fig.classList.contains('ls-waiting')) { fig.className = 'ls ls-waiting'; fig.innerHTML = `<div class="ls-wait">${wave()}</div>`; }
        return;
      }
      if (!set.loading) return;
      if (s && s.kind === set.kind) { if (set.kind === 'karten') set.cards.push(...s.cards.slice(set.cards.length)); else set.items.push(...s.items.slice(set.items.length)); }
      if (done) set.loading = false;
      set.subs.forEach((f) => f());
    };
    fig.update(raw, !live);
    return fig;
  }
  function mount(fig, set) {
    // Kopfzeile: Icon + Titel, rechts Zähler und Vollbild – darunter direkt zum Lernen (Karteikarten und Quiz im Chat spielbar)
    fig.className = `ls ls-k-${set.kind}`;
    fig.innerHTML = `<div class="ls-top"><span class="ls-top-t">${KICON(set.kind, 16)}<b>${esc(set.title)}</b></span><span class="ls-top-n"></span>
      <button type="button" class="ls-exp" aria-label="Im Vollbild öffnen">${fi('expand', 13)}</button></div><div class="ls-in"></div>`;
    const inner = fig.querySelector('.ls-in'), count = fig.querySelector('.ls-top-n');
    fig.querySelector('.ls-exp').addEventListener('click', (e) => { e.stopPropagation(); if (set.kind !== 'klausur' || !set.loading) open(set); });
    const ui = { body: inner, sub: count, right: null, setBar: () => {}, cleanup: [], inline: true };
    if (set.kind === 'karten') return deck(set, ui);
    if (set.kind === 'quiz') return quiz(set, ui);
    const draw = () => {
      inner.innerHTML = `${preview(set)}<div class="ls-start"><button type="button" class="ls-pill${set.loading ? ' busy' : ''}"${set.loading ? ' disabled' : ''}>${set.loading ? '<span class="shimmer">Wird erstellt …</span>' : KINDS.klausur.verb}</button>
        <span>${set.loading ? countText(set) : `${set.minutes} Min · ${pointsOf(set)} Punkte · ${countText(set)}`}</span></div>`;
      inner.querySelector('.ls-pill').addEventListener('click', () => { if (!set.loading) open(set); });
    };
    set.subs.add(draw);
    draw();
  }

  /* ---------- Karteikarten-Stapel (im Chat und im Vollbild) ----------
     Aktuelle Karte groß in der Mitte, links/rechts nur die Kanten der Nachbarkarten und Pfeile zum Blättern. Antippen dreht um (beide Seiten
     gleich dunkel). Darunter Daumen hoch / „so lala“ / Daumen runter: der Rand der Karte färbt sich kurz, dann gleitet sie weiter. */
  const THUMB = (down) => `<svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"${down ? ' style="transform:scale(-1,-1)"' : ''}><path fill="currentColor" d="M1.6 7.2c0-.5.4-.9.9-.9h1.6v7.6H2.5a.9.9 0 0 1-.9-.9V7.2Zm3.7 6.7V6.6l2.5-4.2c.3-.5.8-.7 1.3-.5.6.2.9.8.8 1.4l-.4 2.3h3.2c1 0 1.8.9 1.6 1.9l-.9 4.8c-.2.9-.9 1.6-1.8 1.6H5.3Z"/></svg>`;
  const SOSO = '<svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 5.7a2.5 2.5 0 1 1 3.8 2.1c-.8.5-1.3 1-1.3 1.9v.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="8" cy="12.9" r="1.2" fill="currentColor"/></svg>';
  const RATES = [{ r: 0, label: 'Nicht gewusst', icon: THUMB(true) }, { r: 1, label: 'Unsicher', icon: SOSO }, { r: 2, label: 'Gewusst', icon: THUMB(false) }];
  const keyOf = (raw) => { let h = 5381; const t = String(raw || ''); for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return `ls.rate.${h.toString(36)}`; };
  function deck(set, ui, base = set) {
    const store = keyOf(`${base.title}|${base.cards[0]?.front || ''}`); // gleich bleibend, auch wenn noch Karten dazukommen
    const idOf = (i) => base.cards.indexOf(set.cards[i]); // Bewertung je Karte des Original-Stapels (auch wenn gemischt)
    let rates = {};
    try { rates = JSON.parse(localStorage.getItem(store) || '{}') || {}; } catch {}
    const save = () => { try { localStorage.setItem(store, JSON.stringify(rates)); } catch {} };
    let order = set.cards.map((_, i) => i), all = true, at = 0, busy = false;
    const loading = () => all && set === base && !!base.loading;
    const wrap = el('div', 'ls-deck');
    wrap.innerHTML = `<div class="ls-stage"><span class="ls-peek l"></span><span class="ls-peek r"></span>
        <div class="ls-card" tabindex="0" aria-label="Karte umdrehen"><div class="ls-card-in"><div class="ls-side front"><p></p></div><div class="ls-side back"><p></p></div></div></div>
        <button type="button" class="ls-nav l" data-d="-1" aria-label="Vorherige Karte">${fi('chevron-right', 13)}</button><button type="button" class="ls-nav r" data-d="1" aria-label="Nächste Karte">${fi('chevron-right', 13)}</button></div>
      <div class="ls-rate">${RATES.map((x) => `<button type="button" class="ls-r r${x.r}" data-r="${x.r}" aria-label="${x.label}">${x.icon}</button>`).join('')}</div>
      <div class="ls-dots"></div>`;
    ui.body.replaceChildren(wrap);
    const stage = wrap.querySelector('.ls-stage'), card = stage.querySelector('.ls-card'), rateRow = wrap.querySelector('.ls-rate'), dots = wrap.querySelector('.ls-dots');
    const front = card.querySelector('.front p'), back = card.querySelector('.back p');
    // Zähler, Punkte, Kanten, Pfeile (ohne die Karte selbst neu zu zeichnen)
    const chrome = () => {
      const done = at >= order.length;
      stage.querySelector('.ls-peek.l').hidden = at === 0;
      stage.querySelector('.ls-peek.r').hidden = at >= order.length - 1 && !loading();
      stage.querySelector('.ls-nav.l').disabled = at === 0;
      stage.querySelector('.ls-nav.r').disabled = done;
      if (done && !loading()) { if (ui.sub) ui.sub.textContent = `${set.cards.length} Karten`; }
      else counter(ui.sub, Math.min(at + 1, order.length + 1), order.length, loading());
      dots.innerHTML = order.length <= 48 ? order.map((i, k) => `<button type="button" class="${rates[idOf(i)] != null ? `d${rates[idOf(i)]}` : ''}${k === at ? ' on' : ''}" data-at="${k}" aria-label="Karte ${k + 1}"></button>`).join('') + (loading() ? '<i class="ls-load"></i>' : '') : '';
    };
    const draw = () => {
      const done = at >= order.length, wait = done && loading();
      stage.classList.toggle('end', done && !wait);
      stage.classList.toggle('wait', wait);
      rateRow.hidden = done;
      card.classList.remove('flipped', 'r0', 'r1', 'r2', 'was0', 'was1', 'was2');
      if (wait) front.innerHTML = '<span class="shimmer">Weitere Karten werden erstellt …</span>';
      else if (done) {
        const n = (r) => set.cards.filter((_, i) => rates[idOf(i)] === r).length;
        front.innerHTML = `<span class="ls-sum3"><i class="g">${n(2)}</i><i class="o">${n(1)}</i><i class="r">${n(0)}</i></span><span class="ls-end-t">gewusst · unsicher · nicht gewusst</span>
          <span class="ls-end-b">${n(0) + n(1) ? '<button type="button" class="ls-pill" data-hard>Schwierige wiederholen</button>' : ''}<button type="button" class="ls-pill ghost" data-again>Von vorn</button></span>`;
        front.querySelector('[data-hard]')?.addEventListener('click', (e) => { e.stopPropagation(); order = set.cards.map((_, i) => i).filter((i) => rates[idOf(i)] !== 2); all = false; at = 0; slide(1, true); });
        front.querySelector('[data-again]').addEventListener('click', (e) => { e.stopPropagation(); order = set.cards.map((_, i) => i); all = true; at = 0; slide(1, true); });
      } else {
        const c = set.cards[order[at]];
        front.innerHTML = rich(c.front); back.innerHTML = rich(c.back);
        const r = rates[idOf(order[at])];
        if (r != null) card.classList.add(`was${r}`);
      }
      chrome();
    };
    // weich weiter: raus zur Seite, neue Karte kommt von der anderen Seite (wie ein Stapel, der sich verschiebt)
    const slide = async (dir, reset = false) => {
      if (busy) return; busy = true;
      // die alte Karte gleitet als Kopie zur Seite (wird dort zur Kante), gleichzeitig kommt die neue von der anderen Seite
      const ghost = !reduced() && card.cloneNode(true);
      if (ghost) { ghost.classList.add('ls-ghost'); ghost.removeAttribute('tabindex'); stage.insertBefore(ghost, card); }
      if (!reset) at = Math.max(0, Math.min(order.length, at + dir));
      draw();
      if (ghost) {
        const ease = 'cubic-bezier(.32,.72,0,1)';
        ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 74}%) scale(.9)`, opacity: 0 }], { duration: 460, easing: ease, fill: 'forwards' });
        await card.animate([{ transform: `translateX(${dir * 74}%) scale(.9)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: ease }).finished.catch(() => {});
        ghost.remove();
      }
      busy = false;
    };
    // neue Karten aus dem Hintergrund: anhängen; wer schon am Ende wartete, bekommt die nächste Karte sofort
    const grow = () => {
      if (all) for (let i = order.length; i < set.cards.length; i++) order.push(i);
      if (stage.classList.contains('wait') && (at < order.length || !loading())) { draw(); if (!reduced()) card.animate([{ opacity: 0, transform: 'translateX(12%) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }); }
      else chrome();
    };
    if (set === base && base.subs) { base.subs.add(grow); ui.cleanup.push(() => base.subs.delete(grow)); }
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
    stage.addEventListener('click', (e) => { const b = e.target.closest('.ls-nav'); if (b && !b.disabled) { e.stopPropagation(); slide(+b.dataset.d); } });
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

  /* ---------- Vollbild-Lernansicht (Fokus) ----------
     Kopf wie die Leisten oben mittig: runde Pille mit Titel und Zähler, links ×, rechts Mischen bzw. Zeit – keine Linie, kein Balken */
  function open(set) {
    const prevFocus = document.activeElement;
    const root = el('div', 'ls-full');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', set.title);
    root.innerHTML = `<div class="ls-head"><button type="button" class="ls-x" aria-label="Schließen">${fi('x', 13)}</button>
      <div class="ls-head-t"><b>${esc(set.title)}</b><span class="ls-head-s"></span></div><div class="ls-head-r"></div></div><div class="ls-body"></div>`;
    document.body.append(root);
    document.documentElement.classList.add('ls-open');
    const body = root.querySelector('.ls-body'), sub = root.querySelector('.ls-head-s'), right = root.querySelector('.ls-head-r');
    const ui = { root, body, sub, right, setBar: () => {}, cleanup: [] };
    const close = () => {
      ui.cleanup.forEach((f) => f());
      document.removeEventListener('keydown', onKey, true);
      root.classList.add('closing');
      document.documentElement.classList.remove('ls-open');
      setTimeout(() => root.remove(), reduced() ? 0 : 260);
      prevFocus?.focus?.();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } else ui.key?.(e); };
    document.addEventListener('keydown', onKey, true);
    root.querySelector('.ls-x').addEventListener('click', close);
    (set.kind === 'karten' ? flashcards : set.kind === 'quiz' ? quiz : exam)(set, ui);
    root.querySelector('.ls-x').focus({ preventScroll: true });
  }

  // Vollbild: derselbe Stapel, größer – oben rechts „Mischen“ (erst, wenn alle Karten da sind)
  function flashcards(set, ui) {
    ui.right.innerHTML = `<button type="button" class="ls-hbtn" data-shuffle aria-label="Mischen">${fi('refresh', 13)}<span>Mischen</span></button>`;
    const sh = ui.right.querySelector('[data-shuffle]');
    const lock = () => { sh.disabled = !!set.loading; };
    lock(); if (set.subs) { set.subs.add(lock); ui.cleanup.push(() => set.subs.delete(lock)); }
    const shuffled = () => { const s = { ...set, cards: set.cards.slice() }; for (let i = s.cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s.cards[i], s.cards[j]] = [s.cards[j], s.cards[i]]; } return s; };
    sh.addEventListener('click', () => { if (!set.loading) deck(shuffled(), ui, set); });
    deck(set, ui, set);
  }

  /* Eigenes Auswahlmenü (statt des System-Menüs): Kasten wie die übrigen Menüs, Auswahl = blauer Haken */
  let ddClose = null;
  function dropdown(btn, choices, used) {
    if (ddClose) { const was = btn.classList.contains('open'); ddClose(); if (was) return; }
    const menu = el('div', 'ls-dd-menu');
    menu.innerHTML = choices.map((c) => `<button type="button" class="ls-dd-i${String(c.v) === btn.dataset.v ? ' on' : used.has(String(c.v)) ? ' used' : ''}" data-v="${c.v}"><span>${esc(c.label)}</span>${fi('check', 12)}</button>`).join('');
    document.body.append(menu);
    const r = btn.getBoundingClientRect(), mh = Math.min(menu.scrollHeight, 280);
    menu.style.minWidth = `${r.width}px`;
    menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${innerHeight - r.bottom > mh + 12 ? r.bottom + 6 : Math.max(8, r.top - 6 - mh)}px`;
    btn.classList.add('open');
    const out = (e) => { if (!menu.contains(e.target) && !btn.contains(e.target)) close(); };
    const scroll = (e) => { if (!menu.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const close = () => { menu.remove(); btn.classList.remove('open'); document.removeEventListener('pointerdown', out, true); removeEventListener('scroll', scroll, true); removeEventListener('keydown', key, true); ddClose = null; };
    document.addEventListener('pointerdown', out, true); addEventListener('scroll', scroll, true); addEventListener('keydown', key, true);
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      btn.dataset.v = b.dataset.v; btn.classList.add('set');
      btn.querySelector('.ls-dd-t').textContent = choices.find((c) => String(c.v) === b.dataset.v)?.label || '';
      close(); btn.dispatchEvent(new Event('change', { bubbles: true }));
    });
    ddClose = close;
  }
  // Lücke wächst mit dem Text
  const fitGap = (g) => { g.style.width = `${Math.max(7, Math.min(28, g.value.length + 3))}ch`; };

  /* Eine Frage zeichnen (Quiz und Klausur): Eingabe je Fragetyp; read() liefert die Antwort, mark() zeigt richtig/falsch */
  function question(x, n, { exam = false } = {}) {
    const w = el('div', `ls-q ls-q-${x.type}`);
    const head = exam ? `<div class="ls-q-h"><b>Aufgabe ${n}</b><span class="ls-pts">${x.points} ${x.points === 1 ? 'Punkt' : 'Punkte'}</span></div>` : '';
    const mat = x.material ? `<div class="ls-mat">${rich(x.material)}</div>` : '';
    if (x.type === 'luecke') {
      let k = 0;
      const text = esc(x.text).replace(/_{3,}|\[\s*…?\s*\]|\[\.\.\.\]/g, () => `<input class="ls-gap" data-g="${k++}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Lücke ${k}">`);
      w.innerHTML = `${head}${mat}<p class="ls-q-t">${rich(x.q)}</p><p class="ls-cloze">${text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')}</p>`;
      w.querySelectorAll('.ls-gap').forEach((g) => { fitGap(g); g.addEventListener('input', () => fitGap(g)); });
    } else if (x.type === 'zuordnen') {
      const choices = x.pairs.map((p, i) => ({ v: i, label: p[1] })).sort((a, b) => a.label.localeCompare(b.label, 'de'));
      w.innerHTML = `${head}${mat}<p class="ls-q-t">${rich(x.q)}</p><div class="ls-match">${x.pairs.map((p, i) => `<div class="ls-mrow"><span>${rich(p[0])}</span>
        <button type="button" class="ls-dd" data-m="${i}" data-v="" aria-label="Zuordnung für ${esc(p[0])}"><span class="ls-dd-t">Auswählen</span>${fi('chevron-down', 11)}</button></div>`).join('')}</div>`;
      w.querySelectorAll('.ls-dd').forEach((b) => b.addEventListener('click', () => {
        if (b.disabled) return;
        dropdown(b, choices, new Set([...w.querySelectorAll('.ls-dd')].filter((o) => o !== b && o.dataset.v !== '').map((o) => o.dataset.v)));
      }));
    } else if (x.type === 'offen') {
      w.innerHTML = `${head}${mat}<p class="ls-q-t">${rich(x.q)}</p><textarea class="ls-answer" rows="4" placeholder="Deine Antwort …"></textarea>`;
      const ta = w.querySelector('textarea');
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 520)}px`; });
    } else {
      const opts = x.type === 'wf' ? ['Wahr', 'Falsch'] : x.options;
      const multi = x.type === 'mc' && x.right.length > 1;
      w.innerHTML = `${head}${mat}<p class="ls-q-t">${rich(x.q)}${multi ? ' <span class="ls-hint">mehrere richtig</span>' : ''}</p>
        <div class="ls-opts">${opts.map((o, i) => `<button type="button" class="ls-opt" data-o="${i}"><span class="ls-ck"><b>${'ABCDEF'[i]}</b>${fi('check', 11)}</span><span>${rich(o)}</span></button>`).join('')}</div>`;
      w.querySelectorAll('.ls-opt').forEach((b) => b.addEventListener('click', () => {
        if (w.classList.contains('done')) return;
        if (!multi) w.querySelectorAll('.ls-opt.on').forEach((o) => o !== b && o.classList.remove('on'));
        b.classList.toggle('on', multi ? !b.classList.contains('on') : true);
        w.dispatchEvent(new CustomEvent('ls-pick'));
      }));
    }
    const read = () => {
      if (x.type === 'luecke') return [...w.querySelectorAll('.ls-gap')].map((i) => i.value.trim());
      if (x.type === 'zuordnen') return [...w.querySelectorAll('.ls-dd')].map((s) => (s.dataset.v === '' ? null : +s.dataset.v));
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
      w.querySelectorAll('input, textarea, .ls-dd').forEach((i) => { i.disabled = true; });
      if (x.type === 'mc' || x.type === 'wf') {
        const right = x.type === 'wf' ? [x.right ? 0 : 1] : x.right;
        w.querySelectorAll('.ls-opt').forEach((b, k) => {
          const i = +b.dataset.o, ok = right.includes(i), bad = b.classList.contains('on') && !ok;
          b.style.transitionDelay = reduced() ? '' : `${k * 40}ms`;
          b.classList.toggle('right', ok); b.classList.toggle('wrong', bad); b.classList.toggle('dim', !ok && !bad);
          if (bad) b.querySelector('.ls-ck').innerHTML = fi('x', 10); else if (ok) b.querySelector('.ls-ck b')?.remove();
        });
      } else if (x.type === 'luecke') {
        w.querySelectorAll('.ls-gap').forEach((g, k) => { const ok = x.sol[k].split('/').some((alt) => norm(alt) === norm(g.value)); g.classList.add(ok ? 'right' : 'wrong'); if (!ok) g.insertAdjacentHTML('afterend', `<span class="ls-sol">${esc(x.sol[k].split('/')[0])}</span>`); });
      } else if (x.type === 'zuordnen') {
        w.querySelectorAll('.ls-mrow').forEach((r, k) => { const s = r.querySelector('.ls-dd'), ok = s.dataset.v !== '' && +s.dataset.v === k; r.classList.add(ok ? 'right' : 'wrong'); if (!ok) r.insertAdjacentHTML('beforeend', `<span class="ls-sol">${esc(x.pairs[k][1])}</span>`); });
      }
    };
    return { el: w, read, answered, score, mark };
  }

  // Auf- und zuklappen (Erklärung, falsche Antworten): nur die Höhe läuft, der Inhalt blendet leicht mit
  function fold(btn, box, html) {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    if (open && !box.childElementCount) box.innerHTML = `<div class="ls-fold-in">${html()}</div>`;
    const from = box.offsetHeight;
    box.classList.toggle('open', open);
    clearTimeout(box._t);
    if (reduced()) { box.style.height = open ? 'auto' : '0px'; return; }
    box.style.height = `${from}px`; void box.offsetHeight;
    box.style.height = `${open ? box.scrollHeight : 0}px`;
    if (open) box._t = setTimeout(() => { box.style.height = 'auto'; }, 420);
  }
  // Richtige Antwort kurz als blaue Chips (wie die gewählten Antworten in der Zeitleiste); Reihenfolgen mit Nummern
  function chips(x) {
    const pill = (t, n) => `<span class="qa-pick">${n != null ? `<span class="qa-num">${n}</span>` : ''}<span class="qa-label">${rich(t)}</span></span>`;
    if (x.type === 'mc') return x.right.map((i) => pill(x.options[i])).join('');
    if (x.type === 'wf') return pill(x.right ? 'Wahr' : 'Falsch');
    if (x.type === 'luecke') return x.sol.map((s, k) => pill(s.split('/')[0], k + 1)).join('');
    if (x.type === 'zuordnen') return x.pairs.map((p, k) => pill(`${p[0]} → ${p[1]}`, k + 1)).join('');
    return pill(x.expect.length > 110 ? `${x.expect.slice(0, 107).trim()} …` : x.expect);
  }
  const whyOf = (x) => `${x.type === 'offen' && x.expect.length > 110 ? `<p>${rich(x.expect)}</p>` : ''}${x.why ? `<p>${rich(x.why)}</p>` : ''}`;

  /* Quiz: eine Frage nach der anderen. Antwort wählen → „Bestätigen“ → erst dann richtig/falsch (verwählen ist kein Fehler).
     Oben Segmente je Frage (grün/rot) – antippen springt zu der Frage. Erklärung zum Aufklappen. Kommen noch Fragen aus dem Hintergrund,
     wartet „Weiter“ darauf. */
  function quiz(set, ui) {
    if (ui.inline && !ui.body._keys) { ui.body._keys = true; ui.body.addEventListener('keydown', (e) => ui.key?.(e)); }
    const card = el('div', 'ls-qcard');
    card.innerHTML = '<div class="ls-segs"></div><div class="ls-qstage"></div>';
    ui.body.replaceChildren(card);
    const segs = card.querySelector('.ls-segs'), stage = card.querySelector('.ls-qstage');
    let list = [], live = true, at = 0, res = [], views = [], ending = false, busySwap = false;
    const loading = () => live && !!set.loading;
    const got = () => res.filter((r) => r === true).length;
    const allDone = () => list.length > 0 && list.every((_, i) => res[i] != null);
    const nextOpen = () => { for (let k = 1; k <= list.length; k++) { const i = (at + k) % list.length; if (res[i] == null) return i; } return -1; };
    const chrome = () => {
      if (ending) { if (ui.sub) ui.sub.textContent = `${got()} von ${list.length} richtig`; } else counter(ui.sub, at + 1, list.length, loading());
      segs.innerHTML = list.map((_, i) => `<button type="button" data-i="${i}" class="${res[i] === true ? 'ok' : res[i] === false ? 'no' : ''}${i === at && !ending ? ' on' : ''}" aria-label="Frage ${i + 1}"><i></i></button>`).join('')
        + (loading() ? '<span class="ld"><i></i></span>' : '');
      if (!ending) views[at]?.refresh();
    };
    if (set.subs) { set.subs.add(chrome); ui.cleanup.push(() => set.subs.delete(chrome)); }
    segs.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) show(+b.dataset.i, +b.dataset.i > at ? 1 : -1); });
    // Wechsel: alte Frage gleitet raus, die Karte passt ihre Höhe weich an, die neue gleitet rein
    const swap = async (node, dir, first) => {
      const h0 = stage.offsetHeight, old = stage.firstElementChild;
      if (old === node) return;
      if (!first && old && !reduced()) { busySwap = true; await old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 18}px)` }], { duration: 170, easing: 'cubic-bezier(.4,0,1,1)' }).finished.catch(() => {}); busySwap = false; }
      stage.replaceChildren(node);
      if (first || reduced()) return;
      const h1 = stage.offsetHeight;
      if (Math.abs(h1 - h0) > 1) stage.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 400, easing: 'cubic-bezier(.32,.72,0,1)' });
      node.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.16,1,.3,1)' });
    };
    function show(i, dir = 1, first = false) {
      if (busySwap || i < 0 || i >= list.length || (i === at && !ending && !first)) return;
      at = i; ending = false;
      const v = views[i] || (views[i] = view(list[i], i));
      ui.key = v.key;
      swap(v.node, dir, first);
      chrome();
    }
    const advance = () => { if (allDone() && !loading()) return end(); const n = nextOpen(); if (n >= 0) show(n, n > at ? 1 : -1); };
    function view(x, i) {
      const q = question(x, i + 1);
      const node = el('div', 'ls-quiz');
      const extra = el('div', 'ls-extra');
      const foot = el('div', 'ls-qf');
      foot.innerHTML = '<div class="ls-st"></div><button type="button" class="ls-pill" disabled>Bestätigen</button>';
      const why = el('div', 'ls-fold');
      node.append(q.el, extra, foot, why);
      let btn = foot.querySelector('.ls-pill'), phase = 'answer';
      const st = foot.querySelector('.ls-st');
      // Knopf nach der Antwort: Weiter / Ergebnis / wartet auf die nächste Frage aus dem Hintergrund
      const refresh = () => {
        if (phase !== 'next') return;
        const wait = !(allDone() && !loading()) && nextOpen() < 0;
        btn.disabled = wait; btn.classList.toggle('busy', wait);
        const label = wait ? '<span class="shimmer">Nächste Frage wird erstellt</span>' : allDone() && !loading() ? 'Ergebnis' : 'Weiter';
        if (btn.innerHTML !== label) btn.innerHTML = label;
      };
      const settle = (ok, part = false) => {
        phase = 'next';
        res[i] = ok;
        st.innerHTML = `<span class="ls-verdict ${ok ? 'ok' : part ? 'part' : 'no'}">${fi(ok ? 'check-circle' : 'x-circle', 14)}${ok ? 'Richtig' : part ? 'Teilweise richtig' : 'Leider falsch'}</span>
          ${x.why && x.type !== 'offen' ? `<button type="button" class="ls-whyt" aria-expanded="false">Erklärung${fi('chevron-down', 10)}</button>` : ''}`;
        st.querySelector('.ls-whyt')?.addEventListener('click', (e) => fold(e.currentTarget, why, () => `<p>${rich(x.why)}</p>`));
        chrome();
        btn.focus({ preventScroll: true });
      };
      const confirm = () => {
        if (phase === 'next') { if (!btn.disabled) advance(); return; }
        if (phase !== 'answer' || !q.answered()) return;
        q.mark();
        if (x.type !== 'offen') { const s = q.score(); return settle(s >= x.points - 0.001, s > 0); }
        // offene Frage im Quiz: Musterlösung zeigen, selbst einschätzen
        phase = 'self';
        extra.innerHTML = `<div class="ls-model"><span>Musterlösung</span><p>${rich(x.expect)}</p>${x.why ? `<p class="ls-why">${rich(x.why)}</p>` : ''}</div>`;
        st.innerHTML = '<span class="ls-ask">Hattest du das?</span>';
        btn.remove();
        const two = el('div', 'ls-two', '<button type="button" class="ls-pill ghost" data-s="0">Nein</button><button type="button" class="ls-pill" data-s="1">Ja</button>');
        foot.append(two);
        two.addEventListener('click', (e) => {
          const b = e.target.closest('[data-s]'); if (!b) return;
          two.remove(); btn = el('button', 'ls-pill'); btn.type = 'button'; btn.addEventListener('click', confirm); foot.append(btn);
          settle(b.dataset.s === '1');
        });
      };
      const update = () => { if (phase === 'answer') btn.disabled = !q.answered(); };
      q.el.addEventListener('ls-pick', update); q.el.addEventListener('input', update); q.el.addEventListener('change', update);
      btn.addEventListener('click', confirm);
      const key = (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.target.closest?.('.ls-dd, .ls-segs')) { e.preventDefault(); confirm(); } };
      return { node, refresh, key };
    }
    function end() {
      ending = true; ui.key = null;
      const wrong = list.filter((_, i) => res[i] === false), n = got();
      const pct = list.length ? Math.round((n / list.length) * 100) : 0;
      const node = el('div', 'ls-end');
      node.innerHTML = `<div class="ls-ring" style="--p:0"><b>0 %</b></div><p>${n} von ${list.length} richtig</p>
        ${wrong.length ? `<button type="button" class="ls-wt" aria-expanded="false">${wrong.length === 1 ? '1 falsche Antwort ansehen' : `${wrong.length} falsche Antworten ansehen`}${fi('chevron-down', 10)}</button><div class="ls-fold ls-wl"></div>` : ''}
        <div class="ls-row">${wrong.length ? '<button type="button" class="ls-pill ghost" data-wrong>Falsche wiederholen</button>' : ''}<button type="button" class="ls-pill" data-all>Neu starten</button></div>`;
      const wl = node.querySelector('.ls-wl');
      node.querySelector('.ls-wt')?.addEventListener('click', (e) => fold(e.currentTarget, wl, () => wrong.map((x, k) => `<div class="ls-wi"><div class="qa-q">${rich(x.type === 'luecke' ? x.text.replace(GAP, '___') : x.q)}</div><div class="qa-a">${chips(x)}</div>
        ${whyOf(x) ? `<button type="button" class="ls-wx" aria-expanded="false" data-i="${k}">Erklärung${fi('chevron-down', 10)}</button><div class="ls-fold"></div>` : ''}</div>`).join('')));
      wl?.addEventListener('click', (e) => {
        const b = e.target.closest('.ls-wx'); if (!b) return;
        fold(b, b.nextElementSibling, () => whyOf(wrong[+b.dataset.i]));
        if (wl.style.height !== 'auto') { clearTimeout(wl._t); wl.style.height = 'auto'; } // äußere Liste wächst mit
      });
      node.querySelector('[data-wrong]')?.addEventListener('click', () => start(wrong, false));
      node.querySelector('[data-all]').addEventListener('click', () => start(set.items, true));
      swap(node, 1, false);
      chrome();
      // Ring und Zahl laufen hoch
      const ring = node.querySelector('.ls-ring'), b = ring.querySelector('b'), t0 = performance.now(), D = reduced() ? 1 : 900;
      const tick = (t) => { const k = Math.min(1, (t - t0) / D), v = pct * (1 - Math.pow(1 - k, 3)); ring.style.setProperty('--p', v.toFixed(1)); b.textContent = `${Math.round(v)} %`; if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    function start(items, isLive) { list = items; live = isLive; res = []; views = []; ending = false; at = -1; show(0, 1, !stage.firstElementChild); }
    start(set.items, true);
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
     Gleiches Fenster wie „Neue Aufgabe“: Thema als Titel, „Wünsche hinzufügen“, darunter Zeilen, die bündig einen Kasten aufklappen
     (Art – nur ohne Vorauswahl –, Quellen, Abschnitte, Schwierigkeit, Aufgabentypen). Die Anzahl bestimmt die KI selbst.
     opts: { kind, mode: 'chat'|'doc', sections: [{ title, text }], mentions: () => [{ kind, id, title }], mentionText: async (m) => text, onSubmit(spec) }
     onSubmit bekommt { kind, topic, count: 0, minutes: 0, level, types, files: [File], links, texts: [{ name, text }], sections: [{ title, text }] } */
  const LEVELS = [['gemischt', 'Gemischt', 'von leicht nach schwer'], ['leicht', 'Leicht', 'Grundwissen'], ['mittel', 'Mittel', 'Verstehen und Anwenden'], ['schwer', 'Schwer', 'Transfer']];
  function dialog(opts = {}) {
    const fixed = !!KINDS[opts.kind];
    const st = { kind: fixed ? opts.kind : 'karten', level: 'gemischt', types: new Set(['mc', 'wf', 'luecke', 'zuordnen', 'offen']), files: [], links: [], texts: [], mentions: [],
      sections: new Set((opts.sections || []).map((_, i) => i)), topic: '', notes: '' };
    const secs = opts.sections || [];
    const m = el('div', 'tk-modal ls-make');
    const mi = (attr, icon, label, on, sub = '') => `<button type="button" class="tk-mi${on ? ' on' : ''}" ${attr}><span class="tk-mi-ic">${icon}</span><span>${label}${sub ? `<i class="tk-mi-sub">${sub}</i>` : ''}</span>${fi('check', 12)}</button>`;
    const pop = (k, menu) => `<div class="tk-pop" data-k="${k}"><button type="button" class="tk-pill" data-open="${k}"></button><div class="tk-menu"><div class="tk-box">${menu}</div></div></div>`;
    m.innerHTML = `<form class="tk-form tk-sheet" autocomplete="off">
      <div class="tk-sheet-main">
        <input class="tk-f-title" placeholder="${fixed ? `${KINDS[st.kind].name} zu …` : 'Thema'}" maxlength="200" aria-label="Thema" />
        <textarea class="tk-f-notes" rows="1" placeholder="Wünsche hinzufügen" maxlength="600" aria-label="Wünsche"></textarea>
      </div>
      <div class="tk-sheet-rows">
        ${fixed ? '' : pop('kind', Object.entries(KINDS).map(([v, x]) => mi(`data-kind="${v}"`, KICON(v, 15), x.name)).join(''))}
        ${pop('src', '<div class="ls-srcs"></div><div class="ls-src-add"></div>')}
        ${secs.length ? pop('secs', '<div class="ls-secs2"></div>') : ''}
        ${pop('level', LEVELS.map(([v, n, d]) => mi(`data-level="${v}"`, fi('sliders', 12), n, false, d)).join(''))}
        ${pop('types', '<div class="ls-types2"></div>')}
      </div>
      <div class="tk-sheet-foot"><span class="ls-make-s"></span><span class="grow"></span><button type="submit" class="tk-create tk-make">${fixed ? `${KINDS[st.kind].name} erstellen` : 'Lernset erstellen'}</button></div>
    </form>`;
    document.body.append(m);
    const form = m.querySelector('form'), title = form.querySelector('.tk-f-title'), notes = form.querySelector('.tk-f-notes'), status = form.querySelector('.ls-make-s');
    window.UIKit?.foldRows?.(form);
    window.UIKit?.autoGrow?.(notes);
    const busy = () => form.classList.contains('busy');
    const close = () => { document.removeEventListener('keydown', key, true); m.classList.add('closing'); setTimeout(() => m.remove(), 220); };
    const key = (e) => {
      if (e.key !== 'Escape' || busy()) return;
      e.preventDefault(); e.stopPropagation();
      const o = form.querySelector('.tk-pop.open'); if (o) o.classList.remove('open'); else close();
    };
    document.addEventListener('keydown', key, true);
    m.addEventListener('pointerdown', (e) => { if (e.target === m && !busy()) close(); });
    const nSrc = () => st.files.length + st.links.length + st.texts.length + st.mentions.length;
    const row = (k, icon, text, empty) => { const b = form.querySelector(`.tk-pill[data-open="${k}"]`); if (b) { b.innerHTML = `<span class="tk-si">${fi(icon, 14)}</span><span class="tk-rv">${text}</span>`; b.classList.toggle('empty', !!empty); } };
    function draw() {
      const k = st.kind;
      row('kind', KINDS[k].icon, KINDS[k].name); { const b = form.querySelector('.tk-pill[data-open="kind"] .tk-si'); if (b) b.innerHTML = KICON(k, 16); }
      form.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === k));
      const n = nSrc();
      row('src', 'files', n ? `${n} ${n === 1 ? 'Quelle' : 'Quellen'}` : 'Quellen hinzufügen', !n);
      const chip = (icon, name, rm) => `<div class="tk-mi ls-srci"><span class="tk-mi-ic">${fi(icon, 12)}</span><span>${esc(name)}</span><b class="ls-rm" data-rm="${rm}" role="button" aria-label="Entfernen">${fi('x', 10)}</b></div>`;
      form.querySelector('.ls-srcs').innerHTML = [
        ...st.files.map((f, i) => chip(/^image\//.test(f.type) ? 'image' : 'file', f.name, `files:${i}`)),
        ...st.links.map((u, i) => chip('link', u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48), `links:${i}`)),
        ...st.texts.map((t, i) => chip('pencil', t.name, `texts:${i}`)),
        ...st.mentions.map((x, i) => chip(x.kind === 'chat' ? 'chat' : 'file', x.title, `mentions:${i}`)),
      ].join('');
      const add = form.querySelector('.ls-src-add');
      if (!add.childElementCount) add.innerHTML = `${n ? '<i class="ls-sep"></i>' : ''}<button type="button" class="tk-mi" data-add="files"><span class="tk-mi-ic">${fi('upload', 12)}</span><span>Dateien hochladen</span></button>
        <button type="button" class="tk-mi" data-add="link"><span class="tk-mi-ic">${fi('link', 12)}</span><span>Link hinzufügen</span></button>
        <button type="button" class="tk-mi" data-add="text"><span class="tk-mi-ic">${fi('pencil', 12)}</span><span>Text einfügen</span></button>
        <button type="button" class="tk-mi" data-add="at"><span class="tk-mi-ic"><b class="ls-at-ic">@</b></span><span>Chat oder Dokument</span></button>`;
      else add.querySelector('.ls-sep')?.toggleAttribute('hidden', !n);
      if (secs.length) {
        row('secs', 'list', st.sections.size === secs.length ? 'Alle Abschnitte' : st.sections.size ? `${st.sections.size} von ${secs.length} Abschnitten` : 'Keine Abschnitte', !st.sections.size);
        form.querySelector('.ls-secs2').innerHTML = mi('data-all', fi('check-circle', 12), st.sections.size === secs.length ? 'Keine' : 'Alle', false)
          + secs.map((s, i) => mi(`data-sec="${i}"`, fi('hash', 12), esc(s.title || 'Ohne Überschrift'), st.sections.has(i))).join('');
      }
      const lv = LEVELS.find((l) => l[0] === st.level);
      row('level', 'sliders', `Schwierigkeit: ${lv[1]}`);
      form.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('on', b.dataset.level === st.level));
      const types = Object.entries(TYPE_NAMES).filter(([t]) => k === 'klausur' || t !== 'offen');
      form.querySelector('.tk-pop[data-k="types"]').hidden = k === 'karten';
      const on = types.filter(([t]) => st.types.has(t));
      row('types', 'list', on.length === types.length ? 'Alle Aufgabentypen' : on.map(([, l]) => l).join(', '));
      form.querySelector('.ls-types2').innerHTML = types.map(([t, l]) => mi(`data-type="${t}"`, fi('list', 12), l, st.types.has(t))).join('');
    }
    // kleines Eingabefeld im Quellen-Kasten (Link oder Text)
    const inline = (multi, ph, onOk) => {
      form.querySelector('.ls-src-in')?.remove();
      const box = el('div', 'tk-src-row ls-src-in', `${multi ? `<textarea class="tk-src-in" placeholder="${ph}"></textarea>` : `<input class="tk-src-in ls-src-1" placeholder="${ph}" />`}`);
      form.querySelector('.ls-src-add').after(box);
      const f = box.firstElementChild; f.focus();
      f.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (!multi || e.metaKey || e.ctrlKey)) { e.preventDefault(); if (onOk(f.value.trim()) !== false) { box.remove(); draw(); } }
        if (e.key === 'Escape') { e.stopPropagation(); box.remove(); }
      });
      if (multi) f.addEventListener('blur', () => { const v = f.value.trim(); if (v && onOk(v) !== false) { box.remove(); draw(); } });
    };
    form.addEventListener('click', (e) => {
      const t = e.target.closest('button, [data-rm]'); if (!t || busy()) return;
      if (t.dataset.open) { e.preventDefault(); const k = t.dataset.open; form.querySelectorAll('.tk-pop').forEach((p) => p.classList.toggle('open', p.dataset.k === k && !p.classList.contains('open'))); return; }
      if (t.dataset.kind) { st.kind = t.dataset.kind; draw(); t.closest('.tk-pop').classList.remove('open'); return; }
      if (t.dataset.level) { st.level = t.dataset.level; draw(); t.closest('.tk-pop').classList.remove('open'); return; }
      if (t.dataset.rm) { const [k, i] = t.dataset.rm.split(':'); st[k].splice(+i, 1); draw(); return; }
      if (t.dataset.sec != null) { const i = +t.dataset.sec; if (st.sections.has(i)) st.sections.delete(i); else st.sections.add(i); draw(); return; }
      if (t.hasAttribute('data-all')) { st.sections = st.sections.size === secs.length ? new Set() : new Set(secs.map((_, i) => i)); draw(); return; }
      if (t.dataset.type) { const ty = t.dataset.type; if (st.types.has(ty) && st.types.size > 1) st.types.delete(ty); else st.types.add(ty); draw(); return; }
      const add = t.dataset.add;
      if (add === 'files') {
        const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'image/*,application/pdf,.goodnotes';
        inp.addEventListener('change', () => { st.files.push(...[...inp.files].slice(0, 12)); draw(); });
        inp.click(); return;
      }
      if (add === 'link') { inline(false, 'https://… und Enter', (v) => { if (!/^https?:\/\/\S+\.\S+/.test(v)) return false; st.links.push(v); return true; }); return; }
      if (add === 'text') { inline(true, 'Text einfügen, z. B. Notizen oder ein Tafelbild …', (v) => { if (!v) return false; st.texts.push({ name: `Text ${st.texts.length + 1}: ${v.slice(0, 24)}${v.length > 24 ? '…' : ''}`, text: v }); return true; }); return; }
      if (add === 'at') { pickMention(t, opts.mentions?.() || [], (x) => { if (!st.mentions.some((y) => y.kind === x.kind && y.id === x.id)) st.mentions.push(x); draw(); }); }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy()) return;
      const chosen = secs.filter((_, i) => st.sections.has(i));
      const topic = [title.value.trim(), notes.value.trim()].filter(Boolean).join(' – ');
      if (!topic && !nSrc() && !chosen.length) { status.textContent = 'Thema oder Quelle angeben'; title.focus(); return; }
      const texts = st.texts.slice();
      for (const x of st.mentions) { const txt = await opts.mentionText?.(x).catch(() => ''); if (txt) texts.push({ name: `${x.kind === 'chat' ? 'Chat' : 'Dokument'}: ${x.title}`, text: txt }); }
      const spec = { kind: st.kind, topic, count: 0, minutes: 0, level: st.level, types: st.kind === 'karten' ? [] : [...st.types].filter((ty) => st.kind === 'klausur' || ty !== 'offen'),
        files: st.files.slice(), links: st.links.slice(), texts, sections: chosen };
      const keep = await opts.onSubmit?.(spec, { busy: (txt) => { form.classList.add('busy'); status.innerHTML = txt ? `<span class="shimmer">${esc(txt)}</span>` : ''; }, done: close, fail: (msg) => { form.classList.remove('busy'); status.textContent = msg; } });
      if (keep !== true) close(); // true: das Fenster zeigt den Fortschritt selbst und schließt sich später (done)
    });
    draw();
    title.focus();
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
    const what = spec.kind === 'klausur' ? `eine ${k}${spec.minutes ? ` (${spec.minutes} Minuten)` : ''}` : spec.count ? `${spec.count} ${k}` : k;
    const parts = [`Erstelle ${spec.kind === 'quiz' ? `ein Quiz${spec.count ? ` mit ${spec.count} Fragen` : ''}` : what}${spec.topic ? ` zu: ${spec.topic}` : ' aus meinen Quellen'}.`];
    if (spec.level !== 'gemischt') parts.push(`Schwierigkeit: ${spec.level}.`);
    if (spec.types.length && spec.kind !== 'karten') parts.push(`Aufgabentypen: ${spec.types.map((t) => TYPE_NAMES[t]).join(', ')}.`);
    if (spec.links.length) parts.push(`Quellen (Links): ${spec.links.join(' ')}`);
    return parts.join(' ');
  }
  const settingsOf = (spec) => ({ kind: spec.kind, count: spec.count, minutes: spec.minutes, level: spec.level, types: spec.types, topic: spec.topic.slice(0, 300) });

  return { parse, figure, progress, status, wrote, open, dialog, pickMention, sectionsOf, requestText, settingsOf, KINDS, TYPE_NAMES };
})();
if (typeof window !== 'undefined') window.Lernset = Lernset;
if (typeof module !== 'undefined') module.exports = Lernset;
