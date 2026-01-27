const fs = require('fs');
const InstagramCommentAPI = require('./src/services/instagram/commentAPI');
const KeywordMatcher = require('./src/services/instagram/keywordMatcher');

async function test() {
  console.log('=== INSTAGRAM API COMMENT TEST ===\n');

  // Load saved session
  const sessionData = JSON.parse(fs.readFileSync('instagram-session.json', 'utf8'));
  console.log(`✅ Loaded session for: ${sessionData.username}\n`);

  // Get reel URL from command line
  const reelUrl = process.argv[2];
  
  if (!reelUrl) {
    console.error('❌ Please provide a reel URL');
    console.log('Usage: node test-comment-api.js <INSTAGRAM_REEL_URL>');
    process.exit(1);
  }

  // Extract shortcode from URL
  const match = reelUrl.match(/\/reel\/([^/]+)/);
  if (!match) {
    console.error('❌ Invalid reel URL');
    process.exit(1);
  }
  
  const shortcode = match[1];
  console.log(`📹 Reel shortcode: ${shortcode}\n`);

  // Initialize API
  const api = new InstagramCommentAPI(sessionData);

  try {
    // Get comments
    const comments = await api.getComments(shortcode);

    console.log(`\n📊 Total comments: ${comments.length}\n`);

    if (comments.length === 0) {
      console.log('⚠️ No comments found on this reel');
      return;
    }

    // Display first 10 comments
    console.log('📝 Sample comments:\n');
    comments.slice(0, 10).forEach((comment, i) => {
      console.log(`${i + 1}. @${comment.username}:`);
      console.log(`   "${comment.text}"\n`);
    });

    // Test keyword matching
    console.log('\n=== KEYWORD MATCHING TEST ===\n');
    
    const matcher = new KeywordMatcher(['link', 'dm', 'send', 'info', 'price']);
    const filtered = matcher.filterComments(comments);

    console.log(`✅ Matched: ${filtered.matched.length}`);
    console.log(`❌ Unmatched: ${filtered.unmatched.length}`);

    if (filtered.matched.length > 0) {
      console.log('\n🎯 Comments with keywords:\n');
      filtered.matched.forEach((comment, i) => {
        console.log(`${i + 1}. @${comment.username} (keyword: "${comment.detectedKeyword}"):`);
        console.log(`   "${comment.text}"\n`);
      });
    } else {
      console.log('\n⚠️ No comments matched the keywords');
    }

    // Save results
    fs.writeFileSync('comment-api-results.json', JSON.stringify({
      reelUrl,
      shortcode,
      totalComments: comments.length,
      allComments: comments,
      matchedComments: filtered.matched,
      timestamp: new Date().toISOString()
    }, null, 2));

    console.log('\n💾 Results saved to comment-api-results.json');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

test();