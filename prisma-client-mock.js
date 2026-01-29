const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Create pool from environment
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'replyflow',
});

// Helper to convert snake_case to camelCase
function toCamelCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);

  const converted = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    converted[camelKey] = obj[key];
  }
  return converted;
}

// Helper to convert camelCase to snake_case
function toSnakeCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);

  const converted = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    converted[snakeKey] = obj[key];
  }
  return converted;
}

// Generic model creator
function createModel(tableName, idField = 'id') {
  return {
    async findUnique({ where, select }) {
      const key = Object.keys(where)[0];
      const value = where[key];
      const selectFields = select ? Object.keys(select).join(', ') : '*';

      const result = await pool.query(
        `SELECT ${selectFields} FROM ${tableName} WHERE ${key} = $1 LIMIT 1`,
        [value]
      );
      return result.rows[0] ? toCamelCase(result.rows[0]) : null;
    },

    async findMany({ where = {}, orderBy, take, skip, select } = {}) {
      const whereKeys = Object.keys(where);
      const selectFields = select ? Object.keys(select).join(', ') : '*';
      let query = `SELECT ${selectFields} FROM ${tableName}`;
      const values = [];

      if (whereKeys.length > 0) {
        const conditions = whereKeys.map((key, i) => `${key} = $${i + 1}`);
        query += ` WHERE ${conditions.join(' AND ')}`;
        values.push(...whereKeys.map(k => where[k]));
      }

      if (orderBy) {
        const orderKey = Object.keys(orderBy)[0];
        const orderDir = orderBy[orderKey];
        query += ` ORDER BY ${orderKey} ${orderDir.toUpperCase()}`;
      }

      if (take) query += ` LIMIT ${take}`;
      if (skip) query += ` OFFSET ${skip}`;

      const result = await pool.query(query, values);
      return result.rows.map(toCamelCase);
    },

    async findFirst({ where = {}, select } = {}) {
      const result = await this.findMany({ where, select, take: 1 });
      return result[0] || null;
    },

    async create({ data }) {
      const snakeData = toSnakeCase(data);
      const id = snakeData.id || uuidv4();
      snakeData.id = id;

      const keys = Object.keys(snakeData);
      const values = Object.values(snakeData);
      const placeholders = keys.map((_, i) => `$${i + 1}`);

      const query = `
        INSERT INTO ${tableName} (${keys.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING *
      `;

      const result = await pool.query(query, values);
      return toCamelCase(result.rows[0]);
    },

    async update({ where, data }) {
      const snakeData = toSnakeCase(data);
      const key = Object.keys(where)[0];
      const value = where[key];

      const updates = Object.keys(snakeData);
      const setClause = updates.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const values = [...Object.values(snakeData), value];

      const query = `
        UPDATE ${tableName}
        SET ${setClause}, updated_at = NOW()
        WHERE ${key} = $${values.length}
        RETURNING *
      `;

      const result = await pool.query(query, values);
      return result.rows[0] ? toCamelCase(result.rows[0]) : null;
    },

    async delete({ where }) {
      const key = Object.keys(where)[0];
      const value = where[key];

      const result = await pool.query(
        `DELETE FROM ${tableName} WHERE ${key} = $1 RETURNING *`,
        [value]
      );
      return result.rows[0] ? toCamelCase(result.rows[0]) : null;
    },

    async deleteMany({ where = {} }) {
      const whereKeys = Object.keys(where);
      let query = `DELETE FROM ${tableName}`;
      const values = [];

      if (whereKeys.length > 0) {
        const conditions = whereKeys.map((key, i) => `${key} = $${i + 1}`);
        query += ` WHERE ${conditions.join(' AND ')}`;
        values.push(...whereKeys.map(k => where[k]));
      }

      const result = await pool.query(query, values);
      return { count: result.rowCount };
    },

    async count({ where = {} } = {}) {
      const whereKeys = Object.keys(where);
      let query = `SELECT COUNT(*) FROM ${tableName}`;
      const values = [];

      if (whereKeys.length > 0) {
        const conditions = whereKeys.map((key, i) => `${key} = $${i + 1}`);
        query += ` WHERE ${conditions.join(' AND ')}`;
        values.push(...whereKeys.map(k => where[k]));
      }

      const result = await pool.query(query, values);
      return parseInt(result.rows[0].count);
    },
  };
}

class PrismaClient {
  constructor() {
    // Initialize all models
    this.user = createModel('users');
    this.instagramAccount = createModel('instagram_accounts');
    this.monitoredReel = createModel('monitored_reels');
    this.keyword = createModel('keywords');
    this.messageTemplate = createModel('message_templates');
    this.dmQueue = createModel('dm_queue');
    this.dmHistory = createModel('dm_history');
    this.rateLimitConfig = createModel('rate_limit_config');
    this.notificationSettings = createModel('notification_settings');
    this.dailyAnalytics = createModel('daily_analytics');
    this.usernameFilter = createModel('username_filters');
    this.subscription = createModel('subscriptions');
    this.usageTracking = createModel('usage_tracking');
  }

  async $connect() {
    // Test connection
    await pool.query('SELECT 1');
  }

  async $disconnect() {
    await pool.end();
  }

  async $transaction(queries) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const query of queries) {
        results.push(await query);
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async $queryRaw(query, ...values) {
    const result = await pool.query(query, values);
    return result.rows;
  }

  async $executeRaw(query, ...values) {
    const result = await pool.query(query, values);
    return result.rowCount;
  }
}

module.exports = { PrismaClient };
