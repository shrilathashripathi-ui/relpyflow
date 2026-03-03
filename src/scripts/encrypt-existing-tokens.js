/**
 * One-time migration: Encrypt existing plaintext Instagram tokens.
 *
 * Run:   ENCRYPTION_KEY=<your-key> node src/scripts/encrypt-existing-tokens.js
 * Dry:   ENCRYPTION_KEY=<your-key> node src/scripts/encrypt-existing-tokens.js --dry-run
 *
 * Safe to run multiple times — skips values that are already encrypted.
 * Encrypted format: [32 hex IV]:[hex ciphertext] — detected by regex.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { encrypt, decrypt } = require('../utils/encryption');

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

// Must match the pattern in encryption.js
const ENCRYPTED_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/;
function isEncrypted(value) {
  return value && ENCRYPTED_PATTERN.test(value);
}

async function preflight() {
  console.log('── Pre-flight Health Gate ──\n');

  // 1. ENCRYPTION_KEY must exist (encryption.js throws on import if missing, but be explicit)
  if (!process.env.ENCRYPTION_KEY) {
    console.error('❌ ENCRYPTION_KEY is not set. Aborting.');
    process.exit(1);
  }
  console.log('  ✅ ENCRYPTION_KEY is set');

  // 2. Round-trip test with dummy value
  const testValue = 'preflight-test-' + Date.now();
  const encrypted = encrypt(testValue);
  const decrypted = decrypt(encrypted);
  if (decrypted !== testValue) {
    console.error('❌ Encrypt/decrypt round-trip failed on test value. Key may be wrong. Aborting.');
    process.exit(1);
  }
  console.log('  ✅ Encrypt/decrypt round-trip works');

  // 3. Verify key can decrypt existing encryptedPassword (proves key matches production data)
  const accountWithPassword = await prisma.instagramAccount.findFirst({
    where: { encryptedPassword: { not: null } },
    select: { id: true, username: true, encryptedPassword: true },
  });
  if (accountWithPassword) {
    try {
      const pw = decrypt(accountWithPassword.encryptedPassword);
      if (!pw || pw.length === 0) throw new Error('Decrypted to empty string');
      console.log(`  ✅ Existing encryptedPassword decrypts OK (account @${accountWithPassword.username})`);
    } catch (e) {
      console.error(`❌ Cannot decrypt existing encryptedPassword for @${accountWithPassword.username}`);
      console.error(`   This means ENCRYPTION_KEY does not match what was used to encrypt production data.`);
      console.error(`   DO NOT proceed. Fix the key first. Aborting.`);
      process.exit(1);
    }
  } else {
    console.log('  ⚠️  No accounts with encryptedPassword found — skipping key validation against existing data');
  }

  // 4. DB connectivity (implicit — if we got here, prisma connected)
  const count = await prisma.instagramAccount.count();
  console.log(`  ✅ Database connected (${count} account(s))\n`);
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Token Encryption Migration${DRY_RUN ? ' (DRY RUN — no changes)' : ''}`);
  console.log(`  ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  // ── Health gate: abort early if environment is broken ──
  await preflight();

  const accounts = await prisma.instagramAccount.findMany();
  console.log(`Found ${accounts.length} Instagram account(s)\n`);

  // ── Before counts ──
  let beforePlaintext = 0;
  let beforeEncrypted = 0;
  let beforeNull = 0;

  const fields = ['accessToken', 'sessionCookies', 'csrfToken'];
  for (const account of accounts) {
    for (const field of fields) {
      if (!account[field]) {
        beforeNull++;
      } else if (isEncrypted(account[field])) {
        beforeEncrypted++;
      } else {
        beforePlaintext++;
      }
    }
  }

  console.log(`Before migration:`);
  console.log(`  Plaintext fields : ${beforePlaintext}`);
  console.log(`  Encrypted fields : ${beforeEncrypted}`);
  console.log(`  Null/empty fields: ${beforeNull}`);
  console.log();

  // ── Encrypt ──
  let updated = 0;
  let fieldsEncrypted = 0;
  const processedIds = [];

  for (const account of accounts) {
    let changes = {};

    for (const field of fields) {
      if (account[field] && !isEncrypted(account[field])) {
        changes[field] = encrypt(account[field]);
      }
    }

    if (Object.keys(changes).length > 0) {
      // Verify round-trip BEFORE writing to DB
      let roundTripOk = true;
      for (const [field, encryptedValue] of Object.entries(changes)) {
        const decrypted = decrypt(encryptedValue);
        if (decrypted !== account[field]) {
          console.error(`  ❌ ROUND-TRIP FAILED for @${account.username} (id: ${account.id}), field: ${field}`);
          console.error(`     Original length: ${account[field].length}, Decrypted length: ${decrypted.length}`);
          console.error(`     SKIPPING this account — no changes written.`);
          roundTripOk = false;
          break;
        }
      }

      if (roundTripOk) {
        if (!DRY_RUN) {
          await prisma.instagramAccount.update({
            where: { id: account.id },
            data: changes,
          });
        }
        const changedFields = Object.keys(changes).join(', ');
        console.log(`  ✅ ${DRY_RUN ? '[WOULD ENCRYPT]' : 'Encrypted'} @${account.username} (id: ${account.id}) — ${changedFields}`);
        processedIds.push(account.id);
        updated++;
        fieldsEncrypted += Object.keys(changes).length;
      }
    } else {
      console.log(`  ⏭️  @${account.username} (id: ${account.id}) — already encrypted or no tokens`);
    }
  }

  // ── After counts (re-query) ──
  if (!DRY_RUN && updated > 0) {
    const afterAccounts = await prisma.instagramAccount.findMany();
    let afterPlaintext = 0;
    let afterEncrypted = 0;
    let afterNull = 0;

    for (const account of afterAccounts) {
      for (const field of fields) {
        if (!account[field]) {
          afterNull++;
        } else if (isEncrypted(account[field])) {
          afterEncrypted++;
        } else {
          afterPlaintext++;
        }
      }
    }

    console.log(`\nAfter migration:`);
    console.log(`  Plaintext fields : ${afterPlaintext}`);
    console.log(`  Encrypted fields : ${afterEncrypted}`);
    console.log(`  Null/empty fields: ${afterNull}`);

    if (afterPlaintext > 0) {
      console.log(`\n  ⚠️  WARNING: ${afterPlaintext} field(s) still plaintext!`);
    } else {
      console.log(`\n  ✅ All non-null token fields are now encrypted.`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Summary: ${updated} account(s) ${DRY_RUN ? 'would be' : ''} updated, ${fieldsEncrypted} field(s) encrypted`);
  if (processedIds.length > 0) {
    console.log(`  Account IDs processed: [${processedIds.join(', ')}]`);
  }
  console.log(`${'='.repeat(60)}\n`);
}

main()
  .catch((e) => {
    console.error('\n❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
