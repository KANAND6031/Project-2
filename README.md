# CodeInsight: Automated Codebase Health & Technical Debt Prioritization Platform

CodeInsight is a developer-focused static analysis platform that analyzes source repositories to identify technical debt hotspots, high-complexity functions, deep nesting, duplicate code blocks, and cyclic dependencies.

It pairs a high-performance **C++ analysis engine** with a **Node.js/Express REST backend**, a **PostgreSQL** persistence layer, and a clean **React/Vite** dashboard.

---

## 1. System Architecture

```text
┌─────────────────────────┐
│     React Frontend      │  (Interactive Dashboard, Metrics, Cytoscape Graph)
└───────────┬─────────────┘
            │ HTTP / REST
┌───────────▼─────────────┐
│  Node.js Express Server │  (API Gateway, Process Orchestrator, Job Queue)
└─────┬──────────────┬────┘
      │              │
      │ Subprocess   │ SQL Queries
      │ (JSON IPC)   │
┌─────▼──────────┐ ┌─▼──────────────────┐
│  C++ Analyzer  │ │ PostgreSQL Storage │
│ (Tree-sitter)  │ │ (Scans, Metrics)   │
└────────────────┘ └────────────────────┘
```

1. **Frontend**: React + Vite single-page application.
2. **Backend**: Node.js/Express API that receives scan requests and manages worker execution.
3. **Engine**: Standalone C++ executable that performs file discovery, AST parsing, duplicate detection, and metric calculation, outputting structured JSON.
4. **Database**: PostgreSQL storing repositories, scan snapshots, file-level metrics, and duplicate groups.

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
│       ├── database/         # PostgreSQL connection & queries
│       ├── jobs/             # Scan background tasks
│       ├── middleware/       # Auth, validation, rate limiting
│       ├── routes/           # Express route definitions
│       │   └── scanRoutes.js
│       ├── services/         # Orchestration & analyzer invocation
│       │   └── analyzerService.js
│       ├── utils/            # Helper utilities
│       └── server.js         # API entry point
├── frontend/                 # React + Vite Dashboard
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # View pages (Overview, Explorer, Graph)
│   │   ├── services/         # API client
│   │   └── utils/
│   ├── package.json
│   └── vite.config.js
├── database/                 # Database Schemas & Migrations
│   ├── schema.sql
│   └── migrations/
├── test-fixtures/            # Controlled code samples for validation
│   └── sample-repo/
├── docs/                     # Architecture & metric documentation
├── .env.example              # Environment variables template
├── .gitignore
└── README.md
```

---

## 3. Phase Implementation Progress

- [x] **Phase 1: Project Setup & Baseline Integration** (Folder structure, C++ CLI executable, Node.js API integration, JSON IPC verification)
- [x] **Phase 2: Repository Scanner** (Extended file filtering, binary detection, exclusion rules, lexical state machine, unit tests)
- [x] **Phase 3: Source-Code Parsing & AST Metrics** (Tree-sitter AST integration, McCabe cyclomatic complexity, nesting depth, function length & params)
- [ ] **Phase 4: Duplicate Code Detection** (Token normalization, rolling hash / suffix arrays)
- [ ] **Phase 5: Dependency Graph Analysis** (Import/include extraction, fan-in/fan-out, Tarjan cycle detection)
- [ ] **Phase 6: Git History Analysis** (Commit churn, modification frequency, co-change coupling)
- [ ] **Phase 7: Technical Debt Scoring** (Configurable explainable risk formula)
- [ ] **Phase 8: Node.js API Expansion** (REST endpoints, queue management, timeouts)
- [ ] **Phase 9: PostgreSQL Persistence** (Relational schema, indexing, scan history)
- [ ] **Phase 10: React Dashboard** (Developer tool design, Recharts, Cytoscape graph)
- [ ] **Phase 11: Testing, Benchmarking & Validation**
- [ ] **Phase 12: Security & Reliability Hardening**
- [ ] **Phase 13: Presentation, Reports & Documentation**
