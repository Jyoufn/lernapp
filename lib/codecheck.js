/* ===================================================================
   Coding-Agent: Projektdateien aus Antworten lesen und automatisch prüfen (wie „Tests laufen lassen“)
   - Syntax: jede JS-Datei und jedes Inline-Script mit `node --check` (in einem Temp-Ordner, danach gelöscht)
   - Verweise: <script src>, <link href>, <img src> … müssen als Datei im Projekt existieren
   - IDs: getElementById('x') / querySelector('#x') im JS → das Element muss im HTML stehen (oder im JS erzeugt werden)
   - JSON muss gültig sein; abgebrochene Datei-Blöcke gelten als unvollständig
   =================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const OPEN = /^(`{3,})(?:file:\s*(\S[^`]*?)|(terminal|check|read|plan|run))\s*$/;

// Blöcke einer Antwort: [{ type: 'file'|'terminal'|'check', path, content, done }]
function blocks(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OPEN);
    if (!m) continue;
    const close = new RegExp(`^\`{${m[1].length},}\\s*$`);
    const body = [];
    let done = false;
    for (i++; i < lines.length; i++) {
      if (close.test(lines[i])) { done = true; break; }
      body.push(lines[i]);
    }
    out.push(m[3] ? { type: m[3], content: body.join('\n'), done } : { type: 'file', path: cleanPath(m[2]), content: body.join('\n'), done });
  }
  return out;
}
function cleanPath(p) {
  return String(p || '').replace(/["'`]/g, '').replace(/\\/g, '/').split('/')
    .filter((s) => s && s !== '.' && s !== '..' && !/:/.test(s)).join('/').slice(0, 200) || 'datei.txt';
}
// Stand des Projekts nach allen Antworten (spätere Dateien überschreiben frühere)
function projectFrom(texts) {
  const files = new Map();
  texts.forEach((t) => blocks(t).forEach((b) => { if (b.type === 'file' && b.done) files.set(b.path, b.content); }));
  return files;
}
// Datei-/Prüf-Blöcke aus dem Verlauf entfernen (der aktuelle Stand steht vollständig im Prompt)
function stripBlocks(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OPEN);
    if (!m) { out.push(lines[i]); continue; }
    const close = new RegExp(`^\`{${m[1].length},}\\s*$`);
    for (i++; i < lines.length && !close.test(lines[i]); i++);
    out.push(m[2] ? `[Datei ${cleanPath(m[2])} geschrieben]` : m[3] === 'terminal' ? '[Terminal-Befehl]' : '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const isRemote = (u) => /^(?:[a-z]+:|\/\/|#|data:|mailto:|javascript:)/i.test(u) || u.includes('${');
function resolveRef(fromFile, ref) {
  const clean = ref.split(/[?#]/)[0];
  if (!clean) return null;
  const base = clean.startsWith('/') ? [] : fromFile.split('/').slice(0, -1);
  clean.split('/').forEach((seg) => { if (seg === '..') base.pop(); else if (seg && seg !== '.') base.push(seg); });
  return base.join('/');
}

function syntaxCheck(code, name, module, dir) {
  const file = path.join(dir, `${Math.random().toString(36).slice(2)}.${module ? 'mjs' : 'js'}`);
  fs.writeFileSync(file, code);
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 8000 });
  if (r.status === 0) return null;
  const err = String(r.stderr || '');
  const line = (err.match(/:(\d+)\r?\n/) || [])[1];
  const msg = (err.split('\n').find((l) => /Error/.test(l)) || 'Syntaxfehler').trim();
  return { file: name, line: line ? Number(line) : null, message: msg };
}

function check(files) {
  const problems = [];
  const add = (p) => { if (problems.length < 12) problems.push(p); };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codecheck-'));
  try {
    const jsAll = [];
    const htmlIds = new Set();
    for (const [name, content] of files) {
      const ext = path.extname(name).toLowerCase();
      if (['.js', '.mjs', '.cjs'].includes(ext)) {
        jsAll.push(content);
        const isModule = ext === '.mjs' || /^\s*(import|export)\b/m.test(content);
        const e = syntaxCheck(content, name, isModule, dir);
        if (e) add(e);
      } else if (ext === '.json') {
        try { JSON.parse(content); } catch (err) { add({ file: name, line: null, message: `Ungültiges JSON: ${err.message}` }); }
      } else if (ext === '.html' || ext === '.htm') {
        for (const m of content.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)) htmlIds.add(m[1]);
        // Inline-Scripts prüfen
        for (const m of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
          const attrs = m[1] || '';
          if (/\bsrc\s*=/.test(attrs) || !m[2].trim()) continue;
          if (/type\s*=\s*["'](?!module|text\/javascript)/i.test(attrs)) continue; // z. B. JSON, Vorlagen
          jsAll.push(m[2]);
          const before = content.slice(0, m.index).split('\n').length - 1;
          const e = syntaxCheck(m[2], name, /type\s*=\s*["']module/i.test(attrs), dir);
          if (e) add({ ...e, line: e.line ? e.line + before : null, message: `Inline-Script: ${e.message}` });
        }
        // Verweise auf Projektdateien
        for (const m of content.matchAll(/<(script|link|img|source|audio|video|iframe)\b[^>]*?\s(src|href)\s*=\s*["']([^"']+)["']/gi)) {
          const ref = m[3].trim();
          if (isRemote(ref)) continue;
          if (m[1].toLowerCase() === 'link' && !/\.(css|ico|png|svg|webmanifest|json)(\?|#|$)/i.test(ref)) continue;
          const target = resolveRef(name, ref);
          if (target && !files.has(target)) add({ file: name, line: null, message: `Verweist auf „${ref}“, diese Datei gibt es im Projekt nicht` });
        }
      }
    }
    // IDs, die das JS sucht, müssen im HTML stehen (oder im JS selbst entstehen)
    const js = jsAll.join('\n');
    const created = new Set([...js.matchAll(/\.id\s*=\s*["'`]([\w-]+)["'`]|\sid\s*=\s*\\?["']([\w-]+)\\?["']/g)].map((m) => m[1] || m[2]));
    const wanted = new Set([...js.matchAll(/getElementById\(\s*["'`]([\w-]+)["'`]\s*\)|querySelector(?:All)?\(\s*["'`]#([\w-]+)["'`]\s*\)/g)].map((m) => m[1] || m[2]));
    if ([...files.keys()].some((f) => /\.html?$/i.test(f))) {
      wanted.forEach((id) => { if (!htmlIds.has(id) && !created.has(id)) add({ file: 'HTML', line: null, message: `Das JavaScript sucht das Element #${id}, im HTML gibt es aber kein id="${id}"` }); });
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  return problems;
}

module.exports = { blocks, projectFrom, stripBlocks, check, cleanPath };
