import React, { useState } from 'react';
import { Search, Filter, ArrowUpDown, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export default function FileList({ files, onSelectFile }) {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [langFilter, setLangFilter] = useState('ALL');
  const [sortField, setSortField] = useState('riskScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Filter logic
  let filtered = files.filter((f) => {
    if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
    if (langFilter !== 'ALL' && f.language !== langFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!f.relativePath.toLowerCase().includes(q) && !f.fileName.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Sort logic
  filtered.sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (sortField === 'maxComplexity') {
      valA = a.complexitySummary?.maxComplexity || 0;
      valB = b.complexitySummary?.maxComplexity || 0;
    }

    if (typeof valA === 'string') {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortAsc ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
    setPage(1);
  };

  const getSeverityBadgeClass = (sev) => {
    switch (String(sev).toUpperCase()) {
      case 'CRITICAL': return 'badge-critical';
      case 'HIGH': return 'badge-high';
      case 'MODERATE': return 'badge-moderate';
      default: return 'badge-low';
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          <FileText size={16} style={{ color: 'var(--accent-blue)' }} />
          Analyzed Source Files ({filtered.length} matching)
        </span>
      </div>

      {/* Filter / Search Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px'
        }}
      >
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
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
            placeholder="Search by file path or name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Severity:</span>
          <select
            className="form-input"
            style={{ fontSize: '0.82rem', padding: '6px 10px' }}
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical (75+)</option>
            <option value="HIGH">High (50-74)</option>
            <option value="MODERATE">Moderate (25-49)</option>
            <option value="LOW">Low (0-24)</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Language:</span>
          <select
            className="form-input"
            style={{ fontSize: '0.82rem', padding: '6px 10px' }}
            value={langFilter}
            onChange={(e) => {
              setLangFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All Languages</option>
            <option value="cpp">C / C++</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('relativePath')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>File Path</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th>Lang</th>
              <th onClick={() => toggleSort('totalLines')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Lines</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => toggleSort('maxComplexity')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Max M</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th>Dup %</th>
              <th>Sub-Scores (C / D / S)</th>
              <th onClick={() => toggleSort('riskScore')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Risk (R)</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th>Severity</th>
              <th>Priority</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No source files matching the selected filters.
                </td>
              </tr>
            ) : (
              paginated.map((f, idx) => {
                const comp = f.complexitySummary || {};
                const sub = f.riskBreakdown?.subScores || {};
                return (
                  <tr key={idx}>
                    <td className="font-mono" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      {f.relativePath}
                    </td>
                    <td>
                      <span className="badge font-mono" style={{ background: 'var(--bg-subtle)' }}>
                        {f.language}
                      </span>
                    </td>
                    <td className="font-mono">{f.totalLines}</td>
                    <td className="font-mono">
                      {comp.maxComplexity || 0}
                      {comp.maxNestingDepth >= 4 && (
                        <span style={{ color: 'var(--sev-mod)', marginLeft: '4px', fontSize: '0.75rem' }}>
                          (N:{comp.maxNestingDepth})
                        </span>
                      )}
                    </td>
                    <td className="font-mono">{f.duplicatePercentage || 0}%</td>
                    <td className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {sub.complexity || 0} / {sub.duplication || 0} / {sub.structural || 0}
                    </td>
                    <td className="font-mono" style={{ fontWeight: 700 }}>
                      {f.riskScore}
                    </td>
                    <td>
                      <span className={`badge ${getSeverityBadgeClass(f.severity)}`}>{f.severity}</span>
                    </td>
                    <td>
                      <span className="badge font-mono" style={{ background: 'var(--bg-subtle)' }}>
                        {f.remediationPriority?.priority || 'P4'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onSelectFile(f.relativePath)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '16px',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)'
          }}
        >
          <span>
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} files
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>
            <span className="font-mono" style={{ padding: '0 6px' }}>
              {currentPage} / {totalPages}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

