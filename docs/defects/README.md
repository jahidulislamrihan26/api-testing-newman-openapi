# API Defects

| ID | Title | Severity | Endpoint |
|---|---|---|---|
| [API-BUG-001](API-BUG-001.md) | Failed login returns 200 OK instead of 401 | Major | `POST /auth` |
| [API-BUG-002](API-BUG-002.md) | Missing, null or wrong-type values cause 500 Internal Server Error | Major | `POST /booking` |
| [API-BUG-003](API-BUG-003.md) | Invalid date in the booking filter causes 500 | Minor | `GET /booking?checkin=...` |
| [API-BUG-004](API-BUG-004.md) | No business-rule validation on booking data | Major | `POST /booking` |
| [API-BUG-005](API-BUG-005.md) | PUT/DELETE on a deleted booking returns 405 instead of 404 | Minor | `DELETE|PUT /booking/{id}` |
| [API-BUG-006](API-BUG-006.md) | Error responses are plain text, not JSON | Minor | `all error responses` |
| [API-BUG-007](API-BUG-007.md) | XML responses are labelled text/html | Minor | `GET /booking/{id} (Accept: application/xml)` |
| [API-BUG-008](API-BUG-008.md) | API is served over plain HTTP with no redirect to HTTPS | Major | `any, over http://` |
| [API-BUG-009](API-BUG-009.md) | Framework disclosed in the X-Powered-By header | Minor | `all responses` |
| [API-BUG-010](API-BUG-010.md) | Wrong Content-Type on create causes 500 instead of 415 | Minor | `POST /booking` |
| [API-BUG-011](API-BUG-011.md) | Unsupported Accept header returns 418 "I'm a Teapot" instead of 406 | Minor | `GET /booking/{id}` |
| [API-BUG-012](API-BUG-012.md) | Invalid dates are stored as text such as "0NaN-aN-aN"; decimals are truncated; slash dates are silently reformatted | Major | `POST /booking` |
| [API-BUG-013](API-BUG-013.md) | Booking ids are read leniently: 1.5, 1abc, +1 and %201 all return booking 1 | Minor | `GET /booking/{id}` |
