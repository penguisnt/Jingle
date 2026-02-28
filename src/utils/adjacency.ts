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

  // Assign stable IDs and build regions
  const regions: TraversalRegion[] = [];
  let id = 1;
  for (const [songName, data] of songMap) {
    regions.push({
      id: id++,
      songName,
      polygons: data.polygons,
      neighborIds: [],
    });
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
