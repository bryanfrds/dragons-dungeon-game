# ⚔️ Pixel Dungeon: Auto-Play Bug Slayer RPG

A retro pixel-art dungeon crawler game built for developers to watch AI auto-grind levels, hunt bugs, and collect loot while waiting for builds, tasks, or AI processes to finish.

![Pixel Dungeon](https://img.shields.io/badge/Genre-Auto--RPG%20%2F%20Roguelike-purple)
![Tech](https://img.shields.io/badge/Tech-HTML5%20Canvas%20%7C%20Web%20Audio%20API-blue)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(Pure%20Vanilla)-success)

---

## 🎮 Features

- 🤖 **Smart Auto-Play AI**: Automatically explores procedural rooms, pathfinds using BFS, prioritizes bug targets, drinks potions when low on HP, and casts abilities.
- 🕹️ **Instant Manual Takeover**: Seamlessly switch between Auto-Play and manual keyboard control anytime (`WASD`, `Space`, `1-3` skill hotkeys).
- ⚔️ **RPG Progression & Loot System**:
  - Level up with scaling attack, defense, and HP stats.
  - Procedural loot drops with rarities: *Common*, *Rare*, *Epic*, *Legendary*.
  - Auto-equips superior swords, armor, and rings.
- 👾 **Themed Bug Enemies**:
  - `Syntax Error` (Slime)
  - `Memory Leak` (Ghost)
  - `Null Pointer` (Skeleton)
  - `Merge Conflict` (Boss Floor 5+)
- 🔊 **Synthesized 8-Bit Audio**: Built-in sound effects using the Web Audio API with zero external audio files.
- ⚡ **Speed Multiplier**: Fast-forward gameplay (`1x`, `2x`, `4x`) for quick auto-farming.

---

## 🚀 How to Run

### Option 1: Direct in Browser (Instant)
Simply open `index.html` in any web browser.

### Option 2: Local Dev Server
```bash
npx serve .
# or
python3 -m http.server 8000
```
Then visit `http://localhost:8000`.

---

## ⌨️ Controls

| Key | Action |
| --- | --- |
| **Tab** | Toggle AI Auto-Play on/off |
| **WASD / Arrows** | Manual Hero Movement |
| **Space** | Manual Sword Attack |
| **1** | Whirlwind (AoE Slash) |
| **2** | Iron Wall (Shield Buff) |
| **3** | Health Potion (Restores 50% HP) |

---

## 🛠️ Tech Stack
- **Engine**: HTML5 Canvas 2D
- **Audio**: Web Audio API Chiptune Synth
- **Design**: CSS Grid, Flexbox, Glassmorphism, Google Fonts (`Press Start 2P`, `Space Grotesk`)
