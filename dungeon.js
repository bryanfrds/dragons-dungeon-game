// Procedural Dungeon Generator & Grid Pathfinding
const TILE_SIZE = 32;

const TILE = {
  EMPTY: 0,
  FLOOR: 1,
  WALL: 2,
  DOOR: 3,
  STAIRS: 4,
  CHEST: 5,
};

class DungeonGenerator {
  constructor(cols = 25, rows = 16) {
    this.cols = cols;
    this.rows = rows;
    this.grid = [];
    this.rooms = [];
    this.stairsPos = { x: 0, y: 0 };
    this.spawnPos = { x: 0, y: 0 };
    this.chests = [];
    this.torches = [];
  }

  generate(floorNumber = 1) {
    // Reset grid
    this.grid = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => TILE.WALL)
    );
    this.rooms = [];
    this.chests = [];
    this.torches = [];

    const numRooms = Math.min(4 + Math.floor(floorNumber / 2), 8);
    const minSize = 4;
    const maxSize = 8;

    for (let i = 0; i < 40 && this.rooms.length < numRooms; i++) {
      const w = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
      const h = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
      const x = Math.floor(Math.random() * (this.cols - w - 2)) + 1;
      const y = Math.floor(Math.random() * (this.rows - h - 2)) + 1;

      const newRoom = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };

      let overlaps = false;
      for (const room of this.rooms) {
        if (
          newRoom.x <= room.x + room.w + 1 &&
          newRoom.x + newRoom.w + 1 >= room.x &&
          newRoom.y <= room.y + room.h + 1 &&
          newRoom.y + newRoom.h + 1 >= room.y
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        this.carveRoom(newRoom);
        if (this.rooms.length > 0) {
          const prevRoom = this.rooms[this.rooms.length - 1];
          this.carveCorridor(prevRoom.cx, prevRoom.cy, newRoom.cx, newRoom.cy);
        }
        this.rooms.push(newRoom);
      }
    }

    if (this.rooms.length === 0) {
      // Fallback single large room
      const fallback = { x: 2, y: 2, w: this.cols - 4, h: this.rows - 4, cx: Math.floor(this.cols / 2), cy: Math.floor(this.rows / 2) };
      this.carveRoom(fallback);
      this.rooms.push(fallback);
    }

    // Set Spawn Room (Room 0)
    const spawnRoom = this.rooms[0];
    this.spawnPos = { x: spawnRoom.cx, y: spawnRoom.cy };

    // Set Stairs Room (Last Room)
    const endRoom = this.rooms[this.rooms.length - 1];
    this.stairsPos = { x: endRoom.cx, y: endRoom.cy };
    this.grid[this.stairsPos.y][this.stairsPos.x] = TILE.STAIRS;

    // Place Chests in other rooms
    for (let i = 1; i < this.rooms.length - 1; i++) {
      if (Math.random() < 0.7) {
        const r = this.rooms[i];
        const chestPos = { x: r.cx, y: r.cy };
        if (this.grid[chestPos.y][chestPos.x] === TILE.FLOOR) {
          this.grid[chestPos.y][chestPos.x] = TILE.CHEST;
          this.chests.push({ ...chestPos, opened: false });
        }
      }
    }

    // Place Torches on walls near floors
    for (const r of this.rooms) {
      this.torches.push({ x: r.x + 1, y: r.y, flicker: Math.random() * 10 });
      if (r.w > 5) {
        this.torches.push({ x: r.x + r.w - 2, y: r.y, flicker: Math.random() * 10 });
      }
    }

    return {
      grid: this.grid,
      rooms: this.rooms,
      spawnPos: this.spawnPos,
      stairsPos: this.stairsPos,
      chests: this.chests,
      torches: this.torches
    };
  }

  carveRoom(room) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
          this.grid[y][x] = TILE.FLOOR;
        }
      }
    }
  }

  carveCorridor(x1, y1, x2, y2) {
    let x = x1;
    let y = y1;
    while (x !== x2) {
      this.grid[y][x] = TILE.FLOOR;
      x += x < x2 ? 1 : -1;
    }
    while (y !== y2) {
      this.grid[y][x] = TILE.FLOOR;
      y += y < y2 ? 1 : -1;
    }
  }

  isWalkable(gx, gy) {
    if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) return false;
    const tile = this.grid[gy][gx];
    return tile === TILE.FLOOR || tile === TILE.STAIRS || tile === TILE.CHEST;
  }

  // BFS Pathfinding for AI Hero & Intelligent Monsters
  findPath(start, goal) {
    if (!this.isWalkable(goal.x, goal.y)) {
      // Find closest walkable adjacent tile
      const neighbors = [
        { x: goal.x + 1, y: goal.y },
        { x: goal.x - 1, y: goal.y },
        { x: goal.x, y: goal.y + 1 },
        { x: goal.x, y: goal.y - 1 }
      ].filter(n => this.isWalkable(n.x, n.y));
      if (neighbors.length > 0) goal = neighbors[0];
      else return [];
    }

    const queue = [{ x: start.x, y: start.y, path: [] }];
    const visited = new Set();
    visited.add(`${start.x},${start.y}`);

    while (queue.length > 0) {
      const current = queue.shift();

      if (current.x === goal.x && current.y === goal.y) {
        return current.path;
      }

      const dirs = [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 }
      ];

      for (const d of dirs) {
        const nx = current.x + d.x;
        const ny = current.y + d.y;
        const key = `${nx},${ny}`;

        if (this.isWalkable(nx, ny) && !visited.has(key)) {
          visited.add(key);
          queue.push({
            x: nx,
            y: ny,
            path: [...current.path, { x: nx, y: ny }]
          });
        }
      }
    }

    return [];
  }
}

window.DungeonGenerator = DungeonGenerator;
