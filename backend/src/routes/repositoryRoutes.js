/**
 * CodeInsight Repository Routes
 * Phase 8: Repository API Endpoints
 */

const express = require('express');
const router = express.Router();
const repositoryController = require('../controllers/repositoryController');

router.post('/', (req, res) => repositoryController.create(req, res));
router.get('/', (req, res) => repositoryController.list(req, res));
router.get('/:id', (req, res) => repositoryController.getById(req, res));
router.delete('/:id', (req, res) => repositoryController.delete(req, res));

module.exports = router;

