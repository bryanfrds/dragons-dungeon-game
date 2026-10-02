// Game rule checks (rules.js). Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../rules.js', import.meta.url), 'utf8') +
  '\nthis.r = { relicScore, isUpgrade, applyXp, monsterHitDamage, stepSeconds }; this.spawnableTypes = spawnableTypes;', ctx);
const { isUpgrade, applyXp, monsterHitDamage, stepSeconds } = ctx.r;

const freshHero = () => ({ level: 1, xp: 0, maxXp: 60, maxHp: 100, maxMp: 50,
                           baseAtk: 8, baseDef: 4, potions: 2 });

test('one big XP gain applies every level it pays for', () => {
  const hero = freshHero();
  assert.equal(applyXp(hero, 60 + 84 + 10), 2);   // 60 for level 2, then 84 for level 3
  assert.equal(hero.level, 3);
  assert.equal(hero.xp, 10);
  assert.equal(hero.maxHp, 140);
  assert.equal(hero.potions, 4);
});

test('XP short of a level changes nothing but the bar, and potions cap at 5', () => {
  const hero = freshHero();
  assert.equal(applyXp(hero, 59), 0);
  assert.equal(hero.level, 1);
  hero.potions = 5;
  applyXp(hero, 1);
  assert.equal(hero.potions, 5);
});

test('gear is only an upgrade when it beats what is worn', () => {
  const eq = { weapon: { atk: 14 }, armor: { def: 12 }, relic: { maxHp: 50, lifesteal: 15 } };
  assert.equal(isUpgrade(eq, { slot: 'weapon', atk: 22 }), true);
  assert.equal(isUpgrade(eq, { slot: 'weapon', atk: 8 }), false);
  assert.equal(isUpgrade(eq, { slot: 'armor', def: 12 }), false);   // equal isn't better
  // The regression: a Silver Ring used to replace an Infinity Stone.
  assert.equal(isUpgrade(eq, { slot: 'relic', maxHp: 25 }), false);
  assert.equal(isUpgrade({ relic: { maxHp: 10 } }, { slot: 'relic', spd: 1.5 }), true);
  assert.equal(isUpgrade({}, { slot: 'relic', maxHp: 25 }), true);   // empty slot
});

test('hits always do at least 1, and Iron Wall cuts them', () => {
  assert.equal(monsterHitDamage(6, 100, false), 1);
  const open = monsterHitDamage(30, 10, false);
  const shielded = monsterHitDamage(30, 10, true);
  assert.equal(open, 25);
  assert.equal(shielded, 18);
});

test('faster heroes take less time per tile', () => {
  assert.ok(stepSeconds(5) < stepSeconds(3.5));
  assert.equal(stepSeconds(0), stepSeconds(0.5));   // never a zero or negative speed
});

test('new bug types unlock on their floors, and the boss never rolls as a normal bug', () => {
  const types = [{ type: 'slime', minFloor: 1 }, { type: 'ghost', minFloor: 3 }, { type: 'race', minFloor: 4 },
                 { type: 'loop', minFloor: 7 }, { type: 'boss' }];
  const names = (floor) => ctx.spawnableTypes(types, floor).map(t => t.type).join(',');
  assert.equal(names(1), 'slime');
  assert.equal(names(4), 'slime,ghost,race');
  assert.equal(names(9), 'slime,ghost,race,loop');
});

const shop = () => vm.runInContext('({ buyFromShop, nextShopBuy, shopPrice, SHOP_ITEMS })', ctx);
const shopState = (gold, hero = {}) => ({ gold, bought: {},
  hero: { potions: 0, baseAtk: 8, baseDef: 4, maxHp: 100, hp: 100, ...hero } });

test('buying takes the gold, applies the upgrade, and the next one costs more', () => {
  const { buyFromShop, shopPrice, SHOP_ITEMS } = shop();
  const state = shopState(1000);
  assert.equal(buyFromShop(state, 'atk'), true);
  assert.equal(state.hero.baseAtk, 11);
  assert.equal(state.gold, 940);
  const whetstone = SHOP_ITEMS.find(i => i.id === 'atk');
  assert.ok(shopPrice(whetstone, 1) > shopPrice(whetstone, 0));
  assert.equal(buyFromShop(state, 'hp'), true);
  assert.deepEqual([state.hero.maxHp, state.hero.hp], [120, 120]);
});

test("the shop refuses what you can't afford, unknown items, and a sixth potion", () => {
  const { buyFromShop } = shop();
  const poor = shopState(10);
  assert.equal(buyFromShop(poor, 'potion'), false);
  assert.equal(buyFromShop(shopState(1000), 'sword'), false);
  const full = shopState(1000, { potions: 5 });
  assert.equal(buyFromShop(full, 'potion'), false);
  assert.equal(full.gold, 1000);
});

test('the AI buys potions up to 3 first, then the cheapest upgrade it can afford', () => {
  const { buyFromShop, nextShopBuy } = shop();
  const state = shopState(200, { potions: 1 });
  const bought = [];
  for (let id; (id = nextShopBuy(state)); ) { assert.ok(buyFromShop(state, id)); bought.push(id); }
  assert.deepEqual(bought, ['potion', 'potion', 'atk', 'def']);
  assert.equal(state.gold, 20);
});
