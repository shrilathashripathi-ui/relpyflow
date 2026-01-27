require('dotenv').config();
const InstagramAPI = require('./src/services/instagram/instagramAPI');

async function test() {
  console.log('=== TESTING DM SENDING ===\n');

  const api = new InstagramAPI();

  // Test sending a DM to yourself (safe test)
  const testUserId = process.env.INSTAGRAM_USER_ID; // Your own user ID
  const testMessage = 'Test message from ReplyFlow API';

  try {
    console.log(`📤 Attempting to send DM to user: ${testUserId}\n`);
    
    const result = await api.sendDirectMessage(testUserId, testMessage);
    
    console.log('✅ DM sent successfully!');
    console.log('Result:', result);

  } catch (error) {
    console.error('❌ Failed to send DM');
    console.error('Error:', error.response?.data || error.message);
    
    if (error.response?.status === 403) {
      console.log('\n⚠️ This means:');
      console.log('   - Your app may need messaging permissions');
      console.log('   - Or this endpoint requires Instagram Messaging API (not available to all)');
      console.log('\n✅ SOLUTION: Use Puppeteer for DM sending instead');
    }
  }
}

test();