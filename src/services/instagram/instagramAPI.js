const axios = require('axios');

class InstagramAPI {
  constructor() {
    this.baseURL = 'https://graph.instagram.com';
    this.accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    this.userId = process.env.INSTAGRAM_USER_ID;
  }

  async getMediaComments(mediaId) {
    console.log(`📡 Fetching comments for media: ${mediaId}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/${mediaId}/comments`, {
        params: {
          access_token: this.accessToken,
          fields: 'id,text,username,timestamp,from{id,username}'
        }
      });

      const comments = response.data.data || [];
      console.log(`✅ Fetched ${comments.length} comments`);

      return comments.map(comment => ({
        id: comment.id,
        username: comment.from?.username || comment.username,
        text: comment.text,
        timestamp: comment.timestamp,
        userId: comment.from?.id
      }));

    } catch (error) {
      console.error('❌ Failed to fetch comments:', error.response?.data || error.message);
      throw error;
    }
  }

  async getUserMedia() {
    console.log('📡 Fetching user media...');
    
    try {
      const response = await axios.get(`${this.baseURL}/${this.userId}/media`, {
        params: {
          access_token: this.accessToken,
          fields: 'id,caption,media_type,media_url,permalink,timestamp'
        }
      });

      const media = response.data.data || [];
      console.log(`✅ Fetched ${media.length} media items`);

      return media;

    } catch (error) {
      console.error('❌ Failed to fetch media:', error.response?.data || error.message);
      throw error;
    }
  }

  async getMediaByPermalink(permalink) {
    console.log(`📡 Getting media ID for: ${permalink}`);
    
    try {
      // Get all media and find matching permalink
      const allMedia = await this.getUserMedia();
      const media = allMedia.find(m => m.permalink === permalink);

      if (!media) {
        throw new Error('Media not found');
      }

      console.log(`✅ Found media ID: ${media.id}`);
      return media;

    } catch (error) {
      console.error('❌ Failed to get media:', error.message);
      throw error;
    }
  }

  async sendDirectMessage(recipientUserId, message) {
    console.log(`📤 Sending DM to user: ${recipientUserId}`);

    try {
      const response = await axios.post(`${this.baseURL}/me/messages`, {
        recipient: { id: recipientUserId },
        message: { text: message }
      }, {
        params: {
          access_token: this.accessToken
        }
      });

      console.log('✅ DM sent successfully');
      return response.data;

    } catch (error) {
      console.error('❌ Failed to send DM:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send a DM using account session (for web-based DM sending)
   */
  async sendDM(account, recipientUserId, message) {
    console.log(`📤 Sending DM to ${recipientUserId} from @${account.username}`);

    try {
      // Use session-based API for DM sending
      const sessionAPI = require('./commentAPI');
      return await sessionAPI.sendDirectMessage(account, recipientUserId, message);
    } catch (error) {
      console.error('❌ Failed to send DM:', error.message);
      throw error;
    }
  }

  /**
   * Get DM inbox threads for an account
   */
  async getDMInbox(account) {
    console.log(`📥 Fetching DM inbox for @${account.username}`);

    try {
      const sessionAPI = require('./commentAPI');
      return await sessionAPI.getDMInbox(account);
    } catch (error) {
      console.error('❌ Failed to fetch DM inbox:', error.message);
      throw error;
    }
  }

  /**
   * Check if a user is following the account
   */
  async isUserFollowing(account, userId) {
    console.log(`👀 Checking if ${userId} follows @${account.username}`);

    try {
      const sessionAPI = require('./commentAPI');
      return await sessionAPI.checkFollowStatus(account, userId);
    } catch (error) {
      console.error('❌ Failed to check follow status:', error.message);
      return false;
    }
  }
}

module.exports = InstagramAPI;