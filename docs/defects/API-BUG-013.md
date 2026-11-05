# API-BUG-013: Booking ids are read leniently: 1.5, 1abc, +1 and %201 all return booking 1

| Field | Value |
|---|---|
| Severity | Minor |
| Priority | Medium |
| Area | Read booking |
| Endpoint | `GET /booking/{id}` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | HTTP-11, HTTP-11B |

## Steps to reproduce
```
GET /booking/1
GET /booking/1.5
GET /booking/1abc
GET /booking/+1
GET /booking/%201
```

## Expected
Only the exact id 1 returns booking 1; the others return 404 (or 400).

## Actual
All five return HTTP 200 with the data of booking 1, so one resource answers on many different addresses.

## Impact
Several URLs for one resource break caching and URL-based access rules, and make logs and monitoring ambiguous. A rule written for "/booking/1" can be bypassed with "/booking/1abc".
