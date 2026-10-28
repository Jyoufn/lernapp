// Baut für Vercel den Ordner public/: nur die Dateien, die der Browser braucht (PUBLIC_FILES) – Server-Code bleibt privat
const fs = require('fs');
const path = require('path');
const { PUBLIC_FILES } = require('./app-server.js');

const out = path.join(__dirname, 'public');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of PUBLIC_FILES) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
console.log(`public/: ${PUBLIC_FILES.size} Dateien`);
