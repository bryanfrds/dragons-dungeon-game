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

// The shop between floors. Upgrades get dearer each time you buy one, so gold
// keeps mattering; potions keep one price.
const SHOP_ITEMS = [
  { id: 'potion', name: 'Health Potion', icon: '🧪', price: 30, growth: 1 },
  { id: 'atk', name: 'Whetstone', desc: '+3 Atk', icon: '🗡️', price: 60, growth: 1.35 },
  { id: 'def', name: 'Armor Plating', desc: '+2 Def', icon: '🛡️', price: 60, growth: 1.35 },
  { id: 'hp', name: 'Vitality Rune', desc: '+20 Max HP', icon: '❤️', price: 80, growth: 1.35 },
];
const MAX_POTIONS = 5;

/** What an item costs now, given how many of it were bought before. */
function shopPrice(item, timesBought) {
  return Math.round(item.price * Math.pow(item.growth, timesBought || 0));
}

/**
 * Buy one of `id`. `state` holds gold, the hero and a bought-count per item.
 * Returns false, changing nothing, if it's unknown, unaffordable, or a potion
 * when the bag is full.
 */
function buyFromShop(state, id) {
  const item = SHOP_ITEMS.find(i => i.id === id);
  if (!item) return false;
  const bought = state.bought[id] || 0;
  const cost = shopPrice(item, bought);
  // Written so NaN fails both checks: never free, never paid for with bad gold.
  if (!(cost > 0) || !(state.gold >= cost)) return false;
  const hero = state.hero;
  if (id === 'potion') {
    if (hero.potions >= MAX_POTIONS) return false;
    hero.potions++;
  } else if (id === 'atk') hero.baseAtk += 3;
  else if (id === 'def') hero.baseDef += 2;
  else if (id === 'hp') { hero.maxHp += 20; hero.hp += 20; }
  state.gold -= cost;
  state.bought[id] = bought + 1;
  return true;
}

/**
 * What the AI buys next, or null: potions up to 3 first, since running dry is
 * what kills it, then the cheapest upgrade it can afford.
 */
function nextShopBuy(state) {
  const potion = SHOP_ITEMS[0];
  if (state.hero.potions < 3 && state.gold >= shopPrice(potion, state.bought.potion)) return 'potion';
  const upgrades = SHOP_ITEMS.slice(1)
    .map(i => ({ id: i.id, cost: shopPrice(i, state.bought[i.id]) }))
    .filter(u => u.cost <= state.gold)
    .sort((a, b) => a.cost - b.cost);
  return upgrades.length ? upgrades[0].id : null;
}

/** A number from a save, or `fallback` if it isn't one; clamped, optionally whole. */
function cleanNumber(value, min, max, fallback, whole = true) {
  // Only numbers and numeric text count: Number([]) and Number('') are 0.
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return fallback;
  let n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (whole) n = Math.floor(n);
  return Math.min(max, Math.max(min, n));
}

// Every hero number a save can hold, with the range it's allowed in. Anything
// outside is clamped and anything that isn't a number keeps the default, so a
// hand-edited save can't break levelling, the shop or autoplay.
const HERO_LIMITS = {
  level: [1, 1000], xp: [0, 1e9], maxXp: [1, 1e9], hp: [0, 1e6], maxHp: [1, 1e6],
  mp: [0, 1e6], maxMp: [1, 1e6], baseAtk: [0, 1e6], baseDef: [0, 1e6],
  baseSpd: [0.5, 20, false], lifesteal: [0, 100], potions: [0, 5],
};

/** Copy the saved hero numbers onto `hero`, each cleaned against HERO_LIMITS. */
function loadHeroNumbers(hero, saved) {
  for (const [k, [min, max, whole = true]] of Object.entries(HERO_LIMITS)) {
    hero[k] = cleanNumber(saved[k], min, max, hero[k], whole);
  }
  hero.xp = Math.min(hero.xp, hero.maxXp - 1);   // never a pending level-up loop
  return hero;
}

/** A saved piece of gear, kept only if it's an object whose numbers are sane. */
function cleanGear(item, slot) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const out = { slot, name: String(item.name || 'Unknown').slice(0, 40),
                rarity: ['common', 'rare', 'epic', 'legendary'].includes(item.rarity) ? item.rarity : 'common' };
  if (item.icon) out.icon = String(item.icon).slice(0, 4);
  for (const k of ['atk', 'def', 'maxHp', 'lifesteal']) {
    if (item[k] !== undefined) out[k] = cleanNumber(item[k], 0, 1e5, 0);
  }
  if (item.spd !== undefined) out.spd = cleanNumber(item.spd, 0, 5, 0, false);
  return out;
}

if (typeof window !== 'undefined') {
  Object.assign(window, { relicScore, isUpgrade, applyXp, monsterHitDamage, stepSeconds, spawnableTypes,
                         SHOP_ITEMS, MAX_POTIONS, shopPrice, buyFromShop, nextShopBuy,
                         cleanNumber, HERO_LIMITS, loadHeroNumbers, cleanGear });
}
