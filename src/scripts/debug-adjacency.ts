import geojsondata from '../data/GeoJSON';

function extractSongName(title: string): string {
  const match = title.match(/>(.*?)</);
  return match ? match[1].trim() : title;
}
function roundCoord(val: number): number {
  return Math.round(val);
}

const features = geojsondata.features;
const songMap = new Map<string, { polygons: number[][][] }>();

for (const feature of features) {
  const songName = extractSongName(feature.properties?.title ?? '');
  const surfaceGeometries = feature.convertedGeometry.filter((g) => g.mapId === 0);
  if (surfaceGeometries.length === 0) continue;
  const polygons = surfaceGeometries.map((g) => g.coordinates);
  if (songMap.has(songName)) {
    songMap.get(songName)!.polygons.push(...polygons);
  } else {
    songMap.set(songName, { polygons });
  }
}

function getCoordSet(polygons: number[][][]) {
  const s = new Set<string>();
  for (const poly of polygons) {
    for (const c of poly) {
      s.add(`${roundCoord(c[0])},${roundCoord(c[1])}`);
    }
  }
  return s;
}

// Print coords for these songs
for (const name of ['Medieval', 'Expanse', 'Doorways']) {
  const data = songMap.get(name);
  if (!data) { console.log(name + ': NOT FOUND'); continue; }
  console.log(`\n=== ${name} (${data.polygons.length} polygons) ===`);
  for (const poly of data.polygons) {
    const rounded = poly.map((c) => `[${roundCoord(c[0])},${roundCoord(c[1])}]`);
    console.log('  Coords:', rounded.join(' '));
  }
}

const medievalCoords = getCoordSet(songMap.get('Medieval')!.polygons);
const expanseCoords = getCoordSet(songMap.get('Expanse')!.polygons);
const doorwaysCoords = getCoordSet(songMap.get('Doorways')!.polygons);

const medievalExpanse = [...medievalCoords].filter(c => expanseCoords.has(c));
const medievalDoorways = [...medievalCoords].filter(c => doorwaysCoords.has(c));

console.log('\n=== Shared coords Medieval↔Expanse:', medievalExpanse.length, '===');
console.log(medievalExpanse);
console.log('\n=== Shared coords Medieval↔Doorways:', medievalDoorways.length, '===');
console.log(medievalDoorways);

// Also show raw (unrounded) coords for the shared ones
function getRawCoords(polygons: number[][][]) {
  const coords: number[][] = [];
  for (const poly of polygons) {
    for (const c of poly) coords.push(c);
  }
  return coords;
}

console.log('\n=== Raw Medieval coords near shared points ===');
const medievalRaw = getRawCoords(songMap.get('Medieval')!.polygons);
const doorwaysRaw = getRawCoords(songMap.get('Doorways')!.polygons);
const expanseRaw = getRawCoords(songMap.get('Expanse')!.polygons);

// Find near-miss coords between Medieval and Doorways (within 2 units)
console.log('\n=== Near-miss Medieval↔Doorways (within 2 units) ===');
for (const mc of medievalRaw) {
  for (const dc of doorwaysRaw) {
    const dx = Math.abs(mc[0] - dc[0]);
    const dy = Math.abs(mc[1] - dc[1]);
    if (dx <= 2 && dy <= 2 && (dx > 0 || dy > 0)) {
      console.log(`  Medieval [${mc}] ~ Doorways [${dc}] (dx=${dx}, dy=${dy})`);
    }
  }
}
