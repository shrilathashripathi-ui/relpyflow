const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Resolve the encryption key the app uses to protect Instagram tokens/cookies at rest.
 *
 * Priority:
 *   1. ENCRYPTION_KEY from the environment (set this in production — e.g. your host's
 *      dashboard — so it stays stable across deploys).
 *   2. Otherwise, auto-generate a strong key and persist it to the local .env file so a
 *      self-hoster can `git clone && npm start` with zero crypto setup. The generated key
 *      is reused on every subsequent start.
 *   3. If the env var is missing AND .env can't be written (e.g. read-only/ephemeral
 *      filesystem), fall back to an in-memory key and warn loudly — the app still runs,
 *      but anything encrypted now won't decrypt after a restart until ENCRYPTION_KEY is set.
 */
function resolveEncryptionKey() {
  if (process.env.ENCRYPTION_KEY) {
    return process.env.ENCRYPTION_KEY;
  }

  const generated = crypto.randomBytes(32).toString('hex');
  const envPath = path.join(__dirname, '..', '..', '.env');

  try {
    let needsNewline = false;
    if (fs.existsSync(envPath)) {
      const existing = fs.readFileSync(envPath, 'utf8');
      needsNewline = existing.length > 0 && !existing.endsWith('\n');
    }
    fs.appendFileSync(
      envPath,
      `${needsNewline ? '\n' : ''}# Auto-generated on first run — keep this secret and stable across deploys\nENCRYPTION_KEY=${generated}\n`
    );
    process.env.ENCRYPTION_KEY = generated;
    console.warn(`[encryption] ENCRYPTION_KEY was missing — generated one and saved it to ${envPath}`);
    return generated;
  } catch (err) {
    process.env.ENCRYPTION_KEY = generated;
    console.warn(
      `[encryption] ENCRYPTION_KEY was missing and .env could not be written (${err.message}). ` +
      `Using a temporary in-memory key. Set ENCRYPTION_KEY in your environment to persist encrypted data across restarts.`
    );
    return generated;
  }
}

const ENCRYPTION_KEY = resolveEncryptionKey();
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
