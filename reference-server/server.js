// A reference implementation of the Restful-Booker API, written from spec/openapi.yaml.
// It behaves the way the specification says the API SHOULD behave (correct status codes, validation, JSON errors,
// no framework header). Two uses:
//   1. The whole test suite must pass against it. A test that fails on a correct implementation is a bad test.
//   2. Mutation testing: FAULT=<name> switches on one deliberate defect, and the suite must fail (see src/mutation.js).
// Plain Node, no dependencies, in-memory data.
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3222);
const FAULT = process.env.FAULT || '';
const f = (name) => FAULT === name;
const USER = 'admin';
const PASS = 'password123';

const bookings = new Map();
const tokens = new Set();
let nextId = 1000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s) => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

function seed() {
  const sample = [['Eric', 'Smith', 183, false, '2024-01-10', '2024-01-12'], ['Mary', 'Jones', 250, true, '2024-02-01', '2024-02-05'], ['Li', 'Wang', 99, true, '2024-03-15', '2024-03-16']];
  for (const [firstname, lastname, totalprice, depositpaid, checkin, checkout] of sample) {
    bookings.set(nextId++, { firstname, lastname, totalprice, depositpaid, bookingdates: { checkin, checkout }, additionalneeds: 'Breakfast' });
  }
}
seed();

// ---------------------------------------------------------------- helpers
const xmlEscape = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const toXml = (b) => `<?xml version='1.0'?>\n<booking>\n  <firstname>${xmlEscape(b.firstname)}</firstname>\n  <lastname>${xmlEscape(b.lastname)}</lastname>\n  <totalprice>${b.totalprice}</totalprice>\n  <depositpaid>${b.depositpaid}</depositpaid>\n  <bookingdates>\n    <checkin>${b.bookingdates.checkin}</checkin>\n    <checkout>${b.bookingdates.checkout}</checkout>\n  </bookingdates>${b.additionalneeds === undefined ? '' : `\n  <additionalneeds>${xmlEscape(b.additionalneeds)}</additionalneeds>`}\n</booking>`;
const JSON_CT = () => (f('wrong-content-type') ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8');
const baseHeaders = () => (f('x-powered-by') ? { 'X-Powered-By': 'Express' } : {});

function send(res, code, body, ct, extra = {}) {
  const payload = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, { ...baseHeaders(), 'Content-Type': ct || JSON_CT(), 'Content-Length': Buffer.byteLength(payload), ...extra });
  res.end(res.req.method === 'HEAD' ? '' : payload);
}
const err = (res, code, message) => send(res, code, { error: message });
const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => resolve(d)); });

function authorised(req) {
  if (f('token-any')) return true;
  const cookie = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('token='));
  if (cookie && tokens.has(cookie.slice(6))) return true;
  const a = req.headers.authorization || '';
  if (a.startsWith('Basic ')) return Buffer.from(a.slice(6), 'base64').toString() === `${USER}:${PASS}`;
  return false;
}

function validateBooking(b, partial) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'body must be a JSON object';
  const need = (k) => !partial || k in b;
  if (need('firstname') && (typeof b.firstname !== 'string' || b.firstname.trim() === '' || b.firstname.length > 255)) return 'firstname must be a non-empty string up to 255 characters';
  if (need('lastname') && (typeof b.lastname !== 'string' || b.lastname.trim() === '' || b.lastname.length > 255)) return 'lastname must be a non-empty string up to 255 characters';
  if (need('totalprice')) {
    if (typeof b.totalprice !== 'number' || !Number.isFinite(b.totalprice)) return 'totalprice must be a number';
    if (b.totalprice < 0 && !f('no-price-validation')) return 'totalprice must not be negative';
  }
  if (need('depositpaid') && typeof b.depositpaid !== 'boolean') return 'depositpaid must be true or false';
  if (need('bookingdates')) {
    const d = b.bookingdates;
    if (!d || typeof d !== 'object' || !validDate(d.checkin) || !validDate(d.checkout)) return 'bookingdates needs real checkin and checkout dates as YYYY-MM-DD';
    if (d.checkout < d.checkin) return 'checkout must not be before checkin';
  }
  if ('additionalneeds' in b && typeof b.additionalneeds !== 'string') return 'additionalneeds must be a string';
  return null;
}
const pickBooking = (b) => {
  const out = { firstname: b.firstname, lastname: b.lastname, totalprice: b.totalprice, depositpaid: b.depositpaid, bookingdates: { checkin: b.bookingdates.checkin, checkout: b.bookingdates.checkout } };
  if (b.additionalneeds !== undefined) out.additionalneeds = b.additionalneeds;
  return out;
};

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.toLowerCase(); // paths are matched case-insensitively (as the live API does)
  const method = req.method;
  const ctype = (req.headers['content-type'] || '').toLowerCase();
  const accept = (req.headers.accept || '*/*').toLowerCase();

  if (method === 'GET' && p === '/ping') return send(res, 201, 'Created', 'text/plain; charset=utf-8');

  if (method === 'POST' && p === '/auth') {
    if (!ctype.includes('application/json')) return err(res, 415, 'Content-Type must be application/json');
    let b; try { b = JSON.parse(await readBody(req)); } catch { return err(res, 400, 'invalid JSON'); }
    if (!b || typeof b.username !== 'string' || typeof b.password !== 'string') {
      return f('auth-bad-200') ? send(res, 200, { reason: 'Bad credentials' }) : err(res, 400, 'username and password are required');
    }
    if (b.username === USER && b.password === PASS) { const t = crypto.randomBytes(8).toString('hex'); tokens.add(t); return send(res, 200, { token: t }); }
    return f('auth-bad-200') ? send(res, 200, { reason: 'Bad credentials' }) : err(res, 401, 'bad credentials');
  }

  if (method === 'GET' && (p === '/booking' || p === '/booking/')) {
    const { searchParams: q } = url;
    for (const k of ['checkin', 'checkout']) if (q.has(k) && !validDate(q.get(k))) return err(res, 400, `${k} must be YYYY-MM-DD`);
    const ids = [...bookings.entries()].filter(([, b]) => {
      if (q.has('firstname') && b.firstname !== q.get('firstname')) return false;
      if (q.has('lastname') && !f('filter-ignored') && b.lastname !== q.get('lastname')) return false;
      if (q.has('checkin') && !(b.bookingdates.checkin > q.get('checkin'))) return false; // strictly later than
      if (q.has('checkout') && !(b.bookingdates.checkout < q.get('checkout'))) return false;
      return true;
    }).map(([id]) => ({ bookingid: id }));
    return send(res, 200, ids);
  }

  if (method === 'POST' && p === '/booking') {
    if (!ctype.includes('application/json')) return err(res, 415, 'Content-Type must be application/json');
    if (!/json|\*\/\*|xml/.test(accept)) return err(res, 406, 'only JSON is offered');
    let b; try { b = JSON.parse(await readBody(req)); } catch { return err(res, 400, 'invalid JSON'); }
    if (f('error-500-on-null') && b && b.firstname === null) return err(res, 500, 'internal error');
    const problem = validateBooking(b, false);
    if (problem) return err(res, 400, problem);
    const rec = pickBooking(b);
    if (f('wrong-name-stored')) rec.firstname = rec.firstname.toUpperCase();
    if (f('truncates-decimals')) rec.totalprice = Math.trunc(rec.totalprice);
    const id = nextId++;
    if (!f('not-persisted')) bookings.set(id, rec);
    return send(res, f('create-201') ? 201 : 200, { bookingid: id, booking: rec });
  }

  const m = p.match(/^\/booking\/([^/]+)$/);
  if (m) {
    const raw = m[1];
    const idOk = f('lenient-id') ? /^\d/.test(raw) : /^\d+$/.test(raw);
    const id = idOk ? parseInt(raw, 10) : NaN;

    if (method === 'OPTIONS') return send(res, 200, undefined, 'text/plain; charset=utf-8', { Allow: 'GET, HEAD, PUT, PATCH, DELETE, OPTIONS' });

    if (method === 'GET' || method === 'HEAD') {
      const b = Number.isInteger(id) && id >= 1 ? bookings.get(id) : undefined;
      if (!b) return f('get-missing-200') ? send(res, 200, {}) : err(res, 404, 'booking not found');
      if (!/json|\*\/\*|xml/.test(accept)) return err(res, 406, 'offered types: application/json, application/xml');
      const shown = f('schema-missing-dates') ? { ...b, bookingdates: undefined } : b;
      const wantsXml = accept.includes('xml') && !accept.includes('json') && !accept.includes('*/*');
      const body = wantsXml ? toXml(b) : JSON.stringify(shown);
      const tag = `W/"${Buffer.byteLength(body).toString(16)}-${crypto.createHash('sha1').update(body).digest('base64').slice(0, 27)}"`;
      const extra = f('no-etag') ? {} : { ETag: tag };
      if (!f('no-etag') && req.headers['if-none-match'] === tag && !/no-cache/.test(req.headers['cache-control'] || '')) { res.writeHead(304, { ...baseHeaders(), ETag: tag }); return res.end(); }
      return send(res, 200, body, wantsXml ? 'application/xml; charset=utf-8' : JSON_CT(), extra);
    }

    if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      if (!(f('put-no-auth') && method === 'PUT') && !authorised(req)) return err(res, 403, 'forbidden');
      const b = Number.isInteger(id) && id >= 1 ? bookings.get(id) : undefined;
      if (!b) return err(res, 404, 'booking not found');
      if (method === 'DELETE') {
        if (!f('delete-noop')) bookings.delete(id);
        return f('delete-200') ? send(res, 200, 'OK', 'text/plain; charset=utf-8') : send(res, 201, 'Created', 'text/plain; charset=utf-8');
      }
      if (!ctype.includes('application/json')) return err(res, 415, 'Content-Type must be application/json');
      let body; try { body = JSON.parse(await readBody(req)); } catch { return err(res, 400, 'invalid JSON'); }
      if (method === 'PUT') {
        if (!f('put-partial-accepted')) { const problem = validateBooking(body, false); if (problem) return err(res, 400, problem); }
        const updated = f('put-partial-accepted') ? { ...pickBooking({ ...b, ...body }) } : pickBooking(body);
        bookings.set(id, updated);
        return send(res, 200, updated);
      }
      const problem = validateBooking(body, true);
      if (problem) return err(res, 400, problem);
      let merged;
      if (f('patch-replaces')) { merged = { firstname: body.firstname ?? '', lastname: body.lastname ?? '', totalprice: body.totalprice ?? 0, depositpaid: body.depositpaid ?? false, bookingdates: body.bookingdates ?? { checkin: '1970-01-01', checkout: '1970-01-02' } }; if (b.additionalneeds !== undefined && body.additionalneeds !== undefined) merged.additionalneeds = body.additionalneeds; }
      else merged = pickBooking({ ...b, ...Object.fromEntries(Object.entries(body).filter(([k]) => ['firstname', 'lastname', 'totalprice', 'depositpaid', 'bookingdates', 'additionalneeds'].includes(k))) });
      bookings.set(id, merged);
      return send(res, 200, merged);
    }
  }

  return err(res, 404, 'not found');
});

server.listen(PORT, () => console.log(`Reference server on :${PORT}${FAULT ? ` with injected fault "${FAULT}"` : ''}`));

// A second listener answers every request with a redirect to HTTPS, like a production edge would.
const REDIRECT_PORT = Number(process.env.REDIRECT_PORT || PORT + 1);
http.createServer((req, res) => { res.writeHead(308, { Location: `https://localhost:${PORT}${req.url}` }); res.end(); }).listen(REDIRECT_PORT);
