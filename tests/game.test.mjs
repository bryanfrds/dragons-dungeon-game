// Behaviour checks for game.js: movement, chasing, autoplay pace, death.
// Run with: node --test tests/*.test.mjs
// game.js is page code, so it runs in a sandbox against a hand-built game
// object: an open 12x12 room, no screen, and drawing/logging switched off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// A canvas that accepts any drawing call and does nothing, for the floor layer.
const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });
// A stand-in DOM element: enough for the game to fill in text, add buttons and
// toggle classes, with the classes kept so tests can check them.
function fakeElement() {
  const classes = new Set();
  return {
    children: [], textContent: '', innerHTML: '', disabled: false,
    getContext: () => noop,
    addEventListener(type, fn) { this.onclick = fn; },
    appendChild(child) { this.children.push(child); },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
  };
}
const elements = {};
const ctx = { window: { addEventListener() {} }, location: { search: '' }, URLSearchParams,
              setTimeout: () => 0,                 // the auto-descend timer is not run in tests
              document: { createElement: fakeElement,
                          getElementById: (id) => (elements[id] ||= fakeElement()) },
              localStorage: { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } } };
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('dungeon.js') + '\n' + src('rules.js') + '\n' + src('tiles.js') + '\n' + src('game.js') +
  '\nthis.Game = Game; this.TILE = TILE; this.MONSTER_TYPES = MONSTER_TYPES; this.LOOT_TABLE = LOOT_TABLE;' +
  '\nthis.SHOP_ITEMS = SHOP_ITEMS;', ctx);
const { Game, TILE, MONSTER_TYPES } = ctx;
const { DungeonGenerator } = ctx.window;

function makeGame(W = 12, H = 12) {
  const game = Object.create(Game.prototype);
  const gen = new DungeonGenerator(W, H);
  gen.grid = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) =>
    x === 0 || y === 0 || x === W - 1 || y === H - 1 ? TILE.WALL : TILE.FLOOR));
  Object.assign(game, {
    dungeonGen: gen,
    // Shaped like DungeonGenerator.generate()'s result: no rows/cols, which is
    // what hid the black-map bug (render looped on fields that didn't exist).
    dungeon: { grid: gen.grid, stairsPos: { x: W - 2, y: H - 2 }, chests: [] },
    hero: {
      x: 32, y: 32, targetX: 32, targetY: 32, gx: 1, gy: 1, facing: 1,
      level: 1, xp: 0, maxXp: 60, hp: 100, maxHp: 100, mp: 50, maxMp: 50,
      baseAtk: 8, baseDef: 4, baseSpd: 3.5, lifesteal: 0, potions: 2,
      isAttacking: false, attackCooldown: 0, moveCooldown: 0, shieldActiveTimer: 0,
      skills: { whirlwind: { cd: 0, maxCd: 6 }, shield: { cd: 0, maxCd: 10 }, potion: { cd: 0, maxCd: 3 } },
      equipment: { weapon: { atk: 4 }, armor: { def: 2 }, relic: { maxHp: 10 } },
    },
    monsters: [], particles: [], floatingTexts: [], keys: {}, autoPlay: true, aiCooldown: 0,
    floor: 1, bestFloor: 1, gold: 0, logs: 0, shopBought: {}, shake: 0, fade: 0,
    sound: new Proxy({}, { get: () => () => {} }),
    overlay: (() => { const o = fakeElement(); o.classList.add('hidden'); return o; })(),
    aiActionText: {}, floorDisplay: {}, zoneName: {},
    overlayTitle: fakeElement(), overlayMsg: fakeElement(), overlayBtn: fakeElement(),
  });
  for (const m of ['updateBars', 'updateStatsUI', 'updateMonstersCount', 'addLootDrop', 'triggerNextFloorModal'])
    game[m] = () => {};
  game.log = () => { game.logs++; };
  return game;
}
function addBug(game, type, gx, gy) {
  const t = MONSTER_TYPES.find(m => m.type === type);
  const bug = { id: `${type}${gx}${gy}`, type, name: t.name, color: t.color, gx, gy, x: gx * 32, y: gy * 32,
                hp: 50, maxHp: 50, atk: 5, xp: 0, gold: 0, facing: -1, attackCooldown: 99,
                spd: t.spd, moveCooldown: 0, animTimer: 0 };
  game.monsters.push(bug);
  return bug;
}
const run = (game, seconds) => { for (let i = 0; i < seconds * 60; i++) game.update(1 / 60); };

test("the hero can't walk onto a bug", () => {
  const game = makeGame();
  addBug(game, 'slime', 2, 1);
  game.moveHeroTo(2, 1);
  assert.deepEqual([game.hero.gx, game.hero.gy], [1, 1]);
});

test('a nearby bug chases the hero, stops beside them, and never steps onto them', () => {
  const game = makeGame();
  game.autoPlay = false;
  const ghost = addBug(game, 'ghost', 5, 1);
  for (let i = 0; i < 120; i++) {
    game.update(1 / 60);
    assert.ok(!(ghost.gx === game.hero.gx && ghost.gy === game.hero.gy));
  }
  assert.equal(Math.hypot(ghost.gx - game.hero.gx, ghost.gy - game.hero.gy), 1);
});

test('a bug further than 5 tiles away stays put', () => {
  const game = makeGame();
  game.autoPlay = false;
  const slime = addBug(game, 'slime', 10, 10);
  run(game, 2);
  assert.deepEqual([slime.gx, slime.gy], [10, 10]);
});

// The regression: autoplay stepped on every second AI decision, so the speed
// stat (and Boots of Hermes) made no difference.
function tilesWalkedByAI(extraSpeed) {
  const game = makeGame();
  game.hero.equipment.relic = { spd: extraSpeed };
  const target = addBug(game, 'boss', 10, 10);
  target.moveCooldown = 1e9;                   // keep the target still
  let steps = 0, last = `${game.hero.gx},${game.hero.gy}`;
  for (let i = 0; i < 120; i++) {              // 2 seconds
    game.update(1 / 60);
    const now = `${game.hero.gx},${game.hero.gy}`;
    if (now !== last) { steps++; last = now; }
  }
  return steps;
}

test('autoplay walks at the speed stat, and Boots of Hermes make it faster', () => {
  const base = tilesWalkedByAI(0);             // speed 3.5
  const hermes = tilesWalkedByAI(1.5);         // speed 5
  assert.ok(base >= 6 && base <= 7, `base speed walked ${base} tiles in 2s`);
  assert.ok(hermes >= 9 && hermes <= 10, `Hermes walked ${hermes} tiles in 2s`);
});

test('holding a key walks at the speed stat, not a tile per frame', () => {
  const game = makeGame();
  game.autoPlay = false;
  game.keys.KeyD = true;
  run(game, 1);
  assert.ok(game.hero.gx - 1 >= 3 && game.hero.gx - 1 <= 4, `walked ${game.hero.gx - 1} tiles`);
});

test('while dead nothing happens: no hits, no potion, no skills', () => {
  const game = makeGame();
  addBug(game, 'skeleton', 2, 1).attackCooldown = 0;
  game.hero.hp = 0;
  game.usePotion();
  game.triggerWhirlwind();
  game.triggerShield();
  game.manualAttack();
  run(game, 2);
  assert.equal(game.hero.hp, 0);
  assert.equal(game.hero.potions, 2);
  assert.equal(game.logs, 0);
  assert.equal(game.monsters[0].hp, 50, 'no attack landed');
  assert.equal(game.hero.attackCooldown, 0, 'no attack was even swung');
  assert.equal(game.hero.shieldActiveTimer, 0, 'no Iron Wall');
  assert.equal(game.hero.mp, 50, 'no MP spent');
});

test('while dead the AI stops walking', () => {
  const game = makeGame();
  addBug(game, 'ghost', 9, 9);                  // it would walk towards this one
  game.hero.hp = 0;
  run(game, 2);
  assert.deepEqual([game.hero.gx, game.hero.gy], [1, 1]);
});

test("the AI fights instead of freezing when Whirlwind is ready but MP is short", () => {
  const game = makeGame();
  addBug(game, 'slime', 2, 1);
  addBug(game, 'slime', 1, 2);
  game.hero.mp = 5;
  game.updateAI(0.2);
  assert.ok(game.hero.attackCooldown > 0, 'it should have attacked');
  assert.equal(game.hero.skills.whirlwind.cd, 0);
});

test("max HP includes the ring's bonus", () => {
  const game = makeGame();
  assert.equal(game.maxHp, 110);
  game.hero.equipment.relic = { lifesteal: 12 };
  assert.equal(game.maxHp, 100);
});

test('lifesteal shows the HP it really restored, and nothing at full HP', () => {
  // It used to show the raw heal, so a hit at full HP still floated "+N".
  const game = makeGame();
  game.hero.equipment.relic = { lifesteal: 50 };   // max HP 100, half of each hit back
  const bug = addBug(game, 'slime', 3, 1);
  const heals = () => game.floatingTexts.map(t => t.text).filter(t => t.startsWith('+'));
  game.hero.hp = 97;
  game.damageMonster(bug, 40);
  assert.equal(game.hero.hp, 100);
  assert.deepEqual(heals(), ['+3']);
  game.damageMonster(bug, 40);                     // already full
  assert.deepEqual(heals(), ['+3']);
});

test("two bugs chasing down one corridor never share a tile", () => {
  const game = makeGame(12, 3);                 // a 10-tile corridor
  game.autoPlay = false;
  const a = addBug(game, 'ghost', 4, 1);
  const b = addBug(game, 'ghost', 5, 1);
  for (let i = 0; i < 180; i++) {
    game.update(1 / 60);
    assert.ok(!(a.gx === b.gx && a.gy === b.gy), `stacked at ${a.gx},${a.gy}`);
  }
  assert.deepEqual([a.gx, b.gx], [2, 3]);       // queued up behind each other
});

test('a floor spawns at most one bug per tile, never on a chest or the stairs', () => {
  for (let floor = 1; floor <= 60; floor++) {
    const game = makeGame();
    game.dungeonGen = new DungeonGenerator(25, 16);
    game.startFloor(floor);
    const tiles = game.monsters.map(m => `${m.gx},${m.gy}`);
    assert.equal(new Set(tiles).size, tiles.length, `floor ${floor}: two bugs on one tile`);
    for (const m of game.monsters) {
      if (m.type === 'boss') continue;            // the boss stands on the stairs on purpose
      assert.equal(game.dungeon.grid[m.gy][m.gx], TILE.FLOOR, `floor ${floor}: bug on ${game.dungeon.grid[m.gy][m.gx]}`);
    }
  }
});

test('swapping to a better ring with less HP lowers HP to the new cap', () => {
  const game = makeGame();
  game.hero.equipment.relic = { slot: 'relic', name: 'Wooden Ring', maxHp: 10, rarity: 'common' };
  game.hero.hp = 110;
  // Pick the Vampiric Fang (lifesteal, no HP) out of the loot table.
  // The sandbox has its own Math, so its random is swapped from inside.
  const realRandom = vm.runInContext('Math.random', ctx);
  const fang = ctx.LOOT_TABLE.findIndex(i => i.name === 'Vampiric Fang');
  ctx.pick = () => (fang + 0.5) / ctx.LOOT_TABLE.length;
  vm.runInContext('Math.random = pick', ctx);
  try { game.rollLootDrop(false); } finally { ctx.pick = realRandom; vm.runInContext('Math.random = pick', ctx); }
  assert.equal(game.hero.equipment.relic.name, 'Vampiric Fang');
  assert.equal(game.maxHp, 100);
  assert.equal(game.hero.hp, 100);
});

test('walking keeps time exactly, without losing the part of a frame that overshoots', () => {
  // At speed 4.5 a step is 0.222s, which isn't a whole number of 60fps frames,
  // so dropping each overshoot would lose a tile every 5 seconds or so.
  const game = makeGame(52, 3);
  game.autoPlay = false;
  game.hero.equipment.relic = { spd: 1 };
  game.keys.KeyD = true;
  run(game, 10);
  const walked = game.hero.gx - 1;
  assert.ok(walked >= 45 && walked <= 46, `walked ${walked} tiles in 10s at speed 4.5`);
});

test('the swing pose shows during a swing and then drops', () => {
  const game = makeGame();
  game.autoPlay = false;
  addBug(game, 'slime', 2, 1);
  game.manualAttack();
  assert.equal(game.hero.isAttacking, true);
  run(game, 0.3);
  assert.equal(game.hero.isAttacking, false);
});

test('a new floor builds a tile layer the size of the map', () => {
  const game = makeGame();
  game.dungeonGen = new DungeonGenerator(25, 16);
  game.startFloor(1);
  assert.equal(game.floorLayer.width, game.dungeon.grid[0].length * 32);
  assert.equal(game.floorLayer.height, game.dungeon.grid.length * 32);
});

test('loading a save shows its level on the hero badge', () => {
  const game = makeGame();
  ctx.localStorage.setItem('pixelDungeonSave', JSON.stringify({ floor: 4, gold: 9, hero: { level: 8 } }));
  elements.heroLevelBadge = { textContent: 'LVL 1' };
  assert.ok(game.loadGame());
  assert.equal(elements.heroLevelBadge.textContent, 'LVL 8');
});

test('an Infinite Loop heals itself while left alone', () => {
  const game = makeGame();
  game.autoPlay = false;
  game.spawnMonster('loop', 9, 9);              // too far away to chase
  const loop = game.monsters[0];
  loop.hp = loop.maxHp / 2;
  run(game, 2);
  assert.ok(loop.hp > loop.maxHp / 2 + 1, `hp ${loop.hp} of ${loop.maxHp}`);
  assert.ok(loop.hp <= loop.maxHp);
});

test('a Race Condition strikes twice as often as other bugs', () => {
  const hitsIn2s = (type) => {
    const game = makeGame();
    game.autoPlay = false;
    game.hero.hp = game.hero.maxHp = 10000;
    game.spawnMonster(type, 2, 1);
    game.monsters[0].attackCooldown = 0;
    run(game, 2);
    return game.logs;                            // one log line per hit on the hero
  };
  assert.equal(hitsIn2s('slime'), 2);
  assert.equal(hitsIn2s('race'), 4);
});

test('the best floor is kept when you die and start over, and saved', () => {
  const game = makeGame();
  game.dungeonGen = new DungeonGenerator(25, 16);
  game.startFloor(6);
  game.restartGame();                           // back to floor 1
  assert.equal(game.floor, 1);
  assert.equal(game.bestFloor, 6);
  assert.equal(elements.bestDisplay.textContent, 6);
  game.saveGame();
  assert.equal(JSON.parse(ctx.localStorage.getItem('pixelDungeonSave')).bestFloor, 6);
});

test('buying in the shop takes the gold and applies the upgrade', () => {
  const game = makeGame();
  game.gold = 200;
  assert.equal(game.buy('def'), true);
  assert.equal(game.gold, 140);
  assert.equal(game.totalDefense, 4 + 2 + 2);      // base + armor + plating
  assert.equal(game.buy('nonsense'), false);
});

test('on autoplay the floor-cleared box spends gold, and opens only once', () => {
  const game = makeGame();
  delete game.triggerNextFloorModal;               // use the real one
  let opened = 0;
  const real = Game.prototype.triggerNextFloorModal;
  game.triggerNextFloorModal = function () { opened++; return real.call(this); };
  game.gold = 300;
  game.hero.potions = 0;
  game.hero.gx = game.dungeon.stairsPos.x; game.hero.gy = game.dungeon.stairsPos.y;
  for (let i = 0; i < 30; i++) game.updateAI(0.2);  // standing on the stairs a while
  assert.equal(opened, 1);
  assert.equal(game.hero.potions, 3);
  assert.ok(game.gold < 300 - 90);
});

test('the shop row is hidden on game over', () => {
  const game = makeGame();
  game.autoPlay = false;
  elements.shopRow = fakeElement();
  game.renderShop();
  assert.equal(elements.shopRow.classList.contains('hidden'), false);
  game.hero.hp = 1;
  game.spawnMonster('skeleton', 2, 1);
  game.monsters[0].attackCooldown = 0;
  game.update(1 / 60);
  assert.equal(game.hero.hp, 0);
  assert.equal(elements.shopRow.classList.contains('hidden'), true);
});

test('shop purchases and the best floor survive a save and load', () => {
  const game = makeGame();
  game.dungeonGen = new DungeonGenerator(25, 16);
  game.startFloor(7);
  game.gold = 500;
  game.buy('atk'); game.buy('atk'); game.buy('hp');
  game.saveGame();
  const again = makeGame();
  assert.ok(again.loadGame());
  assert.deepEqual({ ...again.shopBought }, { atk: 2, hp: 1 });
  assert.equal(again.bestFloor, 7);
});

test('a tampered save cannot make the shop free or freeze autoplay', () => {
  const game = makeGame();
  // Written as raw text: JSON.stringify would turn 1e400 into null before the game saw it.
  ctx.localStorage.setItem('pixelDungeonSave', '{"floor":2,"gold":"abc","bestFloor":1e400,' +
    '"shopBought":{"atk":-1e308,"def":"abc","hp":5e9,"potion":[],"bogus":3},"hero":{"level":2}}');
  assert.ok(game.loadGame());
  assert.deepEqual({ ...game.shopBought }, { hp: 1000 });
  assert.equal(game.bestFloor, 2);                 // Infinity rejected, the floor itself kept
  assert.equal(game.gold, 0);                      // "abc" gold becomes 0
  assert.equal(game.buy('def'), false);            // so nothing is free
  game.gold = 1e6;
  game.autoPlay = true;
  Game.prototype.triggerNextFloorModal.call(game); // must return, not loop
  assert.ok(game.gold < 1e6);
});

test('floor 1 only ever spawns slimes, never the new bugs or the boss', () => {
  for (let i = 0; i < 40; i++) {
    const game = makeGame();
    game.dungeonGen = new DungeonGenerator(25, 16);
    game.startFloor(1);
    assert.ok(game.monsters.every(m => m.type === 'slime'), game.monsters.map(m => m.type).join());
  }
});

test('a save on floor 1e400 is refused rather than loaded as Infinity', () => {
  const game = makeGame();
  ctx.localStorage.setItem('pixelDungeonSave', '{"floor":1e400,"gold":5,"hero":{"level":3}}');
  assert.equal(game.loadGame(), null);
});

test('drinking a potion with the shop open frees the potion button', () => {
  const game = makeGame();
  game.gold = 500;
  game.hero.potions = 5;
  game.hero.hp = 10;
  game.overlay.classList.remove('hidden');        // the floor-cleared box is up
  elements.shopRow = fakeElement();
  game.renderShop();
  assert.equal(elements.shopRow.children[0].disabled, true);   // bag full
  game.usePotion();
  assert.equal(elements.shopRow.children.at(-4).disabled, false);
});

test('no save can freeze autoplay shopping: at most 50 buys a floor', () => {
  const game = makeGame();
  ctx.localStorage.setItem('pixelDungeonSave',
    '{"floor":3,"gold":1e300,"hero":{"level":4,"potions":-1e308,"maxHp":"100","hp":"abc"}}');
  assert.ok(game.loadGame());
  assert.equal(game.gold, 1e9);                    // capped
  assert.equal(game.hero.potions, 0);
  assert.equal(game.hero.maxHp, 100);              // "100" became a number, so +20 adds
  game.autoPlay = true;
  const t = Date.now();
  Game.prototype.triggerNextFloorModal.call(game);
  assert.ok(Date.now() - t < 500, 'shopping returned quickly');
  const buys = Object.values(game.shopBought).reduce((a, b) => a + b, 0);
  assert.ok(buys <= 50, `${buys} buys`);
  assert.equal(game.hero.potions, 3);
});

test('loading uses the cleaned gear and caps HP and MP at their max', () => {
  const game = makeGame();
  ctx.localStorage.setItem('pixelDungeonSave', '{"floor":2,"gold":5,"hero":{"level":3,' +
    '"hp":1e6,"maxHp":100,"mp":1e6,"maxMp":50,' +
    '"equipment":{"weapon":{"name":"Bad","atk":"abc"},"relic":{"name":"Odd","maxHp":"50","spd":99}}}}');
  assert.ok(game.loadGame());
  assert.equal(typeof game.totalAttack, 'number');
  assert.equal(game.totalAttack, 8);              // "abc" attack counts as 0, not text glued on
  assert.equal(game.maxHp, 150);                  // "50" HP from the ring is a number
  assert.equal(game.hero.equipment.relic.spd, 5);
  assert.equal(game.hero.hp, game.maxHp);
  assert.equal(game.hero.mp, 50);
});

test('a normal save loads back exactly as it was saved', () => {
  const game = makeGame();
  game.hero.level = 9; game.hero.mp = 37.25; game.hero.baseSpd = 3.5;
  game.hero.equipment = {
    weapon: { slot: 'weapon', name: 'Excalibur.js', atk: 35, rarity: 'legendary', icon: '✨' },
    armor: { slot: 'armor', name: 'Voidplate Cuirass', def: 20, rarity: 'epic', icon: '🦺' },
    relic: { slot: 'relic', name: 'Infinity Stone', maxHp: 50, lifesteal: 15, rarity: 'legendary', icon: '💎' },
  };
  game.dungeonGen = new DungeonGenerator(25, 16);
  game.startFloor(4);
  game.saveGame();
  const again = makeGame();
  assert.ok(again.loadGame());
  for (const k of ['level', 'xp', 'maxXp', 'hp', 'maxHp', 'mp', 'maxMp', 'baseAtk', 'baseDef', 'baseSpd', 'potions'])
    assert.equal(again.hero[k], game.hero[k], k);
  for (const slot of ['weapon', 'armor', 'relic'])
    assert.deepEqual({ ...again.hero.equipment[slot] }, { ...game.hero.equipment[slot] }, slot);
  // And a ring's speed, which is fractional.
  game.hero.equipment.relic = { slot: 'relic', name: 'Boots of Hermes', spd: 1.5, rarity: 'epic', icon: '👟' };
  game.saveGame();
  const third = makeGame();
  assert.ok(third.loadGame());
  assert.deepEqual({ ...third.hero.equipment.relic }, { ...game.hero.equipment.relic });
});

test('in manual play, walking onto a chest opens it', () => {
  // Only the AI used to open chests, so a player who pressed Tab never could.
  const game = makeGame();
  game.autoPlay = false;
  game.rollLootDrop = () => { game.drops = (game.drops || 0) + 1; };
  game.dungeon.grid[1][3] = TILE.CHEST;
  const chest = { x: 3, y: 1, opened: false };
  game.dungeon.chests.push(chest);
  game.keys.KeyD = true;
  run(game, 1);
  assert.equal(chest.opened, true);
  assert.equal(game.gold, 20);
  assert.equal(game.drops, 1);
  assert.equal(game.hero.xp, 30);
  game.keys.KeyD = false;
  run(game, 1);                    // standing on an opened chest gives nothing more
  assert.equal(game.gold, 20);
  assert.equal(game.drops, 1);
});

test('reloading on the game-over screen respawns, rather than carrying on', () => {
  // The save kept the floor you died on, so a reload skipped RESPAWN: same
  // floor, full HP, potions kept.
  const game = makeGame();
  game.dungeonGen = new DungeonGenerator(25, 16);
  game.startFloor(6);
  game.hero.potions = 5;
  game.hero.hp = 0;                 // died here
  game.saveGame();
  const again = makeGame();
  again.dungeonGen = new DungeonGenerator(25, 16);
  const saved = again.loadGame();
  again.startFloor(saved.floor);
  assert.equal(again.floor, 1);
  assert.equal(again.bestFloor, 6);
  assert.equal(again.hero.potions, 2);
  assert.equal(again.hero.hp, again.maxHp);
  assert.equal(again.hero.mp, again.hero.maxMp);
});
