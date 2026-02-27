/**
 * Official Instagram Messaging API Service
 *
 * Uses the Instagram Graph API + Messaging API for:
 * - Sending DMs (instagram_business_manage_messages)
 * - Reading/replying to comments (instagram_business_manage_comments)
 * - Fetching media and user info (instagram_business_basic)
 *
 * This replaces the Puppeteer-based approach for accounts that have
 * connected via the official OAuth flow.
 */

const axios = require('axios');

const GRAPH_API_BASE = 'https://graph.instagram.com/v22.0';

class OfficialInstagramApiService {
  /**
   * Send a DM using the Instagram Messaging API
   * Requires: instagram_business_manage_messages permission
   *
   * @param {string} accessToken - Page/user access token
   * @param {string} igUserId - Instagram Business Account ID (IGSID) of the sender
   * @param {string} recipientId - Instagram-scoped ID (IGSID) of the recipient
   * @param {string} messageText - Text message to send
   */
  async sendDM(accessToken, igUserId, recipientId, messageText) {
    console.log(`📤 [Official API] Sending DM from ${igUserId} to ${recipientId}`);

    try {
      const response = await axios.post(
        `${GRAPH_API_BASE}/${igUserId}/messages`,
        {
          recipient: { id: recipientId },
          message: { text: messageText }
        },
        {
          params: { access_token: accessToken },
          headers: { 'Content-Type': 'application/json' }
        }
      );

      console.log('✅ [Official API] DM sent successfully');
      return { success: true, messageId: response.data?.message_id, data: response.data };
    } catch (error) {
      const errorData = error.response?.data?.error || {};
      console.error('❌ [Official API] Failed to send DM:', errorData.message || error.message);
      throw new Error(`OFFICIAL_API_DM_FAILED: ${errorData.message || error.message} (code: ${errorData.code})`);
    }
  }

  /**
   * Reply to a comment on a media post
   * Requires: instagram_business_manage_comments permission
   */
  async replyToComment(accessToken, commentId, replyText) {
    console.log(`💬 [Official API] Replying to comment ${commentId}`);

    try {
      const response = await axios.post(
        `${GRAPH_API_BASE}/${commentId}/replies`,
        { message: replyText },
        { params: { access_token: accessToken } }
      );

      console.log('✅ [Official API] Comment reply sent');
      return { success: true, data: response.data };
    } catch (error) {
      const errorData = error.response?.data?.error || {};
      console.error('❌ [Official API] Failed to reply to comment:', errorData.message || error.message);
      throw error;
    }
  }

  /**
   * Get comments on a media post
   * Requires: instagram_business_manage_comments permission
   */
  async getMediaComments(accessToken, mediaId) {
    console.log(`📡 [Official API] Fetching comments for media ${mediaId}`);

    try {
      const response = await axios.get(
        `${GRAPH_API_BASE}/${mediaId}/comments`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,text,username,timestamp,from{id,username}'
          }
        }
      );

      const comments = response.data?.data || [];
      console.log(`✅ [Official API] Fetched ${comments.length} comments`);
      return comments;
    } catch (error) {
      const errorData = error.response?.data?.error || {};
      console.error('❌ [Official API] Failed to fetch comments:', errorData.message || error.message);
      throw error;
    }
  }

  /**
   * Get user's recent media posts
   * Requires: instagram_business_basic permission
   */
  async getUserMedia(accessToken, igUserId) {
    // Prefer 'me' for Instagram OAuth tokens (more reliable than numeric ID)
    const endpoints = ['me', igUserId].filter(Boolean);
    const mediaFields = 'id,caption,media_type,media_url,permalink,timestamp,thumbnail_url';

    for (const userId of endpoints) {
      console.log(`📡 [Official API] Fetching media via /${userId}/media`);
      try {
        const response = await axios.get(
          `${GRAPH_API_BASE}/${userId}/media`,
          {
            params: {
              access_token: accessToken,
              fields: mediaFields,
              limit: 25
            }
          }
        );

        const media = response.data?.data || [];
        console.log(`✅ [Official API] Fetched ${media.length} media items via /${userId}/media`);
        return media;
      } catch (error) {
        const errorData = error.response?.data?.error || {};
        console.error(`❌ [Official API] /${userId}/media failed:`, errorData.message || error.message, '| status:', error.response?.status, '| code:', errorData.code);

        // If this was the last endpoint, throw the error
        if (userId === endpoints[endpoints.length - 1]) {
          throw error;
        }
        // Otherwise try next endpoint
        console.log('🔄 [Official API] Trying next endpoint...');
      }
    }
  }

  /**
   * Get user profile info
   * Requires: instagram_business_basic permission
   */
  async getUserProfile(accessToken, igUserId) {
    try {
      const response = await axios.get(
        `${GRAPH_API_BASE}/${igUserId}`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,username,name,profile_picture_url,followers_count,media_count'
          }
        }
      );

      return response.data;
    } catch (error) {
      const errorData = error.response?.data?.error || {};
      console.error('❌ [Official API] Failed to fetch profile:', errorData.message || error.message);
      throw error;
    }
  }

  /**
   * Exchange short-lived token for a long-lived token (60 days)
   */
  async exchangeForLongLivedToken(shortLivedToken) {
    try {
      const response = await axios.get(
        `${GRAPH_API_BASE}/access_token`,
        {
          params: {
            grant_type: 'ig_exchange_token',
            client_secret: process.env.INSTAGRAM_APP_SECRET,
            access_token: shortLivedToken
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in // seconds (typically 5184000 = 60 days)
      };
    } catch (error) {
      const errorData = error.response?.data?.error || {};
      console.error('❌ [Official API] Token exchange failed:', errorData.message || error.message);
      throw error;
    }
  }

  /**
   * Refresh a long-lived token (must be done before it expires)
   */
  async refreshLongLivedToken(currentToken) {
    try {
      const response = await axios.get(
        `${GRAPH_API_BASE}/refresh_access_token`,
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: currentToken
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      const errorData = error.response?.data?.error || {};
      console.error('❌ [Official API] Token refresh failed:', errorData.message || error.message);
      throw error;
    }
  }

  /**
   * Send an ice breaker / generic template message
   * For structured messages with quick reply buttons
   */
  async sendQuickReply(accessToken, igUserId, recipientId, messageText, quickReplies) {
    console.log(`📤 [Official API] Sending quick reply to ${recipientId}`);

    try {
      const response = await axios.post(
        `${GRAPH_API_BASE}/${igUserId}/messages`,
        {
          recipient: { id: recipientId },
          message: {
            text: messageText,
            quick_replies: quickReplies.map(qr => ({
              content_type: 'text',
              title: qr.title || qr,
              payload: qr.payload || qr.title || qr
            }))
          }
        },
        {
          params: { access_token: accessToken },
          headers: { 'Content-Type': 'application/json' }
        }
      );

      console.log('✅ [Official API] Quick reply sent');
      return { success: true, data: response.data };
    } catch (error) {
      const errorData = error.response?.data?.error || {};
      // Quick replies may not be supported - fall back to plain text
      if (errorData.code === 100 || errorData.error_subcode === 2534015) {
        console.log('⚠️ [Official API] Quick replies not supported, falling back to plain text');
        return this.sendDM(accessToken, igUserId, recipientId, messageText);
      }
      throw error;
    }
  }
}

module.exports = new OfficialInstagramApiService();
