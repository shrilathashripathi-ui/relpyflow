require('dotenv').config();
const InstagramAPI = require('./src/services/instagram/instagramAPI');
const KeywordMatcher = require('./src/services/instagram/keywordMatcher');

async function test() {
  console.log('=== INSTAGRAM OFFICIAL API TEST ===\n');

  const api = new InstagramAPI();

  try {
    // Test 1: Get your recent media
    console.log('📹 Test 1: Fetching your recent reels...\n');
    const media = await api.getUserMedia();

    console.log('Your recent posts:\n');
    media.slice(0, 5).forEach((item, i) => {
      console.log(`${i + 1}. ${item.media_type}`);
      console.log(`   Caption: ${item.caption?.substring(0, 50)}...`);
      console.log(`   Link: ${item.permalink}`);
      console.log(`   ID: ${item.id}\n`);
    });

    if (media.length === 0) {
      console.log('⚠️ No media found. Make sure your Instagram account has posts.');
      return;
    }

    // Test 2: Get comments from first reel
    console.log('\n📝 Test 2: Fetching comments from first media...\n');
    const firstMedia = media[0];
    const comments = await api.getMediaComments(firstMedia.id);

    if (comments.length === 0) {
      console.log('⚠️ No comments found on this media.');
      console.log('Try testing with a media that has comments.\n');
    } else {
      console.log(`Found ${comments.length} comments:\n`);
      
      comments.slice(0, 10).forEach((comment, i) => {
        console.log(`${i + 1}. @${comment.username}:`);
        console.log(`   "${comment.text}"\n`);
      });

      // Test 3: Keyword matching
      console.log('\n🔑 Test 3: Keyword matching...\n');
      const matcher = new KeywordMatcher(['link', 'dm', 'send', 'info', 'price']);
      const filtered = matcher.filterComments(comments);

      console.log(`✅ Matched: ${filtered.matched.length}`);
      console.log(`❌ Unmatched: ${filtered.unmatched.length}\n`);

      if (filtered.matched.length > 0) {
        console.log('🎯 Comments with keywords:\n');
        filtered.matched.forEach((comment, i) => {
          console.log(`${i + 1}. @${comment.username} (keyword: "${comment.detectedKeyword}"):`);
          console.log(`   "${comment.text}"\n`);
        });
      }
    }

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.response?.status === 400) {
      console.error('\n⚠️ Check your access token in .env file');
    } else if (error.response?.status === 190) {
      console.error('\n⚠️ Access token expired or invalid');
    }
  }
}

test();