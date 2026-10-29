-- CodeInsight PostgreSQL Database Schema
-- Phase 9: Relational Schema Definition
-- Creates tables for Repositories, Scans, Files, Functions, Duplicates, Dependencies, and Findings.

-- Enable UUID extension if supported
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Repositories
CREATE TABLE IF NOT EXISTS repositories (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    path TEXT NOT NULL UNIQUE,
    git_url TEXT,
    description TEXT,
    default_branch VARCHAR(100) DEFAULT 'main',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Scans
CREATE TABLE IF NOT EXISTS scans (
    id VARCHAR(64) PRIMARY KEY,
    repository_id VARCHAR(64) NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    commit_hash VARCHAR(64),
    branch VARCHAR(100),
    status VARCHAR(32) NOT NULL DEFAULT 'queued', -- 'queued', 'running', 'completed', 'failed'
    engine_version VARCHAR(32) DEFAULT '1.2.0',
    weights JSONB,
    error_message TEXT,
    duration_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- 3. Scan Summaries
CREATE TABLE IF NOT EXISTS scan_summaries (
    id SERIAL PRIMARY KEY,
    scan_id VARCHAR(64) NOT NULL UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
    total_files INTEGER NOT NULL DEFAULT 0,
    total_lines INTEGER NOT NULL DEFAULT 0,
    total_code_lines INTEGER NOT NULL DEFAULT 0,
    total_comment_lines INTEGER NOT NULL DEFAULT 0,
    total_blank_lines INTEGER NOT NULL DEFAULT 0,
    total_size_bytes BIGINT NOT NULL DEFAULT 0,
    total_functions INTEGER NOT NULL DEFAULT 0,
    average_complexity NUMERIC(6, 2) DEFAULT 0.0,
    max_complexity INTEGER DEFAULT 0,
    high_complexity_function_count INTEGER DEFAULT 0,
    total_duplicate_blocks INTEGER DEFAULT 0,
    total_duplicate_lines INTEGER DEFAULT 0,
    overall_duplication_percentage NUMERIC(5, 2) DEFAULT 0.0,
    repository_risk_score NUMERIC(5, 2) DEFAULT 0.0,
    overall_severity VARCHAR(32) DEFAULT 'LOW',
    formula VARCHAR(100) DEFAULT 'R = 0.45*C + 0.35*D + 0.20*S',
    risk_distribution JSONB DEFAULT '{}',
    files_by_language JSONB DEFAULT '{}',
    lines_by_language JSONB DEFAULT '{}'
);

-- 4. Source Files
CREATE TABLE IF NOT EXISTS source_files (
    id VARCHAR(64) PRIMARY KEY,
    scan_id VARCHAR(64) NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    absolute_path TEXT,
    file_name VARCHAR(255) NOT NULL,
    extension VARCHAR(32) NOT NULL,
    language VARCHAR(64) NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    total_lines INTEGER NOT NULL DEFAULT 0,
    code_lines INTEGER NOT NULL DEFAULT 0,
    comment_lines INTEGER NOT NULL DEFAULT 0,
    blank_lines INTEGER NOT NULL DEFAULT 0,
    max_line_length INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_scan_file UNIQUE (scan_id, relative_path)
);

-- 5. File Metrics (Technical Debt, Complexity, Duplication, Structure)
CREATE TABLE IF NOT EXISTS file_metrics (
    id SERIAL PRIMARY KEY,
    source_file_id VARCHAR(64) NOT NULL UNIQUE REFERENCES source_files(id) ON DELETE CASCADE,
    scan_id VARCHAR(64) NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    max_complexity INTEGER DEFAULT 0,
    average_complexity NUMERIC(6, 2) DEFAULT 0.0,
    max_nesting_depth INTEGER DEFAULT 0,
    total_functions INTEGER DEFAULT 0,
    complex_function_count INTEGER DEFAULT 0,
    duplicate_lines INTEGER DEFAULT 0,
    duplicate_percentage NUMERIC(5, 2) DEFAULT 0.0,
    complexity_score NUMERIC(5, 2) DEFAULT 0.0,  -- C (45%)
    duplication_score NUMERIC(5, 2) DEFAULT 0.0, -- D (35%)
    length_score NUMERIC(5, 2) DEFAULT 0.0,      -- L (40% of S)
    nesting_score NUMERIC(5, 2) DEFAULT 0.0,     -- N (35% of S)
    parameter_score NUMERIC(5, 2) DEFAULT 0.0,   -- P (25% of S)
    structural_score NUMERIC(5, 2) DEFAULT 0.0,  -- S (20%)
    risk_score NUMERIC(5, 2) DEFAULT 0.0,        -- R = 0.45C + 0.35D + 0.20S
    severity VARCHAR(32) DEFAULT 'LOW',          -- LOW, MODERATE, HIGH, CRITICAL
    remediation_priority VARCHAR(8) DEFAULT 'P4',-- P1, P2, P3, P4
    remediation_score NUMERIC(5, 2) DEFAULT 0.0,
    remediation_label VARCHAR(32) DEFAULT 'Low',
    risk_factors JSONB DEFAULT '[]',
    contributing_metrics JSONB DEFAULT '[]'
);

-- 6. Function Metrics (AST Analysis)
CREATE TABLE IF NOT EXISTS function_metrics (
    id SERIAL PRIMARY KEY,
    source_file_id VARCHAR(64) NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
    scan_id VARCHAR(64) NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL DEFAULT 1,
    end_column INTEGER NOT NULL DEFAULT 1,
    line_count INTEGER NOT NULL,
    parameter_count INTEGER NOT NULL DEFAULT 0,
    cyclomatic_complexity INTEGER NOT NULL DEFAULT 1,
    max_nesting_depth INTEGER NOT NULL DEFAULT 0,
    is_high_complexity BOOLEAN NOT NULL DEFAULT FALSE
);

-- 7. Duplicate Groups
CREATE TABLE IF NOT EXISTS duplicate_groups (
    id VARCHAR(64) PRIMARY KEY,
    scan_id VARCHAR(64) NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    line_count INTEGER NOT NULL,
    token_count INTEGER DEFAULT 0,
    sample_snippet TEXT
);

-- 8. Duplicate Members (Instances of Clones)
CREATE TABLE IF NOT EXISTS duplicate_members (
    id SERIAL PRIMARY KEY,
    group_id VARCHAR(64) NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
    source_file_id VARCHAR(64) REFERENCES source_files(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    line_count INTEGER NOT NULL
);

-- 9. Dependencies (Static Coupling Graph)
CREATE TABLE IF NOT EXISTS dependencies (
    id SERIAL PRIMARY KEY,
    scan_id VARCHAR(64) NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    source_file_id VARCHAR(64) REFERENCES source_files(id) ON DELETE CASCADE,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    import_type VARCHAR(32) DEFAULT 'STATIC'
);

-- 10. Findings (Hotspots & Actionable Recommendations)
CREATE TABLE IF NOT EXISTS findings (
    id SERIAL PRIMARY KEY,
    scan_id VARCHAR(64) NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL, -- 'HOTSPOT', 'RECOMMENDATION'
    severity VARCHAR(32) NOT NULL, -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    related_file_path TEXT,
    finding_code VARCHAR(64)
);

-- --- INDEXES FOR PERFORMANCE ---
CREATE INDEX IF NOT EXISTS idx_scans_repo ON scans(repository_id);
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
CREATE INDEX IF NOT EXISTS idx_source_files_scan ON source_files(scan_id);
CREATE INDEX IF NOT EXISTS idx_source_files_path ON source_files(scan_id, relative_path);
CREATE INDEX IF NOT EXISTS idx_file_metrics_risk ON file_metrics(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_file_metrics_sev ON file_metrics(severity);
CREATE INDEX IF NOT EXISTS idx_file_metrics_file ON file_metrics(source_file_id);
CREATE INDEX IF NOT EXISTS idx_function_metrics_file ON function_metrics(source_file_id);
CREATE INDEX IF NOT EXISTS idx_function_metrics_comp ON function_metrics(cyclomatic_complexity DESC);
CREATE INDEX IF NOT EXISTS idx_dup_members_group ON duplicate_members(group_id);
CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);

