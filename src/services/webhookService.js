/**
 * Webhook Service - n8n/Zapier integration for lead notifications
 */

const crypto = require('crypto');

class WebhookService {
  constructor() {
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Send webhook notification for new lead
   * @param {Object} automation - Automation with webhook config
   * @param {Object} lead - Lead data
   * @param {Object} trigger - Trigger data
   */
  async sendLeadWebhook(automation, lead, trigger) {
    if (!automation.webhookEnabled || !automation.webhookUrl) {
      return { sent: false, reason: 'Webhook not configured' };
    }

    const payload = {
      event: 'new_lead',
      timestamp: new Date().toISOString(),
      automation: {
        id: automation.id,
        name: automation.name
      },
      lead: {
        id: lead.id,
        instagram_username: lead.igUsername,
        instagram_user_id: lead.igUserId,
        email: lead.email || null,
        phone: lead.phone || null,
        name: lead.name || null,
        custom_data: lead.customData || {},
        is_complete: lead.isComplete,
        created_at: lead.createdAt
      },
      trigger: trigger ? {
        comment_text: trigger.commentText,
        matched_keyword: trigger.matchedKeyword,
        is_follower: trigger.isFollower
      } : null
    };

    return this.sendWebhook(automation.webhookUrl, payload, automation.webhookSecret);
  }

  /**
   * Send webhook notification for DM sent
   */
  async sendDmSentWebhook(automation, dmData) {
    if (!automation.webhookEnabled || !automation.webhookUrl) {
      return { sent: false, reason: 'Webhook not configured' };
    }

    const payload = {
      event: 'dm_sent',
      timestamp: new Date().toISOString(),
      automation: {
        id: automation.id,
        name: automation.name
      },
      dm: {
        recipient_username: dmData.recipientUsername,
        recipient_ig_id: dmData.recipientIgId,
        message_sent: dmData.messageSent,
        matched_keyword: dmData.detectedKeyword,
        comment_text: dmData.commentText
      }
    };

    return this.sendWebhook(automation.webhookUrl, payload, automation.webhookSecret);
  }

  /**
   * Send webhook notification for trigger event
   */
  async sendTriggerWebhook(automation, trigger) {
    if (!automation.webhookEnabled || !automation.webhookUrl) {
      return { sent: false, reason: 'Webhook not configured' };
    }

    const payload = {
      event: 'trigger_detected',
      timestamp: new Date().toISOString(),
      automation: {
        id: automation.id,
        name: automation.name
      },
      trigger: {
        id: trigger.id,
        commenter_username: trigger.commenterUsername,
        commenter_ig_id: trigger.commenterIgId,
        comment_text: trigger.commentText,
        matched_keyword: trigger.matchedKeyword,
        is_follower: trigger.isFollower
      }
    };

    return this.sendWebhook(automation.webhookUrl, payload, automation.webhookSecret);
  }

  /**
   * Send webhook with retry logic
   */
  async sendWebhook(url, payload, secret) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const body = JSON.stringify(payload);

        // Create signature if secret provided
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'ReplyFlow/1.0'
        };

        if (secret) {
          const signature = this.createSignature(body, secret);
          headers['X-ReplyFlow-Signature'] = signature;
          headers['X-Webhook-Secret'] = signature; // Alternative header for compatibility
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        if (response.ok) {
          console.log(`✅ Webhook sent successfully to ${url}`);
          return {
            sent: true,
            statusCode: response.status,
            attempt
          };
        }

        // Non-2xx response
        lastError = `HTTP ${response.status}: ${response.statusText}`;
        console.warn(`⚠️ Webhook attempt ${attempt} failed: ${lastError}`);
      } catch (error) {
        lastError = error.message;
        console.warn(`⚠️ Webhook attempt ${attempt} error: ${lastError}`);
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.retryAttempts) {
        await this.sleep(this.retryDelay * attempt);
      }
    }

    console.error(`❌ Webhook failed after ${this.retryAttempts} attempts: ${lastError}`);
    return {
      sent: false,
      error: lastError,
      attempts: this.retryAttempts
    };
  }

  /**
   * Create HMAC signature for webhook verification
   */
  createSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify incoming webhook signature (for future use)
   */
  verifySignature(payload, signature, secret) {
    const expected = this.createSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  }

  /**
   * Test webhook connection
   */
  async testWebhook(url, secret) {
    const payload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook from ReplyFlow'
    };

    return this.sendWebhook(url, payload, secret);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
const webhookService = new WebhookService();
module.exports = webhookService;
