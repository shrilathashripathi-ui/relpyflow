const axios = require('axios');

class InstagramCommentAPI {
  constructor(sessionData) {
    this.sessionCookies = sessionData.cookies;
    this.csrfToken = sessionData.csrftoken;
    this.userAgent = sessionData.userAgent;
  }

  getCookieString() {
    return this.sessionCookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }
  async getMediaId(shortcode) {
  // Use web endpoint instead of API
  const url = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Cookie': this.getCookieString(),
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    // Extract media ID from response
    const data = response.data;
    const mediaId = data?.items?.[0]?.id || data?.graphql?.shortcode_media?.id;
    
    if (!mediaId) {
      throw new Error('Could not extract media ID from response');
    }
    
    return mediaId;
  } catch (error) {
    console.error('Failed to get media ID:', error.message);
    
    // Fallback: try to extract from HTML
    try {
      const htmlUrl = `https://www.instagram.com/reel/${shortcode}/`;
      const htmlResponse = await axios.get(htmlUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Cookie': this.getCookieString()
        }
      });
      
      // Extract media ID from HTML
      const match = htmlResponse.data.match(/"media_id":"(\d+)"/);
      if (match) {
        return match[1];
      }
    } catch (e) {
      console.error('Fallback also failed:', e.message);
    }
    
    throw error;
  }
}

async getComments(shortcode) {
  console.log(`📡 Fetching comments via API for: ${shortcode}`);
  
  try {
    console.log('   Getting media ID...');
    const mediaId = await this.getMediaId(shortcode);
    console.log(`   Media ID: ${mediaId}`);
    
    // Use GraphQL endpoint instead
    const url = 'https://www.instagram.com/graphql/query/';
    
    console.log('   Fetching comments...');
    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Cookie': this.getCookieString(),
        'X-CSRFToken': this.csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://www.instagram.com/reel/${shortcode}/`,
        'Accept': '*/*'
      },
      params: {
        query_hash: '33ba35852cb50da46f5b5e889df7d159', // Instagram's comment query hash
        variables: JSON.stringify({
          shortcode: shortcode,
          first: 50
        })
      }
    });
    
    const edges = response.data?.data?.shortcode_media?.edge_media_to_parent_comment?.edges || [];
    
    console.log(`✅ Fetched ${edges.length} comments via API`);
    
    return edges.map(edge => ({
      id: edge.node.id,
      username: edge.node.owner.username,
      text: edge.node.text,
      timestamp: new Date(edge.node.created_at * 1000).toISOString(),
      userId: edge.node.owner.id
    }));
    
  } catch (error) {
    console.error('❌ API request failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data).substring(0, 200));
    }
    throw error;
  }
}
  
  }


module.exports = InstagramCommentAPI;