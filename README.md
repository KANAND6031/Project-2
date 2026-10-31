# CodeInsight: Automated Codebase Health & Technical Debt Prioritization Platform

CodeInsight is a developer-focused static analysis platform that analyzes source repositories to identify technical debt hotspots, high-complexity functions, deep nesting, duplicate code blocks, and cyclic dependencies.

It pairs a high-performance **C++ analysis engine** with a **Node.js/Express REST backend**, a fast **In-Memory storage layer**, and a clean **React/Vite** dashboard.

---

## 1. System Architecture

```text
┌─────────────────────────┐
│     React Frontend      │  (Interactive Dashboard Metrics, Clone Viewer)
└───────────┬─────────────┘
            │ HTTP / REST
┌───────────▼─────────────┐
│  Node.js Express Server │  (API Gateway, In-Memory Storage, Job Queue)
└───────────┬─────────────┘
            │ Subprocess
            │ (JSON IPC)
┌───────────▼─────────────┐
│      C++ Analyzer       │  (Tree-sitter AST, Token Hashing, Duplicate Clones)
└─────────────────────────┘
```

1. **Frontend**: React + Vite single-page application.
2. **Backend**: Node.js/Express API with zero-dependency in-memory persistence for repositories, scans, and metrics.
3. **Engine**: Standalone C++ executable that performs file discovery, AST parsing, duplicate detection, and metric calculation, outputting structured JSON.

---

## 2. Project Directory Structure

```text
CodeInsight/
├── analyzer/                 # C++ Standalone Analysis Engine
│   ├── CMakeLists.txt        # CMake build configuration
│   ├── include/              # Public C++ header files
│   │   └── scanner.hpp
│   ├── src/                  # C++ implementation files
│   │   ├── main.cpp          # CLI entry point
│   │   └── scanner.cpp       # Directory scanner & line counter
│   ├── tests/                # Unit test fixtures & suites
│   └── third_party/          # External dependencies (Tree-sitter grammars)
├── backend/                  # Node.js / Express API Backend
│   ├── package.json
│   └── src/
│       ├── controllers/      # Request handlers
│       ├── jobs/             # Scan background tasks
│       ├── routes/           # Express route definitions
│       │   └── scanRoutes.js
│       ├── services/         # In-memory storage, queue & analyzer invocation
│       │   ├── storageService.js
│       │   └── analyzerService.js
│       ├── utils/            # Helper utilities
│       └── server.js         # API entry point
├── frontend/                 # React + Vite Dashboard
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── services/         # API client
│   │   └── utils/
│   ├── package.json
│   └── vite.config.js
├── test-fixtures/            # Controlled code samples for validation
│   └── complex-repo/
├── docs/                     # Architecture & metric documentation
├── .gitignore
└── README.md
```

---

## 3. Quick Start Guide

### Prerequisites
- **Node.js**: v18+ (tested on Node.js v24)
- **Zero Database Setup**: The application runs completely standalone with in-memory persistence. No PostgreSQL or database installation is required.

---

### Option A: Single-Server Mode (Recommended & Fastest)
The backend server serves both the interactive React dashboard and all REST API endpoints from a single port:

1. **Start the CodeInsight platform**:
   ```bash
   npm start
   ```

2. **Open your browser**:
   Navigate to [**http://localhost:5000**](http://localhost:5000).

---

### Option B: Development Mode (Vite Hot Module Replacement)
If you want to edit frontend or backend code with instant live reload:

1. **Terminal 1 — Start the Backend API** (port 5000):
   ```bash
   npm run dev:backend
   ```

2. **Terminal 2 — Start the Vite Frontend** (port 3000):
   ```bash
   npm run dev:frontend
   ```

3. **Open your browser**:
   Navigate to [**http://localhost:3000**](http://localhost:3000) (API requests to `/api` are automatically proxied to port 5000).

---

## 4. Automated Verification & Testing

```bash
# Run Unit Tests (AST parsing, clone detection, risk scorer)
npm test

# Run REST API Integration Tests (Endpoints, comparisons, reports, cascade delete)
npm run test:api
```

---

## 5. Phase Implementation Progress

- [x] **Phase 1: Project Setup & Baseline Integration** (Folder structure, C++ CLI executable, Node.js API integration, JSON IPC verification)
- [x] **Phase 2: Repository Scanner** (Extended file filtering, binary detection, exclusion rules, lexical state machine, unit tests)
- [x] **Phase 3: Source-Code Parsing & AST Metrics** (Tree-sitter AST integration, McCabe cyclomatic complexity, nesting depth, function length & params)
- [x] **Phase 4: Duplicate Code Detection** (Normalized token comparison, maximal clone pair expansion, duplicate percentage per file, trivial code suppression)
- [ ] **Phase 5: Dependency Graph Analysis** *(Deferred)*
- [ ] **Phase 6: Git History Analysis** *(Deferred)*
- [x] **Phase 7: Technical Debt Scoring** (Configurable explainable risk formula: $R = 0.45C + 0.35D + 0.20S$)
- [x] **Phase 8: Node.js API Expansion** (REST endpoints, queue management, compare, multi-format export)
- [x] **Phase 9: PostgreSQL Persistence** (10 relational tables, connection pool, transactional scan persistence)
- [x] **Phase 10: React Dashboard** (Developer tool design, Recharts risk distribution, clone viewer)
- [ ] **Phase 11: Testing, Benchmarking & Validation**
- [ ] **Phase 12: Docker & Docker Compose Containerization**
- [ ] **Phase 13: Presentation, Reports & Documentation**
