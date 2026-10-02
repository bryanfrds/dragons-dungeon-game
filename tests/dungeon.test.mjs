// Floor generation checks. Run with: node --test tests/*.test.mjs
// dungeon.js is a plain browser script, so it's loaded into a sandbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../dungeon.js', import.meta.url), 'utf8') +
  '\nthis.TILE = TILE;', ctx);
const { TILE } = ctx;
const { DungeonGenerator } = ctx.window;

// Many floors, in both the normal and the ?portrait shape, since layouts are random.
const floors = [];
for (const [cols, rows] of [[25, 16], [16, 25]]) {
  for (let floor = 1; floor <= 150; floor++) {
    const gen = new DungeonGenerator(cols, rows);
    floors.push({ gen, cols, rows, floor, d: gen.generate(floor) });
  }
}

test('every floor fits its grid and has at least one room', () => {
  for (const { d, cols, rows } of floors) {
    assert.equal(d.grid.length, rows);
    assert.ok(d.grid.every(row => row.length === cols));
    assert.ok(d.rooms.length >= 1);
  }
});

test('the hero starts on a walkable tile, and the stairs are on the map', () => {
  for (const { gen, d } of floors) {
    assert.ok(gen.isWalkable(d.spawnPos.x, d.spawnPos.y));
    assert.equal(d.grid[d.stairsPos.y][d.stairsPos.x], TILE.STAIRS);
  }
});

test('the stairs and every chest can be reached from the start', () => {
  for (const { gen, d, floor } of floors) {
    const same = (a, b) => a.x === b.x && a.y === b.y;
    for (const goal of [d.stairsPos, ...d.chests]) {
      if (same(goal, d.spawnPos)) continue;
      assert.ok(gen.findPath(d.spawnPos, goal).length > 0, `floor ${floor}: no route to ${goal.x},${goal.y}`);
    }
  }
});

test('a path is a chain of single orthogonal steps over walkable tiles', () => {
  for (const { gen, d } of floors.slice(0, 40)) {
    let prev = d.spawnPos;
    for (const step of gen.findPath(d.spawnPos, d.stairsPos)) {
      assert.equal(Math.abs(step.x - prev.x) + Math.abs(step.y - prev.y), 1);
      assert.ok(gen.isWalkable(step.x, step.y));
      prev = step;
    }
  }
});
