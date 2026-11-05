// Generates the Postman collection, test-case matrix (md + csv) and defect pages from one definition.
// Run: npm run build
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const YAML = require('yaml');

// ---------------------------------------------------------------- schemas (read from the OpenAPI spec)
// The spec is the single source of truth: tests validate responses against the same schemas it documents.
const SPEC = YAML.parse(fs.readFileSync(path.join(ROOT, 'spec', 'openapi.yaml'), 'utf8'));
const DROP = new Set(['example', 'examples', 'description', 'title']); // documentation-only keys
function deref(node) {
  if (Array.isArray(node)) return node.map(deref);
  if (node && typeof node === 'object') {
    if (node.$ref) return deref(SPEC.components.schemas[node.$ref.split('/').pop()]);
    return Object.fromEntries(Object.entries(node).filter(([k]) => !DROP.has(k) && !k.startsWith('x-')).map(([k, v]) => [k, deref(v)]));
  }
  return node;
}
const schemaOf = (name) => deref(SPEC.components.schemas[name]);
const bookingSchema = schemaOf('Booking');
const createdSchema = schemaOf('CreatedBooking');
const listSchema = schemaOf('BookingIdList');
const tokenSchema = schemaOf('TokenResponse');

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
    R('RD-11', 'Check-in filter is strictly "later than" (observed)', 'GET', '/booking?checkin=2026-11-30&lastname={{uniq}}', { type: 'Functional', tests: [status(200), test('Booking with check-in 2026-12-01 is found for a filter date before it', 'pm.expect(pm.response.json().map(x => x.bookingid)).to.include(Number(pm.collectionVariables.get("bookingId")));')] }),
    R('RD-12', 'Check-in filter with the exact date excludes the booking (observed)', 'GET', '/booking?checkin=2026-12-01&lastname={{uniq}}', { type: 'Boundary', tests: [status(200), test('Booking with check-in 2026-12-01 is NOT found for filter date 2026-12-01', 'pm.expect(pm.response.json().map(x => x.bookingid)).to.not.include(Number(pm.collectionVariables.get("bookingId")));')] }),
    R('RD-13', 'Name filters are case sensitive (observed)', 'GET', '/booking?firstname=qa&lastname={{uniq}}', { type: 'Boundary', tests: [status(200), test('Lower-case qa does not match QA', 'pm.expect(pm.response.json()).to.eql([]);')] }),
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
  { name: '05 HTTP behaviour and robustness', items: [
    R('HTTP-01', 'HEAD returns the headers and no body', 'HEAD', '/booking/{{bookingId}}', { type: 'Functional', tests: [status(200), json, test('ETag header is present', 'pm.expect(pm.response.headers.has("ETag")).to.eql(true);'), test('Body is empty', 'pm.expect(pm.response.text()).to.eql("");')] }),
    R('HTTP-02', 'OPTIONS lists the allowed methods', 'OPTIONS', '/booking/{{bookingId}}', { type: 'Contract', tests: [status(200), test('Allow header lists GET, PUT, PATCH and DELETE', 'const a = pm.response.headers.get("Allow") || ""; ["GET", "PUT", "PATCH", "DELETE"].forEach((m) => pm.expect(a).to.include(m));')] }),
    R('HTTP-03', 'GET returns an ETag', 'GET', '/booking/{{bookingId}}', { type: 'Contract', tests: [status(200), test('ETag is returned', 'pm.expect(pm.response.headers.has("ETag")).to.eql(true);'), 'pm.collectionVariables.set("etag", pm.response.headers.get("ETag"));'] }),
    R('HTTP-04', 'Conditional GET with a matching ETag returns 304 and no body', 'GET', '/booking/{{bookingId}}', { type: 'Contract', headers: { 'If-None-Match': '{{etag}}', 'Cache-Control': 'max-age=0' }, tests: [status(304), test('Body is empty', 'pm.expect(pm.response.text()).to.eql("");')] }),
    R('HTTP-05', 'GET with a different ETag returns the booking', 'GET', '/booking/{{bookingId}}', { type: 'Contract', headers: { 'If-None-Match': 'W/"not-the-etag"' }, tests: [status(200), json] }),
    R('HTTP-06', 'Unsupported Content-Type (form data) is rejected with 415', 'POST', '/booking', { type: 'Negative', bugs: ['API-BUG-010'], headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'firstname=A&lastname=B&totalprice=1&depositpaid=true', tests: [known('API-BUG-010', 'should be 415 Unsupported Media Type, not a 5xx error', 'pm.expect(pm.response.code).to.eql(415);')] }),
    R('HTTP-07', 'Unsupported Content-Type (plain text) is rejected with 415', 'POST', '/booking', { type: 'Negative', bugs: ['API-BUG-010'], headers: { 'Content-Type': 'text/plain' }, body: '{"firstname":"A"}', tests: [known('API-BUG-010', 'should be 415 Unsupported Media Type, not a 5xx error', 'pm.expect(pm.response.code).to.eql(415);')] }),
    R('HTTP-08', 'Unsupported Accept header returns 406', 'GET', '/booking/{{bookingId}}', { type: 'Negative', bugs: ['API-BUG-011'], headers: { Accept: 'image/png' }, tests: [known('API-BUG-011', 'should be 406 Not Acceptable, not 418 I am a Teapot', 'pm.expect(pm.response.code).to.eql(406);')] }),
    R('HTTP-09', 'Booking id 0 returns 404', 'GET', '/booking/0', { type: 'Boundary', tests: [status(404)] }),
    R('HTTP-10', 'Negative booking id returns 404', 'GET', '/booking/-1', { type: 'Boundary', tests: [status(404)] }),
    R('HTTP-11', 'Fractional booking id (12.5) returns 404, not booking 12', 'GET', '/booking/{{bookingId}}.5', { type: 'Boundary', bugs: ['API-BUG-013'], tests: [known('API-BUG-013', 'id with a fractional part should be 404, not the booking with the whole-number id', 'pm.expect(pm.response.code).to.eql(404);')] }),
    R('HTTP-11B', 'Booking id followed by letters (12abc) returns 404, not booking 12', 'GET', '/booking/{{bookingId}}abc', { type: 'Boundary', bugs: ['API-BUG-013'], tests: [known('API-BUG-013', 'id with trailing letters should be 404, not the booking with the numeric prefix', 'pm.expect(pm.response.code).to.eql(404);')] }),
    R('HTTP-12', 'Oversized booking id returns 404', 'GET', '/booking/99999999999999999999', { type: 'Boundary', tests: [status(404)] }),
    R('HTTP-13', 'Path matching is case-insensitive: /Booking/{id} works (observed)', 'GET', '/Booking/{{bookingId}}', { type: 'Boundary', tests: [status(200), json] }),
    R('HTTP-14', 'First PUT of a replacement', 'PUT', '/booking/{{bookingId}}', { type: 'Functional', token: true, body: body({ firstname: 'Idempotent' }), tests: [status(200), 'pm.collectionVariables.set("put1", pm.response.text());'] }),
    R('HTTP-15', 'Repeating the same PUT gives the same result (idempotent)', 'PUT', '/booking/{{bookingId}}', { type: 'Contract', token: true, body: body({ firstname: 'Idempotent' }), tests: [status(200), test('Second response equals the first', 'pm.expect(JSON.parse(pm.response.text())).to.eql(JSON.parse(pm.collectionVariables.get("put1")));')] }),
    R('HTTP-16', 'Unknown fields on create are ignored (no mass assignment)', 'POST', '/booking', { type: 'Security', body: body({ bookingid: 1, admin: true, role: 'admin' }), tests: [status(200), test('Extra fields are not stored or echoed', 'const j = pm.response.json(); pm.expect(j.booking).to.not.have.any.keys("admin", "role", "bookingid"); pm.expect(j.bookingid).to.not.eql(1);')] }),
    R('HTTP-17', 'PATCH ignores unknown fields', 'PATCH', '/booking/{{bookingId}}', { type: 'Security', token: true, body: '{"hacker":"x","isAdmin":true}', tests: [status(200), test('Unknown fields are not returned', 'pm.expect(pm.response.json()).to.not.have.any.keys("hacker", "isAdmin");')] }),
    R('HTTP-18', 'PUT with missing required fields is rejected with 400', 'PUT', '/booking/{{bookingId}}', { type: 'Negative', token: true, body: '{"firstname":"OnlyName"}', tests: [status(400), time] }),
    R('HTTP-19', 'PATCH with an invalid price is rejected', 'PATCH', '/booking/{{bookingId}}', { type: 'Negative', bugs: ['API-BUG-004'], token: true, body: '{"totalprice":"abc"}', tests: [known('API-BUG-004', 'invalid price should be rejected with 400, not stored as null', 'pm.expect(pm.response.code).to.be.within(400, 499);')] }),
    R('HTTP-20', 'Unsupported Accept header on create returns 406', 'POST', '/booking', { type: 'Negative', bugs: ['API-BUG-011'], headers: { Accept: 'image/png' }, body: body(), tests: [known('API-BUG-011', 'should be 406 Not Acceptable, not 418 I am a Teapot', 'pm.expect(pm.response.code).to.eql(406);')] }),
  ] },
  { name: '06 Delete booking', items: [
    R('DEL-01', 'DELETE without credentials is forbidden', 'DELETE', '/booking/{{bookingId}}', { type: 'Security', tests: [status(403)] }),
    R('DEL-02', 'Booking still exists after forbidden delete', 'GET', '/booking/{{bookingId}}', { type: 'Security', tests: [status(200)] }),
    R('DEL-03', 'DELETE with a token removes the booking', 'DELETE', '/booking/{{bookingId}}', { type: 'Functional', token: true, tests: [status(201), time] }),
    R('DEL-04', 'Deleted booking can no longer be read', 'GET', '/booking/{{bookingId}}', { type: 'Functional', tests: [status(404)] }),
    R('DEL-05', 'Deleting an already-deleted booking returns 404', 'DELETE', '/booking/{{bookingId}}', { type: 'Negative', bugs: ['API-BUG-005'], token: true, tests: [known('API-BUG-005', 'should be 404 Not Found, not 405', 'pm.expect(pm.response.code).to.eql(404);')] }),
    R('DEL-06', 'Updating a deleted booking returns 404', 'PUT', '/booking/{{bookingId}}', { type: 'Negative', bugs: ['API-BUG-005'], token: true, body: body(), tests: [known('API-BUG-005', 'should be 404 Not Found, not 405', 'pm.expect(pm.response.code).to.eql(404);')] }),
  ] },
  { name: '07 Security checks', items: [
    R('SEC-01', 'SQL injection in a filter returns no data and no error', 'GET', "/booking?lastname=' OR '1'='1", { type: 'Security', tests: [status(200), test('Empty result (injection not executed)', 'pm.expect(pm.response.json()).to.eql([]);')] }),
    R('SEC-02', 'Script payload is stored and returned as inert JSON text', 'POST', '/booking', { type: 'Security', body: body({ firstname: '<script>alert(1)</script>' }), tests: [status(200), json, test('Value returned unchanged inside JSON', 'pm.expect(pm.response.json().booking.firstname).to.eql("<script>alert(1)</script>");')] }),
    R('SEC-03', 'Server errors do not leak stack traces', 'POST', '/booking', { type: 'Security', body: '{}', tests: [test('Body has no stack trace or file path', 'const t = pm.response.text(); pm.expect(t).to.not.match(/node_modules|\\bat .*\\(.*:\\d+:\\d+\\)|Error:/);')] }),
    R('SEC-04', 'Plain HTTP is redirected to HTTPS or refused', 'GET', '/ping', { type: 'Security', bugs: ['API-BUG-008'], http: true, tests: [known('API-BUG-008', 'HTTP request should redirect (3xx) to HTTPS', 'pm.expect(pm.response.code).to.be.within(300, 399);')] }),
    R('SEC-05', 'Responses do not disclose the server framework', 'GET', '/ping', { type: 'Security', bugs: ['API-BUG-009'], tests: [status(201), known('API-BUG-009', 'X-Powered-By header should be absent', 'pm.expect(pm.response.headers.has("X-Powered-By")).to.eql(false);')] }),
    R('SEC-06', 'Empty token cookie is not accepted', 'PUT', '/booking/1', { type: 'Security', headers: { Cookie: 'token=' }, body: body(), tests: [status(403)] }),
  ] },
  { name: '90 Data-driven create', items: [
    R('DD-01', 'Create booking from data row ({{firstname}} {{lastname}})', 'POST', '/booking', { type: 'Data-driven', body: '{"firstname":"{{firstname}}","lastname":"{{lastname}}","totalprice":{{totalprice}},"depositpaid":{{depositpaid}},"bookingdates":{"checkin":"{{checkin}}","checkout":"{{checkout}}"},"additionalneeds":"{{additionalneeds}}"}', tests: [status(200), schema('created-booking', createdSchema), 'pm.collectionVariables.set("ddId", pm.response.json().bookingid);', test('Echoes first name and last name', 'const b = pm.response.json().booking; pm.expect(b.firstname).to.eql(pm.iterationData.get("firstname")); pm.expect(b.lastname).to.eql(pm.iterationData.get("lastname"));'), test('Echoes price and deposit flag', 'const b = pm.response.json().booking; pm.expect(b.totalprice).to.eql(Number(pm.iterationData.get("totalprice"))); pm.expect(String(b.depositpaid)).to.eql(String(pm.iterationData.get("depositpaid")));')] }),
    R('DD-02', 'Created booking can be read back', 'GET', '/booking/{{ddId}}', { type: 'Data-driven', tests: [status(200), test('Stored first name and last name match', 'const b = pm.response.json(); pm.expect(b.firstname).to.eql(pm.iterationData.get("firstname")); pm.expect(b.lastname).to.eql(pm.iterationData.get("lastname"));')] }),
    R('DD-03', 'Clean up created booking', 'DELETE', '/booking/{{ddId}}', { type: 'Data-driven', token: true, tests: [status(201)] }),
  ] },
  // One request, many bodies: data/invalid-bookings.json. For each row: if "mustReject", the API must answer 4xx;
  // otherwise it must either answer 4xx or store exactly what was sent (never silently change it).
  { name: '91 Validation matrix (data-driven)', items: [
    R('VAL-01', 'Invalid or unusual booking body: {{name}}', 'POST', '/booking', {
      type: 'Data-driven', body: '{}', covers: [400],
      pre: ['const row = pm.iterationData.toObject();', 'pm.request.body.update(JSON.stringify(row.payload));'],
      tests: [
        'const row = pm.iterationData.toObject();',
        'const code = pm.response.code;',
        'const rejected = code >= 400 && code < 500;',
        'let exact = false;',
        'if (code === 200) { try { exact = _.isEqual(pm.response.json().booking, row.payload); } catch (e) {} }',
        'const label = row.name + (row.mustReject ? " is rejected with a 4xx status" : " is rejected or stored exactly as sent");',
        'const ok = row.mustReject ? rejected : (rejected || exact);',
        'pm.test((row.bug ? "KNOWN-BUG " + row.bug + ": " : "") + label, () => pm.expect(ok, "status " + code).to.eql(true));',
      ],
    }),
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
  if (r.body !== undefined && !(r.headers && r.headers['Content-Type'])) headers.push({ key: 'Content-Type', value: 'application/json' });
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
const staticAssertions = all.reduce((n, r) => n + names(r).length, 0);
const ddAssertions = all.filter((r) => r.folder.startsWith('90')).reduce((n, r) => n + names(r).length, 0);
const bookingRows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bookings.json'), 'utf8'));
const validationRows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'invalid-bookings.json'), 'utf8'));
const plannedAssertions = staticAssertions - ddAssertions + ddAssertions * bookingRows.length + validationRows.length;
const md = ['# API Test Case Matrix', '', `${all.length} requests with ${staticAssertions} fixed assertions, plus ${validationRows.length} validation-matrix rows. Generated by \`npm run build\` from \`src/build-collection.js\`. Cases marked **KNOWN-BUG** assert the correct behaviour and currently fail by design (see [defects](defects)).`, '', `**Why reports say more assertions than this table:** the 3 data-driven requests (DD-01 to DD-03, ${ddAssertions} assertions) run once for each of the ${bookingRows.length} data rows, and the validation request (VAL-01) runs once for each of ${validationRows.length} rows. A full run therefore executes ${staticAssertions - ddAssertions} + ${ddAssertions} x ${bookingRows.length} + ${validationRows.length} = ${plannedAssertions} assertions.`, '', '| ID | Type | Request | Scenario | Assertions | Known defect |', '|---|---|---|---|---|---|'];
all.forEach((r) => md.push(`| ${r.id} | ${r.type} | \`${r.method} ${esc(r.path)}\` | ${esc(r.title)} | ${esc(names(r).map((n) => n.replace(/^KNOWN-BUG API-BUG-\d+: /, '')).join('; '))} | ${(r.bugs || []).map((b) => `[${b}](defects/${b}.md)`).join(', ')} |`));
md.push('', '## Validation matrix rows (VAL-01, run once per row)', '', 'Rule: a row with **must reject** has to get a 4xx answer. A row without it has to be rejected (4xx) or stored exactly as sent, never silently changed.', '', '| # | Body | Must reject | Known defect |', '|---|---|---|---|');
validationRows.forEach((v, i) => md.push(`| ${i + 1} | ${esc(v.name)} | ${v.mustReject ? 'yes' : 'no (exact or reject)'} | ${v.bug ? `[${v.bug}](defects/${v.bug}.md)` : 'none (expected to pass)'} |`));
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'test-case-matrix.md'), md.join('\n') + '\n');

// ---------------------------------------------------------------- coverage: tested status codes vs the OpenAPI spec
const opKey = (method, p) => {
  const clean = p.split('?')[0];
  return `${method} ${/^\/booking\/[^/]+$/.test(clean) ? '/booking/{id}' : clean}`;
};
const asserted = {}; // op -> { code: [ids] }
const addCode = (op, code, id) => { asserted[op] = asserted[op] || {}; (asserted[op][code] = asserted[op][code] || new Set()).add(id); };
for (const r of all) {
  const op = opKey(r.method, r.path);
  const src = r.tests.join('\n');
  for (const m of src.matchAll(/to\.have\.status\((\d{3})\)|code\)\.to\.eql\((\d{3})\)/g)) addCode(op, m[1] || m[2], r.id);
  for (const m of src.matchAll(/oneOf\(\[([\d, ]+)\]\)/g)) m[1].split(',').forEach((c) => addCode(op, c.trim(), r.id));
  for (const m of src.matchAll(/within\((\d{3}), (\d{3})\)/g)) addCode(op, `${m[1][0]}xx`, r.id);
  (r.covers || []).forEach((c) => addCode(op, String(c), r.id));
}
const specOps = [];
for (const [p, item] of Object.entries(SPEC.paths)) for (const m of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) if (item[m]) specOps.push({ key: `${m.toUpperCase()} ${p.replace(/\{id\}/, '{id}')}`, id: item[m].operationId, codes: Object.keys(item[m].responses) });
// HEAD and OPTIONS are not declared in the spec; they are listed as extra tested operations.
let declared = 0, covered = 0;
const cov = ['# API Coverage Report', '', 'Which documented responses of the OpenAPI spec ([spec/openapi.yaml](../spec/openapi.yaml)) have at least one test asserting them. Generated by `npm run build`.', '', '| Operation | Declared response | Covered by | Status |', '|---|---|---|---|'];
for (const o of specOps) {
  for (const c of o.codes) {
    declared++;
    // A generic "any 4xx" check only counts for the declared 400 (bad request); 401/403/404/406/415 need an exact assertion.
    const ids = new Set([...(asserted[o.key] && asserted[o.key][c] ? asserted[o.key][c] : []), ...(c === '400' && asserted[o.key] && asserted[o.key]['4xx'] ? asserted[o.key]['4xx'] : [])]);
    if (ids.size) covered++;
    cov.push(`| \`${o.key}\` | ${c} | ${ids.size ? [...ids].join(', ') : '-'} | ${ids.size ? 'covered' : '**GAP**'} |`);
  }
}
const extra = Object.keys(asserted).filter((k) => !specOps.some((o) => o.key === k) && /^(HEAD|OPTIONS) /.test(k));
cov.splice(4, 0, `**${covered} of ${declared} declared responses (${Math.round((100 * covered) / declared)}%) are asserted by at least one test.** A generic "any 4xx" check counts only for the declared 400; 401, 403, 404, 406, 415 and 304 each need an assertion on that exact code. Operations outside the spec that are also tested: ${extra.length ? extra.map((e) => `\`${e}\``).join(', ') : 'none'}.`, '');
fs.writeFileSync(path.join(ROOT, 'docs', 'api-coverage.md'), cov.join('\n') + '\n');
console.log(`Coverage: ${covered}/${declared} declared responses`);
const cell = (v) => '"' + String(v).replace(/"/g, '""') + '"';
fs.writeFileSync(path.join(ROOT, 'docs', 'test-cases.csv'), '﻿' + [['ID', 'Folder', 'Type', 'Method', 'Endpoint', 'Scenario', 'Assertions', 'Known defect'], ...all.map((r) => [r.id, r.folder, r.type, r.method, r.path, r.title, names(r).join('; '), (r.bugs || []).join(', ')])].map((x) => x.map(cell).join(',')).join('\n') + '\n');

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
