# ADR 0002: Vetted JWT Library & Postgres Test Parity

## Context

In prior remediation rounds, we introduced:
1. A custom, hand-rolled JWT signature validation utility in [main.py](file:///c:/Users/adel/Downloads/Projects/Branchdeck/backend/main.py) using built-in HMAC/hashlib modules.
2. Database integration testing executing against an in-memory SQLite backend inside [test_api.py](file:///c:/Users/adel/Downloads/Projects/Branchdeck/backend/test_api.py).

This created critical operational risks:
- Custom cryptography lacks standard verification guards like algorithm-confusion checks (pinning), signature expiration enforcement (`exp`), and standard token decoding audits.
- Running tests on SQLite does not verify Postgres-specific components like `pgvector` columns, cosine distance queries, or transaction behavior, creating a silent coverage gap.

## Decision

We executed two scoped fixes:

### 1. PyJWT Adoption
We replaced custom HMAC parsing with the vetted `PyJWT` library:
```python
jwt.decode(token, secret, algorithms=["HS256"])
```
This automatically manages constant-time comparison, algorithm-pinning (HS256), and signature expiration checks. We added tests verifying that expired tokens, `alg: none` headers, and mismatched algorithm requests (e.g. HS384) are successfully rejected with a `401` status.

### 2. PostgreSQL testing parity via Testcontainers & GitHub Actions
- We configured [test_api.py](file:///c:/Users/adel/Downloads/Projects/Branchdeck/backend/test_api.py) to launch `pgvector/pgvector:pg15` database instances using `testcontainers-postgres`.
- If Docker/testcontainers is offline, the test engine falls back to `TEST_DATABASE_URL` or `DATABASE_URL` PostgreSQL servers, failing fast and loud if no PostgreSQL server is available (no silent SQLite database substitution).
- We added a PostgreSQL service container executing `pgvector/pgvector:pg15` inside the CI pipeline [.github/workflows/ci.yml](file:///c:/Users/adel/Downloads/Projects/Branchdeck/.github/workflows/ci.yml).
- We wrote `test_pgvector_cosine_distance_query` executing real cosine distance queries using pgvector's SQLAlchemy operators to guarantee vector logic behaves identically in tests.

## Consequences

- **Secure Token Lifecycle**: Token checks are standard, timing-safe, and automatically reject expired or algorithm-forged JWTs.
- **Production Parity**: Local testing and GHA pipelines now mirror production engines, confirming that schema migrations, pgvector columns, and queries execute without compilation or syntax errors.
