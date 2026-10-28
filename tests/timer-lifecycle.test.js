const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'timer.js'), 'utf8');

function harness(saved = null) {
  let now = 0;
  let interval = null;
  const timeouts = [];
  const events = [];
  const store = new Map(saved ? [['focusTimer', JSON.stringify(saved)]] : []);
  const classes = new Set();
  const classList = {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    contains: (name) => classes.has(name),
    toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
  };
  const parts = new Map();
  const part = (name) => {
    if (!parts.has(name)) parts.set(name, { dataset: {}, hidden: false, textContent: '' });
    return parts.get(name);
  };
  const box = {
    hidden: true,
    isConnected: false,
    classList,
    querySelector: part,
    addEventListener() {},
  };
  const audio = { chimes: 0 };
  class AudioContext {
    constructor() { audio.chimes++; this.currentTime = 0; this.destination = {}; }
    createOscillator() { return { frequency: {}, connect: (gain) => gain, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    close() {}
  }
  const context = {
    Date: { now: () => now },
    window: { AudioContext },
    document: {
      getElementById: () => ({ append: () => { box.isConnected = true; } }),
      addEventListener() {},
      dispatchEvent: (event) => events.push(event),
    },
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
    el: () => box,
    icon: (name) => name,
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setInterval: (callback) => { interval = callback; return 1; },
    clearInterval: () => { interval = null; },
    setTimeout: (callback, delay) => { timeouts.push({ callback, delay }); },
  };
  vm.runInNewContext(source, context);
  return {
    timer: context.window.FocusTimer,
    box,
    audio,
    events,
    store,
    advance: (ms) => { now += ms; interval?.(); },
    settle: (delay) => timeouts.filter((timeout) => timeout.delay === delay).forEach(({ callback }) => callback()),
  };
}

test('abgelaufener Timer verschwindet, während ein weiterer weiterläuft', () => {
  const app = harness();
  app.timer.start(1 / 60, 'Kurz');
  app.timer.start(2 / 60, 'Lang');
  assert.equal(app.timer.count, 2);
  app.advance(1000);
  assert.equal(app.timer.count, 1);
  assert.equal(app.box.hidden, false);
  assert.equal(app.audio.chimes, 1);
  assert.equal(app.events.filter((event) => event.type === 'focus:done').length, 1);
  app.advance(1000);
  assert.equal(app.timer.count, 0);
  app.settle(240);
  assert.equal(app.box.hidden, true);
  assert.equal(app.store.has('focusTimer'), false);
});

test('bereits abgelaufene Timer erscheinen nach einem Neustart nicht erneut', () => {
  const app = harness([{ id: 1, label: 'Alt', total: 1000, end: -1000, paused: false, done: false }]);
  assert.equal(app.timer.count, 0);
  assert.equal(app.box.hidden, true);
  assert.equal(app.store.has('focusTimer'), false);
});
