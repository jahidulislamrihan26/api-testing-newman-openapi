# Mutation testing report

A test suite that passes proves little unless it would fail when the application is wrong. This report measures exactly that.

**Method.** `reference-server/` is a small server written from `spec/openapi.yaml` that behaves as the specification says. The whole suite passes against it (186 assertions, 0 unexpected failures). Each row below turns on **one** deliberate fault in that server, then runs the whole suite. A fault is *killed* if the suite fails, and *survives* if the suite stays green (a gap in the tests).

**Result: 20 of 20 injected faults killed (100%).**

| # | Injected fault | Result | First test to catch it |
|---|---|---|---|
| 1 | JSON responses sent as text/plain | Killed | AUTH-01 Login with valid admin credentials returns a token: Content-Type is application/json |
| 2 | Leaks the X-Powered-By framework header | Killed | SEC-05 Responses do not disclose the server framework: KNOWN-BUG API-BUG-009: X-Powered-By header should be absent |
| 3 | Any request is treated as authorised | Killed | UPD-05 PUT without credentials is forbidden: Status code is 403 |
| 4 | Failed login answers 200 instead of 401 | Killed | AUTH-02 Login with wrong password is rejected: KNOWN-BUG API-BUG-001: status should be 401 for bad credentials |
| 5 | The lastname search filter is ignored | Killed | RD-04 Filter with no match returns an empty list: Body is an empty array |
| 6 | A null first name crashes the server (500) | Killed | VAL-01 Invalid or unusual booking body: {{name}}: KNOWN-BUG API-BUG-002: null first name is rejected with a 4xx status |
| 7 | Negative prices are accepted | Killed | CRT-07 Negative total price is rejected: KNOWN-BUG API-BUG-004: negative price should be rejected with 400 |
| 8 | First name is stored in upper case | Killed | SEC-02 Script payload is stored and returned as inert JSON text: Value returned unchanged inside JSON |
| 9 | Decimal prices are truncated (99.99 becomes 99) | Killed | VAL-01 Invalid or unusual booking body: {{name}}: KNOWN-BUG API-BUG-012: decimal total price 99.99 is rejected or stored exactly as sent |
| 10 | Created bookings are never saved | Killed | RD-02 Filter by lastname finds the new booking: Result contains the booking created in CRT-01 |
| 11 | Create answers 201 instead of the documented 200 | Killed | CRT-01 Create a booking with valid data: Status code is 200 |
| 12 | An id such as 12abc is read as 12 | Killed | HTTP-11 Fractional booking id (12.5) returns 404, not booking 12: KNOWN-BUG API-BUG-013: id with a fractional part should be 404, not the booking with the whole-number id |
| 13 | An unknown id answers 200 with an empty body | Killed | RD-06 Get a non-existent booking returns 404: Status code is 404 |
| 14 | The booking response omits bookingdates | Killed | RD-05 Get booking by id returns the stored booking: Response matches booking schema |
| 15 | No ETag header, so conditional requests never return 304 | Killed | HTTP-01 HEAD returns the headers and no body: ETag header is present |
| 16 | PUT works without credentials | Killed | UPD-05 PUT without credentials is forbidden: Status code is 403 |
| 17 | DELETE answers success but deletes nothing | Killed | DEL-04 Deleted booking can no longer be read: Status code is 404 |
| 18 | DELETE answers 200 instead of 201 | Killed | DEL-03 DELETE with a token removes the booking: Status code is 201 |
| 19 | PUT accepts a partial body (should require all fields) | Killed | HTTP-18 PUT with missing required fields is rejected with 400: Status code is 400 |
| 20 | PATCH replaces the booking instead of merging | Killed | UPD-04 PATCH changes only the supplied field: Only firstname changed |

## Reproduce
```bash
npm run mutation
```
About 10 minutes. It starts the reference server once per fault on local ports and needs no internet.
