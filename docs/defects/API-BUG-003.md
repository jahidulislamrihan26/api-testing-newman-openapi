# API-BUG-003: Invalid date in the booking filter causes 500

| Field | Value |
|---|---|
| Severity | Minor |
| Priority | Medium |
| Area | Read booking |
| Endpoint | `GET /booking?checkin=...` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | RD-09 |

## Steps to reproduce
```
GET /booking?checkin=not-a-date
```

## Expected
HTTP 400 Bad Request with a message about the date format.

## Actual
HTTP 500 Internal Server Error.

## Impact
Any user-supplied query string can trigger a server error; easy to abuse for noise or probing.
