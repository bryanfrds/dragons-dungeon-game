// Game rules that don't touch the screen, kept apart from game.js so they can
// be tested on their own (see tests/). Plain functions on plain objects.

/** How good a ring is, so a new one is only worn if it beats the current one. */
function relicScore(relic) {
  if (!relic) return -1;
  return (relic.maxHp || 0) + (relic.lifesteal || 0) * 4 + (relic.spd || 0) * 20;
}

/** Whether `drop` is better than what's equipped in its slot. */
function isUpgrade(equipment, drop) {
  const current = equipment[drop.slot];
  if (!current) return true;
  if (drop.slot === 'weapon') return (drop.atk || 0) > (current.atk || 0);
  if (drop.slot === 'armor') return (drop.def || 0) > (current.def || 0);
  if (drop.slot === 'relic') return relicScore(drop) > relicScore(current);
  return false;
}

/**
 * Add XP and apply every level-up it pays for, not just the first. A boss's XP
 * could cover two levels, and the second used to sit in the bar until the next
 * kill. Returns how many levels were gained.
 */
function applyXp(hero, amount) {
  hero.xp += amount;
  let levels = 0;
  while (hero.xp >= hero.maxXp) {
    hero.xp -= hero.maxXp;
    hero.level++;
    hero.maxXp = Math.floor(hero.maxXp * 1.4);
    hero.maxHp += 20;
    hero.maxMp += 10;
    hero.baseAtk += 3;
    hero.baseDef += 2;
    hero.potions = Math.min(5, hero.potions + 1);
    levels++;
  }
  return levels;
}

/** Damage a bug's hit does to the hero. Iron Wall multiplies defence by 2.5. */
function monsterHitDamage(atk, defence, shielded) {
  const def = shielded ? defence * 2.5 : defence;
  return Math.max(1, atk - Math.floor(def * 0.5));
}

/** Seconds per tile at a given speed stat (tiles per second). */
function stepSeconds(speed) {
  return 1 / Math.max(0.5, speed);
}

/**
 * The bug types that can appear on a floor: every normal type whose minFloor
 * has been reached. The boss isn't in the pool; it has its own floors.
 */
function spawnableTypes(types, floor) {
  return types.filter(t => t.type !== 'boss' && (t.minFloor || 1) <= floor);
}

if (typeof window !== 'undefined') {
  Object.assign(window, { relicScore, isUpgrade, applyXp, monsterHitDamage, stepSeconds, spawnableTypes });
}
