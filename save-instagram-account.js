const { exec } = require('child_process');
const fs = require('fs');

// Read captured session
const sessionData = JSON.parse(fs.readFileSync('instagram-session.json', 'utf8'));

const username = sessionData.username;
const igUserId = sessionData.ds_user_id;
const sessionCookies = JSON.stringify(sessionData.cookies);
const csrfToken = sessionData.csrftoken;
const userAgent = sessionData.userAgent;

// For now, we'll use a dummy user_id (we'll fix auth later)
const userId = '00000000-0000-0000-0000-000000000001';

const sql = `
INSERT INTO instagram_accounts (
  id, user_id, ig_user_id, username, session_cookies, csrf_token, user_agent, status
) VALUES (
  gen_random_uuid(),
  '${userId}',
  '${igUserId}',
  '${username}',
  '${sessionCookies.replace(/'/g, "''")}',
  '${csrfToken}',
  '${userAgent}',
  'active'
) RETURNING id, username, ig_user_id, status;
`;

console.log('💾 Saving Instagram account to database...\n');

exec(`docker exec replyflow-db psql -U postgres -d replyflow -c "${sql}"`, (err, stdout, stderr) => {
  if (err) {
    console.error('❌ Error:', stderr);
    return;
  }
  console.log('✅ Instagram account saved!\n');
  console.log(stdout);
  
  // Verify
  exec(`docker exec replyflow-db psql -U postgres -d replyflow -c "SELECT id, username, ig_user_id, status FROM instagram_accounts;"`, (err2, stdout2) => {
    if (!err2) {
      console.log('📊 All Instagram accounts:');
      console.log(stdout2);
    }
  });
});