# API-BUG-012: Invalid dates are stored as text such as "0NaN-aN-aN"; decimals are truncated; slash dates are silently reformatted

| Field | Value |
|---|---|
| Severity | Major |
| Priority | High |
| Area | Create booking |
| Endpoint | `POST /booking` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases |  |

## Steps to reproduce
```
POST /booking with each of:
  checkin "2031-13-45"
  totalprice 99.99
  checkin "03/03/2031", checkout "03/05/2031"
```

## Expected
HTTP 400 for the invalid date; the decimal price stored exactly or rejected; non-ISO dates rejected.

## Actual
HTTP 200. The invalid date is stored as "0NaN-aN-aN". 99.99 is stored as 99. "03/03/2031" is stored as 2031-03-03 (read as month/day, which is a guess).

## Impact
Silent data corruption: bad dates and prices are saved and returned as if valid, and a European reading of 03/05 would be wrong.
