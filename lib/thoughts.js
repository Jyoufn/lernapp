/* ===================================================================
   Gedanken (Thinking) für die Anzeige aufbereiten – nur Gemini.
   Gemini liefert Zusammenfassungen seiner Gedanken, meist englisch und je Abschnitt mit **Überschrift**.
   Angezeigt wird nur, was wirklich gedacht wurde und inhaltlich etwas sagt:
   - Abschnitte über Form/Aufbau/Ton der Antwort („Refining the format“, „Structuring the response“) fallen weg
   - der Rest wird kurz und sinngetreu ins Deutsche übertragen (ein kleiner Modellaufruf je Abschnitt)
   - klappt die Übertragung nicht, wird der Abschnitt nicht gezeigt (lieber nichts als Englisch)
   Reihenfolge bleibt erhalten; flush() wartet, bis alles gemeldet ist (vor dem ersten Antworttext).
   =================================================================== */
const P = require('./providers');

// Überschriften, die nur das Formulieren/Gliedern der Antwort beschreiben – kein Inhalt
const META_HEAD = /\b(format\w*|structur\w*|refin\w*|polish\w*|finali[sz]\w*|draft\w*|wording|phras\w*|tone|style|layout|markdown|present\w*|output|respon\w*|reply|answer\w*|compos\w*|craft\w*|organi[sz]\w*|outlin\w*|approach|clarif\w* the request|understand\w* the (request|user|query|task)|interpret\w* the (request|query)|review\w*|check\w* (the )?(response|answer|work)|ensur\w*|formul\w*|gliederung|formulier\w*|antwort|aufbau der antwort|struktur\w*)\b/i;
const GERMAN = /\b(und|der|die|das|ist|nicht|ich|wird|werden|mit|für|eine?n?|zu|auf|den|dem|des|sich|auch|wie|aus)\b/gi;
const isGerman = (t) => (String(t).match(GERMAN) || []).length >= Math.max(2, String(t).split(/\s+/).length * 0.08);

const SYSTEM = `Du bekommst einen Abschnitt aus den Gedanken einer KI (meist Englisch). Antworte NUR mit JSON: {"keep": true|false, "title": "…", "body": "…"}
keep = false, wenn der Abschnitt nur beschreibt, wie die Antwort formuliert, gegliedert, formatiert oder geprüft wird (Ton, Aufbau, Überschriften, Markdown, Länge) – ohne inhaltliche Überlegung.
keep = true, wenn er inhaltlich etwas durchdenkt (Fakten, Rechnung, Ursachen, Abwägung, was der Nutzer genau braucht, Quellen).
title: deutsche Überschrift, 2–5 Wörter, als Tätigkeit zum INHALT (z. B. „Ursachen der Inflation ordnen“, „Flächeninhalt berechnen“) – nie „Antwort strukturieren“.
body: sinngetreu auf Deutsch, knapp (höchstens 3 Sätze), nichts erfinden, nichts weglassen, was inhaltlich wichtig ist. Kein Markdown.`;

function createThoughtFilter({ env, onThought, signal, maxSections = 8 }) {
  let buf = '', chain = Promise.resolve(), shown = 0, closed = false;
  const emit = (title, body) => { if (closed || shown >= maxSections || !title) return; shown++; onThought(`**${title}**\n\n${body || ''}\n\n`); };
  const handle = (section) => {
    const m = /^\s*\*\*([^*\n]{2,90})\*\*\s*([\s\S]*)$/.exec(section);
    const head = (m ? m[1] : section.split(/[.!?\n]/)[0]).trim().replace(/[:.]$/, '');
    const body = (m ? m[2] : section).replace(/\*\*/g, '').trim();
    if (!head || META_HEAD.test(head)) return; // reine Formulierungs-/Gliederungsgedanken: nicht zeigen
    if (isGerman(`${head} ${body}`)) { chain = chain.then(() => emit(head, body)); return; }
    const job = P.smallJsonTask(env, { system: SYSTEM, user: `ÜBERSCHRIFT: ${head}\nTEXT: ${body.slice(0, 1500)}`, maxTokens: 400, timeoutMs: 8000, signal, prefer: 'gemini' })
      .then((r) => (r && r.keep !== false && String(r.title || '').trim() ? { title: String(r.title).trim().slice(0, 60), body: String(r.body || '').trim().slice(0, 600) } : null))
      .catch(() => null);
    chain = chain.then(async () => { const r = await job; if (r && !META_HEAD.test(r.title)) emit(r.title, r.body); });
  };
  // fertige Abschnitte abtrennen: ein Abschnitt endet, wenn die nächste **Überschrift** beginnt
  const cut = () => {
    const heads = [...buf.matchAll(/(^|\n)\s*\*\*[^*\n]{2,90}\*\*/g)];
    if (heads.length < 2) return;
    const last = heads[heads.length - 1].index;
    const done = buf.slice(0, last);
    buf = buf.slice(last);
    done.split(/(?=(?:^|\n)\s*\*\*[^*\n]{2,90}\*\*)/).map((s) => s.trim()).filter(Boolean).forEach(handle);
  };
  return {
    push(text) { if (closed) return; buf += text; cut(); },
    // Rest melden und warten, bis alle Abschnitte gezeigt sind (danach kommen keine Gedanken mehr)
    async flush() { if (buf.trim()) { const rest = buf; buf = ''; rest.split(/(?=(?:^|\n)\s*\*\*[^*\n]{2,90}\*\*)/).map((s) => s.trim()).filter(Boolean).forEach(handle); } await chain; closed = true; },
  };
}

/* Antwortanfang: Absätze, die nur das eigene Vorgehen beschreiben („**Analyzing the approach**“, „Ich strukturiere die Antwort …“),
   gehören nicht in die Antwort. Geprüft wird nur der Anfang; danach läuft alles unverändert durch. */
const META_PARA = /^\s*(\*\*(analy[sz]\w*|refin\w*|structur\w*|draft\w*|formulat\w*|craft\w*|consider\w*|plan\w*|review\w*|finali[sz]\w*|determin\w*|understand\w*|evaluat\w*|compos\w*|organi[sz]\w*|outlin\w*)\b[^*\n]*\*\*[\s\S]*|(ich (analysiere|strukturiere|plane|formuliere|gliedere) (die|deine|jetzt|nun|zuerst)|alright|let me|i('| a)m (going|now)|i will (now )?(analy|struct|draft|write))[\s\S]*)$/i;
function createAnswerGuard(onText, limit = 700) {
  let head = '', open = true, parts = []; // parts: gehaltene Stücke – werden einzeln weitergegeben (Reihenfolge/Stückelung bleibt)
  const release = () => {
    open = false;
    const drop = parts.join('').length - head.length; // vorne verworfene Vorgehens-Absätze
    let skip = Math.max(0, drop);
    for (const p of parts) { if (skip >= p.length) { skip -= p.length; continue; } onText(p.slice(skip)); skip = 0; }
    parts = []; head = '';
  };
  return {
    push(text) {
      if (!open) { onText(text); return; }
      head += text; parts.push(text);
      // beginnt die Antwort offensichtlich normal (kein **…**, kein „Ich …“/„Let me …“), sofort durchlassen – flüssiges Streamen
      const st = head.trimStart();
      if (st.length >= 6 && !/^(\*\*|ich\s|let\s|alright|i\s|i'|okay)/i.test(st)) { release(); return; }
      // ganze Absätze am Anfang prüfen
      for (;;) {
        const i = head.indexOf('\n\n');
        if (i < 0) break;
        const para = head.slice(0, i);
        if (para.trim() && META_PARA.test(para) && !/^\s*```/.test(para)) { head = head.slice(i + 2); continue; }
        if (!para.trim()) { head = head.slice(i + 2); continue; }
        release(); return;
      }
      if (head.length > limit) release();
    },
    end() { if (open) { if (head.trim() && !META_PARA.test(head)) release(); head = ''; parts = []; open = false; } },
  };
}

module.exports = { createThoughtFilter, createAnswerGuard, META_HEAD, META_PARA };
