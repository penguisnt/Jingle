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

export interface TraversalRegion {
  id: number;
  songName: string;
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
  const regions: TraversalRegion[] = [];
  let id = 1;
  for (const [songName, data] of songMap) {
    const clusters = splitIntoClusters(data.polygons);
    for (const cluster of clusters) {
      regions.push({
        id: id++,
        songName,
        polygons: cluster,
        neighborIds: [],
      });
    }
  }

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

  for (const region of regions) {
    for (const polygon of region.polygons) {
      for (let i = 0; i < polygon.length; i++) {
        const curr = polygon[i];
        const next = polygon[(i + 1) % polygon.length];
        addEdgePoints(region.id, curr[0], curr[1], next[0], next[1]);
      }
    }
  }

  // Two regions are neighbors if they share at least one interior edge point
  for (const region of regions) {
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

  return regions;
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
