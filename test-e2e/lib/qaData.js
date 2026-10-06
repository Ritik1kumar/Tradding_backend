// All test-created data is tagged so it can be found and wiped without ever
// touching real data already sitting in the dev DB (see CLAUDE.md — this suite
// runs against the real local Postgres DB, not an isolated test DB, per
// explicit instruction; this module is what keeps that safe).
const prisma = require('../../lib/prisma');

const QA_PHONE_PREFIX = '+917000';
const QA_NAME_PREFIX = 'QA_';

// +9170009 10 0XX = sellers, +9170009 20 0XX = buyers, +9170009 30 0X = demo script,
// +9170009 40 0X = one-off throwaway users (suspended-user / ToS-gate checks).
function sellerPhone(i) {
  return `${QA_PHONE_PREFIX}910${String(i).padStart(3, '0')}`;
}
function buyerPhone(i) {
  return `${QA_PHONE_PREFIX}920${String(i).padStart(3, '0')}`;
}
function demoPhone(i) {
  return `${QA_PHONE_PREFIX}930${String(i).padStart(3, '0')}`;
}
function throwawayPhone(i) {
  return `${QA_PHONE_PREFIX}940${String(i).padStart(3, '0')}`;
}

function categoryName(suffix) {
  return `${QA_NAME_PREFIX}${suffix}`;
}

// Deletes every row this suite could have created, identified purely by the
// +917000... phone range and QA_ category-name prefix — never touches
// anything else in the database. Safe to call at the start of every run
// (idempotent re-run) and safe to call standalone via `npm run test:cleanup`.
async function wipeQaData() {
  const qaUsers = await prisma.appUser.findMany({
    where: { phone: { startsWith: QA_PHONE_PREFIX } },
    select: { id: true },
  });
  const qaUserIds = qaUsers.map((u) => u.id);

  const qaCategories = await prisma.commodityCategory.findMany({
    where: { name: { startsWith: QA_NAME_PREFIX } },
    select: { id: true },
  });
  const qaCategoryIds = qaCategories.map((c) => c.id);

  if (qaUserIds.length) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: qaUserIds } } });
  }

  const listingWhere = [];
  if (qaUserIds.length) listingWhere.push({ userId: { in: qaUserIds } });
  if (qaCategoryIds.length) listingWhere.push({ categoryId: { in: qaCategoryIds } });
  let listingsDeleted = 0;
  if (listingWhere.length) {
    const result = await prisma.listing.deleteMany({ where: { OR: listingWhere } });
    listingsDeleted = result.count;
  }

  let commoditiesDeleted = 0;
  if (qaCategoryIds.length) {
    const result = await prisma.commodity.deleteMany({ where: { categoryId: { in: qaCategoryIds } } });
    commoditiesDeleted = result.count;
    await prisma.commodityCategory.deleteMany({ where: { id: { in: qaCategoryIds } } });
  }

  const inviteResult = await prisma.invite.deleteMany({ where: { phone: { startsWith: QA_PHONE_PREFIX } } });

  let usersDeleted = 0;
  if (qaUserIds.length) {
    const result = await prisma.appUser.deleteMany({ where: { id: { in: qaUserIds } } });
    usersDeleted = result.count;
  }

  return {
    usersDeleted,
    categoriesDeleted: qaCategoryIds.length,
    commoditiesDeleted,
    listingsDeleted,
    invitesDeleted: inviteResult.count,
  };
}

module.exports = {
  QA_PHONE_PREFIX,
  QA_NAME_PREFIX,
  sellerPhone,
  buyerPhone,
  demoPhone,
  throwawayPhone,
  categoryName,
  wipeQaData,
};
