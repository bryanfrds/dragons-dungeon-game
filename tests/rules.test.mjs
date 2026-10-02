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

test('a broken bought-count can never make an item free', () => {
  const { buyFromShop } = shop();
  for (const bad of ['abc', -1e308, NaN]) {
    const state = shopState(0);
    state.bought.atk = bad;
    assert.equal(buyFromShop(state, 'atk'), false, String(bad));
    assert.equal(state.hero.baseAtk, 8);
  }
});

test('gold that is not a number buys nothing', () => {
  const { buyFromShop } = shop();
  for (const bad of ['abc', NaN, undefined]) {
    const state = shopState(bad);
    assert.equal(buyFromShop(state, 'atk'), false, String(bad));
    assert.equal(state.hero.baseAtk, 8);
  }
});

const clean = () => vm.runInContext('({ cleanNumber, loadHeroNumbers, cleanGear })', ctx);

test('cleanNumber keeps sane numbers and replaces or clamps the rest', () => {
  const { cleanNumber } = clean();
  assert.equal(cleanNumber('12', 0, 100, 5), 12);
  assert.equal(cleanNumber(7.9, 0, 100, 5), 7);
  assert.equal(cleanNumber(7.9, 0, 100, 5, false), 7.9);
  for (const bad of ['abc', null, '', undefined, NaN, Infinity, [], {}]) assert.equal(cleanNumber(bad, 0, 100, 5), 5, String(bad));
  assert.equal(cleanNumber(-1e308, 0, 100, 5), 0);
  assert.equal(cleanNumber(1e300, 0, 100, 5), 100);
});

test('a hand-edited hero loads as sane numbers', () => {
  const { loadHeroNumbers } = clean();
  const hero = { level: 1, xp: 0, maxXp: 60, hp: 100, maxHp: 100, mp: 50, maxMp: 50,
                 baseAtk: 8, baseDef: 4, baseSpd: 3.5, lifesteal: 0, potions: 2 };
  loadHeroNumbers(hero, { level: '9', xp: 1e9, maxXp: 0, hp: 'abc', maxHp: '150', potions: -1e308,
                          baseSpd: 999, lifesteal: -5, baseAtk: {} });
  assert.deepEqual({ ...hero }, { level: 9, xp: 9, maxXp: 10, hp: 100, maxHp: 150, mp: 50, maxMp: 50,
                                  baseAtk: 8, baseDef: 4, baseSpd: 20, lifesteal: 0, potions: 0 });
});

test('saved gear is kept only if it is an object, with its numbers cleaned', () => {
  const { cleanGear } = clean();
  assert.equal(cleanGear('sword', 'weapon'), null);
  assert.equal(cleanGear([1], 'weapon'), null);
  const g = cleanGear({ name: 'X'.repeat(99), atk: '1e9', rarity: 'mythic', evil: 1 }, 'weapon');
  assert.deepEqual({ ...g }, { slot: 'weapon', name: 'X'.repeat(40), rarity: 'common', atk: 1e5 });
  assert.equal(cleanGear({ spd: 99 }, 'relic').spd, 5);
});
