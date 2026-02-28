const crypto = require('crypto');

// ENCRYPTION_KEY must be set in environment — no fallback
if (!process.env.ENCRYPTION_KEY) {
  throw new Error('FATAL: ENCRYPTION_KEY environment variable is not set. Cannot start without encryption key.');
}
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
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

/**
 * Check if a value looks like our encrypted format: 32 hex chars (IV) + ':' + hex chars (ciphertext).
 * Instagram cookies contain literal ':' (e.g., sessionid=123:hash:ts), so a simple
 * includes(':') check would cause false positives. This regex is precise.
 */
const ENCRYPTED_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/;

function isEncrypted(value) {
  return value && ENCRYPTED_PATTERN.test(value);
}

/**
 * Decrypt Instagram account tokens in-place.
 * Call after fetching an account from DB, before using tokens.
 * Safe to call on accounts with plaintext tokens (migration period).
 */
function decryptAccountTokens(account) {
  if (!account) return account;
  if (isEncrypted(account.accessToken)) {
    account.accessToken = decrypt(account.accessToken);
  }
  if (isEncrypted(account.sessionCookies)) {
    account.sessionCookies = decrypt(account.sessionCookies);
  }
  if (isEncrypted(account.csrfToken)) {
    account.csrfToken = decrypt(account.csrfToken);
  }
  return account;
}

module.exports = { encrypt, decrypt, decryptAccountTokens };
