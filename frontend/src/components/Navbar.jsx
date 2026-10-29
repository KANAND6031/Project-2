import React, { useState } from 'react';
import { Activity, Play, Download, GitBranch, FolderGit2, CheckCircle2, Clock } from 'lucide-react';

export default function Navbar({
  repositories,
  activeRepo,
  onSelectRepo,
  activeScan,
  onOpenNewScan,
  onExport
}) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <header className="navbar">
      <div className="brand-section">
        <Activity size={22} className="text-accent" style={{ color: 'var(--accent-blue)' }} />
        <span className="brand-title">CodeInsight</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Repository Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderGit2 size={16} style={{ color: 'var(--text-muted)' }} />
          <select
            className="form-input"
            value={activeRepo?.id || ''}
            onChange={(e) => {
              const selected = repositories.find((r) => r.id === e.target.value);
              if (selected) onSelectRepo(selected);
            }}
            style={{ padding: '6px 12px', fontSize: '0.82rem', minWidth: '180px' }}
          >
            {repositories.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Active Scan Indicator */}
        {activeScan && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              background: 'var(--bg-subtle)',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)'
            }}
          >
            {activeScan.status === 'completed' ? (
              <CheckCircle2 size={14} style={{ color: 'var(--sev-low)' }} />
            ) : (
              <Clock size={14} style={{ color: 'var(--sev-mod)' }} />
            )}
            <span className="font-mono">
              Scan: {String(activeScan.id || activeScan.scanId || 'Scan').slice(0, 10)}... ({activeScan.status || 'running'})
            </span>
          </div>
        )}

        {/* Start Scan Button */}
        <button className="btn btn-primary btn-sm" onClick={onOpenNewScan}>
          <Play size={14} />
          <span>New Scan</span>
        </button>

        {/* Export Dropdown */}
        {activeScan && activeScan.status === 'completed' && (
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              <Download size={14} />
              <span>Export</span>
            </button>

            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '110%',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  minWidth: '160px',
                  zIndex: 50,
                  overflow: 'hidden'
                }}
              >
                <button
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.82rem'
                  }}
                  onMouseEnter={(e) => (e.target.style.background = 'var(--bg-subtle)')}
                  onMouseLeave={(e) => (e.target.style.background = 'none')}
                  onClick={() => {
                    setShowExportMenu(false);
                    onExport('json');
                  }}
                >
                  Download JSON Report
                </button>
                <button
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.82rem'
                  }}
                  onMouseEnter={(e) => (e.target.style.background = 'var(--bg-subtle)')}
                  onMouseLeave={(e) => (e.target.style.background = 'none')}
                  onClick={() => {
                    setShowExportMenu(false);
                    onExport('markdown');
                  }}
                >
                  Download Markdown (.md)
                </button>
                <button
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.82rem'
                  }}
                  onMouseEnter={(e) => (e.target.style.background = 'var(--bg-subtle)')}
                  onMouseLeave={(e) => (e.target.style.background = 'none')}
                  onClick={() => {
                    setShowExportMenu(false);
                    onExport('csv');
                  }}
                >
                  Download Metrics CSV
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

