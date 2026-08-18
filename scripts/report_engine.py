"""
report_engine.py — Synchronous, auth-free wrappers around Branchdeck backend logic.

Run from project root:
    PYTHONPATH=backend python scripts/generate_report.py ...

This module imports directly from backend/ package modules (parser, database,
mcp_security, services/*) and calls their inner logic without going through
FastAPI routes, JWT middleware, or any SaaS rate-limiting / usage-log plumbing.

IMPORTANT: This file does NOT modify any backend files. It only imports and
calls the existing pure functions from that package.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import sys
from collections import Counter
from typing import Optional

logger = logging.getLogger("branchdeck.report_engine")

# ---------------------------------------------------------------------------
# SOURCE FILE FILTER — mirrors is_source_file() in main.py exactly
# ---------------------------------------------------------------------------
SOURCE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".cpp", ".c",
    ".cc", ".h", ".hpp", ".cs", ".rs", ".rb", ".php", ".kt", ".swift",
    ".css", ".scss", ".sass", ".vue", ".svelte",
}

def is_source_file(file_path: str) -> bool:
    if not file_path:
        return False
    normalized = file_path.replace("\\", "/").strip()
    filename = normalized.split("/")[-1]
    if filename.startswith("."):
        return False
    lower_name = filename.lower()
    if lower_name.endswith((".html", ".htm", ".json", ".md", ".txt", ".lock",
                            ".yml", ".yaml", ".toml", ".csv", ".map")):
        return False
    parts = lower_name.rsplit(".", 1)
    if len(parts) < 2:
        return False
    return f".{parts[1]}" in SOURCE_EXTENSIONS


def _classify_node_type(file_path: str) -> str:
    """Exact taxonomy matching logic from index_codebase_task in main.py."""
    path_lower = file_path.lower()
    if any(k in path_lower for k in ("page", "layout", "view", "screen", "component", "components/")) or file_path.endswith(".css"):
        return "ui"
    if any(k in path_lower for k in ("controller", "route", "/api/", "api")):
        return "api"
    if any(k in path_lower for k in ("db/", "model", "entity", "repository", "schema", "db-", "database")):
        return "db"
    if any(k in path_lower for k in ("cron", "worker", "job", "task")):
        return "worker"
    if any(k in path_lower for k in ("adapter", "external", "client", "sdk")):
        return "external"
    return "service"


# ---------------------------------------------------------------------------
# INDEXING — synchronous, SaaS-tracking-free variant of index_codebase_task
# ---------------------------------------------------------------------------
def index_repo(db, org_id: str, workspace_path: str, files: list[str],
               skip_gemini: bool = True) -> tuple[str, str]:
    """
    Index a local workspace into the DB under a scoped org_id.

    Returns (repo_id, commit_sha) — both are throwaway identifiers scoped to
    this report run. They are used by all subsequent analysis calls.

    skip_gemini=True (default) skips all Gemini embedding API calls so indexing
    always completes fast even without a valid API key.

    Raises on hard failures (e.g. unreadable workspace). Individual file
    errors are logged and skipped.
    """
    from database import Repository, Commit, CodeNode, CodeEdge, FileCache, normalize_path
    from parser import parse_file
    from services.chunker import chunk_code
    from services.embeddings import get_embedding
    from services.vector_store import store_chunk

    clean_workspace = workspace_path.replace("\\", "/")
    repo_name = clean_workspace.split("/")[-1]

    # Register a throwaway repo record scoped to this report's org_id
    repo = db.query(Repository).filter_by(organization_id=org_id, name=repo_name).first()
    if not repo:
        repo = Repository(organization_id=org_id, name=repo_name)
        db.add(repo)
        db.commit()
        db.refresh(repo)

    # Derive a stable commit SHA from workspace + file count (no git required)
    commit_sha = hashlib.sha256(
        bytes(clean_workspace + str(len(files)), "utf8")
    ).hexdigest()[:10]

    commit = db.query(Commit).filter_by(sha=commit_sha, repo_id=repo.id).first()
    if not commit:
        commit = Commit(sha=commit_sha, repo_id=repo.id)
        db.add(commit)
        db.commit()

    # Clean stale rows for this commit (idempotent re-runs)
    db.query(CodeNode).filter_by(commit_sha=commit_sha, repo_id=repo.id).delete(synchronize_session=False)
    db.query(CodeEdge).filter_by(commit_sha=commit_sha, repo_id=repo.id).delete(synchronize_session=False)
    db.commit()

    filtered = [f for f in files if is_source_file(f)]
    indexed_files = filtered if filtered else files
    total = len(indexed_files)
    seen_paths: set[str] = set()

    logger.info(f"Indexing {total} source files for org_id={org_id}")

    # Circuit breaker: disabled on first auth failure so we don't hammer a bad key
    _embedding_enabled = not skip_gemini and bool(os.getenv("GEMINI_API_KEY"))

    # --- Pass 1: Parse + store nodes + embeddings ---
    for idx, raw_file in enumerate(indexed_files):
        file = normalize_path(raw_file)
        if not file or file in seen_paths:
            continue
        seen_paths.add(file)

        full_path = os.path.join(workspace_path, raw_file)
        filename = file.split("/")[-1]
        clean_name = filename.split(".")[0]
        node_type = _classify_node_type(file)

        content = ""
        try:
            with open(full_path, "r", encoding="utf-8", errors="ignore") as fh:
                content = fh.read()
        except Exception as e:
            logger.warning(f"Could not read {file}: {e}")

        file_hash = hashlib.sha256(bytes(content, "utf8")).hexdigest()
        cached = db.query(FileCache).filter_by(content_hash=file_hash).first()
        if cached:
            ast_summary = cached.ast_summary
        else:
            ast_summary = parse_file(file, content)
            db.merge(FileCache(content_hash=file_hash, ast_summary=ast_summary))
            db.commit()

        db_node = CodeNode(
            id=f"{repo.id}:{commit_sha}:{file}",
            repo_id=repo.id,
            commit_sha=commit_sha,
            symbol=clean_name,
            file_path=file,
            kind=node_type,
            content_hash=file_hash,
        )
        db.merge(db_node)

        # Chunk + embed (circuit-breaker: disabled on first auth failure)
        file_chunks = chunk_code(file, content)
        for chk in file_chunks:
            embedding = None
            if _embedding_enabled:
                try:
                    embedding = get_embedding(chk["content"])
                except ValueError as emb_err:
                    err_str = str(emb_err).lower()
                    if any(code in err_str for code in ("400", "401", "403", "invalid", "key")):
                        # Auth / bad-key failure: disable embeddings for the whole run
                        logger.warning(
                            f"Embedding auth failure for {file} — disabling embeddings for this run: {emb_err}"
                        )
                        _embedding_enabled = False
                    else:
                        logger.warning(f"Embedding failed for {file}: {emb_err}")
                except Exception as emb_err:
                    logger.warning(f"Embedding failed for {file}: {emb_err}")
            store_chunk(db, db_node.id, chk["content"], embedding, chk["start_line"], chk["end_line"])

        if idx % 50 == 0:
            db.commit()
            logger.info(f"  Progress: {idx + 1}/{total} files")

    db.commit()

    # --- Pass 2: Build declaration map ---
    decl_to_node: dict[str, str] = {}
    for raw_file in indexed_files:
        file = normalize_path(raw_file)
        full_path = os.path.join(workspace_path, raw_file)
        content = ""
        try:
            with open(full_path, "r", encoding="utf-8", errors="ignore") as fh:
                content = fh.read()
        except Exception:
            pass
        file_hash = hashlib.sha256(bytes(content, "utf8")).hexdigest()
        cached = db.query(FileCache).filter_by(content_hash=file_hash).first()
        if cached:
            for decl in cached.ast_summary.get("declarations", []):
                decl_to_node[decl] = f"{repo.id}:{commit_sha}:{file}"

    # --- Pass 3: Create edges ---
    for raw_file in indexed_files:
        file = normalize_path(raw_file)
        full_path = os.path.join(workspace_path, raw_file)
        content = ""
        try:
            with open(full_path, "r", encoding="utf-8", errors="ignore") as fh:
                content = fh.read()
        except Exception:
            pass
        file_hash = hashlib.sha256(bytes(content, "utf8")).hexdigest()
        cached = db.query(FileCache).filter_by(content_hash=file_hash).first()
        if not cached:
            continue

        ast_summary = cached.ast_summary
        source_node_id = f"{repo.id}:{commit_sha}:{file}"

        for imp in ast_summary.get("imports", []):
            clean_imp = imp
            for prefix in ("@/", ):
                if clean_imp.startswith(prefix):
                    clean_imp = clean_imp[len(prefix):]
            while clean_imp.startswith("../"):
                clean_imp = clean_imp[3:]
            if clean_imp.startswith("./"):
                clean_imp = clean_imp[2:]

            matched_file = next((f for f in indexed_files if clean_imp in f), None)
            if matched_file:
                target_node_id = f"{repo.id}:{commit_sha}:{normalize_path(matched_file)}"
                if source_node_id != target_node_id:
                    db.add(CodeEdge(
                        repo_id=repo.id, commit_sha=commit_sha,
                        from_id=source_node_id, to_id=target_node_id, kind="imports"
                    ))

        for call in ast_summary.get("calls", []):
            if call in decl_to_node:
                target_node_id = decl_to_node[call]
                if source_node_id != target_node_id:
                    db.add(CodeEdge(
                        repo_id=repo.id, commit_sha=commit_sha,
                        from_id=source_node_id, to_id=target_node_id, kind="calls"
                    ))

    db.commit()

    # --- MCP Security pass ---
    try:
        from mcp_security import detect_mcp_surface, evaluate_rules
        validated_files = {
            f: os.path.join(workspace_path, f)
            for f in indexed_files
        }
        detect_mcp_surface(db, repo.id, commit_sha, indexed_files, validated_files)
        evaluate_rules(db, repo.id, commit_sha, validated_files)
        logger.info("Security analysis complete.")
    except Exception as e:
        logger.warning(f"Security analysis failed (non-fatal): {e}")

    logger.info(f"Indexing complete. repo_id={repo.id}, commit_sha={commit_sha}")
    return repo.id, commit_sha


# ---------------------------------------------------------------------------
# CALL FLOW — BFS, direct port from /api/callflow logic in main.py
# ---------------------------------------------------------------------------
def get_call_flow(db, org_id: str, commit_sha: str, function_name: str) -> dict:
    """
    BFS up to depth 3 from nodes whose symbol or file_path matches function_name.
    Returns { nodes: [...], edges: [...] } — same shape as the live API.
    """
    from database import CodeNode, CodeEdge, Repository

    start_nodes = db.query(CodeNode).join(
        Repository, CodeNode.repo_id == Repository.id
    ).filter(
        CodeNode.commit_sha == commit_sha,
        Repository.organization_id == org_id,
    ).filter(
        (CodeNode.symbol.ilike(f"%{function_name}%")) |
        (CodeNode.file_path.ilike(f"%{function_name}%"))
    ).all()

    if not start_nodes:
        return {"nodes": [], "edges": []}

    start_ids = [n.id for n in start_nodes]
    visited_nodes: set[str] = set(start_ids)
    visited_edges: list[dict] = []
    queue = [(nid, 0) for nid in start_ids]

    while queue:
        curr_id, depth = queue.pop(0)
        if depth >= 3:
            continue

        for direction, col in (("out", "from_id"), ("in", "to_id")):
            filter_col = CodeEdge.from_id if direction == "out" else CodeEdge.to_id
            edges = db.query(CodeEdge).join(
                Repository, CodeEdge.repo_id == Repository.id
            ).filter(
                CodeEdge.commit_sha == commit_sha,
                Repository.organization_id == org_id,
                filter_col == curr_id,
            ).all()
            for e in edges:
                ed = {"from": e.from_id, "to": e.to_id,
                      "label": "calls" if e.kind == "calls" else "imports",
                      "animated": True}
                if ed not in visited_edges:
                    visited_edges.append(ed)
                peer = e.to_id if direction == "out" else e.from_id
                if peer not in visited_nodes:
                    visited_nodes.add(peer)
                    queue.append((peer, depth + 1))

    db_nodes = db.query(CodeNode).join(
        Repository, CodeNode.repo_id == Repository.id
    ).filter(
        CodeNode.id.in_(visited_nodes),
        Repository.organization_id == org_id,
    ).all()

    return {
        "nodes": [{"id": n.id, "label": n.symbol, "file": n.file_path,
                   "type": n.kind, "note": f"Module: {n.file_path}"} for n in db_nodes],
        "edges": visited_edges,
    }


# ---------------------------------------------------------------------------
# IMPACT ANALYSIS — wraps get_downstream_impact() from database.py
# ---------------------------------------------------------------------------
def get_impact(db, org_id: str, commit_sha: str, target_node_id: str) -> dict:
    """
    Returns downstream impact for a node. Also annotates blast radius count
    and lists top impacted files by kind.
    """
    from database import get_downstream_impact, CodeNode, Repository

    impacted_ids = get_downstream_impact(commit_sha, target_node_id, db, org_id)

    if not impacted_ids:
        return {"impactedNodes": [], "count": 0, "topFiles": []}

    nodes = db.query(CodeNode).join(
        Repository, CodeNode.repo_id == Repository.id
    ).filter(
        CodeNode.id.in_(impacted_ids),
        Repository.organization_id == org_id,
    ).all()

    return {
        "impactedNodes": impacted_ids,
        "count": len(impacted_ids),
        "topFiles": [{"file": n.file_path, "kind": n.kind, "symbol": n.symbol}
                     for n in nodes[:20]],
    }


# ---------------------------------------------------------------------------
# BLAST-RADIUS RANKING — find the top-N highest-impact nodes in the repo
# ---------------------------------------------------------------------------
def get_blast_radius_ranking(db, org_id: str, commit_sha: str, top_n: int = 5,
                             time_limit_seconds: float = 30.0) -> list[dict]:
    """
    Compute downstream blast radius for every node and return top_n by count.
    Uses the existing recursive CTE — runs once per node.

    Stops early after time_limit_seconds and returns the best results found
    so far (sorted). This prevents hanging on large repos.
    """
    import time as _time
    from database import CodeNode, Repository, get_downstream_impact

    nodes = db.query(CodeNode).join(
        Repository, CodeNode.repo_id == Repository.id
    ).filter(
        CodeNode.commit_sha == commit_sha,
        Repository.organization_id == org_id,
    ).all()

    ranked: list[dict] = []
    deadline = _time.monotonic() + time_limit_seconds
    timed_out = False

    for node in nodes:
        if _time.monotonic() > deadline:
            timed_out = True
            break
        try:
            impacted = get_downstream_impact(commit_sha, node.id, db, org_id)
            ranked.append({
                "node_id": node.id,
                "file": node.file_path,
                "symbol": node.symbol,
                "kind": node.kind,
                "blast_radius": len(impacted),
            })
        except Exception:
            pass

    if timed_out:
        logger.warning(
            f"Blast-radius ranking timed out after {time_limit_seconds}s "
            f"({len(ranked)}/{len(nodes)} nodes evaluated). "
            "Results are partial but sorted — top files are still reliable."
        )

    ranked.sort(key=lambda x: x["blast_radius"], reverse=True)
    return ranked[:top_n]



# ---------------------------------------------------------------------------
# STORY MODE — direct port of /api/story logic from main.py
# ---------------------------------------------------------------------------
def get_story(db, org_id: str, commit_sha: str, feature_id: str,
              skip_gemini: bool = False) -> dict:
    """
    Generates a plain-English architecture narrative.
    Falls back to local graph-trace narrator if Gemini is unavailable or
    skip_gemini=True.
    """
    import httpx
    from database import CodeNode, CodeEdge, Repository

    all_nodes = db.query(CodeNode).join(
        Repository, CodeNode.repo_id == Repository.id
    ).filter(
        CodeNode.commit_sha == commit_sha,
        Repository.organization_id == org_id,
    ).all()

    all_edges = db.query(CodeEdge).join(
        Repository, CodeEdge.repo_id == Repository.id
    ).filter(
        CodeEdge.commit_sha == commit_sha,
        Repository.organization_id == org_id,
    ).all()

    # Feature keyword expansion (mirrors main.py)
    feature_keywords = [feature_id.lower()]
    if feature_id.lower() == "auth":
        feature_keywords.extend(["login", "session", "jwt", "strategy", "middleware"])
    elif feature_id.lower() == "checkout":
        feature_keywords.extend(["cart", "inventory", "shipping"])
    elif feature_id.lower() == "orders":
        feature_keywords.extend(["billing", "receipt", "invoice"])

    feature_nodes = [
        n for n in all_nodes
        if any(kw in n.file_path.lower() or kw in n.symbol.lower()
               for kw in feature_keywords)
    ]
    feature_node_ids = {n.id for n in feature_nodes}
    relevant_edges = [
        e for e in all_edges
        if e.from_id in feature_node_ids or e.to_id in feature_node_ids
    ]

    node_id_to_symbol = {n.id: n.symbol for n in all_nodes}
    context_lines = []
    for edge in relevant_edges:
        fs = node_id_to_symbol.get(edge.from_id, edge.from_id.split(":")[-1])
        ts = node_id_to_symbol.get(edge.to_id, edge.to_id.split(":")[-1])
        rel = "calls" if edge.kind == "calls" else "imports"
        context_lines.append(f"{fs} {rel} {ts}")
    context_text = "\n".join(context_lines)

    title = f"{feature_id.capitalize()} Architectural Narrative"
    steps: list[str] = []
    provenance = "database-rules"

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key and context_text and not skip_gemini:
        try:
            url = (
                "https://generativelanguage.googleapis.com/v1beta/"
                f"models/gemini-1.5-flash:generateContent?key={gemini_key}"
            )
            prompt = (
                f"Write an architectural narrative of 3 to 6 steps for the feature "
                f"'{feature_id}' based on the following code relations:\n{context_text}\n\n"
                "Return the output strictly as a JSON array of strings "
                "(no other text, no markdown block code formatting). Example:\n"
                '["Step 1 description", "Step 2 description"]'
            )
            res = httpx.post(
                url,
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=15.0,
            )
            if res.status_code == 200:
                text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
                match = re.search(r"\[.*\]", text, re.DOTALL)
                if match:
                    import json as _json
                    steps = _json.loads(match.group(0))
                    provenance = "database-llm"
        except Exception as e:
            logger.warning(f"Gemini story generation failed (falling back to local): {e}")

    # Local graph-trace narrator fallback
    if not steps:
        if relevant_edges:
            for edge in relevant_edges[:6]:
                fs = node_id_to_symbol.get(edge.from_id, edge.from_id.split(":")[-1])
                ts = node_id_to_symbol.get(edge.to_id, edge.to_id.split(":")[-1])
                rel_desc = "invokes calls on" if edge.kind == "calls" else "imports code from"
                steps.append(f"The module '{fs}' {rel_desc} '{ts}' to coordinate business operations.")
        else:
            steps = [
                f"Initiating analysis for feature scope '{feature_id}'.",
                "Analysing static codebase module structure for core classes.",
                "Persistence layer registered in database tables.",
            ]

    # Verification pass (mirrors main.py exactly)
    all_symbol_lower = {n.symbol.lower(): n.symbol for n in all_nodes}

    def _is_meaningful_symbol(word: str) -> bool:
        if len(word) < 5:
            return False
        return any(c.isupper() for c in word[1:]) or "_" in word

    verified_steps = []
    for step in steps:
        words = re.findall(r"\b[A-Za-z_][A-Za-z0-9_]+\b", step)
        verified = [all_symbol_lower[w.lower()] for w in words
                    if _is_meaningful_symbol(w) and w.lower() in all_symbol_lower]
        if verified:
            verified_steps.append(step + f" [Verified: {', '.join(set(verified))}]")
        else:
            verified_steps.append(step)

    return {
        "title": title,
        "steps": verified_steps,
        "provenance": provenance,
        "node_count": len(all_nodes),
        "edge_count": len(all_edges),
    }


# ---------------------------------------------------------------------------
# SECURITY FINDINGS
# ---------------------------------------------------------------------------
def get_security_findings(db, org_id: str, repo_id: str, commit_sha: str) -> dict:
    """
    Retrieves SecurityFinding and SecurityNodeTag records for this run.
    """
    from database import SecurityFinding, SecurityNodeTag

    findings = db.query(SecurityFinding).filter_by(
        repo_id=repo_id, commit_sha=commit_sha
    ).all()
    tags = db.query(SecurityNodeTag).filter_by(
        repo_id=repo_id, commit_sha=commit_sha
    ).all()

    return {
        "findings": [
            {
                "id": f.id,
                "rule_id": f.rule_id,
                "title": f.title,
                "description": f.description,
                "severity": f.severity,
                "file_path": f.file_path,
                "is_reachable": f.is_reachable,
                "patch_diff": f.patch_diff,
                "details": f.details,
            }
            for f in findings
        ],
        "tags": [
            {"node_id": t.node_id, "tag_name": t.tag_name, "details": t.details}
            for t in tags
        ],
    }


# ---------------------------------------------------------------------------
# EXECUTIVE SUMMARY STATS
# ---------------------------------------------------------------------------
def compute_summary_stats(workspace_path: str, files: list[str], nodes, edges) -> dict:
    """
    Compute repo-level stats for the executive summary section.
    """
    ext_counter: Counter = Counter()
    total_loc = 0
    kind_counter: Counter = Counter()

    for raw_file in files:
        parts = raw_file.rsplit(".", 1)
        ext = parts[1].lower() if len(parts) == 2 else "other"
        ext_counter[ext] += 1
        full_path = os.path.join(workspace_path, raw_file)
        try:
            with open(full_path, "r", encoding="utf-8", errors="ignore") as fh:
                total_loc += sum(1 for _ in fh)
        except Exception:
            pass

    for node in nodes:
        kind_counter[node.kind] += 1

    # Detect languages from extensions
    lang_map = {
        "ts": "TypeScript", "tsx": "TypeScript/React",
        "js": "JavaScript", "jsx": "JavaScript/React",
        "py": "Python", "go": "Go", "rs": "Rust",
        "java": "Java", "cs": "C#", "rb": "Ruby",
        "php": "PHP", "kt": "Kotlin", "swift": "Swift",
        "vue": "Vue", "svelte": "Svelte",
    }
    languages = {lang_map.get(ext, ext.upper()): count
                 for ext, count in ext_counter.most_common(8)
                 if ext in lang_map}

    has_readme = any(
        f.lower() in ("readme.md", "readme.txt", "readme.rst", "readme")
        for f in os.listdir(workspace_path)
    ) if os.path.isdir(workspace_path) else False

    has_tests = any(
        "test" in f.lower() or "spec" in f.lower()
        for f in files
    )

    return {
        "file_count": len(files),
        "source_file_count": sum(1 for f in files if is_source_file(f)),
        "total_loc": total_loc,
        "languages": languages,
        "top_extensions": ext_counter.most_common(5),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "layer_distribution": dict(kind_counter),
        "has_readme": has_readme,
        "has_tests": has_tests,
    }


# ---------------------------------------------------------------------------
# CLEANUP — deletes all scoped DB rows for this report run
# ---------------------------------------------------------------------------
def cleanup_run(db, org_id: str) -> None:
    """
    Delete all database rows scoped to this report's org_id.
    Handles FK ordering manually since SQLite doesn't enforce CASCADE by default.
    """
    from database import Repository, Commit, CodeNode, CodeEdge, CodeChunk, SecurityFinding, SecurityNodeTag

    repos = db.query(Repository).filter_by(organization_id=org_id).all()
    if not repos:
        logger.info(f"No DB rows found for org_id={org_id} — nothing to clean up.")
        return

    repo_ids = [r.id for r in repos]

    # Delete in dependency order (children before parents)
    db.query(SecurityFinding).filter(SecurityFinding.repo_id.in_(repo_ids)).delete(synchronize_session=False)
    db.query(SecurityNodeTag).filter(SecurityNodeTag.repo_id.in_(repo_ids)).delete(synchronize_session=False)

    # CodeChunk references CodeNode — delete chunks first
    node_ids_q = db.query(CodeNode.id).filter(CodeNode.repo_id.in_(repo_ids))
    node_id_list = [row[0] for row in node_ids_q.all()]
    if node_id_list:
        db.query(CodeChunk).filter(CodeChunk.node_id.in_(node_id_list)).delete(synchronize_session=False)

    db.query(CodeEdge).filter(CodeEdge.repo_id.in_(repo_ids)).delete(synchronize_session=False)
    db.query(CodeNode).filter(CodeNode.repo_id.in_(repo_ids)).delete(synchronize_session=False)
    db.query(Commit).filter(Commit.repo_id.in_(repo_ids)).delete(synchronize_session=False)
    for repo in repos:
        db.delete(repo)

    db.commit()
    logger.info(f"Cleanup complete: removed {len(repos)} repo(s) for org_id={org_id}")
