const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { expireStalePrices } = require('../../services/priceExpiry.service');

function sellersOf(registry) {
  return registry.users.filter((u) => u.role === 'seller');
}

async function freshListing(api, seller, commodity, { price = 1000, weightKg = 20, quality = 'standard' } = {}) {
  const body = { side: 'SELL', categoryId: commodity.categoryId, commodityId: commodity.id, quantityBags: 10, weightKg, quality, price };
  const res = await api.post('/api/v1/listings', { token: seller.token, body });
  if (res.status !== 201) throw new Error(`fixture creation failed: ${JSON.stringify(res.json)}`);
  seller.listingIds.push(res.json.data.id);
  return res.json.data;
}

async function run(h, api, registry) {
  h.section('BulkPrice');

  const sellers = sellersOf(registry);
  const [deltaAllSeller, deltaSelectedSeller, setManySeller, victimSeller, snoopSeller, bulkCountSeller] = sellers.slice(2, 8);

  // --- delta, listingIds omitted => ALL of caller's own active/price_expired listings ---
  await h.test('BULK-DELTA-ALL-01', 'delta without listingIds applies to ALL of the caller\'s own editable listings', async (ctx) => {
    const before = await prisma.listing.findMany({
      where: { userId: deltaAllSeller.id, status: { in: ['active', 'price_expired'] } },
    });
    const expectedUpdates = new Map();
    const expectedSkips = [];
    for (const l of before) {
      const current = l.price === null ? null : Number(l.price);
      if (current === null) {
        expectedSkips.push(l.id);
      } else {
        expectedUpdates.set(l.id, current + 50);
      }
    }

    const body = { mode: 'delta', value: 50 };
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = body;
    const res = await api.patch('/api/v1/listings/bulk-price', { token: deltaAllSeller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));

    const updatedIds = new Set(res.json.data.updated.map((u) => u.id));
    for (const [id, expectedPrice] of expectedUpdates) {
      assert.ok(updatedIds.has(id), `expected ${id} to be updated`);
      const row = res.json.data.updated.find((u) => u.id === id);
      assert.equal(Number(row.price), expectedPrice, `expected ${id} price ${expectedPrice}, got ${row.price}`);
      assert.equal(row.status, 'active');
    }
    for (const id of expectedSkips) {
      const skip = res.json.data.skipped.find((s) => s.id === id);
      assert.ok(skip, `expected ${id} (never priced) to be in skipped[]`);
      assert.equal(skip.reason, 'no_prior_price');
    }
  });

  // --- delta still works on a price_expired listing, as part of ALL ---
  await h.test('BULK-DELTA-ALL-02', 'delta-ALL also reprices a price_expired listing and flips it back to active', async (ctx) => {
    const commodity = registry.commodities[0];
    const listing = await freshListing(api, deltaAllSeller, commodity, { price: 500, weightKg: 61, quality: 'dry' });
    await prisma.listing.update({ where: { id: listing.id }, data: { priceValidUntil: new Date(Date.now() - 1000) } });
    await expireStalePrices();
    const expired = await prisma.listing.findUnique({ where: { id: listing.id } });
    assert.equal(expired.status, 'price_expired');

    const body = { mode: 'delta', value: 25 };
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = body;
    const res = await api.patch('/api/v1/listings/bulk-price', { token: deltaAllSeller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const row = res.json.data.updated.find((u) => u.id === listing.id);
    assert.ok(row, 'expired listing should have been picked up by delta-ALL');
    assert.equal(Number(row.price), 525);
    assert.equal(row.status, 'active');
  });

  // --- delta with explicit selected listingIds (+50 and -50) ---
  await h.test('BULK-DELTA-SELECTED-01', 'delta with explicit listingIds (+50) only touches the selected ones', async (ctx) => {
    const commodity = registry.commodities[1];
    const a = await freshListing(api, deltaSelectedSeller, commodity, { price: 700, weightKg: 62, quality: 'small' });
    const untouchedCommodity = registry.commodities[2];
    const untouched = await freshListing(api, deltaSelectedSeller, untouchedCommodity, { price: 700, weightKg: 63, quality: 'small' });

    const body = { mode: 'delta', listingIds: [a.id], value: 50 };
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = body;
    const res = await api.patch('/api/v1/listings/bulk-price', { token: deltaSelectedSeller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(Number(res.json.data.updated[0].price), 750);

    const untouchedRow = await prisma.listing.findUnique({ where: { id: untouched.id } });
    assert.equal(Number(untouchedRow.price), 700, 'listing not in listingIds must stay untouched');
  });

  await h.test('BULK-DELTA-SELECTED-02', 'delta with explicit listingIds (-50) computes from the sticky price', async (ctx) => {
    const commodity = registry.commodities[3];
    const a = await freshListing(api, deltaSelectedSeller, commodity, { price: 700, weightKg: 64, quality: 'small' });
    const body = { mode: 'delta', listingIds: [a.id], value: -50 };
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = body;
    const res = await api.patch('/api/v1/listings/bulk-price', { token: deltaSelectedSeller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(Number(res.json.data.updated[0].price), 650);
  });

  // --- delta that would drive price to 0 or below -> skipped, never negative ---
  await h.test('BULK-DELTA-NEGATIVE-GUARD', 'delta that would push price <= 0 is skipped, price stays unchanged and never negative', async (ctx) => {
    const commodity = registry.commodities[4];
    const listing = await freshListing(api, deltaSelectedSeller, commodity, { price: 30, weightKg: 65, quality: 'small' });
    const body = { mode: 'delta', listingIds: [listing.id], value: -1000 };
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = body;
    const res = await api.patch('/api/v1/listings/bulk-price', { token: deltaSelectedSeller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const skip = res.json.data.skipped.find((s) => s.id === listing.id);
    assert.ok(skip, 'expected the listing in skipped[]');
    assert.equal(skip.reason, 'result_not_positive');
    const row = await prisma.listing.findUnique({ where: { id: listing.id } });
    assert.equal(Number(row.price), 30, 'price must remain unchanged, never negative');
  });

  // --- set-many: distinct price per listing in one call ---
  await h.test('BULK-SETMANY-01', 'set-many applies a distinct price per listing in a single call', async (ctx) => {
    const c1 = await freshListing(api, setManySeller, registry.commodities[0], { price: 100, weightKg: 70, quality: 'bold' });
    const c2 = await freshListing(api, setManySeller, registry.commodities[1], { price: 200, weightKg: 71, quality: 'bold' });
    const c3 = await freshListing(api, setManySeller, registry.commodities[2], { price: 300, weightKg: 72, quality: 'bold' });

    const body = {
      mode: 'set-many',
      updates: [
        { listingId: c1.id, price: 1200 },
        { listingId: c2.id, price: 950 },
        { listingId: c3.id, price: 1500 },
      ],
    };
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = body;
    const res = await api.patch('/api/v1/listings/bulk-price', { token: setManySeller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const byId = new Map(res.json.data.updated.map((u) => [u.id, Number(u.price)]));
    assert.equal(byId.get(c1.id), 1200);
    assert.equal(byId.get(c2.id), 950);
    assert.equal(byId.get(c3.id), 1500);
  });

  await h.test('BULK-SETMANY-DUPLICATE', 'set-many with a duplicate listingId: last entry in the array wins', async (ctx) => {
    const listing = await freshListing(api, setManySeller, registry.commodities[3], { price: 100, weightKg: 73, quality: 'bold' });
    const body = {
      mode: 'set-many',
      updates: [
        { listingId: listing.id, price: 111 },
        { listingId: listing.id, price: 999 },
      ],
    };
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = body;
    const res = await api.patch('/api/v1/listings/bulk-price', { token: setManySeller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(Number(res.json.data.updated[0].price), 999, 'last entry for a duplicate listingId must win');
  });

  // --- another user's listingId mixed into a bulk request must not be touched ---
  await h.test('BULK-CROSS-USER-GUARD', "Another user's listingId mixed into my bulk request is skipped, not modified", async (ctx) => {
    const mine = await freshListing(api, snoopSeller, registry.commodities[4], { price: 400, weightKg: 80, quality: 'mota' });
    const victims = await freshListing(api, victimSeller, registry.commodities[4], { price: 400, weightKg: 81, quality: 'mota' });

    const body = { mode: 'delta', listingIds: [mine.id, victims.id], value: 10 };
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = body;
    const res = await api.patch('/api/v1/listings/bulk-price', { token: snoopSeller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.ok(res.json.data.updated.find((u) => u.id === mine.id));
    const victimSkip = res.json.data.skipped.find((s) => s.id === victims.id);
    assert.ok(victimSkip, "another user's listingId must land in skipped[]");
    assert.equal(victimSkip.reason, 'not_editable');

    const victimRow = await prisma.listing.findUnique({ where: { id: victims.id } });
    assert.equal(Number(victimRow.price), 400, "victim's price must be unchanged");
  });

  // --- Seller's own delta-ALL must not move any other user's prices ---
  await h.test('BULK-ISOLATION-SNAPSHOT', "delta-ALL for one seller doesn't change any other user's prices", async (ctx) => {
    const others = sellers.filter((s) => s.id !== deltaAllSeller.id);
    const before = await prisma.listing.findMany({ where: { userId: { in: others.map((o) => o.id) } } });
    const beforeMap = new Map(before.map((l) => [l.id, l.price === null ? null : Number(l.price)]));

    const body = { mode: 'delta', value: 1 };
    const res = await api.patch('/api/v1/listings/bulk-price', { token: deltaAllSeller.token, body });
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = body;
    ctx.statusCode = res.status;
    ctx.actual = { updatedCount: res.json.data.updated.length };
    assert.equal(res.status, 200, JSON.stringify(res.json));

    const after = await prisma.listing.findMany({ where: { userId: { in: others.map((o) => o.id) } } });
    for (const row of after) {
      assert.equal(
        row.price === null ? null : Number(row.price),
        beforeMap.get(row.id),
        `listing ${row.id} belonging to another user must not change`
      );
    }
  });

  // --- Validation errors ---
  const validationCases = [
    { id: 'BULK-NEG-invalid-mode', body: { mode: 'absolute', value: 10 }, desc: '"absolute" is no longer a valid mode -> 400' },
    { id: 'BULK-NEG-missing-value', body: { mode: 'delta' }, desc: 'delta missing value -> 400' },
    { id: 'BULK-NEG-nonnumeric-value', body: { mode: 'delta', value: 'fifty' }, desc: 'delta non-numeric value -> 400' },
    { id: 'BULK-NEG-empty-listingIds', body: { mode: 'delta', listingIds: [], value: 10 }, desc: 'delta with explicit empty listingIds array -> 400' },
    { id: 'BULK-NEG-empty-updates', body: { mode: 'set-many', updates: [] }, desc: 'set-many with empty updates array -> 400' },
  ];
  for (const vc of validationCases) {
    await h.test(vc.id, vc.desc, async (ctx) => {
      ctx.method = 'PATCH';
      ctx.endpoint = '/api/v1/listings/bulk-price';
      ctx.request = vc.body;
      const res = await api.patch('/api/v1/listings/bulk-price', { token: deltaSelectedSeller.token, body: vc.body });
      ctx.statusCode = res.status;
      ctx.actual = res.json;
      assert.equal(res.status, 400, JSON.stringify(res.json));
    });
  }

  // --- Medium-bulk smoke test: 30 listings in one set-many call ---
  await h.test('BULK-SETMANY-30', 'set-many handles 30 listings in a single call (medium-bulk smoke test)', async (ctx) => {
    const created = [];
    for (let i = 0; i < 30; i++) {
      const commodity = registry.commodities[i % registry.commodities.length];
      const listing = await freshListing(api, bulkCountSeller, commodity, {
        price: 100 + i,
        weightKg: 100 + i,
        quality: 'normal',
      });
      created.push(listing);
    }
    const body = { mode: 'set-many', updates: created.map((l, i) => ({ listingId: l.id, price: 2000 + i })) };
    ctx.method = 'PATCH';
    ctx.endpoint = '/api/v1/listings/bulk-price';
    ctx.request = { mode: 'set-many', updates: `[${created.length} entries]` };
    const res = await api.patch('/api/v1/listings/bulk-price', { token: bulkCountSeller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = { updatedCount: res.json.data.updated.length, skippedCount: res.json.data.skipped.length };
    assert.equal(res.status, 200, JSON.stringify(res.json).slice(0, 300));
    assert.equal(res.json.data.updated.length, 30);
  });
}

module.exports = { run };
