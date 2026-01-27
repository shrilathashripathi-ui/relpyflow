require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Debug: Show what .env loaded
console.log('📋 Environment variables loaded:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Loaded' : '❌ Missing');
console.log('DB_USER:', process.env.DB_USER || '❌ undefined');
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ Set' : '❌ undefined');
console.log('DB_NAME:', process.env.DB_NAME || '❌ undefined');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function runMigration() {
  console.log('\n🔄 Starting database migration...');
  
  try {
    // Test connection first
    console.log('🔌 Testing database connection...');
    const testResult = await pool.query('SELECT NOW()');
    console.log('✅ Database connected at:', testResult.rows[0].now);
    
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    console.log('📂 Reading schema from:', schemaPath);
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }
    
    const schema = fs.readFileSync(schemaPath, 'utf8');
    console.log('📄 Schema file loaded, size:', schema.length, 'bytes');
    
    // Execute schema
    console.log('⚙️ Executing schema...');
    await pool.query(schema);
    
    console.log('\n✅ Database migration completed successfully!');
    console.log('✅ All tables created');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('\nFull error:', error);
    
    await pool.end();
    process.exit(1);
  }
}

runMigration();