# API-BUG-007: XML responses are labelled text/html

| Field | Value |
|---|---|
| Severity | Minor |
| Priority | Low |
| Area | Contract |
| Endpoint | `GET /booking/{id} (Accept: application/xml)` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | RD-08 |

## Steps to reproduce
```
GET /booking/{id}
Accept: application/xml
```

## Expected
Content-Type application/xml.

## Actual
Body is valid XML but Content-Type is text/html.

## Impact
Clients that choose a parser from Content-Type will use the wrong one.
