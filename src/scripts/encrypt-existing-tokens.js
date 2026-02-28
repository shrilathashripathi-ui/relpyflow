/**
 * One-time migration: Encrypt existing plaintext Instagram tokens.
 *
 * Run: ENCRYPTION_KEY=<your-key> node src/scripts/encrypt-existing-tokens.js
 *
 * Safe to run multiple times — skips values that are already encrypted.
 * Encrypted format: [32 hex IV]:[hex ciphertext] — detected by regex.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { encrypt } = require('../utils/encryption');

const prisma = new PrismaClient();

// Must match the pattern in encryption.js
const ENCRYPTED_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/;
function isEncrypted(value) {
  return value && ENCRYPTED_PATTERN.test(value);
}

async function main() {
  const accounts = await prisma.instagramAccount.findMany();
  console.log(`Found ${accounts.length} Instagram account(s)`);

  let updated = 0;

  for (const account of accounts) {
    const changes = {};

    // Only encrypt if the value exists and is NOT already encrypted
    if (account.accessToken && !isEncrypted(account.accessToken)) {
      changes.accessToken = encrypt(account.accessToken);
    }
    if (account.sessionCookies && !isEncrypted(account.sessionCookies)) {
      changes.sessionCookies = encrypt(account.sessionCookies);
    }
    if (account.csrfToken && !isEncrypted(account.csrfToken)) {
      changes.csrfToken = encrypt(account.csrfToken);
    }

    if (Object.keys(changes).length > 0) {
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: changes,
      });
      console.log(`  Encrypted tokens for @${account.username} (${Object.keys(changes).join(', ')})`);
      updated++;
    } else {
      console.log(`  @${account.username} — already encrypted or no tokens, skipping`);
    }
  }

  console.log(`\nDone. Updated ${updated} account(s).`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
