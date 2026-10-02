// Behaviour checks for game.js: movement, chasing, autoplay pace, death.
// Run with: node --test tests/*.test.mjs
// game.js is page code, so it runs in a sandbox against a hand-built game
// object: an open 12x12 room, no screen, and drawing/logging switched off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: { addEventListener() {} }, location: { search: '' }, URLSearchParams };
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('dungeon.js') + '\n' + src('rules.js') + '\n' + src('game.js') +
  '\nthis.Game = Game; this.TILE = TILE; this.MONSTER_TYPES = MONSTER_TYPES;', ctx);
const { Game, TILE, MONSTER_TYPES } = ctx;
const { DungeonGenerator } = ctx.window;

const SIZE = 12;
function makeGame() {
  const game = Object.create(Game.prototype);
  const gen = new DungeonGenerator(SIZE, SIZE);
  gen.grid = Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) =>
    x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 ? TILE.WALL : TILE.FLOOR));
  Object.assign(game, {
    dungeonGen: gen,
    dungeon: { grid: gen.grid, rows: SIZE, cols: SIZE, stairsPos: { x: 10, y: 10 }, chests: [] },
    hero: {
      x: 32, y: 32, targetX: 32, targetY: 32, gx: 1, gy: 1, facing: 1,
      level: 1, xp: 0, maxXp: 60, hp: 100, maxHp: 100, mp: 50, maxMp: 50,
      baseAtk: 8, baseDef: 4, baseSpd: 3.5, lifesteal: 0, potions: 2,
      isAttacking: false, attackCooldown: 0, moveCooldown: 0, shieldActiveTimer: 0,
      skills: { whirlwind: { cd: 0, maxCd: 6 }, shield: { cd: 0, maxCd: 10 }, potion: { cd: 0, maxCd: 3 } },
      equipment: { weapon: { atk: 4 }, armor: { def: 2 }, relic: { maxHp: 10 } },
    },
    monsters: [], particles: [], floatingTexts: [], keys: {}, autoPlay: true, aiCooldown: 0,
    floor: 1, gold: 0, logs: 0,
    sound: new Proxy({}, { get: () => () => {} }),
    overlay: { classList: { contains: () => true, add() {}, remove() {} } },
    aiActionText: {},
  });
  for (const m of ['updateBars', 'updateStatsUI', 'updateMonstersCount', 'rollLootDrop', 'triggerNextFloorModal'])
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
  game.manualAttack();
  run(game, 2);
  assert.equal(game.hero.hp, 0);
  assert.equal(game.hero.potions, 2);
  assert.equal(game.logs, 0);
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
