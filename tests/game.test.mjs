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
const elements = {};
const ctx = { window: { addEventListener() {} }, location: { search: '' }, URLSearchParams,
              document: { createElement: () => ({ getContext: () => noop }),
                          getElementById: (id) => (elements[id] ||= {}) },
              localStorage: { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } } };
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('dungeon.js') + '\n' + src('rules.js') + '\n' + src('tiles.js') + '\n' + src('game.js') +
  '\nthis.Game = Game; this.TILE = TILE; this.MONSTER_TYPES = MONSTER_TYPES; this.LOOT_TABLE = LOOT_TABLE;', ctx);
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
    floor: 1, bestFloor: 1, gold: 0, logs: 0,
    sound: new Proxy({}, { get: () => () => {} }),
    overlay: { classList: { contains: () => true, add() {}, remove() {} } },
    aiActionText: {}, floorDisplay: {}, zoneName: {},
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
