/**
 * CodeInsight Frontend API Client
 * Phase 10: Service Layer connecting to Phase 8/9 Backend REST Endpoints
 */

const BASE_URL = '/api';

async function handleResponse(res) {
  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson && errJson.error) {
        errorMsg = errJson.error;
      }
    } catch (_) {}
    throw new Error(errorMsg);
  }
  return res.json();
}

export const api = {
  // System Health
  async getHealth() {
    const res = await fetch(`${BASE_URL}/health`);
    return handleResponse(res);
  },

  // Repositories
  async getRepositories() {
    const res = await fetch(`${BASE_URL}/repositories`);
    return handleResponse(res);
  },

  async createRepository(data) {
    const res = await fetch(`${BASE_URL}/repositories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async deleteRepository(repoId) {
    const res = await fetch(`${BASE_URL}/repositories/${repoId}`, {
      method: 'DELETE'
    });
    return handleResponse(res);
  },

  // Scans
  async getScans(repoId = null) {
    const url = repoId ? `${BASE_URL}/scans?repoId=${repoId}` : `${BASE_URL}/scans`;
    const res = await fetch(url);
    return handleResponse(res);
  },

  async startScan(data, sync = false) {
    const url = sync ? `${BASE_URL}/scans?sync=true` : `${BASE_URL}/scans`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async getScanStatus(scanId) {
    const res = await fetch(`${BASE_URL}/scans/${scanId}/status`);
    return handleResponse(res);
  },

  async getScanSummary(scanId) {
    const res = await fetch(`${BASE_URL}/scans/${scanId}/summary`);
    return handleResponse(res);
  },

  async getScanFiles(scanId, params = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    });
    const query = searchParams.toString();
    const url = query ? `${BASE_URL}/scans/${scanId}/files?${query}` : `${BASE_URL}/scans/${scanId}/files`;
    const res = await fetch(url);
    return handleResponse(res);
  },

  async getFileMetrics(scanId, relativePath) {
    const encoded = encodeURIComponent(relativePath);
    const res = await fetch(`${BASE_URL}/scans/${scanId}/files/${encoded}`);
    return handleResponse(res);
  },

  async getDuplicateGroups(scanId) {
    const res = await fetch(`${BASE_URL}/scans/${scanId}/duplicates`);
    return handleResponse(res);
  },

  async getDependencies(scanId) {
    const res = await fetch(`${BASE_URL}/scans/${scanId}/dependencies`);
    return handleResponse(res);
  },

  async getFindings(scanId) {
    const res = await fetch(`${BASE_URL}/scans/${scanId}/findings`);
    return handleResponse(res);
  },

  async compareScans(baseScanId, targetScanId) {
    const res = await fetch(
      `${BASE_URL}/scans/compare?baseScanId=${encodeURIComponent(baseScanId)}&targetScanId=${encodeURIComponent(targetScanId)}`
    );
    return handleResponse(res);
  },

  getExportUrl(scanId, format = 'json') {
    return `${BASE_URL}/scans/${scanId}/export?format=${format}`;
  }
};

