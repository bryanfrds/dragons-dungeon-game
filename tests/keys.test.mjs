// The keyboard: one press is one action, and browser shortcuts are left alone.
// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// game.js in a sandbox whose window keeps the listeners, so tests can press keys.
function gameWithKeys() {
  const listeners = {};
  const ctx = { window: { addEventListener: (type, fn) => { listeners[type] = fn; } },
                location: { search: '' }, URLSearchParams, setTimeout: () => 0,
                document: { getElementById: () => ({}) },
                localStorage: { getItem: () => null, setItem() {} } };
  vm.createContext(ctx);
  vm.runInContext(src('dungeon.js') + '\n' + src('rules.js') + '\n' + src('tiles.js') + '\n' + src('game.js') +
                  '\nthis.Game = Game;', ctx);
  const game = Object.create(ctx.Game.prototype);
  game.keys = {};
  game.autoPlay = false;
  const did = [];
  for (const action of ['toggleAutoPlay', 'toggleSound', 'triggerWhirlwind', 'triggerShield',
                        'usePotion', 'manualAttack']) {
    game[action] = () => did.push(action);
  }
  game.initControls();
  const press = (code, mods = {}) => {
    let prevented = false;
    listeners.keydown({ code, preventDefault: () => { prevented = true; }, ...mods });
    return prevented;
  };
  const release = (code) => listeners.keyup({ code });
  return { game, did, press, release };
}

test('each shortcut does its one thing', () => {
  const { did, press } = gameWithKeys();
  for (const code of ['Tab', 'KeyM', 'Digit1', 'Digit2', 'Digit3', 'Space']) press(code);
  assert.deepEqual(did, ['toggleAutoPlay', 'toggleSound', 'triggerWhirlwind', 'triggerShield',
                         'usePotion', 'manualAttack']);
});

test('Tab and Space don\'t also move focus or scroll the page', () => {
  const { press } = gameWithKeys();
  assert.equal(press('Tab'), true);
  assert.equal(press('Space'), true);
});

test('browser shortcuts like ⌘1 and Ctrl+M are left to the browser', () => {
  const { did, press } = gameWithKeys();
  press('Digit1', { metaKey: true });
  press('KeyM', { ctrlKey: true });
  press('Digit3', { altKey: true });
  assert.deepEqual(did, []);
});

test('holding a key down uses it once, except attacking', () => {
  const { did, press } = gameWithKeys();
  press('Digit3');
  press('Digit3', { repeat: true });
  press('Digit3', { repeat: true });
  press('KeyM');
  press('KeyM', { repeat: true });
  press('Space');
  press('Space', { repeat: true });
  assert.deepEqual(did, ['usePotion', 'toggleSound', 'manualAttack', 'manualAttack']);
});

test('movement keys are tracked while held and released on key up', () => {
  const { game, press, release } = gameWithKeys();
  press('KeyW');
  press('KeyW', { repeat: true });
  assert.equal(game.keys.KeyW, true);
  release('KeyW');
  assert.equal(game.keys.KeyW, false);
});
