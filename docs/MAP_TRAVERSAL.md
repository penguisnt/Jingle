# Map Traversal

Map Traversal is a roguelike twist on Jingle. Instead of guessing a random song anywhere on the map, you start on a single tile and expand outward by identifying songs in neighboring regions. It tests not just your music knowledge but your spatial awareness of which songs play *next to each other*.

![Map Traversal screenshot](traversal-screenshot.png)

## How to Play

1. **Start** — You spawn on a random map region. That tile is unlocked (shown in blue) and a song begins playing.
2. **Listen & guess** — The song belongs to one of the gold-outlined frontier regions (neighbors of your unlocked territory). Click the region where you think it plays.
3. **Correct guess** — The region turns blue (unlocked), your territory grows, the frontier updates, and a new song plays.
4. **Wrong guess** — You lose 1 life and the region you clicked turns red for that round so you don't click it again. The same song keeps playing.
5. **Shark drops** — Every 5 correct guesses a shark icon appears on a random frontier tile. If that tile happens to be the next correct answer, you heal 1 HP (capped at 10).
6. **Game over** — You lose when lives hit 0. The correct answer is revealed in green and the map pans to it. Your score is the number of tiles you unlocked.
7. **Win condition** — If you manage to unlock every reachable tile with no remaining frontier, you win.

### HUD

| Element | Meaning |
|---------|---------|
| Heart + `9/10` | Remaining lives out of 10 |
| `Tiles: 5` | Number of regions unlocked (your score) |
| Blue regions | Your unlocked territory |
| Gold outlines | Frontier — clickable regions where the current song might play |
| Red regions | Wrong guesses this round (disabled until next correct answer) |
| Shark icon | Food drop — land on it for +1 HP |
| Green region (game over) | The correct answer you missed |

## Implementation

### Region graph — `adjacency.ts`

The core data structure is a graph of song regions built from the GeoJSON polygon data that defines where each OSRS track plays on the map.

**Building regions:**
- The GeoJSON contains one feature per song, each with one or more polygons (the map tiles where it plays).
- Only surface-level polygons (`mapId === 0`) are used — underground areas and instances are excluded.
- Features are grouped by song name, and duplicate entries for the same song are merged.

**Splitting disconnected clusters:**
- Some songs play in multiple unconnected parts of the map (e.g. a track that plays near both the Digsite and Rellekka). These are split into separate regions using a union-find algorithm.
- Two polygons of the same song are considered connected if they share at least one vertex (corner touching counts here since they're the same song).

**Neighbor detection (edge overlap, not vertex sharing):**
- Two *different* song regions are neighbors only if their polygon edges overlap — sharing just a corner point does not count. This prevents diagonal-only connections that would feel wrong in gameplay.
- Detection works by sampling integer coordinate points along each polygon edge (excluding endpoints) and checking which regions share those points. This handles cases where two polygons share a collinear edge segment but have different vertex positions along it.

### Game state — `useTraversalLogic.ts`

A React hook that manages the full game loop:

- **State:** lives, unlocked region IDs, frontier region IDs, current target region, score, shark spawn state, correct streak counter.
- **`initGame()`** — Picks a random starting region (that has neighbors), computes the initial frontier, picks a random target from the frontier, returns the song name to play.
- **`handleRegionClick(regionId)`** — On correct guess: unlocks the region, recomputes the frontier, picks the next target, checks for shark healing, checks win condition. On wrong guess: decrements lives, marks the region as a wrong guess for the round, checks for game over.
- **`computeFrontier(unlockedIds)`** — Returns all region IDs that are neighbors of any unlocked region but aren't unlocked themselves.
- **Shark spawning** — Every `SHARK_INTERVAL` (5) correct guesses, a random frontier tile gets a shark. If you guess that tile correctly, you heal 1 HP.

### Map rendering — `TraversalMap.tsx`

Uses React Leaflet with the OSRS tile layer:

- **Unlocked regions** — Blue filled polygons (`fillOpacity: 0.4`, non-interactive).
- **Frontier regions** — Gold outlined polygons (clickable). Turn red with higher opacity when guessed wrong.
- **Shark marker** — A Leaflet `Marker` with a shark icon placed at the centroid of the shark region's first polygon.
- **Camera** — Pans to the starting region on init, pans to the correct answer on game over.
- **Game over overlay** — The correct answer region is rendered as a green polygon.

### Audio

Songs are loaded from `cdn.mahloola.com` via the shared `playSong()` utility. The song name from the target region is URL-encoded and fetched as an MP3. No backend API is needed for Map Traversal.

### Key files

| File | Role |
|------|------|
| `src/components/MapTraversal.tsx` | Top-level component, wires up hooks and UI |
| `src/hooks/useTraversalLogic.ts` | Game state machine and logic |
| `src/utils/adjacency.ts` | Region graph construction and neighbor queries |
| `src/components/TraversalMap.tsx` | Leaflet map rendering for traversal mode |
| `src/data/GeoJSON.ts` | Source polygon data for all song regions |
