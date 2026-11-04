# API-BUG-009: Framework disclosed in the X-Powered-By header

| Field | Value |
|---|---|
| Severity | Minor |
| Priority | Low |
| Area | Security |
| Endpoint | `all responses` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | SEC-05 |

## Steps to reproduce
```
GET /booking/1  then inspect response headers
```

## Expected
No X-Powered-By header.

## Actual
X-Powered-By: Express (and Server: Heroku).

## Impact
Helps an attacker target known weaknesses of the named framework.
