const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { validateUuid } = require('../lib/validators');
const { getSettingValue } = require('./settings.service');
const { buildContainsFilter, buildDateRangeFilter, buildNumberRangeFilter } = require('../lib/filters');
const {
  validateListingCreateInput,
  validateListingUpdateInput,
  requirePositiveDecimal,
} = require('./listing.validation');

const VALID_SIDES = ['SELL', 'BUY'];
const VALID_STATUSES = ['active', 'price_expired', 'na', 'withdrawn', 'traded'];
const DEFAULT_STATUSES = ['active'];
const EDITABLE_STATUSES = ['active', 'price_expired'];
const BULK_MODES = ['delta', 'set-many'];

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
  const { createdAt, updatedAt, ...rest } = listing;
  return { ...rest, price: toNumberOrNull(listing.price) };
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

  // itemName is never client input on either side — commodityId already identifies
  // the specific trademark/product, so it's always derived from commodity.name.
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
          itemName: commodity.name,
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

  let listing;
  try {
    listing = await prisma.listing.create({ data });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AppError(
        'You already have a listing with this same category, commodity, weight and quality',
        409
      );
    }
    throw err;
  }
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
  requestingUser,
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

  // userId stays open to every caller — browsing a specific firm's listings
  // (CLAUDE.md §4.0.1 "Seller Listings page") is a buyer-facing feature, not
  // admin-only. What's actually restricted is the STATUS someone can see when
  // looking at someone else's listings: a non-owner, non-admin caller only
  // ever gets the public `active` ones, never withdrawn/na/traded/price_expired.
  if (userId !== undefined) {
    const isOwnListings = requestingUser && requestingUser.id === userId;
    const isAdmin = requestingUser && requestingUser.roles.includes('admin');
    const requestedNonPublicStatus = statuses.some((s) => s !== 'active');
    if (!isOwnListings && !isAdmin && requestedNonPublicStatus) {
      throw new AppError("Cannot view another user's non-active listings", 403);
    }
  }

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
    // itemName always mirrors commodity.name, on both sides — re-derive it whenever
    // the commodity changes.
    patch.itemName = commodity.name;
  }

  const data = { ...patch };
  if (patch.price !== undefined) {
    data.status = 'active';
    data.priceValidUntil = await computeNextExpiryCutoff();
  }

  let updated;
  try {
    updated = await prisma.listing.update({ where: { id }, data });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AppError(
        'You already have a listing with this same category, commodity, weight and quality',
        409
      );
    }
    throw err;
  }
  return serializeListing(updated);
}

// Dispatcher: PATCH /listings/bulk-price validates by body.mode. "delta" applies
// the same +/- value to many listings (or ALL of the caller's own editable
// listings, when listingIds is omitted); "set-many" applies a distinct price per
// listing in one call (the "edit several cells in a table, hit Update once" flow).
// There is deliberately no "set everyone to the same price" mode — that case
// doesn't occur in practice (different commodities/qualities never share a price).
async function bulkUpdatePrice(userId, body) {
  const { mode } = body;
  if (!BULK_MODES.includes(mode)) {
    throw new AppError(`mode must be one of: ${BULK_MODES.join(', ')}`, 400);
  }
  return mode === 'delta' ? bulkDeltaPrice(userId, body) : bulkSetManyPrice(userId, body);
}

async function applyBulkPriceUpdates(toUpdate) {
  const priceValidUntil = toUpdate.length ? await computeNextExpiryCutoff() : null;
  const updated = await prisma.$transaction(
    toUpdate.map(({ id, price }) =>
      prisma.listing.update({
        where: { id },
        data: { price, status: 'active', priceValidUntil },
      })
    )
  );
  return updated.map(serializeListing);
}

async function bulkDeltaPrice(userId, { listingIds, value }) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new AppError('value must be a number', 400);
  }

  // listingIds omitted (or not provided at all) => apply to ALL of the
  // caller's own active/price_expired listings, not just a selected subset.
  let explicitIds = null;
  if (listingIds !== undefined) {
    if (!Array.isArray(listingIds) || listingIds.length === 0) {
      throw new AppError('listingIds must be a non-empty array', 400);
    }
    listingIds.forEach((id) => validateUuid(id, 'listingIds'));
    explicitIds = listingIds;
  }

  const listings = await prisma.listing.findMany({
    where: {
      userId,
      status: { in: EDITABLE_STATUSES },
      ...(explicitIds ? { id: { in: explicitIds } } : {}),
    },
  });
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  // When explicitIds is null, every row already came from the userId+status
  // filtered query above, so idsToProcess can't contain an id missing from the map.
  const idsToProcess = explicitIds || listings.map((listing) => listing.id);

  const skipped = [];
  const toUpdate = [];

  for (const id of idsToProcess) {
    const listing = listingById.get(id);
    if (!listing) {
      skipped.push({ id, reason: 'not_editable' });
      continue;
    }

    const currentPrice = toNumberOrNull(listing.price);
    if (currentPrice === null) {
      skipped.push({ id, reason: 'no_prior_price' });
      continue;
    }
    const nextPrice = currentPrice + numericValue;
    if (nextPrice <= 0) {
      skipped.push({ id, reason: 'result_not_positive' });
      continue;
    }

    toUpdate.push({ id, price: nextPrice });
  }

  const updated = await applyBulkPriceUpdates(toUpdate);
  return { updated, skipped };
}

async function bulkSetManyPrice(userId, { updates }) {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new AppError('updates must be a non-empty array', 400);
  }

  // Last entry wins if the same listingId appears more than once.
  const priceById = new Map();
  for (const entry of updates) {
    const id = validateUuid(entry && entry.listingId, 'listingId');
    const price = requirePositiveDecimal(entry && entry.price, 'price');
    priceById.set(id, price);
  }

  const ids = Array.from(priceById.keys());
  const listings = await prisma.listing.findMany({
    where: { id: { in: ids }, userId, status: { in: EDITABLE_STATUSES } },
  });
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));

  const skipped = [];
  const toUpdate = [];

  for (const id of ids) {
    if (!listingById.has(id)) {
      skipped.push({ id, reason: 'not_editable' });
      continue;
    }
    toUpdate.push({ id, price: priceById.get(id) });
  }

  const updated = await applyBulkPriceUpdates(toUpdate);
  return { updated, skipped };
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
  // Exported for reuse by listing-bulk.service.js.
  fetchCategoryAndCommodity,
};
