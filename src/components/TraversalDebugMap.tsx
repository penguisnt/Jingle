import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, Polygon, TileLayer, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { CENTER_COORDINATES } from '../constants/defaults';
import { getSurfaceRegions, getRegionById, getNeighborIds, TraversalRegion } from '../utils/adjacency';
import { switchLayer } from '../utils/map-utils';
import HomeButton from './side-menu/HomeButton';

function coordsToLatLngs(coords: number[][]): L.LatLngExpression[] {
  return coords.map(([x, y]) => [y, x] as L.LatLngExpression);
}

function roundCoord(val: number): number {
  return Math.round(val);
}

interface EdgeInfo {
  from: [number, number];
  to: [number, number];
  steps: number;
  samples: number;
}

function getEdgeInfos(region: TraversalRegion): EdgeInfo[] {
  const edges: EdgeInfo[] = [];
  for (const poly of region.polygons) {
    for (let i = 0; i < poly.length; i++) {
      const curr = poly[i];
      const next = poly[(i + 1) % poly.length];
      const rx1 = roundCoord(curr[0]), ry1 = roundCoord(curr[1]);
      const rx2 = roundCoord(next[0]), ry2 = roundCoord(next[1]);
      const dx = rx2 - rx1, dy = ry2 - ry1;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      edges.push({
        from: [rx1, ry1],
        to: [rx2, ry2],
        steps,
        samples: Math.max(0, steps - 1),
      });
    }
  }
  return edges;
}

interface DebugInfo {
  region: TraversalRegion;
  neighborIds: number[];
  edges: EdgeInfo[];
}

// Simulate the frontier computation to show what the game would show
function computeFrontier(unlockedIds: number[]): number[] {
  const unlockedSet = new Set(unlockedIds);
  const frontierSet = new Set<number>();
  for (const id of unlockedIds) {
    for (const neighborId of getNeighborIds(id)) {
      if (!unlockedSet.has(neighborId)) {
        if (getRegionById(neighborId)) {
          frontierSet.add(neighborId);
        }
      }
    }
  }
  return Array.from(frontierSet);
}

export default function TraversalDebugPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<DebugInfo | null>(null);
  const [search, setSearch] = useState('');
  const [simulateStart, setSimulateStart] = useState(false);
  const [panTo, setPanTo] = useState<[number, number] | null>(null);

  const allRegions = useMemo(() => getSurfaceRegions(), []);

  // Search matching
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allRegions
      .filter((r) => r.songNames.some((sn) => sn.toLowerCase().includes(q)))
      .slice(0, 10);
  }, [search, allRegions]);

  const selectRegion = useCallback((region: TraversalRegion) => {
    const edges = getEdgeInfos(region);
    setSelected({ region, neighborIds: region.neighborIds, edges });
    // Pan to region center
    const coords = region.polygons[0];
    if (coords) {
      const cx = coords.reduce((s, c) => s + c[0], 0) / coords.length;
      const cy = coords.reduce((s, c) => s + c[1], 0) / coords.length;
      setPanTo([cy, cx]);
    }
  }, []);

  const frontier = useMemo(() => {
    if (!simulateStart || !selected) return [];
    return computeFrontier([selected.region.id]);
  }, [simulateStart, selected]);

  return (
    <>
      <div className="App-inner">
        <div className="ui-box">
          <div className="modal-buttons-container">
            <span style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <HomeButton />
            </span>
          </div>

          <div className="below-map" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {/* Search */}
            <div style={{ padding: '4px 8px' }}>
              <input
                type="text"
                placeholder="Search song name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '0.85rem',
                  background: '#1a1a1a',
                  color: '#ffa500',
                  border: '1px solid #555',
                }}
              />
              {searchResults.length > 0 && (
                <div style={{ marginTop: '4px', fontSize: '0.75rem' }}>
                  {searchResults.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => { selectRegion(r); setSearch(''); }}
                      style={{
                        cursor: 'pointer',
                        padding: '3px 6px',
                        borderBottom: '1px solid #333',
                        color: r.neighborIds.length <= 1 ? '#ff4444' : '#ccc',
                      }}
                    >
                      #{r.id} {r.songNames.join(', ')} ({r.neighborIds.length} neighbors)
                      {r.neighborIds.length <= 1 ? ' !!!' : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selected ? (
              <div style={{ padding: '8px', fontSize: '0.75rem', lineHeight: '1.5' }}>
                <div className="osrs-frame" style={{ padding: '8px', marginBottom: '6px' }}>
                  <strong>ID:</strong> {selected.region.id}<br />
                  <strong>Song{selected.region.songNames.length > 1 ? 's' : ''}:</strong> {selected.region.songNames.join(', ')}<br />
                  <strong>Polygons:</strong> {selected.region.polygons.length}<br />
                  <strong>Neighbors ({selected.neighborIds.length}):</strong>{' '}
                  {selected.neighborIds.map((nId) => {
                    const n = getRegionById(nId);
                    return (
                      <span
                        key={nId}
                        onClick={() => { const nr = getRegionById(nId); if (nr) selectRegion(nr); }}
                        style={{ cursor: 'pointer', color: '#ff8800', textDecoration: 'underline', marginRight: '4px' }}
                      >
                        {n?.songNames.join('/') ?? '?'}
                      </span>
                    );
                  })}
                  {selected.neighborIds.length === 0 && <span style={{ color: '#ff4444' }}>NONE</span>}
                </div>

                {/* Edge details */}
                <div className="osrs-frame" style={{ padding: '8px', marginBottom: '6px' }}>
                  <strong>Edges ({selected.edges.length}):</strong>
                  <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                    {selected.edges.map((e, i) => (
                      <div key={i} style={{ color: e.samples === 0 && e.steps > 0 ? '#ff4444' : '#aaa' }}>
                        [{e.from[0]},{e.from[1]}]-&gt;[{e.to[0]},{e.to[1]}] steps={e.steps} samples={e.samples}
                        {e.samples === 0 && e.steps > 0 ? ' INVISIBLE' : ''}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Simulate / start buttons */}
                <div style={{ marginBottom: '6px', display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setSimulateStart(!simulateStart)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      background: simulateStart ? '#aa0000' : '#006600',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {simulateStart ? 'Stop Simulation' : 'Simulate Start Here'}
                  </button>
                  <button
                    onClick={() => navigate(`/traversal?startRegion=${selected.region.id}`)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      background: '#0d6efd',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Start Game Here
                  </button>
                </div>

                {simulateStart && (
                  <div className="osrs-frame" style={{ padding: '8px', fontSize: '0.75rem' }}>
                    <strong>Frontier ({frontier.length} clickable regions):</strong>
                    <div>
                      {frontier.map((fId) => {
                        const fr = getRegionById(fId);
                        return (
                          <span
                            key={fId}
                            onClick={() => { if (fr) selectRegion(fr); }}
                            style={{ cursor: 'pointer', color: '#ffc107', marginRight: '6px' }}
                          >
                            {fr?.songNames.join('/') ?? '?'}
                          </span>
                        );
                      })}
                      {frontier.length === 0 && <span style={{ color: '#ff4444' }}>NO FRONTIER - game would end immediately!</span>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <label className="osrs-frame guess-btn">
                Click any region or search to inspect adjacency
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
        <DebugMapInner
          onSelect={(info) => {
            setSelected(info);
            setSimulateStart(false);
          }}
          selectedId={selected?.region.id ?? null}
          frontier={simulateStart ? frontier : []}
          panTo={panTo}
        />
      </MapContainer>
    </>
  );
}

function DebugMapInner({
  onSelect,
  selectedId,
  frontier,
  panTo,
}: {
  onSelect: (info: DebugInfo) => void;
  selectedId: number | null;
  frontier: number[];
  panTo: [number, number] | null;
}) {
  const map = useMap();
  const tileLayerRef = useRef<L.TileLayer>(null);

  useEffect(() => {
    setTimeout(() => {
      if (map && tileLayerRef.current) {
        switchLayer(map, tileLayerRef.current, 0);
      }
    }, 0);
  }, [map]);

  // Pan when requested
  useEffect(() => {
    if (panTo) {
      map.setView(panTo, Math.max(map.getZoom(), 2));
    }
  }, [panTo, map]);

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

  const frontierSet = useMemo(() => new Set(frontier), [frontier]);

  const getColor = (regionId: number) => {
    if (selectedId === regionId) return '#00ff00';
    if (frontierSet.has(regionId)) return '#ffc107';
    if (neighborSet.has(regionId)) return '#ff8800';
    return '#0d6efd';
  };

  const getOpacity = (regionId: number) => {
    if (selectedId === regionId) return 0.6;
    if (frontierSet.has(regionId)) return 0.5;
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
            weight: selectedId === region.id || neighborSet.has(region.id) || frontierSet.has(region.id) ? 3 : 1,
            fillOpacity: getOpacity(region.id),
          }}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              const full = getRegionById(region.id)!;
              const edges = getEdgeInfos(full);
              onSelect({ region: full, neighborIds: full.neighborIds, edges });
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
