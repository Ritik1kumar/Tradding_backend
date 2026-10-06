const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const qa = require('../lib/qaData');
const bootstrap = require('./01_bootstrap');

async function run(h, api, registry) {
  h.section('AuthEdges');

  await h.test('AUTH-NO-TOKEN', 'No Authorization header -> 401', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = '/api/v1/listings?side=SELL';
    const res = await api.get(ctx.endpoint);
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 401, JSON.stringify(res.json));
  });

  await h.test('AUTH-GARBAGE-TOKEN', 'Garbage/malformed token -> 401', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = '/api/v1/listings?side=SELL';
    const res = await api.get(ctx.endpoint, { token: 'not-a-jwt-at-all' });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 401, JSON.stringify(res.json));
  });

  await h.test('AUTH-SUSPENDED-USER-BLOCKED', 'Suspended user is blocked immediately, even with a previously-valid token', async (ctx) => {
    const phone = qa.throwawayPhone(1);
    const inv = await api.post('/api/v1/invites', { token: registry.admin.token, body: { phone, roleHint: 'seller' } });
    assert.equal(inv.status, 201, JSON.stringify(inv.json));
    const loginRes = await bootstrap.loginAndVerify(api, phone);
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.json));
    const token = loginRes.json.data.accessToken;
    const userId = loginRes.json.data.user.id;
    await bootstrap.ensureTosAccepted(api, token);

    const before = await api.get('/api/v1/listings?side=SELL', { token });
    assert.equal(before.status, 200, 'sanity: token works while account is active');

    await prisma.appUser.update({ where: { id: userId }, data: { status: 'suspended' } });

    ctx.method = 'GET';
    ctx.endpoint = '/api/v1/listings?side=SELL';
    const res = await api.get(ctx.endpoint, { token });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 401, JSON.stringify(res.json));
  });

  await h.test('AUTH-BUYER-CAN-CREATE-SELL', 'A buyer-role account CAN create a SELL listing (no role gate — by design, see CLAUDE.md §3)', async (ctx) => {
    const buyer = registry.users.find((u) => u.role === 'buyer');
    const commodity = registry.commodities[0];
    const body = { side: 'SELL', categoryId: commodity.categoryId, commodityId: commodity.id, quantityBags: 5, weightKg: 999, quality: 'stream', price: 123 };
    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/listings';
    ctx.request = body;
    const res = await api.post('/api/v1/listings', { token: buyer.token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    // Documenting actual behavior, not asserting a "correct" one either way:
    // one account can hold both capabilities per the product design.
    assert.equal(res.status, 201, JSON.stringify(res.json));
    buyer.listingIds.push(res.json.data.id);
  });
}

module.exports = { run };
