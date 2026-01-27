const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function test() {
  try {
    console.log('🔌 Testing Prisma connection...\n');
    
    // Test connection
    await prisma.$connect();
    console.log('✅ Prisma connected successfully!');
    
    // Count users
    const userCount = await prisma.user.count();
    console.log(`📊 Users in database: ${userCount}`);
    
    // List all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        createdAt: true
      }
    });
    
    console.log('\n👥 Users:');
    if (users.length === 0) {
      console.log('  (none yet)');
    } else {
      users.forEach(user => {
        console.log(`  - ${user.email} (${user.id})`);
      });
    }
    
    await prisma.$disconnect();
    console.log('\n✅ Test complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

test();