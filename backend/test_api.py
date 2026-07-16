import pytest
import tempfile
import shutil
import os
import jwt
import time

# Set test environment secret before importing main app to prevent startup failure
os.environ["SUPABASE_JWT_SECRET"] = "super-secret-supabase-jwt-key-for-local-dev"
os.environ["DATABASE_URL"] = "sqlite:///test_branchdeck.db"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from main import app
from database import Base, get_db, Repository, Commit, CodeNode, CodeEdge, FileCache, CodeChunk, OrgMembership, TeamInvitation, IndexingJob, UsageLog

# Setup database using testcontainers-postgres if available, falling back to TEST_DATABASE_URL/DATABASE_URL, or fail fast
def create_test_engine():
    # 1. Try testcontainers
    try:
        from testcontainers.postgres import PostgresContainer
        postgres = PostgresContainer("pgvector/pgvector:pg15")
        postgres.start()
        
        import atexit
        atexit.register(postgres.stop)
        
        db_url = postgres.get_connection_url()
        test_engine = create_engine(db_url)
        # Ensure pgvector extension is enabled
        with test_engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        return test_engine
    except Exception as docker_err:
        # 2. Fall back to local postgres url if provided
        postgres_url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
        if postgres_url and postgres_url.startswith("postgresql"):
            print(f"Docker/Testcontainers not running: {docker_err}. Trying DATABASE_URL/TEST_DATABASE_URL...")
            test_engine = create_engine(postgres_url)
            try:
                # Verify connection
                with test_engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                with test_engine.begin() as conn:
                    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                return test_engine
            except Exception as conn_err:
                raise RuntimeError(
                    f"Docker/Testcontainers is not running, and failed to connect to local Postgres: {conn_err}. "
                    f"Please install/start Docker or run local Postgres service."
                )
        else:
            print("Docker/Testcontainers not running and no PostgreSQL config detected. Falling back to SQLite for tests.")
            return create_engine("sqlite:///test_branchdeck.db", connect_args={"check_same_thread": False})

engine = create_test_engine()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Recreate tables in-memory/postgres test database
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

# Setup initial organization memberships for test tenants
_init_db = TestingSessionLocal()
_init_db.add(OrgMembership(user_id="user-local", organization_id="local", role="owner"))
_init_db.add(OrgMembership(user_id="user-tenant-correct", organization_id="tenant-correct", role="owner"))
_init_db.add(OrgMembership(user_id="user-tenant-A", organization_id="tenant-A", role="owner"))
_init_db.add(OrgMembership(user_id="user-tenant-B", organization_id="tenant-B", role="owner"))
_init_db.commit()
_init_db.close()

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Override FastAPI database dependency
app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

# Helper to generate cryptographically signed test JWTs matching the backend's secret
def generate_test_jwt(org: str = "local", secret: str = "super-secret-supabase-jwt-key-for-local-dev", exp: int = None, alg: str = "HS256") -> str:
    payload = {
        "sub": f"user-{org}",
        "email": f"{org}@example.com",
        "role": "authenticated",
        "organization_id": org,
        "org_id": org,
        "user_metadata": {
            "user_name": f"github-{org}"
        }
    }
    if exp is not None:
        payload["exp"] = exp
    else:
        payload["exp"] = int(time.time()) + 3600
        
    if alg == "none":
        return jwt.encode(payload, "", algorithm="none")
        
    return jwt.encode(payload, secret, algorithm=alg)

def get_auth_headers(org: str = "local", correlation_id: str = None) -> dict:
    headers = {"Authorization": f"Bearer {generate_test_jwt(org)}"}
    if correlation_id:
        headers["X-Correlation-ID"] = correlation_id
    return headers

def test_api_analyze_missing_params_falls_back_to_mock():
    # Sending empty body should fall back to mock feature/calls response safely
    response = client.post("/api/analyze", json={}, headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["source"] == "mock-ecommerce"
    assert "features" in data
    assert "callGraph" in data

def test_api_impact_missing_params_fails_validation():
    # Sending empty body to impact should trigger validation failure (422)
    response = client.post("/api/impact", json={}, headers=get_auth_headers())
    assert response.status_code == 422
    
    # Sending targetNodeId only should still fail validation (422)
    response = client.post("/api/impact", json={"targetNodeId": "repo:sha:file.ts"}, headers=get_auth_headers())
    assert response.status_code == 422

    # Sending commitSha only should still fail validation (422)
    response = client.post("/api/impact", json={"commitSha": "sha"}, headers=get_auth_headers())
    assert response.status_code == 422

def test_api_impact_with_params_succeeds_empty_db():
    # Sending both targetNodeId and commitSha should succeed (200) even if DB is empty (returns empty list)
    payload = {
        "targetNodeId": "repo-id:commit-sha:src/file.ts",
        "commitSha": "commit-sha"
    }
    response = client.post("/api/impact", json=payload, headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["impactedNodes"] == []

def test_api_callflow_resolves_from_db():
    db = TestingSessionLocal()
    # Create test repo
    repo = Repository(id="test-repo-123", organization_id="local", name="test-repo")
    db.add(repo)
    commit = Commit(sha="test-commit-456", repo_id=repo.id)
    db.add(commit)
    
    # Create nodes: a caller (Page) and a callee (AuthService)
    node1 = CodeNode(
        id="test-repo-123:test-commit-456:src/app/page.tsx",
        repo_id=repo.id,
        commit_sha=commit.sha,
        symbol="Page",
        file_path="src/app/page.tsx",
        kind="ui",
        content_hash="h1"
    )
    node2 = CodeNode(
        id="test-repo-123:test-commit-456:src/auth/auth.service.ts",
        repo_id=repo.id,
        commit_sha=commit.sha,
        symbol="AuthService",
        file_path="src/auth/auth.service.ts",
        kind="service",
        content_hash="h2"
    )
    db.add(node1)
    db.add(node2)
    
    # Create edge
    edge = CodeEdge(
        repo_id=repo.id,
        commit_sha=commit.sha,
        from_id=node1.id,
        to_id=node2.id,
        kind="calls"
    )
    db.add(edge)
    db.commit()
    
    # Query /api/callflow
    payload = {
        "functionName": "AuthService",
        "commitSha": "test-commit-456"
    }
    response = client.post("/api/callflow", json=payload, headers=get_auth_headers("local"))
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["nodes"]) == 2
    assert len(data["edges"]) == 1
    assert data["provenance"] == "database"

def test_api_story_generates_from_db_with_verification():
    # Query /api/story for "auth"
    payload = {
        "featureId": "auth",
        "commitSha": "test-commit-456"
    }
    response = client.post("/api/story", json=payload, headers=get_auth_headers("local"))
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "Workflow" in data["title"]
    assert len(data["steps"]) > 0
    # Template narrator matches auth.service (AuthService)
    # Checks if verification works
    step_with_verification = [s for s in data["steps"] if "AuthService" in s]
    assert len(step_with_verification) > 0

def test_api_cross_tenant_access_rejected():
    db = TestingSessionLocal()
    # Create test repo for tenant-A
    repo = Repository(id="tenant-repo-id", organization_id="tenant-A", name="secure-repo")
    db.add(repo)
    commit = Commit(sha="tenant-commit-sha", repo_id=repo.id)
    db.add(commit)
    
    node = CodeNode(
        id="tenant-repo-id:tenant-commit-sha:src/main.ts",
        repo_id=repo.id,
        commit_sha=commit.sha,
        symbol="Main",
        file_path="src/main.ts",
        kind="ui",
        content_hash="h3"
    )
    db.add(node)
    db.commit()
    
    # 1. Query /api/impact with cross-tenant header -> 403
    payload = {
        "targetNodeId": node.id,
        "commitSha": commit.sha
    }
    response = client.post("/api/impact", json=payload, headers=get_auth_headers("tenant-B"))
    assert response.status_code == 403
    assert "Access denied" in response.json()["detail"]
    
    # Query /api/impact with correct header -> 200
    response = client.post("/api/impact", json=payload, headers=get_auth_headers("tenant-A"))
    assert response.status_code == 200
    
    # 2. Query /api/callflow with cross-tenant header -> 403
    payload_cf = {
        "functionName": "Main",
        "commitSha": commit.sha
    }
    response = client.post("/api/callflow", json=payload_cf, headers=get_auth_headers("tenant-B"))
    assert response.status_code == 403
    
    # Query /api/callflow with correct header -> 200
    response = client.post("/api/callflow", json=payload_cf, headers=get_auth_headers("tenant-A"))
    assert response.status_code == 200

    # 3. Query /api/story with cross-tenant header -> 403
    payload_story = {
        "featureId": "auth",
        "commitSha": commit.sha
    }
    response = client.post("/api/story", json=payload_story, headers=get_auth_headers("tenant-B"))
    assert response.status_code == 403
    
    # Query /api/story with correct header -> 200
    response = client.post("/api/story", json=payload_story, headers=get_auth_headers("tenant-A"))
    assert response.status_code == 200

@pytest.fixture
def temp_workspace():
    temp_dir = tempfile.mkdtemp()
    
    # math.ts
    math_content = """
    export function add(a: number, b: number): number {
        return a + b;
    }
    export function multiply(a: number, b: number): number {
        return a * b;
    }
    """
    # calculator.ts
    calc_content = """
    import { add, multiply } from './math';
    export function calculate(): number {
        const x = add(5, 10);
        return multiply(x, 2);
    }
    """
    # app.ts
    app_content = """
    import { calculate } from './calculator';
    function main() {
        console.log(calculate());
    }
    main();
    """
    
    # Write files
    os.makedirs(os.path.join(temp_dir, "src"), exist_ok=True)
    with open(os.path.join(temp_dir, "src", "math.ts"), "w") as f:
        f.write(math_content)
    with open(os.path.join(temp_dir, "src", "calculator.ts"), "w") as f:
        f.write(calc_content)
    with open(os.path.join(temp_dir, "src", "app.ts"), "w") as f:
        f.write(app_content)
        
    yield temp_dir
    shutil.rmtree(temp_dir)

def test_codebase_indexing_correctness(temp_workspace):
    db = TestingSessionLocal()
    files = [
        "src/math.ts",
        "src/calculator.ts",
        "src/app.ts"
    ]
    payload = {
        "workspacePath": temp_workspace,
        "files": files
    }
    response = client.post("/api/analyze", json=payload, headers=get_auth_headers("tenant-correct"))
    assert response.status_code == 202
    data = response.json()
    assert data["success"] is True
    assert "job_id" in data
    
    # Verify background task execution completions
    status_res = client.get(f"/api/analyze/status/{data['job_id']}", headers=get_auth_headers("tenant-correct"))
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "completed"
    
    # Fetch and verify
    repo_name = temp_workspace.replace("\\", "/").split("/")[-1]
    repo = db.query(Repository).filter_by(organization_id="tenant-correct", name=repo_name).first()
    assert repo is not None
    
    commit = db.query(Commit).filter_by(repo_id=repo.id).first()
    assert commit is not None
    
    # Verify nodes
    db_nodes = db.query(CodeNode).filter_by(commit_sha=commit.sha).all()
    assert len(db_nodes) == 3
    node_symbols = {n.file_path: n.symbol for n in db_nodes}
    assert "src/math.ts" in node_symbols
    assert "src/calculator.ts" in node_symbols
    assert "src/app.ts" in node_symbols
    
    # Verify edges
    db_edges = db.query(CodeEdge).filter_by(commit_sha=commit.sha).all()
    edge_pairs = []
    node_id_to_symbol = {n.id: n.symbol for n in db_nodes}
    for edge in db_edges:
        from_sym = node_id_to_symbol[edge.from_id]
        to_sym = node_id_to_symbol[edge.to_id]
        edge_pairs.append((from_sym, to_sym, edge.kind))
        
    assert ("calculator", "math", "imports") in edge_pairs
    assert ("calculator", "math", "calls") in edge_pairs
    assert ("app", "calculator", "imports") in edge_pairs
    assert ("app", "calculator", "calls") in edge_pairs

def test_api_correlation_id_forwarding():
    # 1. Custom correlation ID passed in headers
    custom_id = "test-corr-id-12345"
    response = client.post("/api/impact", json={"targetNodeId": "n", "commitSha": "c"}, headers=get_auth_headers("local", custom_id))
    assert response.headers.get("X-Correlation-ID") == custom_id

    # 2. No correlation ID passed -> should generate a new UUID
    response = client.post("/api/impact", json={"targetNodeId": "n", "commitSha": "c"}, headers=get_auth_headers("local"))
    generated_id = response.headers.get("X-Correlation-ID")
    assert generated_id is not None
    # Verify it is a valid UUID structure
    import uuid
    val = uuid.UUID(generated_id, version=4)
    assert str(val) == generated_id

def test_jwt_expired_token_rejected():
    # Token expired 10 minutes ago
    expired_time = int(time.time()) - 600
    token = generate_test_jwt(org="local", exp=expired_time)
    response = client.post("/api/impact", json={"targetNodeId": "n", "commitSha": "c"}, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "Token has expired" in response.json()["detail"]

def test_jwt_none_algorithm_rejected():
    token = generate_test_jwt(org="local", alg="none")
    response = client.post("/api/impact", json={"targetNodeId": "n", "commitSha": "c"}, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "Invalid token" in response.json()["detail"]

def test_jwt_invalid_algorithm_rejected():
    # Signed with HS384 instead of HS256
    token = generate_test_jwt(org="local", alg="HS384")
    response = client.post("/api/impact", json={"targetNodeId": "n", "commitSha": "c"}, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "Invalid token" in response.json()["detail"]

@pytest.mark.skipif(engine.dialect.name == "sqlite", reason="SQLite lacks pgvector distance operators")
def test_pgvector_cosine_distance_query():
    db = TestingSessionLocal()
    # Create test repo
    repo = Repository(id="vector-repo", organization_id="local", name="vector-repo")
    db.add(repo)
    commit = Commit(sha="vector-commit", repo_id=repo.id)
    db.add(commit)
    
    # Create two nodes with distinct embeddings
    # node A has embedding [1.0] * 768
    # node B has embedding [-1.0] * 768
    emb_a = [1.0] * 768
    emb_b = [-1.0] * 768
    
    node_a = CodeNode(
        id="vector-repo:vector-commit:src/a.ts",
        repo_id=repo.id,
        commit_sha=commit.sha,
        symbol="NodeA",
        file_path="src/a.ts",
        kind="service",
        content_hash="ha",
        embedding=emb_a
    )
    node_b = CodeNode(
        id="vector-repo:vector-commit:src/b.ts",
        repo_id=repo.id,
        commit_sha=commit.sha,
        symbol="NodeB",
        file_path="src/b.ts",
        kind="service",
        content_hash="hb",
        embedding=emb_b
    )
    db.add(node_a)
    db.add(node_b)
    db.commit()
    
    # Query closest to emb_a
    # We expect NodeA to be closer than NodeB
    results = db.query(CodeNode).order_by(CodeNode.embedding.cosine_distance(emb_a)).all()
    
    assert len(results) >= 2
    assert results[0].id == node_a.id
    assert results[1].id == node_b.id

def test_path_traversal_blocked():
    payload = {
        "workspacePath": "C:/fake/path",
        "files": ["../../etc/passwd", "src/main.py"],
        "url": ""
    }
    response = client.post("/api/analyze", json=payload, headers=get_auth_headers("local"))
    # Expect 400 Bad Request due to path traversal blocking
    assert response.status_code == 400
    assert "Path traversal" in response.json()["detail"]

def test_invalid_jwt_signature():
    headers = {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.badsignature"}
    response = client.post("/api/analyze", json={}, headers=headers)
    assert response.status_code == 401

def test_codebase_query_resolves():
    # Index a mock chunk
    db = TestingSessionLocal()
    repo = Repository(id="query-repo", organization_id="local", name="query-repo")
    db.add(repo)
    commit = Commit(sha="query-commit", repo_id=repo.id)
    db.add(commit)
    node = CodeNode(
        id="query-repo:query-commit:src/math.py",
        repo_id=repo.id,
        commit_sha=commit.sha,
        symbol="math",
        file_path="src/math.py",
        kind="service",
        content_hash="hashmath"
    )
    db.add(node)
    
    # Add a chunk
    from services.vector_store import store_chunk
    store_chunk(db, node.id, "def add(a, b): return a + b", [1.0] * 768, 1, 2)
    db.commit()
    
    # Mock the embeddings call in tests so it doesn't try hitting Gemini API
    import services.retrieval
    old_get_embedding = services.retrieval.get_embedding
    services.retrieval.get_embedding = lambda text: [1.0] * 768
    
    try:
        payload = {
            "queryText": "how to add two numbers",
            "commitSha": "query-commit"
        }
        response = client.post("/api/query", json=payload, headers=get_auth_headers("local"))
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["sources"]) > 0
        assert "math.py" in data["sources"][0]["file_path"]
    finally:
        services.retrieval.get_embedding = old_get_embedding

def test_api_analyze_background_job_flow():
    # Setup mock workspace and files
    temp_dir = tempfile.mkdtemp()
    os.makedirs(os.path.join(temp_dir, "src"))
    with open(os.path.join(temp_dir, "src/math.py"), "w") as f:
        f.write("def mul(a, b): return a * b")
        
    try:
        payload = {
            "workspacePath": temp_dir,
            "files": ["src/math.py"]
        }
        
        # 1. Enqueue job (should get 202 Accepted)
        response = client.post("/api/analyze", json=payload, headers=get_auth_headers("local"))
        assert response.status_code == 202
        data = response.json()
        assert data["success"] is True
        assert "job_id" in data
        assert data["status"] == "queued"
        
        job_id = data["job_id"]
        
        # 2. Retrieve status (Since FastAPI TestClient runs BackgroundTasks synchronously at request completion, the job is already completed!)
        status_res = client.get(f"/api/analyze/status/{job_id}", headers=get_auth_headers("local"))
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["success"] is True
        assert status_data["status"] == "completed"
        assert status_data["progress"] == 100
        assert "callGraph" in status_data
        assert len(status_data["callGraph"]["nodes"]) > 0
    finally:
        shutil.rmtree(temp_dir)

def test_api_analyze_file_count_cap():
    payload = {
        "workspacePath": "C:/fake/path",
        "files": ["src/file.ts"] * 1001
    }
    response = client.post("/api/analyze", json=payload, headers=get_auth_headers("local"))
    assert response.status_code == 400
    assert "exceeds the public launch limit" in response.json()["detail"]

def test_api_query_daily_rate_limiting():
    db = TestingSessionLocal()
    
    # Clean previous usage logs
    db.query(UsageLog).filter_by(organization_id="rate-limited-org").delete()
    
    # Pre-seed 100 query logs for a dedicated tenant
    for _ in range(100):
        log = UsageLog(
            user_id="user-rate-limited-org",
            organization_id="rate-limited-org",
            action="query",
            units=1
        )
        db.add(log)
    
    # Map user user-rate-limited-org to rate-limited-org organization
    db.add(OrgMembership(user_id="user-rate-limited-org", organization_id="rate-limited-org", role="owner"))
    db.commit()
    
    payload = {
        "queryText": "explain codebase",
        "commitSha": "query-commit"
    }
    
    # Query using the rate-limited org user header
    response = client.post("/api/query", json=payload, headers=get_auth_headers("rate-limited-org"))
    assert response.status_code == 429
    assert "Daily AI query budget exceeded" in response.json()["detail"]

