/**
 * Shared PrismaClient singleton.
 *
 * EVERY file that needs Prisma should import from here:
 *   const prisma = require('../config/prisma');
 *
 * This prevents creating 20+ separate connection pools,
 * which exhausts Supabase's session-mode pool_size limit.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
