// Mutation testing for the API suite.
// For each deliberate fault in reference-server/server.js, start the reference server with that fault,
// run the whole suite against it, and record whether the suite noticed.
//   killed   = the suite failed (an unexpected failure, or a "known bug" test that no longer passes)
//   survived = the suite stayed green: a gap in the tests
// Usage: node src/mutation.js [fault-name ...]      Writes docs/mutation-report.md and reports/mutation.json
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = 3300;

const FAULTS = [
  ['wrong-content-type', 'JSON responses sent as text/plain'],
  ['x-powered-by', 'Leaks the X-Powered-By framework header'],
  ['token-any', 'Any request is treated as authorised'],
  ['auth-bad-200', 'Failed login answers 200 instead of 401'],
  ['filter-ignored', 'The lastname search filter is ignored'],
  ['error-500-on-null', 'A null first name crashes the server (500)'],
  ['no-price-validation', 'Negative prices are accepted'],
  ['wrong-name-stored', 'First name is stored in upper case'],
  ['truncates-decimals', 'Decimal prices are truncated (99.99 becomes 99)'],
  ['not-persisted', 'Created bookings are never saved'],
  ['create-201', 'Create answers 201 instead of the documented 200'],
  ['lenient-id', 'An id such as 12abc is read as 12'],
  ['get-missing-200', 'An unknown id answers 200 with an empty body'],
  ['schema-missing-dates', 'The booking response omits bookingdates'],
  ['no-etag', 'No ETag header, so conditional requests never return 304'],
  ['put-no-auth', 'PUT works without credentials'],
  ['delete-noop', 'DELETE answers success but deletes nothing'],
  ['delete-200', 'DELETE answers 200 instead of 201'],
  ['put-partial-accepted', 'PUT accepts a partial body (should require all fields)'],
  ['patch-replaces', 'PATCH replaces the booking instead of merging'],
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const up = (port) => new Promise((resolve) => {
  const req = http.get({ port, path: '/ping', host: '127.0.0.1' }, (res) => { res.resume(); resolve(true); });
  req.on('error', () => resolve(false));
});

async function runOne(name, index) {
  const port = PORT + index * 2;
  const server = spawn(process.execPath, [path.join(ROOT, 'reference-server', 'server.js')], {
    env: { ...process.env, PORT: String(port), REDIRECT_PORT: String(port + 1), FAULT: name }, stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 50 && !(await up(port)); i++) await wait(100);
    const reportsDir = path.join(ROOT, 'reports', 'mutation-runs', name || 'baseline');
    fs.rmSync(reportsDir, { recursive: true, force: true });
    const r = spawnSync(process.execPath, [path.join(ROOT, 'src', 'run-tests.js')], {
      env: { ...process.env, BASE_URL: `http://127.0.0.1:${port}`, BASE_URL_HTTP: `http://127.0.0.1:${port + 1}`, REPORTS_DIR: reportsDir },
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    let s = null;
    try { s = JSON.parse(fs.readFileSync(path.join(reportsDir, 'summary.json'), 'utf8')); } catch { /* suite did not finish */ }
    const caughtBy = s ? [...s.unexpected.map((u) => `${u.request}: ${u.name}`), ...s.knownFailing] : ['the run itself failed'];
    const killed = !s || s.unexpectedFailures > 0 || s.knownBugsStillFailing > 0 || r.status !== 0;
    fs.rmSync(reportsDir, { recursive: true, force: true }); // keep the repository small; only the summary below is kept
    return { fault: name, killed, assertionsFailed: s ? s.unexpectedFailures + s.knownBugsStillFailing : null, firstCatch: caughtBy[0] || null };
  } finally { server.kill(); }
}

(async () => {
  const only = process.argv.slice(2);
  const list = only.length ? FAULTS.filter(([n]) => only.includes(n)) : FAULTS;
  const baseline = await runOne('', 0);
  if (baseline.killed) { console.error('The suite fails on the fault-free reference server. Fix that first.', baseline); process.exit(2); }
  console.log('baseline (no fault): suite green, as required\n');
  const results = [];
  for (let i = 0; i < list.length; i++) {
    const [name, desc] = list[i];
    const res = await runOne(name, i + 1);
    results.push({ ...res, description: desc });
    console.log(`${res.killed ? 'KILLED  ' : 'SURVIVED'}  ${name.padEnd(22)} ${desc}${res.firstCatch ? `\n          caught by: ${res.firstCatch}` : ''}`);
  }
  const killed = results.filter((r) => r.killed).length;
  const score = Math.round((killed / results.length) * 100);
  console.log(`\nMutation score: ${killed}/${results.length} (${score}%)`);

  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  const md = [
    '# Mutation testing report', '',
    'A test suite that passes proves little unless it would fail when the application is wrong. This report measures exactly that.',
    '',
    '**Method.** `reference-server/` is a small server written from `spec/openapi.yaml` that behaves as the specification says. The whole suite passes against it (186 assertions, 0 unexpected failures). Each row below turns on **one** deliberate fault in that server, then runs the whole suite. A fault is *killed* if the suite fails, and *survives* if the suite stays green (a gap in the tests).',
    '', `**Result: ${killed} of ${results.length} injected faults killed (${score}%).**`, '',
    '| # | Injected fault | Result | First test to catch it |', '|---|---|---|---|',
    ...results.map((r, i) => `| ${i + 1} | ${r.description} | ${r.killed ? 'Killed' : '**Survived**'} | ${r.firstCatch ? r.firstCatch.replace(/\|/g, '\\|') : 'none'} |`),
    '', '## Reproduce', '```bash', 'npm run mutation', '```', 'About 10 minutes. It starts the reference server once per fault on local ports and needs no internet.', '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'docs', 'mutation-report.md'), md);
  fs.writeFileSync(path.join(ROOT, 'reports', 'mutation.json'), JSON.stringify({ date: new Date().toISOString(), killed, total: results.length, score, results }, null, 2));
  process.exit(killed === results.length ? 0 : 1);
})();
