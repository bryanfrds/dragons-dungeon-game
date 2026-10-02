// Draws a floor's walls and stone once into an offscreen canvas, so the game
// only has to copy one image per frame. Pixel-art style, all done in code.

/** A stable pseudo-random number in [0, 1) for a tile, so a floor never flickers. */
function tileNoise(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const TILE_COLORS = {
  rock: '#0a0c12',            // solid rock, far from any room
  brick: '#3b3654',           // wall bricks
  brickDark: '#2d2942',
  mortar: '#1c1a2b',
  brickTop: '#4d4769',        // the lit top edge of a brick
  wallFace: '#24203a',        // the front of a wall that faces down into a room
  floor: [38, 44, 59],        // stone, RGB so each slab can vary a little
  floorLine: '#1b1f2b',
  moss: '#2f4a3a',
};

function buildFloorLayer(grid, tileSize, seed) {
  const rows = grid.length, cols = grid[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = cols * tileSize;
  canvas.height = rows * tileSize;
  const ctx = canvas.getContext('2d');
  const T = tileSize;
  const open = (x, y) => y >= 0 && y < rows && x >= 0 && x < cols && grid[y][x] !== TILE.WALL;
  const nearOpen = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (open(x + dx, y + dy)) return true;
    return false;
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * T, py = y * T;
      const n = tileNoise(x, y, seed);
      if (grid[y][x] !== TILE.WALL) {
        // Stone slab: a slightly different shade per tile, a dark seam, and now
        // and then a crack or a fleck of moss.
        const k = 0.9 + n * 0.2;
        const [r, g, b] = TILE_COLORS.floor.map(v => Math.round(v * k));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = TILE_COLORS.floorLine;
        ctx.fillRect(px, py + T - 2, T, 2);
        ctx.fillRect(px + T - 2, py, 2, T);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(px, py, T - 2, 2);
        if (n > 0.86) {
          ctx.fillStyle = TILE_COLORS.floorLine;
          ctx.fillRect(px + 8, py + 10, 10, 2);
          ctx.fillRect(px + 16, py + 12, 2, 6);
        } else if (n < 0.08) {
          ctx.fillStyle = TILE_COLORS.moss;
          ctx.fillRect(px + 6, py + 20, 4, 2);
          ctx.fillRect(px + 10, py + 18, 2, 2);
        }
        continue;
      }
      if (!nearOpen(x, y)) {
        ctx.fillStyle = TILE_COLORS.rock;
        ctx.fillRect(px, py, T, T);
        continue;
      }
      // Brick wall: rows of bricks, every other row offset by half a brick.
      ctx.fillStyle = TILE_COLORS.mortar;
      ctx.fillRect(px, py, T, T);
      const bh = 8, bw = 16;
      for (let row = 0; row < T / bh; row++) {
        const offset = (row + y * (T / bh)) % 2 ? bw / 2 : 0;
        for (let bx = -offset; bx < T; bx += bw) {
          const shade = tileNoise(x * 7 + Math.round(bx), y * 5 + row, seed) > 0.5;
          const left = Math.max(0, bx) + 1, right = Math.min(T, bx + bw) - 1;
          if (right <= left) continue;
          ctx.fillStyle = shade ? TILE_COLORS.brick : TILE_COLORS.brickDark;
          ctx.fillRect(px + left, py + row * bh + 1, right - left, bh - 2);
          ctx.fillStyle = TILE_COLORS.brickTop;
          ctx.fillRect(px + left, py + row * bh + 1, right - left, 1);
        }
      }
      // A wall with a room below it shows its front face, which gives the room
      // some depth instead of looking like a flat grid.
      if (open(x, y + 1)) {
        ctx.fillStyle = TILE_COLORS.wallFace;
        ctx.fillRect(px, py + T - 10, T, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(px, py + T - 3, T, 3);
      }
    }
  }
  return canvas;
}

if (typeof window !== 'undefined') Object.assign(window, { buildFloorLayer, tileNoise });
