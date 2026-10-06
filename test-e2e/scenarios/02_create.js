const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { QUALITY_GRADES } = require('../../services/listing.validation');

function sellersOf(registry) {
  return registry.users.filter((u) => u.role === 'seller');
}
function buyersOf(registry) {
  return registry.users.filter((u) => u.role === 'buyer');
}

// Deterministic cyclic slice so each seller gets a varied but repeatable set
// of commodities (avoids colliding with the SELL uniqueness constraint).
function pick(list, startIdx, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(list[(startIdx + i) % list.length]);
  }
  return out;
}

async function run(h, api, registry) {
  h.section('Create');

  const sellers = sellersOf(registry);
  const buyers = buyersOf(registry);

  // --- A. Positive: sellers create SELL listings -------------------------------
  sellers.forEach((seller, sIdx) => {
    const count = 5 + (sIdx % 4); // 5..8
    const commodities = pick(registry.commodities, sIdx, count);
    seller.plannedSellCount = count;
    seller._commodityPlan = commodities;
  });

  for (const seller of sellers) {
    for (let j = 0; j < seller._commodityPlan.length; j++) {
      const commodity = seller._commodityPlan[j];
      const hasPrice = j % 3 !== 0; // every 3rd listing has no price -> expect status "na"
      const weightKg = [26, 30, 35, 45, null][j % 5];
      const quality = QUALITY_GRADES[(j + seller._commodityPlan.indexOf(commodity)) % QUALITY_GRADES.length];
      const price = hasPrice ? 800 + j * 37 : undefined;

      await h.test(
        `CREATE-SELL-${seller.phone}-${j}`,
        `Seller ${seller.phone} creates SELL listing (${commodity.name}, price=${hasPrice ? price : 'none'})`,
        async (ctx) => {
          const body = {
            side: 'SELL',
            categoryId: commodity.categoryId,
            commodityId: commodity.id,
            quality,
            quantityBags: 50 + j,
            weightKg: weightKg || undefined,
            price,
          };
          ctx.method = 'POST';
          ctx.endpoint = '/api/v1/listings';
          ctx.request = body;
          const res = await api.post('/api/v1/listings', { token: seller.token, body });
          ctx.statusCode = res.status;
          ctx.actual = res.json;
          assert.equal(res.status, 201, JSON.stringify(res.json));
          const listing = res.json.data;
          assert.equal(listing.itemName, commodity.name, 'itemName must be server-derived from commodity.name');
          assert.equal(listing.status, hasPrice ? 'active' : 'na', 'SELL with no price must be status "na"');
          assert.equal(listing.userId, seller.id);
          seller.listingIds.push(listing.id);
        }
      );
    }
  }

  // --- A. Positive: buyers create BUY requirements ------------------------------
  buyers.forEach((buyer, bIdx) => {
    buyer.plannedBuyCount = 2 + (bIdx % 3); // 2..4
    buyer._commodityPlan = pick(registry.commodities, bIdx, buyer.plannedBuyCount);
  });

  for (const buyer of buyers) {
    for (let j = 0; j < buyer._commodityPlan.length; j++) {
      const commodity = buyer._commodityPlan[j];
      const hasPrice = j % 2 === 0;
      const price = hasPrice ? 900 + j * 23 : undefined;

      await h.test(
        `CREATE-BUY-${buyer.phone}-${j}`,
        `Buyer ${buyer.phone} creates BUY requirement (${commodity.name}, price=${hasPrice ? price : 'none'})`,
        async (ctx) => {
          const body = {
            side: 'BUY',
            categoryId: commodity.categoryId,
            commodityId: commodity.id,
            quantityBags: 20 + j,
            price,
            // Attacker-ish extra fields that should be silently stripped for BUY:
            quality: 'bold',
            weightKg: 30,
            photoUrls: ['https://example.com/x.jpg'],
          };
          ctx.method = 'POST';
          ctx.endpoint = '/api/v1/listings';
          ctx.request = body;
          const res = await api.post('/api/v1/listings', { token: buyer.token, body });
          ctx.statusCode = res.status;
          ctx.actual = res.json;
          assert.equal(res.status, 201, JSON.stringify(res.json));
          const listing = res.json.data;
          assert.equal(listing.status, 'active', 'BUY must be active regardless of price presence');
          assert.equal(listing.quality, null, 'quality must be ignored/stripped on BUY create');
          assert.equal(listing.weightKg, null, 'weightKg must be ignored/stripped on BUY create');
          buyer.listingIds.push(listing.id);
        }
      );
    }
  }

  // --- Field-stripping on SELL: client cannot set userId/status/availabilityBags/itemName
  await h.test('CREATE-STRIP-01', 'Client-supplied userId/status/availabilityBags/itemName are ignored on create', async (ctx) => {
    const seller = sellers[0];
    const commodity = registry.commodities[registry.commodities.length - 1];
    const body = {
      side: 'SELL',
      categoryId: commodity.categoryId,
      commodityId: commodity.id,
      quality: 'medium',
      quantityBags: 10,
      weightKg: 50,
      price: 1234,
      userId: 'not-a-real-user-id',
      status: 'traded',
      availabilityBags: 99999,
      itemName: 'HACKED NAME',
    };
    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/listings';
    ctx.request = body;
    const res = await api.post('/api/v1/listings', { token: seller.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const listing = res.json.data;
    assert.equal(listing.userId, seller.id, 'userId must stay the authenticated caller, not the client-supplied value');
    assert.equal(listing.status, 'active', 'status must be server-computed, not the client-supplied value');
    assert.equal(listing.availabilityBags, 10, 'availabilityBags must mirror quantityBags, not the client-supplied value');
    assert.equal(listing.itemName, commodity.name, 'itemName must be derived from commodity, not client-supplied');
    seller.listingIds.push(listing.id);
  });

  // --- Negative cases -------------------------------------------------------
  const seller0 = sellers[0];
  const validCommodity = registry.commodities[0];
  const otherCategory = registry.categories.find((c) => c.id !== validCommodity.categoryId);
  const mismatchedCommodity = registry.commodities.find((c) => c.categoryId === otherCategory.id);

  const negativeCases = [
    {
      id: 'CREATE-NEG-missing-categoryId',
      desc: 'Missing categoryId -> 400',
      body: { side: 'SELL', commodityId: validCommodity.id, quantityBags: 5 },
      token: seller0.token,
    },
    {
      id: 'CREATE-NEG-missing-commodityId',
      desc: 'Missing commodityId -> 400',
      body: { side: 'SELL', categoryId: validCommodity.categoryId, quantityBags: 5 },
      token: seller0.token,
    },
    {
      id: 'CREATE-NEG-missing-quantityBags',
      desc: 'Missing quantityBags -> 400',
      body: { side: 'SELL', categoryId: validCommodity.categoryId, commodityId: validCommodity.id },
      token: seller0.token,
    },
    {
      id: 'CREATE-NEG-price-zero',
      desc: 'price <= 0 -> 400',
      body: { side: 'SELL', categoryId: validCommodity.categoryId, commodityId: validCommodity.id, quantityBags: 5, price: 0 },
      token: seller0.token,
    },
    {
      id: 'CREATE-NEG-price-string',
      desc: 'price as a non-numeric string -> 400',
      body: { side: 'SELL', categoryId: validCommodity.categoryId, commodityId: validCommodity.id, quantityBags: 5, price: 'abc' },
      token: seller0.token,
    },
    {
      id: 'CREATE-NEG-nonexistent-commodity',
      desc: 'Nonexistent commodityId -> 404',
      body: { side: 'SELL', categoryId: validCommodity.categoryId, commodityId: crypto.randomUUID(), quantityBags: 5 },
      token: seller0.token,
      expectStatus: 404,
    },
    {
      id: 'CREATE-NEG-category-commodity-mismatch',
      desc: 'commodityId belongs to a different category -> 400',
      body: { side: 'SELL', categoryId: validCommodity.categoryId, commodityId: mismatchedCommodity.id, quantityBags: 5 },
      token: seller0.token,
    },
    {
      id: 'CREATE-NEG-side-missing',
      desc: 'side missing -> 400',
      body: { categoryId: validCommodity.categoryId, commodityId: validCommodity.id, quantityBags: 5 },
      token: seller0.token,
    },
    {
      id: 'CREATE-NEG-side-invalid',
      desc: 'side invalid value -> 400',
      body: { side: 'RENT', categoryId: validCommodity.categoryId, commodityId: validCommodity.id, quantityBags: 5 },
      token: seller0.token,
    },
    {
      id: 'CREATE-NEG-no-token',
      desc: 'No auth token -> 401',
      body: { side: 'SELL', categoryId: validCommodity.categoryId, commodityId: validCommodity.id, quantityBags: 5 },
      token: undefined,
      expectStatus: 401,
    },
    {
      id: 'CREATE-NEG-invalid-token',
      desc: 'Garbage auth token -> 401',
      body: { side: 'SELL', categoryId: validCommodity.categoryId, commodityId: validCommodity.id, quantityBags: 5 },
      token: 'this.is.not.a.valid.jwt',
      expectStatus: 401,
    },
  ];

  for (const nc of negativeCases) {
    await h.test(nc.id, nc.desc, async (ctx) => {
      ctx.method = 'POST';
      ctx.endpoint = '/api/v1/listings';
      ctx.request = nc.body;
      const res = await api.post('/api/v1/listings', { token: nc.token, body: nc.body });
      ctx.statusCode = res.status;
      ctx.actual = res.json;
      const expected = nc.expectStatus || 400;
      ctx.expected = expected;
      assert.equal(res.status, expected, `expected ${expected}, got ${res.status}: ${JSON.stringify(res.json)}`);
      assert.notEqual(res.status, 500, 'must never surface as an unhandled 500');
    });
  }

  // --- Duplicate SELL (unique userId+categoryId+commodityId+weightKg+quality) -> 409
  await h.test('CREATE-NEG-duplicate-sell', 'Duplicate SELL (same user/category/commodity/weight/quality) -> 409', async (ctx) => {
    const body = {
      side: 'SELL',
      categoryId: seller0._commodityPlan[0].categoryId,
      commodityId: seller0._commodityPlan[0].id,
      quality: QUALITY_GRADES[0],
      quantityBags: 10,
      weightKg: 30,
      price: 1000,
    };
    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/listings';
    ctx.request = body;
    const first = await api.post('/api/v1/listings', { token: seller0.token, body });
    assert.equal(first.status, 201, JSON.stringify(first.json));
    seller0.listingIds.push(first.json.data.id);

    const second = await api.post('/api/v1/listings', { token: seller0.token, body });
    ctx.statusCode = second.status;
    ctx.actual = second.json;
    assert.equal(second.status, 409, JSON.stringify(second.json));
  });
}

module.exports = { run };
