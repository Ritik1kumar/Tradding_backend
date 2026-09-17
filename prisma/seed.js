const prisma = require('../lib/prisma');

// Phone numbers are placeholders — replace with real admin numbers before running.
const ADMIN_USERS = [
  { phone: '+919810000001', name: 'Admin One' },
  { phone: '+919810000002', name: 'Admin Two' },
];

async function main() {
  for (const admin of ADMIN_USERS) {
    await prisma.appUser.upsert({
      where: { phone: admin.phone },
      update: { roles: ['admin'] },
      create: {
        phone: admin.phone,
        name: admin.name,
        roles: ['admin'],
        status: 'active',
      },
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
