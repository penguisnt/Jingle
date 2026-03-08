import L, { CRS, Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polygon, TileLayer, useMap } from 'react-leaflet';
import { CENTER_COORDINATES } from '../constants/defaults';
import { TraversalGameState } from '../hooks/useTraversalLogic';
import { getRegionById } from '../utils/adjacency';
import { switchLayer } from '../utils/map-utils';

interface TraversalMapProps {
  gameState: TraversalGameState;
  wrongGuessRegionIds: Set<number>;
  onRegionClick: (regionId: number) => void;
}

export default function TraversalMapWrapper(props: TraversalMapProps) {
  return (
    <MapContainer
      center={CENTER_COORDINATES}
      zoom={1}
      minZoom={0}
      maxZoom={3}
      style={{ height: '100dvh', width: '100%', backgroundColor: 'black' }}
      maxBoundsViscosity={0.5}
      crs={CRS.Simple}
    >
      <TraversalMap {...props} />
    </MapContainer>
  );
}

function coordsToLatLngs(coords: number[][]): L.LatLngExpression[] {
  return coords.map(([x, y]) => [y, x] as L.LatLngExpression);
}

function TraversalMap({ gameState, wrongGuessRegionIds, onRegionClick }: TraversalMapProps) {
  const map = useMap();
  const tileLayerRef = useRef<L.TileLayer>(null);

  // Initialize tile layer on mount
  useEffect(() => {
    setTimeout(() => {
      if (map && tileLayerRef.current) {
        switchLayer(map, tileLayerRef.current, 0);
      }
    }, 0);
  }, [map]);

  // Pan to the starting region when game initializes
  useEffect(() => {
    if (gameState.unlockedRegionIds.length === 1) {
      const startRegion = getRegionById(gameState.unlockedRegionIds[0]);
      if (startRegion && startRegion.polygons[0]) {
        const coords = startRegion.polygons[0];
        const centerX = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        const centerY = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        map.setView([centerY, centerX], 2);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.unlockedRegionIds.length, map]);

  // Pan to the correct answer on game over
  useEffect(() => {
    if (gameState.status === 'lost' && gameState.targetRegionId != null) {
      const target = getRegionById(gameState.targetRegionId);
      if (target && target.polygons[0]) {
        const coords = target.polygons[0];
        const centerX = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        const centerY = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        map.panTo([centerY, centerX]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.status, map]);

  // Build multi-polygon data grouped by region
  const unlockedRegions = useMemo(() => {
    const regions: { regionId: number; positions: L.LatLngExpression[][] }[] = [];
    for (const regionId of gameState.unlockedRegionIds) {
      const region = getRegionById(regionId);
      if (!region) continue;
      regions.push({
        regionId,
        positions: region.polygons.map((poly) => coordsToLatLngs(poly)),
      });
    }
    return regions;
  }, [gameState.unlockedRegionIds]);

  // Build multi-polygon data grouped by region for frontier
  const frontierRegions = useMemo(() => {
    const regions: { regionId: number; positions: L.LatLngExpression[][] }[] = [];
    for (const regionId of gameState.frontierRegionIds) {
      const region = getRegionById(regionId);
      if (!region) continue;
      regions.push({
        regionId,
        positions: region.polygons.map((poly) => coordsToLatLngs(poly)),
      });
    }
    return regions;
  }, [gameState.frontierRegionIds]);

  return (
    <>
      {/* Unlocked regions - filled blue, one Polygon per song region */}
      {unlockedRegions.map((region) => (
        <Polygon
          key={`unlocked-${region.regionId}`}
          positions={region.positions}
          pathOptions={{
            color: '#0d6efd',
            fillColor: '#0d6efd',
            weight: 2,
            fillOpacity: 0.4,
            interactive: false,
          }}
        />
      ))}

      {/* Correct answer region - shown in green on game over */}
      {gameState.status === 'lost' && gameState.targetRegionId != null && (() => {
        const target = getRegionById(gameState.targetRegionId);
        if (!target) return null;
        return (
          <Polygon
            positions={target.polygons.map((poly) => coordsToLatLngs(poly))}
            pathOptions={{
              color: '#00ff00',
              fillColor: '#00ff00',
              weight: 3,
              fillOpacity: 0.5,
              interactive: false,
            }}
          />
        );
      })()}

      {/* Frontier regions - clickable gold/yellow, or red if already guessed wrong this round */}
      {frontierRegions.map((region) => {
        const isWrongGuess = wrongGuessRegionIds.has(region.regionId);
        return (
          <Polygon
            key={`frontier-${region.regionId}`}
            positions={region.positions}
            pathOptions={{
              color: isWrongGuess ? '#aa0000' : '#ffc107',
              fillColor: isWrongGuess ? '#aa0000' : '#ffc107',
              weight: 2,
              fillOpacity: isWrongGuess ? 0.4 : 0.25,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                if (gameState.status === 'playing' && !isWrongGuess) {
                  onRegionClick(region.regionId);
                }
              },
            }}
          />
        );
      })}

      {/* Shark food drops on frontier regions */}
      {gameState.status === 'playing' && gameState.sharkRegionIds.map((sharkId) => {
        const sharkRegion = getRegionById(sharkId);
        if (!sharkRegion || !sharkRegion.polygons[0]) return null;
        const coords = sharkRegion.polygons[0];
        const centerX = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        const centerY = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        return (
          <Marker
            key={`shark-${sharkId}`}
            position={[centerY, centerX]}
            icon={new Icon({
              iconUrl: '/assets/osrs_shark.png',
              iconSize: [29, 30],
              iconAnchor: [14, 15],
            })}
            interactive={false}
          />
        );
      })}

      <TileLayer
        ref={tileLayerRef}
        url="placeholder"
        minZoom={-1}
        maxZoom={3}
        maxNativeZoom={2}
        tileSize={256}
      />
    </>
  );
}
