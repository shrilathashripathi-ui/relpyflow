const { exec } = require('child_process');
const fs = require('fs');

const sessionData = JSON.parse(fs.readFileSync('instagram-session.json', 'utf8'));

const username = sessionData.username;
const igUserId = sessionData.ds_user_id;
const csrfToken = sessionData.csrftoken;
const sessionCookies = JSON.stringify(sessionData.cookies);
const userAgent = sessionData.userAgent;

// Dummy user ID for now
const userId = '00000000-0000-0000-0000-000000000001';

console.log('💾 Saving Instagram account...');
console.log(`   Username: ${username}`);
console.log(`   IG User ID: ${igUserId}\n`);

// First, create a temp SQL file
const sqlContent = `
INSERT INTO instagram_accounts (
  id, user_id, ig_user_id, username, session_cookies, csrf_token, user_agent, status
) VALUES (
  gen_random_uuid(),
  '${userId}',
  '${igUserId}',
  '${username}',
  '${sessionCookies.replace(/'/g, "''").replace(/\$/g, '\\$')}',
  '${csrfToken}',
  '${userAgent}',
  'active'
) ON CONFLICT (user_id, username) DO UPDATE SET
  session_cookies = EXCLUDED.session_cookies,
  csrf_token = EXCLUDED.csrf_token,
  updated_at = NOW()
RETURNING id, username, ig_user_id, status;
`;

fs.writeFileSync('temp-insert.sql', sqlContent);

// Copy to container and execute
exec('docker cp temp-insert.sql replyflow-db:/tmp/insert.sql', (err) => {
  if (err) {
    console.error('❌ Failed to copy SQL file:', err);
    return;
  }

  exec('docker exec replyflow-db psql -U postgres -d replyflow -f /tmp/insert.sql', (err2, stdout, stderr) => {
    fs.unlinkSync('temp-insert.sql');
    
    if (err2) {
      console.error('❌ Insert failed:', stderr);
      return;
    }

    console.log('✅ Instagram account saved!\n');
    console.log(stdout);

    // Verify
    exec('docker exec replyflow-db psql -U postgres -d replyflow -c "SELECT id, username, ig_user_id, status FROM instagram_accounts;"', (err3, stdout3) => {
      if (!err3) {
        console.log('\n📊 Instagram Accounts in Database:');
        console.log(stdout3);
      }
    });
  });
});