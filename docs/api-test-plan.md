# API Test Plan: Restful-Booker

Version 2.0, 2026-11-05.

## 1. Objective
Show whether the booking API behaves correctly, safely and consistently for clients: correct data, correct status codes, enforced authorisation, a stable contract, and safe handling of bad input.

## 2. System under test
https://restful-booker.herokuapp.com

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/ping` | GET | none | Health check |
| `/auth` | POST | none | Obtain token |
| `/booking` | GET | none | List ids (filters: firstname, lastname, checkin, checkout) |
| `/booking/{id}` | GET, HEAD, OPTIONS | none | Read one booking (JSON or XML), headers, allowed methods |
| `/booking` | POST | none | Create |
| `/booking/{id}` | PUT, PATCH | token cookie or Basic | Replace or partially update |
| `/booking/{id}` | DELETE | token cookie or Basic | Delete |

The API ships **no specification**, so one was written: [spec/openapi.yaml](../spec/openapi.yaml). Expected behaviour comes from the published documentation, from observed behaviour and from HTTP conventions (RFC 9110). The spec describes the *correct* behaviour and notes each live deviation with its defect id. Where the documentation disagrees with convention and clients are not harmed, the behaviour is recorded as an observation and asserted as observed (for example, the check-in filter is strictly "later than").

## 3. Test approach
| Type | What is checked | Example cases |
|---|---|---|
| Functional | Each endpoint does its job; data round-trips | CRT-01, RD-05, UPD-02 |
| Contract | JSON Schema from the spec for every success response; Content-Type; ETag; 304; OPTIONS | RD-01, RD-05, HTTP-02..05 |
| Negative | Wrong credentials, missing fields, bad JSON, missing ids, wrong Content-Type and Accept | AUTH-02, CRT-04..06, HTTP-06..08 |
| Boundary | Zero, negative and huge numbers; odd ids; inverted dates; 10,000-character text; filter edges | CRT-07..10, HTTP-09..12, RD-12 |
| Validation matrix | 14 invalid or unusual bodies, one request, many rows | VAL-01 |
| Authorisation | No token, bad token, empty token, Basic auth, Bearer; a forbidden call changes nothing | UPD-05..08, DEL-01..02, SEC-06 |
| Security | Injection, script payload, mass assignment, error leakage, transport, header disclosure | AUTH-05, SEC-01..05, HTTP-16..17 |
| Data-driven | Create, read back and delete over 6 data rows incl. Unicode | DD-01..03 |
| Performance (basic) | Each response under 3 s; average and p95 recorded | all requests |

Full list: [test-case-matrix.md](test-case-matrix.md). Coverage of the spec: [api-coverage.md](api-coverage.md).

## 4. Design decisions
- **Spec-driven.** The collection builder reads schemas from `spec/openapi.yaml`; a validator (`npm run lint:spec`, also run before every test run and in CI) rejects a broken spec; the coverage report compares documented responses with asserted status codes.
- **Honest coverage.** A generic "any 4xx" assertion only counts for the documented 400. 401, 403, 404, 406, 415 and 304 each need an assertion on that exact code. This exposed a real gap (406 on create) that was then closed.
- **Independent, self-cleaning data.** Each run creates its own bookings with a unique last name and deletes everything at the end, so it is safe on a shared service and repeatable. No test relies on bookings other people may delete (an early version did and was fixed).
- **Tests assert correct behaviour.** For known defects there are two assertions: one documents what the API does today, and a `KNOWN-BUG` assertion states what it should do. The second fails until the defect is fixed.
- **Expected failures do not hide regressions.** The runner passes only if every non-KNOWN-BUG assertion passes. If a KNOWN-BUG assertion starts passing, it is listed so the defect can be closed.
- **Everything generated from definitions.** `src/build-collection.js` produces the collection, the matrix, the CSV, the coverage report and the defect pages, so documents never drift from the tests.
- **Test-runner traps handled.** Newman adds `Cache-Control: no-cache` by default, which disables conditional requests; the 304 test overrides it.

## 5. Environment and data
| Item | Value |
|---|---|
| Base URL | `{{baseUrl}}` in `environments/qa.postman_environment.json` |
| Credentials | admin / password123 (published in the API docs) |
| Tools | Postman collection v2.1, Newman 6, htmlextra and JUnit reporters, OpenAPI 3 validator, Node 20+ |
| Test data | Generated per run (`QA<timestamp>` last name), `data/bookings.json`, `data/invalid-bookings.json` |

## 6. Entry and exit criteria
- **Entry:** API reachable (`/ping` returns 201), credentials valid, spec valid.
- **Exit:** all functional, contract and authorisation assertions pass; every defect has a linked test and a written report; every documented response is asserted; no data left behind.
- **Pass rule for CI:** zero unexpected failures.

## 7. Risks
| Risk | Mitigation |
|---|---|
| Shared public API may be slow, down or reset | Timeouts set; own data; smoke subset available |
| Heroku cold start inflates first response time | 3 s threshold, runner records p95 instead of failing on one slow call |
| Other users change or delete data at the same time | Unique last name per run; tests use only their own bookings |
| Behaviour changes upstream | Failures show up as unexpected failures or as "known bug now passing" |

## 8. Out of scope
Load and stress testing (see the `performance-testing` project), UI behaviour, rate limiting, long-term token expiry (cannot be observed in a short run), concurrency races.
