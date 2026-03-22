import L, { CRS, Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polygon, Polyline, TileLayer, useMap } from 'react-leaflet';
import { CENTER_COORDINATES } from '../constants/defaults';
import { TraversalGameState } from '../hooks/useTraversalLogic';
import { getRegionById, PORT_LINKS } from '../utils/adjacency';
import { switchLayer } from '../utils/map-utils';

interface TraversalMapProps {
  gameState: TraversalGameState;
  wrongGuessRegionIds: Set<number>;
  eliminatedRegionIds: Set<number>;
  onRegionClick: (regionId: number) => void;
  onRegionRightClick: (regionId: number) => void;
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

function PortLinkPolyline({ positions, animate }: { positions: L.LatLngExpression[]; animate: boolean }) {
  const ref = useCallback((el: L.Polyline | null) => {
    if (!el || !animate) return;
    // Defer to ensure SVG element exists in DOM
    queueMicrotask(() => {
      el.getElement()?.classList.add('port-link-line');
    });
  }, [animate]);

  return (
    <Polyline
      ref={ref}
      positions={positions}
      pathOptions={{
        color: '#00e5ff',
        weight: 2,
        dashArray: animate ? '8 6' : undefined,
        className: animate ? 'port-link-line' : '',
      }}
    />
  );
}

function TraversalMap({ gameState, wrongGuessRegionIds, eliminatedRegionIds, onRegionClick, onRegionRightClick }: TraversalMapProps) {
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

      {/* Frontier regions - clickable gold/yellow, red if wrong guess, gray if eliminated */}
      {frontierRegions.map((region) => {
        const isWrongGuess = wrongGuessRegionIds.has(region.regionId);
        const isEliminated = eliminatedRegionIds.has(region.regionId);

        let color = '#ffc107';
        let fillOpacity = 0.25;
        let dashArray: string | undefined;

        if (isWrongGuess) {
          color = '#aa0000';
          fillOpacity = 0.4;
        } else if (isEliminated) {
          color = '#555555';
          fillOpacity = 0.15;
          dashArray = '6 4';
        }

        return (
          <Polygon
            key={`frontier-${region.regionId}`}
            positions={region.positions}
            pathOptions={{
              color,
              fillColor: color,
              weight: 2,
              fillOpacity,
              dashArray,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                if (gameState.status === 'playing' && !isWrongGuess) {
                  onRegionClick(region.regionId);
                }
              },
              contextmenu: (e) => {
                L.DomEvent.stopPropagation(e);
                e.originalEvent.preventDefault();
                if (gameState.status === 'playing' && !isWrongGuess) {
                  onRegionRightClick(region.regionId);
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

      {/* Port link lines — shown when one end is unlocked and the other is frontier */}
      {PORT_LINKS.map((link, i) => {
        const aUnlocked = gameState.unlockedRegionIds.includes(link.regionA);
        const bUnlocked = gameState.unlockedRegionIds.includes(link.regionB);
        const aFrontier = gameState.frontierRegionIds.includes(link.regionA);
        const bFrontier = gameState.frontierRegionIds.includes(link.regionB);
        const show = (aUnlocked && bFrontier) || (bUnlocked && aFrontier) || (aUnlocked && bUnlocked);
        if (!show) return null;
        const bothUnlocked = aUnlocked && bUnlocked;
        // Draw from unlocked→frontier so ants march toward the selectable region
        const fromA = aUnlocked && !bUnlocked;
        const startCoord: [number, number] = fromA || bothUnlocked ? [link.coordA[1], link.coordA[0]] : [link.coordB[1], link.coordB[0]];
        const endCoord: [number, number] = fromA || bothUnlocked ? [link.coordB[1], link.coordB[0]] : [link.coordA[1], link.coordA[0]];
        return (
          <span key={`port-link-${i}`}>
            <PortLinkPolyline
              positions={[startCoord, endCoord]}
              animate={!bothUnlocked}
            />
            <Marker
              position={[link.coordA[1], link.coordA[0]]}
              icon={new Icon({
                iconUrl: '/assets/osrs_transport_icon.png',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
                className: 'port-link-icon',
              })}
              interactive={false}
            />
            <Marker
              position={[link.coordB[1], link.coordB[0]]}
              icon={new Icon({
                iconUrl: '/assets/osrs_transport_icon.png',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
                className: 'port-link-icon',
              })}
              interactive={false}
            />
          </span>
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
