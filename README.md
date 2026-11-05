# API Testing: Restful-Booker with OpenAPI

[![CI](https://github.com/jahidulislamrihan26/api-testing-newman-openapi/actions/workflows/ci.yml/badge.svg)](https://github.com/jahidulislamrihan26/api-testing-newman-openapi/actions/workflows/ci.yml) Part of the [SQA portfolio](https://github.com/jahidulislamrihan26/sqa-portfolio).

Automated, **specification-driven** test suite for the public [Restful-Booker](https://restful-booker.herokuapp.com) hotel-booking API (token and Basic auth, full create/read/update/delete). It is a Postman collection run headlessly with Newman, so it works in the Postman app and in CI.

## Result in one look
| | |
|---|---|
| API specification | **OpenAPI 3.0 file written for the API** ([spec/openapi.yaml](spec/openapi.yaml)), validated in CI; the test schemas are read from it |
| Requests | **74** in 9 folders (health, auth, create, read, update, HTTP behaviour, delete, security, 2 data-driven sets) |
| Assertions in a run | **186**: 151 pass, 35 expected failures (each one a documented defect), **0 unexpected** |
| Response coverage | **23 of 23** documented responses asserted ([coverage report](docs/api-coverage.md)) |
| Defects found | **13** (5 Major, 8 Minor), each with a failing test that proves it |
| Test types | Functional, negative, boundary, contract (JSON Schema from the spec), authorisation, security, HTTP semantics, data-driven |
| Would it catch a regression? | **Yes, proven: 20 of 20 deliberately injected faults caught** ([mutation report](docs/mutation-report.md)). The suite also passes 100% against a spec-correct [reference server](reference-server/server.js) |
| Stability | Three consecutive runs gave identical results on the shared public API |
| Hygiene | Every booking the suite creates is deleted afterwards (23 of 23); secrets are redacted from reports |

## Highlights
- **Spec-driven.** `spec/openapi.yaml` documents every operation and response. The collection builder reads its schemas from the spec, a linter validates the spec, and a [coverage report](docs/api-coverage.md) compares the documented responses with the status codes the tests assert. A generic "any 4xx" check only counts for 400, so 401, 403, 404, 406, 415 and 304 each need their own assertion.
- **Validation matrix.** One request runs 14 invalid or unusual bodies from [data/invalid-bookings.json](data/invalid-bookings.json) (null, wrong type, bad dates, decimals, Unicode and more). The rule: reject with 4xx, or store exactly what was sent, never silently change it. It found data being corrupted, for example an invalid date stored as `0NaN-aN-aN` and `99.99` saved as `99`.
- **HTTP behaviour.** HEAD, OPTIONS, ETag and conditional GET (304), wrong Content-Type (415), wrong Accept (406), idempotent PUT, mass-assignment and odd ids.
- **Contract tests.** Responses are validated against JSON Schemas, not just status codes.
- **Auth coverage.** Token cookie, Basic auth, no credentials, invalid, empty, and Bearer tokens.
- **Chained flow.** The token from `/auth` is reused, and the booking created in CRT-01 is read, updated, patched and deleted by later tests.
- **Known-bug handling.** Tests named `KNOWN-BUG` assert the *correct* behaviour and fail today because of a real defect. The runner treats them as expected, so CI stays green only for known problems. A new failure turns CI red, and a known bug that gets fixed is reported so it can be closed.
- **Mutation tested.** A passing suite proves little unless it fails when the API is wrong. `reference-server/` implements the spec correctly (the suite passes on it, so no test is wrong about the spec). Twenty faults are then switched on one at a time, such as a missing auth check, truncated decimals, a 200 for an unknown id, or PATCH replacing instead of merging. Every one makes the suite fail, and the report names the first test that noticed. Runs offline in CI.
- **Safe on a shared service.** Own data per run, unique names, cleanup of everything created, and no test depends on bookings other users may delete.

## Documents
| Document | What it is |
|---|---|
| [spec/openapi.yaml](spec/openapi.yaml) | OpenAPI 3 specification of the API as tested, with each live deviation noted |
| [docs/api-test-plan.md](docs/api-test-plan.md) | Strategy, scope, approach, risks, exit criteria |
| [docs/mutation-report.md](docs/mutation-report.md) | 20 injected faults and the test that caught each |
| [docs/api-coverage.md](docs/api-coverage.md) | Documented responses vs tests that assert them |
| [docs/test-case-matrix.md](docs/test-case-matrix.md) | Every test case, assertion and linked defect (also as [CSV](docs/test-cases.csv)), plus the validation rows |
| [docs/defects/](docs/defects/README.md) | 13 defect reports with request, expected, actual and impact |
| [docs/test-summary-report.md](docs/test-summary-report.md) | Results, findings, recommendations |
| [Live HTML report](https://jahidulislamrihan26.github.io/api-testing-newman-openapi/functional-report.html) | Interactive report from the latest CI run; also [validation matrix](https://jahidulislamrihan26.github.io/api-testing-newman-openapi/validation-report.html) and [data-driven run](https://jahidulislamrihan26.github.io/api-testing-newman-openapi/data-driven-report.html) |

## Run it
```bash
npm install
npm test            # validates the spec, runs everything, writes reports/
npm run test:smoke  # health and auth only
npm run lint:spec   # validate the OpenAPI file only
npm run mutation    # inject 20 faults into the local reference server, check the suite catches each (about 10 minutes, offline)
npm run reference   # start the reference server on :3222; then BASE_URL=http://localhost:3222 BASE_URL_HTTP=http://localhost:3223 npm test
npm run build       # regenerate collection, matrix, coverage and defect pages after editing src/ or spec/
```
You can also import `collections/restful-booker.postman_collection.json` and `environments/qa.postman_environment.json` into Postman.

## Layout
```
spec/          openapi.yaml (source of truth for schemas and coverage)
collections/   Postman collection (generated)
environments/  base URL and credentials
data/          data-driven rows (bookings.json, invalid-bookings.json)
reference-server/  spec-correct server with switchable faults (for mutation testing)
src/           mutation.js, build-collection.js (test definitions), defects.js, run-tests.js (runner), lint-spec.js
docs/          plan, coverage, matrix, summary, defects
reports/       HTML, JUnit and JSON results (generated by each run, not committed; the latest are on the live site)
```

## Dependency security
`npm audit` reports 11 advisories (0 critical, 2 high, 9 moderate), all inside Newman's own dependencies, and CI fails on any critical one. Seven vulnerable packages that had a patched release inside the same major version are pinned to it with `overrides` in `package.json` (this took the count from 21 with 1 critical to 11 with none), and the suite passes unchanged. The rest (`@faker-js/faker`, `csv-parse`, `uuid` and the packages that use them) are only fixed in newer major versions that Newman cannot load: forcing faker 10 was tested and makes Newman crash. They matter only with untrusted input this suite never uses (CSV data files, random-data variables), and Dependabot watches for an upstream fix.

## Notes
- The test credentials are the ones published in the API's own documentation. For a real system keep secrets in CI secrets, never in the repo.
- The runner **redacts** the session token, the password and the Basic-auth value from every generated report before it is saved, because reports get committed and published.
- A run executes more assertions (186) than the matrix lists (137 fixed ones): the 3 data-driven requests run once for each of the 6 bookings rows, and the validation request runs once for each of its 14 rows (see the note at the top of the matrix).
- The API is a shared public service that resets periodically. The suite creates its own data and does not depend on existing bookings.

## Related projects
- [manual-testing-saucedemo](https://github.com/jahidulislamrihan26/manual-testing-saucedemo): manual testing package with strategy, cases and defect reports.
- [playwright-ui-automation-pom](https://github.com/jahidulislamrihan26/playwright-ui-automation-pom): UI automation with the same expected-failure approach for known defects.
- [k6-performance-testing](https://github.com/jahidulislamrihan26/k6-performance-testing): performance testing.
- [qa-templates](https://github.com/jahidulislamrihan26/qa-templates): reusable test plan and report templates.
