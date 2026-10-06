const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');

async function run(h, api, registry) {
  h.section('Concurrency');

  const seller = registry.users.filter((u) => u.role === 'seller')[9];
  const commodity = registry.commodities[0];

  const createRes = await api.post('/api/v1/listings', {
    token: seller.token,
    body: { side: 'SELL', categoryId: commodity.categoryId, commodityId: commodity.id, quantityBags: 5, weightKg: 555, quality: 'dardra', price: 1000 },
  });
  if (createRes.status !== 201) throw new Error(`fixture creation failed: ${JSON.stringify(createRes.json)}`);
  const listing = createRes.json.data;
  seller.listingIds.push(listing.id);

  await h.test(
    'CONCURRENCY-10-PARALLEL-DELTA',
    '10 parallel delta(+10) requests on the same listing: checks for lost updates from the read-then-write race',
    async (ctx) => {
      const body = { mode: 'delta', listingIds: [listing.id], value: 10 };
      ctx.method = 'PATCH';
      ctx.endpoint = '/api/v1/listings/bulk-price';
      ctx.request = { ...body, note: 'fired 10x in parallel' };

      const requests = Array.from({ length: 10 }, () => api.patch('/api/v1/listings/bulk-price', { token: seller.token, body }));
      const responses = await Promise.all(requests);

      const row = await prisma.listing.findUnique({ where: { id: listing.id } });
      const finalPrice = Number(row.price);
      const expectedPrice = 1000 + 10 * 10; // 1100

      ctx.actual = { finalPrice, expectedPrice, responseStatuses: responses.map((r) => r.status) };

      for (const r of responses) {
        assert.equal(r.status, 200, `every parallel request should at least respond 200: ${JSON.stringify(r.json)}`);
      }

      // This is the actual check being reported, not silently fixed: bulkDeltaPrice
      // reads the current price via a separate findMany, then writes, with no
      // row lock / atomic increment between read and write (services/listing.service.js).
      // Under real concurrency this can lose updates. We assert the correct
      // (race-free) outcome so a regression shows as FAIL in the report; if it
      // fails, that failure IS the bug — see "Bugs found" in the report.
      assert.equal(finalPrice, expectedPrice, `expected ${expectedPrice} after 10x +10, got ${finalPrice} — lost update(s) under concurrency`);
    }
  );
}

module.exports = { run };
