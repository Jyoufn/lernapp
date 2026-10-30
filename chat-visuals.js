/* Strukturierte Chat-Visualisierungen: Daten prüfen, bevor sie als DOM gerendert werden. */
const ChatVisuals = (() => {
  // Zeitangaben in Beschriftungen: Jahre, Daten, Quartale, KW, Monate, Wochentage, Uhrzeiten
  const TIME = /^(?:\d{4}|\d{1,2}\.\d{1,2}\.(?:\d{2,4})?|(?:19|20)\d{2}[/-]\d{1,2}|Q[1-4](?:\s?\d{2,4})?|KW\s?\d{1,2}|(?:jan|feb|mär|mar|apr|mai|may|jun|jul|aug|sep|okt|oct|nov|dez|dec)[a-zä]*\.?(?:\s?\d{2,4})?|(?:mo|di|mi|do|fr|sa|so)[a-z]*\.?|\d{1,2}(?::\d{2})?\s?uhr|\d{1,2}:\d{2})$/i;
  // Welcher Diagrammtyp zeigt diese Zahlen am besten?
  // Festgelegt (kb/design.md): Verlauf über die Zeit → Linie mit Fläche, sonst immer Ring. Balken gibt es nicht.
  // Die Rangliste ist nur der Ausweg, wenn ein Ring nicht geht (negative Werte oder mehr als 8 Teile).
  const ringOk = ({ labels, values }) => labels.length <= 8 && values.every((x) => x >= 0) && values.some((x) => x > 0);
  function bestType(d) {
    const n = d.labels.length;
    const isTime = d.labels.filter((l) => TIME.test(l)).length >= Math.ceil(n * 0.8);
    if (isTime && n >= 3) return 'area';           // Verlauf über die Zeit
    return ringOk(d) ? 'donut' : 'hbar';           // Vergleich / Anteile
  }
  // Ein von der KI gewünschter Typ zählt nur noch für Linien – alles andere wählt die App
  function fitType(want, d) {
    if ((want === 'line' || want === 'area') && d.labels.length >= 3) return 'area';
    return bestType(d);
  }
  function chart(raw) {
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    if (!data || typeof data !== 'object') return null;
    const want = { pie: 'donut', column: 'bar' }[data.type] || data.type; // fehlt „type“ oder ist „auto“: die App wählt selbst
    if (want != null && !['bar', 'hbar', 'line', 'area', 'donut', 'auto'].includes(want)) return null;
    if (!Array.isArray(data.labels) || !Array.isArray(data.values) || data.labels.length !== data.values.length || data.labels.length < 2 || data.labels.length > 12) return null;
    const labels = data.labels.map((x) => String(x ?? '').trim().slice(0, 32));
    const values = data.values.map(Number);
    if (labels.some((x) => !x) || values.some((x) => !Number.isFinite(x))) return null;
    const unit = String(data.unit || '').slice(0, 18);
    return { type: fitType(want, { labels, values, unit }), title: String(data.title || 'Statistik').slice(0, 100), labels, values, unit, source: String(data.source || '').trim().slice(0, 160) };
  }
  // Gleiche Zahlenreihe nicht zweimal zeichnen (z. B. einmal als Balken, einmal als Linie)
  const chartKey = (d) => JSON.stringify([d.labels, d.values]);
  function illustration(raw) {
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    const prompt = String(data?.prompt || '').trim().slice(0, 600);
    const alt = String(data?.alt || '').trim().slice(0, 160);
    const query = String(data?.query || alt).trim().slice(0, 100);
    const source = data?.source === 'web' ? 'web' : ''; // "web" = passendes Bild aus dem Netz statt erzeugen
    const edit = String(data?.edit || '').trim().slice(0, 600); // "edit" = "prompt" eines früheren Bildes: dieses Bild anpassen statt neu erfinden
    return prompt.length >= 20 && alt ? { prompt, alt, query, ...(source ? { source } : {}), ...(edit ? { edit } : {}) } : null;
  }
  // Zeitstrahl: alle Ereignisse und alle Stichpunkte, die die KI liefert (Obergrenze nur gegen Ausreißer)
  function timeline(raw) {
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    const events = (Array.isArray(data?.events) ? data.events : []).map((e) => ({
      date: String(e?.date ?? '').trim().slice(0, 32), title: String(e?.title ?? '').trim().slice(0, 120), text: String(e?.text ?? '').trim().slice(0, 1500),
      points: (Array.isArray(e?.points) ? e.points : []).map((x) => String(x ?? '').trim().slice(0, 240)).filter(Boolean).slice(0, 20),
    })).filter((e) => e.date && e.title).slice(0, 60);
    return events.length >= 2 ? { title: String(data.title || '').slice(0, 120), events } : null;
  }
  /* Mindmap als Baum: Thema → Äste → Unteräste (bis 4 Ebenen). Jeder Knoten: "label" und "children" – nur Stichpunkte, kein Fließtext.
     Ältere Blöcke: "items" werden Kinder, "text" wird in Stichpunkte zerlegt. */
  function mindmap(raw) {
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    let count = 0;
    const node = (n, depth) => {
      if (count >= 120) return null;
      const label = String((typeof n === 'string' ? n : n?.label ?? n?.title) ?? '').trim().slice(0, 80);
      if (!label) return null;
      count++;
      // nur Stichpunkte: ein „text“ (ältere Blöcke) wird in einzelne Stichpunkt-Kästchen zerlegt
      const text = typeof n === 'object' ? String(n?.text ?? '').trim().slice(0, 400) : '';
      const fromText = text && depth < 4 ? text.split(/(?<=[.!?;])\s+/).map((x) => x.replace(/[.;]\s*$/, '').trim()).filter(Boolean) : [];
      const kids = depth >= 4 || typeof n !== 'object' ? [] : [...fromText, ...(Array.isArray(n?.children) ? n.children : []), ...(Array.isArray(n?.items) ? n.items : [])]
        .slice(0, 12).map((c) => node(c, depth + 1)).filter(Boolean);
      return { label, children: kids };
    };
    const center = String(data?.center ?? '').trim().slice(0, 80);
    const branches = (Array.isArray(data?.branches) ? data.branches : []).slice(0, 12).map((b) => node(b, 1)).filter(Boolean);
    return center && branches.length >= 2 ? { center, branches } : null;
  }
  /* Markdown-Tabellen reparieren, die beim Weiterschreiben (Längenlimit/Abbruch) zerbrochen sind:
     - Leerzeilen mitten in der Tabelle entfernen
     - wiederholte Kopfzeile + Trennzeile mitten in der Tabelle entfernen
     - Zeilen ohne führenden/abschließenden Strich ergänzen
     Code-Blöcke bleiben unangetastet. */
  function repairTables(md) {
    const lines = String(md ?? '').split('\n');
    const out = [];
    const isRow = (l) => /^\s*\|.*\|?\s*$/.test(l) && (l.match(/\|/g) || []).length >= 2;
    const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
    const norm = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim().toLowerCase()).join('|');
    let fence = false, header = null, inTable = false;
    for (let i = 0; i < lines.length; i++) {
      let l = lines[i];
      if (/^\s*(```|~~~)/.test(l)) { fence = !fence; inTable = false; out.push(l); continue; }
      if (fence) { out.push(l); continue; }
      // Tabellenbeginn: Kopfzeile + Trennzeile
      if (!inTable && isRow(l) && isSep(lines[i + 1] || '')) { header = norm(l); inTable = true; out.push(l); continue; }
      if (inTable) {
        if (!l.trim()) {
          // Leerzeile: gehört dazu, wenn danach gleich wieder eine Tabellenzeile kommt
          let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && isRow(lines[j])) { i = j - 1; continue; }
          inTable = false; out.push(l); continue;
        }
        // wiederholte Kopfzeile (+ Trennzeile) überspringen
        if (isRow(l) && norm(l) === header && isSep(lines[i + 1] || '')) { i++; continue; }
        if (isSep(l) && out.length && isSep(out[out.length - 1])) continue;
        if (isRow(l) || (l.includes('|') && !/^\s*[#>-]/.test(l))) {
          l = l.trimEnd();
          if (!/^\s*\|/.test(l)) l = `| ${l.trimStart()}`;
          if (!/\|$/.test(l)) l = `${l} |`;
          out.push(l); continue;
        }
        inTable = false;
      }
      out.push(l);
    }
    return out.join('\n');
  }
  /* Bild-Auftrag ohne ```illustration-Rahmen (manche Modelle lassen ihn weg) → Rahmen ergänzen, damit ein Bild entsteht statt JSON-Text.
     Nur außerhalb vorhandener Codeblöcke und nur, wenn das JSON ein gültiger Bild-Auftrag ist (prompt + alt). */
  function fenceBareIllustrations(text) {
    return String(text).split(/(```[\s\S]*?(?:```|$))/).map((part, i) => (i % 2 ? part
      : part.replace(/(^|\n)[ \t]*(\{[^{}]*\})[ \t]*(?=\n|$)/g, (m, pre, json) => (illustration(json) ? `${pre}\`\`\`illustration\n${json}\n\`\`\`` : m)))).join('');
  }
  /* Gedanken des Modells → Arbeitsschritte für die Zeitleiste (ohne zusätzlichen Modellaufruf).
     Gemini liefert Zusammenfassungen mit **Überschrift** je Abschnitt → jede Überschrift ist ein Schritt.
     Nemotron schreibt Absätze → der erste Satz eines Absatzes ist der Schritt, der Absatz sein Text. Höchstens 8 Schritte. */
  function thoughtSteps(raw) {
    const t = String(raw || '').replace(/\r/g, '');
    const heads = [...t.matchAll(/\*\*([^*\n]{2,90})\*\*/g)];
    let steps;
    if (heads.length || /^\s*\*\*/.test(t)) {
      steps = heads.map((h, i) => ({ title: h[1].trim().replace(/[:.]$/, ''), body: t.slice(h.index + h[0].length, heads[i + 1]?.index ?? t.length).replace(/\*\*/g, '').trim() }));
    } else {
      steps = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => {
        const first = /^(.{8,90}?[.!?:])(\s|$)/.exec(p);
        const title = first ? first[1].replace(/[:.]$/, '') : p.length > 90 ? `${p.slice(0, 88).replace(/\s+\S*$/, '')} …` : p;
        return { title, body: p };
      });
    }
    if (steps.length > 8) { const rest = steps.splice(7); steps.push({ title: rest[0].title, body: rest.map((s) => s.body).join('\n\n') }); }
    return steps;
  }
  return { chart, chartKey, bestType, illustration, timeline, mindmap, repairTables, fenceBareIllustrations, thoughtSteps };
})();
if (typeof module !== 'undefined') module.exports = ChatVisuals;
