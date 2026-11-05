# API-BUG-004: No business-rule validation on booking data

| Field | Value |
|---|---|
| Severity | Major |
| Priority | High |
| Area | Create booking |
| Endpoint | `POST /booking` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | CRT-07, CRT-08, CRT-09, CRT-10, HTTP-19 |

## Steps to reproduce
```
POST /booking with each of:
  totalprice: -5
  totalprice: "abc"
  checkin 2026-12-10, checkout 2026-12-01
  firstname of 10,000 characters
  firstname "" or "   "
  depositpaid: "yes"
and PATCH /booking/{id} with {"totalprice":"abc"}
```

## Expected
HTTP 400 for each invalid value.

## Actual
HTTP 200 for all of them. The negative price and inverted dates are stored; the string price is silently stored as null (also through PATCH); empty and whitespace-only names are stored as empty; the text "yes" is silently turned into true.

## Impact
Corrupt data enters the system: negative or null prices, impossible stays, and unbounded field sizes (storage and denial-of-service risk).
