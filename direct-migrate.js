const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 Direct migration via Docker...\n');

// Read schema
const schemaPath = path.join(__dirname, 'src', 'config', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

// Save to temp file
fs.writeFileSync('temp-schema.sql', schema);

console.log('📂 Schema file ready');
console.log('📤 Copying to container...');

// Copy to container
exec('docker cp temp-schema.sql replyflow-db:/tmp/schema.sql', (err) => {
  if (err) {
    console.error('❌ Failed to copy file:', err);
    return;
  }
  
  console.log('✅ File copied to container');
  console.log('⚙️ Executing migration...\n');
  
  // Execute in PostgreSQL
  exec('docker exec replyflow-db psql -U postgres -d replyflow -f /tmp/schema.sql', (err2, stdout, stderr) => {
    // Clean up
    fs.unlinkSync('temp-schema.sql');
    
    if (err2) {
      console.error('❌ Migration failed:', stderr);
      return;
    }
    
    console.log('✅ Migration executed!');
    if (stdout) console.log(stdout);
    
    // Verify tables
    console.log('\n📊 Verifying tables...');
    exec('docker exec replyflow-db psql -U postgres -d replyflow -c "\\dt"', (err3, stdout3) => {
      if (!err3) {
        console.log('\n✅ Tables created:\n');
        console.log(stdout3);
        
        console.log('\n✅ MIGRATION COMPLETE!');
        console.log('Now run: npm run dev');
      }
    });
  });
});