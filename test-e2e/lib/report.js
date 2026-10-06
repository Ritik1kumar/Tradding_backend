const fs = require('node:fs');
const path = require('node:path');

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function trimJson(value, max = 400) {
  if (value === undefined) return '';
  let str;
  try {
    str = JSON.stringify(value);
  } catch (err) {
    str = String(value);
  }
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function groupBySection(results) {
  const bySection = new Map();
  for (const r of results) {
    if (!bySection.has(r.section)) bySection.set(r.section, []);
    bySection.get(r.section).push(r);
  }
  return bySection;
}

function renderResultsTable(results) {
  const rows = results
    .map((r) => {
      if (r.skipped) {
        return `<tr class="skip">
          <td>${esc(r.id)}</td>
          <td>${esc(r.description)}</td>
          <td colspan="3">SKIPPED — ${esc(r.reason)}</td>
          <td class="status">SKIP</td>
        </tr>`;
      }
      const statusClass = r.pass ? 'pass' : 'fail';
      const statusText = r.pass ? 'PASS' : 'FAIL';
      const endpointText = r.method ? `${esc(r.method)} ${esc(r.endpoint)}` : '';
      const failDetail = !r.pass
        ? `<div class="fail-detail"><strong>Error:</strong> ${esc(r.error)}<br/>
           <strong>Request:</strong> <code>${esc(trimJson(r.request))}</code><br/>
           <strong>Expected:</strong> <code>${esc(trimJson(r.expected))}</code><br/>
           <strong>Actual:</strong> <code>${esc(trimJson(r.actual))}</code></div>`
        : '';
      return `<tr class="${statusClass}">
        <td>${esc(r.id)}</td>
        <td>${esc(r.description)}${failDetail}</td>
        <td>${endpointText}</td>
        <td>${r.statusCode ?? ''}</td>
        <td><code>${esc(trimJson(r.request, 150))}</code></td>
        <td class="status">${statusText}</td>
      </tr>`;
    })
    .join('\n');

  return `<table>
    <thead><tr><th>ID</th><th>Description</th><th>Endpoint</th><th>HTTP</th><th>Request</th><th>Result</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderCoverageMatrix(coverageMatrix) {
  const rows = coverageMatrix
    .map((row) => {
      const statusClass = row.covered ? 'pass' : 'fail';
      const statusText = row.covered ? 'COVERED' : 'NO COVERAGE';
      return `<tr class="${statusClass}">
        <td>${esc(row.rule)}</td>
        <td>${row.testIds.map(esc).join(', ') || '—'}</td>
        <td class="status">${statusText}</td>
      </tr>`;
    })
    .join('\n');
  return `<table>
    <thead><tr><th>Business rule</th><th>Covered by</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderIsolationMatrix(isolationMatrix) {
  const rows = isolationMatrix
    .map((u) => {
      const leakClass = u.leaks > 0 ? 'fail' : 'pass';
      return `<tr class="${leakClass}">
        <td>${esc(u.phone)}</td>
        <td>${esc(u.role)}</td>
        <td>${u.created}</td>
        <td>${u.seenInMyListings}</td>
        <td>${u.leaks}</td>
      </tr>`;
    })
    .join('\n');
  return `<table>
    <thead><tr><th>Phone</th><th>Role</th><th>Listings created</th><th>Seen in "my listings"</th><th>Leaks found</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderBugs(bugs) {
  if (!bugs.length) return '<p>No bugs found that survived verification.</p>';
  return bugs
    .map(
      (b, i) => `<div class="bug bug-${esc(b.severity)}">
        <h4>#${i + 1} [${esc(b.severity)}] ${esc(b.summary)}</h4>
        <p><strong>Repro:</strong> ${esc(b.repro)}</p>
        <p><strong>Expected:</strong> ${esc(b.expected)}</p>
        <p><strong>Actual:</strong> ${esc(b.actual)}</p>
        <p><strong>Suspected location:</strong> <code>${esc(b.location)}</code></p>
        <p><strong>Proposed fix:</strong> ${esc(b.proposedFix)}</p>
      </div>`
    )
    .join('\n');
}

function renderList(items) {
  if (!items.length) return '<p>None.</p>';
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function buildHtml(data) {
  const { meta, summary, execSummary, coverageMatrix, bySection, isolationMatrix, bugs, gaps, notTested } = data;

  const sectionHtml = Array.from(bySection.entries())
    .map(([name, results]) => `<section>
      <h3>${esc(name)}</h3>
      ${renderResultsTable(results)}
    </section>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Listing E2E Report</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 24px; background: #f5f6f8; color: #1a1a1a; }
  h1 { margin-bottom: 4px; }
  .meta { color: #555; font-size: 14px; margin-bottom: 20px; }
  .summary-grid { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
  .stat { background: white; border-radius: 8px; padding: 12px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); min-width: 100px; text-align: center; }
  .stat .n { font-size: 28px; font-weight: 700; display: block; }
  .stat.total .n { color: #333; }
  .stat.passed .n { color: #1a7f37; }
  .stat.failed .n { color: #c91e2e; }
  .stat.skipped .n { color: #9a6700; }
  section { background: white; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #fafafa; position: sticky; top: 0; }
  tr.pass td.status { color: #1a7f37; font-weight: 700; }
  tr.fail td.status { color: #c91e2e; font-weight: 700; }
  tr.fail { background: #fff5f5; }
  tr.skip td.status { color: #9a6700; font-weight: 700; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; word-break: break-word; }
  .fail-detail { margin-top: 6px; font-size: 12px; color: #7a1f1f; background: #ffecec; padding: 6px 8px; border-radius: 4px; }
  .bug { border-left: 4px solid #c91e2e; padding: 8px 12px; margin-bottom: 12px; background: #fff8f8; border-radius: 0 6px 6px 0; }
  .bug-medium { border-color: #9a6700; background: #fffbea; }
  .bug-low { border-color: #777; background: #fafafa; }
  .bug h4 { margin: 0 0 6px; }
  .exec-summary { font-size: 15px; line-height: 1.5; }
</style>
</head>
<body>
  <h1>Listing Module — E2E Test Report</h1>
  <div class="meta">
    Run at ${esc(meta.finishedAt)} · DB: <code>${esc(meta.dbName)}</code> · Git commit: <code>${esc(meta.gitCommit)}</code> ·
    Duration: ${esc(meta.durationMs)} ms · Node ${esc(meta.nodeVersion)}
  </div>

  <div class="summary-grid">
    <div class="stat total"><span class="n">${summary.total}</span>Total</div>
    <div class="stat passed"><span class="n">${summary.passed}</span>Passed</div>
    <div class="stat failed"><span class="n">${summary.failed}</span>Failed</div>
    <div class="stat skipped"><span class="n">${summary.skipped}</span>Skipped</div>
  </div>

  <section>
    <h3>Executive summary</h3>
    <div class="exec-summary">${execSummary}</div>
  </section>

  <section>
    <h3>Coverage matrix — business rules</h3>
    ${renderCoverageMatrix(coverageMatrix)}
  </section>

  ${sectionHtml}

  <section>
    <h3>25-user isolation matrix</h3>
    ${renderIsolationMatrix(isolationMatrix)}
  </section>

  <section>
    <h3>Bugs found</h3>
    ${renderBugs(bugs)}
  </section>

  <section>
    <h3>Not built / gaps</h3>
    ${renderList(gaps)}
  </section>

  <section>
    <h3>What was NOT tested</h3>
    ${renderList(notTested)}
  </section>
</body>
</html>`;
}

function writeReport(data, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const html = buildHtml(data);
  const json = {
    meta: data.meta,
    summary: data.summary,
    execSummary: data.execSummary,
    coverageMatrix: data.coverageMatrix,
    results: Array.from(data.bySection.values()).flat(),
    isolationMatrix: data.isolationMatrix,
    bugs: data.bugs,
    gaps: data.gaps,
    notTested: data.notTested,
  };
  const htmlPath = path.join(outDir, 'listing-e2e-report.html');
  const jsonPath = path.join(outDir, 'listing-e2e-report.json');
  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
  return { htmlPath, jsonPath };
}

module.exports = { writeReport, groupBySection };
