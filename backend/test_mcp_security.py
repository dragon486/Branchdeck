import pytest
from database import Repository, Commit, CodeNode, CodeEdge, SecurityNodeTag, SecurityFinding
from mcp_security import detect_mcp_surface, evaluate_rules, generate_patch_diff
from test_api import client, get_auth_headers, TestingSessionLocal

@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()

def test_detect_mcp_surface(db):
    repo = db.query(Repository).filter_by(organization_id="local", name="test-mcp-repo").first()
    if not repo:
        repo = Repository(organization_id="local", name="test-mcp-repo")
        db.add(repo)
        db.commit()

    commit = db.query(Commit).filter_by(sha="sha-mcp-1", repo_id=repo.id).first()
    if not commit:
        commit = Commit(sha="sha-mcp-1", repo_id=repo.id)
        db.add(commit)
        db.commit()

    node1 = CodeNode(id=f"{repo.id}:sha-mcp-1:src/mcp_server.ts", repo_id=repo.id, commit_sha="sha-mcp-1", symbol="mcp_server", file_path="src/mcp_server.ts", kind="service", content_hash="h1")
    node2 = CodeNode(id=f"{repo.id}:sha-mcp-1:manifest.json", repo_id=repo.id, commit_sha="sha-mcp-1", symbol="manifest", file_path="manifest.json", kind="service", content_hash="h2")
    db.merge(node1)
    db.merge(node2)
    db.commit()

    indexed_files = ["src/mcp_server.ts", "manifest.json"]
    validated_files = {}

    tags = detect_mcp_surface(db, repo.id, "sha-mcp-1", indexed_files, validated_files)
    assert isinstance(tags, list)
    
    db_tags = db.query(SecurityNodeTag).filter_by(repo_id=repo.id, commit_sha="sha-mcp-1").all()
    assert len(db_tags) > 0

def test_generate_patch_diff():
    diff1 = generate_patch_diff("missing-auth-check", "src/tool.ts", "async function handleTool(request) {\n  return 'ok';\n}")
    assert "Security Fix: Verify authentication token" in diff1

    diff2 = generate_patch_diff("overly-broad-oauth-scope", "manifest.json", '{"scope": "*"}')
    assert "read:tools write:tools" in diff2

    diff3 = generate_patch_diff("unsanitized-path-param", "src/reader.ts", "const content = fs.readFileSync(inputPath, 'utf-8');")
    assert "sanitizeFilename" in diff3

def test_evaluate_rules_and_findings(db):
    repo = db.query(Repository).filter_by(organization_id="local").first()
    if not repo:
        repo = Repository(organization_id="local", name="test-repo")
        db.add(repo)
        db.commit()

    commit_sha = "sha-mcp-1"
    findings = evaluate_rules(db, repo.id, commit_sha, {})
    assert isinstance(findings, list)

def test_security_findings_api(db):
    repo = db.query(Repository).filter_by(organization_id="local").first()
    if not repo:
        repo = Repository(organization_id="local", name="test-repo-api")
        db.add(repo)
        db.commit()

    commit = db.query(Commit).filter_by(sha="sha-mcp-api", repo_id=repo.id).first()
    if not commit:
        commit = Commit(sha="sha-mcp-api", repo_id=repo.id)
        db.add(commit)
        db.commit()

    headers = get_auth_headers("local")
    res = client.get(f"/api/security/findings?commitSha={commit.sha}", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data.get("success") is True
    assert "findings" in data
    assert "tags" in data

def test_security_fix_pr_api(db):
    repo = db.query(Repository).filter_by(organization_id="local").first()
    if not repo:
        repo = Repository(organization_id="local", name="test-repo-api")
        db.add(repo)
        db.commit()

    finding = SecurityFinding(
        repo_id=repo.id,
        commit_sha="sha-mcp-api",
        rule_id="missing-auth-check",
        title="Test Finding",
        description="Missing auth check",
        severity="HIGH",
        file_path="src/mcp_server.ts",
        is_reachable=True,
        patch_diff="--- diff",
        details={"doc_url": "https://docs.branchdeck.dev"}
    )
    db.add(finding)
    db.commit()

    headers = get_auth_headers("local")
    res = client.post("/api/security/fix-pr", headers=headers, json={"findingId": finding.id})
    assert res.status_code == 200
    data = res.json()
    assert data.get("success") is True
    assert "pr_url" in data
    assert "branch" in data
