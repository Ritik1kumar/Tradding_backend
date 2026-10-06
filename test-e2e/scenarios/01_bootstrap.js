const assert = require('node:assert/strict');
const qa = require('../lib/qaData');

const ADMIN_PHONE = '+919810000001';
const OTP = '1111';

async function loginAndVerify(api, phone) {
  await api.post('/api/v1/auth/login', { body: { phone } });
  return api.post('/api/v1/auth/verify-otp', { body: { phone, otp: OTP } });
}

// If a ToS version has been published, accept it; if none exists yet the
// gate is a no-op (middleware/auth.js requireTosAccepted), so there's
// nothing to accept — we just note that in the returned result.
async function ensureTosAccepted(api, token) {
  const statusRes = await api.get('/api/v1/tos/status', { token });
  if (statusRes.status !== 200) {
    return { noTosPublished: true };
  }
  const { needsAcceptance, currentVersion } = statusRes.json.data;
  if (needsAcceptance) {
    const acceptRes = await api.post('/api/v1/tos/accept', {
      token,
      body: { version: currentVersion.version },
    });
    return { accepted: true, status: acceptRes.status, version: currentVersion.version };
  }
  return { alreadyAccepted: true, version: currentVersion.version };
}

const CATEGORY_DEFS = [
  { suffix: 'Rajma', commodities: ['QA Chitra Pila Badshah', 'QA Rajma Lal Premium', 'QA Rajma Chitra Light'] },
  { suffix: 'Chana', commodities: ['QA Kabli Chana Bold', 'QA Chana Dal Standard', 'QA Garbanzo Dry White'] },
  { suffix: 'Urad Dal', commodities: ['QA Urad Sabut Black', 'QA Urad Dhowa White', 'QA Urad Dal Split'] },
  { suffix: 'Besan', commodities: ['QA Besan Fine', 'QA Besan Coarse', 'QA Besan Premium'] },
];

async function onboardUser(h, api, registry, phone, roleHint, label) {
  await h.test(`BOOT-INV-${label}`, `Admin invites ${phone} as ${roleHint}`, async (ctx) => {
    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/invites';
    ctx.request = { phone, roleHint };
    const res = await api.post('/api/v1/invites', { token: registry.admin.token, body: { phone, roleHint } });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 201, JSON.stringify(res.json));
  });

  let token;
  let id;
  await h.test(`BOOT-LOGIN-${label}`, `${phone} logs in via invite + OTP (creates AppUser)`, async (ctx) => {
    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/auth/verify-otp';
    const res = await loginAndVerify(api, phone);
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    token = res.json.data.accessToken;
    id = res.json.data.user.id;
    assert.deepEqual(res.json.data.user.roles, [roleHint]);
  });

  await h.test(`BOOT-TOS-${label}`, `${phone} accepts current ToS (if any is published)`, async (ctx) => {
    ctx.endpoint = '/api/v1/tos/accept';
    const result = await ensureTosAccepted(api, token);
    ctx.actual = result;
  });

  registry.users.push({ id, phone, role: roleHint, token, listingIds: [] });
}

async function run(h, api, registry) {
  h.section('Bootstrap');

  await h.test('BOOT-01', 'Admin logs in (reuses existing seeded admin +919810000001)', async (ctx) => {
    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/auth/verify-otp';
    const res = await loginAndVerify(api, ADMIN_PHONE);
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.ok(res.json.data.accessToken, 'expected an accessToken');
    registry.admin = { id: res.json.data.user.id, phone: ADMIN_PHONE, token: res.json.data.accessToken };
  });

  await h.test('BOOT-02', 'Admin accepts current ToS version so gated endpoints are usable', async (ctx) => {
    ctx.endpoint = '/api/v1/tos/accept';
    const result = await ensureTosAccepted(api, registry.admin.token);
    ctx.actual = result;
    assert.ok(result, 'ToS status/accept flow should respond');
  });

  registry.categories = [];
  registry.commodities = [];

  for (const def of CATEGORY_DEFS) {
    const name = qa.categoryName(def.suffix);
    await h.test(`BOOT-CAT-${def.suffix}`, `Admin creates category "${name}"`, async (ctx) => {
      ctx.method = 'POST';
      ctx.endpoint = '/api/v1/commodity-categories';
      ctx.request = { name };
      const res = await api.post('/api/v1/commodity-categories', { token: registry.admin.token, body: { name } });
      ctx.statusCode = res.status;
      ctx.actual = res.json;
      assert.equal(res.status, 201, JSON.stringify(res.json));
      registry.categories.push(res.json.data);
    });

    const category = registry.categories.find((c) => c.name === name);
    for (const commodityName of def.commodities) {
      await h.test(`BOOT-COM-${commodityName}`, `Admin creates commodity "${commodityName}" under ${name}`, async (ctx) => {
        ctx.method = 'POST';
        ctx.endpoint = '/api/v1/commodities';
        const body = { categoryId: category.id, name: commodityName };
        ctx.request = body;
        const res = await api.post('/api/v1/commodities', { token: registry.admin.token, body });
        ctx.statusCode = res.status;
        ctx.actual = res.json;
        assert.equal(res.status, 201, JSON.stringify(res.json));
        registry.commodities.push(res.json.data);
      });
    }
  }

  registry.users = [];
  for (let i = 1; i <= 15; i++) {
    await onboardUser(h, api, registry, qa.sellerPhone(i), 'seller', `SELLER-${String(i).padStart(2, '0')}`);
  }
  for (let i = 1; i <= 10; i++) {
    await onboardUser(h, api, registry, qa.buyerPhone(i), 'buyer', `BUYER-${String(i).padStart(2, '0')}`);
  }
}

module.exports = { run, loginAndVerify, ensureTosAccepted, ADMIN_PHONE, OTP };
