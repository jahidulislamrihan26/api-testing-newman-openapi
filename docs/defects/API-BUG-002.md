# API-BUG-002: Missing, null or wrong-type values cause 500 Internal Server Error

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
POST /booking with each of:
  {"firstname":"OnlyName"}   and   {}
  firstname null, firstname 123
  depositpaid null, totalprice null
  bookingdates missing, bookingdates {}
```

## Expected
HTTP 400 or 422 with a message naming the problem field.

## Actual
HTTP 500 Internal Server Error, plain text body, for every one of these. A PUT with missing fields correctly returns 400, so POST and PUT are inconsistent.

## Impact
Invalid client input looks like a server fault: false alerts, no actionable message for the caller, and an unhandled exception path in the server.
