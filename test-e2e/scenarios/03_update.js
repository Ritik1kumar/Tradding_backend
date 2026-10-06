const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { expireStalePrices } = require('../../services/priceExpiry.service');

function sellersOf(registry) {
  return registry.users.filter((u) => u.role === 'seller');
}

async function run(h, api, registry) {
  h.section('Update');

  const [sellerA, sellerB] = sellersOf(registry);

  // --- Owner updates price/quality/weightKg/notes, verify API response AND DB row match
  await h.test('UPDATE-01', 'Owner updates price/quality/weightKg/notes; DB row matches response', async (ctx) => {
    const listingId = sellerA.listingIds[0];
    const body = { price: 1555, quality: 'bold', weightKg: 35, notes: 'QA updated note' };
    ctx.method = 'PATCH';
    ctx.endpoint = `/api/v1/listings/${listingId}`;
    ctx.request = body;
    const res = await api.patch(`/api/v1/listings/${listingId}`, { token: sellerA.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));

    const dbRow = await prisma.listing.findUnique({ where: { id: listingId } });
    assert.equal(Number(dbRow.price), 1555);
    assert.equal(dbRow.quality, 'bold');
    assert.equal(dbRow.weightKg, 35);
    assert.equal(dbRow.notes, 'QA updated note');
    assert.equal(dbRow.status, 'active', 'a successful price edit must set status back to active');
  });

  // --- Non-owner cannot PATCH; row stays unchanged
  await h.test('UPDATE-02', "Non-owner PATCH on seller A's listing -> 403, row unchanged", async (ctx) => {
    const listingId = sellerA.listingIds[0];
    const before = await prisma.listing.findUnique({ where: { id: listingId } });
    const body = { price: 1, notes: 'should not apply' };
    ctx.method = 'PATCH';
    ctx.endpoint = `/api/v1/listings/${listingId}`;
    ctx.request = body;
    const res = await api.patch(`/api/v1/listings/${listingId}`, { token: sellerB.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 403, JSON.stringify(res.json));
    const after = await prisma.listing.findUnique({ where: { id: listingId } });
    assert.equal(Number(after.price), Number(before.price));
    assert.equal(after.notes, before.notes);
  });

  // --- Price edit on an "na" listing brings it back to active
  await h.test('UPDATE-03', 'Price edit on an "na" (never-priced) listing -> status becomes active', async (ctx) => {
    const candidate = await prisma.listing.findFirst({
      where: { userId: sellerA.id, status: 'na' },
    });
    assert.ok(candidate, 'test fixture expected at least one "na" listing for sellerA (created in 02_create.js)');
    const body = { price: 777 };
    ctx.method = 'PATCH';
    ctx.endpoint = `/api/v1/listings/${candidate.id}`;
    ctx.request = body;
    const res = await api.patch(`/api/v1/listings/${candidate.id}`, { token: sellerA.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.data.status, 'active');
  });

  // --- Price edit on a price_expired listing brings it back to active
  await h.test('UPDATE-04', 'Price edit on a price_expired listing -> status becomes active again', async (ctx) => {
    const candidate = await prisma.listing.findFirst({
      where: { userId: sellerB.id, status: 'active', price: { not: null } },
    });
    assert.ok(candidate, 'test fixture expected at least one priced active listing for sellerB');

    // Force it into the past so the on-demand expiry job picks it up.
    await prisma.listing.update({
      where: { id: candidate.id },
      data: { priceValidUntil: new Date(Date.now() - 60 * 60 * 1000) },
    });
    const expiry = await expireStalePrices();
    assert.ok(expiry.listingsExpired >= 1, 'expireStalePrices should have flipped at least one row');

    const expired = await prisma.listing.findUnique({ where: { id: candidate.id } });
    assert.equal(expired.status, 'price_expired');
    assert.equal(Number(expired.price), Number(candidate.price), 'expiry must never touch the sticky price');

    const body = { price: Number(candidate.price) + 10 };
    ctx.method = 'PATCH';
    ctx.endpoint = `/api/v1/listings/${candidate.id}`;
    ctx.request = body;
    const res = await api.patch(`/api/v1/listings/${candidate.id}`, { token: sellerB.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.data.status, 'active');
  });
}

module.exports = { run };
