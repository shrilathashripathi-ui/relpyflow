require('dotenv').config();
const { exec } = require('child_process');
const { Pool } = require('pg');

console.log('=== FULL SYSTEM DIAGNOSTIC ===\n');

// 1. Check Docker
console.log('1. Checking Docker containers...');
exec('docker ps', (err, stdout) => {
  if (err) {
    console.log('   ❌ Docker not available or not running');
  } else {
    console.log('   Docker containers:\n', stdout);
  }
  
  // 2. Check if PostgreSQL port is in use
  console.log('\n2. Checking if port 5432 is in use...');
  exec('netstat -an | findstr :5432', (err2, stdout2) => {
    if (stdout2) {
      console.log('   ✅ Port 5432 is active:\n', stdout2);
    } else {
      console.log('   ❌ Port 5432 is NOT in use - PostgreSQL not running');
    }
    
    // 3. Test PostgreSQL connection
    console.log('\n3. Testing PostgreSQL connection...');
    console.log('   Connection string:', process.env.DATABASE_URL);
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      connectionTimeoutMillis: 5000
    });
    
    pool.query('SELECT version();', (err3, res) => {
      if (err3) {
        console.log('   ❌ Connection failed:');
        console.log('   Error code:', err3.code);
        console.log('   Error message:', err3.message);
        
        // Try to determine the issue
        if (err3.code === 'ECONNREFUSED') {
          console.log('\n   🔍 DIAGNOSIS: PostgreSQL is not running on port 5432');
          console.log('   SOLUTION: Start Docker container or install PostgreSQL');
        } else if (err3.code === '28P01') {
          console.log('\n   🔍 DIAGNOSIS: Password is incorrect');
          console.log('   SOLUTION: Recreate Docker container with correct password');
        } else if (err3.code === '3D000') {
          console.log('\n   🔍 DIAGNOSIS: Database does not exist');
          console.log('   SOLUTION: Create database using: docker exec -it replyflow-db psql -U postgres -c "CREATE DATABASE replyflow;"');
        }
      } else {
        console.log('   ✅ Connection successful!');
        console.log('   PostgreSQL version:', res.rows[0].version);
      }
      
      pool.end();
    });
  });
});