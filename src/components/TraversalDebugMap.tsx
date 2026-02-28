import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMemo, useEffect, useRef, useState } from 'react';
import { MapContainer, Polygon, TileLayer, useMap } from 'react-leaflet';
import { CENTER_COORDINATES } from '../constants/defaults';
import { getSurfaceRegions, getRegionById, TraversalRegion } from '../utils/adjacency';
import { switchLayer } from '../utils/map-utils';
import HomeButton from './side-menu/HomeButton';

function coordsToLatLngs(coords: number[][]): L.LatLngExpression[] {
  return coords.map(([x, y]) => [y, x] as L.LatLngExpression);
}

interface DebugInfo {
  region: TraversalRegion;
  neighborIds: number[];
}

export default function TraversalDebugPage() {
  const [selected, setSelected] = useState<DebugInfo | null>(null);

  return (
    <>
      <div className="App-inner">
        <div className="ui-box">
          <div className="modal-buttons-container">
            <span style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <HomeButton />
            </span>
          </div>

          <div className="below-map" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
            {selected ? (
              <div style={{ padding: '8px', fontSize: '0.8rem', lineHeight: '1.6' }}>
                <div className="osrs-frame" style={{ padding: '8px', marginBottom: '6px' }}>
                  <strong>ID:</strong> {selected.region.id}<br />
                  <strong>Song:</strong> {selected.region.songName}<br />
                  <strong>Polygons:</strong> {selected.region.polygons.length}<br />
                  <strong>Neighbors ({selected.neighborIds.length}):</strong>{' '}
                  {selected.neighborIds.map((nId) => {
                    const n = getRegionById(nId);
                    return `${nId} (${n?.songName ?? '?'})`;
                  }).join(', ') || 'none'}
                </div>
                <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                  Click another region to inspect it
                </div>
              </div>
            ) : (
              <label className="osrs-frame guess-btn">
                Click any region to inspect adjacency
              </label>
            )}
          </div>
        </div>
      </div>

      <MapContainer
        center={CENTER_COORDINATES}
        zoom={1}
        minZoom={0}
        maxZoom={3}
        style={{ height: '100dvh', width: '100%', backgroundColor: 'black' }}
        maxBoundsViscosity={0.5}
        crs={CRS.Simple}
      >
        <DebugMapInner onSelect={setSelected} />
      </MapContainer>
    </>
  );
}

function DebugMapInner({ onSelect }: { onSelect: (info: DebugInfo | null) => void }) {
  const map = useMap();
  const tileLayerRef = useRef<L.TileLayer>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    setTimeout(() => {
      if (map && tileLayerRef.current) {
        switchLayer(map, tileLayerRef.current, 0);
      }
    }, 0);
  }, [map]);

  const allRegions = useMemo(() => {
    return getSurfaceRegions().map((r) => ({
      ...r,
      positions: r.polygons.map((poly) => coordsToLatLngs(poly)),
    }));
  }, []);

  const selectedRegion = selectedId != null ? getRegionById(selectedId) : null;
  const neighborSet = useMemo(() => {
    return new Set(selectedRegion?.neighborIds ?? []);
  }, [selectedRegion]);

  const getColor = (regionId: number) => {
    if (selectedId === regionId) return '#00ff00';
    if (neighborSet.has(regionId)) return '#ff8800';
    return '#0d6efd';
  };

  const getOpacity = (regionId: number) => {
    if (selectedId === regionId) return 0.6;
    if (neighborSet.has(regionId)) return 0.5;
    return 0.15;
  };

  return (
    <>
      {allRegions.map((region) => (
        <Polygon
          key={`debug-${region.id}`}
          positions={region.positions}
          pathOptions={{
            color: getColor(region.id),
            fillColor: getColor(region.id),
            weight: selectedId === region.id || neighborSet.has(region.id) ? 3 : 1,
            fillOpacity: getOpacity(region.id),
          }}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              const full = getRegionById(region.id)!;
              setSelectedId(region.id);
              onSelect({
                region: full,
                neighborIds: full.neighborIds,
              });
            },
          }}
        />
      ))}

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
