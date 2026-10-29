const test = require('node:test');
const assert = require('node:assert');
const WEB = require('../lib/web');

test('Suchtreffer: DuckDuckGo, DuckDuckGo Lite und Bing werden gelesen (inkl. Weiterleitungen)', () => {
  const ddg = '<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.bpb.de%2Fthema&rut=x">Thema &amp; mehr</a><a class="result__snippet" href="#">Kurz <b>erklärt</b></a>';
  assert.deepStrictEqual(WEB.parseDdg(ddg), [{ url: 'https://www.bpb.de/thema', title: 'Thema & mehr', snippet: 'Kurz erklärt' }]);
  const lite = `<a rel="nofollow" href="https://www.spektrum.de/a" class='result-link'>Spektrum</a></td></tr><tr><td class='result-snippet'>Ein Text</td>`;
  assert.deepStrictEqual(WEB.parseDdgLite(lite), [{ url: 'https://www.spektrum.de/a', title: 'Spektrum', snippet: 'Ein Text' }]);
  const target = Buffer.from('https://www.destatis.de/zahlen').toString('base64').replace(/=+$/, '');
  const bing = `<ol><li class="b_algo" data-x="1"><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1${target}&amp;ntb=1">Destatis Zahlen</a></h2><div class="b_caption"><p class="b_lineclamp2">Amtliche Statistik</p></div></li></ol>`;
  assert.deepStrictEqual(WEB.parseBing(bing), [{ url: 'https://www.destatis.de/zahlen', title: 'Destatis Zahlen', snippet: 'Amtliche Statistik' }]);
});

test('Websuche: blockt DuckDuckGo (leere Prüfseite), springen Bing und die Google-Suche über Gemini ein', async () => {
  const saved = { ...WEB.hooks.engines }, savedG = WEB.hooks.geminiSearch;
  const calls = [];
  WEB.hooks.engines.ddg = async () => { calls.push('ddg'); return []; };
  WEB.hooks.engines.ddglite = async () => { calls.push('ddglite'); throw new Error('HTTP 403'); };
  WEB.hooks.engines.bing = async () => { calls.push('bing'); return [{ url: 'https://www.bpb.de/a', title: 'A', snippet: '' }]; };
  WEB.hooks.geminiSearch = async () => { calls.push('google'); return [{ url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/x', title: 'rki.de', snippet: '', host: 'rki.de' }]; };
  try {
    const r = await WEB.searchWeb('Thema', { env: { GEMINI_API_KEY: 'k' }, min: 3 });
    assert.deepStrictEqual(calls, ['ddg', 'ddglite', 'bing', 'google']);
    assert.deepStrictEqual(r.map((x) => [x.via, x.host || '']), [['bing', ''], ['google', 'rki.de']]);
    // genug Treffer gleich bei DuckDuckGo → keine weiteren Suchmaschinen
    calls.length = 0;
    WEB.hooks.engines.ddg = async () => { calls.push('ddg'); return [1, 2, 3, 4].map((i) => ({ url: `https://s${i}.de/`, title: `${i}`, snippet: '' })); };
    assert.strictEqual((await WEB.searchWeb('Thema', { env: { GEMINI_API_KEY: 'k' } })).length, 4);
    assert.deepStrictEqual(calls, ['ddg']);
    // alles kaputt → Fehler mit Grund statt stiller leerer Liste
    WEB.hooks.engines.ddg = WEB.hooks.engines.ddglite = WEB.hooks.engines.bing = async () => { throw new Error('offline'); };
    await assert.rejects(WEB.searchWeb('Thema', {}), /Keine Suchmaschine erreichbar/);
  } finally { Object.assign(WEB.hooks.engines, saved); WEB.hooks.geminiSearch = savedG; }
});
