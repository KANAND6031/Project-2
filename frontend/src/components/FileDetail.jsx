import React, { useEffect, useState } from 'react';
import { X, FileCode, AlertTriangle, Layers, GitCommit, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';

export default function FileDetail({ scanId, relativePath, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileData, setFileData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getFileMetrics(scanId, relativePath);
        if (isMounted) {
          setFileData(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load file metrics');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (scanId && relativePath) {
      loadData();
    }
    return () => {
      isMounted = false;
    };
  }, [scanId, relativePath]);

  const getSeverityBadgeClass = (sev) => {
    switch (String(sev).toUpperCase()) {
      case 'CRITICAL': return 'badge-critical';
      case 'HIGH': return 'badge-high';
      case 'MODERATE': return 'badge-moderate';
      default: return 'badge-low';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '850px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: '20px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileCode size={20} style={{ color: 'var(--accent-blue)' }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {relativePath}
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Detailed static analysis, function metrics & technical debt risk breakdown
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ padding: '6px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
            <p>Loading file metrics for <span className="font-mono">{relativePath}</span>...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '24px', background: 'var(--sev-crit-bg)', borderRadius: '6px', color: 'var(--sev-crit)' }}>
            <p style={{ fontWeight: 600 }}>Error loading file metrics:</p>
            <p style={{ fontSize: '0.85rem' }}>{error}</p>
          </div>
        ) : fileData ? (
          <div>
            {/* Top Stats Banner */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '12px',
                marginBottom: '20px'
              }}
            >
              <div className="stat-box" style={{ padding: '12px 16px' }}>
                <span className="stat-label">File Risk Score</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span className="stat-value" style={{ fontSize: '1.4rem' }}>{fileData.riskScore}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ 100</span>
                </div>
                <div style={{ marginTop: '4px' }}>
                  <span className={`badge ${getSeverityBadgeClass(fileData.severity)}`}>
                    {fileData.severity}
                  </span>
                </div>
              </div>

              <div className="stat-box" style={{ padding: '12px 16px' }}>
                <span className="stat-label">Lines of Code</span>
                <span className="stat-value" style={{ fontSize: '1.4rem' }}>{fileData.totalLines}</span>
                <span className="stat-sub">{fileData.language}</span>
              </div>

              <div className="stat-box" style={{ padding: '12px 16px' }}>
                <span className="stat-label">Max Cyclomatic</span>
                <span className="stat-value" style={{ fontSize: '1.4rem' }}>
                  {fileData.complexitySummary?.maxComplexity || 0}
                </span>
                <span className="stat-sub">
                  Avg: {fileData.complexitySummary?.averageComplexity || 0}
                </span>
              </div>

              <div className="stat-box" style={{ padding: '12px 16px' }}>
                <span className="stat-label">Duplication</span>
                <span className="stat-value" style={{ fontSize: '1.4rem' }}>
                  {fileData.duplicatePercentage || 0}%
                </span>
                <span className="stat-sub">
                  {fileData.duplicateLines || 0} lines in {fileData.duplicateBlocksCount || 0} blocks
                </span>
              </div>
            </div>

            {/* Formula Decomposition Card */}
            <div
              style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '16px',
                marginBottom: '20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <ShieldAlert size={16} style={{ color: 'var(--accent-blue)' }} />
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                  Risk Formula Decomposition: R = 0.45*C + 0.35*D + 0.20*S
                </span>
              </div>

              {fileData.riskBreakdown && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Complexity (C - 45%)</div>
                    <div className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '2px' }}>
                      {fileData.riskBreakdown.subScores?.complexity ?? 0}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Contributes: {fileData.riskBreakdown.weightedContributions?.complexity ?? 0} pts
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Duplication (D - 35%)</div>
                    <div className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '2px' }}>
                      {fileData.riskBreakdown.subScores?.duplication ?? 0}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Contributes: {fileData.riskBreakdown.weightedContributions?.duplication ?? 0} pts
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Structural (S - 20%)</div>
                    <div className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '2px' }}>
                      {fileData.riskBreakdown.subScores?.structural ?? 0}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      L:{fileData.riskBreakdown.structuralSubScores?.length ?? 0} | N:{fileData.riskBreakdown.structuralSubScores?.nesting ?? 0} | P:{fileData.riskBreakdown.structuralSubScores?.parameters ?? 0}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Contributing Risk Factors */}
            {fileData.riskBreakdown?.contributingFactors?.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Identified Risk Factors
                </span>
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {fileData.riskBreakdown.contributingFactors.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        fontSize: '0.82rem'
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)' }}>{f.factor}</span>
                      <span className="font-mono" style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>
                        +{f.rawPoints} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Functions Table */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Function & Method Metrics ({fileData.functions?.length || 0})
                </span>
              </div>

              {(!fileData.functions || fileData.functions.length === 0) ? (
                <div style={{ padding: '16px', background: 'var(--bg-canvas)', borderRadius: '4px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  No individual function declarations identified in this file.
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Function Name</th>
                        <th>Lines</th>
                        <th>Cyclomatic Complexity</th>
                        <th>Max Nesting</th>
                        <th>Param Count</th>
                        <th>LOC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fileData.functions.map((fn, idx) => (
                        <tr key={idx}>
                          <td className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {fn.name}
                          </td>
                          <td className="font-mono" style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                            L{fn.startLine} - L{fn.endLine}
                          </td>
                          <td className="font-mono">
                            <span
                              style={{
                                color:
                                  fn.cyclomaticComplexity > 15
                                    ? 'var(--sev-crit)'
                                    : fn.cyclomaticComplexity > 10
                                    ? 'var(--sev-high)'
                                    : fn.cyclomaticComplexity > 5
                                    ? 'var(--sev-mod)'
                                    : 'var(--sev-low)',
                                fontWeight: 600
                              }}
                            >
                              {fn.cyclomaticComplexity}
                            </span>
                          </td>
                          <td className="font-mono">
                            <span style={{ color: fn.maxNestingDepth >= 4 ? 'var(--sev-mod)' : 'inherit' }}>
                              {fn.maxNestingDepth}
                            </span>
                          </td>
                          <td className="font-mono">{fn.parameterCount}</td>
                          <td className="font-mono">{fn.linesOfCode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Remediation Note */}
            {fileData.remediationPriority && (
              <div
                style={{
                  marginTop: '20px',
                  padding: '12px 16px',
                  background: 'var(--bg-subtle)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                  Remediation Action ({fileData.remediationPriority.priority}):
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {fileData.remediationPriority.action}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

