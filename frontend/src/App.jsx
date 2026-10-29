import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  FileCode,
  Copy,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { api } from './services/api';
import Navbar from './components/Navbar';
import Overview from './components/Overview';
import FileList from './components/FileList';
import FileDetail from './components/FileDetail';
import DuplicateViewer from './components/DuplicateViewer';
import NewScanModal from './components/NewScanModal';

export default function App() {
  const [repositories, setRepositories] = useState([]);
  const [activeRepo, setActiveRepo] = useState(null);
  const [scans, setScans] = useState([]);
  const [activeScan, setActiveScan] = useState(null);

  const [activeTab, setActiveTab] = useState('overview');
  const [scanSummary, setScanSummary] = useState(null);
  const [technicalDebt, setTechnicalDebt] = useState(null);
  const [sourceFiles, setSourceFiles] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedFilePath, setSelectedFilePath] = useState(null);
  const [showNewScanModal, setShowNewScanModal] = useState(false);

  // 1. Initial Load: Repositories
  const loadRepositories = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getRepositories();
      const repos = res.data || [];
      setRepositories(repos);
      if (repos.length > 0 && !activeRepo) {
        setActiveRepo(repos[0]);
      }
    } catch (err) {
      setError(`Failed to connect to backend API: ${err.message}`);
    }
  }, [activeRepo]);

  useEffect(() => {
    loadRepositories();
  }, [loadRepositories]);

  // 2. Load Scans when Active Repo changes
  const loadScans = useCallback(async (repoId) => {
    if (!repoId) return;
    try {
      const res = await api.getScans(repoId);
      const scansList = res.data || [];
      setScans(scansList);
      if (scansList.length > 0) {
        setActiveScan(scansList[0]);
      } else {
        setActiveScan(null);
        setScanSummary(null);
        setTechnicalDebt(null);
        setSourceFiles([]);
      }
    } catch (err) {
      setError(`Failed to load scans: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    if (activeRepo) {
      loadScans(activeRepo.id);
    }
  }, [activeRepo, loadScans]);

  // 3. Load Scan Details when Active Scan changes
  const loadActiveScanDetails = useCallback(async (scan) => {
    if (!scan) return;
    const scanId = scan.id || scan.scanId;
    if (!scanId || scan.status !== 'completed') {
      setScanSummary(null);
      setTechnicalDebt(null);
      setSourceFiles([]);
      return;
    }

    try {
      setLoading(true);
      const [sumRes, filesRes] = await Promise.all([
        api.getScanSummary(scanId),
        api.getScanFiles(scanId, { limit: 500 })
      ]);

      setScanSummary(sumRes.data?.summary || null);
      setTechnicalDebt(sumRes.data?.technicalDebt || null);
      setSourceFiles(filesRes.data || []);
    } catch (err) {
      setError(`Failed to load scan details: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeScan) {
      loadActiveScanDetails(activeScan);
    }
  }, [activeScan, loadActiveScanDetails]);

  // 4. Polling for background/asynchronous scans
  useEffect(() => {
    const scanId = activeScan?.id || activeScan?.scanId;
    if (!activeScan || !scanId || activeScan.status === 'completed' || activeScan.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const statusRes = await api.getScanStatus(scanId);
        const updatedStatus = statusRes.data?.status;
        if (updatedStatus && updatedStatus !== activeScan.status) {
          setActiveScan((prev) => ({ ...prev, status: updatedStatus }));
          if (updatedStatus === 'completed' || updatedStatus === 'failed') {
            loadScans(activeRepo?.id);
          }
        }
      } catch (e) {
        console.error('Scan polling error:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeScan, activeRepo, loadScans]);

  // Handlers
  const handleScanStarted = async (newScan) => {
    if (newScan) {
      const scanId = newScan.id || newScan.scanId;
      const normalized = { ...newScan, id: scanId };
      setActiveScan(normalized);

      // If this scan belongs to a new repository, reload repositories
      if (newScan.repoId && (!activeRepo || activeRepo.id !== newScan.repoId)) {
        try {
          const res = await api.getRepositories();
          const repos = res.data || [];
          setRepositories(repos);
          const found = repos.find((r) => r.id === newScan.repoId);
          if (found) setActiveRepo(found);
        } catch (_) {}
      }

      // Refresh scans for this repository
      loadScans(newScan.repoId || activeRepo?.id);
    }
  };

  const handleExport = (format) => {
    if (!activeScan) return;
    const scanId = activeScan.id || activeScan.scanId;
    if (!scanId) return;
    const url = api.getExportUrl(scanId, format);
    window.open(url, '_blank');
  };

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <Navbar
        repositories={repositories}
        activeRepo={activeRepo}
        onSelectRepo={(repo) => setActiveRepo(repo)}
        activeScan={activeScan}
        onOpenNewScan={() => setShowNewScanModal(true)}
        onExport={handleExport}
      />

      {/* Main Container */}
      <main className="main-content">
        {/* Error Banner */}
        {error && (
          <div
            style={{
              padding: '14px 18px',
              backgroundColor: 'var(--sev-crit-bg)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              color: 'var(--sev-crit)',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={18} />
              <span style={{ fontSize: '0.85rem' }}>{error}</span>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setError(null);
                loadRepositories();
              }}
            >
              <RefreshCw size={13} />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Scan Status Banner for Queued / Running Scans */}
        {activeScan && activeScan.status !== 'completed' && (
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Scan in Progress ({String(activeScan.status || 'running').toUpperCase()})
              </span>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Executing Tree-sitter AST parsing, duplicate token detection, and risk score calculation...
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw size={16} className="spin" style={{ color: 'var(--accent-blue)' }} />
              <span className="font-mono" style={{ fontSize: '0.82rem', color: 'var(--accent-blue)' }}>
                Auto-updating
              </span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="tabs-bar">
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <LayoutDashboard size={16} />
            <span>Overview & Hotspots</span>
          </button>

          <button
            className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            <FileCode size={16} />
            <span>Files & Metrics ({sourceFiles.length})</span>
          </button>

          <button
            className={`tab-btn ${activeTab === 'duplicates' ? 'active' : ''}`}
            onClick={() => setActiveTab('duplicates')}
          >
            <Copy size={16} />
            <span>Duplicate Code</span>
          </button>
        </div>

        {/* Tab Content Views */}
        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '64px 24px' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Loading codebase metrics...</p>
          </div>
        ) : (
          <div>
            {activeTab === 'overview' && (
              <Overview
                summary={scanSummary}
                technicalDebt={technicalDebt}
                onSelectFile={(path) => setSelectedFilePath(path)}
                onSwitchTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'files' && (
              <FileList
                files={sourceFiles}
                onSelectFile={(path) => setSelectedFilePath(path)}
              />
            )}

            {activeTab === 'duplicates' && (
              <DuplicateViewer scanId={activeScan?.id} />
            )}
          </div>
        )}
      </main>

      {/* File Detail Modal */}
      {selectedFilePath && activeScan && (
        <FileDetail
          scanId={activeScan.id}
          relativePath={selectedFilePath}
          onClose={() => setSelectedFilePath(null)}
        />
      )}

      {/* New Scan Modal */}
      {showNewScanModal && (
        <NewScanModal
          repositories={repositories}
          activeRepo={activeRepo}
          onClose={() => setShowNewScanModal(false)}
          onScanStarted={handleScanStarted}
        />
      )}
    </div>
  );
}

