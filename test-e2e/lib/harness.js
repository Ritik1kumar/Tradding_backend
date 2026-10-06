// Minimal custom test harness (not node:test) — we need each test's full
// request/expected/actual captured as structured data for the HTML/JSON
// report, which a standard test-runner's output doesn't give us for free.

function createHarness() {
  const results = [];
  let currentSection = null;

  function section(name) {
    currentSection = name;
    console.log(`\n=== ${name} ===`);
  }

  // fn receives a mutable `ctx` object — scenarios fill in ctx.method/endpoint/
  // request/expected/actual/statusCode as they go, for the report to render.
  async function test(id, description, fn) {
    const ctx = { method: null, endpoint: null, request: undefined, expected: undefined, actual: undefined, statusCode: null };
    const start = Date.now();
    const record = { section: currentSection, id, description };
    try {
      await fn(ctx);
      Object.assign(record, ctx, { pass: true, skipped: false, durationMs: Date.now() - start });
      console.log(`[PASS] ${id} — ${description}`);
    } catch (err) {
      Object.assign(record, ctx, {
        pass: false,
        skipped: false,
        error: err.message,
        stack: err.stack,
        durationMs: Date.now() - start,
      });
      console.log(`[FAIL] ${id} — ${description}`);
      console.log(`       ${err.message}`);
    }
    results.push(record);
    return record;
  }

  function skip(id, description, reason) {
    results.push({ section: currentSection, id, description, pass: null, skipped: true, reason });
    console.log(`[SKIP] ${id} — ${description} (${reason})`);
  }

  function summary() {
    const total = results.length;
    const passed = results.filter((r) => r.pass === true).length;
    const failed = results.filter((r) => r.pass === false).length;
    const skipped = results.filter((r) => r.skipped).length;
    return { total, passed, failed, skipped };
  }

  return { section, test, skip, results, summary };
}

module.exports = { createHarness };
