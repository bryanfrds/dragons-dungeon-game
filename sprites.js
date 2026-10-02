// Pixel Art Procedural Sprite Rendering Engine
const SPRITE_SIZE = 16;

class SpriteRenderer {
  constructor() {
    this.cache = new Map();
  }

  // Draw Pixel Grid Matrix
  createPixelCanvas(matrix, colorMap, scale = 2) {
    const height = matrix.length;
    const width = matrix[0].length;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const key = matrix[r][c];
        if (key !== '.' && colorMap[key]) {
          ctx.fillStyle = colorMap[key];
          ctx.fillRect(c * scale, r * scale, scale, scale);
        }
      }
    }
    return canvas;
  }

  getHeroSprite(frame = 0, facing = 1, isAttacking = false) {
    const key = `hero_${frame}_${facing}_${isAttacking}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const colors = {
      'H': '#fcd34d', // Hair / Helmet gold
      'F': '#fed7aa', // Skin face
      'E': '#1e1b4b', // Eye dark
      'A': '#818cf8', // Indigo armor
      'S': '#c7d2fe', // Silver steel
      'G': '#4338ca', // Dark indigo boots
      'W': '#e2e8f0', // Sword blade
      'B': '#92400e', // Sword hilt
    };

    let matrix = [
      "....HHHHHH......",
      "...HHHHHHHH.....",
      "..HHHHHHHHHH....",
      "..HHFFEFFFHH....",
      "..HHFFFFFFHH....",
      "...HFFFFFFH.....",
      "....AAAAAA......",
      "...AAAAAAAA.....",
      "..SAAAAAAAAS....",
      "..SAASSSSAAS....",
      "...AASSSSAA.....",
      "....AAAAAA......",
      "....GG..GG......",
      "....GG..GG......",
      "...GGG..GGG.....",
      "................"
    ];

    if (frame === 1) {
      matrix[12] = "...GG....GG.....";
      matrix[13] = "..GGG...GGG.....";
    }

    const sprite = this.createPixelCanvas(matrix, colors, 2);
    this.cache.set(key, sprite);
    return sprite;
  }

  getEnemySprite(type, frame = 0) {
    const key = `enemy_${type}_${frame}`;
    if (this.cache.has(key)) return this.cache.get(key);

    let matrix, colors;

    if (type === 'slime') {
      // Syntax Error Slime
      colors = {
        'G': frame === 0 ? '#10b981' : '#34d399',
        'D': '#047857',
        'E': '#064e3b',
        'W': '#ffffff'
      };
      matrix = [
        "................",
        "................",
        ".....GGGG.......",
        "...GGGGGGGG.....",
        "..GGGGGGGGGG....",
        ".GGWEEGGWEEGG...",
        ".GGWEEGGWEEGG...",
        ".GGGGGGGGGGGG...",
        ".GGGGGGGGGGGG...",
        ".GGGGGGGGGGGG...",
        ".DGGGGGGGGGGD...",
        ".DDDDDDDDDDDD...",
        "................",
        "................",
        "................",
        "................"
      ];
    } else if (type === 'ghost') {
      // Memory Leak Ghost
      colors = {
        'C': '#38bdf8',
        'L': '#7dd3fc',
        'E': '#0c4a6e',
        'G': '#0284c7'
      };
      matrix = [
        ".....LLLL.......",
        "...LLLLLLLL.....",
        "..LLLLLLLLLL....",
        "..LLLELLLELL....",
        "..LLLELLLELL....",
        "..LLLLLLLLLL....",
        "...CCCCCCCC.....",
        "...CCCCCCCC.....",
        "...CCCCCCCC.....",
        "...C.C...C.C....",
        "...C.C...C.C....",
        "....G.....G.....",
        "................",
        "................",
        "................",
        "................"
      ];
    } else if (type === 'skeleton') {
      // Null Pointer Skeleton
      colors = {
        'B': '#e2e8f0',
        'D': '#94a3b8',
        'E': '#ef4444', // glowing red eyes
        'R': '#64748b'
      };
      matrix = [
        "....BBBBBB......",
        "...BBBBBBBB.....",
        "..BBEB..BEBB....",
        "..BBEB..BEBB....",
        "...BBBBBBBB.....",
        ".....BBBB.......",
        "....RRRRRR......",
        "...R.BBBB.R.....",
        "...R.BBBB.R.....",
        "....BBBBBB......",
        "....DB..BD......",
        "....DB..BD......",
        "...DDB..BDD.....",
        "................",
        "................",
        "................"
      ];
    } else if (type === 'race') {
      // Race Condition: two sparks racing each other; they swap places each frame.
      colors = { 'Y': '#facc15', 'O': '#f97316', 'W': '#fffbeb', 'E': '#7c2d12' };
      const a = [
        "..YY............",
        ".YWWY...........",
        "YWEEWY.....OO...",
        "YWWWWY....OWWO..",
        ".YYYY....OWEEWO.",
        "..YY.....OWWWWO.",
        "...Y......OOOO..",
        "....Y......OO...",
        ".....Y....O.....",
        "......Y..O......",
        ".......YO.......",
        "......OY........",
        ".....O..Y.......",
        "....O....Y......",
        "................",
        "................"
      ];
      // Mirror the picture left-to-right on the second frame so they trade sides.
      matrix = frame === 0 ? a : a.map(row => row.split('').reverse().join(''));
    } else if (type === 'loop') {
      // Infinite Loop: a purple ring chasing its own tail.
      colors = { 'P': frame === 0 ? '#a855f7' : '#c084fc', 'D': '#6b21a8', 'E': '#ffffff', 'H': '#f0abfc' };
      matrix = [
        "................",
        ".....PPPPPP.....",
        "...PPDDDDDDPP...",
        "..PDD......DDP..",
        ".PD..........DP.",
        ".PD..........DP.",
        "PD............DP",
        "PD............HH",
        "PD...........HEH",
        "PD...........HHH",
        ".PD..........DP.",
        ".PD..........DP.",
        "..PDD......DDP..",
        "...PPDDDDDDPP...",
        ".....PPPPPP.....",
        "................"
      ];
    } else {
      // Boss: Merge Conflict Dragon/Demon
      colors = {
        'R': '#dc2626',
        'D': '#7f1d1d',
        'H': '#f59e0b', // Horns
        'E': '#fef08a', // Yellow eyes
        'B': '#18181b'
      };
      matrix = [
        "..H........H....",
        "..HH......HH....",
        "...HRRRRRRH.....",
        "...RRRRRRRR.....",
        "..RREERRREERR...",
        "..RREERRREERR...",
        "..RRRRRRRRRR....",
        "...RRRRRRRR.....",
        "...DRRRRRRD.....",
        "..DDRRRRRRDD....",
        "..DDRRRRRRDD....",
        "...DRRRRRRD.....",
        "....DD..DD......",
        "....DD..DD......",
        "...DDD..DDD.....",
        "................"
      ];
    }

    const sprite = this.createPixelCanvas(matrix, colors, 2);
    this.cache.set(key, sprite);
    return sprite;
  }

  getChestSprite(isOpen = false) {
    const colors = {
      'W': '#b45309',
      'D': '#78350f',
      'G': '#fbbf24',
      'L': '#f59e0b',
      'S': '#fef08a'
    };

    const matrix = isOpen ? [
      "....WWWWWW......",
      "...WGGGGGGW.....",
      "..WDDDDDDDDW....",
      ".WSSSSSSSSSSW...",
      ".WDDDDDDDDDDW...",
      ".WGGGGGGGGGGW...",
      ".WDDDDDDDDDDW...",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................"
    ] : [
      "................",
      "................",
      "....WWWWWW......",
      "...WGGGGGGW.....",
      "..WDDDDDDDDW....",
      "..WDDGLLGDDW....",
      "..WDDGLLGDDW....",
      "..WDDDDDDDDW....",
      "..WDDDDDDDDW....",
      "..WGGGGGGGGW....",
      "..WDDDDDDDDW....",
      "...WWWWWWWW.....",
      "................",
      "................",
      "................",
      "................"
    ];

    return this.createPixelCanvas(matrix, colors, 2);
  }
}

window.spriteRenderer = new SpriteRenderer();
