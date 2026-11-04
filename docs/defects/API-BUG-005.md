# API-BUG-005: PUT/DELETE on a deleted booking returns 405 instead of 404

| Field | Value |
|---|---|
| Severity | Minor |
| Priority | Low |
| Area | Delete booking |
| Endpoint | `DELETE|PUT /booking/{id}` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | DEL-05, DEL-06 |

## Steps to reproduce
```
DELETE /booking/{id}   (twice)
PUT /booking/{id}      (after delete)
```

## Expected
HTTP 404 Not Found: the resource does not exist.

## Actual
HTTP 405 Method Not Allowed.

## Impact
Misleading: tells the client the method is unsupported, when the real problem is a missing resource. Breaks idempotent-delete handling in clients.
