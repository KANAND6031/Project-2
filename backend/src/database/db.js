/**
 * CodeInsight PostgreSQL Database Client & Connection Pool
 * Phase 9: Relational Persistence Layer
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'codeinsight',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20, // Maximum connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000 // Quick timeout to prevent stalling if DB offline
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.warn('[PostgreSQL Pool Warning]:', err.message);
});

class DatabaseClient {
  constructor() {
    this.pool = pool;
    this.config = poolConfig;
  }

  /**
   * Executes a parameterized query using a pooled connection.
   * @param {string} text - SQL query text with $1, $2 placeholders
   * @param {Array} params - Parameter array
   */
  async query(text, params = []) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      return res;
    } catch (err) {
      console.error('[DB Query Error]:', { text, error: err.message });
      throw err;
    }
  }

  /**
   * Retrieves a client from the pool for multi-query transactions.
   */
  async getClient() {
    return await this.pool.connect();
  }

  /**
   * Executes a callback function inside a database transaction.
   * Automatically executes BEGIN, COMMIT, or ROLLBACK on failure.
   * @param {Function} callback - Async function receiving the transaction client
   */
  async withTransaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Tests connection to the PostgreSQL database.
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      const res = await this.query('SELECT NOW() AS now, version() AS version');
      return {
        connected: true,
        timestamp: res.rows[0].now,
        version: res.rows[0].version
      };
    } catch (err) {
      return {
        connected: false,
        error: err.message
      };
    }
  }

  /**
   * Closes the connection pool.
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = new DatabaseClient();

