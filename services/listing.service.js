const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { validateUuid } = require('../lib/validators');
const { getSettingValue } = require('./settings.service');
const { buildContainsFilter, buildDateRangeFilter, buildNumberRangeFilter } = require('../lib/filters');
const {
  validateListingCreateInput,
  validateListingUpdateInput,
} = require('./listing.validation');

const VALID_SIDES = ['SELL', 'BUY'];
const VALID_STATUSES = ['active', 'price_expired', 'na', 'withdrawn', 'traded'];
const DEFAULT_STATUSES = ['active'];
const EDITABLE_STATUSES = ['active', 'price_expired'];
const BULK_MODES = ['delta', 'absolute'];

// Asia/Kolkata is a fixed UTC+5:30 offset year-round (no DST), so the cutoff
// math below can use a constant instead of a timezone library.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function toNumberOrNull(decimal) {
  if (decimal === null || decimal === undefined) {
    return null;
  }
  return typeof decimal.toNumber === 'function' ? decimal.toNumber() : Number(decimal);
}

function serializeListing(listing) {
  return { ...listing, price: toNumberOrNull(listing.price) };
}

// Combines the admin-configured price_expiry_time (HH:mm, Asia/Kolkata) with
// "today" — or tomorrow, if that moment has already passed relative to `now`.
async function computeNextExpiryCutoff(now = new Date()) {
  const { time } = await getSettingValue('price_expiry_time', { time: '02:00' });
  const [hours, minutes] = time.split(':').map(Number);

  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const cutoffUtcMs =
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), hours, minutes) -
    IST_OFFSET_MS;

  return cutoffUtcMs <= now.getTime()
    ? new Date(cutoffUtcMs + 24 * 60 * 60 * 1000)
    : new Date(cutoffUtcMs);
}

async function fetchCategoryAndCommodity(categoryId, commodityId) {
  const [category, commodity] = await Promise.all([
    prisma.commodityCategory.findUnique({ where: { id: categoryId } }),
    prisma.commodity.findUnique({ where: { id: commodityId } }),
  ]);
  if (!category) {
    throw new AppError('Category not found', 404);
  }
  if (!commodity) {
    throw new AppError('Commodity not found', 404);
  }
  if (commodity.categoryId !== categoryId) {
    throw new AppError('commodityId does not belong to categoryId', 400);
  }
  return commodity;
}

async function createListing(userId, body) {
  const input = validateListingCreateInput(body);
  const commodity = await fetchCategoryAndCommodity(input.categoryId, input.commodityId);

  const hasPrice = input.price !== null;
  const priceValidUntil = hasPrice ? await computeNextExpiryCutoff() : null;

  const data =
    input.side === 'BUY'
      ? {
          side: 'BUY',
          userId,
          categoryId: input.categoryId,
          commodityId: input.commodityId,
          itemName: commodity.name,
          quantityBags: input.quantityBags,
          availabilityBags: input.quantityBags,
          price: input.price,
          currency: 'INR',
          status: 'active',
          priceValidUntil,
        }
      : {
          side: 'SELL',
          userId,
          categoryId: input.categoryId,
          commodityId: input.commodityId,
          itemName: input.itemName,
          quality: input.quality,
          quantityBags: input.quantityBags,
          availabilityBags: input.quantityBags,
          weightKg: input.weightKg,
          price: input.price,
          currency: 'INR',
          photoUrls: input.photoUrls,
          videoUrls: input.videoUrls,
          moisture: input.moisture,
          color: input.color,
          size: input.size,
          paymentTerms: input.paymentTerms,
          notes: input.notes,
          status: hasPrice ? 'active' : 'na',
          priceValidUntil,
        };

  const listing = await prisma.listing.create({ data });
  return serializeListing(listing);
}

function parseStatusFilter(status) {
  if (status === undefined) {
    return DEFAULT_STATUSES;
  }
  const statuses = String(status)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of statuses) {
    if (!VALID_STATUSES.includes(s)) {
      throw new AppError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    }
  }
  return statuses.length ? statuses : DEFAULT_STATUSES;
}

async function getListings({
  side,
  categoryId,
  commodityId,
  status,
  userId,
  itemName,
  createdFrom,
  createdTo,
  minPrice,
  maxPrice,
  skip,
  take,
}) {
  if (!VALID_SIDES.includes(side)) {
    throw new AppError(`side is required and must be one of: ${VALID_SIDES.join(', ')}`, 400);
  }
  if (categoryId !== undefined) {
    validateUuid(categoryId, 'categoryId');
  }
  if (commodityId !== undefined) {
    validateUuid(commodityId, 'commodityId');
  }
  if (userId !== undefined) {
    validateUuid(userId, 'userId');
  }

  const statuses = parseStatusFilter(status);
  const itemNameFilter = buildContainsFilter(itemName);
  const createdAtFilter = buildDateRangeFilter(createdFrom, createdTo, 'created');
  const priceFilter = buildNumberRangeFilter(minPrice, maxPrice, 'price');

  const where = {
    side,
    status: { in: statuses },
    ...(categoryId ? { categoryId } : {}),
    ...(commodityId ? { commodityId } : {}),
    ...(userId ? { userId } : {}),
    ...(itemNameFilter ? { itemName: itemNameFilter } : {}),
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    ...(priceFilter ? { price: priceFilter } : {}),
  };

  // Cheapest-first for browsing supply; newest-first for browsing demand.
  const orderBy = side === 'SELL' ? { price: 'asc' } : { createdAt: 'desc' };

  const [data, total] = await Promise.all([
    prisma.listing.findMany({ where, orderBy, skip, take }),
    prisma.listing.count({ where }),
  ]);

  return { data: data.map(serializeListing), total };
}

async function getListingById(id) {
  validateUuid(id);
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, firmName: true, phone: true, city: true } },
    },
  });
  if (!listing) {
    throw new AppError('Listing not found', 404);
  }
  return serializeListing(listing);
}

async function updateListing(id, userId, body) {
  validateUuid(id);
  const existing = await prisma.listing.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Listing not found', 404);
  }
  if (existing.userId !== userId) {
    throw new AppError('Forbidden', 403);
  }

  const patch = validateListingUpdateInput(existing.side, body);

  if (patch.categoryId !== undefined || patch.commodityId !== undefined) {
    const nextCategoryId = patch.categoryId ?? existing.categoryId;
    const nextCommodityId = patch.commodityId ?? existing.commodityId;
    const commodity = await fetchCategoryAndCommodity(nextCategoryId, nextCommodityId);
    if (existing.side === 'BUY') {
      patch.itemName = commodity.name;
    }
  }

  const data = { ...patch };
  if (patch.price !== undefined) {
    data.status = 'active';
    data.priceValidUntil = await computeNextExpiryCutoff();
  }

  const updated = await prisma.listing.update({ where: { id }, data });
  return serializeListing(updated);
}

async function bulkUpdatePrice(userId, { listingIds, mode, value }) {
  if (!Array.isArray(listingIds) || listingIds.length === 0) {
    throw new AppError('listingIds must be a non-empty array', 400);
  }
  listingIds.forEach((id) => validateUuid(id, 'listingIds'));
  if (!BULK_MODES.includes(mode)) {
    throw new AppError(`mode must be one of: ${BULK_MODES.join(', ')}`, 400);
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new AppError('value must be a number', 400);
  }
  if (mode === 'absolute' && numericValue <= 0) {
    throw new AppError('value must be a positive number in absolute mode', 400);
  }

  const listings = await prisma.listing.findMany({
    where: {
      id: { in: listingIds },
      userId,
      status: { in: EDITABLE_STATUSES },
    },
  });
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));

  const skipped = [];
  const toUpdate = [];

  for (const id of listingIds) {
    const listing = listingById.get(id);
    if (!listing) {
      skipped.push({ id, reason: 'not_editable' });
      continue;
    }

    let nextPrice;
    if (mode === 'absolute') {
      nextPrice = numericValue;
    } else {
      const currentPrice = toNumberOrNull(listing.price);
      if (currentPrice === null) {
        skipped.push({ id, reason: 'no_prior_price' });
        continue;
      }
      nextPrice = currentPrice + numericValue;
      if (nextPrice <= 0) {
        skipped.push({ id, reason: 'result_not_positive' });
        continue;
      }
    }

    toUpdate.push({ id, price: nextPrice });
  }

  const priceValidUntil = toUpdate.length ? await computeNextExpiryCutoff() : null;

  const updated = await prisma.$transaction(
    toUpdate.map(({ id, price }) =>
      prisma.listing.update({
        where: { id },
        data: { price, status: 'active', priceValidUntil },
      })
    )
  );

  return { updated: updated.map(serializeListing), skipped };
}

async function withdrawListing(id, userId) {
  validateUuid(id);
  const existing = await prisma.listing.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Listing not found', 404);
  }
  if (existing.userId !== userId) {
    throw new AppError('Forbidden', 403);
  }
  if (existing.status === 'withdrawn') {
    throw new AppError('Listing is already withdrawn', 409);
  }
  if (existing.status === 'traded') {
    throw new AppError('A traded listing cannot be withdrawn', 409);
  }

  const updated = await prisma.listing.update({
    where: { id },
    data: { status: 'withdrawn' },
  });
  return serializeListing(updated);
}

module.exports = {
  createListing,
  getListings,
  getListingById,
  updateListing,
  bulkUpdatePrice,
  withdrawListing,
  computeNextExpiryCutoff,
};
