// Pixel Dungeon Crawler - Main Game Loop & State Manager

const MONSTER_TYPES = [
  { type: 'slime', name: 'Syntax Error', baseHp: 30, baseAtk: 6, xp: 25, gold: 8, color: '#34d399' },
  { type: 'ghost', name: 'Memory Leak', baseHp: 45, baseAtk: 9, xp: 40, gold: 15, color: '#38bdf8' },
  { type: 'skeleton', name: 'Null Pointer', baseHp: 65, baseAtk: 14, xp: 60, gold: 22, color: '#f87171' },
  { type: 'boss', name: 'MERGE CONFLICT (BOSS)', baseHp: 200, baseAtk: 22, xp: 200, gold: 80, color: '#fbbf24' }
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

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.avatarCanvas = document.getElementById('avatarCanvas');
    this.avatarCtx = this.avatarCanvas.getContext('2d');

    this.dungeonGen = new window.DungeonGenerator(25, 16);
    this.sound = window.soundEngine;
    this.sprites = window.spriteRenderer;

    // Game state
    this.floor = 1;
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

    this.initUI();
    this.initControls();
    this.startFloor(1);
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

  startFloor(floorNum) {
    this.floor = floorNum;
    this.floorDisplay.textContent = this.floor;
    this.isFloorCleared = false;
    this.dungeon = this.dungeonGen.generate(this.floor);

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
        const typeIdx = Math.min(Math.floor(Math.random() * 3), Math.floor((this.floor - 1) / 2));
        const mType = MONSTER_TYPES[typeIdx].type;
        const mx = room.x + Math.floor(Math.random() * (room.w - 2)) + 1;
        const my = room.y + Math.floor(Math.random() * (room.h - 2)) + 1;
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
    document.getElementById('eqRelicStat').textContent = this.hero.equipment.relic?.lifesteal ? `+${this.hero.equipment.relic.lifesteal}% Lifesteal` : `+${this.hero.equipment.relic?.maxHp || 10} HP`;

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
          <div style="font-size:9px; color:#38bdf8">${item.atk ? `+${item.atk} Atk` : item.def ? `+${item.def} Def` : `+${item.lifesteal || 10}% Boost`} (${item.rarity.toUpperCase()})</div>
        </div>
      `;
      this.lootFeed.appendChild(card);
    });
  }

  // Abilities
  triggerWhirlwind() {
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
    if (this.hero.mp < 20 || this.hero.skills.shield.cd > 0) return;
    this.hero.mp -= 20;
    this.hero.skills.shield.cd = this.hero.skills.shield.maxCd;
    this.hero.shieldActiveTimer = 4.0;
    this.sound.playShield();
    this.log('Hero activated Iron Wall! +100% Defense for 4s.', 'heal');
    this.updateBars();
  }

  usePotion() {
    if (this.hero.potions <= 0 || this.hero.hp >= this.hero.maxHp) return;
    this.hero.potions--;
    const healAmt = Math.floor(this.hero.maxHp * 0.5);
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + healAmt);
    this.sound.playPotion();
    this.addFloatingText(`+${healAmt} HP`, this.hero.x + 16, this.hero.y, '#34d399');
    this.log(`Used Health Potion! Restored ${healAmt} HP.`, 'heal');
    this.updateBars();
    this.updateStatsUI();
  }

  manualAttack() {
    if (this.hero.attackCooldown > 0) return;
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
    this.sound.playHit();
    this.addFloatingText(`-${dmg}`, m.x + 16, m.y, '#f87171');

    // Lifesteal heal
    if (this.totalLifesteal > 0) {
      const heal = Math.max(1, Math.floor(dmg * (this.totalLifesteal / 100)));
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
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

    // Auto-Equip if superior
    let equipped = false;
    if (drop.slot === 'weapon' && (!this.hero.equipment.weapon || drop.atk > this.hero.equipment.weapon.atk)) {
      this.hero.equipment.weapon = drop;
      equipped = true;
    } else if (drop.slot === 'armor' && (!this.hero.equipment.armor || drop.def > this.hero.equipment.armor.def)) {
      this.hero.equipment.armor = drop;
      equipped = true;
    } else if (drop.slot === 'relic') {
      this.hero.equipment.relic = drop;
      equipped = true;
    }

    if (equipped) {
      this.log(`✨ Equipped new gear: ${drop.name} (${drop.rarity.toUpperCase()})!`, 'loot');
      this.updateStatsUI();
    }
  }

  gainXp(amt) {
    this.hero.xp += amt;
    if (this.hero.xp >= this.hero.maxXp) {
      this.hero.xp -= this.hero.maxXp;
      this.hero.level++;
      this.hero.maxXp = Math.floor(this.hero.maxXp * 1.4);
      this.hero.maxHp += 20;
      this.hero.hp = this.hero.maxHp;
      this.hero.maxMp += 10;
      this.hero.mp = this.hero.maxMp;
      this.hero.baseAtk += 3;
      this.hero.baseDef += 2;
      this.hero.potions = Math.min(5, this.hero.potions + 1);

      this.sound.playLevelUp();
      this.log(`🎉 LEVEL UP! Reached Level ${this.hero.level}! Stats increased.`, 'level');
      document.getElementById('heroLevelBadge').textContent = `LVL ${this.hero.level}`;

      this.addFloatingText(`LEVEL UP!`, this.hero.x + 16, this.hero.y - 10, '#fbbf24');
      this.updateStatsUI();
    }
    this.updateBars();
  }

  updateBars() {
    const hpPct = Math.max(0, (this.hero.hp / this.hero.maxHp) * 100);
    const mpPct = Math.max(0, (this.hero.mp / this.hero.maxMp) * 100);
    const xpPct = Math.max(0, (this.hero.xp / this.hero.maxXp) * 100);

    this.hpBar.style.width = `${hpPct}%`;
    this.hpText.textContent = `${this.hero.hp} / ${this.hero.maxHp} HP`;

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
    if (this.hero.hp < this.hero.maxHp * 0.35 && this.hero.potions > 0) {
      this.usePotion();
    }

    // 2. Check if surrounded by >= 2 monsters -> trigger Whirlwind
    const adjacentCount = this.monsters.filter(m => Math.hypot(m.gx - this.hero.gx, m.gy - this.hero.gy) <= 1.5).length;
    if (adjacentCount >= 2 && this.hero.skills.whirlwind.cd <= 0) {
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
          this.triggerNextFloorModal();
        } else {
          const path = this.dungeonGen.findPath({ x: this.hero.gx, y: this.hero.gy }, this.dungeon.stairsPos);
          if (path.length > 0) this.moveHeroTo(path[0].x, path[0].y);
        }
      }
    }
  }

  moveHeroTo(gx, gy) {
    if (this.dungeonGen.isWalkable(gx, gy)) {
      this.hero.facing = gx >= this.hero.gx ? 1 : -1;
      this.hero.gx = gx;
      this.hero.gy = gy;
      this.hero.targetX = gx * TILE_SIZE;
      this.hero.targetY = gy * TILE_SIZE;
    }
  }

  triggerNextFloorModal() {
    this.overlayTitle.textContent = `FLOOR ${this.floor} CLEARED!`;
    this.overlayMsg.textContent = `All bugs patched successfully. Ready for Floor ${this.floor + 1}?`;
    this.overlayBtn.textContent = `ENTER FLOOR ${this.floor + 1}`;
    this.overlay.classList.remove('hidden');

    if (this.autoPlay) {
      setTimeout(() => {
        if (!this.overlay.classList.contains('hidden') && this.hero.hp > 0) {
          this.overlay.classList.add('hidden');
          this.startFloor(this.floor + 1);
        }
      }, 1200);
    }
  }

  restartGame() {
    this.hero.hp = this.hero.maxHp;
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
    // Regenerate MP slowly
    this.hero.mp = Math.min(this.hero.maxMp, this.hero.mp + 2.5 * dt);

    // Cooldown timers
    if (this.hero.attackCooldown > 0) this.hero.attackCooldown -= dt;
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
      m.animTimer += dt * 4;
      m.attackCooldown -= dt;

      // Distance to hero
      const dist = Math.hypot(this.hero.gx - m.gx, this.hero.gy - m.gy);
      if (dist <= 1.2 && m.attackCooldown <= 0) {
        // Monster attacks hero
        m.attackCooldown = 1.0;
        let def = this.totalDefense;
        if (this.hero.shieldActiveTimer > 0) def *= 2.5;

        const monsterDmg = Math.max(1, m.atk - Math.floor(def * 0.5));
        this.hero.hp -= monsterDmg;
        this.sound.playHit();
        this.addFloatingText(`-${monsterDmg}`, this.hero.x + 16, this.hero.y, '#f87171');
        this.log(`[${m.name}] attacked Hero for ${monsterDmg} damage!`, 'damage');

        if (this.hero.hp <= 0) {
          this.hero.hp = 0;
          this.overlayTitle.textContent = 'GAME OVER';
          this.overlayMsg.textContent = 'The system crashed under unresolved exceptions.';
          this.overlayBtn.textContent = 'RESPAWN';
          this.overlay.classList.remove('hidden');
        }
      }
    });

    // Update Particles & Floating Text
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

    this.updateBars();
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Draw Dungeon Floor & Walls
    for (let r = 0; r < this.dungeon.rows; r++) {
      for (let c = 0; c < this.dungeon.cols; c++) {
        const tile = this.dungeon.grid[r][c];
        const px = c * TILE_SIZE;
        const py = r * TILE_SIZE;

        if (tile === TILE.WALL) {
          this.ctx.fillStyle = '#11151f';
          this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.ctx.strokeStyle = '#1b2230';
          this.ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else {
          // Floor Tile
          this.ctx.fillStyle = '#171c26';
          this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.ctx.fillStyle = '#1e2430';
          this.ctx.fillRect(px + 4, py + 4, 2, 2);

          if (tile === TILE.STAIRS) {
            // Glowing Portal / Stairs
            this.ctx.fillStyle = '#38bdf8';
            this.ctx.fillRect(px + 4, py + 4, 24, 24);
            this.ctx.fillStyle = '#0f172a';
            this.ctx.font = '10px "Press Start 2P"';
            this.ctx.fillText('▼', px + 10, py + 20);
          }
        }
      }
    }

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
      this.ctx.drawImage(sprite, m.x, m.y);

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
    this.ctx.drawImage(heroSprite, this.hero.x, this.hero.y);

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

    // 7. Draw Floating Damage Numbers
    this.ctx.font = '10px "Press Start 2P"';
    this.floatingTexts.forEach(t => {
      this.ctx.fillStyle = t.color;
      this.ctx.fillText(t.text, t.x, t.y);
    });
  }
}

// Start Game on window load
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Game();
});
