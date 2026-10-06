// Narrated, readable console walkthrough of the main story for a live demo:
// admin invites -> categories -> 3 users -> listings -> delta +50 -> set-many
// -> isolation check. Independent of run.js; uses its own small QA_ dataset
// (same +917000... marker range, so the shared cleanup script still finds it).
const prisma = require('../lib/prisma');
const { startServer } = require('./lib/server');
const { makeClient } = require('./lib/client');
const qa = require('./lib/qaData');

const ADMIN_PHONE = '+919810000001';
const OTP = '1111';

function say(line) {
  console.log(`\n${line}`);
}

async function loginAndVerify(api, phone) {
  await api.post('/api/v1/auth/login', { body: { phone } });
  return api.post('/api/v1/auth/verify-otp', { body: { phone, otp: OTP } });
}

async function ensureTos(api, token) {
  const status = await api.get('/api/v1/tos/status', { token });
  if (status.status !== 200) return;
  if (status.json.data.needsAcceptance) {
    await api.post('/api/v1/tos/accept', { token, body: { version: status.json.data.currentVersion.version } });
  }
}

async function main() {
  say('Resetting any leftover demo data...');
  await qa.wipeQaData();

  const server = await startServer();
  const api = makeClient(server.baseUrl);
  say(`Server up at ${server.baseUrl}`);

  say('1) Admin logs in...');
  const adminLogin = await loginAndVerify(api, ADMIN_PHONE);
  const adminToken = adminLogin.json.data.accessToken;
  await ensureTos(api, adminToken);
  say('   Admin ready.');

  say('2) Admin creates a category + commodity...');
  const catName = qa.categoryName('Demo Rajma');
  const catRes = await api.post('/api/v1/commodity-categories', { token: adminToken, body: { name: catName } });
  const category = catRes.json.data;
  const comRes = await api.post('/api/v1/commodities', { token: adminToken, body: { categoryId: category.id, name: 'QA Demo Chitra Badshah' } });
  const commodity = comRes.json.data;
  say(`   Category "${category.name}" + commodity "${commodity.name}" created.`);

  say('3) Admin invites 2 sellers + 1 buyer...');
  const sellerPhones = [qa.demoPhone(1), qa.demoPhone(2)];
  const buyerPhone = qa.demoPhone(3);
  for (const phone of [...sellerPhones, buyerPhone]) {
    await api.post('/api/v1/invites', { token: adminToken, body: { phone, roleHint: sellerPhones.includes(phone) ? 'seller' : 'buyer' } });
  }

  async function onboard(phone) {
    const res = await loginAndVerify(api, phone);
    const token = res.json.data.accessToken;
    await ensureTos(api, token);
    return { id: res.json.data.user.id, phone, token };
  }

  const [sellerA, sellerB] = await Promise.all(sellerPhones.map(onboard));
  const buyer = await onboard(buyerPhone);
  say(`   Onboarded sellerA=${sellerA.phone}, sellerB=${sellerB.phone}, buyer=${buyer.phone}.`);

  say('4) Sellers list their stock...');
  async function createListing(seller, weightKg, price) {
    const res = await api.post('/api/v1/listings', {
      token: seller.token,
      body: { side: 'SELL', categoryId: category.id, commodityId: commodity.id, quantityBags: 20, weightKg, quality: 'bold', price },
    });
    return res.json.data;
  }

  const listing1 = await createListing(sellerA, 30, 1000);
  const listing2 = await createListing(sellerA, 35, 1200);
  const listing3 = await createListing(sellerB, 30, 1500);
  say(`   sellerA: ₹${listing1.price} (30kg), ₹${listing2.price} (35kg)`);
  say(`   sellerB: ₹${listing3.price} (30kg)`);

  say('5) Buyer browses — sees both sellers:');
  const browse = await api.get(`/api/v1/listings?side=SELL&categoryId=${category.id}`, { token: buyer.token });
  for (const row of browse.json.data) {
    say(`   - ₹${row.price} (${row.weightKg}kg) from userId ${row.userId}`);
  }

  say('6) sellerA applies delta +50 to ALL their own listings (no listingIds needed)...');
  const deltaRes = await api.patch('/api/v1/listings/bulk-price', {
    token: sellerA.token,
    body: { mode: 'delta', value: 50 },
  });
  for (const row of deltaRes.json.data.updated) {
    say(`   -> listing ${row.id}: new price ₹${row.price}`);
  }

  say('7) sellerB sets distinct prices on demand (set-many, one API call)...');
  const setManyRes = await api.patch('/api/v1/listings/bulk-price', {
    token: sellerB.token,
    body: { mode: 'set-many', updates: [{ listingId: listing3.id, price: 1777 }] },
  });
  say(`   -> listing ${listing3.id}: before ₹1500, after ₹${setManyRes.json.data.updated[0].price}`);

  say('8) Isolation check — sellerB cannot see sellerA\'s "my listings" via someone else\'s private statuses...');
  const probe = await api.get(`/api/v1/listings?side=SELL&userId=${sellerA.id}&status=withdrawn`, { token: sellerB.token });
  say(`   sellerB probing sellerA's withdrawn listings -> HTTP ${probe.status} (expected 403)`);

  say('\nDemo complete. Run `npm run test:cleanup` whenever you want to wipe this QA_ data.');

  await server.close();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Demo failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
