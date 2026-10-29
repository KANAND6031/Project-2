import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import {
  GitPullRequest,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Info,
  ShieldAlert,
  Layers,
  FileCode
} from 'lucide-react';
import { api } from '../services/api';

export default function DependencyGraph({ scanId, onSelectFile }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [layoutName, setLayoutName] = useState('cose');
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadDeps() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getDependencies(scanId);
        if (isMounted) {
          setGraphData(res);
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load dependency graph');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (scanId) {
      loadDeps();
    }
    return () => {
      isMounted = false;
    };
  }, [scanId]);

  // Cytoscape initialization and updates
  useEffect(() => {
    if (!containerRef.current || !graphData?.data) return;

    const { nodes = [], edges = [] } = graphData.data;

    // Destroy existing instance if any
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    try {
      const cy = cytoscape({
        container: containerRef.current,
        elements: [...nodes, ...edges],
        style: [
          {
            selector: 'node',
            style: {
              label: 'data(label)',
              'color': '#f8fafc',
              'font-size': '11px',
              'font-family': 'JetBrains Mono, monospace',
              'text-valign': 'bottom',
              'text-margin-y': 6,
              'background-color': (ele) => {
                const sev = String(ele.data('severity') || '').toUpperCase();
                switch (sev) {
                  case 'CRITICAL': return '#ef4444';
                  case 'HIGH': return '#f97316';
                  case 'MODERATE': return '#f59e0b';
                  default: return '#10b981';
                }
              },
              'width': (ele) => {
                const loc = ele.data('totalLines') || 50;
                return Math.min(60, Math.max(24, Math.sqrt(loc) * 3));
              },
              'height': (ele) => {
                const loc = ele.data('totalLines') || 50;
                return Math.min(60, Math.max(24, Math.sqrt(loc) * 3));
              },
              'border-width': 2,
              'border-color': '#0f172a'
            }
          },
          {
            selector: 'node:selected',
            style: {
              'border-width': 3,
              'border-color': '#38bdf8',
              'shadow-blur': 12,
              'shadow-color': '#38bdf8',
              'shadow-opacity': 0.8
            }
          },
          {
            selector: 'edge',
            style: {
              'width': 1.5,
              'line-color': '#475569',
              'target-arrow-color': '#475569',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 0.8
            }
          },
          {
            selector: '.dimmed',
            style: {
              'opacity': 0.15
            }
          },
          {
            selector: '.highlighted',
            style: {
              'opacity': 1.0,
              'border-color': '#38bdf8',
              'border-width': 3
            }
          }
        ],
        layout: {
          name: layoutName,
          padding: 30,
          animate: false
        }
      });

      // Events
      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        setSelectedNode(node.data());
      });

      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          setSelectedNode(null);
        }
      });

      cyRef.current = cy;
    } catch (e) {
      console.error('Cytoscape render error:', e);
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [graphData, layoutName]);

  // Handle Search Filtering / Highlighting
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    if (!filterQuery) {
      cy.elements().removeClass('dimmed highlighted');
      return;
    }

    const q = filterQuery.toLowerCase();
    cy.batch(() => {
      cy.elements().addClass('dimmed').removeClass('highlighted');
      cy.nodes().each((node) => {
        const id = (node.data('id') || '').toLowerCase();
        const label = (node.data('label') || '').toLowerCase();
        if (id.includes(q) || label.includes(q)) {
          node.removeClass('dimmed').addClass('highlighted');
          node.neighborhood().removeClass('dimmed');
        }
      });
    });
  }, [filterQuery]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleFit = () => cyRef.current?.fit();
  const handleResetLayout = () => {
    if (cyRef.current) {
      const layout = cyRef.current.layout({ name: layoutName, animate: true, animationDuration: 400 });
      layout.run();
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Constructing repository dependency topology...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: '24px', background: 'var(--sev-crit-bg)', color: 'var(--sev-crit)' }}>
        <p style={{ fontWeight: 600 }}>Error loading dependency topology:</p>
        <p style={{ fontSize: '0.85rem' }}>{error}</p>
      </div>
    );
  }

  const nodesCount = graphData?.data?.nodes?.length || 0;
  const edgesCount = graphData?.data?.edges?.length || 0;
  const isPending = graphData?.status === 'PHASE_5_PENDING';

  return (
    <div>
      {/* Informational banner when Phase 5 is pending */}
      {isPending && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            background: 'var(--accent-blue-bg)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Info size={18} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
              <strong>Topological View:</strong> File nodes are dynamically sized by LOC and color-coded by Technical Debt Risk Score ($R = 0.45C + 0.35D + 0.20S$). Explicit inter-file coupling edges are scheduled for Phase 5.
            </span>
          </div>
          <span className="badge font-mono" style={{ background: 'var(--bg-subtle)', whiteSpace: 'nowrap' }}>
            {nodesCount} Nodes | {edgesCount} Edges
          </span>
        </div>
      )}

      {/* Control Toolbar */}
      <div
        className="card"
        style={{
          padding: '12px 18px',
          marginBottom: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="text"
            className="form-input"
            style={{ padding: '6px 12px', fontSize: '0.82rem', width: '220px' }}
            placeholder="Search node / file..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Layout:</span>
            <select
              className="form-input"
              style={{ padding: '6px 10px', fontSize: '0.82rem' }}
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
            >
              <option value="cose">Force-Directed (CoSE)</option>
              <option value="concentric">Concentric</option>
              <option value="circle">Circle</option>
              <option value="grid">Grid</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleZoomIn} title="Zoom In">
            <ZoomIn size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleZoomOut} title="Zoom Out">
            <ZoomOut size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleFit} title="Fit to View">
            <Maximize2 size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleResetLayout} title="Rearrange">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Graph Area & Node Sidebar */}
      <div style={{ display: 'flex', gap: '16px', position: 'relative' }}>
        <div
          ref={containerRef}
          style={{
            flex: '1',
            height: '620px',
            backgroundColor: 'var(--bg-canvas)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            overflow: 'hidden'
          }}
        />

        {/* Selected Node Details Panel */}
        {selectedNode && (
          <div
            style={{
              width: '320px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              position: 'absolute',
              right: '12px',
              top: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              zIndex: 10
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}
                >
                  Selected Node
                </span>
                <h4
                  className="font-mono"
                  style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}
                >
                  {selectedNode.label || selectedNode.id}
                </h4>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px' }}
                onClick={() => setSelectedNode(null)}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
              {selectedNode.id}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'var(--bg-canvas)', padding: '8px', borderRadius: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Risk Score</span>
                <div className="font-mono" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                  {selectedNode.riskScore ?? 0}
                </div>
              </div>

              <div style={{ background: 'var(--bg-canvas)', padding: '8px', borderRadius: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Severity</span>
                <div style={{ marginTop: '2px' }}>
                  <span
                    className={`badge ${
                      selectedNode.severity === 'CRITICAL'
                        ? 'badge-critical'
                        : selectedNode.severity === 'HIGH'
                        ? 'badge-high'
                        : selectedNode.severity === 'MODERATE'
                        ? 'badge-moderate'
                        : 'badge-low'
                    }`}
                  >
                    {selectedNode.severity || 'LOW'}
                  </span>
                </div>
              </div>

              <div style={{ background: 'var(--bg-canvas)', padding: '8px', borderRadius: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Lines of Code</span>
                <div className="font-mono" style={{ fontWeight: 600 }}>
                  {selectedNode.totalLines ?? 0}
                </div>
              </div>

              <div style={{ background: 'var(--bg-canvas)', padding: '8px', borderRadius: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Language</span>
                <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {selectedNode.id.split('.').pop()?.toUpperCase() || 'FILE'}
                </div>
              </div>
            </div>

            {onSelectFile && (
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: '6px', justifyContent: 'center' }}
                onClick={() => onSelectFile(selectedNode.id)}
              >
                <FileCode size={14} />
                <span>Inspect Full Metrics</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          marginTop: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)'
        }}
      >
        <span style={{ fontWeight: 600 }}>Severity Legend:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
          <span>Low (0-24)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
          <span>Moderate (25-49)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316' }} />
          <span>High (50-74)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
          <span>Critical (75-100)</span>
        </div>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
          Node diameter scaled by file LOC
        </span>
      </div>
    </div>
  );
}

