import React, { useState, useEffect } from 'react';
import {
  GitCompare,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertTriangle,
  CheckCircle,
  FileCode,
  ArrowRight
} from 'lucide-react';
import { api } from '../services/api';

export default function ScanComparison({ scans, activeScan, onSelectFile }) {
  const completedScans = (scans || []).filter((s) => s.status === 'completed');

  const [baseScanId, setBaseScanId] = useState('');
  const [targetScanId, setTargetScanId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [diffReport, setDiffReport] = useState(null);
  const [activeTab, setActiveTab] = useState('degraded');

  // Pre-populate scans: base = previous scan, target = current active scan
  useEffect(() => {
    if (completedScans.length >= 2) {
      const target = activeScan?.id || completedScans[0].id;
      const base = completedScans.find((s) => s.id !== target)?.id || completedScans[1]?.id;
      setTargetScanId(target);
      setBaseScanId(base);
    } else if (completedScans.length === 1) {
      setTargetScanId(completedScans[0].id);
      setBaseScanId(completedScans[0].id);
    }
  }, [scans, activeScan]);

  const handleCompare = async () => {
    if (!baseScanId || !targetScanId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.compareScans(baseScanId, targetScanId);
      setDiffReport(res.data);
    } catch (err) {
      setError(err.message || 'Differential scan comparison failed.');
    } finally {
      setLoading(false);
    }
  };

  const getTrajectoryBadge = (traj) => {
    switch (traj) {
      case 'IMPROVED':
        return (
          <span
            className="badge badge-low"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', padding: '4px 10px' }}
          >
            <TrendingDown size={14} /> HEALTH IMPROVED (-Risk)
          </span>
        );
      case 'DEGRADED':
        return (
          <span
            className="badge badge-critical"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', padding: '4px 10px' }}
          >
            <TrendingUp size={14} /> REGRESSION DETECTED (+Risk)
          </span>
        );
      default:
        return (
          <span
            className="badge"
            style={{
              background: 'var(--bg-subtle)',
              color: 'var(--accent-blue)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.85rem',
              padding: '4px 10px'
            }}
          >
            <Minus size={14} /> STABLE HEALTH
          </span>
        );
    }
  };

  return (
    <div>
      {/* 1. Selector Bar */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header" style={{ marginBottom: '16px' }}>
          <span className="card-title">
            <GitCompare size={16} style={{ color: 'var(--accent-blue)' }} />
            Differential Scan & Regression Analysis
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
          {/* Base Scan */}
          <div style={{ flex: '1', minWidth: '220px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Base Scan (Baseline / Prior)
            </label>
            <select
              className="form-input"
              style={{ width: '100%' }}
              value={baseScanId}
              onChange={(e) => setBaseScanId(e.target.value)}
            >
              {completedScans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 8)}... — {new Date(s.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end', paddingBottom: '8px' }}>
            <ArrowRight size={18} style={{ color: 'var(--text-muted)' }} />
          </div>

          {/* Target Scan */}
          <div style={{ flex: '1', minWidth: '220px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Target Scan (Current / Candidate)
            </label>
            <select
              className="form-input"
              style={{ width: '100%' }}
              value={targetScanId}
              onChange={(e) => setTargetScanId(e.target.value)}
            >
              {completedScans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 8)}... — {new Date(s.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <button
              className="btn btn-primary"
              disabled={loading || !baseScanId || !targetScanId}
              onClick={handleCompare}
            >
              <GitCompare size={15} />
              <span>{loading ? 'Comparing...' : 'Run Differential Analysis'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Error Message */}
      {error && (
        <div className="card" style={{ padding: '16px', background: 'var(--sev-crit-bg)', color: 'var(--sev-crit)', marginBottom: '20px' }}>
          <p style={{ fontWeight: 600 }}>Differential Analysis Error:</p>
          <p style={{ fontSize: '0.85rem' }}>{error}</p>
        </div>
      )}

      {/* 3. Comparison Results */}
      {diffReport && (
        <div>
          {/* Health Trajectory Banner */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Health Trajectory
              </span>
              <div style={{ marginTop: '4px' }}>
                {getTrajectoryBadge(diffReport.trajectory)}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Base Risk</span>
                <span className="font-mono" style={{ fontWeight: 600 }}>{diffReport.metadata?.baseRiskScore ?? 0}</span>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Target Risk</span>
                <span className="font-mono" style={{ fontWeight: 600 }}>{diffReport.metadata?.targetRiskScore ?? 0}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Net Risk Delta</span>
                <span
                  className="font-mono"
                  style={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    color:
                      diffReport.summaryDeltas?.deltaRiskScore > 0
                        ? 'var(--sev-crit)'
                        : diffReport.summaryDeltas?.deltaRiskScore < 0
                        ? 'var(--sev-low)'
                        : 'var(--text-secondary)'
                  }}
                >
                  {diffReport.summaryDeltas?.deltaRiskScore > 0 ? '+' : ''}
                  {diffReport.summaryDeltas?.deltaRiskScore ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* Delta Stat Cards */}
          <div className="stats-grid">
            <div className="stat-box">
              <span className="stat-label">Code Lines Delta</span>
              <span
                className="stat-value"
                style={{
                  color: (diffReport.summaryDeltas?.deltaCodeLines || 0) > 0 ? 'var(--accent-blue)' : 'inherit'
                }}
              >
                {(diffReport.summaryDeltas?.deltaCodeLines || 0) > 0 ? '+' : ''}
                {diffReport.summaryDeltas?.deltaCodeLines ?? 0}
              </span>
              <span className="stat-sub">
                Total Files: {(diffReport.summaryDeltas?.deltaTotalFiles || 0) >= 0 ? '+' : ''}
                {diffReport.summaryDeltas?.deltaTotalFiles ?? 0}
              </span>
            </div>

            <div className="stat-box">
              <span className="stat-label">Max Complexity Delta</span>
              <span
                className="stat-value"
                style={{
                  color:
                    (diffReport.summaryDeltas?.deltaMaxComplexity || 0) > 0
                      ? 'var(--sev-crit)'
                      : (diffReport.summaryDeltas?.deltaMaxComplexity || 0) < 0
                      ? 'var(--sev-low)'
                      : 'inherit'
                }}
              >
                {(diffReport.summaryDeltas?.deltaMaxComplexity || 0) > 0 ? '+' : ''}
                {diffReport.summaryDeltas?.deltaMaxComplexity ?? 0}
              </span>
              <span className="stat-sub">
                Avg Complexity: {(diffReport.summaryDeltas?.deltaAverageComplexity || 0) > 0 ? '+' : ''}
                {diffReport.summaryDeltas?.deltaAverageComplexity ?? 0}
              </span>
            </div>

            <div className="stat-box">
              <span className="stat-label">Duplication Lines Delta</span>
              <span
                className="stat-value"
                style={{
                  color:
                    (diffReport.summaryDeltas?.deltaDuplicationLines || 0) > 0
                      ? 'var(--sev-crit)'
                      : (diffReport.summaryDeltas?.deltaDuplicationLines || 0) < 0
                      ? 'var(--sev-low)'
                      : 'inherit'
                }}
              >
                {(diffReport.summaryDeltas?.deltaDuplicationLines || 0) > 0 ? '+' : ''}
                {diffReport.summaryDeltas?.deltaDuplicationLines ?? 0}
              </span>
              <span className="stat-sub">
                Rate: {(diffReport.summaryDeltas?.deltaDuplicationPercentage || 0) > 0 ? '+' : ''}
                {diffReport.summaryDeltas?.deltaDuplicationPercentage ?? 0}%
              </span>
            </div>

            <div className="stat-box">
              <span className="stat-label">Regressed Files</span>
              <span
                className="stat-value"
                style={{
                  color: (diffReport.degradedFiles?.length || 0) > 0 ? 'var(--sev-crit)' : 'var(--sev-low)'
                }}
              >
                {diffReport.degradedFiles?.length || 0}
              </span>
              <span className="stat-sub">
                {diffReport.improvedFiles?.length || 0} files improved
              </span>
            </div>
          </div>

          {/* Sub-Tabs: Degraded, Improved, Added, Removed */}
          <div className="card">
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <button
                className={`btn btn-sm ${activeTab === 'degraded' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('degraded')}
              >
                Degraded Files ({diffReport.degradedFiles?.length || 0})
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'improved' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('improved')}
              >
                Improved Files ({diffReport.improvedFiles?.length || 0})
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'added' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('added')}
              >
                Added Files ({diffReport.addedFiles?.length || 0})
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'removed' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('removed')}
              >
                Removed Files ({diffReport.removedFiles?.length || 0})
              </button>
            </div>

            {/* Degraded Table */}
            {activeTab === 'degraded' && (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>File Path</th>
                      <th>Base Risk</th>
                      <th>Target Risk</th>
                      <th>Risk Delta</th>
                      <th>LOC Delta</th>
                      <th>Max Complexity Delta</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(diffReport.degradedFiles || []).length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                          No files experienced risk regression.
                        </td>
                      </tr>
                    ) : (
                      diffReport.degradedFiles.map((f, i) => (
                        <tr key={i}>
                          <td className="font-mono" style={{ fontWeight: 600 }}>{f.relativePath}</td>
                          <td className="font-mono">{f.baseRiskScore}</td>
                          <td className="font-mono">{f.targetRiskScore}</td>
                          <td className="font-mono" style={{ color: 'var(--sev-crit)', fontWeight: 700 }}>
                            +{f.deltaRiskScore}
                          </td>
                          <td className="font-mono">{f.deltaLines > 0 ? `+${f.deltaLines}` : f.deltaLines}</td>
                          <td className="font-mono">{f.deltaComplexity > 0 ? `+${f.deltaComplexity}` : f.deltaComplexity}</td>
                          <td>
                            {onSelectFile && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onSelectFile(f.relativePath)}
                              >
                                Details
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Improved Table */}
            {activeTab === 'improved' && (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>File Path</th>
                      <th>Base Risk</th>
                      <th>Target Risk</th>
                      <th>Risk Delta</th>
                      <th>LOC Delta</th>
                      <th>Complexity Delta</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(diffReport.improvedFiles || []).length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                          No files showed risk score improvement.
                        </td>
                      </tr>
                    ) : (
                      diffReport.improvedFiles.map((f, i) => (
                        <tr key={i}>
                          <td className="font-mono" style={{ fontWeight: 600 }}>{f.relativePath}</td>
                          <td className="font-mono">{f.baseRiskScore}</td>
                          <td className="font-mono">{f.targetRiskScore}</td>
                          <td className="font-mono" style={{ color: 'var(--sev-low)', fontWeight: 700 }}>
                            {f.deltaRiskScore}
                          </td>
                          <td className="font-mono">{f.deltaLines > 0 ? `+${f.deltaLines}` : f.deltaLines}</td>
                          <td className="font-mono">{f.deltaComplexity}</td>
                          <td>
                            {onSelectFile && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onSelectFile(f.relativePath)}
                              >
                                Details
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Added Table */}
            {activeTab === 'added' && (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>File Path</th>
                      <th>Lines</th>
                      <th>Risk Score</th>
                      <th>Severity</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(diffReport.addedFiles || []).length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                          No new files added.
                        </td>
                      </tr>
                    ) : (
                      diffReport.addedFiles.map((f, i) => (
                        <tr key={i}>
                          <td className="font-mono" style={{ fontWeight: 600 }}>{f.relativePath}</td>
                          <td className="font-mono">{f.totalLines}</td>
                          <td className="font-mono">{f.riskScore}</td>
                          <td>
                            <span className="badge badge-low">{f.severity}</span>
                          </td>
                          <td>
                            {onSelectFile && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onSelectFile(f.relativePath)}
                              >
                                Details
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Removed Table */}
            {activeTab === 'removed' && (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>File Path</th>
                      <th>Prior Lines</th>
                      <th>Prior Risk Score</th>
                      <th>Prior Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(diffReport.removedFiles || []).length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                          No files removed.
                        </td>
                      </tr>
                    ) : (
                      diffReport.removedFiles.map((f, i) => (
                        <tr key={i}>
                          <td className="font-mono" style={{ fontWeight: 600 }}>{f.relativePath}</td>
                          <td className="font-mono">{f.totalLines}</td>
                          <td className="font-mono">{f.riskScore}</td>
                          <td>
                            <span className="badge badge-low">{f.severity}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

