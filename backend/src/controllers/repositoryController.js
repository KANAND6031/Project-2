/**
 * CodeInsight Repository Controller
 * Phase 8: Repository Management API
 */

const fs = require('fs');
const path = require('path');
const storageService = require('../services/storageService');

class RepositoryController {
  /**
   * POST /api/repositories
   * Registers a new repository for analysis.
   */
  create(req, res) {
    try {
      const { name, path: repoPath, gitUrl, description } = req.body;

      if (!repoPath || typeof repoPath !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing required field "path" (valid directory path string).'
        });
      }

      const resolved = path.resolve(repoPath);
      if (!fs.existsSync(resolved)) {
        return res.status(400).json({
          success: false,
          error: `Directory does not exist at specified path: ${resolved}`
        });
      }

      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return res.status(400).json({
          success: false,
          error: `Path is not a directory: ${resolved}`
        });
      }

      // Check if already registered
      const existing = storageService.findRepositoryByPath(resolved);
      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Repository already registered.',
          data: existing
        });
      }

      const repo = storageService.createRepository({
        name: name || path.basename(resolved),
        path: resolved,
        gitUrl,
        description
      });

      return res.status(201).json({
        success: true,
        message: 'Repository registered successfully.',
        data: repo
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/repositories
   * Lists all registered repositories.
   */
  list(req, res) {
    try {
      const repos = storageService.listRepositories();
      return res.status(200).json({
        success: true,
        count: repos.length,
        data: repos
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/repositories/:id
   * Retrieves an individual repository by ID.
   */
  getById(req, res) {
    try {
      const repo = storageService.getRepositoryById(req.params.id);
      if (!repo) {
        return res.status(404).json({
          success: false,
          error: `Repository not found with ID: ${req.params.id}`
        });
      }

      return res.status(200).json({
        success: true,
        data: repo
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * DELETE /api/repositories/:id
   * Removes a registered repository and its associated scans.
   */
  delete(req, res) {
    try {
      const deleted = storageService.deleteRepository(req.params.id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: `Repository not found with ID: ${req.params.id}`
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Repository and associated scans deleted successfully.'
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
}

module.exports = new RepositoryController();

