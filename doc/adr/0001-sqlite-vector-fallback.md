# ADR 0001: SQLite & SafeVector Database Fallback for Local Dev & CI

## Context

The primary indexing and analysis engine of Branchdeck requires a database backend to persist repository metadata, commits, AST nodes, and call/import edges. When connected to PostgreSQL, the engine stores high-dimensional embeddings using the `pgvector` database extension.

However, local developer machines and CI/CD servers (like GitHub Actions) often lack a running PostgreSQL service with `pgvector` installed. To prevent uvicorn startup crashes and enable standalone local testing, we require a database fallback system that:
1. Prevents startup crashes when PostgreSQL is offline.
2. Gracefully falls back to a lightweight, zero-configuration local database (SQLite).
3. Bypasses pgvector syntax/DDL compilation errors on dialects that do not support vectors (like SQLite).

## Decision

We implemented a two-part fallback system inside `backend/database.py`:

### 1. Resilient Connection with SQLite Fallback
In `init_db()`, we execute a retry loop with exponential backoff (up to 5 attempts). If connection to the primary PostgreSQL endpoint fails on all attempts (e.g. because Postgres is offline or credentials are missing), the connection manager automatically configures a local SQLite file database:
```python
fallback_url = "sqlite:///branchdeck.db"
setup_db(fallback_url)
Base.metadata.create_all(bind=engine)
```

### 2. Custom SQLAlchemy `SafeVector` TypeDecorator
To resolve DDL compilation issues for pgvector's `Vector(1536)` type on SQLite, we designed a custom SQLAlchemy `TypeDecorator` called `SafeVector`:
```python
class SafeVector(TypeDecorator):
    impl = JSON
    cache_ok = True
    
    def __init__(self, dim):
        super().__init__()
        self.dim = dim
        
    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            try:
                from pgvector.sqlalchemy import Vector
                return dialect.type_descriptor(Vector(self.dim))
            except ImportError:
                return dialect.type_descriptor(JSON())
        else:
            return dialect.type_descriptor(JSON())
```
- On **PostgreSQL**: Delegates dynamically to pgvector's `Vector` descriptor.
- On **SQLite**: Automatically falls back to SQLAlchemy's native `JSON` type, allowing SQLite to generate the schema correctly without syntax errors.

## Consequences

- **Standalone Testing & CI/CD**: We can run the full test suite (`pytest`) in-memory using SQLite and `StaticPool` in GitHub Actions on every pull request, completely removing PostgreSQL as a blocking test dependency.
- **Developer Onboarding**: Developers can clone the repository, run the FastAPI server, and index their local workspaces immediately without having to configure a local database service.
- **Feature Limitation**: When running on SQLite, vector-based semantic search operations are not available, but core call-graph analyses, AST parsing, call flows, and AI story narrations remain fully operational.
