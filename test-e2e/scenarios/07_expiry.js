const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { expireStalePrices } = require('../../services/priceExpiry.service');

async function freshListing(api, seller, commodity, opts) {
  const body = { side: 'SELL', categoryId: commodity.categoryId, commodityId: commodity.id, quantityBags: 10, ...opts };
  const res = await api.post('/api/v1/listings', { token: seller.token, body });
  if (res.status !== 201) throw new Error(`fixture creation failed: ${JSON.stringify(res.json)}`);
  seller.listingIds.push(res.json.data.id);
  return res.json.data;
}

async function run(h, api, registry) {
  h.section('Expiry');

  const seller = registry.users.find((u) => u.role === 'seller');
  const buyer = registry.users.find((u) => u.role === 'buyer');

  const listings = [];
  for (let i = 0; i < 3; i++) {
    listings.push(
      await freshListing(api, seller, registry.commodities[i], { weightKg: 300 + i, quality: 'imported', price: 1000 + i })
    );
  }

  await h.test('EXPIRY-RUN', 'On-demand expiry job flips active -> price_expired, keeps price and row intact', async (ctx) => {
    await prisma.listing.updateMany({
      where: { id: { in: listings.map((l) => l.id) } },
      data: { priceValidUntil: new Date(Date.now() - 60 * 1000) },
    });
    const result = await expireStalePrices();
    ctx.actual = result;
    assert.ok(result.listingsExpired >= listings.length, 'expected at least our 3 listings to expire');

    const rows = await prisma.listing.findMany({ where: { id: { in: listings.map((l) => l.id) } } });
    for (const row of rows) {
      assert.equal(row.status, 'price_expired');
    }
    assert.deepEqual(
      rows.map((r) => Number(r.price)).sort(),
      listings.map((l) => Number(l.price)).sort(),
      'price must be untouched by expiry'
    );
  });

  await h.test('EXPIRY-HIDDEN-FROM-BROWSE', 'Expired listings are hidden from default browse', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = `/api/v1/listings?side=SELL&userId=${seller.id}`;
    const res = await api.get(ctx.endpoint, { token: buyer.token });
    ctx.statusCode = res.status;
    const visibleIds = res.json.data.map((r) => r.id);
    ctx.actual = { visibleIds };
    assert.equal(res.status, 200, JSON.stringify(res.json));
    for (const l of listings) {
      assert.ok(!visibleIds.includes(l.id), `expired listing ${l.id} must not be visible by default`);
    }
  });

  await h.test('EXPIRY-REPRICE-VISIBLE-AGAIN', 'Re-pricing an expired listing makes it active and visible again', async (ctx) => {
    const target = listings[0];
    const body = { price: Number(target.price) + 5 };
    ctx.method = 'PATCH';
    ctx.endpoint = `/api/v1/listings/${target.id}`;
    ctx.request = body;
    const res = await api.patch(ctx.endpoint, { token: seller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.data.status, 'active');

    const browse = await api.get(`/api/v1/listings?side=SELL&userId=${seller.id}`, { token: buyer.token });
    assert.ok(browse.json.data.some((r) => r.id === target.id), 'repriced listing must be visible again in browse');
  });
}

module.exports = { run };
