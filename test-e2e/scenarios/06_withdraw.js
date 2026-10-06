const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');

function sellersOf(registry) {
  return registry.users.filter((u) => u.role === 'seller');
}

async function freshListing(api, seller, commodity, opts) {
  const body = { side: 'SELL', categoryId: commodity.categoryId, commodityId: commodity.id, quantityBags: 10, ...opts };
  const res = await api.post('/api/v1/listings', { token: seller.token, body });
  if (res.status !== 201) throw new Error(`fixture creation failed: ${JSON.stringify(res.json)}`);
  seller.listingIds.push(res.json.data.id);
  return res.json.data;
}

async function run(h, api, registry) {
  h.section('Withdraw');

  const [ownerSeller, otherSeller] = sellersOf(registry);
  const commodity = registry.commodities[0];
  const listing = await freshListing(api, ownerSeller, commodity, { weightKg: 200, quality: 'parmal', price: 999 });

  await h.test('WITHDRAW-OWNER-OK', 'Owner withdraws their own listing -> status withdrawn, row stays in DB', async (ctx) => {
    ctx.method = 'PATCH';
    ctx.endpoint = `/api/v1/listings/${listing.id}/withdraw`;
    const res = await api.patch(ctx.endpoint, { token: ownerSeller.token });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.data.status, 'withdrawn');
    const row = await prisma.listing.findUnique({ where: { id: listing.id } });
    assert.ok(row, 'row must still exist in the DB, not deleted');
    assert.equal(row.status, 'withdrawn');
  });

  await h.test('WITHDRAW-NONOWNER-BLOCKED', "Another user cannot withdraw someone else's listing", async (ctx) => {
    const other = await freshListing(api, otherSeller, commodity, { weightKg: 201, quality: 'parmal', price: 888 });
    ctx.method = 'PATCH';
    ctx.endpoint = `/api/v1/listings/${other.id}/withdraw`;
    const res = await api.patch(ctx.endpoint, { token: ownerSeller.token });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 403, JSON.stringify(res.json));
    const row = await prisma.listing.findUnique({ where: { id: other.id } });
    assert.equal(row.status, 'active');
  });

  await h.test('WITHDRAW-DOUBLE', 'Withdrawing an already-withdrawn listing -> 409', async (ctx) => {
    ctx.method = 'PATCH';
    ctx.endpoint = `/api/v1/listings/${listing.id}/withdraw`;
    const res = await api.patch(ctx.endpoint, { token: ownerSeller.token });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 409, JSON.stringify(res.json));
  });

  await h.test('WITHDRAW-HIDDEN-FROM-BROWSE', 'A withdrawn listing no longer appears in default browse', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = `/api/v1/listings?side=SELL&userId=${ownerSeller.id}`;
    const res = await api.get(ctx.endpoint, { token: otherSeller.token });
    ctx.statusCode = res.status;
    ctx.actual = { ids: res.json?.data?.map((r) => r.id) };
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.ok(!res.json.data.some((r) => r.id === listing.id), 'withdrawn listing must not appear in default browse');
  });

  await h.test('WITHDRAW-NOT-RESURRECTED-BY-BULK', 'Bulk-price (set-many) cannot resurrect a withdrawn listing', async (ctx) => {
    const body = { mode: 'set-many', updates: [{ listingId: listing.id, price: 5000 }] };
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = body;
    const res = await api.patch('/api/v1/listings/bulk-price', { token: ownerSeller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const skip = res.json.data.skipped.find((s) => s.id === listing.id);
    assert.ok(skip, 'a withdrawn listing must come back in skipped[], not be updated');
    assert.equal(skip.reason, 'not_editable');
    const row = await prisma.listing.findUnique({ where: { id: listing.id } });
    assert.equal(row.status, 'withdrawn', 'status must remain withdrawn');
    assert.equal(Number(row.price), 999, 'price must remain unchanged (not resurrected to 5000)');
  });
}

module.exports = { run };
