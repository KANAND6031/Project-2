/**
 * CodeInsight Storage Service
 * High-Performance In-Memory Repository & Scan Persistence
 *
 * Provides standalone, zero-dependency persistence for scans, metrics, and repositories.
 * No external database server (PostgreSQL) required to run the platform.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class StorageService {
  constructor() {
    this.repositories = new Map();
    this.scans = new Map();

    // Auto-register default sample repository if available
    const sampleRepoPath = path.resolve(__dirname, '../../../test-fixtures/complex-repo');
    if (fs.existsSync(sampleRepoPath)) {
      this.createRepository({
        name: 'Complex Test Repository',
        path: sampleRepoPath,
        description: 'Automated test fixture with varied complexity and nesting'
      });
    }
  }

  // --- REPOSITORY METHODS ---

  createRepository(data) {
    const id = data.id || `repo_${crypto.randomBytes(6).toString('hex')}`;
    const repo = {
      id,
      name: data.name || path.basename(data.path),
      path: path.resolve(data.path).replace(/\\/g, '/'),
      gitUrl: data.gitUrl || null,
      description: data.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastScanId: null,
      lastScannedAt: null,
      latestRiskScore: null,
      latestSeverity: null,
      scanCount: 0
    };

    this.repositories.set(id, repo);
    return repo;
  }

  listRepositories() {
    return Array.from(this.repositories.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  getRepositoryById(id) {
    return this.repositories.get(id) || null;
  }

  findRepositoryByPath(targetPath) {
    const normalized = path.resolve(targetPath).replace(/\\/g, '/');
    for (const repo of this.repositories.values()) {
      if (repo.path === normalized) return repo;
    }
    return null;
  }

  updateRepository(id, updates) {
    const repo = this.repositories.get(id);
    if (!repo) return null;

    Object.assign(repo, updates, { updatedAt: new Date().toISOString() });
    this.repositories.set(id, repo);
    return repo;
  }

  deleteRepository(id) {
    for (const [scanId, scan] of this.scans.entries()) {
      if (scan.repoId === id) {
        this.scans.delete(scanId);
      }
    }
    return this.repositories.delete(id);
  }

  // --- SCAN METHODS ---

  createScan(data) {
    const id = data.id || `scan_${crypto.randomBytes(8).toString('hex')}`;
    const scan = {
      id,
      repoId: data.repoId || null,
      repoPath: data.repoPath ? path.resolve(data.repoPath).replace(/\\/g, '/') : null,
      status: data.status || 'queued',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      durationMs: 0,
      weights: data.weights || null,
      error: null,
      report: null
    };

    this.scans.set(id, scan);
    return scan;
  }

  listScans(filter = {}) {
    let scans = Array.from(this.scans.values());

    if (filter.repoId) {
      scans = scans.filter(s => s.repoId === filter.repoId);
    }
    if (filter.status) {
      scans = scans.filter(s => s.status === filter.status);
    }

    return scans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getScanById(id) {
    return this.scans.get(id) || null;
  }

  updateScan(id, updates) {
    const scan = this.scans.get(id);
    if (!scan) return null;

    Object.assign(scan, updates);
    this.scans.set(id, scan);
    return scan;
  }

  deleteScan(id) {
    return this.scans.delete(id);
  }

  clearAll() {
    this.repositories.clear();
    this.scans.clear();
  }
}

module.exports = new StorageService();
