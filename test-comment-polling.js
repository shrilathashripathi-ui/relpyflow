const fs = require('fs');
const InstagramCommentPoller = require('./src/services/instagram/commentPoller');
const KeywordMatcher = require('./src/services/instagram/keywordMatcher');

async function test() {
  console.log('=== COMMENT POLLING TEST ===\n');

  // Load saved session
  const sessionData = JSON.parse(fs.readFileSync('instagram-session.json', 'utf8'));
  console.log(`✅ Loaded session for: ${sessionData.username}\n`);

  // Enter a reel URL to test
  const reelUrl = process.argv[2];
  
  if (!reelUrl) {
    console.error('❌ Please provide a reel URL:');
    console.log('Usage: node test-comment-polling.js <INSTAGRAM_REEL_URL>');
    console.log('Example: node test-comment-polling.js https://www.instagram.com/reel/ABC123/');
    process.exit(1);
  }

  console.log(`📹 Testing with reel: ${reelUrl}\n`);

  // Initialize poller
  const poller = new InstagramCommentPoller(sessionData);

  try {
    // Get comments
    const comments = await poller.getComments(reelUrl, {
      scrollCount: 3,
      useAlternative: false // Try true if first method doesn't work
    });

    console.log(`\n📊 Total comments found: ${comments.length}\n`);

    if (comments.length === 0) {
      console.log('⚠️ No comments found. Try:');
      console.log('   1. Using a different reel with more comments');
      console.log('   2. Setting useAlternative: true in the script');
      return;
    }

    // Display first 10 comments
    console.log('📝 Sample comments:');
    comments.slice(0, 10).forEach((comment, i) => {
      console.log(`\n${i + 1}. @${comment.username}:`);
      console.log(`   "${comment.text}"`);
    });

    // Test keyword matching
    console.log('\n\n=== KEYWORD MATCHING TEST ===\n');
    
    const matcher = new KeywordMatcher(['link', 'dm', 'send', 'info', 'price']);
    console.log('🔑 Keywords:', matcher.keywords.join(', '));

    const filtered = matcher.filterComments(comments);

    console.log(`\n✅ Matched: ${filtered.matched.length}`);
    console.log(`❌ Unmatched: ${filtered.unmatched.length}`);

    if (filtered.matched.length > 0) {
      console.log('\n🎯 Comments with keywords:');
      filtered.matched.forEach((comment, i) => {
        console.log(`\n${i + 1}. @${comment.username} (keyword: "${comment.detectedKeyword}"):`);
        console.log(`   "${comment.text}"`);
      });
    } else {
      console.log('\n⚠️ No comments matched the keywords');
      console.log('Try adding keywords that appear in the comments above');
    }

    // Save results
    fs.writeFileSync('comment-results.json', JSON.stringify({
      reelUrl,
      totalComments: comments.length,
      allComments: comments,
      matchedComments: filtered.matched,
      timestamp: new Date().toISOString()
    }, null, 2));

    console.log('\n\n💾 Results saved to comment-results.json');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

test();