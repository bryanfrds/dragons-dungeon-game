// Pixel Dungeon Crawler - Main Game Loop & State Manager

const MONSTER_TYPES = [
  // spd: tiles per second when chasing the hero. Ghosts are quick, slimes ooze.
  { type: 'slime', name: 'Syntax Error', baseHp: 30, baseAtk: 6, xp: 25, gold: 8, color: '#34d399', spd: 1.2, minFloor: 1 },
  { type: 'ghost', name: 'Memory Leak', baseHp: 45, baseAtk: 9, xp: 40, gold: 15, color: '#38bdf8', spd: 2.2, minFloor: 3 },
  { type: 'skeleton', name: 'Null Pointer', baseHp: 65, baseAtk: 14, xp: 60, gold: 22, color: '#f87171', spd: 1.6, minFloor: 5 },
  // From floor 4: fragile but fast, and it strikes twice as often.
  { type: 'race', name: 'Race Condition', baseHp: 22, baseAtk: 9, xp: 45, gold: 18, color: '#facc15', spd: 3.2,
    attackRate: 0.5, minFloor: 4 },
  // From floor 7: slow, and it heals itself unless you finish it quickly.
  { type: 'loop', name: 'Infinite Loop', baseHp: 55, baseAtk: 10, xp: 70, gold: 26, color: '#a855f7', spd: 1.3,
    regen: 0.06, minFloor: 7 },
  { type: 'boss', name: 'MERGE CONFLICT (BOSS)', baseHp: 200, baseAtk: 22, xp: 200, gold: 80, color: '#fbbf24', spd: 1.0 }
];

const LOOT_TABLE = [
  // Weapons
  { slot: 'weapon', name: 'Iron Broadsword', atk: 8, rarity: 'common', icon: '⚔️' },
  { slot: 'weapon', name: 'Crystal Edge', atk: 14, rarity: 'rare', icon: '🗡️' },
  { slot: 'weapon', name: 'Shadow Dagger', atk: 22, rarity: 'epic', icon: '🔪' },
  { slot: 'weapon', name: 'Excalibur.js', atk: 35, rarity: 'legendary', icon: '✨' },
  // Armor
  { slot: 'armor', name: 'Chainmail Coat', def: 6, rarity: 'common', icon: '🥋' },
  { slot: 'armor', name: 'Dragon Scale Armor', def: 12, rarity: 'rare', icon: '🛡️' },
  { slot: 'armor', name: 'Voidplate Cuirass', def: 20, rarity: 'epic', icon: '🦺' },
  { slot: 'armor', name: 'Aegis of the Core', def: 32, rarity: 'legendary', icon: '🌟' },
  // Relics
  { slot: 'relic', name: 'Silver Ring', maxHp: 25, rarity: 'common', icon: '💍' },
  { slot: 'relic', name: 'Vampiric Fang', lifesteal: 12, rarity: 'rare', icon: '🩸' },
  { slot: 'relic', name: 'Boots of Hermes', spd: 1.5, rarity: 'epic', icon: '👟' },
  { slot: 'relic', name: 'Infinity Stone', maxHp: 50, lifesteal: 15, rarity: 'legendary', icon: '💎' }
];

const SAVE_KEY = 'pixelDungeonSave';
const CHASE_RANGE = 5;   // tiles: how close the hero has to be before a bug gives chase
const SAVED_HERO_FIELDS = ['level', 'xp', 'maxXp', 'hp', 'maxHp', 'mp', 'maxMp',
  'baseAtk', 'baseDef', 'baseSpd', 'lifesteal', 'potions', 'equipment'];

// ?portrait turns the map on its side (16 wide, 25 tall) for tall displays such
// as a herdr side pane. Same floor area, so difficulty and pacing don't change.
const PORTRAIT = new URLSearchParams(location.search).has('portrait');
const MAP_COLS = PORTRAIT ? 16 : 25;
const MAP_ROWS = PORTRAIT ? 25 : 16;

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.avatarCanvas = document.getElementById('avatarCanvas');
    this.avatarCtx = this.avatarCanvas.getContext('2d');

    this.dungeonGen = new window.DungeonGenerator(MAP_COLS, MAP_ROWS);
    // The canvas has to match the map, or tiles past the edge are simply cut off.
    this.canvas.width = MAP_COLS * TILE_SIZE;
    this.canvas.height = MAP_ROWS * TILE_SIZE + 8;
    this.sound = window.soundEngine;
    this.sprites = window.spriteRenderer;

    // Game state
    this.floor = 1;
    this.bestFloor = 1;    // deepest floor ever reached; kept across deaths
    this.shopBought = {};  // how many of each shop item were bought (prices rise)
    this.gold = 0;
    this.autoPlay = true;
    this.speedMultiplier = 1;
    this.gameSpeedOptions = [1, 2, 4];
    this.speedIndex = 0;
    this.isFloorCleared = false;
    this.keys = {};

    // Hero Entity
    this.hero = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      gx: 0,
      gy: 0,
      facing: 1,
      frame: 0,
      animTimer: 0,
      level: 1,
      xp: 0,
      maxXp: 60,
      hp: 100,
      maxHp: 100,
      mp: 50,
      maxMp: 50,
      baseAtk: 8,
      baseDef: 4,
      baseSpd: 3.5,
      lifesteal: 0,
      potions: 2,
      isAttacking: false,
      attackCooldown: 0,
      moveCooldown: 0,
      hurtTimer: 0,
      shieldActiveTimer: 0,
      skills: {
        whirlwind: { cd: 0, maxCd: 6 },
        shield: { cd: 0, maxCd: 10 },
        potion: { cd: 0, maxCd: 3 }
      },
      equipment: {
        weapon: { name: 'Rusty Blade', atk: 4, rarity: 'common' },
        armor: { name: 'Cloth Tunic', def: 2, rarity: 'common' },
        relic: { name: 'Wooden Ring', maxHp: 10, rarity: 'common' }
      }
    };

    // World Entities
    this.monsters = [];
    this.particles = [];
    this.floatingTexts = [];
    this.lootHistory = [];
    this.aiPath = [];
    this.aiCurrentTarget = null;
    this.aiCooldown = 0;
    this.shake = 0;        // seconds of screen shake left (after the hero is hit)
    this.fade = 0;         // seconds of fade-in left after entering a floor

    this.initUI();
    this.initControls();
    const saved = this.loadGame();
    this.startFloor(saved ? saved.floor : 1);
    this.updateStatsUI();
    this.updateBars();
    setInterval(() => this.saveGame(), 3000);
    window.addEventListener('beforeunload', () => this.saveGame());
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  initUI() {
    this.modeBtn = document.getElementById('modeToggleBtn');
    this.modeText = document.getElementById('modeText');
    this.speedBtn = document.getElementById('speedBtn');
    this.soundBtn = document.getElementById('soundToggleBtn');
    this.floorDisplay = document.getElementById('floorDisplay');
    this.goldDisplay = document.getElementById('goldDisplay');
    this.hpBar = document.getElementById('hpBar');
    this.hpText = document.getElementById('hpText');
    this.mpBar = document.getElementById('mpBar');
    this.mpText = document.getElementById('mpText');
    this.xpBar = document.getElementById('xpBar');
    this.xpText = document.getElementById('xpText');
    this.combatLog = document.getElementById('combatLog');
    this.lootFeed = document.getElementById('lootFeed');
    this.lootCount = document.getElementById('lootCount');
    this.overlay = document.getElementById('gameOverlay');
    this.overlayTitle = document.getElementById('overlayTitle');
    this.overlayMsg = document.getElementById('overlayMessage');
    this.overlayBtn = document.getElementById('overlayBtn');
    this.aiActionText = document.getElementById('aiActionText');
    this.monstersRemaining = document.getElementById('monstersRemaining');
    this.zoneName = document.getElementById('zoneName');

    this.modeBtn.addEventListener('click', () => this.toggleAutoPlay());
    this.speedBtn.addEventListener('click', () => this.cycleSpeed());
    this.soundBtn.addEventListener('click', () => {
      const enabled = this.sound.toggle();
      this.soundBtn.textContent = enabled ? '🔊' : '🔇';
    });

    document.getElementById('skill1Btn').addEventListener('click', () => this.triggerWhirlwind());
    document.getElementById('skill2Btn').addEventListener('click', () => this.triggerShield());
    document.getElementById('skill3Btn').addEventListener('click', () => this.usePotion());
    document.getElementById('clearLogBtn').addEventListener('click', () => {
      this.combatLog.innerHTML = '<div class="log-entry system">[SYSTEM] Log cleared.</div>';
    });

    this.overlayBtn.addEventListener('click', () => {
      this.overlay.classList.add('hidden');
      if (this.hero.hp <= 0) {
        this.restartGame();
      } else {
        this.startFloor(this.floor + 1);
      }
    });

    this.renderAvatar();
    this.updateStatsUI();
  }

  initControls() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      if (e.code === 'Tab') {
        e.preventDefault();
        this.toggleAutoPlay();
      } else if (e.code === 'Digit1') {
        this.triggerWhirlwind();
      } else if (e.code === 'Digit2') {
        this.triggerShield();
      } else if (e.code === 'Digit3') {
        this.usePotion();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!this.autoPlay) this.manualAttack();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  toggleAutoPlay() {
    this.autoPlay = !this.autoPlay;
    if (this.autoPlay) {
      this.modeBtn.className = 'btn btn-mode auto';
      this.modeText.textContent = 'AI AUTO: ON';
      this.log('Auto-Play AI activated.', 'system');
    } else {
      this.modeBtn.className = 'btn btn-mode manual';
      this.modeText.textContent = 'MANUAL CONTROL';
      this.log('Manual player controls engaged.', 'system');
      this.aiActionText.textContent = 'Manual Mode: WASD / Space';
    }
  }

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % this.gameSpeedOptions.length;
    this.speedMultiplier = this.gameSpeedOptions[this.speedIndex];
    this.speedBtn.textContent = `${this.speedMultiplier}x`;
  }

  // Save/load progress (floor, gold, hero level, stats, gear) in localStorage.
  // Position within a floor isn't kept; a loaded game starts the saved floor fresh.
  saveGame() {
    const h = this.hero;
    const hero = {};
    for (const k of SAVED_HERO_FIELDS) hero[k] = h[k];
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ floor: this.floor, bestFloor: this.bestFloor, gold: this.gold,
                                                       shopBought: this.shopBought, hero }));
    } catch (e) { /* storage full or blocked: skip */ }
  }

  loadGame() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      // Whole numbers in a sane range: a string gold ("abc") made every shop
      // price compare false, so everything was free; 1e400 floors showed Infinity.
      const floor = Math.floor(Number(saved && saved.floor));
      if (!saved || !saved.hero || !(floor >= 1 && floor <= 100000)) return null;
      saved.floor = floor;
      const gold = Math.floor(Number(saved.gold));
      this.gold = Number.isFinite(gold) && gold > 0 ? gold : 0;
      const best = Math.floor(Number(saved.bestFloor));
      this.bestFloor = Math.max(saved.floor, Number.isFinite(best) ? Math.min(best, 100000) : 1);
      // Only known items, as whole counts from 0 to 1000. A count like -1e308
      // priced an upgrade at 0g and froze autoplay buying it forever; "abc"
      // made the price NaN, which every purchase passed for free.
      const sb = saved.shopBought && typeof saved.shopBought === 'object' ? saved.shopBought : {};
      this.shopBought = {};
      for (const { id } of SHOP_ITEMS) {
        const n = Math.floor(Number(sb[id]));
        if (Number.isFinite(n) && n > 0) this.shopBought[id] = Math.min(n, 1000);
      }
      for (const k of SAVED_HERO_FIELDS) {
        if (saved.hero[k] !== undefined) this.hero[k] = saved.hero[k];
      }
      // A broken save with maxXp of 0 or less would make applyXp loop forever.
      if (!(this.hero.maxXp >= 1)) this.hero.maxXp = 60;
      if (this.hero.hp <= 0) this.hero.hp = this.maxHp;
      // The badge is static HTML that only level-ups updated, so a loaded
      // level-8 hero still showed "LVL 1".
      document.getElementById('heroLevelBadge').textContent = `LVL ${this.hero.level}`;
      this.log(`Save loaded: Floor ${saved.floor}, Level ${this.hero.level}.`, 'system');
      return saved;
    } catch (e) {
      return null;
    }
  }

  startFloor(floorNum) {
    this.floor = floorNum;
    this.floorDisplay.textContent = this.floor;
    if (this.floor > this.bestFloor) {
      this.bestFloor = this.floor;
      if (this.floor > 1) this.log(`New record: Floor ${this.floor}!`, 'level');
    }
    const best = document.getElementById('bestDisplay');
    if (best) best.textContent = this.bestFloor;
    this.isFloorCleared = false;
    this.dungeon = this.dungeonGen.generate(this.floor);
    this.fade = 0.45;
    this.floorLayer = buildFloorLayer(this.dungeon.grid, TILE_SIZE, this.floor * 7919 + Math.floor(Math.random() * 1000));

    // Position Hero at Spawn Room
    this.hero.gx = this.dungeon.spawnPos.x;
    this.hero.gy = this.dungeon.spawnPos.y;
    this.hero.x = this.hero.gx * TILE_SIZE;
    this.hero.y = this.hero.gy * TILE_SIZE;
    this.hero.targetX = this.hero.x;
    this.hero.targetY = this.hero.y;
    this.aiPath = [];
    this.aiCurrentTarget = null;

    // Spawn Monsters across other rooms
    this.monsters = [];
    const isBossFloor = this.floor % 5 === 0;

    if (isBossFloor) {
      this.zoneName.textContent = `Floor ${this.floor}: 🔥 BOSS LAIR`;
      // Spawn Boss in end room
      const bossRoom = this.dungeon.rooms[this.dungeon.rooms.length - 1];
      this.spawnMonster('boss', bossRoom.cx, bossRoom.cy);
    } else {
      const zoneTitles = [
        'The Debug Catacombs',
        'Garbage Collection Vaults',
        'Async Callback Sewers',
        'Kernel Memory Sanctum',
        'The Deep Stack Matrix'
      ];
      this.zoneName.textContent = `Floor ${this.floor}: ${zoneTitles[(this.floor - 1) % zoneTitles.length]}`;
    }

    // Spawn Normal Monsters in rooms
    for (let i = 1; i < this.dungeon.rooms.length; i++) {
      const room = this.dungeon.rooms[i];
      const count = Math.floor(Math.random() * 2) + 1;
      for (let c = 0; c < count; c++) {
        const choices = spawnableTypes(MONSTER_TYPES, this.floor);
        const mType = choices[Math.floor(Math.random() * choices.length)].type;
        const mx = room.x + Math.floor(Math.random() * (room.w - 2)) + 1;
        const my = room.y + Math.floor(Math.random() * (room.h - 2)) + 1;
        // One bug per tile, and never on a chest or the stairs.
        if (this.monsterAt(mx, my) || this.dungeon.grid[my][mx] !== TILE.FLOOR) continue;
        this.spawnMonster(mType, mx, my);
      }
    }

    this.log(`Entered Floor ${this.floor}. Defeat all ${this.monsters.length} bugs!`, 'system');
    this.updateMonstersCount();
  }

  spawnMonster(type, gx, gy) {
    const template = MONSTER_TYPES.find(m => m.type === type) || MONSTER_TYPES[0];
    const scale = 1 + (this.floor - 1) * 0.25;
    const hp = Math.floor(template.baseHp * scale);
    const atk = Math.floor(template.baseAtk * scale);

    this.monsters.push({
      id: Math.random().toString(36).substr(2, 9),
      type: template.type,
      name: template.name,
      color: template.color,
      gx,
      gy,
      x: gx * TILE_SIZE,
      y: gy * TILE_SIZE,
      hp,
      maxHp: hp,
      atk,
      xp: Math.floor(template.xp * scale),
      gold: Math.floor(template.gold * scale),
      facing: -1,
      attackCooldown: 0,
      spd: template.spd,
      attackRate: template.attackRate || 1.0,   // seconds between hits
      regen: template.regen || 0,               // share of max HP healed per second
      moveCooldown: Math.random(),   // so a room of bugs doesn't move in lockstep
      animTimer: Math.random() * 10
    });
  }

  // Combat Stats calculation
  get totalAttack() {
    return this.hero.baseAtk + (this.hero.equipment.weapon?.atk || 0);
  }

  get totalDefense() {
    return this.hero.baseDef + (this.hero.equipment.armor?.def || 0);
  }

  get totalSpeed() {
    return this.hero.baseSpd + (this.hero.equipment.relic?.spd || 0);
  }

  /** Max HP including the ring's bonus. hero.maxHp is the base that levels raise. */
  get maxHp() {
    return this.hero.maxHp + (this.hero.equipment.relic?.maxHp || 0);
  }

  get totalLifesteal() {
    return this.hero.lifesteal + (this.hero.equipment.relic?.lifesteal || 0);
  }

  updateStatsUI() {
    document.getElementById('statAtk').textContent = this.totalAttack;
    document.getElementById('statDef').textContent = this.totalDefense;
    document.getElementById('statSpd').textContent = this.totalSpeed.toFixed(1);
    document.getElementById('statLifesteal').textContent = `${this.totalLifesteal}%`;

    // Gear names
    document.getElementById('eqWeaponName').textContent = this.hero.equipment.weapon?.name || 'Empty';
    document.getElementById('eqWeaponStat').textContent = `+${this.hero.equipment.weapon?.atk || 0} Atk`;

    document.getElementById('eqArmorName').textContent = this.hero.equipment.armor?.name || 'Empty';
    document.getElementById('eqArmorStat').textContent = `+${this.hero.equipment.armor?.def || 0} Def`;

    document.getElementById('eqRelicName').textContent = this.hero.equipment.relic?.name || 'Empty';
    // Every bonus the ring has. Boots of Hermes used to read "+10 HP" (it's speed).
    document.getElementById('eqRelicStat').textContent = this.describeItem(this.hero.equipment.relic || {});

    document.getElementById('potionCount').textContent = this.hero.potions;
  }

  renderAvatar() {
    this.avatarCtx.clearRect(0, 0, 64, 64);
    const sprite = this.sprites.getHeroSprite(0, 1, false);
    this.avatarCtx.drawImage(sprite, 0, 0, 64, 64);
  }

  log(msg, type = 'normal') {
    const el = document.createElement('div');
    el.className = `log-entry ${type}`;
    el.textContent = `• ${msg}`;
    this.combatLog.appendChild(el);
    this.combatLog.scrollTop = this.combatLog.scrollHeight;
  }

  addLootDrop(item) {
    this.lootHistory.unshift(item);
    if (this.lootHistory.length > 15) this.lootHistory.pop();

    this.lootFeed.innerHTML = '';
    this.lootCount.textContent = `${this.lootHistory.length} items`;

    this.lootHistory.forEach(item => {
      const card = document.createElement('div');
      card.className = `loot-card ${item.rarity}`;
      card.innerHTML = `
        <span class="loot-icon">${item.icon || '📦'}</span>
        <div style="flex:1">
          <b style="color:#fff">${item.name}</b>
          <div style="font-size:9px; color:#38bdf8">${this.describeItem(item)} (${item.rarity.toUpperCase()})</div>
        </div>
      `;
      this.lootFeed.appendChild(card);
    });
  }

  /** "+14 Atk", "+12 Def", or a ring's bonuses, e.g. "+50 HP, +15% Lifesteal". */
  describeItem(item) {
    if (item.atk) return `+${item.atk} Atk`;
    if (item.def) return `+${item.def} Def`;
    return [item.maxHp && `+${item.maxHp} HP`, item.lifesteal && `+${item.lifesteal}% Lifesteal`,
            item.spd && `+${item.spd} Spd`].filter(Boolean).join(', ') || 'No bonus';
  }

  // Abilities
  triggerWhirlwind() {
    if (this.hero.hp <= 0) return;   // see update(): nothing happens while dead
    if (this.hero.mp < 15 || this.hero.skills.whirlwind.cd > 0) return;
    this.hero.mp -= 15;
    this.hero.skills.whirlwind.cd = this.hero.skills.whirlwind.maxCd;
    this.sound.playWhirlwind();

    // Hit all adjacent monsters
    let hitCount = 0;
    this.monsters.forEach(m => {
      const dist = Math.hypot(m.gx - this.hero.gx, m.gy - this.hero.gy);
      if (dist <= 1.8) {
        const dmg = Math.floor(this.totalAttack * 1.6);
        this.damageMonster(m, dmg);
        hitCount++;
      }
    });

    // Particle AoE Ring
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      this.particles.push({
        x: this.hero.x + 16,
        y: this.hero.y + 16,
        vx: Math.cos(angle) * 4,
        vy: Math.sin(angle) * 4,
        color: '#818cf8',
        life: 0.3,
        maxLife: 0.3,
        size: 4
      });
    }

    this.log(`Hero executed Whirlwind! Hit ${hitCount} enemies.`, 'heal');
    this.updateBars();
  }

  triggerShield() {
    if (this.hero.hp <= 0) return;
    if (this.hero.mp < 20 || this.hero.skills.shield.cd > 0) return;
    this.hero.mp -= 20;
    this.hero.skills.shield.cd = this.hero.skills.shield.maxCd;
    this.hero.shieldActiveTimer = 4.0;
    this.sound.playShield();
    this.log('Hero activated Iron Wall! 2.5x Defense for 4s.', 'heal');
    this.updateBars();
  }

  usePotion() {
    // A potion at 0 HP used to bring the hero back while the game-over box was
    // up, and its button then skipped to the next floor instead of respawning.
    if (this.hero.hp <= 0) return;
    if (this.hero.potions <= 0 || this.hero.hp >= this.maxHp) return;
    this.hero.potions--;
    const healAmt = Math.floor(this.maxHp * 0.5);
    this.hero.hp = Math.min(this.maxHp, this.hero.hp + healAmt);
    this.sound.playPotion();
    this.addFloatingText(`+${healAmt} HP`, this.hero.x + 16, this.hero.y, '#34d399');
    this.log(`Used Health Potion! Restored ${healAmt} HP.`, 'heal');
    // Drinking one while the shop is open frees a bag slot.
    if (!this.overlay.classList.contains('hidden') && this.hero.hp > 0) this.renderShop();
    this.updateBars();
    this.updateStatsUI();
  }

  manualAttack() {
    if (this.hero.hp <= 0 || this.hero.attackCooldown > 0) return;
    this.hero.attackCooldown = 0.35;
    this.hero.isAttacking = true;
    this.sound.playSwing();

    // Target closest adjacent monster
    const adjacent = this.monsters.find(m => {
      const dist = Math.hypot(m.gx - this.hero.gx, m.gy - this.hero.gy);
      return dist <= 1.4;
    });

    if (adjacent) {
      this.damageMonster(adjacent, this.totalAttack);
    }
  }

  damageMonster(m, rawDmg) {
    const dmg = Math.max(1, rawDmg + Math.floor(Math.random() * 4) - 2);
    m.hp -= dmg;
    m.hitTimer = 0.12;
    this.sound.playHit();
    this.addFloatingText(`-${dmg}`, m.x + 16, m.y, '#f87171');

    // Lifesteal heal
    if (this.totalLifesteal > 0) {
      const heal = Math.max(1, Math.floor(dmg * (this.totalLifesteal / 100)));
      this.hero.hp = Math.min(this.maxHp, this.hero.hp + heal);
      this.addFloatingText(`+${heal}`, this.hero.x + 16, this.hero.y, '#34d399');
    }

    // Spark particles
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x: m.x + 16,
        y: m.y + 16,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        color: m.color,
        life: 0.25,
        maxLife: 0.25,
        size: 3
      });
    }

    if (m.hp <= 0) {
      this.killMonster(m);
    }
  }

  killMonster(m) {
    this.sound.playKill();
    // Burst into pixels so a kill reads at a glance, bigger for the boss.
    const n = m.type === 'boss' ? 40 : 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, v = 1.5 + Math.random() * 2.5;
      this.particles.push({ x: m.x + 16, y: m.y + 16, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                            color: i % 3 ? m.color : '#ffffff', life: 0.45, maxLife: 0.45, size: 3 });
    }
    this.gold += m.gold;
    this.gainXp(m.xp);
    this.log(`Fixed bug: [${m.name}]! Gained +${m.gold} Gold, +${m.xp} XP.`, 'kill');

    // Roll Loot Drop
    if (Math.random() < 0.45 || m.type === 'boss') {
      this.rollLootDrop(m.type === 'boss');
    }

    // Remove from array
    this.monsters = this.monsters.filter(monster => monster.id !== m.id);
    this.updateMonstersCount();

    if (this.monsters.length === 0) {
      this.isFloorCleared = true;
      this.log(`Floor ${this.floor} cleared! Head to the stairs to advance.`, 'level');
    }
  }

  rollLootDrop(isBoss = false) {
    const available = LOOT_TABLE.filter(item => isBoss ? item.rarity !== 'common' : true);
    const drop = { ...available[Math.floor(Math.random() * available.length)] };
    this.addLootDrop(drop);
    this.sound.playCoin();

    // Equip only if it beats what's worn. Rings used to be swapped in whatever
    // they were, so a legendary Infinity Stone could be lost to a Silver Ring.
    if (isUpgrade(this.hero.equipment, drop)) {
      this.hero.equipment[drop.slot] = drop;
      this.hero.hp = Math.min(this.hero.hp, this.maxHp);   // a ring with less HP lowers the cap
      this.log(`✨ Equipped new gear: ${drop.name} (${drop.rarity.toUpperCase()})!`, 'loot');
      this.updateStatsUI();
    }
  }

  gainXp(amt) {
    const levels = applyXp(this.hero, amt);   // every level the XP pays for
    if (levels > 0) {
      this.hero.hp = this.maxHp;
      this.hero.mp = this.hero.maxMp;
      this.sound.playLevelUp();
      this.log(`🎉 LEVEL UP! Reached Level ${this.hero.level}! Stats increased.`, 'level');
      document.getElementById('heroLevelBadge').textContent = `LVL ${this.hero.level}`;
      this.addFloatingText(levels > 1 ? `LEVEL UP x${levels}!` : 'LEVEL UP!',
                           this.hero.x + 16, this.hero.y - 10, '#fbbf24');
      this.updateStatsUI();
    }
    this.updateBars();
  }

  updateBars() {
    const hpPct = Math.max(0, (this.hero.hp / this.maxHp) * 100);
    const mpPct = Math.max(0, (this.hero.mp / this.hero.maxMp) * 100);
    const xpPct = Math.max(0, (this.hero.xp / this.hero.maxXp) * 100);

    this.hpBar.style.width = `${hpPct}%`;
    this.hpText.textContent = `${this.hero.hp} / ${this.maxHp} HP`;

    this.mpBar.style.width = `${mpPct}%`;
    this.mpText.textContent = `${this.hero.mp} / ${this.hero.maxMp} MP`;

    this.xpBar.style.width = `${xpPct}%`;
    this.xpText.textContent = `${this.hero.xp} / ${this.hero.maxXp} XP`;

    this.goldDisplay.textContent = this.gold;

    // Cooldown overlays
    const wPct = (this.hero.skills.whirlwind.cd / this.hero.skills.whirlwind.maxCd) * 100;
    document.getElementById('skill1Cd').style.height = `${wPct}%`;

    const sPct = (this.hero.skills.shield.cd / this.hero.skills.shield.maxCd) * 100;
    document.getElementById('skill2Cd').style.height = `${sPct}%`;
  }

  updateMonstersCount() {
    this.monstersRemaining.textContent = `Bugs: ${this.monsters.length} alive`;
  }

  addFloatingText(text, x, y, color = '#fff') {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      life: 0.8,
      maxLife: 0.8
    });
  }

  // Auto-Play AI Decision Loop
  updateAI(dt) {
    if (!this.autoPlay) return;

    this.aiCooldown -= dt;
    if (this.aiCooldown > 0) return;
    this.aiCooldown = 0.15; // AI tick rate

    // 1. Check if low HP -> drink potion
    if (this.hero.hp < this.maxHp * 0.35 && this.hero.potions > 0) {
      this.usePotion();
    }

    // 2. Check if surrounded by >= 2 monsters -> trigger Whirlwind
    const adjacentCount = this.monsters.filter(m => Math.hypot(m.gx - this.hero.gx, m.gy - this.hero.gy) <= 1.5).length;
    // Only when there's MP for it: with the cooldown ready but under 15 MP,
    // Whirlwind did nothing yet the AI still skipped its turn, so it stood there
    // being hit until the MP came back.
    if (adjacentCount >= 2 && this.hero.skills.whirlwind.cd <= 0 && this.hero.mp >= 15) {
      this.triggerWhirlwind();
      return;
    }

    // 3. Find target: Monsters -> Chests -> Stairs
    if (this.monsters.length > 0) {
      // Find closest monster
      let nearest = null;
      let minDst = Infinity;
      for (const m of this.monsters) {
        const dst = Math.hypot(m.gx - this.hero.gx, m.gy - this.hero.gy);
        if (dst < minDst) {
          minDst = dst;
          nearest = m;
        }
      }

      if (nearest) {
        this.aiActionText.textContent = `AI: Engaging [${nearest.name}]`;
        if (minDst <= 1.4) {
          // Attack!
          this.manualAttack();
          return;
        } else {
          // Pathfind to monster
          const path = this.dungeonGen.findPath({ x: this.hero.gx, y: this.hero.gy }, { x: nearest.gx, y: nearest.gy });
          if (path.length > 0) {
            this.moveHeroTo(path[0].x, path[0].y);
          }
        }
      }
    } else {
      // Monsters dead -> Go to unopened chests or stairs
      const unopenedChest = this.dungeon.chests.find(c => !c.opened);
      if (unopenedChest) {
        this.aiActionText.textContent = 'AI: Looting Treasure Chest...';
        const dst = Math.hypot(unopenedChest.x - this.hero.gx, unopenedChest.y - this.hero.gy);
        if (dst <= 1.4) {
          unopenedChest.opened = true;
          this.rollLootDrop(false);
          this.gainXp(30);
          this.gold += 20;
          this.log('Opened treasure chest! +20 Gold, +30 XP.', 'loot');
        } else {
          const path = this.dungeonGen.findPath({ x: this.hero.gx, y: this.hero.gy }, { x: unopenedChest.x, y: unopenedChest.y });
          if (path.length > 0) this.moveHeroTo(path[0].x, path[0].y);
        }
      } else {
        // Go to stairs
        this.aiActionText.textContent = 'AI: Descending to Next Floor...';
        const dst = Math.hypot(this.dungeon.stairsPos.x - this.hero.gx, this.dungeon.stairsPos.y - this.hero.gy);
        if (dst === 0) {
          // Only once: the AI ticks every 0.15s while standing here, and each
          // call rebuilt the shop (eating clicks) and queued another descent.
          if (this.overlay.classList.contains('hidden')) this.triggerNextFloorModal();
        } else {
          const path = this.dungeonGen.findPath({ x: this.hero.gx, y: this.hero.gy }, this.dungeon.stairsPos);
          if (path.length > 0) this.moveHeroTo(path[0].x, path[0].y);
        }
      }
    }
  }

  /**
   * Step one tile, at most once per stepSeconds(speed). Movement used to have no
   * limit: holding a key moved a tile every frame (60 a second), the AI moved on
   * every 0.15s tick, and the speed stat - Boots of Hermes included - did nothing.
   */
  moveHeroTo(gx, gy) {
    if (this.hero.moveCooldown > 0) return;
    // Bugs block the way; walking straight through them looked broken.
    if (this.dungeonGen.isWalkable(gx, gy) && !this.monsterAt(gx, gy)) {
      // += keeps the part of a frame that overshot the last step (at most one
      // frame, since the cooldown only counts down while above 0), so the real
      // rate matches the speed stat instead of falling a little short.
      this.hero.moveCooldown += stepSeconds(this.totalSpeed);
      // The AI decides every 0.15s; without this its steps landed on every
      // second decision whatever the speed, so Hermes did nothing in autoplay.
      if (this.autoPlay) this.aiCooldown = this.hero.moveCooldown;
      this.hero.facing = gx >= this.hero.gx ? 1 : -1;
      this.hero.gx = gx;
      this.hero.gy = gy;
      this.hero.targetX = gx * TILE_SIZE;
      this.hero.targetY = gy * TILE_SIZE;
    }
  }

  /**
   * Bugs used to stand still until the hero walked up to them. Now one that's
   * within CHASE_RANGE tiles walks towards the hero at its own speed, without
   * stepping onto the hero or another bug, and stops once it's next to them.
   */
  chaseHero(m, dist, dt) {
    m.moveCooldown -= dt;
    if (dist > CHASE_RANGE || dist <= 1.2 || m.moveCooldown > 0) return;
    const path = this.dungeonGen.findPath({ x: m.gx, y: m.gy }, { x: this.hero.gx, y: this.hero.gy });
    const next = path[0];
    if (!next || (next.x === this.hero.gx && next.y === this.hero.gy) || this.monsterAt(next.x, next.y)) {
      m.moveCooldown = stepSeconds(m.spd);   // wait a step before searching again
      return;
    }
    m.facing = next.x >= m.gx ? 1 : -1;
    m.gx = next.x;
    m.gy = next.y;
    m.moveCooldown = stepSeconds(m.spd);
  }

  monsterAt(gx, gy) {
    return this.monsters.find(m => m.gx === gx && m.gy === gy);
  }

  /** Buy one shop item; returns whether it worked. */
  buy(id) {
    const state = { gold: this.gold, bought: this.shopBought, hero: this.hero };
    if (!buyFromShop(state, id)) return false;
    this.gold = state.gold;
    const item = SHOP_ITEMS.find(i => i.id === id);
    this.log(`Bought ${item.name}.`, 'loot');
    this.sound.playCoin();
    this.updateStatsUI();
    this.updateBars();
    this.renderShop();
    return true;
  }

  /** The shop on the floor-cleared screen: each item, its price, and whether you can pay. */
  renderShop() {
    const row = document.getElementById('shopRow');
    if (!row) return;
    row.innerHTML = '';
    for (const item of SHOP_ITEMS) {
      const cost = shopPrice(item, this.shopBought[item.id]);
      const full = item.id === 'potion' && this.hero.potions >= MAX_POTIONS;
      const btn = document.createElement('button');
      btn.className = 'shop-item';
      btn.disabled = this.gold < cost || full;
      btn.innerHTML = `<span>${item.icon}</span><span>${item.name}<small>${full ? 'Bag full' : item.desc || '+1 potion'}</small></span><span class="price">${cost}g</span>`;
      btn.addEventListener('click', () => this.buy(item.id));
      row.appendChild(btn);
    }
    row.classList.remove('hidden');
  }

  triggerNextFloorModal() {
    this.overlayTitle.textContent = `FLOOR ${this.floor} CLEARED!`;
    this.overlayMsg.textContent = `All bugs patched. Spend your gold, then on to Floor ${this.floor + 1}.`;
    this.overlayBtn.textContent = `ENTER FLOOR ${this.floor + 1}`;
    this.renderShop();
    this.overlay.classList.remove('hidden');

    if (this.autoPlay) {
      // The AI shops too: potions up to 3, then the cheapest upgrade, while it can pay.
      for (let id; (id = nextShopBuy({ gold: this.gold, bought: this.shopBought, hero: this.hero })); ) {
        if (!this.buy(id)) break;
      }
      setTimeout(() => {
        if (!this.overlay.classList.contains('hidden') && this.hero.hp > 0) {
          this.overlay.classList.add('hidden');
          this.startFloor(this.floor + 1);
        }
      }, 1200);
    }
  }

  restartGame() {
    this.hero.hp = this.maxHp;
    this.hero.mp = this.hero.maxMp;
    this.hero.potions = 2;
    this.startFloor(1);
    this.updateBars();
  }

  // Main Loop
  loop(currentTime) {
    const rawDt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;
    const dt = rawDt * this.speedMultiplier;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // Dead: nothing moves until RESPAWN. Bugs used to keep hitting the body,
    // spamming the log and re-opening the game-over box, and the AI kept walking.
    if (this.hero.hp <= 0) {
      this.updateEffects(dt);
      return;
    }

    // Regenerate MP slowly
    this.hero.mp = Math.min(this.hero.maxMp, this.hero.mp + 2.5 * dt);

    // Cooldown timers
    if (this.hero.attackCooldown > 0) this.hero.attackCooldown -= dt;
    // The swing pose shows for the first part of the swing; it used to stay on forever.
    if (this.hero.attackCooldown <= 0.2) this.hero.isAttacking = false;
    if (this.hero.moveCooldown > 0) this.hero.moveCooldown -= dt;
    if (this.hero.hurtTimer > 0) this.hero.hurtTimer -= dt;
    this.monsters.forEach(m => { if (m.hitTimer > 0) m.hitTimer -= dt; });
    if (this.hero.skills.whirlwind.cd > 0) this.hero.skills.whirlwind.cd -= dt;
    if (this.hero.skills.shield.cd > 0) this.hero.skills.shield.cd -= dt;
    if (this.hero.shieldActiveTimer > 0) this.hero.shieldActiveTimer -= dt;

    // Smooth movement interpolation
    this.hero.x += (this.hero.targetX - this.hero.x) * Math.min(1, 12 * dt);
    this.hero.y += (this.hero.targetY - this.hero.y) * Math.min(1, 12 * dt);

    // Manual Input Handling
    if (!this.autoPlay) {
      if (this.keys['KeyW'] || this.keys['ArrowUp']) this.moveHeroTo(this.hero.gx, this.hero.gy - 1);
      else if (this.keys['KeyS'] || this.keys['ArrowDown']) this.moveHeroTo(this.hero.gx, this.hero.gy + 1);
      else if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.moveHeroTo(this.hero.gx - 1, this.hero.gy);
      else if (this.keys['KeyD'] || this.keys['ArrowRight']) this.moveHeroTo(this.hero.gx + 1, this.hero.gy);
    } else {
      this.updateAI(dt);
    }

    // Check stairs landing in manual
    if (this.hero.gx === this.dungeon.stairsPos.x && this.hero.gy === this.dungeon.stairsPos.y && this.monsters.length === 0) {
      if (this.overlay.classList.contains('hidden')) {
        this.triggerNextFloorModal();
      }
    }

    // Update Monsters
    this.monsters.forEach(m => {
      if (this.hero.hp <= 0) return;   // the hero fell earlier this frame
      m.animTimer += dt * 4;
      if (m.regen) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * m.regen * dt);
      m.attackCooldown -= dt;

      // Distance to hero
      const dist = Math.hypot(this.hero.gx - m.gx, this.hero.gy - m.gy);
      this.chaseHero(m, dist, dt);
      // Glide to the tile it's on, the same way the hero does.
      m.x += (m.gx * TILE_SIZE - m.x) * Math.min(1, 10 * dt);
      m.y += (m.gy * TILE_SIZE - m.y) * Math.min(1, 10 * dt);
      if (dist <= 1.2 && m.attackCooldown <= 0) {
        // Monster attacks hero
        m.attackCooldown = m.attackRate;
        const monsterDmg = monsterHitDamage(m.atk, this.totalDefense, this.hero.shieldActiveTimer > 0);
        this.hero.hp -= monsterDmg;
        this.hero.hurtTimer = 0.18;
        this.shake = Math.max(this.shake, 0.15);
        this.sound.playHit();
        this.addFloatingText(`-${monsterDmg}`, this.hero.x + 16, this.hero.y, '#f87171');
        this.log(`[${m.name}] attacked Hero for ${monsterDmg} damage!`, 'damage');

        if (this.hero.hp <= 0) {
          this.hero.hp = 0;
          this.overlayTitle.textContent = 'GAME OVER';
          this.overlayMsg.textContent = 'The system crashed under unresolved exceptions.';
          this.overlayBtn.textContent = 'RESPAWN';
          document.getElementById('shopRow')?.classList.add('hidden');
          this.overlay.classList.remove('hidden');
        }
      }
    });

    this.updateEffects(dt);
    this.updateBars();
  }

  /** Particles and floating numbers, which keep fading even after death. */
  updateEffects(dt) {
    this.shake = Math.max(0, this.shake - dt);
    this.fade = Math.max(0, this.fade - dt);
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      return p.life > 0;
    });

    this.floatingTexts = this.floatingTexts.filter(t => {
      t.y -= 25 * dt;
      t.life -= dt;
      return t.life > 0;
    });
  }

  /**
   * The way down: a dark pit with a ring of blue light that pulses, and brighter
   * once the floor is clear and the stairs work.
   */
  drawStairs() {
    const { x, y } = this.dungeon.stairsPos;
    const cx = x * TILE_SIZE + 16, cy = y * TILE_SIZE + 16;
    const ready = this.monsters.length === 0;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * (ready ? 0.008 : 0.003));
    const glow = this.ctx.createRadialGradient(cx, cy, 2, cx, cy, ready ? 26 : 18);
    glow.addColorStop(0, `rgba(56, 189, 248, ${ready ? 0.55 + pulse * 0.3 : 0.25 + pulse * 0.15})`);
    glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(cx - 28, cy - 28, 56, 56);
    // Steps going down, darker the deeper they go.
    ['#1e3a5f', '#16304f', '#10243d', '#0a182b'].forEach((c, i) => {
      this.ctx.fillStyle = c;
      this.ctx.fillRect(x * TILE_SIZE + 5 + i * 2, y * TILE_SIZE + 6 + i * 5, 22 - i * 4, 5);
    });
    this.ctx.strokeStyle = ready ? '#7dd3fc' : '#38bdf8';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, 24, 24);
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // A short shake when the hero takes a hit, fading out as it runs down.
    this.ctx.save();
    if (this.shake > 0) {
      const m = 4 * (this.shake / 0.15);
      this.ctx.translate(Math.round((Math.random() - 0.5) * m), Math.round((Math.random() - 0.5) * m));
    }

    // 1. Walls and floor, drawn once per floor by tiles.js (see startFloor).
    this.ctx.drawImage(this.floorLayer, 0, 0);
    this.drawStairs();

    // 2. Draw Torches
    this.dungeon.torches.forEach(torch => {
      const tx = torch.x * TILE_SIZE + 16;
      const ty = torch.y * TILE_SIZE + 8;
      const radius = 24 + Math.sin(Date.now() * 0.008 + torch.flicker) * 4;

      const grad = this.ctx.createRadialGradient(tx, ty, 2, tx, ty, radius);
      grad.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
      grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(tx, ty, radius, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = '#f59e0b';
      this.ctx.fillRect(tx - 2, ty - 2, 4, 4);
    });

    // 3. Draw Chests
    this.dungeon.chests.forEach(chest => {
      const sprite = this.sprites.getChestSprite(chest.opened);
      this.ctx.drawImage(sprite, chest.x * TILE_SIZE, chest.y * TILE_SIZE);
    });

    // 4. Draw Monsters
    this.monsters.forEach(m => {
      const frame = Math.floor(m.animTimer) % 2;
      const sprite = this.sprites.getEnemySprite(m.type, frame);
      if (m.hitTimer > 0) this.ctx.filter = 'brightness(2.6)';   // flash white when hit
      this.ctx.drawImage(sprite, m.x, m.y);
      this.ctx.filter = 'none';

      // HP Bar above monster
      const hpPct = m.hp / m.maxHp;
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      this.ctx.fillRect(m.x, m.y - 6, 32, 4);
      this.ctx.fillStyle = m.color;
      this.ctx.fillRect(m.x, m.y - 6, 32 * hpPct, 4);
    });

    // 5. Draw Hero
    const heroFrame = (Math.abs(this.hero.targetX - this.hero.x) > 1 || Math.abs(this.hero.targetY - this.hero.y) > 1) ? 1 : 0;
    const heroSprite = this.sprites.getHeroSprite(heroFrame, this.hero.facing, this.hero.isAttacking);
    // Flash red for a moment when hit.
    if (this.hero.hurtTimer > 0) this.ctx.filter = 'sepia(1) saturate(6) hue-rotate(-40deg) brightness(1.1)';
    this.ctx.drawImage(heroSprite, this.hero.x, this.hero.y);
    this.ctx.filter = 'none';

    // Shield Aura if active
    if (this.hero.shieldActiveTimer > 0) {
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(this.hero.x + 16, this.hero.y + 16, 20, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // 6. Draw Particles
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x, p.y, p.size, p.size);
    });

    // 7. Light: the hero carries a lamp, so the edges of the map fall into
    // shadow. Drawn before the numbers so those stay readable everywhere.
    const hx = this.hero.x + 16, hy = this.hero.y + 16;
    const light = this.ctx.createRadialGradient(hx, hy, TILE_SIZE * 2.5, hx, hy, TILE_SIZE * 9);
    light.addColorStop(0, 'rgba(4, 6, 12, 0)');
    light.addColorStop(1, 'rgba(4, 6, 12, 0.45)');
    this.ctx.fillStyle = light;
    this.ctx.fillRect(-8, -8, this.canvas.width + 16, this.canvas.height + 16);

    // 8. Floating damage numbers, outlined so they read on any background.
    this.ctx.font = '10px "Press Start 2P"';
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    this.floatingTexts.forEach(t => {
      this.ctx.globalAlpha = Math.min(1, t.life / t.maxLife * 2);
      this.ctx.strokeText(t.text, t.x, t.y);
      this.ctx.fillStyle = t.color;
      this.ctx.fillText(t.text, t.x, t.y);
    });
    this.ctx.globalAlpha = 1;
    this.ctx.restore();

    // 9. A new floor fades in from black.
    if (this.fade > 0) {
      this.ctx.fillStyle = `rgba(0, 0, 0, ${this.fade / 0.45})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

// Start Game on window load
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Game();
});
