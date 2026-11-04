// Qualitäts-Vergleich mit ECHTER KI (nicht Teil von `npm test`, braucht Netz + Schlüssel):
//   GEMINI_API_KEY=… node tests/eval/run.js [id …]
// Lässt den echten Ablauf (runChat) die Fragen aus fragen.json beantworten und speichert je Frage Antwort, Quellen,
// Gedanken, Zeitleiste und Dauer nach tests/eval/out/<datum>/ (JSON + bericht.md zum Lesen und Vergleichen).
const fs = require('fs');
const path = require('path');
const W = require('../../lib/workflow');

const QUESTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fragen.json'), 'utf8'));
const only = process.argv.slice(2);
const env = { ...process.env };
if (!env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY fehlt'); process.exit(1); }

async function ask(q) {
  const ev = { text: '', thoughts: [], timeline: [], sources: [], citations: null, errors: [] };
  const t0 = Date.now();
  let firstText = 0;
  const send = (type, data = {}) => {
    if (type === 'text') { if (!firstText) firstText = Date.now() - t0; ev.text += data.text || ''; }
    else if (type === 'reset') ev.text = '';
    else if (type === 'thought') ev.thoughts.push(data.text);
    else if (type === 'status') {
      if (data.status === 'active' || data.stage === 'completed') ev.timeline.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${data.description || data.stage}`);
      if (data.meta?.provider) ev.model = data.meta.provider;
    } else if (['research', 'web', 'deep'].includes(type)) {
      for (const s of [...(data.sources || []), ...(data.pages || [])]) if (s?.url && !ev.sources.some((x) => x.url === s.url)) ev.sources.push({ title: s.title, url: s.url, state: s.state });
    } else if (type === 'citations') ev.cited = data.cited;
    else if (type === 'done') ev.effort = data.effort;
    else if (type === 'error') ev.errors.push(data.message || String(data));
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('Zeitlimit 280 s')), 280000);
  try {
    await W.runChat({ env, body: { messages: [{ role: 'user', text: q.text }], agent: q.agent || 'general', effort: q.effort || 'auto' }, send, signal: ctl.signal });
  } catch (err) { ev.errors.push(err.message); } finally { clearTimeout(timer); }
  return { ...q, ms: Date.now() - t0, firstTextMs: firstText, ...ev };
}

(async () => {
  const dir = path.join(__dirname, 'out', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  let md = `# Eval ${new Date().toLocaleString('de-DE')}\n`;
  for (const q of QUESTIONS.filter((x) => !only.length || only.includes(x.id))) {
    process.stdout.write(`${q.id} … `);
    const r = await ask(q);
    fs.writeFileSync(path.join(dir, `${q.id}.json`), JSON.stringify(r, null, 2));
    const src = r.sources;
    console.log(`${(r.ms / 1000).toFixed(1)} s, ${r.text.length} Zeichen, ${src.length} Quellen${r.errors.length ? `, FEHLER: ${r.errors[0]}` : ''}`);
    md += `\n---\n## ${q.id} · ${q.agent || 'general'} · ${q.effort || 'auto'}\n**Frage:** ${q.text}\n\n**Prüfpunkte:** ${(q.expect || []).join(' · ')}\n\n`
      + `Dauer ${(r.ms / 1000).toFixed(1)} s (erster Text ${(r.firstTextMs / 1000).toFixed(1)} s) · Modell ${JSON.stringify(r.model || '?')} · Aufwand ${r.effort?.applied || '?'} · Gedanken ${r.thoughts.length}\n\n`
      + `**Zeitleiste:** ${r.timeline.join(' → ') || '–'}\n\n**Quellen:** ${src.map((s) => s.url).join(' , ') || '–'}\n\n${r.errors.length ? `**Fehler:** ${r.errors.join('; ')}\n\n` : ''}### Antwort\n${r.text}\n`;
  }
  fs.writeFileSync(path.join(dir, 'bericht.md'), md);
  console.log(`\nBericht: ${path.join(dir, 'bericht.md')}`);
})();
