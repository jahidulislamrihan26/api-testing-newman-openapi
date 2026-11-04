# API Test Plan: Restful-Booker

Version 1.0, 2026-11-05.

## 1. Objective
Show whether the booking API behaves correctly, safely and consistently for clients: correct data, correct status codes, enforced authorisation, stable contract, and safe handling of bad input.

## 2. System under test
https://restful-booker.herokuapp.com

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/ping` | GET | none | Health check |
| `/auth` | POST | none | Obtain token |
| `/booking` | GET | none | List ids (filters: firstname, lastname, checkin, checkout) |
| `/booking/{id}` | GET | none | Read one booking (JSON or XML) |
| `/booking` | POST | none | Create |
| `/booking/{id}` | PUT, PATCH | token cookie or Basic | Replace or partially update |
| `/booking/{id}` | DELETE | token cookie or Basic | Delete |

There is no OpenAPI file, so expected behaviour was taken from the published documentation and from standard REST and HTTP conventions (RFC 9110). Where the documentation disagrees with convention, the behaviour is recorded as an observation and only treated as a defect if it harms clients or security.

## 3. Test approach
| Type | What is checked | Example cases |
|---|---|---|
| Functional | Each endpoint does its job; data round-trips | CRT-01, RD-05, UPD-02 |
| Contract | JSON Schema of every success response; Content-Type | RD-01, RD-05, RD-10 |
| Negative | Wrong credentials, missing fields, bad JSON, missing ids | AUTH-02, CRT-04..06, RD-06 |
| Boundary | Zero, negative and huge numbers; inverted dates; 10,000-character text | CRT-07..10, DD-01 |
| Authorisation | No token, bad token, empty token, Basic auth; forbidden call changes nothing | UPD-05..08, DEL-01..02, SEC-06 |
| Security | Injection, script payload, error leakage, transport, header disclosure | AUTH-05, SEC-01..05 |
| Data-driven | Same flow over 6 data rows incl. Unicode | DD-01..03 |
| Performance (basic) | Each response under 3 s; avg and p95 recorded | all requests |

Full list: [test-case-matrix.md](test-case-matrix.md).

## 4. Design decisions
- **Independent, self-cleaning data.** The suite creates its own bookings with a unique last name per run and deletes everything at the end, so it is safe on a shared service and repeatable.
- **Tests assert correct behaviour.** For known defects there are two assertions: one documents what the API does today, and a `KNOWN-BUG` assertion states what it should do. The second fails until the defect is fixed.
- **Expected failures do not hide regressions.** The runner passes only if every non-KNOWN-BUG assertion passes. If a KNOWN-BUG assertion starts passing, it is listed so the defect can be closed.
- **Everything generated from one source.** `src/build-collection.js` produces the collection, the matrix, the CSV and the defect pages, so documents never drift from the tests.

## 5. Environment and data
| Item | Value |
|---|---|
| Base URL | `{{baseUrl}}` in `environments/qa.postman_environment.json` |
| Credentials | admin / password123 (published in the API docs) |
| Tools | Postman collection v2.1, Newman 6, htmlextra and JUnit reporters, Node 20+ |
| Test data | Generated per run (`QA<timestamp>` last name) and `data/bookings.json` |

## 6. Entry and exit criteria
- **Entry:** API reachable (`/ping` returns 201), credentials valid.
- **Exit:** all functional, contract and authorisation assertions pass; every defect has a linked test and a written report; no data left behind.
- **Pass rule for CI:** zero unexpected failures.

## 7. Risks
| Risk | Mitigation |
|---|---|
| Shared public API may be slow, down or reset | Timeouts set; own data; smoke subset available |
| Heroku cold start inflates first response time | 3 s threshold, runner records p95 instead of failing on one slow call |
| Other users create data at the same time | Unique last name per run for filter tests |
| Behaviour changes upstream | Failures show up as unexpected failures or as "known bug now passing" |

## 8. Out of scope
Load and stress testing (see the `performance-testing` project), UI behaviour, rate limiting, long-term token expiry (cannot be observed in a short run).
