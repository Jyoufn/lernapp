// Baut für Vercel den Ordner public/: nur die Dateien, die der Browser braucht (PUBLIC_FILES) – Server-Code bleibt privat
const fs = require('fs');
const path = require('path');
const { PUBLIC_FILES } = require('./app-server.js');

const out = path.join(__dirname, 'public');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of PUBLIC_FILES) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
// Version an alle eigenen Skripte und das Stylesheet hängen: nach jedem Deploy lädt das iPad (auch als Web-App vom Home-Bildschirm) sicher die neuen Dateien
const ver = (process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(36)).slice(0, 10);
const idx = path.join(out, 'index.html');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8')
  .replace(/(<script src=")(?!https?:)([\w.-]+\.js)(")/g, `$1$2?v=${ver}$3`)
  .replace(/href="style\.css(\?v=[^"]*)?"/, `href="style.css?v=${ver}"`));
console.log(`public/: ${PUBLIC_FILES.size} Dateien`);
