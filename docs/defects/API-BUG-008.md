# API-BUG-008: API is served over plain HTTP with no redirect to HTTPS

| Field | Value |
|---|---|
| Severity | Major |
| Priority | High |
| Area | Security |
| Endpoint | `any, over http://` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | SEC-04 |

## Steps to reproduce
```
GET http://restful-booker.herokuapp.com/ping   (redirects disabled)
```

## Expected
HTTP 301/308 redirect to https://, or the connection refused.

## Actual
HTTP 201 served directly over HTTP.

## Impact
Login tokens, the Basic-auth header and booking data can travel unencrypted and be intercepted.
