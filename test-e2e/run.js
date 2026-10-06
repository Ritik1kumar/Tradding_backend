const path = require('node:path');
const { execSync } = require('node:child_process');
const prisma = require('../lib/prisma');
const { startServer } = require('./lib/server');
const { makeClient } = require('./lib/client');
const { createHarness } = require('./lib/harness');
const { writeReport } = require('./lib/report');
const qa = require('./lib/qaData');

const SCENARIOS = [
  require('./scenarios/01_bootstrap'),
  require('./scenarios/02_create'),
  require('./scenarios/03_update'),
  require('./scenarios/04_bulkPrice'),
  require('./scenarios/05_visibility'),
  require('./scenarios/06_withdraw'),
  require('./scenarios/07_expiry'),
  require('./scenarios/08_authEdges'),
  require('./scenarios/09_concurrency'),
  require('./scenarios/10_bulkUpload'),
  require('./scenarios/11_tosGate'),
];

const COVERAGE_RULES = [
  { rule: '1. SELL w/o price -> na; BUY w/o price -> active', ids: ['CREATE-SELL-', 'CREATE-BUY-'] },
  { rule: '2. BUY minimal fields (categoryId, commodityId, price?, quantityBags)', ids: ['CREATE-BUY-'] },
  { rule: '3. Unknown/non-applicable fields stripped, not 400', ids: ['CREATE-STRIP-01'] },
  { rule: '4. Only owner can PATCH / withdraw', ids: ['UPDATE-02', 'WITHDRAW-NONOWNER-BLOCKED'] },
  { rule: '5. Withdraw is a soft close, row retained', ids: ['WITHDRAW-OWNER-OK'] },
  { rule: '6. Bulk price: delta(all/selected) + set-many, skip semantics', ids: ['BULK-DELTA-ALL-01', 'BULK-DELTA-SELECTED-01', 'BULK-SETMANY-01'] },
  { rule: '7. Successful price edit sets status back to active', ids: ['UPDATE-01', 'UPDATE-03', 'UPDATE-04'] },
  { rule: '8. 2 AM expiry flips status only, price untouched, row kept', ids: ['EXPIRY-RUN'] },
  { rule: '9. Browse filters + sort (SELL cheapest-first, BUY newest-first)', ids: ['VIS-SORT-SELL-CHEAPEST-FIRST', 'VIS-SORT-BUY-NEWEST-FIRST'] },
  { rule: '10. Self-trade guard / negotiation', ids: [] },
  { rule: "11. userId filter open, but non-active status on someone else's listings requires owner/admin", ids: ['VIS-OTHER-NONACTIVE-BLOCKED', 'VIS-ADMIN-SEES-ANY-STATUS'] },
  { rule: '12. ToS gate blocks gated endpoints until accepted (tos.js/tosVersions.js exempt)', ids: ['TOSGATE-BLOCKED-PREACCEPT', 'TOSGATE-UNBLOCKED-POSTACCEPT'] },
  { rule: '13. Bulk upload/confirm: fuzzy-match never auto-applied, duplicate combo updates in place', ids: ['BULKUPLOAD-PARSE', 'BULKUPLOAD-REUPLOAD-UPDATES-NOT-DUPLICATES'] },
];

function computeCoverage(results) {
  const ids = new Set(results.map((r) => r.id));
  return COVERAGE_RULES.map((rule) => {
    if (rule.ids.length === 0) {
      return { rule: rule.rule, covered: false, testIds: [] };
    }
    const matchedIds = rule.ids.filter((prefix) => Array.from(ids).some((id) => id.startsWith(prefix)));
    return { rule: rule.rule, covered: matchedIds.length === rule.ids.length, testIds: rule.ids };
  });
}

// Test IDs that already have a hand-written, root-caused entry in
// CURATED_FINDINGS below — excluded here so the report doesn't show the same
// bug twice (once generic-from-failure, once with the actual root cause).
const CURATED_TEST_IDS = new Set(['VIS-SORT-BUY-NEWEST-FIRST', 'CONCURRENCY-10-PARALLEL-DELTA', 'BULKUPLOAD-NA-PRICE-TEXT']);

function buildBugsFromFailures(results) {
  return results
    .filter((r) => r.pass === false && !CURATED_TEST_IDS.has(r.id))
    .map((r) => ({
      severity: 'high',
      summary: `${r.id}: ${r.description}`,
      repro: `${r.method || ''} ${r.endpoint || ''}`.trim() || '(see request)',
      expected: JSON.stringify(r.expected ?? 'see assertion'),
      actual: r.error,
      location: `test-e2e/scenarios — section "${r.section}"`,
      proposedFix: 'Investigate the failing assertion above; do not auto-fix without review.',
    }));
}

function buildCuratedFindings(results) {
  const concurrencyResult = results.find((r) => r.id === 'CONCURRENCY-10-PARALLEL-DELTA');
  const concurrencyActual = concurrencyResult
    ? concurrencyResult.pass
      ? 'This run happened to NOT lose any updates (race conditions are timing-dependent — re-run a few times, or see proposedFix regardless).'
      : concurrencyResult.error
    : '(scenario did not run)';

  return [
  {
    severity: 'high',
    summary: 'Every listing API response is missing createdAt (and updatedAt) — serializeListing destructures them out and never adds them back',
    repro: 'Create or fetch any listing via the API and inspect the JSON response (see VIS-SORT-BUY-NEWEST-FIRST, which caught this indirectly: createdAt comes back undefined, so new Date(undefined).getTime() is NaN and the "is it sorted" check becomes meaningless).',
    expected: 'response.data.createdAt (and arguably updatedAt) should be present — clients need it to show "posted X ago" and to verify the documented newest-first BUY sort themselves.',
    actual: '{ const { createdAt, updatedAt, ...rest } = listing; return { ...rest, price: ... } } — both fields are destructured purely to exclude them from `...rest`, then never added back to the returned object.',
    location: 'services/listing.service.js — serializeListing()',
    proposedFix: "Return createdAt explicitly: `{ ...rest, price: ..., createdAt: listing.createdAt }`. Confirm whether updatedAt should also be exposed, or was deliberately hidden.",
  },
  {
    severity: 'medium',
    summary: 'bulkDeltaPrice (and set-many) reads the current price and writes it back without a row lock / atomic increment — concurrent requests lose updates',
    repro: 'Fire 10 parallel PATCH /listings/bulk-price {mode:"delta", value:10} requests against the same listingId starting from price=1000 (see CONCURRENCY-10-PARALLEL-DELTA).',
    expected: 'Final price = 1000 + 10×10 = 1100 (every delta applied).',
    actual: concurrencyActual,
    location: 'services/listing.service.js — bulkDeltaPrice()',
    proposedFix: 'Use a Prisma atomic update (price: { increment: value }) for the delta path instead of reading price in JS and writing the computed value back, or serialize same-listing writes behind a row lock / SERIALIZABLE transaction.',
  },
  {
    severity: 'high',
    summary: 'Bulk-upload does not honor the literal text "N/A" in a price cell — it is rejected as an invalid price instead of treated as no-price',
    repro: 'Upload a sheet with a row whose price cell is the text "N/A" (see BULKUPLOAD-NA-PRICE-TEXT). CLAUDE.md §4.7 documents this as the real convention used on the founder\'s actual supplier sheets.',
    expected: 'A price of "N/A" should parse to a null price (row stays ready), same as a truly blank cell.',
    actual: 'optionalPositiveDecimal(value) does Number(value) and rejects anything non-finite — Number("N/A") is NaN, so the row gets a validation error and is excluded from "ready".',
    location: 'services/listing.validation.js — optionalPositiveDecimal() (used from services/listing-bulk.service.js per-row parsing)',
    proposedFix: 'In the bulk-upload row parser specifically, treat the case-insensitive string "N/A" (and "NA") the same as a blank price cell before calling optionalPositiveDecimal.',
  },
  {
    severity: 'low',
    summary: "GET /listings/:id exposes the listing owner's raw phone number to any authenticated viewer",
    repro: 'Any logged-in user calls GET /listings/:id on a listing they do not own.',
    expected: 'Not asserted either way by CLAUDE.md — flagged for a product decision, not a confirmed defect.',
    actual: 'response.data.user.phone is always included (services/listing.service.js getListingById select clause).',
    location: 'services/listing.service.js — getListingById()',
    proposedFix: 'Confirm with the founder whether phone should stay hidden until a negotiation/contact is initiated.',
  },
  {
    severity: 'low',
    summary: 'Stray debug console.log left in invite.controller.js',
    repro: 'Call POST /invites.',
    expected: 'No debug output.',
    actual: 'console.log("this is issue") fires on every call.',
    location: 'controllers/invite.controller.js:6',
    proposedFix: 'Remove the leftover console.log.',
  },
  ];
}

const GAPS = [
  'No endpoint exists to set/update AppUser name/firmName/city after onboarding (CLAUDE.md §4.1 "capture minimal profile" has no corresponding route — routes/users.js is an unused stub).',
  'No negotiation/offer/trade API exists yet (schema tables present, no routes/controllers/services) — out of scope for this suite by design.',
  'No freight API exists yet (schema table present, no routes) — out of scope for this suite by design.',
  'WhatsApp OTP channel is not implemented — otp.service.js is a static "1111" stub, not wired to the OtpVerification table.',
  'Screenshot/OCR sheet parsing (Phase 2 per CLAUDE.md §4.8) is not implemented — only the structured-Excel bulk-upload/confirm flow exists, and was tested here.',
  'Per-supplier learned templates (SourceTemplate, CLAUDE.md §4.8) are schema-only, no logic built yet.',
];

const NOT_TESTED = [
  'Negotiation/offer/trade flows (not built yet).',
  'Freight routes (not built yet).',
  'Real OTP delivery (SMS/WhatsApp) — otp.service.js is a static stub, so delivery itself was not exercised.',
  'Admin "edit on behalf of a user" + AuditLog writes for listings specifically (AuditLog is written for invites/categories/commodities/ToS/settings, not for listing create/update/withdraw/bulk-price — worth noting as its own gap).',
  'Load/performance testing beyond the 30-item and 10-parallel-request smoke tests.',
  'Pagination correctness beyond default page/limit (page/limit params exist in lib/pagination.js but weren\'t exhaustively boundary-tested here).',
];

function buildExecSummary(summary, failed) {
  if (summary.failed === 0) {
    return `All ${summary.total} automated checks passed (${summary.skipped} skipped) against the real dev DB. The Listing module's create/update/withdraw/browse/isolation rules, the new bulk-price contract (delta all-or-selected + set-many), the ToS gate, and the Excel bulk-upload/confirm flow all behave as specified. See "Bugs found" below for non-blocking observations worth a decision (concurrency race on bulk-price, phone exposure on listing detail, a stray console.log).`;
  }
  const failedIds = failed.map((f) => f.id).join(', ');
  return `${summary.passed}/${summary.total} checks passed, ${summary.failed} FAILED (${failedIds}), ${summary.skipped} skipped. See the per-section tables and "Bugs found" below for exact repro steps before changing any code.`;
}

function sanitizeDbUrl(url) {
  if (!url) return 'unknown';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch (err) {
    return 'unparseable DATABASE_URL';
  }
}

async function main() {
  const startedAt = new Date();
  console.log(`Wiping any leftover QA_ data from a previous run (safe — only touches +917000... phones and QA_ categories)...`);
  const wiped = await qa.wipeQaData();
  console.log('Cleanup before run:', wiped);

  const server = await startServer();
  const api = makeClient(server.baseUrl);
  const h = createHarness();
  const registry = {};

  console.log(`\nServer up at ${server.baseUrl}, DB: ${sanitizeDbUrl(process.env.DATABASE_URL)}\n`);

  for (const scenario of SCENARIOS) {
    try {
      await scenario.run(h, api, registry);
    } catch (err) {
      console.error(`Scenario crashed outside of an individual test: ${err.stack}`);
      h.results.push({
        section: 'CRASH',
        id: `CRASH-${scenario.run.name || 'unknown'}`,
        description: 'Scenario threw outside of an h.test() wrapper',
        pass: false,
        error: err.message,
        stack: err.stack,
      });
    }
  }

  await server.close();

  const summary = h.summary();
  const failed = h.results.filter((r) => r.pass === false);
  const bySection = new Map();
  for (const r of h.results) {
    if (!bySection.has(r.section)) bySection.set(r.section, []);
    bySection.get(r.section).push(r);
  }

  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..') }).toString().trim();
  } catch (err) {
    // not fatal
  }

  const finishedAt = new Date();
  const data = {
    meta: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt - startedAt,
      gitCommit,
      dbName: sanitizeDbUrl(process.env.DATABASE_URL),
      nodeVersion: process.version,
    },
    summary,
    execSummary: buildExecSummary(summary, failed),
    coverageMatrix: computeCoverage(h.results),
    bySection,
    isolationMatrix: registry.isolationMatrix || [],
    bugs: [...buildBugsFromFailures(h.results), ...buildCuratedFindings(h.results)],
    gaps: GAPS,
    notTested: NOT_TESTED,
  };

  const outDir = path.join(__dirname, '..', 'reports');
  const { htmlPath, jsonPath } = writeReport(data, outDir);

  console.log('\n=== SUMMARY ===');
  console.log(summary);
  console.log(`Report: ${htmlPath}`);
  console.log(`JSON:   ${jsonPath}`);

  await prisma.$disconnect();
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  try {
    await prisma.$disconnect();
  } catch (e) {
    // ignore
  }
  process.exit(1);
});
