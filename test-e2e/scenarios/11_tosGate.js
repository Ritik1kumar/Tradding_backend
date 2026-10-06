const assert = require('node:assert/strict');
const qa = require('../lib/qaData');
const bootstrap = require('./01_bootstrap');

async function run(h, api, registry) {
  h.section('TosGate');

  const currentRes = await api.get('/api/v1/tos-versions/current', { token: registry.admin.token });
  if (currentRes.status !== 200) {
    h.skip('TOSGATE-ALL', 'ToS gate end-to-end check', 'no TosVersion published in this DB — gate is a documented no-op, nothing to verify');
    return;
  }
  const currentVersion = currentRes.json.data.version;

  const phone = qa.throwawayPhone(2);
  const inv = await api.post('/api/v1/invites', { token: registry.admin.token, body: { phone, roleHint: 'seller' } });
  if (inv.status !== 201) throw new Error(`invite failed: ${JSON.stringify(inv.json)}`);
  const loginRes = await bootstrap.loginAndVerify(api, phone);
  if (loginRes.status !== 200) throw new Error(`login failed: ${JSON.stringify(loginRes.json)}`);
  const token = loginRes.json.data.accessToken;

  await h.test('TOSGATE-STATUS-ACCESSIBLE-PREACCEPT', 'GET /tos/status works even before accepting (no chicken-and-egg lock)', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = '/api/v1/tos/status';
    const res = await api.get(ctx.endpoint, { token });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.data.needsAcceptance, true);
  });

  await h.test('TOSGATE-BLOCKED-PREACCEPT', 'A gated endpoint (GET /commodity-categories) is blocked with 403 before ToS acceptance', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = '/api/v1/commodity-categories';
    const res = await api.get(ctx.endpoint, { token });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 403, JSON.stringify(res.json));
    assert.equal(res.json.error?.code, 'TOS_ACCEPTANCE_REQUIRED');
  });

  await h.test('TOSGATE-ACCEPT', 'Accepting the current ToS version succeeds', async (ctx) => {
    const body = { version: currentVersion };
    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/tos/accept';
    ctx.request = body;
    const res = await api.post(ctx.endpoint, { token, body });
    ctx.statusCode = res.status;
    ctx.actual = res.json;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.data.needsAcceptance, false);
  });

  await h.test('TOSGATE-UNBLOCKED-POSTACCEPT', 'The same gated endpoint now succeeds after accepting', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = '/api/v1/commodity-categories';
    const res = await api.get(ctx.endpoint, { token });
    ctx.statusCode = res.status;
    ctx.actual = { count: res.json?.data?.length };
    assert.equal(res.status, 200, JSON.stringify(res.json));
  });

  await h.test('TOSGATE-INVITES-NOT-GATED', '/invites stays reachable for admin regardless of ToS gate (admin panel surface, deliberately excluded)', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = '/api/v1/invites';
    const res = await api.get(ctx.endpoint, { token: registry.admin.token });
    ctx.statusCode = res.status;
    ctx.actual = { count: res.json?.data?.length };
    assert.equal(res.status, 200, JSON.stringify(res.json));
  });
}

module.exports = { run };
