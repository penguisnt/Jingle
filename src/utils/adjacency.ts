/**
 * Adjacency data for the Map Traversal game mode.
 *
 * Builds a graph of surface song regions and their neighbors from GeoJSON polygon data.
 * Precomputed lazily on first access and cached for the session.
 *
 * Key design decisions:
 *
 * 1. **Edge-based neighbor detection (not vertex-based)**
 *    Two regions are neighbors only if their polygon edges overlap — sharing just a
 *    corner point does NOT count. This is detected by sampling integer points along each
 *    polygon edge (excluding endpoints) and checking for overlap. This handles cases where
 *    polygons share a collinear edge segment but have different vertices along it
 *    (e.g. Medieval [3268,3456]->[3328,3456] overlaps Doorways [3264,3456]->[3328,3456]
 *    but they only share the single vertex [3328,3456]).
 *
 * 2. **Disconnected cluster splitting**
 *    Songs that appear in multiple disconnected map areas (e.g. a song playing near both
 *    Digsite and Rellekka) are split into separate regions. Intra-song clustering uses
 *    shared vertices (corners count) since tiles of the same song should be grouped
 *    together even if they only touch at corners.
 */
import { Position } from 'geojson';
import geojsondata from '../data/GeoJSON';
import { decodeHTML } from './string-utils';

export interface PortLink {
  regionA: number;
  coordA: [number, number]; // [x, y] game coords — exact port location
  regionB: number;
  coordB: [number, number]; // [x, y] game coords — exact port location
}

export const PORT_LINKS: PortLink[] = [
  { regionA: 163, coordA: [2138, 3900], regionB: 137, coordB: [2224, 3796] }, // Isle of Everywhere ↔ The Galleon
  { regionA: 137, coordA: [2213, 3794], regionB: 252, coordB: [2621, 3696] }, // The Galleon ↔ Rellekka
  { regionA: 252, coordA: [2630, 3690], regionB: 112, coordB: [2581, 3848] }, // Rellekka ↔ Etceteria
  { regionA: 89, coordA: [2550, 3759], regionB: 252, coordB: [2619, 3685] }, // The Desolate Isle ↔ Rellekka
  { regionA: 229, coordA: [2421, 3780], regionB: 252, coordB: [2640, 3710] }, // Norse Code ↔ Rellekka
  { regionA: 322, coordA: [2312, 3780], regionB: 252, coordB: [2640, 3710] }, // Volcanic Vikings ↔ Rellekka
  { regionA: 90, coordA: [2277, 4035], regionB: 252, coordB: [2640, 3698] }, // The Desolate Isle ↔ Rellekka
  { regionA: 118, coordA: [2471, 3994], regionB: 252, coordB: [2619, 3685] }, // Exposed ↔ Rellekka
  { regionA: 151, coordA: [2659, 3989], regionB: 64, coordB: [2708, 3736] }, // Have an Ice Day ↔ Borderland
  { regionA: 191, coordA: [3362, 3448], regionB: 245, coordB: [3724, 3807] }, // Lullaby ↔ Preservation
  { regionA: 235, coordA: [3704, 3488], regionB: 100, coordB: [3792, 3562] }, // The Other Side ↔ Dragontooth Island
  { regionA: 235, coordA: [3710, 3497], regionB: 158, coordB: [3684, 2953] }, // The Other Side ↔ In the Brine
  { regionA: 158, coordA: [3684, 2953], regionB: 348, coordB: [3786, 2829] }, // In the Brine ↔ Zombiism
  { regionA: 269, coordA: [3038, 3193], regionB: 231, coordB: [2661, 2678] }, // Sea Shanty 2 ↔ Null and Void
  { regionA: 204, coordA: [2892, 2727], regionB: 161, coordB: [2803, 2703] }, // Marooned ↔ Island Life
  { regionA: 204, coordA: [2892, 2727], regionB: 141, coordB: [2466, 3495] }, // Marooned ↔ Gnome King
  { regionA: 269, coordA: [3048, 3234], regionB: 53, coordB: [2834, 3335] }, // Sea Shanty 2 ↔ Background
  { regionA: 99, coordA: [1824, 3691], regionB: 269, coordB: [3056, 3245] }, // Down by the Docks ↔ Sea Shanty 2
  { regionA: 233, coordA: [2578, 2840], regionB: 353, coordB: [2910, 3227] }, // On the Shore ↔ Emperor
  { regionA: 140, coordA: [1369, 3641], regionB: 131, coordB: [1406, 3612] }, // Gill Bill ↔ The Forests of Shayzien
  { regionA: 23, coordA: [1494, 2985], regionB: 27, coordB: [1444, 2977] }, // Varlamore's Sunset ↔ Peace and Prosperity / Isle of Serenity
];

export function getPortLinksForRegion(regionId: number): PortLink[] {
  return PORT_LINKS.filter(
    (link) => link.regionA === regionId || link.regionB === regionId,
  );
}

export interface TraversalRegion {
  id: number;
  songNames: string[];
  polygons: Position[][]; // all mapId===0 polygons for this song
  neighborIds: number[];
}

let cachedRegions: TraversalRegion[] | null = null;
let regionById: Map<number, TraversalRegion> | null = null;

function extractSongName(title: string): string {
  const match = title.match(/>(.*?)</);
  if (!match) return title;
  return decodeHTML(match[1])?.trim() ?? title;
}

function roundCoord(val: number): number {
  return Math.round(val);
}

// Split a song's polygons into spatially connected clusters.
// Uses >= 1 shared coord (corners count) since these are tiles of the SAME song.
// The stricter >= 2 rule is only for inter-region neighbor detection.
function splitIntoClusters(polygons: Position[][]): Position[][][] {
  const polyCoordSets: Set<string>[] = polygons.map((poly) => {
    const keys = new Set<string>();
    for (const coord of poly) {
      keys.add(`${roundCoord(coord[0])},${roundCoord(coord[1])}`);
    }
    return keys;
  });

  // Union-Find
  const parent = polygons.map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number) {
    parent[find(a)] = find(b);
  }

  for (let i = 0; i < polygons.length; i++) {
    for (let j = i + 1; j < polygons.length; j++) {
      for (const key of polyCoordSets[i]) {
        if (polyCoordSets[j].has(key)) {
          union(i, j);
          break;
        }
      }
    }
  }

  const groups = new Map<number, Position[][]>();
  for (let i = 0; i < polygons.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(polygons[i]);
  }

  return Array.from(groups.values());
}

// Region IDs excluded from traversal because they are fully contained inside other
// regions with no shared edges, making them unreachable.
const EXCLUDED_REGION_IDS = new Set([
  2,   // "Scorching Horizon / ..." — duplicate cluster inside region 1 (same songs)
  14,  // "The City of Sun / ..." — duplicate cluster inside region 13 (same songs)
  21,  // "Ready for the Hunt" — inset inside region 1 "Scorching Horizon / ..."
  98,  // "Doorways" — duplicate cluster inside region 97 (same song)
  256, // "Rose" — inset inside region 355 "Getting Down to Business"
  281, // "The Waiting Game" — inset inside region 97 "Doorways"
  324, // "The Waiting Game" — duplicate cluster inside region 97 "Doorways"
  356, // "Getting Down to Business" — duplicate cluster inside region 355 (same song)
]);

// Manual adjacency overrides for inset regions that are playable but have no
// shared edges with their containing region (edge detection can't find them).
// Each pair [a, b] adds a bidirectional neighbor relationship.
const ADJACENCY_OVERRIDES: [number, number][] = [
  [12, 13],   // "Are You Not Entertained" inset inside "The City of Sun / Prospering Fortune"
  [125, 355], // "A Farmer's Grind" inset inside "Getting Down to Business"
  [148, 355], // "Grow Grow Grow" inset inside "Getting Down to Business"
  [154, 355], // "Hoe Down" inset inside "Getting Down to Business"
];

function buildRegions(): TraversalRegion[] {
  const features = geojsondata.features;

  // Group features by song name, only considering mapId===0 geometries
  const songMap = new Map<
    string,
    { featureIndex: number; polygons: Position[][] }
  >();

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const songName = extractSongName(feature.properties?.title ?? '');

    // Only include surface (mapId===0) polygons
    const surfaceGeometries = feature.convertedGeometry.filter(
      (geom) => geom.mapId === 0,
    );
    if (surfaceGeometries.length === 0) continue;

    const polygons = surfaceGeometries.map((geom) => geom.coordinates as Position[]);

    if (songMap.has(songName)) {
      // Merge polygons from duplicate song entries
      songMap.get(songName)!.polygons.push(...polygons);
    } else {
      songMap.set(songName, { featureIndex: i, polygons });
    }
  }

  // Assign IDs — split disconnected polygon clusters into separate regions
  // so that e.g. a song playing near both Digsite and Rellekka becomes two regions
  let premergeRegions: TraversalRegion[] = [];
  let id = 1;
  for (const [songName, data] of songMap) {
    const clusters = splitIntoClusters(data.polygons);
    for (const cluster of clusters) {
      premergeRegions.push({
        id: id++,
        songNames: [songName],
        polygons: cluster,
        neighborIds: [],
      });
    }
  }

  // Merge regions with identical polygon geometry (multiple songs sharing the same area)
  function polygonFingerprint(polygons: Position[][]): string {
    return polygons
      .map((poly) =>
        poly.map((c) => `${roundCoord(c[0])},${roundCoord(c[1])}`).join(';'),
      )
      .sort()
      .join('|');
  }

  const fingerprintMap = new Map<string, number>(); // fingerprint -> index in regions
  const regions: TraversalRegion[] = [];
  for (const region of premergeRegions) {
    const fp = polygonFingerprint(region.polygons);
    const existingIdx = fingerprintMap.get(fp);
    if (existingIdx !== undefined) {
      // Merge song names into existing region
      regions[existingIdx].songNames.push(...region.songNames);
    } else {
      fingerprintMap.set(fp, regions.length);
      regions.push(region);
    }
  }

  const mergedCount = premergeRegions.length - regions.length;
  if (mergedCount > 0) {
    console.log(`[ADJ] Merged ${mergedCount} duplicate-polygon regions. ${premergeRegions.length} → ${regions.length}`);
    for (const r of regions) {
      if (r.songNames.length > 1) {
        console.log(`[ADJ]   Region ${r.id}: ${r.songNames.join(', ')}`);
      }
    }
  }

  // Remove excluded regions (unreachable inset regions — see EXCLUDED_REGION_IDS)
  const filteredRegions = regions.filter((r) => !EXCLUDED_REGION_IDS.has(r.id));

  // Build edge-point -> region ID lookup.
  // Sample integer points along each edge so that collinear overlapping edges
  // (e.g. Medieval [3268,3456]->[3328,3456] overlapping Doorways [3264,3456]->[3328,3456])
  // produce shared points even when vertices don't match.
  const edgePointToRegionIds = new Map<string, Set<number>>();

  function addEdgePoints(regionId: number, x1: number, y1: number, x2: number, y2: number) {
    const rx1 = roundCoord(x1), ry1 = roundCoord(y1);
    const rx2 = roundCoord(x2), ry2 = roundCoord(y2);
    const dx = rx2 - rx1, dy = ry2 - ry1;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) return;

    // Sample points along the edge at unit intervals (skip endpoints to avoid corner-only matches)
    for (let s = 1; s < steps; s++) {
      const px = Math.round(rx1 + (dx * s) / steps);
      const py = Math.round(ry1 + (dy * s) / steps);
      const key = `${px},${py}`;
      if (!edgePointToRegionIds.has(key)) {
        edgePointToRegionIds.set(key, new Set());
      }
      edgePointToRegionIds.get(key)!.add(regionId);
    }
  }

  for (const region of filteredRegions) {
    for (const polygon of region.polygons) {
      for (let i = 0; i < polygon.length; i++) {
        const curr = polygon[i];
        const next = polygon[(i + 1) % polygon.length];
        addEdgePoints(region.id, curr[0], curr[1], next[0], next[1]);
      }
    }
  }

  // Two regions are neighbors if they share at least one interior edge point
  for (const region of filteredRegions) {
    const neighborSet = new Set<number>();

    for (const polygon of region.polygons) {
      for (let i = 0; i < polygon.length; i++) {
        const curr = polygon[i];
        const next = polygon[(i + 1) % polygon.length];
        const rx1 = roundCoord(curr[0]), ry1 = roundCoord(curr[1]);
        const rx2 = roundCoord(next[0]), ry2 = roundCoord(next[1]);
        const dx = rx2 - rx1, dy = ry2 - ry1;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        if (steps === 0) continue;

        for (let s = 1; s < steps; s++) {
          const px = Math.round(rx1 + (dx * s) / steps);
          const py = Math.round(ry1 + (dy * s) / steps);
          const key = `${px},${py}`;
          const sharing = edgePointToRegionIds.get(key);
          if (sharing) {
            for (const neighborId of sharing) {
              if (neighborId !== region.id) {
                neighborSet.add(neighborId);
              }
            }
          }
        }
      }
    }

    region.neighborIds = Array.from(neighborSet).sort((a, b) => a - b);
  }

  // Apply manual adjacency overrides (bidirectional)
  const regionLookup = new Map(filteredRegions.map((r) => [r.id, r]));
  for (const [a, b] of ADJACENCY_OVERRIDES) {
    const ra = regionLookup.get(a);
    const rb = regionLookup.get(b);
    if (ra && rb) {
      if (!ra.neighborIds.includes(b)) ra.neighborIds.push(b);
      if (!rb.neighborIds.includes(a)) rb.neighborIds.push(a);
      ra.neighborIds.sort((x, y) => x - y);
      rb.neighborIds.sort((x, y) => x - y);
    }
  }

  // Apply port link adjacency (bidirectional, same as overrides)
  for (const link of PORT_LINKS) {
    const ra = regionLookup.get(link.regionA);
    const rb = regionLookup.get(link.regionB);
    if (ra && rb) {
      if (!ra.neighborIds.includes(link.regionB)) ra.neighborIds.push(link.regionB);
      if (!rb.neighborIds.includes(link.regionA)) rb.neighborIds.push(link.regionA);
      ra.neighborIds.sort((x, y) => x - y);
      rb.neighborIds.sort((x, y) => x - y);
    }
  }

  // === DEBUG LOGGING ===
  const DEBUG_SONGS = ["Varlamore's Sunset", "Scorching Horizon", "The Undying Light", "Creatures of Varlamore"];
  for (const region of filteredRegions) {
    if (DEBUG_SONGS.some((s) => region.songNames.some((sn) => sn.includes(s)))) {
      const neighbors = region.neighborIds.map((nId) => {
        const n = filteredRegions.find((r) => r.id === nId);
        return `${nId}:${n?.songNames.join('/') ?? '?'}`;
      });
      console.log(`[ADJ DEBUG] Region ${region.id} "${region.songNames.join(', ')}"`);;
      console.log(`  Polygons: ${region.polygons.length}`);
      for (const poly of region.polygons) {
        console.log(`  Polygon vertices (${poly.length}):`);
        for (let i = 0; i < poly.length; i++) {
          const curr = poly[i];
          const next = poly[(i + 1) % poly.length];
          const rx1 = roundCoord(curr[0]), ry1 = roundCoord(curr[1]);
          const rx2 = roundCoord(next[0]), ry2 = roundCoord(next[1]);
          const dx = rx2 - rx1, dy = ry2 - ry1;
          const steps = Math.max(Math.abs(dx), Math.abs(dy));
          const sampledCount = Math.max(0, steps - 1);
          console.log(`    [${rx1},${ry1}] -> [${rx2},${ry2}]  steps=${steps}  samples=${sampledCount}${sampledCount === 0 && steps > 0 ? ' ⚠️ INVISIBLE EDGE' : ''}`);
        }
      }
      console.log(`  Neighbors (${region.neighborIds.length}): ${neighbors.join(', ') || 'NONE'}`);
    }
  }

  // Log regions with 0 or 1 neighbors as potential issues
  const lowNeighborRegions = filteredRegions.filter((r) => r.neighborIds.length <= 1);
  if (lowNeighborRegions.length > 0) {
    console.log(`[ADJ DEBUG] Regions with 0-1 neighbors (${lowNeighborRegions.length}):`);
    for (const r of lowNeighborRegions) {
      const totalEdges = r.polygons.reduce((sum, poly) => sum + poly.length, 0);
      const invisibleEdges = r.polygons.reduce((sum, poly) => {
        let count = 0;
        for (let i = 0; i < poly.length; i++) {
          const curr = poly[i];
          const next = poly[(i + 1) % poly.length];
          const dx = roundCoord(next[0]) - roundCoord(curr[0]);
          const dy = roundCoord(next[1]) - roundCoord(curr[1]);
          const steps = Math.max(Math.abs(dx), Math.abs(dy));
          if (steps === 1) count++;
        }
        return sum + count;
      }, 0);
      console.log(`  ${r.id} "${r.songNames.join(', ')}" — ${r.neighborIds.length} neighbors, ${totalEdges} edges (${invisibleEdges} invisible/1-step)`);
    }
  }
  // === END DEBUG LOGGING ===

  return filteredRegions;
}

function ensureBuilt() {
  if (!cachedRegions) {
    cachedRegions = buildRegions();
    regionById = new Map(cachedRegions.map((r) => [r.id, r]));
  }
}

export function getSurfaceRegions(): TraversalRegion[] {
  ensureBuilt();
  return cachedRegions!;
}

export function getNeighborIds(regionId: number): number[] {
  ensureBuilt();
  return regionById!.get(regionId)?.neighborIds ?? [];
}

export function getRegionById(regionId: number): TraversalRegion | undefined {
  ensureBuilt();
  return regionById!.get(regionId);
}
