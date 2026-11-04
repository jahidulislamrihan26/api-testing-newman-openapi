// Generates the Postman collection, test-case matrix (md + csv) and defect pages from one definition.
// Run: npm run build
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- schemas
const bookingSchema = {
  type: 'object',
  required: ['firstname', 'lastname', 'totalprice', 'depositpaid', 'bookingdates'],
  properties: {
    firstname: { type: 'string' }, lastname: { type: 'string' },
    totalprice: { type: 'number' }, depositpaid: { type: 'boolean' },
    bookingdates: { type: 'object', required: ['checkin', 'checkout'], properties: { checkin: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, checkout: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } } },
    additionalneeds: { type: 'string' },
  },
};
const createdSchema = { type: 'object', required: ['bookingid', 'booking'], properties: { bookingid: { type: 'integer', minimum: 1 }, booking: bookingSchema } };
const listSchema = { type: 'array', items: { type: 'object', required: ['bookingid'], properties: { bookingid: { type: 'integer' } } } };
const tokenSchema = { type: 'object', required: ['token'], properties: { token: { type: 'string', minLength: 8 } } };

// ---------------------------------------------------------------- assertion snippets
const status = (c) => `pm.test("Status code is ${c}", () => pm.response.to.have.status(${c}));`;
const json = 'pm.test("Content-Type is application/json", () => pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json"));';
const schema = (name, s) => `pm.test("Response matches ${name} schema", () => pm.response.to.have.jsonSchema(${JSON.stringify(s)}));`;
const time = 'pm.test("Response time under 3000 ms", () => pm.expect(pm.response.responseTime).to.be.below(3000));';
const test = (name, code) => `pm.test("${name}", () => { ${code} });`;
const known = (bug, desc, code) => `pm.test("KNOWN-BUG ${bug}: ${desc}", () => { ${code} });`;
const body = (o = {}) => JSON.stringify({ firstname: 'QA', lastname: '{{uniq}}', totalprice: 150, depositpaid: true, bookingdates: { checkin: '2026-12-01', checkout: '2026-12-05' }, additionalneeds: 'Breakfast', ...o }, null, 2);
const SET_EXPECTED = 'pm.collectionVariables.set("expected", JSON.stringify(pm.response.json().booking));';

// ---------------------------------------------------------------- definition
// R(id, title, method, path, { type, headers, body, token, basic, pre, tests, bugs, raw })
const R = (id, title, method, p, o = {}) => ({ id, title, method, path: p, ...o });

const folders = [
  { name: '01 Health & Authentication', items: [
    R('HLTH-01', 'Health check responds', 'GET', '/ping', { type: 'Functional', tests: [status(201), time, test('Body text is Created', 'pm.expect(pm.response.text()).to.eql("Created");')] }),
    R('AUTH-01', 'Login with valid admin credentials returns a token', 'POST', '/auth', { type: 'Functional', body: '{"username":"{{adminUser}}","password":"{{adminPass}}"}', tests: [status(200), json, schema('token', tokenSchema), time, 'pm.environment.set("token", pm.response.json().token);'] }),
    R('AUTH-02', 'Login with wrong password is rejected', 'POST', '/auth', { type: 'Negative', bugs: ['API-BUG-001'], body: '{"username":"{{adminUser}}","password":"wrong-password"}', tests: [test('No token is issued', 'pm.expect(pm.response.json()).to.not.have.property("token");'), known('API-BUG-001', 'status should be 401 for bad credentials', 'pm.expect(pm.response.code).to.eql(401);')] }),
    R('AUTH-03', 'Login with empty body is rejected', 'POST', '/auth', { type: 'Negative', bugs: ['API-BUG-001'], body: '{}', tests: [test('No token is issued', 'pm.expect(pm.response.json()).to.not.have.property("token");'), known('API-BUG-001', 'status should be 400 or 401 for empty body', 'pm.expect(pm.response.code).to.be.oneOf([400, 401]);')] }),
    R('AUTH-04', 'Login with unknown user is rejected', 'POST', '/auth', { type: 'Negative', bugs: ['API-BUG-001'], body: '{"username":"nobody","password":"password123"}', tests: [test('No token is issued', 'pm.expect(pm.response.json()).to.not.have.property("token");'), known('API-BUG-001', 'status should be 401 for unknown user', 'pm.expect(pm.response.code).to.eql(401);')] }),
    R('AUTH-05', 'SQL injection in username does not authenticate or crash', 'POST', '/auth', { type: 'Security', body: '{"username":"admin\' OR \'1\'=\'1","password":"x"}', tests: [test('No token is issued', 'pm.expect(pm.response.json()).to.not.have.property("token");'), test('Server did not error (no 5xx)', 'pm.expect(pm.response.code).to.be.below(500);')] }),
  ] },
  { name: '02 Create booking', items: [
    R('CRT-01', 'Create a booking with valid data', 'POST', '/booking', { type: 'Functional', pre: ['pm.collectionVariables.set("uniq", "QA" + Date.now());'], body: body(), tests: [status(200), json, schema('created-booking', createdSchema), time, test('Echoes the submitted booking', 'const b = pm.response.json().booking; pm.expect(b.firstname).to.eql("QA"); pm.expect(b.lastname).to.eql(pm.collectionVariables.get("uniq")); pm.expect(b.totalprice).to.eql(150); pm.expect(b.depositpaid).to.eql(true); pm.expect(b.bookingdates).to.eql({checkin:"2026-12-01",checkout:"2026-12-05"});'), 'pm.collectionVariables.set("bookingId", pm.response.json().bookingid);', SET_EXPECTED] }),
    R('CRT-02', 'Create a booking without the optional additionalneeds field', 'POST', '/booking', { type: 'Functional', body: JSON.stringify({ firstname: 'QA', lastname: 'NoNeeds', totalprice: 10, depositpaid: false, bookingdates: { checkin: '2026-12-01', checkout: '2026-12-02' } }, null, 2), tests: [status(200), json, test('Booking id returned', 'pm.expect(pm.response.json().bookingid).to.be.a("number");')] }),
    R('CRT-03', 'Two creates return different booking ids', 'POST', '/booking', { type: 'Functional', body: body(), tests: [status(200), test('Id differs from the first booking', 'pm.expect(pm.response.json().bookingid).to.not.eql(Number(pm.collectionVariables.get("bookingId")));')] }),
    R('CRT-04', 'Malformed JSON is rejected with 400', 'POST', '/booking', { type: 'Negative', body: '{bad json', tests: [status(400), time] }),
    R('CRT-05', 'Missing required fields are rejected with a client error', 'POST', '/booking', { type: 'Negative', bugs: ['API-BUG-002'], body: '{"firstname":"OnlyName"}', tests: [known('API-BUG-002', 'should be 400/422, not a 5xx server error', 'pm.expect(pm.response.code).to.be.within(400, 499);')] }),
    R('CRT-06', 'Empty object is rejected with a client error', 'POST', '/booking', { type: 'Negative', bugs: ['API-BUG-002'], body: '{}', tests: [known('API-BUG-002', 'should be 400/422, not a 5xx server error', 'pm.expect(pm.response.code).to.be.within(400, 499);')] }),
    R('CRT-07', 'Negative total price is rejected', 'POST', '/booking', { type: 'Boundary', bugs: ['API-BUG-004'], body: body({ totalprice: -5 }), tests: [known('API-BUG-004', 'negative price should be rejected with 400', 'pm.expect(pm.response.code).to.be.within(400, 499);')] }),
    R('CRT-08', 'Non-numeric total price is rejected', 'POST', '/booking', { type: 'Negative', bugs: ['API-BUG-004'], body: body({ totalprice: 'abc' }), tests: [known('API-BUG-004', 'string price should be rejected with 400, not stored as null', 'pm.expect(pm.response.code).to.be.within(400, 499);')] }),
    R('CRT-09', 'Checkout date before checkin date is rejected', 'POST', '/booking', { type: 'Boundary', bugs: ['API-BUG-004'], body: body({ bookingdates: { checkin: '2026-12-10', checkout: '2026-12-01' } }), tests: [known('API-BUG-004', 'checkout before checkin should be rejected with 400', 'pm.expect(pm.response.code).to.be.within(400, 499);')] }),
    R('CRT-10', '10,000-character first name is rejected', 'POST', '/booking', { type: 'Boundary', bugs: ['API-BUG-004'], pre: ['pm.variables.set("long", "A".repeat(10000));'], body: body({ firstname: '{{long}}' }), tests: [known('API-BUG-004', 'oversized value should be rejected with 400/413', 'pm.expect(pm.response.code).to.be.within(400, 499);')] }),
  ] },
  { name: '03 Read booking', items: [
    R('RD-01', 'List all bookings', 'GET', '/booking', { type: 'Contract', tests: [status(200), json, schema('booking-id list', listSchema), time, test('List is not empty', 'pm.expect(pm.response.json().length).to.be.above(0);')] }),
    R('RD-02', 'Filter by lastname finds the new booking', 'GET', '/booking?lastname={{uniq}}', { type: 'Functional', tests: [status(200), test('Result contains the booking created in CRT-01', 'const ids = pm.response.json().map(x => x.bookingid); pm.expect(ids).to.include(Number(pm.collectionVariables.get("bookingId")));')] }),
    R('RD-03', 'Filter by firstname and lastname together', 'GET', '/booking?firstname=QA&lastname={{uniq}}', { type: 'Functional', tests: [status(200), test('Result contains the new booking', 'const ids = pm.response.json().map(x => x.bookingid); pm.expect(ids).to.include(Number(pm.collectionVariables.get("bookingId")));')] }),
    R('RD-04', 'Filter with no match returns an empty list', 'GET', '/booking?lastname=ZZ-no-such-name-ZZ', { type: 'Negative', tests: [status(200), test('Body is an empty array', 'pm.expect(pm.response.json()).to.eql([]);')] }),
    R('RD-05', 'Get booking by id returns the stored booking', 'GET', '/booking/{{bookingId}}', { type: 'Contract', tests: [status(200), json, schema('booking', bookingSchema), time, test('Matches what was created', 'pm.expect(pm.response.json()).to.eql(JSON.parse(pm.collectionVariables.get("expected")));')] }),
    R('RD-06', 'Get a non-existent booking returns 404', 'GET', '/booking/99999999', { type: 'Negative', tests: [status(404), time] }),
    R('RD-07', 'Get a non-numeric id returns 404', 'GET', '/booking/abc', { type: 'Negative', tests: [status(404)] }),
    R('RD-08', 'XML is returned when Accept is application/xml', 'GET', '/booking/{{bookingId}}', { type: 'Functional', bugs: ['API-BUG-007'], headers: { Accept: 'application/xml' }, tests: [status(200), test('Body is XML', 'pm.expect(pm.response.text()).to.include("<booking>");'), known('API-BUG-007', 'Content-Type should be application/xml, not text/html', 'pm.expect(pm.response.headers.get("Content-Type")).to.include("xml");')] }),
    R('RD-09', 'Invalid date in filter is rejected with a client error', 'GET', '/booking?checkin=not-a-date', { type: 'Negative', bugs: ['API-BUG-003'], tests: [known('API-BUG-003', 'should be 400, not a 5xx server error', 'pm.expect(pm.response.code).to.be.within(400, 499);')] }),
    R('RD-10', 'Error responses are JSON', 'GET', '/booking/99999999', { type: 'Contract', bugs: ['API-BUG-006'], tests: [known('API-BUG-006', 'error body should be JSON, not plain text', 'pm.expect(pm.response.headers.get("Content-Type")).to.include("json");')] }),
  ] },
  { name: '04 Update booking', items: [
    R('UPD-01', 'PUT with a token cookie replaces the booking', 'PUT', '/booking/{{bookingId}}', { type: 'Functional', token: true, body: body({ firstname: 'Updated', totalprice: 200 }), tests: [status(200), json, schema('booking', bookingSchema), time, test('Fields are updated', 'const b = pm.response.json(); pm.expect(b.firstname).to.eql("Updated"); pm.expect(b.totalprice).to.eql(200);')] }),
    R('UPD-02', 'Update is persisted', 'GET', '/booking/{{bookingId}}', { type: 'Functional', tests: [status(200), test('GET returns the updated values', 'const b = pm.response.json(); pm.expect(b.firstname).to.eql("Updated"); pm.expect(b.totalprice).to.eql(200);')] }),
    R('UPD-03', 'PUT with Basic auth works', 'PUT', '/booking/{{bookingId}}', { type: 'Functional', basic: true, body: body({ firstname: 'BasicAuth' }), tests: [status(200), test('Name updated', 'pm.expect(pm.response.json().firstname).to.eql("BasicAuth");')] }),
    R('UPD-04', 'PATCH changes only the supplied field', 'PATCH', '/booking/{{bookingId}}', { type: 'Functional', token: true, body: '{"firstname":"Patched"}', tests: [status(200), test('Only firstname changed', 'const b = pm.response.json(); pm.expect(b.firstname).to.eql("Patched"); pm.expect(b.lastname).to.eql(pm.collectionVariables.get("uniq")); pm.expect(b.totalprice).to.eql(150);')] }),
    R('UPD-05', 'PUT without credentials is forbidden', 'PUT', '/booking/{{bookingId}}', { type: 'Security', body: body(), tests: [status(403), time] }),
    R('UPD-06', 'PUT with an invalid token is forbidden', 'PUT', '/booking/{{bookingId}}', { type: 'Security', headers: { Cookie: 'token=invalid-token' }, body: body(), tests: [status(403)] }),
    R('UPD-07', 'PATCH without credentials is forbidden', 'PATCH', '/booking/{{bookingId}}', { type: 'Security', body: '{"firstname":"Hacker"}', tests: [status(403)] }),
    R('UPD-08', 'Forbidden update did not change the booking', 'GET', '/booking/{{bookingId}}', { type: 'Security', tests: [status(200), test('Name is still Patched', 'pm.expect(pm.response.json().firstname).to.eql("Patched");')] }),
  ] },
  { name: '05 Delete booking', items: [
    R('DEL-01', 'DELETE without credentials is forbidden', 'DELETE', '/booking/{{bookingId}}', { type: 'Security', tests: [status(403)] }),
    R('DEL-02', 'Booking still exists after forbidden delete', 'GET', '/booking/{{bookingId}}', { type: 'Security', tests: [status(200)] }),
    R('DEL-03', 'DELETE with a token removes the booking', 'DELETE', '/booking/{{bookingId}}', { type: 'Functional', token: true, tests: [status(201), time] }),
    R('DEL-04', 'Deleted booking can no longer be read', 'GET', '/booking/{{bookingId}}', { type: 'Functional', tests: [status(404)] }),
    R('DEL-05', 'Deleting an already-deleted booking returns 404', 'DELETE', '/booking/{{bookingId}}', { type: 'Negative', bugs: ['API-BUG-005'], token: true, tests: [known('API-BUG-005', 'should be 404 Not Found, not 405', 'pm.expect(pm.response.code).to.eql(404);')] }),
    R('DEL-06', 'Updating a deleted booking returns 404', 'PUT', '/booking/{{bookingId}}', { type: 'Negative', bugs: ['API-BUG-005'], token: true, body: body(), tests: [known('API-BUG-005', 'should be 404 Not Found, not 405', 'pm.expect(pm.response.code).to.eql(404);')] }),
  ] },
  { name: '06 Security checks', items: [
    R('SEC-01', 'SQL injection in a filter returns no data and no error', 'GET', "/booking?lastname=' OR '1'='1", { type: 'Security', tests: [status(200), test('Empty result (injection not executed)', 'pm.expect(pm.response.json()).to.eql([]);')] }),
    R('SEC-02', 'Script payload is stored and returned as inert JSON text', 'POST', '/booking', { type: 'Security', body: body({ firstname: '<script>alert(1)</script>' }), tests: [status(200), json, test('Value returned unchanged inside JSON', 'pm.expect(pm.response.json().booking.firstname).to.eql("<script>alert(1)</script>");')] }),
    R('SEC-03', 'Server errors do not leak stack traces', 'POST', '/booking', { type: 'Security', body: '{}', tests: [test('Body has no stack trace or file path', 'const t = pm.response.text(); pm.expect(t).to.not.match(/node_modules|\\bat .*\\(.*:\\d+:\\d+\\)|Error:/);')] }),
    R('SEC-04', 'Plain HTTP is redirected to HTTPS or refused', 'GET', '/ping', { type: 'Security', bugs: ['API-BUG-008'], http: true, tests: [known('API-BUG-008', 'HTTP request should redirect (3xx) to HTTPS', 'pm.expect(pm.response.code).to.be.within(300, 399);')] }),
    R('SEC-05', 'Responses do not disclose the server framework', 'GET', '/booking/1', { type: 'Security', bugs: ['API-BUG-009'], tests: [status(200), known('API-BUG-009', 'X-Powered-By header should be absent', 'pm.expect(pm.response.headers.has("X-Powered-By")).to.eql(false);')] }),
    R('SEC-06', 'Empty token cookie is not accepted', 'PUT', '/booking/1', { type: 'Security', headers: { Cookie: 'token=' }, body: body(), tests: [status(403)] }),
  ] },
  { name: '90 Data-driven create', items: [
    R('DD-01', 'Create booking from data row ({{firstname}} {{lastname}})', 'POST', '/booking', { type: 'Data-driven', body: '{"firstname":"{{firstname}}","lastname":"{{lastname}}","totalprice":{{totalprice}},"depositpaid":{{depositpaid}},"bookingdates":{"checkin":"{{checkin}}","checkout":"{{checkout}}"},"additionalneeds":"{{additionalneeds}}"}', tests: [status(200), schema('created-booking', createdSchema), 'pm.collectionVariables.set("ddId", pm.response.json().bookingid);', test('Echoes first name and last name', 'const b = pm.response.json().booking; pm.expect(b.firstname).to.eql(pm.iterationData.get("firstname")); pm.expect(b.lastname).to.eql(pm.iterationData.get("lastname"));'), test('Echoes price and deposit flag', 'const b = pm.response.json().booking; pm.expect(b.totalprice).to.eql(Number(pm.iterationData.get("totalprice"))); pm.expect(String(b.depositpaid)).to.eql(String(pm.iterationData.get("depositpaid")));')] }),
    R('DD-02', 'Created booking can be read back', 'GET', '/booking/{{ddId}}', { type: 'Data-driven', tests: [status(200), test('Stored first name and last name match', 'const b = pm.response.json(); pm.expect(b.firstname).to.eql(pm.iterationData.get("firstname")); pm.expect(b.lastname).to.eql(pm.iterationData.get("lastname"));')] }),
    R('DD-03', 'Clean up created booking', 'DELETE', '/booking/{{ddId}}', { type: 'Data-driven', token: true, tests: [status(201)] }),
  ] },
];

// ---------------------------------------------------------------- build Postman JSON
const urlOf = (p, http) => {
  const base = http ? '{{baseUrlHttp}}' : '{{baseUrl}}';
  const raw = base + p;
  const [pathPart, query] = p.split('?');
  const o = { raw, host: [base], path: pathPart.split('/').filter(Boolean) };
  if (query) o.query = query.split('&').map((kv) => { const i = kv.indexOf('='); return { key: kv.slice(0, i), value: kv.slice(i + 1) }; });
  return o;
};
const toItem = (r) => {
  const headers = [{ key: 'Accept', value: (r.headers && r.headers.Accept) || 'application/json' }];
  if (r.body !== undefined) headers.push({ key: 'Content-Type', value: 'application/json' });
  if (r.token) headers.push({ key: 'Cookie', value: 'token={{token}}' });
  if (r.basic) headers.push({ key: 'Authorization', value: 'Basic {{basicAuth}}' });
  if (r.headers) for (const [k, v] of Object.entries(r.headers)) if (k !== 'Accept') headers.push({ key: k, value: v });
  const item = {
    name: `${r.id} ${r.title}`,
    request: { method: r.method, header: headers, url: urlOf(r.path, r.http) },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: r.tests.join('\n').split('\n') } }],
  };
  if (r.body !== undefined) item.request.body = { mode: 'raw', raw: r.body, options: { raw: { language: 'json' } } };
  if (r.pre) item.event.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: r.pre } });
  if (r.http) item.protocolProfileBehavior = { followRedirects: false };
  return item;
};
const collection = {
  info: { name: 'Restful-Booker API Tests', description: 'Functional, negative, contract, security and data-driven tests. Tests named KNOWN-BUG assert the CORRECT behaviour and are expected to fail until the defect is fixed.', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  variable: [{ key: 'uniq', value: '' }, { key: 'bookingId', value: '' }, { key: 'expected', value: '' }, { key: 'ddId', value: '' }],
  event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
    '// Track every booking the suite creates so the runner can delete it afterwards.',
    'if (pm.request.method === "POST" && pm.response.code === 200 && /\\/booking$/.test(pm.request.url.getPath())) {',
    '  try { const id = pm.response.json().bookingid; const a = JSON.parse(pm.environment.get("createdIds") || "[]"); a.push(id); pm.environment.set("createdIds", JSON.stringify(a)); } catch (e) {}',
    '}',
  ] } }],
  item: folders.map((f) => ({ name: f.name, item: f.items.map(toItem) })),
};
fs.mkdirSync(path.join(ROOT, 'collections'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'collections', 'restful-booker.postman_collection.json'), JSON.stringify(collection, null, 2));

// ---------------------------------------------------------------- docs: matrix + csv
const bugs = require('./defects');
const all = folders.flatMap((f) => f.items.map((r) => ({ ...r, folder: f.name })));
const names = (r) => [...r.tests.join('\n').matchAll(/pm\.test\("([^"]+)"/g)].map((m) => m[1]);
const esc = (s) => String(s).replace(/\|/g, '\\|');
const md = ['# API Test Case Matrix', '', `${all.length} requests, ${all.reduce((n, r) => n + names(r).length, 0)} assertions. Generated by \`npm run build\` from \`src/build-collection.js\`. Cases marked **KNOWN-BUG** assert the correct behaviour and currently fail by design (see [defects](defects)).`, '', '| ID | Type | Request | Scenario | Assertions | Known defect |', '|---|---|---|---|---|---|'];
all.forEach((r) => md.push(`| ${r.id} | ${r.type} | \`${r.method} ${esc(r.path)}\` | ${esc(r.title)} | ${esc(names(r).map((n) => n.replace(/^KNOWN-BUG API-BUG-\d+: /, '')).join('; '))} | ${(r.bugs || []).map((b) => `[${b}](defects/${b}.md)`).join(', ')} |`));
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'test-case-matrix.md'), md.join('\n') + '\n');
const cell = (v) => '"' + String(v).replace(/"/g, '""') + '"';
fs.writeFileSync(path.join(ROOT, 'docs', 'test-cases.csv'), '﻿' + [['ID', 'Folder', 'Type', 'Method', 'Endpoint', 'Scenario', 'Assertions', 'Known defect'], ...all.map((r) => [r.id, r.folder, r.type, r.method, r.path, r.title, names(r).join('; '), (r.bugs || []).join(', ')])].map((x) => x.map(cell).join(',')).join('\r\n') + '\r\n');

// defect pages
fs.mkdirSync(path.join(ROOT, 'docs', 'defects'), { recursive: true });
for (const b of bugs) {
  const tcs = all.filter((r) => (r.bugs || []).includes(b.id)).map((r) => r.id).join(', ');
  fs.writeFileSync(path.join(ROOT, 'docs', 'defects', `${b.id}.md`), `# ${b.id}: ${b.title}

| Field | Value |
|---|---|
| Severity | ${b.severity} |
| Priority | ${b.priority} |
| Area | ${b.area} |
| Endpoint | \`${b.endpoint}\` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | ${tcs} |

## Steps to reproduce
\`\`\`
${b.request}
\`\`\`

## Expected
${b.expected}

## Actual
${b.actual}

## Impact
${b.impact}
`);
}
fs.writeFileSync(path.join(ROOT, 'docs', 'defects', 'README.md'), `# API Defects\n\n| ID | Title | Severity | Endpoint |\n|---|---|---|---|\n${bugs.map((b) => `| [${b.id}](${b.id}.md) | ${b.title} | ${b.severity} | \`${b.endpoint}\` |`).join('\n')}\n`);
console.log(`Built ${all.length} requests, ${all.reduce((n, r) => n + names(r).length, 0)} assertions, ${bugs.length} defect pages.`);
