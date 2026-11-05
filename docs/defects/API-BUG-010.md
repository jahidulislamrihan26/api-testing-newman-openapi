# API-BUG-010: Wrong Content-Type on create causes 500 instead of 415

| Field | Value |
|---|---|
| Severity | Minor |
| Priority | Medium |
| Area | Create booking |
| Endpoint | `POST /booking` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | HTTP-06, HTTP-07 |

## Steps to reproduce
```
POST /booking
Content-Type: application/x-www-form-urlencoded   (also text/plain, or no Content-Type)
firstname=A&lastname=B&totalprice=1&depositpaid=true
```

## Expected
HTTP 415 Unsupported Media Type.

## Actual
HTTP 500 Internal Server Error.

## Impact
A client that forgets the JSON header sees a server fault, not a clear instruction about what to fix.
