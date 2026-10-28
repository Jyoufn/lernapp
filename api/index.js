// Vercel-Funktion: alle /api-Anfragen landen hier (siehe vercel.json) und gehen an denselben Handler wie am PC
const { handler } = require('../app-server.js');

module.exports = (req, res) => handler(req, res);
