// Belege im Text: [1], [1][3], [1, 3] und [1; 3] werden alle erkannt
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/research');

const src = (n) => ({ n, text: `Quelle ${n} enthält einen ausreichend langen Satz über das Thema, damit eine Textstelle gefunden wird.` });

test('Belege in allen gängigen Schreibweisen werden gezählt', () => {
  const c = R.collectCitations('Erster Satz [1, 3]. Zweiter Satz [2][4]. Dritter Satz [5; 6]. Falsch [9].', [1, 2, 3, 4, 5, 6].map(src));
  assert.deepEqual(c.cited, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(c.invalid, [9]);
  assert.ok(!c.passages.find((p) => p.n === 1).claim.includes('['));
});
