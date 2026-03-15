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

// Instagram Business Login uses instagram_business_manage_messages permission.
// Works on graph.instagram.com with Instagram user tokens.
// The Facebook Login approach (graph.facebook.com + Page token + instagram_manage_messages)
// gives error code 3 "Application does not have the capability" because the app is
// configured for "Instagram business login" which requires instagram_business_* permissions.
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
  async sendDM(accessToken, igUserId, recipientId, messageText, commentId) {
    // Use Private Reply when we have a commentId (for comment-triggered DMs).
    // Instagram requires this — you cannot initiate a DM to a user who hasn't
    // messaged you first. Private Reply lets you DM a commenter within 7 days.
    const usePrivateReply = !!commentId;
    const recipient = usePrivateReply
      ? { comment_id: commentId }
      : { id: recipientId };

    console.log(`📤 [Official API] Sending DM from ${igUserId} via ${usePrivateReply ? 'Private Reply (comment ' + commentId + ')' : 'direct (user ' + recipientId + ')'}`);

    try {
      const response = await axios.post(
        `${GRAPH_API_BASE}/${igUserId}/messages`,
        {
          recipient,
          message: { text: messageText }
        },
        {
          params: { access_token: accessToken },
          headers: { 'Content-Type': 'application/json' }
        }
      );

      console.log('✅ [Official API] DM sent successfully', usePrivateReply ? '(private reply)' : '(direct)');
      return { success: true, messageId: response.data?.message_id, data: response.data };
    } catch (error) {
      const errorData = error.response?.data?.error || {};
      // Log FULL error details for debugging — subcode, fbtrace_id, and type are critical for diagnosis
      console.error(`❌ [Official API] Failed to send DM:`, JSON.stringify({
        message: errorData.message || error.message,
        code: errorData.code,
        subcode: errorData.error_subcode,
        type: errorData.type,
        fbtrace_id: errorData.fbtrace_id,
        httpStatus: error.response?.status,
        url: `${GRAPH_API_BASE}/${igUserId}/messages`,
        recipientType: usePrivateReply ? 'comment_id' : 'user_id',
      }));
      throw new Error(`OFFICIAL_API_DM_FAILED: ${errorData.message || error.message} (code: ${errorData.code}, subcode: ${errorData.error_subcode})`);
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
  async getMediaComments(accessToken, mediaId, since = null) {
    console.log(`📡 [Official API] Fetching comments for media ${mediaId}${since ? ` (since ${since})` : ''}`);

    try {
      const params = {
        access_token: accessToken,
        fields: 'id,text,username,timestamp,from{id,username}'
      };

      // Use 'since' to only fetch new comments (Unix timestamp)
      if (since) {
        params.since = since;
      }

      const response = await axios.get(
        `${GRAPH_API_BASE}/${mediaId}/comments`,
        { params }
      );

      const comments = response.data?.data || [];
      console.log(`✅ [Official API] Fetched ${comments.length} comments${since ? ' (new only)' : ''}`);
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
    // With Instagram Login token on graph.instagram.com, use /me/media
    // (/{igUserId}/media also works but /me is simpler and always resolves correctly)
    console.log(`📡 [Official API] Fetching media via /me/media`);
    const mediaFields = 'id,caption,media_type,media_url,permalink,timestamp,thumbnail_url';

    try {
      const response = await axios.get(
        `${GRAPH_API_BASE}/me/media`,
        {
          params: {
            access_token: accessToken,
            fields: mediaFields,
            limit: 25
          }
        }
      );

      const media = response.data?.data || [];
      console.log(`✅ [Official API] Fetched ${media.length} media items via /me/media`);
      return media;
    } catch (error) {
      const errorData = error.response?.data?.error || {};
      console.error(`❌ [Official API] /me/media failed:`, errorData.message || error.message, '| status:', error.response?.status, '| code:', errorData.code);
      throw error;
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
   * Exchange short-lived FB user token for a long-lived token (60 days)
   * Note: Page tokens derived from a long-lived user token are automatically long-lived.
   */
  async exchangeForLongLivedToken(shortLivedToken) {
    try {
      // Use Facebook's token exchange (not Instagram's ig_exchange_token)
      const response = await axios.get(
        `${GRAPH_API_BASE}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: process.env.INSTAGRAM_CLIENT_ID,
            client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
            fb_exchange_token: shortLivedToken
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in
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
  /**
   * Debug an access token — shows granted permissions, expiry, validity
   * Useful for diagnosing "unexpected error" (code 2) failures
   */
  async debugToken(accessToken) {
    try {
      const response = await axios.get(
        `${GRAPH_API_BASE}/debug_token`,
        { params: { input_token: accessToken, access_token: accessToken } }
      );
      const data = response.data?.data || {};
      console.log('🔍 [Token Debug]', JSON.stringify({
        is_valid: data.is_valid,
        app_id: data.app_id,
        type: data.type,
        expires_at: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : 'never',
        scopes: data.scopes,
        granular_scopes: data.granular_scopes?.map(s => s.permission),
        error: data.error,
      }));
      return data;
    } catch (error) {
      console.error('❌ [Token Debug] Failed:', error.response?.data || error.message);
      return null;
    }
  }

  async refreshLongLivedToken(currentToken) {
    try {
      // Page tokens derived from long-lived user tokens don't expire.
      // But if we're using a Facebook user token, refresh it via the FB endpoint.
      const response = await axios.get(
        `${GRAPH_API_BASE}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: process.env.INSTAGRAM_CLIENT_ID,
            client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
            fb_exchange_token: currentToken
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
