const { exec } = require('child_process');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function createUser(email, password) {
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  const verificationToken = Math.random().toString(36).substring(7);
  
  const sql = `INSERT INTO users (id, email, password_hash, verification_token) 
               VALUES ('${id}', '${email}', '${passwordHash}', '${verificationToken}') 
               RETURNING id, email;`;
  
  exec(`docker exec replyflow-db psql -U postgres -d replyflow -c "${sql}"`, (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Error:', stderr);
      return;
    }
    console.log('✅ User created:\n', stdout);
  });
}

// Test
createUser('test@example.com', 'password123');