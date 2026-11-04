# API Testing Project: Restful-Booker

Automated API test suite for the public [Restful-Booker](https://restful-booker.herokuapp.com) hotel-booking API (token and Basic auth, full create/read/update/delete). Built as a Postman collection and run headlessly with Newman, so it works in the Postman app and in CI.

## Result in one look
| | |
|---|---|
| Requests | **49** across 7 folders (health, auth, create, read, update, delete, security, data-driven) |
| Assertions executed | **133** (117 pass, 16 expected failures, **0 unexpected**) |
| Defects found | **9** (4 Major, 5 Minor), each with a failing test that proves it |
| Test types | Functional, negative, boundary, contract (JSON Schema), security, data-driven |
| Speed | avg 264 ms, p95 324 ms per request |
| Hygiene | Every booking the suite creates is deleted afterwards (14 of 14 cleaned up) |

## Highlights
- **Contract tests:** responses are validated against JSON Schemas, not just status codes.
- **Chained flow:** token from `/auth` is reused; the booking created in CRT-01 is read, updated, patched and deleted by later tests.
- **Auth coverage:** token cookie, Basic auth, no credentials, invalid token and empty token.
- **Data-driven:** 6 data rows (Unicode names, apostrophe, zero price, large price) run create, read-back and delete.
- **Security checks:** SQL injection (login and filter), script payload, stack-trace leakage, plain HTTP, framework disclosure header.
- **Known-bug handling:** tests named `KNOWN-BUG` assert the *correct* behaviour and fail today because of a real defect. The runner treats them as expected, so CI stays green but only for known problems. A new failure turns CI red, and a known bug that gets fixed is reported so it can be closed.

## Documents
| Document | What it is |
|---|---|
| [docs/api-test-plan.md](docs/api-test-plan.md) | Strategy, scope, approach, risks, exit criteria |
| [docs/test-case-matrix.md](docs/test-case-matrix.md) | Every test case, assertion and linked defect (also as [CSV](docs/test-cases.csv)) |
| [docs/defects/](docs/defects/README.md) | 9 defect reports with request, expected, actual and impact |
| [docs/test-summary-report.md](docs/test-summary-report.md) | Results, findings, recommendations |
| [reports/functional-report.html](reports/functional-report.html) | Interactive HTML report from the last run (download and open) |

## Run it
```bash
npm install
npm test            # full suite, writes reports/
npm run test:smoke  # health and auth only
npm run build       # regenerate collection and docs after editing src/
```
You can also import `collections/restful-booker.postman_collection.json` and `environments/qa.postman_environment.json` into Postman.

## Layout
```
collections/   Postman collection (generated)
environments/  base URL and credentials
data/          data-driven rows
src/           build-collection.js (test definitions), defects.js, run-tests.js (runner)
docs/          plan, matrix, summary, defects
reports/       HTML, JUnit and JSON results of the last run
```

## Notes
- The test credentials are the ones published in the API's own documentation. For a real system keep secrets in CI secrets, never in the repo.
- The API is a shared public service that resets periodically. The suite creates its own data and does not depend on existing bookings.
