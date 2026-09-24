const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { validateUuid } = require('../lib/validators');

function validateName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) {
    throw new AppError('name is required', 400);
  }
  return trimmed;
}

async function createCommodity(categoryId, name, actorUserId) {
  validateUuid(categoryId, 'categoryId');
  const category = await prisma.commodityCategory.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new AppError('Category not found', 404);
  }

  const trimmedName = validateName(name);

  let commodity;
  try {
    commodity = await prisma.commodity.create({
      data: { categoryId, name: trimmedName },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AppError('This commodity already exists in that category', 409);
    }
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: 'COMMODITY_CREATED',
      entity: 'Commodity',
      entityId: commodity.id,
      before: null,
      after: commodity,
    },
  });

  return commodity;
}

async function listCommodities(categoryId) {
  if (categoryId !== undefined) {
    validateUuid(categoryId, 'categoryId');
  }
  return prisma.commodity.findMany({
    where: categoryId ? { categoryId } : undefined,
    orderBy: { name: 'asc' },
    include: { category: { select: { name: true } } },
  });
}

async function updateCommodity(id, { name, categoryId }, actorUserId) {
  validateUuid(id);
  if (categoryId !== undefined) {
    validateUuid(categoryId, 'categoryId');
  }

  const existing = await prisma.commodity.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Commodity not found', 404);
  }

  if (categoryId !== undefined && categoryId !== existing.categoryId) {
    const category = await prisma.commodityCategory.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new AppError('Category not found', 404);
    }
  }

  const data = {};
  if (name !== undefined) {
    data.name = validateName(name);
  }
  if (categoryId !== undefined) {
    data.categoryId = categoryId;
  }

  let updated;
  try {
    updated = await prisma.commodity.update({ where: { id }, data });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AppError('This commodity already exists in that category', 409);
    }
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: 'COMMODITY_UPDATED',
      entity: 'Commodity',
      entityId: id,
      before: existing,
      after: updated,
    },
  });

  return updated;
}

async function deleteCommodity(id, actorUserId) {
  validateUuid(id);
  const existing = await prisma.commodity.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Commodity not found', 404);
  }

  // Listing.commodity and Trade.commodity are onDelete: SetNull, not Restrict,
  // so there's no FK violation to catch here — the check has to happen here.
  const [listingCount, tradeCount] = await Promise.all([
    prisma.listing.count({ where: { commodityId: id } }),
    prisma.trade.count({ where: { commodityId: id } }),
  ]);

  if (listingCount > 0 || tradeCount > 0) {
    throw new AppError(
      "Cannot delete a commodity that's still referenced by listings or trades",
      409
    );
  }

  await prisma.commodity.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: 'COMMODITY_DELETED',
      entity: 'Commodity',
      entityId: id,
      before: existing,
      after: null,
    },
  });
}

module.exports = { createCommodity, listCommodities, updateCommodity, deleteCommodity };
