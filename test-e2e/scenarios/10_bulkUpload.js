const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const prisma = require('../../lib/prisma');

// Mirrors the exact column order listing-bulk.service.js's COLUMNS defines
// (it reads cells by position, not by header text).
const HEADER = ['Category', 'Commodity', 'Quality', 'Quantity (Bags)', 'Weight (Kg)', 'Price', 'Payment Terms', 'Notes', 'Moisture', 'Color', 'Size'];

async function buildWorkbookBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Listings');
  sheet.addRow(HEADER);
  for (const r of rows) sheet.addRow(r);
  return workbook.xlsx.writeBuffer();
}

async function run(h, api, registry) {
  h.section('BulkUpload');

  const seller = registry.users.filter((u) => u.role === 'seller')[10];
  const catRajma = registry.categories.find((c) => c.name.includes('Rajma'));
  const catChana = registry.categories.find((c) => c.name.includes('Chana'));
  const realCommodity = registry.commodities.find((c) => c.categoryId === catRajma.id);
  const chanaCommodity = registry.commodities.find((c) => c.categoryId === catChana.id);

  await h.test('BULKUPLOAD-TEMPLATE-DOWNLOAD', 'GET /listings/template returns a non-empty xlsx', async (ctx) => {
    ctx.method = 'GET';
    ctx.endpoint = '/api/v1/listings/template';
    const res = await api.get(ctx.endpoint, { token: seller.token });
    ctx.statusCode = res.status;
    ctx.actual = { bufferLength: res.buffer ? res.buffer.length : 0 };
    assert.equal(res.status, 200);
    assert.ok(res.buffer && res.buffer.length > 0, 'expected a non-empty binary response');
  });

  // Blank optional cells are `null` here (a genuinely empty Excel cell reads back
  // as null/undefined via ExcelJS) — NOT '', which the validators treat as an
  // explicit-but-invalid value rather than "not provided".
  const rows = [
    // 0: exact match, ready
    [catRajma.name, realCommodity.name, 'bold', 12, 30, 1111, 15, 'QA note', null, null, null],
    // 1: exact match, blank price -> null price, still ready
    [catChana.name, chanaCommodity.name, null, 8, null, null, null, null, null, null, null],
    // 2: slightly misspelled commodity name -> fuzzy suggestion, NOT ready
    [catRajma.name, realCommodity.name.replace('Badshah', 'Badsha'), 'bold', 5, 30, 999, null, null, null, null, null],
    // 3: completely bogus category/commodity -> unresolved, NOT ready
    ['QA_Totally Not A Real Category', 'QA_Totally Not A Real Commodity', null, 5, null, null, null, null, null, null, null],
    // 4: duplicate of row 0's combo (same category+commodity+weight+quality) -> should UPDATE, not duplicate-create
    [catRajma.name, realCommodity.name, 'bold', 20, 30, 1333, null, 'second upload of same row', null, null, null],
  ];

  let preview;
  await h.test('BULKUPLOAD-PARSE', 'Upload a messy sheet: exact/N-A/fuzzy/unresolved/duplicate rows all handled', async (ctx) => {
    const buffer = await buildWorkbookBuffer(rows);
    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/listings/bulk-upload';
    ctx.request = { rowCount: rows.length };
    const res = await api.upload(ctx.endpoint, { token: seller.token, buffer, filename: 'qa-sheet.xlsx' });
    ctx.statusCode = res.status;
    ctx.actual = res.json?.data?.summary;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    preview = res.json.data.rows;

    const exactRow = preview.find((r) => r.raw.commodity === realCommodity.name && r.raw.quantityBags === 12);
    assert.equal(exactRow.ready, true, 'exact-match row should be ready');

    const naRow = preview.find((r) => r.raw.quantityBags === 8);
    assert.equal(naRow.resolved.price, null, 'N/A price must parse to null, row still resolvable');
    assert.equal(naRow.ready, true);

    const fuzzyRow = preview.find((r) => r.raw.quantityBags === 5 && r.raw.commodity !== rows[3][1]);
    assert.equal(fuzzyRow.resolved.commodityMatch, 'fuzzy', `expected a fuzzy match, got ${fuzzyRow.resolved.commodityMatch}`);
    assert.equal(fuzzyRow.ready, false, 'a fuzzy suggestion must never be auto-applied / treated as ready');
    assert.ok(fuzzyRow.resolved.commoditySuggestion, 'expected a suggestion object for the typo\'d commodity name');

    const bogusRow = preview.find((r) => r.raw.category === rows[3][0]);
    assert.equal(bogusRow.ready, false, 'completely unknown category/commodity must not be ready');
    assert.ok(bogusRow.errors.length > 0 || bogusRow.resolved.categoryId === null);
  });

  // Isolated from the row set above on purpose: CLAUDE.md §4.7 documents the real
  // supplier sheets literally writing the text "N/A" in the price cell (not just
  // leaving it blank). Checked standalone so a finding here doesn't skew the
  // created-count math in BULKUPLOAD-CONFIRM.
  await h.test('BULKUPLOAD-NA-PRICE-TEXT', 'A price cell containing the literal text "N/A" (not just blank) is treated as no-price, not a validation error', async (ctx) => {
    const buffer = await buildWorkbookBuffer([
      [catChana.name, chanaCommodity.name, 'medium', 6, 40, 'N/A', null, null, null, null, null],
    ]);
    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/listings/bulk-upload';
    ctx.request = { price: 'N/A' };
    const res = await api.upload(ctx.endpoint, { token: seller.token, buffer, filename: 'qa-na-price.xlsx' });
    ctx.statusCode = res.status;
    const row = res.json?.data?.rows?.[0];
    ctx.actual = row;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(row.resolved.price, null, `expected the literal "N/A" to parse as null price, got errors: ${JSON.stringify(row.errors)}`);
    assert.equal(row.ready, true, 'a row whose only issue is an "N/A" price must still be ready, per CLAUDE.md §4.7');
  });

  await h.test('BULKUPLOAD-CONFIRM', 'Confirming only the ready rows creates/updates exactly those; duplicate-combo row updates in place', async (ctx) => {
    const readyRows = preview.filter((r) => r.ready).map((r) => ({
      rowIndex: r.rowIndex,
      categoryId: r.resolved.categoryId,
      commodityId: r.resolved.commodityId,
      quality: r.resolved.quality,
      quantityBags: r.resolved.quantityBags,
      weightKg: r.resolved.weightKg,
      price: r.resolved.price,
      paymentTerms: r.resolved.paymentTerms,
      notes: r.resolved.notes,
      moisture: r.resolved.moisture,
      color: r.resolved.color,
      size: r.resolved.size,
    }));

    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/listings/bulk-confirm';
    ctx.request = { rowCount: readyRows.length };
    const res = await api.post(ctx.endpoint, { token: seller.token, body: { rows: readyRows } });
    ctx.statusCode = res.status;
    ctx.actual = res.json?.data;
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.data.failed.length, 0, `expected no failures among ready rows: ${JSON.stringify(res.json.data.failed)}`);
    // 3 "ready" rows go in: row0 (new), row1/N-A (new), row4 (same combo as row0,
    // processed after it within this same confirm call) -> that one must UPDATE
    // row0's just-created listing rather than create a sibling duplicate.
    assert.equal(res.json.data.created.length, 2, 'expected 2 brand-new listings (row 0 and the N/A row)');
    assert.equal(res.json.data.updated.length, 1, 'expected row 4 (duplicate combo of row 0) to update, not create');

    const created = await prisma.listing.findFirst({
      where: { userId: seller.id, categoryId: catChana.id, commodityId: chanaCommodity.id },
    });
    assert.ok(created);
    seller.listingIds.push(created.id);

    const rajmaRows = await prisma.listing.findMany({
      where: { userId: seller.id, categoryId: catRajma.id, commodityId: realCommodity.id, weightKg: 30, quality: 'bold' },
    });
    assert.equal(rajmaRows.length, 1, 'row 4 must have updated row 0 in place, not created a second row');
    assert.equal(Number(rajmaRows[0].price), 1333, "the later row's (row 4) values must have won the update");
    seller.listingIds.push(rajmaRows[0].id);
  });

  await h.test('BULKUPLOAD-REUPLOAD-UPDATES-NOT-DUPLICATES', 'Re-uploading the same sheet updates existing listings instead of creating duplicates', async (ctx) => {
    const before = await prisma.listing.count({ where: { userId: seller.id, categoryId: catRajma.id, commodityId: realCommodity.id } });

    const buffer = await buildWorkbookBuffer([rows[0]]); // same category+commodity+weight+quality as before, new price
    const uploadRes = await api.upload('/api/v1/listings/bulk-upload', { token: seller.token, buffer, filename: 'qa-reupload.xlsx' });
    assert.equal(uploadRes.status, 200, JSON.stringify(uploadRes.json));
    const row = uploadRes.json.data.rows[0];
    assert.ok(row.willUpdateExisting, 'parser should recognize this as an update to an existing listing, not a new one');

    const confirmRes = await api.post('/api/v1/listings/bulk-confirm', {
      token: seller.token,
      body: {
        rows: [
          {
            rowIndex: row.rowIndex,
            categoryId: row.resolved.categoryId,
            commodityId: row.resolved.commodityId,
            quality: row.resolved.quality,
            quantityBags: row.resolved.quantityBags,
            weightKg: row.resolved.weightKg,
            price: row.resolved.price,
          },
        ],
      },
    });
    ctx.method = 'POST';
    ctx.endpoint = '/api/v1/listings/bulk-confirm';
    ctx.statusCode = confirmRes.status;
    ctx.actual = confirmRes.json.data;
    assert.equal(confirmRes.status, 200, JSON.stringify(confirmRes.json));
    assert.equal(confirmRes.json.data.updated.length, 1, 'expected an update, not a new create');
    assert.equal(confirmRes.json.data.created.length, 0);

    const after = await prisma.listing.count({ where: { userId: seller.id, categoryId: catRajma.id, commodityId: realCommodity.id } });
    assert.equal(after, before, 'row count must not grow — same combo must update in place');
  });
}

module.exports = { run };
