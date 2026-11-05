// Runs the collection with Newman, treats KNOWN-BUG failures as expected, cleans up test data, writes reports.
// Exit code 0: no unexpected failures.  Exit code 1: an unexpected failure (a regression or an infrastructure problem).
const fs = require('fs');
const path = require('path');
const newman = require('newman');

const ROOT = path.join(__dirname, '..');
const REPORTS = path.join(ROOT, 'reports');
fs.mkdirSync(REPORTS, { recursive: true });

const collection = path.join(ROOT, 'collections', 'restful-booker.postman_collection.json');
const environment = JSON.parse(fs.readFileSync(path.join(ROOT, 'environments', 'qa.postman_environment.json'), 'utf8'));
const folders = JSON.parse(fs.readFileSync(collection, 'utf8')).item.map((f) => f.name);
const functional = folders.filter((n) => !n.startsWith('90'));
const dataDriven = folders.filter((n) => n.startsWith('90'));

const run = (opts) => new Promise((resolve, reject) => newman.run(opts, (err, summary) => (err ? reject(err) : resolve(summary))));

(async () => {
  const smoke = process.argv.includes('--smoke');
  const common = { collection, reporters: ['cli', 'htmlextra', 'junit'], insecure: false, timeoutRequest: 20000 };

  const s1 = await run({
    ...common, environment, folder: smoke ? [functional[0]] : functional,
    reporter: { htmlextra: { export: path.join(REPORTS, 'functional-report.html'), title: 'Restful-Booker: functional, security and contract tests', browserTitle: 'API test report', showOnlyFails: false }, junit: { export: path.join(REPORTS, 'functional-junit.xml') } },
  });

  let s2 = null;
  if (!smoke) {
    s2 = await run({
      ...common, environment: { values: s1.environment.values.members }, folder: dataDriven,
      iterationData: path.join(ROOT, 'data', 'bookings.json'),
      reporter: { htmlextra: { export: path.join(REPORTS, 'data-driven-report.html'), title: 'Restful-Booker: data-driven create/read/delete' }, junit: { export: path.join(REPORTS, 'data-driven-junit.xml') } },
    });
  }

  // ---- classify results
  const summaries = [s1, s2].filter(Boolean);
  const rows = summaries.flatMap((s) => s.run.executions.flatMap((e) => (e.assertions || []).map((a) => ({ request: e.item.name, name: a.assertion, failed: !!a.error }))));
  const isKnown = (n) => n.startsWith('KNOWN-BUG');
  const passed = rows.filter((r) => !r.failed && !isKnown(r.name)).length;
  const unexpected = rows.filter((r) => r.failed && !isKnown(r.name));
  const knownFailing = rows.filter((r) => r.failed && isKnown(r.name));
  const knownFixed = rows.filter((r) => !r.failed && isKnown(r.name));
  const requestErrors = summaries.flatMap((s) => s.run.failures.filter((f) => !f.error.test).map((f) => `${f.source && f.source.name}: ${f.error.message}`));
  const durations = summaries.flatMap((s) => s.run.executions.map((e) => (e.response ? e.response.responseTime : 0)));
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;

  // ---- clean up every booking the suite created
  const final = (s2 || s1).environment.values.members;
  const get = (k) => (final.find((v) => v.key === k) || {}).value;
  const ids = [...new Set(JSON.parse(get('createdIds') || '[]'))];
  let cleaned = 0;
  const base = get('baseUrl'), token = get('token');
  for (const id of ids) {
    try {
      const r = await fetch(`${base}/booking/${id}`, { method: 'DELETE', headers: { Cookie: `token=${token}` } });
      if (r.status === 201 || r.status === 404 || r.status === 405) cleaned++;
    } catch (e) { /* best effort */ }
  }

  const result = {
    date: new Date().toISOString(), requests: summaries.reduce((n, s) => n + s.run.stats.requests.total, 0),
    assertions: rows.length, passed, unexpectedFailures: unexpected.length, knownBugsStillFailing: knownFailing.length, knownBugsNowPassing: knownFixed.length,
    avgResponseMs: avg, p95ResponseMs: p95, createdBookings: ids.length, cleanedUp: cleaned,
  };
  fs.writeFileSync(path.join(REPORTS, 'summary.json'), JSON.stringify({ ...result, unexpected, knownFailing: knownFailing.map((r) => `${r.request}: ${r.name}`), knownFixed: knownFixed.map((r) => `${r.request}: ${r.name}`) }, null, 2));

  // ---- redact secrets from the generated reports (they are committed and published)
  const secrets = [get('token'), get('adminPass'), get('basicAuth')].filter((s) => s && s.length >= 6);
  for (const f of fs.readdirSync(REPORTS)) {
    if (!/\.(html|xml|json)$/.test(f)) continue;
    const p = path.join(REPORTS, f);
    let txt = fs.readFileSync(p, 'utf8');
    // also match the HTML-escaped form ("=" becomes &#x3D;) that the HTML reporter writes
    for (const s of secrets) for (const v of [s, s.replace(/=/g, '&#x3D;')]) txt = txt.split(v).join('[redacted]');
    fs.writeFileSync(p, txt);
  }

  console.log('\n================ RESULT ================');
  console.log(JSON.stringify(result, null, 2));
  if (knownFixed.length) console.log('\nKnown bugs that now PASS (verify and close):\n - ' + knownFixed.map((r) => r.name).join('\n - '));
  if (unexpected.length) console.log('\nUNEXPECTED FAILURES:\n - ' + unexpected.map((r) => `${r.request}: ${r.name}`).join('\n - '));
  if (requestErrors.length) console.log('\nREQUEST ERRORS:\n - ' + requestErrors.join('\n - '));
  process.exit(unexpected.length || requestErrors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
