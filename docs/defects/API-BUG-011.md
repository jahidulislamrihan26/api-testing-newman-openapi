# API-BUG-011: Unsupported Accept header returns 418 "I'm a Teapot" instead of 406

| Field | Value |
|---|---|
| Severity | Minor |
| Priority | Low |
| Area | Contract |
| Endpoint | `GET /booking/{id}` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | HTTP-08, HTTP-20 |

## Steps to reproduce
```
GET /booking/{id}
Accept: image/png   (also text/html)
```

## Expected
HTTP 406 Not Acceptable.

## Actual
HTTP 418 I'm a Teapot, plain text body.

## Impact
A joke status code in a production API confuses clients, monitoring and anyone reading logs.
