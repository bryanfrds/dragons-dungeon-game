// The sound switch: remembered between visits, survives blocked storage, and
// the button and M key both flip it.
// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

function memoryStorage(store = {}) {
  return { store, getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
}
const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

// audio.js in a sandbox with the given localStorage (or one that throws on access).
function loadAudio(storage) {
  const win = {};
  if (storage === 'throws') Object.defineProperty(win, 'localStorage', { get() { throw new Error('denied'); } });
  else win.localStorage = storage;
  const ctx = { window: win };
  vm.createContext(ctx);
  vm.runInContext(src('audio.js') + '\nthis.SoundFX = SoundFX;', ctx);
  return ctx;
}

test('sound starts on for a first visit', () => {
  assert.equal(loadAudio(memoryStorage()).window.soundEngine.enabled, true);
});

test('muting is remembered for the next visit', () => {
  const store = {};
  loadAudio(memoryStorage(store)).window.soundEngine.toggle();
  assert.equal(loadAudio(memoryStorage(store)).window.soundEngine.enabled, false);
});

test('unmuting is remembered too', () => {
  const store = { dungeonMuted: '1' };
  const engine = loadAudio(memoryStorage(store)).window.soundEngine;
  assert.equal(engine.enabled, false);
  engine.toggle();
  assert.equal(loadAudio(memoryStorage(store)).window.soundEngine.enabled, true);
});

test('blocked storage still lets you mute, it just isn\'t remembered', () => {
  const engine = new (loadAudio(memoryStorage()).SoundFX)(blocked);
  assert.equal(engine.enabled, true);
  assert.equal(engine.toggle(), false);
});

test('storage that throws on access does not break the page', () => {
  assert.equal(loadAudio('throws').window.soundEngine.enabled, true);
});

test('a muted game makes no sound at all', () => {
  const engine = new (loadAudio(memoryStorage()).SoundFX)(memoryStorage({ dungeonMuted: '1' }));
  engine.init = () => { throw new Error('should not start audio'); };
  for (const play of ['playSwing', 'playHit', 'playCoin', 'playKill', 'playLevelUp', 'playPotion',
                      'playWhirlwind', 'playShield']) {
    assert.doesNotThrow(() => engine[play](), play);
  }
});

// The game side: the button and the M key, with game.js in a sandbox.
function gameWithSound(storage) {
  const attrs = {};
  const button = { textContent: '', setAttribute: (k, v) => { attrs[k] = v; } };
  const ctx = { window: { addEventListener() {} }, location: { search: '' }, URLSearchParams,
                localStorage: memoryStorage(), setTimeout: () => 0,
                document: { getElementById: () => ({}) } };
  vm.createContext(ctx);
  vm.runInContext(src('audio.js') + '\n' + src('dungeon.js') + '\n' + src('rules.js') + '\n' + src('tiles.js') +
                  '\n' + src('game.js') + '\nthis.Game = Game; this.SoundFX = SoundFX;', ctx);
  const game = Object.create(ctx.Game.prototype);
  game.sound = new ctx.SoundFX(storage);
  game.soundBtn = button;
  return { game, button, attrs };
}

test('the button shows the remembered state when the game opens', () => {
  const { game, button, attrs } = gameWithSound(memoryStorage({ dungeonMuted: '1' }));
  game.showSoundState();
  assert.equal(button.textContent, '🔇');
  assert.equal(attrs['aria-pressed'], 'false');
});

test('toggling flips the sound, the icon and what screen readers hear', () => {
  const { game, button, attrs } = gameWithSound(memoryStorage());
  game.toggleSound();
  assert.equal(game.sound.enabled, false);
  assert.equal(button.textContent, '🔇');
  assert.equal(attrs['aria-pressed'], 'false');
  game.toggleSound();
  assert.equal(button.textContent, '🔊');
  assert.equal(attrs['aria-pressed'], 'true');
});

