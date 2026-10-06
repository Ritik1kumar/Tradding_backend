const assert = require('node:assert/strict');

async function run(h, api, registry) {
  h.section('Visibility');

  const sellers = registry.users.filter((u) => u.role === 'seller');
  const buyers = registry.users.filter((u) => u.role === 'buyer');
  const sellerA = sellers[0];
  const buyerA = buyers[0];
  const admin = registry.admin;

  await h.test('VIS-BROWSE-SELL-DEFAULT', 'Browse side=SELL returns only active listings by default', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = `/api/v1/listings?side=SELL&userId=${sellerA.id}`;
    const res = await api.get(ctx.endpoint, { token: buyerA.token });
    ctx.statusCode = res.status;
    ctx.actual = { count: res.json?.data?.length };
    assert.equal(res.status, 200, JSON.stringify(res.json));
    for (const row of res.json.data) {
      assert.equal(row.status, 'active', `row ${row.id} must be active, got ${row.status}`);
    }
  });

  await h.test('VIS-BROWSE-BUY-DEFAULT', 'Browse side=BUY returns only active requirements by default', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = '/api/v1/listings?side=BUY';
    const res = await api.get(ctx.endpoint, { token: sellerA.token });
    ctx.statusCode = res.status;
    ctx.actual = { count: res.json?.data?.length };
    assert.equal(res.status, 200, JSON.stringify(res.json));
    for (const row of res.json.data) {
      assert.equal(row.status, 'active');
    }
  });

  await h.test('VIS-OWN-ANY-STATUS', 'A user can see their OWN listings in any status (not just active)', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = `/api/v1/listings?side=SELL&userId=${sellerA.id}&status=active,na,price_expired,withdrawn,traded`;
    const res = await api.get(ctx.endpoint, { token: sellerA.token });
    ctx.statusCode = res.status;
    ctx.actual = { count: res.json?.data?.length };
    assert.equal(res.status, 200, JSON.stringify(res.json));
  });

  await h.test('VIS-OTHER-ACTIVE-OK', 'Browsing another user\'s listings with status=active (or default) is allowed', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = `/api/v1/listings?side=SELL&userId=${sellerA.id}&status=active`;
    const res = await api.get(ctx.endpoint, { token: buyerA.token });
    ctx.statusCode = res.status;
    ctx.actual = { count: res.json?.data?.length };
    assert.equal(res.status, 200, JSON.stringify(res.json));
  });

  await h.test('VIS-OTHER-NONACTIVE-BLOCKED', "Non-owner, non-admin requesting another user's non-active status -> 403", async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = `/api/v1/listings?side=SELL&userId=${sellerA.id}&status=withdrawn`;
    const res = await api.get(ctx.endpoint, { token: buyerA.token });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 403, JSON.stringify(res.json));
  });

  await h.test('VIS-ADMIN-SEES-ANY-STATUS', "Admin CAN request another user's non-active status (oversight)", async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = `/api/v1/listings?side=SELL&userId=${sellerA.id}&status=withdrawn,traded`;
    const res = await api.get(ctx.endpoint, { token: admin.token });
    ctx.statusCode = res.status;
    ctx.actual = { count: res.json?.data?.length };
    assert.equal(res.status, 200, JSON.stringify(res.json));
  });

  await h.test('VIS-SORT-SELL-CHEAPEST-FIRST', 'SELL browse within a category is sorted cheapest-first', async (ctx) => {
    const category = registry.categories[0];
    ctx.method = 'GET';
    ctx.endpoint = `/api/v1/listings?side=SELL&categoryId=${category.id}&limit=100`;
    const res = await api.get(ctx.endpoint, { token: buyerA.token });
    ctx.statusCode = res.status;
    const prices = res.json.data.map((r) => Number(r.price));
    ctx.actual = { prices };
    assert.equal(res.status, 200, JSON.stringify(res.json));
    for (let i = 1; i < prices.length; i++) {
      assert.ok(prices[i] >= prices[i - 1], `prices not sorted ascending at index ${i}: ${prices}`);
    }
  });

  await h.test('VIS-SORT-BUY-NEWEST-FIRST', 'BUY browse within a category is sorted newest-first', async (ctx) => {
    const category = registry.categories[0];
    ctx.method = 'GET';
    ctx.endpoint = `/api/v1/listings?side=BUY&categoryId=${category.id}&limit=100`;
    const res = await api.get(ctx.endpoint, { token: sellerA.token });
    ctx.statusCode = res.status;
    const timestamps = res.json.data.map((r) => new Date(r.createdAt).getTime());
    ctx.actual = { timestamps };
    assert.equal(res.status, 200, JSON.stringify(res.json));
    for (let i = 1; i < timestamps.length; i++) {
      assert.ok(timestamps[i] <= timestamps[i - 1], `createdAt not sorted descending at index ${i}`);
    }
  });

  await h.test('VIS-NO-FIELD-LEAK', "GET /listings/:id exposes only the documented subset of the owner's profile", async (ctx) => {
    const listingId = sellerA.listingIds[0];
    ctx.method = 'GET';
    ctx.endpoint = `/api/v1/listings/${listingId}`;
    const res = await api.get(ctx.endpoint, { token: buyerA.token });
    ctx.statusCode = res.status;
    ctx.actual = res.json?.data?.user;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const keys = Object.keys(res.json.data.user).sort();
    assert.deepEqual(keys, ['city', 'firmName', 'id', 'name', 'phone'].sort());
  });

  // --- 25-user isolation matrix ---
  registry.isolationMatrix = [];
  const allUsers = registry.users;
  for (let i = 0; i < allUsers.length; i++) {
    const user = allUsers[i];
    const prober = allUsers[(i + 1) % allUsers.length]; // a different user probing for leaks

    let seenInMyListings = 0;
    await h.test(`ISO-SELF-${user.phone}`, `${user.phone} ("my listings") sees exactly their own listings`, async (ctx) => {
      const side = user.role === 'seller' ? 'SELL' : 'BUY';
      ctx.method = 'GET';
      ctx.endpoint = `/api/v1/listings?side=${side}&userId=${user.id}&status=active,na,price_expired,withdrawn,traded&limit=100`;
      const res = await api.get(ctx.endpoint, { token: user.token });
      ctx.statusCode = res.status;
      ctx.actual = { count: res.json?.data?.length };
      assert.equal(res.status, 200, JSON.stringify(res.json));
      seenInMyListings = res.json.data.length;
      assert.equal(seenInMyListings, user.listingIds.length, "count must match what this user actually created");
      for (const row of res.json.data) {
        assert.equal(row.userId, user.id, `leak: listing ${row.id} belongs to another user`);
      }
    });

    let leaks = 0;
    await h.test(`ISO-PROBE-${user.phone}`, `Another user (${prober.phone}) cannot read ${user.phone}'s non-active listings`, async (ctx) => {
      const side = user.role === 'seller' ? 'SELL' : 'BUY';
      ctx.method = 'GET';
      ctx.endpoint = `/api/v1/listings?side=${side}&userId=${user.id}&status=withdrawn,traded,price_expired&limit=100`;
      const res = await api.get(ctx.endpoint, { token: prober.token });
      ctx.statusCode = res.status;
      ctx.actual = res.json;
      if (res.status === 200 && res.json.data.length > 0) {
        leaks = res.json.data.length;
      }
      assert.equal(res.status, 403, `expected 403, a 200 here would be a visibility leak: ${JSON.stringify(res.json)}`);
    });

    registry.isolationMatrix.push({
      phone: user.phone,
      role: user.role,
      created: user.listingIds.length,
      seenInMyListings,
      leaks,
    });
  }
}

module.exports = { run };
