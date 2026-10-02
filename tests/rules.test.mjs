// Game rule checks (rules.js). Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../rules.js', import.meta.url), 'utf8') +
  '\nthis.r = { relicScore, isUpgrade, applyXp, monsterHitDamage, stepSeconds };', ctx);
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
