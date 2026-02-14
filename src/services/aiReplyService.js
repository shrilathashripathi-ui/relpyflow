/**
 * AI Reply Service - OpenAI integration for dynamic DM replies
 * Generates personalized responses based on comment context
 */

const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class AIReplyService {
  constructor() {
    this.openai = null;
    this.initialized = false;
  }

  /**
   * Initialize OpenAI client
   */
  init() {
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️ OPENAI_API_KEY not set - AI replies disabled');
      return false;
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.initialized = true;
    console.log('✅ AI Reply Service initialized');
    return true;
  }

  /**
   * Generate AI reply for a comment
   * @param {Object} params - Comment context
   * @param {string} params.comment - The comment text
   * @param {string} params.username - Commenter's username
   * @param {string} params.postUrl - URL of the post
   * @param {string} params.postCaption - Post caption (optional)
   * @param {Object} params.automation - Automation config with business context
   * @returns {Promise<Object>} Generated reply with variations
   */
  async generateReply({ comment, username, postUrl, postCaption, automation }) {
    if (!this.initialized) {
      this.init();
    }

    if (!this.openai) {
      return {
        success: false,
        error: 'AI service not available',
        fallbackMessage: this.replacePlaceholders(automation?.responseMessage || 'Thanks for your comment! 🙌', { username, comment })
      };
    }

    try {
      const businessContext = automation?.aiContext || '';
      const ctaUrl = automation?.ctaUrl || '';
      const productInfo = automation?.productInfo || '';

      const systemPrompt = `You are a friendly, helpful Instagram DM assistant for a business account. Your goal is to engage leads professionally while being casual and approachable.

Business Context: ${businessContext || 'E-commerce/coaching business'}
${productInfo ? `Product Info: ${productInfo}` : ''}
${ctaUrl ? `CTA Link: ${ctaUrl}` : ''}

RULES:
1. Be helpful, friendly, and conversational (max 2-3 short sentences)
2. Naturally qualify the lead (ask about their needs, budget, timeline if appropriate)
3. Include a clear call-to-action (email signup, booking link, purchase link)
4. Use 1-2 emojis max (not more!)
5. Sound human, not robotic - vary your phrasing
6. Never say you're an AI or bot
7. Address them by username naturally
8. Reference their comment to show you read it
9. Create urgency when appropriate (limited spots, sale ending, etc.)`;

      const userPrompt = `Generate a personalized Instagram DM reply.

Comment: "${comment}"
From: @${username}
Post URL: ${postUrl}
${postCaption ? `Post Caption: ${postCaption}` : ''}

Generate 3 different reply variations (short, medium, engaging). Format as JSON array.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      let parsed;

      try {
        parsed = JSON.parse(content);
      } catch (e) {
        // If JSON parsing fails, use the raw content
        return {
          success: true,
          variations: [content],
          selectedReply: content,
          tokensUsed: response.usage?.total_tokens || 0
        };
      }

      // Handle various response formats
      const variations = parsed.variations || parsed.replies || parsed.messages || [parsed];
      const selectedReply = Array.isArray(variations) ? variations[0] : variations;

      return {
        success: true,
        variations: Array.isArray(variations) ? variations : [variations],
        selectedReply: typeof selectedReply === 'string' ? selectedReply : selectedReply.message || selectedReply.reply || selectedReply.text || JSON.stringify(selectedReply),
        tokensUsed: response.usage?.total_tokens || 0
      };
    } catch (error) {
      console.error('AI Reply error:', error.message);

      // Return fallback
      return {
        success: false,
        error: error.message,
        fallbackMessage: this.replacePlaceholders(automation?.responseMessage || `Hey @${username}! Thanks for reaching out 🙌`, { username, comment })
      };
    }
  }

  /**
   * Generate AI reply for lead qualification
   * @param {Object} params - Lead context
   */
  async generateLeadQualificationReply({ username, previousMessage, userReply, leadFields, currentField }) {
    if (!this.initialized) {
      this.init();
    }

    if (!this.openai) {
      // Return standard lead collection prompt
      return {
        success: false,
        fallbackMessage: this.getLeadFieldPrompt(currentField, username)
      };
    }

    try {
      const systemPrompt = `You are a friendly lead qualification assistant. Your job is to collect lead information naturally through conversation.

RULES:
1. Be conversational and friendly
2. If the user provided the requested info, acknowledge it and ask for the next field
3. If the info seems invalid, politely ask again
4. Use 1-2 emojis max
5. Keep responses short (1-2 sentences)`;

      const userPrompt = `Previous message: "${previousMessage}"
User reply: "${userReply}"
Current field to collect: ${currentField}
Fields needed: ${JSON.stringify(leadFields)}

Generate a natural follow-up message to collect the ${currentField}. If user's reply contains valid ${currentField}, confirm receipt and ask for the next field.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 150
      });

      return {
        success: true,
        reply: response.choices[0]?.message?.content,
        tokensUsed: response.usage?.total_tokens || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fallbackMessage: this.getLeadFieldPrompt(currentField, username)
      };
    }
  }

  /**
   * Analyze comment intent for better routing
   */
  async analyzeCommentIntent(comment) {
    if (!this.initialized) {
      this.init();
    }

    if (!this.openai) {
      return { intent: 'general', confidence: 0.5 };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Analyze Instagram comment intent. Return JSON: {"intent": "price_inquiry|product_question|purchase_intent|support|compliment|spam|general", "confidence": 0-1, "keywords": []}'
          },
          { role: 'user', content: `Analyze: "${comment}"` }
        ],
        temperature: 0.3,
        max_tokens: 100,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0]?.message?.content);
    } catch (error) {
      return { intent: 'general', confidence: 0.5 };
    }
  }

  /**
   * Replace placeholders in message template
   */
  replacePlaceholders(message, context) {
    if (!message) return '';

    return message
      .replace(/{username}/gi, context.username || '')
      .replace(/{comment}/gi, context.comment || '')
      .replace(/{post_url}/gi, context.postUrl || '')
      .replace(/{email}/gi, context.email || '')
      .replace(/{name}/gi, context.name || '');
  }

  /**
   * Get standard lead field collection prompt
   */
  getLeadFieldPrompt(field, username) {
    const prompts = {
      email: `Thanks @${username}! 📧 What's the best email to send you more info?`,
      phone: `Great! 📱 What's your phone number so we can reach you?`,
      name: `Perfect! What's your name? 😊`,
      default: `Could you share your ${field}?`
    };

    return prompts[field] || prompts.default;
  }

  /**
   * Log AI usage for analytics
   */
  async logUsage(userId, tokensUsed, responseType) {
    try {
      // Could store in database for usage tracking/billing
      console.log(`AI Usage: User ${userId}, Tokens: ${tokensUsed}, Type: ${responseType}`);
    } catch (error) {
      // Silent fail for logging
    }
  }
}

// Export singleton
const aiReplyService = new AIReplyService();
module.exports = aiReplyService;
