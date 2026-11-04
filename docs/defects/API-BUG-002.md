# API-BUG-002: Missing required fields cause 500 Internal Server Error

| Field | Value |
|---|---|
| Severity | Major |
| Priority | High |
| Area | Create booking |
| Endpoint | `POST /booking` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | CRT-05, CRT-06 |

## Steps to reproduce
```
POST /booking
{"firstname":"OnlyName"}      (also: {})
```

## Expected
HTTP 400 or 422 with a message naming the missing fields.

## Actual
HTTP 500 Internal Server Error, plain text body.

## Impact
Invalid client input looks like a server fault: false alerts, no actionable message for the caller, and an unhandled exception path in the server.
