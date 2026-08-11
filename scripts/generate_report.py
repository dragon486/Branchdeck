#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_report.py — Branchdeck Codebase Health Report CLI

Usage:
    python scripts/generate_report.py \\
        --repo https://github.com/org/repo \\
        --client "Acme Corp" \\
        --title "Acme Backend Health Report" \\
        --output ./reports/acme_report.html \\
        [--branch main] \\
        [--max-files 800] \\
        [--use-gemini] \\
        [--pdf] \\
        [--no-confirm] \\
        [--dry-run] \\
        [--keep-db]

Exit codes:
    0 = full success (all sections rendered)
    1 = partial success (≥1 section unavailable, report still produced)
    2 = fatal failure (report could not be produced)
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import platform
import shutil
import signal
import subprocess
import sys
import tempfile
import textwrap
import time
import uuid
import io

# Force UTF-8 stdout/stderr on Windows so box-drawing chars don't blow up
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("branchdeck.report")

# ── colour helpers (no deps) ────────────────────────────────────────────────
_C = {
    "purple": "\033[95m", "cyan": "\033[96m", "green": "\033[92m",
    "yellow": "\033[93m", "red": "\033[91m", "bold": "\033[1m",
    "dim": "\033[2m", "reset": "\033[0m",
}
def _c(color: str, text: str) -> str:
    if sys.stdout.isatty():
        return f"{_C.get(color,'')}{text}{_C['reset']}"
    return text

def _banner(msg: str):
    print(f"\n{_c('purple','▸')} {_c('bold', msg)}")

def _ok(msg: str):
    print(f"  {_c('green','✓')} {msg}")

def _warn(msg: str):
    print(f"  {_c('yellow','⚠')} {msg}")

def _err(msg: str):
    print(f"  {_c('red','✗')} {msg}")

def _info(msg: str):
    print(f"  {_c('dim','·')} {msg}")


# ═══════════════════════════════════════════════════════════════════════════
# ARG PARSING
# ═══════════════════════════════════════════════════════════════════════════
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="generate_report.py",
        description="Generate a Branchdeck Codebase Health Report for any public GitHub repo.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              # Small repo, default settings:
              python scripts/generate_report.py --repo https://github.com/nicolo-ribaudo/proposal-rm-builtin-subclassing

              # Client report with Gemini narrative and PDF:
              python scripts/generate_report.py \\
                  --repo https://github.com/trpc/trpc \\
                  --client "Acme Corp" \\
                  --title "Acme Backend Health Report" \\
                  --output reports/acme.html \\
                  --use-gemini --pdf
        """),
    )
    p.add_argument("--repo", required=True,
                   help="Git URL or local path to the target repository")
    p.add_argument("--client", default="",
                   help="Client name (appears in report header)")
    p.add_argument("--title", default="",
                   help="Report title (defaults to '<repo-name> Codebase Health Report')")
    p.add_argument("--output", default="",
                   help="Output HTML file path (defaults to reports/<repo>_<timestamp>.html)")
    p.add_argument("--branch", default="main",
                   help="Git branch to clone (default: main)")
    p.add_argument("--max-files", type=int, default=800,
                   help="Soft file cap before prompting (default: 800)")
    p.add_argument("--use-gemini", action="store_true",
                   help="Use Gemini API for Story Mode narrative (default: local narrator)")
    p.add_argument("--pdf", action="store_true",
                   help="Also export a PDF via weasyprint (must be installed)")
    p.add_argument("--no-confirm", action="store_true",
                   help="Skip interactive y/n prompts — proceed automatically")
    p.add_argument("--dry-run", action="store_true",
                   help="Clone + walk files, set up DB, then exit without running analysis")
    p.add_argument("--keep-db", action="store_true",
                   help="Do NOT delete scoped DB rows after the run (useful for debugging)")
    return p.parse_args()


# ═══════════════════════════════════════════════════════════════════════════
# DATABASE SETUP — auto-select SQLite vs Docker Postgres based on file count
# ═══════════════════════════════════════════════════════════════════════════
SQLITE_THRESHOLD = 500   # files — above this, prefer Postgres
DOCKER_COMPOSE_PG_PORT = 15433   # throwaway port so we don't clash with prod

def _docker_available() -> bool:
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False

def _pg_running(port: int) -> bool:
    """Check if a Postgres is already listening on the throwaway port."""
    import socket
    try:
        with socket.create_connection(("localhost", port), timeout=2):
            return True
    except Exception:
        return False

def _start_throwaway_pg(project_root: str) -> Optional[str]:
    """
    Spin up a throwaway Postgres container using the existing docker-compose.yml.
    We override the port so it doesn't collide with the production DB.
    Returns the DATABASE_URL string if successful, None otherwise.
    """
    compose_file = os.path.join(project_root, "docker-compose.yml")
    if not os.path.exists(compose_file):
        logger.warning("docker-compose.yml not found — cannot spin up throwaway Postgres.")
        return None

    env = {
        **os.environ,
        "PGPORT": str(DOCKER_COMPOSE_PG_PORT),
    }
    try:
        _info(f"Spinning up throwaway Postgres on port {DOCKER_COMPOSE_PG_PORT}…")
        subprocess.run(
            ["docker", "compose", "-f", compose_file, "up", "db", "-d", "--wait"],
            capture_output=True, timeout=60, env=env, check=True,
        )
        # Brief pause for pg to accept connections
        time.sleep(3)
        db_url = (
            f"postgresql://postgres:postgres@localhost:{DOCKER_COMPOSE_PG_PORT}/postgres"
        )
        _ok(f"Throwaway Postgres ready at port {DOCKER_COMPOSE_PG_PORT}")
        return db_url
    except subprocess.CalledProcessError as e:
        logger.warning(f"docker compose up failed: {e.stderr.decode()[:300]}")
        return None
    except Exception as e:
        logger.warning(f"Could not start throwaway Postgres: {e}")
        return None

def _stop_throwaway_pg(project_root: str):
    """Stop and remove the throwaway Postgres container."""
    compose_file = os.path.join(project_root, "docker-compose.yml")
    if not os.path.exists(compose_file):
        return
    try:
        subprocess.run(
            ["docker", "compose", "-f", compose_file, "stop", "db"],
            capture_output=True, timeout=30,
        )
        _info("Throwaway Postgres container stopped.")
    except Exception:
        pass

def setup_database(file_count: int, project_root: str, org_id: str) -> tuple[str, str, bool, str]:
    """
    Choose and initialise the database.
    Returns (database_url, db_mode_label, started_docker, sqlite_path).
    sqlite_path is non-empty only for SQLite runs — it's deleted on cleanup.

    db_mode_label is stored in report metadata so slow runs are diagnosable.
    """
    started_docker = False

    if file_count > SQLITE_THRESHOLD:
        _info(f"File count {file_count} > {SQLITE_THRESHOLD} — trying Docker Postgres...")
        if _docker_available():
            if _pg_running(DOCKER_COMPOSE_PG_PORT):
                db_url = f"postgresql://postgres:postgres@localhost:{DOCKER_COMPOSE_PG_PORT}/postgres"
                _ok(f"Reusing existing Postgres on port {DOCKER_COMPOSE_PG_PORT}")
                return db_url, "postgres-existing", False, ""
            else:
                db_url = _start_throwaway_pg(project_root)
                if db_url:
                    return db_url, "postgres-docker-throwaway", True, ""
                _warn("Docker Postgres failed — falling back to SQLite")
        else:
            _warn("Docker not available — falling back to SQLite (may be slower for large repo)")

    # SQLite path — unique per run (org_id) so parallel runs don't conflict
    sqlite_path = os.path.join(project_root, "reports", f".report_{org_id}.db")
    db_url = f"sqlite:///{sqlite_path}"
    _ok(f"Using SQLite: {sqlite_path}")
    return db_url, "sqlite", False, sqlite_path


# ═══════════════════════════════════════════════════════════════════════════
# REPO CLONING
# ═══════════════════════════════════════════════════════════════════════════
def clone_repo(repo_url: str, branch: str) -> Optional[str]:
    """
    Shallow-clone a repo into a temp directory.
    Auto-retries with 'master' if 'main' fails (and vice versa).
    Returns the local workspace path, or None on failure.
    """
    tmpdir = tempfile.mkdtemp(prefix="branchdeck_report_")
    try:
        import git as gitlib
    except ImportError:
        _err("gitpython not installed. Run: pip install gitpython")
        shutil.rmtree(tmpdir, ignore_errors=True)
        return None

    # Branch fallback: if user asked for 'main', also try 'master' and vice versa
    branches_to_try = [branch]
    if branch == "main":
        branches_to_try.append("master")
    elif branch == "master":
        branches_to_try.append("main")

    last_err = None
    for attempt_branch in branches_to_try:
        try:
            _info(f"Cloning {repo_url} @ {attempt_branch} (shallow)...")
            gitlib.Repo.clone_from(
                repo_url,
                tmpdir,
                branch=attempt_branch,
                depth=1,
                env={"GIT_TERMINAL_PROMPT": "0"},  # fail fast on auth prompts
            )
            _ok(f"Cloned to {tmpdir} (branch: {attempt_branch})")
            return tmpdir
        except gitlib.exc.GitCommandError as e:
            last_err = e
            err_str = str(e).lower()
            # Auth / private repo errors — no point retrying a different branch
            if ("authentication" in err_str or "denied" in err_str
                    or "403" in err_str or "permission" in err_str):
                _err(
                    "Clone failed: repository not accessible.\n"
                    "     This is likely a private repo — ensure you have a GitHub token\n"
                    "     configured (GIT_USERNAME / GIT_PASSWORD or SSH key) or use a public repo."
                )
                shutil.rmtree(tmpdir, ignore_errors=True)
                return None
            if attempt_branch != branches_to_try[-1]:
                _info(f"Branch '{attempt_branch}' not found, trying fallback...")
        except Exception as e:
            last_err = e
            break

    # All branch attempts failed
    if last_err:
        _err(f"Clone failed after trying branches {branches_to_try}: {str(last_err)[:300]}")
    shutil.rmtree(tmpdir, ignore_errors=True)
    return None




# ═══════════════════════════════════════════════════════════════════════════
# FILE WALK
# ═══════════════════════════════════════════════════════════════════════════
SKIP_DIRS = {
    ".git", ".github", "node_modules", "__pycache__", ".next", ".vercel",
    "dist", "build", "out", ".pytest_cache", "venv", ".venv", "coverage",
    ".nyc_output", "vendor", "target", "bin", "obj",
}

def walk_files(workspace: str) -> list[str]:
    """
    Walk the workspace and return relative file paths suitable for indexing.
    Skips common noise directories.
    """
    rel_paths: list[str] = []
    for root, dirs, files in os.walk(workspace):
        # Prune noise dirs in-place
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            abs_path = os.path.join(root, fname)
            rel = os.path.relpath(abs_path, workspace).replace("\\", "/")
            rel_paths.append(rel)
    return rel_paths


# ═══════════════════════════════════════════════════════════════════════════
# MERMAID GRAPH BUILDER
# ═══════════════════════════════════════════════════════════════════════════
def build_mermaid(nodes: list[dict], edges: list[dict]) -> str:
    """
    Build a Mermaid flowchart string from call-flow nodes/edges.
    Limits to 30 nodes for readability.
    """
    if not nodes or not edges:
        return ""

    displayed_nodes = nodes[:30]
    displayed_ids = {n["id"] for n in displayed_nodes}

    # Sanitise IDs for Mermaid (replace colons, slashes, spaces)
    def mid(raw_id: str) -> str:
        return "N" + hashlib.md5(raw_id.encode()).hexdigest()[:8]

    def mlabel(node: dict) -> str:
        label = node.get("label") or node["file"].split("/")[-1]
        # Truncate long labels
        label = label[:28] + "…" if len(label) > 28 else label
        kind = node.get("type", "service")
        icons = {"ui": "🎨", "api": "🔌", "db": "🗄", "service": "⚙",
                 "worker": "⏱", "external": "🌐"}
        return f'{icons.get(kind,"📁")} {label}'

    lines = ["graph LR"]
    for n in displayed_nodes:
        lines.append(f'  {mid(n["id"])}["{mlabel(n)}"]')

    for e in edges:
        if e["from"] in displayed_ids and e["to"] in displayed_ids:
            arrow = "-->" if e.get("label") == "calls" else "-.->"
            lines.append(f'  {mid(e["from"])} {arrow} {mid(e["to"])}')

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# JINJA2 RENDERING
# ═══════════════════════════════════════════════════════════════════════════
def _commify(n) -> str:
    try:
        return f"{int(n):,}"
    except (TypeError, ValueError):
        return str(n)

def render_report(template_path: str, context: dict) -> str:
    try:
        from jinja2 import Environment, FileSystemLoader, select_autoescape
    except ImportError:
        raise RuntimeError("jinja2 not installed. Run: pip install jinja2")

    env = Environment(
        loader=FileSystemLoader(os.path.dirname(template_path)),
        autoescape=select_autoescape(["html"]),
    )
    env.filters["commify"] = _commify
    template = env.get_template(os.path.basename(template_path))
    return template.render(**context)


# ═══════════════════════════════════════════════════════════════════════════
# PDF EXPORT
# ═══════════════════════════════════════════════════════════════════════════
def export_pdf(html_path: str) -> Optional[str]:
    pdf_path = html_path.rsplit(".", 1)[0] + ".pdf"
    try:
        import weasyprint
        _info("Rendering PDF via weasyprint…")
        weasyprint.HTML(filename=html_path).write_pdf(pdf_path)
        _ok(f"PDF saved: {pdf_path}")
        return pdf_path
    except ImportError:
        _warn("weasyprint not installed — skipping PDF. Run: pip install weasyprint")
        return None
    except Exception as e:
        _warn(f"PDF generation failed (HTML report still saved): {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════
# FIND ENTRY POINTS (top-level API/service files for call flow)
# ═══════════════════════════════════════════════════════════════════════════
def _find_entry_points(nodes, max_entries: int = 3) -> list[str]:
    """
    Heuristically pick the best entry-point symbols for call-flow BFS.
    Prefers api-layer nodes, then service, then any.
    """
    api_nodes = [n for n in nodes if n.kind == "api"]
    service_nodes = [n for n in nodes if n.kind == "service"]
    candidates = api_nodes or service_nodes or list(nodes)
    # Sort by symbol length (shorter = more likely a clean name)
    candidates.sort(key=lambda n: len(n.symbol))
    seen: set[str] = set()
    entries: list[str] = []
    for n in candidates:
        sym = n.symbol
        if sym not in seen:
            seen.add(sym)
            entries.append(sym)
        if len(entries) >= max_entries:
            break
    return entries


# ═══════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════════
def main() -> int:
    args = parse_args()

    # ── resolve paths ───────────────────────────────────────────────────────
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    template_path = os.path.join(script_dir, "report_template.html")
    reports_dir = os.path.join(project_root, "reports")
    os.makedirs(reports_dir, exist_ok=True)

    # ── add backend/ to Python path ─────────────────────────────────────────
    backend_path = os.path.join(project_root, "backend")
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)

    # ── derive repo name ────────────────────────────────────────────────────
    repo_input = args.repo.rstrip("/")
    if os.path.isdir(repo_input):
        repo_name = os.path.basename(os.path.abspath(repo_input))
        is_local = True
    else:
        repo_name = repo_input.split("/")[-1].replace(".git", "")
        is_local = False

    # ── derive report title and output path ─────────────────────────────────
    report_title = args.title or f"{repo_name} Codebase Health Report"
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    default_output = os.path.join(reports_dir, f"{repo_name}_{ts}.html")
    output_path = args.output or default_output
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # ── scoped org_id — throwaway namespace ──────────────────────────────────
    org_id = f"report-{uuid.uuid4().hex[:8]}"

    print()
    print(_c("bold", "  +==========================================+"))
    print(_c("bold", "  |    Branchdeck Codebase Health Report     |"))
    print(_c("bold", "  +==========================================+"))
    print(f"  {_c('dim', 'Repo:   ')} {repo_input}")
    print(f"  {_c('dim', 'Client: ')} {args.client or '(not specified)'}")
    print(f"  {_c('dim', 'Output: ')} {output_path}")
    print(f"  {_c('dim', 'OrgID:  ')} {org_id}  (throwaway)")
    print(f"  {_c('dim', 'Gemini: ')} {'enabled (--use-gemini)' if args.use_gemini else 'disabled (local narrator)'}")

    start_time = time.time()
    workspace: Optional[str] = None
    started_docker = False
    db = None
    sqlite_path = ""  # set by setup_database for SQLite runs; deleted on cleanup
    sections_unavailable: list[str] = []

    # Cleanup handler — always runs even on Ctrl+C
    def _cleanup():
        nonlocal workspace, started_docker, db, sqlite_path
        import gc
        if db is not None:
            if not args.keep_db:
                _banner("Cleaning up database rows...")
                try:
                    from report_engine import cleanup_run
                    cleanup_run(db, org_id)
                except Exception as e:
                    _warn(f"DB cleanup failed: {e}")
            try:
                db.close()
            except Exception:
                pass
            db = None
        # Dispose the SQLAlchemy engine to fully release SQLite file locks
        try:
            from database import engine as _db_engine
            if _db_engine is not None:
                _db_engine.dispose()
        except Exception:
            pass
        gc.collect()  # flush any lingering connection refs on Windows
        # Delete the per-run SQLite file (retry once on Windows lock)
        if sqlite_path and os.path.exists(sqlite_path):
            for _attempt in range(3):
                try:
                    os.remove(sqlite_path)
                    _ok(f"Removed SQLite DB: {sqlite_path}")
                    break
                except OSError:
                    if _attempt < 2:
                        time.sleep(0.5)
                    else:
                        _warn(f"SQLite DB file will be removed on next run: {sqlite_path}")
            sqlite_path = ""
        if workspace and os.path.isdir(workspace) and not is_local:
            _banner("Removing cloned repository...")
            shutil.rmtree(workspace, ignore_errors=True)
            _ok(f"Removed: {workspace}")
        if started_docker:
            _banner("Stopping throwaway Postgres...")
            _stop_throwaway_pg(project_root)


    def _sigint_handler(sig, frame):
        print(f"\n{_c('yellow', '  ⚠ Interrupted — cleaning up…')}")
        _cleanup()
        sys.exit(2)

    signal.signal(signal.SIGINT, _sigint_handler)

    try:
        # ── STEP 1: Clone ─────────────────────────────────────────────────────
        _banner("Step 1 / 7 — Cloning repository")
        if is_local:
            workspace = os.path.abspath(repo_input)
            _ok(f"Using local path: {workspace}")
        else:
            workspace = clone_repo(args.repo, args.branch)
            if workspace is None:
                _err("Cannot proceed without a valid repository. Exiting.")
                return 2

        # ── STEP 2: Walk files ───────────────────────────────────────────────
        _banner("Step 2 / 7 — Walking repository files")
        all_files = walk_files(workspace)
        _info(f"Found {len(all_files)} files total")

        # Soft cap check
        if len(all_files) > args.max_files:
            _warn(
                f"Repository has {len(all_files)} files — above soft cap of {args.max_files}.\n"
                f"     Analysis will include all files but may take significantly longer."
            )
            if not args.no_confirm:
                try:
                    ans = input(f"\n  Proceed with all {len(all_files)} files? (y/n) ").strip().lower()
                except EOFError:
                    ans = "n"
                if ans != "y":
                    _info("Truncating to first {} files.".format(args.max_files))
                    all_files = all_files[:args.max_files]
                    _warn(f"Note: report will cover {args.max_files} of {len(all_files)} total files.")
            else:
                _info(f"--no-confirm set; proceeding with all {len(all_files)} files.")

        _ok(f"Indexing {len(all_files)} files")

        if args.dry_run:
            _ok("--dry-run: stopping before analysis.")
            return 0

        # ── STEP 3: Database setup ───────────────────────────────────────────
        _banner("Step 3 / 7 — Setting up database")
        db_url, db_mode, started_docker, sqlite_path = setup_database(
            len(all_files), project_root, org_id
        )

        # Configure the database module before importing anything else
        os.environ["DATABASE_URL"] = db_url
        if db_url.startswith("sqlite"):
            os.environ["ALLOW_SQLITE_FALLBACK"] = "true"
        if args.use_gemini and not os.getenv("GEMINI_API_KEY"):
            _warn("--use-gemini set but GEMINI_API_KEY is not in environment — will use local narrator.")

        from database import setup_db, init_db, SessionLocal, CodeNode, CodeEdge, Repository
        setup_db(db_url)
        init_db()
        db = SessionLocal()
        _ok(f"Database ready ({db_mode})")

        # ── STEP 4: Index codebase ────────────────────────────────────────────
        _banner("Step 4 / 7 — Indexing codebase")
        from report_engine import index_repo, compute_summary_stats
        try:
            repo_id, commit_sha = index_repo(
                db, org_id, workspace, all_files,
                skip_gemini=not args.use_gemini,
            )

            _ok(f"Indexed — repo_id={repo_id}  commit_sha={commit_sha}")
        except Exception as e:
            _err(f"Indexing failed: {e}")
            logger.exception("Fatal: indexing crashed")
            return 2

        # Load nodes and edges for stats
        nodes = db.query(CodeNode).filter_by(commit_sha=commit_sha, repo_id=repo_id).all()
        edges = db.query(CodeEdge).filter_by(commit_sha=commit_sha, repo_id=repo_id).all()

        # ── STEP 5: Analysis passes ───────────────────────────────────────────
        _banner("Step 5 / 7 — Running analysis passes")

        from report_engine import (
            get_call_flow, get_impact, get_blast_radius_ranking,
            get_story, get_security_findings, compute_summary_stats,
        )

        # 5a — Executive Summary stats
        stats = None
        summary_available = False
        summary_error = ""
        try:
            stats = compute_summary_stats(workspace, all_files, nodes, edges)
            summary_available = True
            _ok(f"Summary stats: {stats['node_count']} nodes, {stats['edge_count']} edges, {stats['total_loc']:,} LOC")
        except Exception as e:
            summary_error = str(e)
            sections_unavailable.append("Executive Summary")
            _warn(f"Summary stats failed: {e}")

        # 5b — Call flow (pick up to 3 entry points; skip on very large graphs)
        call_flows: list[dict] = []
        callflow_available = False
        callflow_error = ""
        CALLFLOW_NODE_LIMIT = 2000  # BFS on >2k nodes is too slow for SQLite
        try:
            if len(nodes) > CALLFLOW_NODE_LIMIT:
                _info(
                    f"Call flow skipped: {len(nodes)} nodes exceeds SQLite BFS limit "
                    f"({CALLFLOW_NODE_LIMIT}). Use Postgres for large-repo call flow."
                )
                callflow_available = True  # section renders with "skipped" message
                call_flows = [{
                    "entry_point": "(skipped — repo too large for SQLite BFS)",
                    "mermaid_code": "",
                    "node_count": 0,
                    "edge_count": 0,
                }]
            else:
                entry_points = _find_entry_points(nodes)
                _info(f"Call flow entry points: {entry_points}")
                for ep in entry_points:
                    flow = get_call_flow(db, org_id, commit_sha, ep)
                    mermaid_code = build_mermaid(flow["nodes"], flow["edges"])
                    call_flows.append({
                        "entry_point": ep,
                        "mermaid_code": mermaid_code,
                        "node_count": len(flow["nodes"]),
                        "edge_count": len(flow["edges"]),
                    })
                callflow_available = True
                _ok(f"Call flow: {len(call_flows)} entry point(s) graphed")
        except Exception as e:
            callflow_error = str(e)
            sections_unavailable.append("Visual Call Flow")
            _warn(f"Call flow failed: {e}")



        # 5c — Blast-radius impact ranking (top 5)
        impact_ranking: list[dict] = []
        impact_available = False
        impact_error = ""
        try:
            _info("Computing blast-radius ranking (may take a moment on large repos)…")
            impact_ranking = get_blast_radius_ranking(db, org_id, commit_sha, top_n=5)
            impact_available = True
            if impact_ranking:
                top = impact_ranking[0]
                _ok(f"Impact: top file '{top['file']}' with {top['blast_radius']} downstream dependents")
            else:
                _ok("Impact: no edges found — ranking empty (normal for isolated/data repos)")
        except Exception as e:
            impact_error = str(e)
            sections_unavailable.append("Impact Analysis")
            _warn(f"Impact analysis failed: {e}")

        # 5d — Story Mode (local narrator by default; Gemini if --use-gemini)
        story: dict = {}
        story_available = False
        story_error = ""
        try:
            # Pick feature ID from repo name heuristically
            feature_id = "core"
            repo_lower = repo_name.lower()
            for keyword in ("auth", "checkout", "orders", "api", "service", "app"):
                if keyword in repo_lower:
                    feature_id = keyword
                    break
            _info(f"Story Mode feature scope: '{feature_id}'")
            story = get_story(
                db, org_id, commit_sha, feature_id,
                skip_gemini=not args.use_gemini,
            )
            story_available = True
            _ok(f"Story Mode: {len(story['steps'])} steps via {story['provenance']}")
        except Exception as e:
            story_error = str(e)
            sections_unavailable.append("Story Mode")
            _warn(f"Story Mode failed: {e}")

        # 5e — Security findings
        security: dict = {}
        security_available = False
        security_error = ""
        try:
            security = get_security_findings(db, org_id, repo_id, commit_sha)
            security_available = True
            _ok(f"Security: {len(security.get('findings', []))} finding(s), {len(security.get('tags', []))} tag(s)")
        except Exception as e:
            security_error = str(e)
            sections_unavailable.append("Security Findings")
            _warn(f"Security findings failed: {e}")

        # ── STEP 6: Render report ─────────────────────────────────────────────
        _banner("Step 6 / 7 — Rendering HTML report")

        duration = round(time.time() - start_time)
        generated_at = datetime.now().strftime("%d %b %Y, %H:%M")

        context = {
            # meta
            "report_title": report_title,
            "client_name": args.client,
            "repo_url": args.repo,
            "repo_name": repo_name,
            "branch": args.branch,
            "generated_at": generated_at,
            "duration_seconds": duration,
            "db_mode": db_mode,
            # executive summary
            "summary_available": summary_available,
            "summary_error": summary_error,
            "stats": stats or {},
            # call flow
            "callflow_available": callflow_available,
            "callflow_error": callflow_error,
            "call_flows": call_flows,
            # impact
            "impact_available": impact_available,
            "impact_error": impact_error,
            "impact_ranking": impact_ranking,
            # story
            "story_available": story_available,
            "story_error": story_error,
            "story": story,
            # security
            "security_available": security_available,
            "security_error": security_error,
            "security": security,
        }

        try:
            html = render_report(template_path, context)
            with open(output_path, "w", encoding="utf-8") as fh:
                fh.write(html)
            _ok(f"HTML report saved: {output_path}")
        except Exception as e:
            _err(f"Report rendering failed: {e}")
            logger.exception("Render crashed")
            return 2

        # ── STEP 6b: PDF export (optional) ────────────────────────────────────
        if args.pdf:
            pdf_path = export_pdf(output_path)

        # ── STEP 7: Cleanup ───────────────────────────────────────────────────
        _banner("Step 7 / 7 — Cleaning up")
        _cleanup()
        workspace = None  # prevent double-cleanup in finally

        # ── SUMMARY ───────────────────────────────────────────────────────────
        total_time = round(time.time() - start_time)
        print()
        print(_c("bold", "  ======================================="))
        print(_c("bold", "  Report Complete"))
        print(_c("bold", "  ======================================="))
        print(f"  {_c('dim','Output: ')}{output_path}")
        print(f"  {_c('dim','Duration: ')}{total_time}s  |  DB mode: {db_mode}")
        if sections_unavailable:
            _warn(f"Sections unavailable: {', '.join(sections_unavailable)}")
            print()
            return 1
        else:
            _ok("All sections rendered successfully.")
            print()
            return 0

    except Exception as fatal:
        _err(f"Fatal error: {fatal}")
        logger.exception("Unexpected crash in pipeline")
        return 2
    finally:
        # Ensure cleanup always runs even on crash paths
        if workspace and os.path.isdir(workspace):
            try:
                _cleanup()
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
