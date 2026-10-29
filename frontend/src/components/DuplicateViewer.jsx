import React, { useState, useEffect } from 'react';
import { Copy, Search, Filter, FileText, ChevronDown, ChevronRight, AlertCircle, Code } from 'lucide-react';
import { api } from '../services/api';

export default function DuplicateViewer({ scanId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groups, setGroups] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [minLines, setMinLines] = useState(5);
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    let isMounted = true;
    async function loadDuplicates() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getDuplicateGroups(scanId);
        if (isMounted) {
          setGroups(res.data || []);
          setSummary(res.summary || null);
          // By default, expand the first 3 groups
          const initialExpanded = {};
          (res.data || []).slice(0, 3).forEach((g) => {
            initialExpanded[g.id] = true;
          });
          setExpandedGroups(initialExpanded);
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load duplicate code groups');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (scanId) {
      loadDuplicates();
    }
    return () => {
      isMounted = false;
    };
  }, [scanId]);

  const toggleExpand = (groupId) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const expandAll = () => {
    const all = {};
    groups.forEach((g) => {
      all[g.id] = true;
    });
    setExpandedGroups(all);
  };

  const collapseAll = () => {
    setExpandedGroups({});
  };

  // Filter groups
  const filtered = groups.filter((g) => {
    if (g.lineCount < minLines) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchesId = g.id.toLowerCase().includes(q);
      const matchesFile = (g.fragments || []).some((f) =>
        f.filePath.toLowerCase().includes(q)
      );
      const matchesSnippet = (g.sampleSnippet || '').toLowerCase().includes(q);
      if (!matchesId && !matchesFile && !matchesSnippet) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Analyzing duplicate blocks and clone clusters...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: '24px', background: 'var(--sev-crit-bg)', color: 'var(--sev-crit)' }}>
        <p style={{ fontWeight: 600 }}>Error loading duplicate code groups:</p>
        <p style={{ fontSize: '0.85rem' }}>{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* 1. Summary Cards */}
      <div className="stats-grid">
        <div className="stat-box">
          <span className="stat-label">Total Duplicate Blocks</span>
          <span className="stat-value">{summary?.totalDuplicateBlocks ?? groups.length}</span>
          <span className="stat-sub">Identified clone groups</span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Total Duplicate Lines</span>
          <span className="stat-value">{summary?.totalDuplicateLines ?? 0}</span>
          <span className="stat-sub">Redundant source lines</span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Duplication Rate</span>
          <span className="stat-value">{summary?.overallDuplicationPercentage ?? 0}%</span>
          <span className="stat-sub">Of total codebase lines</span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Threshold Config</span>
          <span className="stat-value" style={{ fontSize: '1.2rem' }}>&ge; 5 lines</span>
          <span className="stat-sub">Rabin-Karp / Rolling Tokenizer</span>
        </div>
      </div>

      {/* 2. Controls & Filter Bar */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: '280px' }}>
            <div style={{ position: 'relative', flex: '1' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }}
              />
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', paddingLeft: '32px' }}
                placeholder="Search by file path, clone ID, or code snippet..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Min lines:
              </span>
              <select
                className="form-input"
                style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                value={minLines}
                onChange={(e) => setMinLines(Number(e.target.value))}
              >
                <option value={5}>&ge; 5 lines</option>
                <option value={10}>&ge; 10 lines</option>
                <option value={20}>&ge; 20 lines</option>
                <option value={50}>&ge; 50 lines</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={expandAll}>
              Expand All
            </button>
            <button className="btn btn-secondary btn-sm" onClick={collapseAll}>
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* 3. Clone Groups List */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <CheckCircle2 size={32} style={{ color: 'var(--sev-low)', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No duplicate code blocks found</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            No code segments matched the current filter threshold.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filtered.map((grp) => {
            const isExpanded = !!expandedGroups[grp.id];
            return (
              <div
                key={grp.id}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}
              >
                {/* Header row */}
                <div
                  onClick={() => toggleExpand(grp.id)}
                  style={{
                    padding: '12px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    backgroundColor: isExpanded ? 'var(--bg-subtle)' : 'transparent',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                    transition: 'background-color 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isExpanded ? (
                      <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />
                    ) : (
                      <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
                    )}
                    <span
                      className="font-mono"
                      style={{ fontWeight: 600, color: 'var(--accent-blue)', fontSize: '0.9rem' }}
                    >
                      {grp.id}
                    </span>
                    <span
                      className="badge font-mono"
                      style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-color)' }}
                    >
                      {grp.lineCount} duplicate lines
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      across {grp.fragments?.length || 0} locations
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      {grp.fragments?.map((f) => f.filePath.split(/[\\/]/).pop()).join(' & ')}
                    </span>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '16px 20px' }}>
                    {/* Fragments list */}
                    <div style={{ marginBottom: '14px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em'
                        }}
                      >
                        Participating File Locations:
                      </span>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                          gap: '8px',
                          marginTop: '8px'
                        }}
                      >
                        {(grp.fragments || []).map((frag, fIdx) => (
                          <div
                            key={fIdx}
                            style={{
                              padding: '8px 12px',
                              background: 'var(--bg-canvas)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.82rem'
                            }}
                          >
                            <span
                              className="font-mono"
                              style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}
                            >
                              {frag.filePath}
                            </span>
                            <span
                              className="badge font-mono"
                              style={{ background: 'var(--bg-subtle)', marginLeft: '8px' }}
                            >
                              L{frag.startLine} - L{frag.endLine}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sample Snippet Preview */}
                    {grp.sampleSnippet && (
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase'
                          }}
                        >
                          <Code size={13} />
                          <span>Code Fragment Preview (Normalized)</span>
                        </div>
                        <pre
                          style={{
                            background: 'var(--bg-canvas)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            padding: '12px 14px',
                            fontSize: '0.8rem',
                            lineHeight: 1.5,
                            overflowX: 'auto',
                            color: 'var(--text-primary)'
                          }}
                        >
                          <code>{grp.sampleSnippet}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

