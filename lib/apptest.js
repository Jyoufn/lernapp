/* ===================================================================
   Coding-Agent: App wirklich starten und ausprobieren (wie ein Mensch, der sie testet)
   - die Projektdateien kommen in einen Temp-Ordner und werden über einen kleinen Server auf einem freien Port ausgeliefert
     (echte http-Herkunft → localStorage, Module, fetch funktionieren wie im Browser)
   - ein unsichtbarer Chrome/Edge lädt index.html; ein eingeschleustes Testskript klickt alle sichtbaren Knöpfe, drückt typische
     Tasten (Pfeile, Leertaste, Enter, WASD), wartet und meldet: Laufzeitfehler, fehlgeschlagene Dateien, ob auf dem Canvas etwas zu sehen ist
   - Ergebnis: { ok, errors: [{ message, file, line }], clicked, canvas, browser }
   =================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const TYPES = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };

function findBrowser(env = {}) {
  const list = [env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  return list.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

// Testskript: läuft ganz vorne in jeder HTML-Seite; meldet alles über console mit „CA-“-Präfix (Chrome schreibt es nach stderr)
const HARNESS = `<script>(function(){
var rep=function(k,m,f,l){try{console.log('CA-'+k+' '+JSON.stringify({m:String(m).slice(0,300),f:String(f||'').split('/').pop(),l:l||null}))}catch(e){}};
addEventListener('error',function(e){if(e.target&&e.target!==window&&(e.target.src||e.target.href)){rep('LOAD','Datei konnte nicht geladen werden: '+(e.target.src||e.target.href));return}rep('ERR',e.message||'Fehler',e.filename,e.lineno)},true);
addEventListener('unhandledrejection',function(e){rep('ERR','Promise: '+((e.reason&&e.reason.message)||e.reason))});
var ce=console.error;console.error=function(){rep('CONSOLE',[].slice.call(arguments).join(' '));return ce.apply(console,arguments)};
var wait=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
var key=function(t,k,c){var o={key:k,code:c||k,bubbles:true,cancelable:true};(document.activeElement||document.body).dispatchEvent(new KeyboardEvent(t,o));document.dispatchEvent(new KeyboardEvent(t,o));window.dispatchEvent(new KeyboardEvent(t,o))};
var press=async function(k,c){key('keydown',k,c);await wait(120);key('keyup',k,c);await wait(60)};
var visible=function(b){var r=b.getBoundingClientRect();var s=getComputedStyle(b);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!b.disabled};
var drawn=function(){var c=document.querySelector('canvas');if(!c)return null;try{var x=c.getContext('2d');if(!x)return 'webgl';var d=x.getImageData(0,0,Math.min(c.width,400),Math.min(c.height,400)).data;var f=d[0]+','+d[1]+','+d[2]+','+d[3];for(var i=0;i<d.length;i+=64){if(d[i]+','+d[i+1]+','+d[i+2]+','+d[i+3]!==f)return true}return false}catch(e){return 'unbekannt'}};
addEventListener('load',async function(){
  await wait(600);
  var clicked=[];
  var btns=[].slice.call(document.querySelectorAll('button,[role=button],input[type=button],input[type=submit],a[href="#"]')).filter(visible).slice(0,10);
  for(var i=0;i<btns.length;i++){var b=btns[i];if(!b.isConnected||!visible(b))continue;clicked.push((b.textContent||b.value||b.id||'Knopf').trim().slice(0,30));try{b.click()}catch(e){rep('ERR',e.message)}await wait(350)}
  var c=document.querySelector('canvas');if(c){try{c.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:20,clientY:20}))}catch(e){}}
  var keys=[['Enter','Enter'],[' ','Space'],['ArrowRight'],['ArrowUp'],['ArrowLeft'],['ArrowDown'],['w','KeyW'],['a','KeyA'],['s','KeyS'],['d','KeyD'],[' ','Space']];
  for(var j=0;j<keys.length;j++){await press(keys[j][0],keys[j][1])}
  await wait(1200);
  console.log('CA-DONE '+JSON.stringify({clicked:clicked,canvas:drawn(),title:document.title,bodyText:(document.body&&document.body.innerText||'').trim().slice(0,120)}));
});
})();</script>`;

function inject(html) {
  const m = html.match(/<head[^>]*>/i) || html.match(/<html[^>]*>/i);
  return m ? html.replace(m[0], `${m[0]}${HARNESS}`) : HARNESS + html;
}

async function run(files, { env = {}, entry, timeoutMs = 45000 } = {}) {
  const browser = findBrowser(env);
  if (!browser) return { ok: false, skipped: true, errors: [{ message: 'Kein Chrome/Edge gefunden – Lauftest nicht möglich' }], clicked: [], canvas: null };
  const start = entry || (files.has('index.html') ? 'index.html' : [...files.keys()].find((p) => /\.html?$/i.test(p)));
  if (!start) return { ok: false, skipped: true, errors: [{ message: 'Keine HTML-Datei – nichts zu starten' }], clicked: [], canvas: null };

  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || start;
    if (!files.has(p) && files.has(`${p.replace(/\/$/, '')}/index.html`)) p = `${p.replace(/\/$/, '')}/index.html`;
    if (!files.has(p)) { res.writeHead(404); return res.end('Nicht gefunden'); }
    const ext = path.extname(p).toLowerCase();
    const body = /\.html?$/.test(ext) ? inject(files.get(p)) : files.get(p);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'apptest-'));
  const errors = [];
  let done = null;
  try {
    const stderr = await new Promise((resolve) => {
      let out = '';
      const p = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
        `--user-data-dir=${profile}`, '--enable-logging=stderr', '--v=0', '--window-size=1280,800', '--virtual-time-budget=9000', '--dump-dom',
        `http://127.0.0.1:${port}/${start}`], { windowsHide: true });
      const kill = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
      p.stderr.on('data', (d) => { out += d; });
      p.stdout.on('data', () => {});
      p.on('close', () => { clearTimeout(kill); resolve(out); });
      p.on('error', () => { clearTimeout(kill); resolve(out); });
    });
    for (const line of stderr.split(/\r?\n/)) {
      const c = line.match(/CONSOLE[^\]]*\]\s+"(.*)",\s+source:\s+(\S*)\s+\((\d+)\)/);
      if (!c) continue;
      const msg = c[1];
      const tag = msg.match(/^CA-(ERR|LOAD|CONSOLE|DONE) (.*)$/);
      if (tag) {
        let o = {};
        try { o = JSON.parse(tag[2]); } catch {}
        if (tag[1] === 'DONE') done = o;
        else errors.push({ message: o.m || tag[2], file: o.f || '', line: o.l || null, kind: tag[1] });
      } else if (/^Uncaught|Failed to load resource|SyntaxError|TypeError|ReferenceError/.test(msg)) {
        errors.push({ message: msg, file: c[2].split('/').pop(), line: Number(c[3]) || null, kind: 'ERR' });
      }
    }
  } finally {
    server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  // doppelte Meldungen zusammenfassen
  const seen = new Set();
  const uniq = errors.filter((e) => { const k = `${e.message}|${e.file}|${e.line}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
  if (!done) uniq.push({ message: 'Die Seite wurde nicht fertig geladen (Endlosschleife, Absturz oder blockierendes Skript?)', kind: 'ERR' });
  return { ok: uniq.length === 0, errors: uniq, clicked: done?.clicked || [], canvas: done ? done.canvas : null, title: done?.title || '', text: done?.bodyText || '', browser: path.basename(browser) };
}

module.exports = { run, findBrowser, inject };
