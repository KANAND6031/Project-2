import React from 'react';
import {
  ShieldAlert,
  Flame,
  FileCode2,
  Copy,
  GitCommit,
  CheckCircle,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function Overview({ summary, technicalDebt, onSelectFile, onSwitchTab }) {
  if (!summary || !technicalDebt) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>No scan data available. Start a scan to view metrics.</p>
      </div>
    );
  }

  const riskScore = technicalDebt.repositoryRiskScore ?? 0;
  const severity = technicalDebt.overallSeverity || 'LOW';
  const formula = technicalDebt.formula || 'R = 0.45*C + 0.35*D + 0.20*S';
  const dist = technicalDebt.riskDistribution || { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
  const hotspots = technicalDebt.topHotspots || [];
  const recommendations = technicalDebt.recommendations || [];

  // Recharts data format
  const chartData = [
    { name: 'Low (0-24)', count: dist.LOW || 0, color: '#10b981' },
    { name: 'Moderate (25-49)', count: dist.MODERATE || 0, color: '#f59e0b' },
    { name: 'High (50-74)', count: dist.HIGH || 0, color: '#f97316' },
    { name: 'Critical (75+)', count: dist.CRITICAL || 0, color: '#ef4444' }
  ];

  const getSeverityBadgeClass = (sev) => {
    switch (String(sev).toUpperCase()) {
      case 'CRITICAL': return 'badge-critical';
      case 'HIGH': return 'badge-high';
      case 'MODERATE': return 'badge-moderate';
      default: return 'badge-low';
    }
  };

  return (
    <div>
      {/* 1. Stat Cards */}
      <div className="stats-grid">
        <div className="stat-box" style={{ borderLeft: `4px solid var(--sev-${severity.toLowerCase()})` }}>
          <span className="stat-label">Repository Risk Score</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-value">{riskScore}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>/ 100</span>
          </div>
          <div style={{ marginTop: '8px' }}>
            <span className={`badge ${getSeverityBadgeClass(severity)}`}>{severity} RISK</span>
          </div>
        </div>

        <div className="stat-box">
          <span className="stat-label">Codebase Volume</span>
          <span className="stat-value">{(summary.totalCodeLines || summary.totalLines || 0).toLocaleString()}</span>
          <span className="stat-sub">{summary.totalFiles || 0} source files analyzed</span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Complexity Density</span>
          <span className="stat-value">{summary.averageComplexity || 0}</span>
          <span className="stat-sub">
            Max: {summary.maxComplexity || 0} ({summary.highComplexityFunctionCount || 0} complex functions)
          </span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Code Duplication</span>
          <span className="stat-value">{summary.overallDuplicationPercentage || 0}%</span>
          <span className="stat-sub">
            {summary.totalDuplicateLines || 0} duplicate lines in {summary.totalDuplicateBlocks || 0} groups
          </span>
        </div>
      </div>

      {/* 2. Formula Card & Risk Distribution Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {/* Formula Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ShieldAlert size={16} style={{ color: 'var(--accent-blue)' }} />
              Technical Debt Formula
            </span>
            <span className="badge font-mono" style={{ background: 'var(--bg-subtle)' }}>Phase 7 Standard</span>
          </div>
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--bg-canvas)',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              marginBottom: '14px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.92rem',
              color: 'var(--accent-blue)',
              fontWeight: 600
            }}
          >
            {formula}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            <p style={{ marginBottom: '6px' }}>
              • <strong>Complexity (45%)</strong>: Evaluates peak McCabe cyclomatic complexity (<code className="font-mono">M = 1 + decision points</code>) and control flow density.
            </p>
            <p style={{ marginBottom: '6px' }}>
              • <strong>Duplication (35%)</strong>: Normalized clone percentage derived from Type-1 sliding window block hashing.
            </p>
            <p>
              • <strong>Structure (20%)</strong>: Weighted composite of file length (<code className="font-mono">40% L</code>), nesting depth (<code className="font-mono">35% N</code>), and parameter count (<code className="font-mono">25% P</code>).
            </p>
          </div>
        </div>

        {/* Risk Distribution Chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Flame size={16} style={{ color: 'var(--sev-high)' }} />
              Technical Debt Distribution
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{summary.totalFiles || 0} Total Files</span>
          </div>
          <div style={{ width: '100%', height: '180px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3. Top Hotspots Table */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">
            <AlertTriangle size={16} style={{ color: 'var(--sev-high)' }} />
            Top Technical Debt Hotspots
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onSwitchTab('files')}
          >
            <span>View All Files</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {hotspots.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No high-risk or critical files detected. All source files conform to baseline maintainability thresholds.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File Path</th>
                  <th>Risk Score</th>
                  <th>Severity</th>
                  <th>Priority</th>
                  <th>Primary Driver</th>
                  <th>Key Factor</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.map((h, idx) => (
                  <tr key={idx}>
                    <td className="font-mono" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      {h.relativePath}
                    </td>
                    <td className="font-mono" style={{ fontWeight: 700 }}>
                      {h.riskScore}
                    </td>
                    <td>
                      <span className={`badge ${getSeverityBadgeClass(h.severity)}`}>{h.severity}</span>
                    </td>
                    <td>
                      <span className="badge font-mono" style={{ background: 'var(--bg-subtle)' }}>
                        {h.remediationPriority}
                      </span>
                    </td>
                    <td style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                      {h.primaryDriver}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {h.topFactor}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onSelectFile(h.relativePath)}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Actionable Engineering Recommendations */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <CheckCircle size={16} style={{ color: 'var(--sev-low)' }} />
            Actionable Engineering Recommendations
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {recommendations.map((rec, idx) => (
            <div
              key={idx}
              style={{
                padding: '14px 16px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-canvas)',
                border: '1px solid var(--border-color)',
                borderLeft: `4px solid ${
                  rec.severity === 'CRITICAL'
                    ? 'var(--sev-crit)'
                    : rec.severity === 'HIGH'
                    ? 'var(--sev-high)'
                    : 'var(--accent-blue)'
                }`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className={`badge ${getSeverityBadgeClass(rec.severity)}`}>{rec.severity}</span>
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{rec.title}</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                {rec.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

