const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const scanRoutes = require('./routes/scanRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/scan', scanRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'CodeInsight Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('[Internal Error]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[CodeInsight API] Server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
