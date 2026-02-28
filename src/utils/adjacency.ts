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

  // Build coordinate -> region ID lookup with rounding for near-miss vertices
  const coordToRegionIds = new Map<string, Set<number>>();

  for (const region of regions) {
    for (const polygon of region.polygons) {
      for (const coord of polygon) {
        const key = `${roundCoord(coord[0])},${roundCoord(coord[1])}`;
        if (!coordToRegionIds.has(key)) {
          coordToRegionIds.set(key, new Set());
        }
        coordToRegionIds.get(key)!.add(region.id);
      }
    }
  }

  // Calculate neighbors — require at least 2 shared coordinates (a shared edge, not just a corner)
  for (const region of regions) {
    const sharedCounts = new Map<number, number>();

    for (const polygon of region.polygons) {
      for (const coord of polygon) {
        const key = `${roundCoord(coord[0])},${roundCoord(coord[1])}`;
        const sharing = coordToRegionIds.get(key);
        if (sharing) {
          for (const neighborId of sharing) {
            if (neighborId !== region.id) {
              sharedCounts.set(neighborId, (sharedCounts.get(neighborId) ?? 0) + 1);
            }
          }
        }
      }
    }

    region.neighborIds = Array.from(sharedCounts.entries())
      .filter(([, count]) => count >= 2)
      .map(([id]) => id)
      .sort((a, b) => a - b);
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
