const crypto = require('crypto');

// Use a secret key from environment or generate one
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'replyflow-secret-key-32chars!!';
const IV_LENGTH = 16;
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt a string
 */
function encrypt(text) {
  if (!text) return null;

  // Ensure key is 32 bytes for aes-256
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return iv + encrypted data
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a string
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;

  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return null;
  }
}

module.exports = { encrypt, decrypt };
