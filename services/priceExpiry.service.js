const prisma = require('../lib/prisma');

// Flips `active` -> `price_expired` for any row whose individually-stored
// priceValidUntil has passed. `price` is never touched here (sticky rule —
// see listing.service.js §2). Side-agnostic: applies to SELL and BUY listings
// alike, and to FreightRoute (same 2 AM-style expiry concept, CLAUDE.md §4.9),
// even though no FreightRoute write-path exists yet.
async function expireStalePrices(now = new Date()) {
  const [listingResult, freightResult] = await Promise.all([
    prisma.listing.updateMany({
      where: { status: 'active', priceValidUntil: { lte: now } },
      data: { status: 'price_expired' },
    }),
    prisma.freightRoute.updateMany({
      where: { status: 'active', priceValidUntil: { lte: now } },
      data: { status: 'price_expired' },
    }),
  ]);

  return {
    listingsExpired: listingResult.count,
    freightRoutesExpired: freightResult.count,
  };
}

module.exports = { expireStalePrices };
