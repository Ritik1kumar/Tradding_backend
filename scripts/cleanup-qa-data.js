// Standalone cleanup: deletes every row the e2e suite could have created
// (identified by the +917000... phone range and QA_ category-name prefix),
// and nothing else. Safe to run anytime against the real dev DB.
const prisma = require('../lib/prisma');
const { wipeQaData } = require('../test-e2e/lib/qaData');

wipeQaData()
  .then((result) => {
    console.log('QA data wiped:', result);
  })
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
