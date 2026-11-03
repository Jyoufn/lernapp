/* =====================================================================
   Podcast im Chat (```podcast von der KI, Prompt: lib/workflow.js → PODCAST_PROMPT)
   - Player wie bei Spotify: Cover, Titel, Fortschritt (antippen = springen), Play/Pause, Beitrag zurück/vor, Lautstärke, Kapitel.
   - Transkript darunter: der gerade gesprochene Beitrag ist hervorgehoben und scrollt mit; antippen = dorthin springen.
   - Stimmen: Gemini-Sprachmodell, je Abschnitt EIN Gespräch mit zwei Stimmen (/api/podcast/audio, Web Audio, nächste Abschnitte werden
     schon geladen). Geht das nicht (kein Schlüssel, Limit), sprechen die Stimmen des Geräts.
   - Mitreden: Frage stellen → Wiedergabe hält an, die Sprecher antworten darauf (/api/podcast/answer). Ihre Antwort kommt an genau dieser
     Stelle ins Skript, danach geht es mit dem Rest unverändert weiter; der Chat merkt sich das neue Skript.
   ===================================================================== */
const Podcast = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 14) => (window.FadeIcons ? FadeIcons.svg(n, s) : '');
  const VOICES = { w: ['Kore', 'Aoede', 'Leda'], m: ['Puck', 'Charon', 'Orus'] };
  const COLORS = ['#8db6ff', '#eba3c9', '#8fd8ae'];
  const CPS = 14.5; // gesprochene Zeichen je Sekunde (Schätzung, bis der Ton da ist)
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  let volume = Math.max(0, Math.min(1, Number(read('podcast.vol', 0.9))));
  let actx = null, gain = null, active = null;

  /* ---------- Block lesen ---------- */
  function parse(raw) {
    let d = null;
    try { d = JSON.parse(String(raw || '').trim()); } catch { return null; }
    const sprecher = (Array.isArray(d?.sprecher) ? d.sprecher : []).slice(0, 3).map((x) => ({ name: String(x?.name || '').trim().slice(0, 30), rolle: String(x?.rolle || '').slice(0, 60), stimme: x?.stimme === 'm' ? 'm' : 'w' })).filter((x) => x.name);
    const names = new Set(sprecher.map((x) => x.name));
    const zeilen = (Array.isArray(d?.zeilen) ? d.zeilen : []).map((z) => ({ s: String(z?.s || '').trim(), t: String(z?.t || '').replace(/\s+/g, ' ').trim(), ...(z?.du ? { du: true } : {}) }))
      .filter((z) => z.t && (z.du || names.has(z.s)));
    if (!sprecher.length || zeilen.length < 2) return null;
    const kapitel = (Array.isArray(d.kapitel) ? d.kapitel : []).map((k) => ({ ab: Math.max(0, Math.min(zeilen.length - 1, Math.round(Number(k?.ab) || 0))), titel: String(k?.titel || '').slice(0, 60) })).filter((k) => k.titel).slice(0, 8);
    return { titel: String(d.titel || 'Podcast').slice(0, 90), untertitel: String(d.untertitel || '').slice(0, 160), sprecher, kapitel, zeilen };
  }
  const clock = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const audio = () => {
    if (!actx) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {} // iPad: auch bei stummgeschaltetem Gerät hörbar wie ein Podcast
      actx = new (window.AudioContext || window.webkitAudioContext)(); gain = actx.createGain(); gain.gain.value = volume; gain.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  };

  /* ---------- Abschnitte: aufeinanderfolgende Beiträge, höchstens 2 Sprecher (ein Gespräch = ein Ton). Der erste ist kurz (≤ 3 Beiträge,
     ≤ 380 Zeichen), damit es schnell losgeht; danach ≤ 8 Beiträge und ≤ 800 Zeichen (gut 1 Minute Ton, bleibt unter dem Vercel-Limit) ---------- */
  function segmentize(zeilen, idx) {
    const out = [];
    let cur = null;
    for (const i of idx) {
      const z = zeilen[i];
      if (z.du) continue; // Fragen des Zuhörers werden nicht vorgelesen
      const who = new Set(cur ? cur.idx.map((j) => zeilen[j].s) : []);
      who.add(z.s);
      const first = out.length === 1;
      if (!cur || cur.idx.length >= (first ? 3 : 8) || cur.chars + z.t.length > (first ? 380 : 800) || who.size > 2) { cur = { idx: [], chars: 0, buf: null, status: 'idle' }; out.push(cur); }
      cur.idx.push(i); cur.chars += z.t.length;
    }
    return out;
  }
  const estDur = (seg, zeilen) => seg.idx.reduce((n, i) => n + zeilen[i].t.length / CPS + 0.35, 0);

  /* ---------- Player ---------- */
  function figure(data, { onChange } = {}) {
    const voices = {};
    const used = { w: 0, m: 0 };
    data.sprecher.forEach((s) => { voices[s.name] = VOICES[s.stimme][used[s.stimme]++ % 3]; });
    const color = Object.fromEntries(data.sprecher.map((s, i) => [s.name, COLORS[i % COLORS.length]]));
    let segs = segmentize(data.zeilen, data.zeilen.map((_, i) => i));
    let engine = 'gemini', playing = false, want = false, src = null, startedAt = 0, startOff = 0, seg = 0, segT = 0, raf = 0, lineNow = -1, asking = false;

    const fig = document.createElement('figure');
    fig.className = 'pod';
    const who = data.sprecher.map((s) => s.name).join(' & ');
    fig.innerHTML = `<div class="pod-top"><div class="pod-cover" aria-hidden="true"><span class="pod-wave"><i></i><i></i><i></i><i></i><i></i></span></div>
        <div class="pod-meta"><span class="pod-kick">Podcast</span><b class="pod-title">${esc(data.titel)}</b><span class="pod-sub">${esc(who)}<span class="pod-len"></span></span><span class="pod-state"></span></div></div>
      <div class="pod-bar"><span class="pod-t">0:00</span><div class="pod-track" role="slider" aria-label="Fortschritt" tabindex="0"><div class="pod-fill"></div><div class="pod-knob"></div></div><span class="pod-d"></span></div>
      <div class="pod-ctrl">
        <button type="button" class="pod-btn" data-pod="prev" aria-label="Vorheriger Beitrag">${fi('prev', 16)}</button>
        <button type="button" class="pod-play" data-pod="play" aria-label="Abspielen">${fi('play', 18)}</button>
        <button type="button" class="pod-btn" data-pod="next" aria-label="Nächster Beitrag">${fi('next', 16)}</button>
        <span class="pod-grow"></span>
        <label class="pod-vol" aria-label="Lautstärke">${fi('volume', 14)}<input type="range" min="0" max="1" step="0.05" value="${volume}" /></label>
        <button type="button" class="pod-ask" data-pod="ask">${fi('mic', 13)}Mitreden</button>
      </div>
      <form class="pod-askbox" hidden><input maxlength="400" placeholder="Frag ${esc(who)} etwas – die beiden gehen darauf ein …" aria-label="Frage an den Podcast" /><button type="submit" class="pod-send">Fragen</button></form>
      ${data.kapitel.length ? `<div class="pod-chaps">${data.kapitel.map((k, i) => `<button type="button" class="pod-chap" data-chap="${i}">${esc(k.titel)}</button>`).join('')}</div>` : ''}
      <div class="pod-tr"></div>`;
    const $ = (s) => fig.querySelector(s);
    const tr = $('.pod-tr'), playBtn = $('.pod-play'), state = $('.pod-state');

    const drawTranscript = () => {
      tr.innerHTML = data.zeilen.map((z, i) => `<p class="pod-l${z.du ? ' du' : ''}" data-i="${i}"><b style="${z.du ? '' : `color:${color[z.s] || COLORS[0]}`}">${esc(z.du ? 'Du' : z.s)}</b><span>${esc(z.t)}</span></p>`).join('');
      lineNow = -1;
    };
    drawTranscript();
    const total = () => segs.reduce((n, s) => n + (s.buf ? s.to - s.from : estDur(s, data.zeilen)), 0);
    const before = (k) => segs.slice(0, k).reduce((n, s) => n + (s.buf ? s.to - s.from : estDur(s, data.zeilen)), 0);
    const nowT = () => (playing && src && engine === 'gemini' ? startOff - segs[seg].from + (actx.currentTime - startedAt) : segT);
    // Beitrag zu einer Stelle im Abschnitt (mit Ton: Anteil der Zeichen; sonst Schätzung)
    const lineAt = (s, t) => {
      const span = s.buf ? s.to - s.from : estDur(s, data.zeilen);
      const all = s.idx.reduce((n, i) => n + data.zeilen[i].t.length + 5, 0);
      let acc = 0;
      for (const i of s.idx) { acc += data.zeilen[i].t.length + 5; if ((acc / all) * span > t + 1e-6) return i; }
      return s.idx[s.idx.length - 1];
    };
    const startOf = (s, i) => {
      const span = s.buf ? s.to - s.from : estDur(s, data.zeilen);
      const all = s.idx.reduce((n, j) => n + data.zeilen[j].t.length + 5, 0);
      let acc = 0;
      for (const j of s.idx) { if (j === i) return (acc / all) * span; acc += data.zeilen[j].t.length + 5; }
      return 0;
    };
    const paint = () => {
      const T = total(), t = Math.min(T, before(seg) + nowT());
      $('.pod-fill').style.width = `${T ? (t / T) * 100 : 0}%`;
      $('.pod-knob').style.left = `${T ? (t / T) * 100 : 0}%`;
      $('.pod-t').textContent = clock(t);
      $('.pod-d').textContent = clock(T);
      $('.pod-len').textContent = ` · ${Math.max(1, Math.round(T / 60))} Min.`;
      const s = segs[seg];
      const i = s ? lineAt(s, nowT()) : -1;
      if (i !== lineNow) {
        tr.querySelector('.pod-l.on')?.classList.remove('on');
        const el = tr.querySelector(`.pod-l[data-i="${i}"]`);
        if (el) { el.classList.add('on'); if (playing) tr.scrollTo({ top: el.offsetTop - tr.clientHeight / 3, behavior: 'smooth' }); }
        lineNow = i;
        // aktuelles Kapitel markieren (eingefügte Antworten gehören zum Kapitel, in dem gefragt wurde)
        let c = -1;
        data.kapitel.forEach((k, n) => { if (k.ab <= i) c = n; });
        fig.querySelectorAll('.pod-chap').forEach((b, n) => b.classList.toggle('on', n === c));
      }
    };
    const loop = () => { cancelAnimationFrame(raf); const step = () => { paint(); if (playing) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); };
    const setState = (t) => { state.textContent = t || ''; state.classList.toggle('on', !!t); };
    const setPlay = (on) => { playBtn.innerHTML = fi(on ? 'pause' : 'play', 18); playBtn.setAttribute('aria-label', on ? 'Pause' : 'Abspielen'); fig.classList.toggle('playing', on); };

    /* Ton eines Abschnitts holen (rohes PCM, 16 Bit) → AudioBuffer */
    async function load(s) {
      if (!s || s.status === 'ready' || s.status === 'error') return;
      if (s.loading) return s.loading;
      s.status = 'loading';
      s.loading = (async () => {
        try {
          const r = await fetch('/api/podcast/audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: s.idx.map((i) => ({ s: data.zeilen[i].s, t: data.zeilen[i].t })), voices }) });
          const type = r.headers.get('content-type') || '';
          if (!r.ok || !/l16/.test(type)) throw new Error('kein Ton');
          const rate = Number((type.match(/rate=(\d+)/) || [])[1]) || 24000;
          const bytes = new Uint8Array(await r.arrayBuffer());
          const n = Math.floor(bytes.length / 2);
          if (n < rate * 0.5) throw new Error('zu kurz');
          const ctx = audio(), buf = ctx.createBuffer(1, n, rate), ch = buf.getChannelData(0), view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
          for (let k = 0; k < n; k++) ch[k] = view.getInt16(k * 2, true) / 32768;
          s.buf = buf; s.from = 0; s.to = buf.duration; s.status = 'ready';
        } catch { s.status = 'error'; }
        s.loading = null;
      })();
      return s.loading;
    }
    const prefetch = () => { for (let k = seg + 1; k <= seg + 2 && k < segs.length; k++) if (segs[k].status === 'idle') load(segs[k]); };

    /* Wiedergabe mit dem Gemini-Ton */
    async function play() {
      want = true;
      if (active && active !== api) active.pause();
      active = api;
      if (seg >= segs.length) { seg = 0; segT = 0; }
      if (engine === 'browser') return speak();
      audio();
      const s = segs[seg];
      if (!s.buf) {
        setState(seg === 0 && segT === 0 ? 'Wird vertont …' : 'Lädt …'); fig.classList.add('buffering');
        await load(s);
        fig.classList.remove('buffering'); setState('');
        if (!want || active !== api) return;
        if (s.status === 'error') { engine = 'browser'; return speak(); } // keine Stimmen → die des Geräts
      }
      if (!want || active !== api) return;
      stopSrc();
      src = actx.createBufferSource();
      src.buffer = s.buf; src.connect(gain);
      startOff = s.from + segT;
      const me = src;
      src.onended = () => { if (me !== src) return; src = null; playing = false; seg++; segT = 0; if (seg < segs.length) play(); else { want = false; setPlay(false); seg = segs.length - 1; segT = segs[seg].buf ? segs[seg].to - segs[seg].from : estDur(segs[seg], data.zeilen); paint(); } };
      src.start(0, startOff, Math.max(0.05, s.to - startOff));
      startedAt = actx.currentTime;
      playing = true; setPlay(true); loop(); prefetch();
    }
    function stopSrc() { if (src) { const s = src; src = null; s.onended = null; try { s.stop(); } catch {} } }
    function pause() {
      want = false;
      if (engine === 'browser') { try { speechSynthesis.cancel(); } catch {} }
      if (playing && engine === 'gemini') segT = nowT();
      stopSrc(); playing = false; setPlay(false); paint();
    }
    function seekLine(i) {
      const k = segs.findIndex((s) => s.idx.includes(i));
      if (k < 0) return;
      const wasOn = want;
      stopSrc(); if (engine === 'browser') { try { speechSynthesis.cancel(); } catch {} }
      playing = false; seg = k; segT = startOf(segs[k], i); paint();
      if (wasOn) play();
    }

    /* Ersatz: Stimmen des Geräts, Beitrag für Beitrag */
    let devVoices = null;
    const pickVoices = () => {
      const all = (window.speechSynthesis?.getVoices?.() || []).filter((v) => /^de/i.test(v.lang));
      const fem = all.filter((v) => /anna|helena|petra|katja|marlene|vicki|sandy|shelley|female|frau/i.test(v.name));
      const mal = all.filter((v) => /markus|martin|yannick|hans|reed|rocko|eddy|male|mann/i.test(v.name));
      const out = {};
      data.sprecher.forEach((s, i) => { const pool = s.stimme === 'm' ? (mal.length ? mal : all) : (fem.length ? fem : all); out[s.name] = pool[i % Math.max(1, pool.length)] || null; });
      return out;
    };
    function speak() {
      if (!window.speechSynthesis) { setState('Keine Stimme verfügbar'); return; }
      devVoices ||= pickVoices();
      const s = segs[seg];
      if (!s) { want = false; setPlay(false); return; }
      const i = lineAt(s, segT);
      const z = data.zeilen[i];
      const u = new SpeechSynthesisUtterance(z.t);
      u.lang = 'de-DE'; u.volume = volume; u.rate = 1.02;
      if (devVoices[z.s]) u.voice = devVoices[z.s];
      u.pitch = data.sprecher.findIndex((x) => x.name === z.s) % 2 ? 0.92 : 1.08; // zwei Sprecher hörbar verschieden
      playing = true; setPlay(true); loop();
      u.onend = () => {
        if (!want || active !== api) return;
        const j = s.idx.indexOf(i);
        if (j < s.idx.length - 1) segT = startOf(s, s.idx[j + 1]);
        else { seg++; segT = 0; }
        if (seg >= segs.length) { want = false; playing = false; setPlay(false); seg = segs.length - 1; paint(); return; }
        speak();
      };
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }

    /* Mitreden: Frage → Antwort der Sprecher an dieser Stelle ins Skript, danach geht es unverändert weiter */
    async function ask(question) {
      if (asking) return;
      asking = true;
      pause();
      const s = segs[seg];
      const at = s ? lineAt(s, segT) : data.zeilen.length - 1;
      // Rest dieses Abschnitts beginnt beim nächsten Beitrag (Ton bleibt – ab dieser Stelle)
      const pos = s ? s.idx.indexOf(at) : -1;
      const cutAt = !s ? 0 : pos < s.idx.length - 1 ? startOf(s, s.idx[pos + 1]) : (s.buf ? s.to - s.from : 0);
      data.zeilen.splice(at + 1, 0, { s: 'Du', t: question, du: true });
      drawTranscript();
      fig.classList.add('answering'); setState('Die beiden antworten …');
      let lines = null;
      try {
        const r = await fetch('/api/podcast/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: data.titel, speakers: data.sprecher, before: data.zeilen.slice(Math.max(0, at - 24), at + 1).filter((z) => !z.du), question, next: data.zeilen.slice(at + 2).find((z) => !z.du)?.t || '' }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && Array.isArray(j.zeilen) && j.zeilen.length) lines = j.zeilen;
      } catch {}
      fig.classList.remove('answering'); setState('');
      if (!lines) { setState('Gerade keine Antwort – nochmal versuchen'); setTimeout(() => setState(''), 4000); asking = false; return; }
      const n = lines.length + 1; // Frage + Antworten
      data.zeilen.splice(at + 2, 0, ...lines.map((z) => ({ s: z.s, t: z.t })));
      data.kapitel.forEach((c) => { if (c.ab > at) c.ab += n; }); // Kapitel danach rücken mit
      // Abschnitte neu ordnen: [... bis „at“] [Antwort] [Rest des Abschnitts] [...]
      const shift = (idx) => idx.map((i) => (i > at ? i + n : i));
      const k = segs.indexOf(s);
      const head = s ? { ...s, idx: s.idx.filter((i) => i <= at) } : null;
      const tail = s ? { ...s, idx: shift(s.idx.filter((i) => i > at)) } : null;
      if (s?.buf) { head.to = s.from + cutAt; tail.from = s.from + cutAt; }
      const answer = segmentize(data.zeilen, Array.from({ length: lines.length }, (_, x) => at + 2 + x));
      const rest = segs.slice(k + 1).map((x) => ({ ...x, idx: shift(x.idx) }));
      segs = [...segs.slice(0, k), ...(head?.idx.length ? [head] : []), ...answer, ...(tail?.idx.length ? [tail] : []), ...rest];
      seg = segs.indexOf(answer[0]); segT = 0;
      drawTranscript(); paint();
      onChange?.(JSON.stringify({ titel: data.titel, untertitel: data.untertitel, sprecher: data.sprecher, kapitel: data.kapitel, zeilen: data.zeilen }));
      asking = false;
      play();
    }

    /* Bedienung */
    fig.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pod]');
      if (b) {
        const a = b.dataset.pod;
        if (a === 'play') { if (want) pause(); else play(); }
        else if (a === 'prev' || a === 'next') {
          const s = segs[seg]; const i = s ? lineAt(s, nowT()) : 0;
          const voiced = data.zeilen.map((z, j) => (z.du ? -1 : j)).filter((j) => j >= 0);
          const p = voiced.indexOf(i);
          seekLine(voiced[Math.max(0, Math.min(voiced.length - 1, p + (a === 'next' ? 1 : -1)))]);
        } else if (a === 'ask') { const f = $('.pod-askbox'); f.hidden = !f.hidden; if (!f.hidden) f.querySelector('input').focus(); }
        return;
      }
      const ch = e.target.closest('[data-chap]');
      if (ch) { const z = data.kapitel[+ch.dataset.chap]?.ab ?? 0; const voiced = data.zeilen.findIndex((x, j) => j >= z && !x.du); seekLine(voiced < 0 ? 0 : voiced); return; }
      const l = e.target.closest('.pod-l');
      if (l && !l.classList.contains('du')) { seekLine(+l.dataset.i); if (!want) play(); }
    });
    $('.pod-track').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect(), T = total(), t = ((e.clientX - r.left) / r.width) * T;
      let acc = 0;
      for (let k = 0; k < segs.length; k++) {
        const d = segs[k].buf ? segs[k].to - segs[k].from : estDur(segs[k], data.zeilen);
        if (acc + d >= t) { seekLine(lineAt(segs[k], t - acc)); return; }
        acc += d;
      }
    });
    $('.pod-vol input').addEventListener('input', (e) => {
      volume = Number(e.target.value);
      try { localStorage.setItem('podcast.vol', JSON.stringify(volume)); } catch {}
      if (gain) gain.gain.value = volume;
    });
    $('.pod-askbox').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = e.currentTarget.querySelector('input'), q = inp.value.trim();
      if (!q) return;
      inp.value = ''; e.currentTarget.hidden = true;
      ask(q);
    });
    const api = { pause, el: fig };
    paint();
    return fig;
  }
  // solange die KI den Podcast noch schreibt: Karte mit mitzählenden Beiträgen
  function pending() {
    const fig = document.createElement('figure');
    fig.className = 'pod pod-wait';
    fig.innerHTML = `<div class="pod-top"><div class="pod-cover" aria-hidden="true"><span class="pod-wave"><i></i><i></i><i></i><i></i><i></i></span></div><div class="pod-meta"><span class="pod-kick">Podcast</span><b class="pod-title shimmer">Skript wird geschrieben</b><span class="pod-sub"></span></div></div>`;
    fig._count = (raw) => { const n = (String(raw).match(/"t"\s*:/g) || []).length; fig.querySelector('.pod-sub').textContent = n ? `${n} Beiträge` : ''; };
    return fig;
  }
  return { parse, figure, pending };
})();
window.Podcast = Podcast;
