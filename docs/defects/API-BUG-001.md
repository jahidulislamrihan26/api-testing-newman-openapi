# API-BUG-001: Failed login returns 200 OK instead of 401

| Field | Value |
|---|---|
| Severity | Major |
| Priority | High |
| Area | Authentication |
| Endpoint | `POST /auth` |
| Status | Open |
| Found | 2026-11-05 against https://restful-booker.herokuapp.com |
| Failing test cases | AUTH-02, AUTH-03, AUTH-04 |

## Steps to reproduce
```
POST /auth
{"username":"admin","password":"wrong-password"}
```

## Expected
HTTP 401 Unauthorized with an error body. Same for an empty body (400/401) and an unknown user (401).

## Actual
HTTP 200 OK with {"reason":"Bad credentials"}.

## Impact
Clients and gateways that rely on status codes treat a failed login as success. Monitoring and rate-limiting cannot tell failed logins apart.
