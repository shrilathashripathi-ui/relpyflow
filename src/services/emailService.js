const nodemailer = require('nodemailer');

// Email is optional. Without SMTP credentials the app still boots; email-dependent
// flows (OTP verification, password reset) report a clear error until SMTP is configured.
const isConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: true, // SSL for port 465
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

if (!isConfigured) {
  console.warn('[email] SMTP_HOST/SMTP_USER/SMTP_PASS not set — email features (OTP, password reset) are disabled.');
}

/**
 * Send a 6-digit OTP email for email verification
 */
async function sendOTP(toEmail, otp, type = 'verify') {
  if (!transporter) {
    throw new Error('Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS to enable verification emails.');
  }
  const isReset = type === 'reset';
  const subject = isReset ? 'Reset Your ReplyFlow Password' : 'Your ReplyFlow Verification Code';
  const heading = isReset ? 'Password Reset' : 'Email Verification';
  const description = isReset
    ? 'Use the code below to reset your password:'
    : 'Your verification code is:';

  const mailOptions = {
    from: `"ReplyFlow" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: toEmail,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 12px;">
        <h2 style="color: #7c3aed; margin: 0 0 8px;">ReplyFlow</h2>
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 16px;">${heading}</p>
        <p style="color: #374151; font-size: 16px;">${description}</p>
        <div style="background: #7c3aed; color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 16px; border-radius: 8px; margin: 16px 0;">
          ${otp}
        </div>
        <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. Do not share it with anyone.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 OTP email sent to ${toEmail} (messageId: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send OTP email to ${toEmail}:`, error.message);
    throw error;
  }
}

/**
 * Generate a cryptographically secure 6-digit numeric OTP
 */
function generateOTP() {
  const crypto = require('crypto');
  // Use crypto.randomInt for uniform distribution in [100000, 999999]
  return crypto.randomInt(100000, 1000000).toString();
}

module.exports = { sendOTP, generateOTP };
