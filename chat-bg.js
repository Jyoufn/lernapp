/* =====================================================================
   Chat-Hintergrund (Einstellungen → Aussehen → Chat-Hintergrund, oder per Chat: ```einstellung {"hintergrund":"sterne"})
   - Animierte Vorlagen auf EINER Leinwand hinter dem Chat: Punkte, Sterne, Wellen, Linien, Raster, Regen, Nebel – ruhig, dunkel, einfarbig.
   - „Eigener“: von der KI geschriebener Code (```hintergrund) läuft abgeschottet im iframe (wie Mini-Apps), ohne Klicks.
   - Schonend: höchstens 30 Bilder/s, Pixeldichte begrenzt, steht still, wenn der Tab/Chat nicht sichtbar ist; „Bewegung reduzieren“ → Standbild.
   ===================================================================== */
const ChatBg = (() => {
  const KEY = 'chatbg.v1';
  const KINDS = { aus: 'Aus', punkte: 'Punkte', sterne: 'Sterne', wellen: 'Wellen', linien: 'Linien', raster: 'Raster', regen: 'Regen', nebel: 'Nebel' };
  const COLORS = ['#ffffff', '#6aa8ff', '#2dd4bf', '#4fcf8a', '#facc15', '#f0913a', '#f472b6'];
  const DEF = { kind: 'aus', strength: 50, speed: 50, color: '#ffffff', custom: '' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 14) => (window.FadeIcons ? FadeIcons.svg(n, s) : '');
  let cfg = { ...DEF };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const rgb = (hex) => { const n = parseInt(String(hex).slice(1), 16) || 0xffffff; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  /* ---------- Szenen: init(w, h) → Zustand, draw(ctx, st, t, dt, w, h, c) ---------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const SCENES = {
    punkte: {
      init: (w, h) => ({ p: Array.from({ length: Math.round(Math.min(140, w * h / 11000)) }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(0.6, 1.9), vx: rnd(-6, 6), vy: rnd(-8, -2), a: rnd(0.25, 1) })) }),
      draw(ctx, st, t, dt, w, h, c) {
        for (const p of st.p) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y < -4) { p.y = h + 4; p.x = rnd(0, w); } if (p.x < -4) p.x = w + 4; if (p.x > w + 4) p.x = -4;
          ctx.globalAlpha = p.a * 0.55; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }
      },
    },
    sterne: {
      init: (w, h) => ({ p: Array.from({ length: Math.round(Math.min(220, w * h / 6500)) }, () => ({ x: rnd(0, w), y: rnd(0, h), z: rnd(0.2, 1), ph: rnd(0, 6.28), f: rnd(0.4, 1.4) })) }),
      draw(ctx, st, t, dt, w, h, c) {
        ctx.fillStyle = c;
        for (const s of st.p) {
          s.x -= s.z * 4 * dt; if (s.x < -2) { s.x = w + 2; s.y = rnd(0, h); }
          const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.f + s.ph));
          ctx.globalAlpha = tw * s.z * 0.9; const r = s.z * 1.35;
          ctx.fillRect(s.x - r / 2, s.y - r / 2, r, r);
        }
      },
    },
    wellen: {
      init: () => ({}),
      draw(ctx, st, t, dt, w, h, c) {
        ctx.strokeStyle = c; ctx.lineWidth = 1;
        const n = 9;
        for (let i = 0; i < n; i++) {
          const y0 = h * (0.25 + 0.55 * (i / (n - 1))), amp = 14 + i * 3, k = 0.0045 + i * 0.0004, sp = 0.35 + i * 0.05;
          ctx.globalAlpha = 0.16 + 0.32 * Math.sin((i / (n - 1)) * Math.PI);
          ctx.beginPath();
          for (let x = 0; x <= w; x += 14) { const y = y0 + Math.sin(x * k + t * sp + i) * amp + Math.sin(x * k * 0.47 - t * sp * 0.6) * amp * 0.6; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
        }
      },
    },
    linien: {
      init: (w, h) => ({ p: Array.from({ length: 70 }, () => ({ x: rnd(0, w), y: rnd(0, h), l: rnd(40, 140), v: rnd(10, 30), a: rnd(0.2, 0.8) })) }),
      draw(ctx, st, t, dt, w, h, c) {
        ctx.strokeStyle = c; ctx.lineWidth = 1;
        for (const p of st.p) {
          p.x += p.v * dt; p.y -= p.v * 0.45 * dt;
          if (p.x - p.l > w || p.y + p.l < 0) { p.x = rnd(-w * 0.4, w * 0.6); p.y = h + rnd(0, h * 0.4); }
          ctx.globalAlpha = p.a * 0.45;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.l, p.y + p.l * 0.45); ctx.stroke();
        }
      },
    },
    raster: { // dieselben abgerundeten Kacheln wie beim Bild-Erzeugen, eine weiche Welle zieht durch
      init: () => ({}),
      draw(ctx, st, t, dt, w, h, c) {
        const S = 22, G = 10, step = S + G, cols = Math.ceil(w / step) + 1, rows = Math.ceil(h / step) + 1;
        ctx.fillStyle = c;
        for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
          const d = q * 0.16 + r * 0.07 - t * 0.9, wave = Math.max(0, Math.sin(d)) ** 6;
          ctx.globalAlpha = 0.06 + wave * 0.5;
          const x = q * step + 4, y = r * step + 4;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, S, S, 5) : ctx.rect(x, y, S, S); ctx.fill();
        }
      },
    },
    regen: {
      init: (w, h) => ({ p: Array.from({ length: Math.round(Math.min(160, w / 9)) }, () => ({ x: rnd(0, w), y: rnd(0, h), l: rnd(8, 22), v: rnd(140, 260), a: rnd(0.2, 0.7) })) }),
      draw(ctx, st, t, dt, w, h, c) {
        ctx.strokeStyle = c; ctx.lineWidth = 1;
        for (const p of st.p) {
          p.y += p.v * dt; p.x -= p.v * 0.08 * dt;
          if (p.y - p.l > h) { p.y = -rnd(0, 60); p.x = rnd(0, w + 40); }
          ctx.globalAlpha = p.a * 0.5;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.l * 0.08, p.y - p.l); ctx.stroke();
        }
      },
    },
    nebel: {
      init: (w, h) => ({ p: Array.from({ length: 5 }, (_, i) => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(0.35, 0.6) * Math.max(w, h), ph: i * 1.7, s: rnd(0.04, 0.09) })) }),
      draw(ctx, st, t, dt, w, h, c, col) {
        for (const b of st.p) {
          const x = b.x + Math.sin(t * b.s + b.ph) * w * 0.18, y = b.y + Math.cos(t * b.s * 0.8 + b.ph) * h * 0.14;
          const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
          g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.10)`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        }
      },
    },
  };

  /* ---------- Leinwand hinter dem Chat ---------- */
  const panel = document.querySelector('.panel');
  const layer = document.createElement('div');
  layer.className = 'chat-bg'; layer.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  layer.append(canvas);
  panel?.prepend(layer);
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, st = null, raf = 0, last = 0, t = 0, shown = false, frame = null;
  function size() {
    const r = layer.getBoundingClientRect(), dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    st = SCENES[cfg.kind]?.init(W, H) || null;
  }
  function paint(dt) {
    const sc = SCENES[cfg.kind]; if (!sc) return;
    ctx.clearRect(0, 0, W, H);
    sc.draw(ctx, st, t, dt, W, H, cfg.color, rgb(cfg.color));
    ctx.globalAlpha = 1;
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return; // ~30 Bilder/s
    const dt = Math.min(0.1, (now - last) / 1000) * (0.25 + (cfg.speed / 100) * 1.75);
    last = now; t += dt;
    paint(dt);
  }
  const wanted = () => {
    if (cfg.kind === 'aus' || !panel) return false;
    if (document.getElementById('app')?.classList.contains('settings-open')) return false;
    const tab = typeof activeTab === 'function' ? activeTab() : null;
    return !!tab && !tab.dataset.view;
  };
  function update() {
    const on = wanted() && !document.hidden;
    panel?.classList.toggle('has-cbg', cfg.kind !== 'aus');
    layer.style.setProperty('--cbg', String(Math.max(0, Math.min(100, cfg.strength)) / 100));
    layer.classList.toggle('on', wanted());
    const custom = cfg.kind === 'eigener';
    canvas.hidden = custom;
    // eigener Code: iframe (abgeschottet) – nur solange sichtbar
    if (custom && on && cfg.custom && window.CodeBox) {
      if (!frame) { const host = document.createElement('div'); host.className = 'chat-bg-frame'; layer.append(host); frame = host; CodeBox.start(host, cfg.custom, { fill: true, title: 'Hintergrund' }); }
    } else if (frame) { CodeBox.stop(frame); frame.remove(); frame = null; }
    if (on && !custom && SCENES[cfg.kind]) {
      if (!st || canvas.width < 2) size();
      if (reduced()) { cancelAnimationFrame(raf); raf = 0; t = 4; paint(0); return; }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    } else { cancelAnimationFrame(raf); raf = 0; }
    shown = on;
  }
  window.addEventListener('resize', () => { if (shown) { size(); if (reduced()) paint(0); } });
  window.addEventListener('chat-tab-switched', () => setTimeout(update, 0));
  document.addEventListener('visibilitychange', update);
  const appEl = document.getElementById('app');
  if (appEl) new MutationObserver(update).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  setTimeout(update, 0);

  function set(patch, quiet) {
    const kindChanged = patch.kind && patch.kind !== cfg.kind;
    cfg = { ...cfg, ...patch };
    if (cfg.kind === 'eigener' && !cfg.custom) cfg.kind = 'aus';
    if (typeof cfg.custom === 'string' && cfg.custom.length > 80000) cfg.custom = cfg.custom.slice(0, 80000);
    save();
    if (kindChanged || patch.custom) { st = null; if (frame) { CodeBox.stop(frame); frame.remove(); frame = null; } }
    update();
    if (!quiet || window.Settings) window.Settings?.redraw?.();
  }

  /* ---------- Vorschau-Kacheln (Einstellungen) ---------- */
  function thumb(kind) {
    const c = document.createElement('canvas'), w = 120, h = 72, dpr = 2;
    c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sc = SCENES[kind];
    if (sc) { const s = sc.init(w * 2, h * 2); x.scale(0.5, 0.5); sc.draw(x, s, 3.2, 0, w * 2, h * 2, cfg.color, rgb(cfg.color)); }
    return c.toDataURL('image/png');
  }
  const thumbs = {};
  const seg = (attr, items, on) => `<span class="st-seg" role="radiogroup">${items.map(([l, v]) => `<button type="button" role="radio" aria-checked="${v === on}" class="${v === on ? 'on' : ''}" ${attr}="${v}">${esc(l)}</button>`).join('')}</span>`;
  const near = (v, list) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  function html() {
    const key = cfg.color;
    if (thumbs._c !== key) { Object.keys(SCENES).forEach((k) => { thumbs[k] = thumb(k); }); thumbs._c = key; }
    const kinds = Object.entries(KINDS).concat(cfg.custom ? [['eigener', 'Eigener']] : []);
    const tiles = kinds.map(([k, label]) => `<button type="button" class="cbg-tile${cfg.kind === k ? ' on' : ''}" data-cbg-kind="${k}"><span class="cbg-prev${k === 'aus' ? ' none' : ''}"${thumbs[k] ? ` style="background-image:url(${thumbs[k]})"` : ''}>${k === 'eigener' ? fi('codewin', 16) : ''}</span><span class="cbg-name">${label}</span></button>`).join('');
    const off = cfg.kind === 'aus';
    return `<h2>Chat-Hintergrund</h2><div class="st-card">
      <div class="st-row st-modes-row"><span class="st-name">Animation</span><div class="cbg-tiles">${tiles}</div></div>
      ${off ? '' : `<div class="st-row"><span class="st-name">Stärke</span><span class="grow"></span>${seg('data-cbg-str', [['Leicht', '25'], ['Mittel', '50'], ['Stark', '85']], String(near(cfg.strength, [25, 50, 85])))}</div>
      ${cfg.kind === 'eigener' ? '' : `<div class="st-row"><span class="st-name">Tempo</span><span class="grow"></span>${seg('data-cbg-spd', [['Langsam', '20'], ['Normal', '50'], ['Schnell', '85']], String(near(cfg.speed, [20, 50, 85])))}</div>
      <div class="st-row"><span class="st-name">Farbe</span><span class="grow"></span><span class="st-swatches">${COLORS.map((c) => `<button type="button" class="st-sw${c === cfg.color ? ' on' : ''}" style="--sw:${c}" data-cbg-col="${c}" aria-label="Farbe ${c}"></button>`).join('')}</span></div>`}`}
      ${cfg.custom ? `<div class="st-row"><span class="st-name">Eigener Hintergrund</span><span class="grow"></span><button type="button" class="st-btn dark" data-cbg-rm>Entfernen</button></div>` : ''}
      <p class="st-ws-note cbg-note">Eigene Hintergründe erstellt die KI: z. B. „Mach mir einen animierten Hintergrund mit langsam ziehenden Wolken“.</p>
    </div>`;
  }
  function click(e) {
    const k = e.target.closest('[data-cbg-kind]'); if (k) { set({ kind: k.dataset.cbgKind }); return true; }
    const s = e.target.closest('[data-cbg-str]'); if (s) { set({ strength: +s.dataset.cbgStr }); return true; }
    const p = e.target.closest('[data-cbg-spd]'); if (p) { set({ speed: +p.dataset.cbgSpd }); return true; }
    const c = e.target.closest('[data-cbg-col]'); if (c) { set({ color: c.dataset.cbgCol }); return true; }
    if (e.target.closest('[data-cbg-rm]')) { set({ custom: '', kind: cfg.kind === 'eigener' ? 'aus' : cfg.kind }); return true; }
    return false;
  }
  (window.SettingsHooks ||= []).push({ page: 'look', order: 1, html, click });

  /* ---------- ```hintergrund im Chat: Vorschau + „Als Hintergrund verwenden“ ---------- */
  function figure(raw) {
    const fig = document.createElement('figure');
    fig.className = 'cbx cbg-fig';
    const code = String(raw || '').replace(/^\s*(titel|title)\s*:.*\n/i, '');
    const title = (String(raw).match(/^\s*(?:titel|title)\s*:\s*(.+)$/im) || [])[1] || 'Eigener Hintergrund';
    const active = () => cfg.kind === 'eigener' && cfg.custom === code;
    const draw = () => {
      fig.querySelector('.cbx-head').innerHTML = `<span class="cbx-ic">${fi('image', 14)}</span><span class="cbx-title">${esc(title.slice(0, 60))}</span><span class="cbx-grow"></span>`
        + (active() ? `<span class="cbg-on">${fi('check', 12)}Aktiv</span>` : '<button type="button" class="cbg-use" data-use>Als Hintergrund verwenden</button>');
    };
    fig.innerHTML = '<div class="cbx-head"></div><div class="cbx-body"><div class="cbg-stage"></div></div>';
    draw();
    const stage = fig.querySelector('.cbg-stage');
    // Vorschau erst starten, wenn sichtbar
    const io = new IntersectionObserver((list) => list.forEach((en) => {
      if (en.isIntersecting && !stage._cbx && window.CodeBox) CodeBox.start(stage, code, { fill: true, title: 'Hintergrund-Vorschau' });
      else if (!en.isIntersecting && stage._cbx) CodeBox.stop(stage);
    }));
    io.observe(stage);
    fig.addEventListener('click', (e) => { if (e.target.closest('[data-use]')) { set({ custom: code, kind: 'eigener' }); draw(); window.CodeBox?.toast('Hintergrund übernommen'); } });
    return fig;
  }

  return { get: () => ({ ...cfg }), set, figure, KINDS };
})();
window.ChatBg = ChatBg;
