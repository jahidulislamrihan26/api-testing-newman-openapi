# API-BUG-006: Error responses are plain text, not JSON

| Field | Value |
|---|---|
| Severity | Minor |
| Priority | Low |
| Area | Contract |
| Endpoint | `all error responses` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | RD-10 |

## Steps to reproduce
```
GET /booking/99999999   (Accept: application/json)
```

## Expected
Content-Type application/json and a structured error body.

## Actual
Content-Type text/plain with body "Not Found".

## Impact
Clients that parse every response as JSON throw on errors; no machine-readable error code.
