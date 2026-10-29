# CodeInsight REST API Specification

This document details all REST API endpoints provided by the **CodeInsight Backend** in Phase 8.

Base URL: `http://localhost:5000`

---

## 1. System & Engine Status

### `GET /api/health`
Health check endpoint reporting API readiness and current server time.

**Response (`200 OK`)**:
```json
{
  "status": "healthy",
  "service": "CodeInsight Backend API",
  "version": "1.0.0",
  "timestamp": "2026-10-29T18:00:00.000Z"
}
```

### `GET /api/scans/engine-status`
Checks if the native C++ CLI executable (`codeinsight-analyzer.exe`) is present on disk.

**Response (`200 OK`)**:
```json
{
  "status": "ok",
  "engineExecutable": {
    "path": "c:/Users/krish/Downloads/Project 2/analyzer/bin/codeinsight-analyzer.exe",
    "available": true
  }
}
```

---

## 2. Repository Management

### `POST /api/repositories`
Registers a local repository for static analysis. Validates that the path exists and is a directory.

**Request Body**:
```json
{
  "name": "E-Commerce Core",
  "path": "C:/Projects/ecommerce-api",
  "gitUrl": "https://github.com/org/ecommerce-api.git",
  "description": "Payment and order processing services"
}
```

**Response (`201 Created` or `200 OK` if already registered)**:
```json
{
  "success": true,
  "message": "Repository registered successfully.",
  "data": {
    "id": "repo_9f8a12",
    "name": "E-Commerce Core",
    "path": "C:/Projects/ecommerce-api",
    "gitUrl": "https://github.com/org/ecommerce-api.git",
    "description": "Payment and order processing services",
    "createdAt": "2026-10-29T18:00:00.000Z",
    "lastScanId": null,
    "latestRiskScore": null,
    "scanCount": 0
  }
}
```

### `GET /api/repositories`
Lists all registered repositories.

**Response (`200 OK`)**:
```json
{
  "success": true,
  "count": 1,
  "data": [ ... ]
}
```

### `GET /api/repositories/:id`
Retrieves repository metadata by ID.

### `DELETE /api/repositories/:id`
Deletes a repository and all its associated scan jobs.

---

## 3. Scan Lifecycle & Execution

### `POST /api/scans`
Initiates a repository scan. By default, enqueues as a background asynchronous job.

**Query Parameters**:
- `sync`: `true` or `false` (default `false`). If `true`, awaits scan completion before responding.

**Request Body**:
```json
{
  "repoId": "repo_9f8a12",
  "repoPath": "C:/Projects/ecommerce-api",
  "timeoutMs": 30000,
  "weights": {
    "complexity": 0.45,
    "duplication": 0.35,
    "structural": 0.20
  }
}
```

**Response (`202 Accepted` for background scan)**:
```json
{
  "success": true,
  "message": "Scan enqueued successfully.",
  "data": {
    "scanId": "scan_8c3b7a19",
    "repoId": "repo_9f8a12",
    "repoPath": "C:/Projects/ecommerce-api",
    "status": "queued",
    "createdAt": "2026-10-29T18:00:00.000Z"
  }
}
```

### `GET /api/scans/:scanId/status`
Lightweight polling endpoint to check scan status.

**Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "scanId": "scan_8c3b7a19",
    "status": "completed",
    "createdAt": "2026-10-29T18:00:00.000Z",
    "startedAt": "2026-10-29T18:00:01.000Z",
    "completedAt": "2026-10-29T18:00:03.000Z",
    "elapsedMs": 2100,
    "error": null,
    "hasReport": true
  }
}
```

### `GET /api/scans`
Lists all scans. Supports filtering by `?repoId=...` and `?status=completed`.

### `GET /api/scans/:scanId`
Returns full scan record with complete JSON payload.

### `DELETE /api/scans/:scanId`
Deletes an individual scan record.

---

## 4. Granular Scan Sub-Resources

### `GET /api/scans/:scanId/summary`
Returns high-level executive metrics, language breakdowns, and technical debt rollups.

**Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "scanId": "scan_8c3b7a19",
    "summary": {
      "totalFiles": 14,
      "totalLines": 2400,
      "totalCodeLines": 1950,
      "totalFunctions": 42,
      "averageComplexity": 3.4,
      "overallDuplicationPercentage": 12.5
    },
    "technicalDebt": {
      "repositoryRiskScore": 30.5,
      "overallSeverity": "MODERATE",
      "formula": "R = 0.45*C + 0.35*D + 0.20*S",
      "riskDistribution": { "LOW": 10, "MODERATE": 3, "HIGH": 1, "CRITICAL": 0 }
    }
  }
}
```

### `GET /api/scans/:scanId/files`
Returns analyzed source files with filtering, sorting, and pagination.

**Query Parameters**:
- `severity`: `LOW`, `MODERATE`, `HIGH`, `CRITICAL`
- `language`: `cpp`, `javascript`, `typescript`
- `search`: Filter by file path or file name substring
- `sort`: `riskScore` (default), `totalLines`, `maxComplexity`
- `order`: `desc` (default) or `asc`
- `limit`: Number of items per page (default `50`)
- `offset`: Starting offset index (default `0`)

**Response (`200 OK`)**:
```json
{
  "success": true,
  "pagination": { "total": 14, "offset": 0, "limit": 10, "returned": 10 },
  "data": [
    {
      "relativePath": "src/services/billing.js",
      "language": "javascript",
      "totalLines": 450,
      "riskScore": 65.3,
      "severity": "HIGH",
      "remediationPriority": { "priority": "P2", "label": "High" }
    }
  ]
}
```

### `GET /api/scans/:scanId/files/:fileId`
Deep dive metrics for an individual source file including:
- AST function list with parameter counts, line lengths, and cyclomatic complexities
- Sub-scores ($C$, $D$, $S$, $L$, $N$, $P$)
- Contributing metrics and percentage breakdown
- Human-readable risk factors

### `GET /api/scans/:scanId/duplicates`
Returns all identified Type-1 duplicate blocks and clone clusters.

### `GET /api/scans/:scanId/dependencies`
Returns file nodes and dependency edges formatted for **Cytoscape.js** visualization.

### `GET /api/scans/:scanId/findings`
Returns top technical debt hotspots and actionable engineering recommendations.

---

## 5. Differential Scan Comparison

### `GET /api/scans/compare?baseScanId=:baseId&targetScanId=:targetId`
Compares an earlier baseline scan against a later target scan to detect regressions or improvements.

**Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "trajectory": "DEGRADED",
    "summaryDeltas": {
      "deltaRiskScore": 5.4,
      "deltaTotalFiles": 2,
      "deltaTotalLines": 350,
      "deltaAverageComplexity": 0.8,
      "deltaDuplicationPercentage": 3.2
    },
    "fileCounts": {
      "added": 2,
      "removed": 0,
      "modified": 12,
      "degraded": 3,
      "improved": 1
    },
    "degradedFiles": [
      {
        "relativePath": "src/paymentGateway.cpp",
        "baseRiskScore": 52.0,
        "targetRiskScore": 68.5,
        "deltaRiskScore": 16.5,
        "status": "DEGRADED"
      }
    ]
  }
}
```

---

## 6. Report Export

### `GET /api/scans/:scanId/export?format=json|markdown|csv`
Exports the complete audit report:
- `?format=json`: Application JSON with full raw AST and metric data.
- `?format=markdown`: Formatted GitHub-style Markdown audit document.
- `?format=csv`: Tabular spreadsheet of all analyzed files.

