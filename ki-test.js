/* ===================================================================
   KI-Test (Einstellungen → Haupt-KI): Vergleich „Gemini gegen Musterantwort“.
   Schickt feste Testfragen an die echte KI (genau wie der Chat: /api/chat, gleiche Agenten und Stufen), prüft jede Antwort automatisch
   (Inhalt, Länge, Suche, Denken, Belege) und zeigt sie neben der Musterantwort von Claude. Ergebnis bleibt gespeichert (kitest.v1).
   Verbraucht etwas Kontingent – läuft nur auf Knopfdruck.
   =================================================================== */
(() => {
  const KEY = 'kitest.v1';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 13) => (window.FadeIcons ? FadeIcons.svg(n, s) : '');
  const words = (t) => String(t || '').replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  const has = (re) => (r) => re.test(r.text);

  /* Testfragen: je Frage die Bedingungen (Suche, Denken, Länge) und der Inhalt, den eine sehr gute Antwort haben muss.
     ref = Musterantwort, wie Claude sie geben würde (kurz gefasst). */
  const CASES = [
    { id: 'hallo', q: 'Hallo!', agent: 'general', effort: 'auto', title: 'Begrüßung',
      ref: 'Hallo! Woran arbeiten wir heute?',
      checks: [['Kurz (höchstens 40 Wörter)', (r) => r.words <= 40], ['Kein Nachdenken nötig', (r) => !r.thought], ['Keine Suche', (r) => !r.searched]] },
    { id: 'mitose', q: 'Was ist Mitose? Erklär es kurz für Klasse 9.', agent: 'general', effort: 'auto', title: 'Kurze Erklärung',
      ref: '**Mitose** ist die Kernteilung bei der normalen Zellteilung: Aus einer Zelle entstehen zwei Tochterzellen mit **genau gleicher Erbinformation** (gleiche Chromosomenzahl). Vorher wird die DNA verdoppelt. Ablauf: **Prophase** (Chromosomen verdichten sich, Spindelapparat entsteht), **Metaphase** (Chromosomen in der Mitte), **Anaphase** (Schwesterchromatiden werden zu den Polen gezogen), **Telophase** (zwei neue Kerne, danach teilt sich das Zellplasma). Wozu? Wachstum, Erneuerung und Heilung.',
      checks: [['Nennt alle vier Phasen', (r) => ['prophase', 'metaphase', 'anaphase', 'telophase'].every((p) => r.text.toLowerCase().includes(p))], ['Kurz (höchstens 220 Wörter)', (r) => r.words <= 220], ['Gleiche Erbinformation erwähnt', has(/(gleiche|identische)\w*\s+(erb|dna|chromosom|genet)/i)], ['Keine Quellenliste am Ende', (r) => !/^#+\s*(quellen|literatur)|^\*\*quellen/im.test(r.text)]] },
    { id: 'gleichung', q: 'Löse 3x + 7 = 2x − 5 und zeig die Rechenschritte.', agent: 'general', effort: 'auto', title: 'Rechnung',
      ref: '$3x + 7 = 2x - 5 \\quad | -2x$\n\n$x + 7 = -5 \\quad | -7$\n\n$x = -12$\n\n**Probe:** $3 \\cdot (-12) + 7 = -29$ und $2 \\cdot (-12) - 5 = -29$ ✓ – also **x = −12**.',
      checks: [['Richtiges Ergebnis x = −12', has(/x\s*=\s*[-−–]\s*12\b/)], ['Rechenschritte gezeigt', (r) => (r.text.match(/=/g) || []).length >= 3], ['Hat nachgedacht', (r) => r.thought], ['Keine Suche', (r) => !r.searched]] },
    { id: 'aktuell', q: 'Was kostet das Deutschlandticket gerade?', agent: 'general', effort: 'auto', title: 'Aktuelle Frage',
      ref: 'Das Deutschlandticket kostet **seit Januar 2026 63 € im Monat** (2025: 58 €, davor 49 €). Es gilt bundesweit im Nah- und Regionalverkehr und ist ein monatlich kündbares Abo. *(Stand meines Wissens – die App sollte den aktuellen Preis im Web prüfen.)*',
      checks: [['Hat im Web gesucht', (r) => r.searched], ['Nennt einen Preis in Euro', has(/\d{2}\s*(€|euro)/i)], ['Nennt Stand/Datum', has(/(seit|ab|stand|20\d\d)/i)], ['Belegt mit Quelle', (r) => r.sources > 0 || r.cited > 0]] },
    { id: 'recherche', q: 'Recherchiere: Wie wirkt sich Social Media auf die Konzentration von Jugendlichen aus?', agent: 'research', effort: 'auto', title: 'Recherche',
      ref: 'Kurz: Studien finden einen **Zusammenhang** zwischen viel Social-Media-Nutzung und schlechterer Aufmerksamkeit – vor allem durch **ständige Unterbrechungen** (Benachrichtigungen, Multitasking), **kürzere Inhalte** (Kurzvideos) und **weniger Schlaf**. Ob Social Media die Konzentration **ursächlich** verschlechtert, ist aber **nicht eindeutig belegt** – viele Studien zeigen nur Korrelationen, die Effekte sind im Schnitt klein und hängen stark von Art und Dauer der Nutzung ab. Danach: Befunde je Bereich mit Belegen [n], was Fachstellen (z. B. WHO, DAK-Studie) empfehlen, offene Fragen.',
      checks: [['Mindestens 3 Quellen gelesen', (r) => r.sources >= 3], ['Mindestens 3 Belege [n] im Text', (r) => r.cited >= 3 || (r.text.match(/\[\d+\]/g) || []).length >= 3], ['Ausführlich (mind. 350 Wörter)', (r) => r.words >= 350], ['Trennt Zusammenhang und Ursache', has(/(korrelation|zusammenhang|kausal|ursächlich|nicht eindeutig|uneinheitlich|widersprüch)/i)]] },
    { id: 'kurz', q: 'Fass die Ursachen des Ersten Weltkriegs kurz zusammen.', agent: 'general', effort: 'max', title: 'Kurz trotz Max',
      ref: '- **Anlass:** Attentat von **Sarajevo** (28. Juni 1914) auf den österreichischen Thronfolger.\n- **Bündnissysteme:** Dreibund und Entente machten aus einem regionalen Konflikt einen großen Krieg.\n- **Imperialismus:** Konkurrenz um Kolonien und Macht.\n- **Nationalismus:** v. a. auf dem Balkan und zwischen den Großmächten.\n- **Militarismus und Wettrüsten** (z. B. Flottenrüstung Deutschland–Großbritannien).\n- **Julikrise:** Blankoscheck Deutschlands, Ultimatum an Serbien, Mobilmachungen.',
      checks: [['Kurz trotz Max (höchstens 230 Wörter)', (r) => r.words <= 230], ['Attentat von Sarajevo', has(/sarajevo/i)], ['Bündnissysteme', has(/bündnis/i)], ['Imperialismus, Nationalismus, Militarismus (mind. 2)', (r) => [/imperialis/i, /nationalis/i, /militaris|wettrüst/i].filter((x) => x.test(r.text)).length >= 2]] },
    { id: 'tabelle', q: 'Vergleiche Pflanzenzelle und Tierzelle.', agent: 'general', effort: 'auto', title: 'Vergleich mit Tabelle',
      ref: 'Beide sind **eukaryotische Zellen** mit Zellkern, Zellmembran, Zellplasma, Mitochondrien, ER und Golgi-Apparat. Unterschiede:\n\n| Merkmal | Pflanzenzelle | Tierzelle |\n|---|---|---|\n| Zellwand | ja (Cellulose) | nein |\n| Chloroplasten | ja (Fotosynthese) | nein |\n| Vakuole | große Zentralvakuole | keine bzw. kleine |\n| Form | eher eckig, fest | eher rund, flexibel |\n| Speicherstoff | Stärke | Glykogen |\n\nKurz: Die Pflanzenzelle hat zusätzlich **Zellwand, Chloroplasten und Zentralvakuole**.',
      checks: [['Als Tabelle', has(/^\s*\|.+\|\s*$/m)], ['Zellwand', has(/zellwand/i)], ['Chloroplasten', has(/chloroplast/i)], ['Vakuole', has(/vakuole/i)]] },
  ];

  let state = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })(); // { at, results: { id: {...} } }
  let running = null, open = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const redraw = () => window.Settings?.redraw?.();

  async function runOne(c, signal) {
    const r = { text: '', thought: false, searched: false, sources: 0, cited: 0, ms: 0, error: '', stages: [] };
    const t0 = performance.now();
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ messages: [{ role: 'user', text: c.q }], agent: c.agent, effort: c.effort, model: 'gemini' }) });
      if (!res.ok || !res.body) throw new Error(`Server antwortet nicht (HTTP ${res.status})`);
      for await (const { event, data } of readSse(res)) {
        if (event === 'text') r.text += data.text || '';
        else if (event === 'thought') r.thought = true;
        else if (event === 'status') { if (data.status === 'active') r.stages.push(data.stage); if (data.meta?.think) r.thinkPlanned = true; }
        else if (event === 'research') { if (Array.isArray(data.sources) && data.sources.length) { r.searched = true; r.sources = Math.max(r.sources, data.sources.length); } }
        else if (event === 'web' || event === 'deep') r.searched = true;
        else if (event === 'citations') r.cited = (data.cited || []).length;
        else if (event === 'error') r.error = data.message || 'Fehler';
      }
    } catch (err) { r.error = err.name === 'AbortError' ? 'Abgebrochen' : err.message; }
    r.ms = Math.round(performance.now() - t0);
    r.searched ||= r.stages.some((s) => s === 'browsing' || s === 'searching_sources');
    r.text = r.text.replace(/<!--[\s\S]*?-->/g, '').trim();
    r.words = words(r.text);
    r.checks = r.error ? c.checks.map(([label]) => [label, false]) : c.checks.map(([label, fn]) => [label, !!fn(r)]);
    delete r.stages;
    return r;
  }
  async function runAll() {
    if (running) { running.abort(); return; }
    running = new AbortController();
    state = { at: Date.now(), results: {} }; save(); redraw();
    for (const c of CASES) {
      if (running.signal.aborted) break;
      state.results[c.id] = { pending: true }; redraw();
      state.results[c.id] = await runOne(c, AbortSignal.any([running.signal, AbortSignal.timeout(280000)]));
      save(); redraw();
    }
    running = null; save(); redraw();
  }

  const md = (t) => {
    const clean = String(t || '').replace(/```(\w+)[\s\S]*?```/g, (_, k) => `\n\n*[Baustein: ${k}]*\n\n`);
    try { const h = window.marked ? marked.parse(clean) : esc(clean).replace(/\n/g, '<br>'); return window.DOMPurify ? DOMPurify.sanitize(h) : h; } catch { return esc(clean); }
  };
  function html() {
    const res = state.results || {};
    const done = CASES.filter((c) => res[c.id] && !res[c.id].pending);
    const pts = done.reduce((n, c) => n + res[c.id].checks.filter((x) => x[1]).length, 0), all = done.reduce((n, c) => n + c.checks.length, 0);
    const rows = CASES.map((c) => {
      const r = res[c.id];
      const score = r && !r.pending ? r.checks.filter((x) => x[1]).length : 0;
      const stateCls = !r ? '' : r.pending ? 'run' : r.error ? 'bad' : score === c.checks.length ? 'ok' : score >= c.checks.length - 1 ? 'mid' : 'bad';
      const isOpen = open === c.id && r && !r.pending;
      return `<div class="kt-item${isOpen ? ' open' : ''}"><div class="st-row kt-row" data-kt-open="${c.id}" role="button" tabindex="0">
          <span class="kt-dot ${stateCls}"></span><span class="kt-t"><b>${esc(c.title)}</b><span>${esc(c.q)}</span></span><span class="grow"></span>
          <span class="kt-score">${!r ? '' : r.pending ? '<span class="shimmer">läuft …</span>' : r.error ? 'Fehler' : `${score}/${c.checks.length}`}</span>
          ${r && !r.pending ? `<span class="kt-chev">${fi('chevron-right', 11)}</span>` : ''}</div>
        ${isOpen ? `<div class="kt-detail">
          <ul class="kt-checks">${r.checks.map(([l, ok]) => `<li class="${ok ? 'ok' : 'no'}">${fi(ok ? 'check' : 'x', 11)}${esc(l)}</li>`).join('')}</ul>
          <div class="kt-meta">${[`${(r.ms / 1000).toFixed(1).replace('.', ',')} s`, `${r.words} Wörter`, r.thought ? 'hat nachgedacht' : 'ohne Nachdenken', r.searched ? `gesucht${r.sources ? ` · ${r.sources} Quellen` : ''}` : 'ohne Suche', r.cited ? `${r.cited} Belege` : ''].filter(Boolean).join(' · ')}</div>
          <div class="kt-cols"><div class="kt-col"><div class="kt-h">Gemini (deine App)</div><div class="md kt-ans" data-kt-md="${c.id}|a">${r.error ? `<p class="kt-err">${esc(r.error)}</p>` : md(r.text)}</div></div>
            <div class="kt-col"><div class="kt-h">Musterantwort (Claude)</div><div class="md kt-ans" data-kt-md="${c.id}|r">${md(c.ref)}</div></div></div></div>` : ''}</div>`;
    }).join('');
    return `<h2>KI-Test</h2><div class="st-card kt">
      <div class="st-row kt-head"><div class="kt-intro"><b>Gemini gegen Musterantwort</b><span>${CASES.length} feste Testfragen gehen an die echte KI – genau wie im Chat. Jede Antwort wird automatisch geprüft (Inhalt, Länge, Suche, Nachdenken, Belege) und neben der Musterantwort von Claude gezeigt. Verbraucht etwas Kontingent.</span>
        ${all ? `<span class="kt-sum">${running ? 'Bisher' : 'Ergebnis'}: <b>${pts} von ${all}</b> Prüfpunkten${state.at ? ` · ${new Date(state.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>` : ''}</div>
        <button type="button" class="st-btn ${running ? '' : 'dark'}" data-kt-run>${running ? 'Abbrechen' : done.length ? 'Erneut testen' : 'Test starten'}</button></div>${rows}</div>`;
  }
  function click(e) {
    if (e.target.closest('[data-kt-run]')) { runAll(); return true; }
    const o = e.target.closest('[data-kt-open]');
    if (o) { const id = o.dataset.ktOpen; const r = state.results?.[id]; if (!r || r.pending) return true; open = open === id ? null : id; redraw(); return true; }
    return false;
  }
  // nach jedem Neuzeichnen der Einstellungen: Antworten mit dem echten Chat-Renderer zeigen (Formeln, Tabellen wie im Chat)
  new MutationObserver(() => {
    document.querySelectorAll('[data-kt-md]:not([data-kt-done])').forEach((n) => {
      n.dataset.ktDone = '1';
      const [id, which] = n.dataset.ktMd.split('|'), c = CASES.find((x) => x.id === id), r = state.results?.[id];
      const text = which === 'r' ? c?.ref : r && !r.error ? r.text : '';
      if (text && typeof renderMarkdown === 'function') { try { renderMarkdown(n, text.replace(/```(\w+)[\s\S]*?```/g, (_, k) => (/^(chart|timeline|mindmap|kopie|heft)$/.test(k) ? _ : `*[Baustein: ${k}]*`))); } catch {} }
    });
  }).observe(document.body, { childList: true, subtree: true });
  (window.SettingsHooks ||= []).push({ page: 'agents', order: 9, html, click });
  window.KiTest = { CASES, runOne };
})();
