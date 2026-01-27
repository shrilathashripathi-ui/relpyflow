const InstagramCookieCapture = require('./src/services/instagram/cookieCapture');

async function test() {
  console.log('=== INSTAGRAM COOKIE CAPTURE TEST ===\n');
  
  const capture = new InstagramCookieCapture();
  
  try {
    const result = await capture.capture();
    
    console.log('\n✅ SUCCESS!');
    console.log('\nCaptured Data:');
    console.log('Username:', result.username);
    console.log('Session ID:', result.sessionid?.substring(0, 20) + '...');
    console.log('CSRF Token:', result.csrftoken?.substring(0, 20) + '...');
    console.log('User ID:', result.ds_user_id);
    console.log('Total Cookies:', result.cookies.length);
    
    // Save to file for testing
    const fs = require('fs');
    fs.writeFileSync('instagram-session.json', JSON.stringify(result, null, 2));
    console.log('\n💾 Session saved to instagram-session.json');
    
  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    process.exit(1);
  }
}

test();