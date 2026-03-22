import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, useMap } from 'react-leaflet';
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
  const [hiddenRegionIds, setHiddenRegionIds] = useState<Set<number>>(new Set());
  const [linkMode, setLinkMode] = useState(false);
  const [portNodes, setPortNodes] = useState<{ regionId: number; coord: [number, number] }[]>([]);
  const [portEdges, setPortEdges] = useState<[number, number][]>([]); // pairs of node indices
  const [pendingNode, setPendingNode] = useState<number | null>(null); // index into portNodes

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

  const SNAP_DIST = 10; // game-coord units to snap to existing node

  const handlePortLinkClick = useCallback((regionId: number, latlng: L.LatLng) => {
    const x = Math.round(latlng.lng);
    const y = Math.round(latlng.lat);

    // Find existing node within snap distance
    let nodeIdx = -1;
    let bestDist = SNAP_DIST;
    for (let i = 0; i < portNodes.length; i++) {
      const [nx, ny] = portNodes[i].coord;
      const dist = Math.hypot(x - nx, y - ny);
      if (dist < bestDist) {
        bestDist = dist;
        nodeIdx = i;
      }
    }

    // No nearby node → create one
    if (nodeIdx === -1) {
      nodeIdx = portNodes.length;
      setPortNodes((prev) => [...prev, { regionId, coord: [x, y] }]);
    }

    if (pendingNode === null) {
      setPendingNode(nodeIdx);
    } else if (pendingNode === nodeIdx) {
      // Clicked same node → deselect
      setPendingNode(null);
    } else {
      setPortEdges((prev) => [...prev, [pendingNode, nodeIdx]]);
      setPendingNode(null);
    }
  }, [portNodes, pendingNode]);

  const exportLinks = useCallback(() => {
    return portEdges.map((edge) => {
      const a = portNodes[edge[0]];
      const b = portNodes[edge[1]];
      const rA = getRegionById(a.regionId);
      const rB = getRegionById(b.regionId);
      return `  { regionA: ${a.regionId}, coordA: [${a.coord[0]}, ${a.coord[1]}], regionB: ${b.regionId}, coordB: [${b.coord[0]}, ${b.coord[1]}] }, // ${rA?.songNames.join(' / ') ?? '?'} ↔ ${rB?.songNames.join(' / ') ?? '?'}`;
    }).join('\n');
  }, [portNodes, portEdges]);

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

            {/* Port Link mode — always visible */}
            <div style={{ padding: '4px 8px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => {
                  setLinkMode(!linkMode);
                  setPendingNode(null);
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.8rem',
                  background: linkMode ? '#00838f' : '#444',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {linkMode ? 'Exit Link Ports' : 'Link Ports'}
              </button>
            </div>

            {linkMode && (
              <div style={{ padding: '0 8px 4px' }}>
                <div className="osrs-frame" style={{ padding: '8px', fontSize: '0.75rem' }}>
                  {/* Status */}
                  <div style={{ marginBottom: portEdges.length > 0 ? '8px' : 0, color: '#aaa' }}>
                    {pendingNode === null
                      ? 'Click to place or select a node...'
                      : <>Selected: <span style={{ color: '#00e5ff' }}>{getRegionById(portNodes[pendingNode].regionId)?.songNames[0] ?? '?'}</span> — click another location to link</>
                    }
                  </div>

                  {/* Links list */}
                  {portEdges.length > 0 && (
                    <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>
                      {portEdges.map((edge, i) => {
                        const a = portNodes[edge[0]];
                        const b = portNodes[edge[1]];
                        const rA = getRegionById(a.regionId);
                        const rB = getRegionById(b.regionId);
                        return (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                            <span style={{ color: '#00e5ff', fontSize: '0.7rem' }}>
                              {rA?.songNames[0] ?? '?'} ↔ {rB?.songNames[0] ?? '?'}
                            </span>
                            <button
                              onClick={() => setPortEdges((prev) => prev.filter((_, j) => j !== i))}
                              style={{
                                color: '#ff4444',
                                background: 'none',
                                border: '1px solid #aa0000',
                                cursor: 'pointer',
                                fontSize: '0.65rem',
                                padding: '1px 5px',
                                marginLeft: '6px',
                                lineHeight: 1,
                              }}
                            >
                              del
                            </button>
                          </div>
                        );
                      })}

                      <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => navigator.clipboard.writeText(exportLinks())}
                          style={{ padding: '3px 8px', fontSize: '0.75rem', background: '#006600', color: 'white', border: 'none', cursor: 'pointer' }}
                        >
                          Copy All
                        </button>
                        <button
                          onClick={() => { setPortNodes([]); setPortEdges([]); setPendingNode(null); }}
                          style={{ padding: '3px 8px', fontSize: '0.75rem', background: '#555', color: 'white', border: 'none', cursor: 'pointer' }}
                        >
                          Clear All
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={exportLinks()}
                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                        style={{
                          width: '100%',
                          marginTop: '6px',
                          height: `${Math.min(portEdges.length * 20 + 10, 120)}px`,
                          background: '#111',
                          color: '#0f0',
                          border: '1px solid #333',
                          fontFamily: 'monospace',
                          fontSize: '0.65rem',
                          resize: 'vertical',
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

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
                    onClick={() => {
                      setHiddenRegionIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(selected.region.id)) next.delete(selected.region.id);
                        else next.add(selected.region.id);
                        return next;
                      });
                    }}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      background: hiddenRegionIds.has(selected.region.id) ? '#aa6600' : '#555',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {hiddenRegionIds.has(selected.region.id) ? 'Show' : 'Hide'}
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
              !linkMode && (
                <label className="osrs-frame guess-btn">
                  Click any region or search to inspect adjacency
                </label>
              )
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
          hiddenRegionIds={hiddenRegionIds}
          linkMode={linkMode}
          portNodes={portNodes}
          portEdges={portEdges}
          pendingNode={pendingNode}
          onPortLinkClick={handlePortLinkClick}
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
  hiddenRegionIds,
  linkMode,
  portNodes,
  portEdges,
  pendingNode,
  onPortLinkClick,
}: {
  onSelect: (info: DebugInfo) => void;
  selectedId: number | null;
  frontier: number[];
  panTo: [number, number] | null;
  hiddenRegionIds: Set<number>;
  linkMode: boolean;
  portNodes: { regionId: number; coord: [number, number] }[];
  portEdges: [number, number][];
  pendingNode: number | null;
  onPortLinkClick: (regionId: number, latlng: L.LatLng) => void;
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
      {allRegions.filter((r) => !hiddenRegionIds.has(r.id)).map((region) => (
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
              if (linkMode) {
                onPortLinkClick(region.id, e.latlng);
              } else {
                const full = getRegionById(region.id)!;
                const edges = getEdgeInfos(full);
                onSelect({ region: full, neighborIds: full.neighborIds, edges });
              }
            },
          }}
        />
      ))}

      {/* Port link nodes */}
      {portNodes.map((node, i) => (
        <CircleMarker
          key={`port-node-${i}`}
          center={[node.coord[1], node.coord[0]]}
          radius={6}
          pathOptions={{
            color: pendingNode === i ? '#ffffff' : '#00e5ff',
            fillColor: '#00e5ff',
            fillOpacity: pendingNode === i ? 1 : 0.7,
            weight: pendingNode === i ? 3 : 1,
          }}
        />
      ))}

      {/* Port link edges */}
      {portEdges.map((edge, i) => {
        const a = portNodes[edge[0]];
        const b = portNodes[edge[1]];
        if (!a || !b) return null;
        return (
          <Polyline
            key={`port-edge-${i}`}
            positions={[
              [a.coord[1], a.coord[0]],
              [b.coord[1], b.coord[0]],
            ]}
            pathOptions={{ color: '#00e5ff', weight: 2, dashArray: '8 6' }}
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
