const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const pollComments = async () => {
  try {
    const accounts = await prisma.instagramAccount.findMany({
      where: { status: 'ACTIVE' },
      include: {
        automations: {
          where: { isActive: true },
        },
      },
    });

    for (const account of accounts) {
      if (account.automations.length === 0) continue;

      // Get recent media
      const mediaResponse = await axios.get(
        `https://graph.instagram.com/me/media?fields=id,media_type,timestamp&access_token=${account.accessToken}`
      );

      const recentMedia = mediaResponse.data.data.slice(0, 5); // Last 5 posts

      for (const media of recentMedia) {
        // Get comments
        const commentsResponse = await axios.get(
          `https://graph.instagram.com/${media.id}/comments?fields=id,text,username,from&access_token=${account.accessToken}`
        );

        for (const comment of commentsResponse.data.data || []) {
          await processComment(comment, media.id, account);
        }
      }
    }
  } catch (error) {
    console.error('Poll error:', error.message);
  }
};

const processComment = async (comment, postId, account) => {
  try {
    // Check if already processed
    const exists = await prisma.trigger.findUnique({
      where: { commentId: comment.id },
    });

    if (exists) return;

    // Check against automations
    for (const automation of account.automations) {
      const matchedKeyword = automation.keywords.find((kw) =>
        comment.text.toLowerCase().includes(kw.toLowerCase())
      );

      if (matchedKeyword) {
        // Create trigger
        await prisma.trigger.create({
          data: {
            automationId: automation.id,
            instagramAccountId: account.id,
            commentId: comment.id,
            commentText: comment.text,
            commentorUsername: comment.username,
            commentorUserId: comment.from?.id || 'unknown',
            postId,
            matchedKeyword,
            dmStatus: 'PENDING',
          },
        });

        // Reply to comment
        await replyToComment(comment.id, automation.responseMessage, account.accessToken);

        // Update stats
        await prisma.automation.update({
          where: { id: automation.id },
          data: { totalTriggered: { increment: 1 } },
        });
      }
    }
  } catch (error) {
    console.error('Process comment error:', error.message);
  }
};

const replyToComment = async (commentId, message, accessToken) => {
  try {
    await axios.post(
      `https://graph.instagram.com/${commentId}/replies`,
      {
        message,
      },
      {
        params: { access_token: accessToken },
      }
    );
  } catch (error) {
    console.error('Reply error:', error.message);
  }
};

// Start polling every 30 seconds
setInterval(pollComments, 30000);

module.exports = { pollComments };
