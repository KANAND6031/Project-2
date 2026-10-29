import React, { useState } from 'react';
import { X, Play, Sliders, FolderGit2, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

export default function NewScanModal({ repositories, activeRepo, onClose, onScanStarted }) {
  const [repoMode, setRepoMode] = useState(repositories.length > 0 ? 'existing' : 'new');
  const [selectedRepoId, setSelectedRepoId] = useState(activeRepo?.id || repositories[0]?.id || '');
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoPath, setNewRepoPath] = useState('');

  // Formula weights
  const [weightComplexity, setWeightComplexity] = useState(0.45);
  const [weightDuplication, setWeightDuplication] = useState(0.35);
  const [weightStructural, setWeightStructural] = useState(0.20);
  const [isSync, setIsSync] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const totalWeight = parseFloat((weightComplexity + weightDuplication + weightStructural).toFixed(2));
  const isWeightValid = Math.abs(totalWeight - 1.0) < 0.01;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isWeightValid) {
      setError(`Weights must sum to 1.00 (Current sum: ${totalWeight})`);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let payload = {
        weights: {
          complexity: weightComplexity,
          duplication: weightDuplication,
          structural: weightStructural
        }
      };

      if (repoMode === 'existing') {
        const repo = repositories.find((r) => r.id === selectedRepoId);
        if (!repo) throw new Error('Please select a valid repository.');
        payload.repoId = repo.id;
        payload.repoPath = repo.path;
      } else {
        if (!newRepoPath.trim()) throw new Error('Repository path is required.');
        // First register new repository
        const createdRepo = await api.createRepository({
          name: newRepoName.trim() || newRepoPath.trim().split(/[\\/]/).pop(),
          path: newRepoPath.trim()
        });
        payload.repoId = createdRepo.data.id;
        payload.repoPath = createdRepo.data.path;
      }

      const scanRes = await api.startScan(payload, isSync);
      onScanStarted(scanRes.data);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to trigger scan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '600px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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
            <Play size={20} style={{ color: 'var(--accent-blue)' }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Start New Codebase Scan</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Static analysis, duplicate detection, and technical debt risk calculation
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--sev-crit-bg)',
              color: 'var(--sev-crit)',
              borderRadius: '6px',
              fontSize: '0.85rem',
              marginBottom: '16px'
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Target Selection */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Target Repository
            </label>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="repoMode"
                  value="existing"
                  checked={repoMode === 'existing'}
                  onChange={() => setRepoMode('existing')}
                  disabled={repositories.length === 0}
                />
                Existing Repository ({repositories.length})
              </label>
              <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="repoMode"
                  value="new"
                  checked={repoMode === 'new'}
                  onChange={() => setRepoMode('new')}
                />
                New Local Path
              </label>
            </div>

            {repoMode === 'existing' ? (
              <select
                className="form-input"
                style={{ width: '100%' }}
                value={selectedRepoId}
                onChange={(e) => setSelectedRepoId(e.target.value)}
              >
                {repositories.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.path})
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Repository Name (e.g. Project 2)"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Absolute Directory Path (e.g. C:\Users\krish\Downloads\Project 2)"
                  value={newRepoPath}
                  onChange={(e) => setNewRepoPath(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          {/* Formula Weights Configuration */}
          <div
            style={{
              padding: '16px',
              background: 'var(--bg-canvas)',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sliders size={14} style={{ color: 'var(--accent-blue)' }} />
                Configurable Risk Formula Weights (R = C*w_c + D*w_d + S*w_s)
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: '0.78rem',
                  color: isWeightValid ? 'var(--sev-low)' : 'var(--sev-crit)',
                  fontWeight: 600
                }}
              >
                Sum: {totalWeight.toFixed(2)} / 1.00
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Complexity (C)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="form-input font-mono"
                  style={{ width: '100%' }}
                  value={weightComplexity}
                  onChange={(e) => setWeightComplexity(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Duplication (D)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="form-input font-mono"
                  style={{ width: '100%' }}
                  value={weightDuplication}
                  onChange={(e) => setWeightDuplication(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Structural (S)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="form-input font-mono"
                  style={{ width: '100%' }}
                  value={weightStructural}
                  onChange={(e) => setWeightStructural(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          {/* Execution Mode */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Execution Strategy
            </label>
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="syncMode"
                  checked={isSync}
                  onChange={() => setIsSync(true)}
                />
                Synchronous (Execute immediately & render report)
              </label>
              <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="syncMode"
                  checked={!isSync}
                  onChange={() => setIsSync(false)}
                />
                Asynchronous Queue (Background processing)
              </label>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !isWeightValid}
            >
              <Play size={14} />
              <span>{loading ? 'Starting Scan...' : 'Start Scan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

