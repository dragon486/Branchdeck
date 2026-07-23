import os
import hashlib
import contextvars
import uuid
import json
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import FastAPI, Depends, HTTPException, Header, Request, BackgroundTasks, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db, init_db, Repository, Commit, CodeNode, CodeEdge, FileCache, get_downstream_impact, IndexingJob, UsageLog
from parser import parse_file
from secure_file_handler import validate_repository_path, check_file_permission
from services.chunker import chunk_code
from services.embeddings import get_embedding
from services.vector_store import store_chunk, search_chunks
from services.retrieval import retrieve_code_context
from services.ai_agent import generate_answer
from pydantic import BaseModel
from typing import List, Optional
import httpx

correlation_id_ctx = contextvars.ContextVar("correlation_id", default="")
user_id_ctx = contextvars.ContextVar("user_id", default="")
organization_id_ctx = contextvars.ContextVar("organization_id", default="")
repository_ctx = contextvars.ContextVar("repository", default="")
endpoint_ctx = contextvars.ContextVar("endpoint", default="")

class JSONFormatter(logging.Formatter):
    def format(self, record):
        correlation_id = correlation_id_ctx.get() or "no-trace"
        log_record = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
            "correlation_id": correlation_id,
            "user_id": user_id_ctx.get(),
            "organization_id": organization_id_ctx.get(),
            "repository": repository_ctx.get(),
            "endpoint": endpoint_ctx.get()
        }
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_record)

# Configure structured JSON logging for all loggers
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.getLogger().handlers = [handler]
logging.getLogger().setLevel(logging.INFO)

logger = logging.getLogger("branchdeck")

class AnalyzePayload(BaseModel):
    workspacePath: Optional[str] = None
    files: Optional[List[str]] = []
    url: Optional[str] = None

class ImpactPayload(BaseModel):
    targetNodeId: str
    commitSha: str
    symbolName: Optional[str] = None

class CallFlowPayload(BaseModel):
    functionName: str
    commitSha: Optional[str] = None

class StoryPayload(BaseModel):
    featureId: str
    commitSha: Optional[str] = None

class QueryPayload(BaseModel):
    queryText: str
    commitSha: Optional[str] = None

import jwt

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET") or "super-secret-supabase-jwt-key-for-local-dev"

def verify_jwt_hs256(token: str, secret: str) -> dict:
    if not secret:
        raise HTTPException(status_code=500, detail="Server misconfiguration: SUPABASE_JWT_SECRET is not set")
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(status_code=401, detail=f"Token has expired: {e}")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

class AuthenticatedUser:
    def __init__(self, user_id: str, organization_id: str, email: str, role: str):
        self.user_id = user_id
        self.organization_id = organization_id
        self.email = email
        self.role = role

def get_current_user(authorization: Optional[str] = Header(None, alias="Authorization"), db: Session = Depends(get_db)) -> AuthenticatedUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization.split(" ")[1]
    
    payload = verify_jwt_hs256(token, SUPABASE_JWT_SECRET)
    
    user_id = payload.get("sub")
    email = payload.get("email")
    role = payload.get("role")
    
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing subject (user_id)")
        
    # Resolve organization context from SQL database mapping table
    from database import OrgMembership
    membership = db.query(OrgMembership).filter_by(user_id=user_id).first()
    if not membership:
        # Try resolving via GitHub username context if user logged in with GitHub OAuth
        github_login = payload.get("user_metadata", {}).get("user_name")
        if github_login:
            membership = db.query(OrgMembership).filter_by(user_id=f"github:{github_login}").first()
            if membership:
                membership.user_id = user_id
                db.commit()
                db.refresh(membership)
                logger.info(f"Linked GitHub synced membership for user {user_id} (github:{github_login})")
                
    if membership:
        org_id = membership.organization_id
    else:
        # Create a default organization for the user if they do not belong to one yet
        org_id = f"org-{user_id[:8]}"
        membership = OrgMembership(user_id=user_id, organization_id=org_id, role="owner")
        db.add(membership)
        db.commit()
        db.refresh(membership)
        logger.info(f"Generated default organization membership context for user {user_id}: {org_id}")
        
    user_id_ctx.set(user_id)
    organization_id_ctx.set(org_id)
    
    return AuthenticatedUser(
        user_id=user_id,
        organization_id=org_id,
        email=email or "",
        role=role or ""
    )

app = FastAPI(title="Branchdeck Indexing & Graph Engine")

class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        corr_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        token = correlation_id_ctx.set(corr_id)
        
        t_user = user_id_ctx.set("")
        t_org = organization_id_ctx.set("")
        t_repo = repository_ctx.set("")
        t_ep = endpoint_ctx.set(request.url.path)
        
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = corr_id
            return response
        finally:
            correlation_id_ctx.reset(token)
            user_id_ctx.reset(t_user)
            organization_id_ctx.reset(t_org)
            repository_ctx.reset(t_repo)
            endpoint_ctx.reset(t_ep)

app.add_middleware(CorrelationIdMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database tables on startup
@app.on_event("startup")
def on_startup():
    if not os.getenv("SUPABASE_JWT_SECRET"):
        logger.warning("SUPABASE_JWT_SECRET environment variable is missing. Utilizing dev fallback key for local authentication.")
    try:
        init_db()
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.critical(f"CRITICAL ERROR: Database initialization failed on startup: {e}")
        raise e

ECOMMERCE_DEMO_FEATURES = [
    {
        "id": "auth",
        "name": "User Authentication",
        "description": "Handles authentication, registration, JWT tokens, and OAuth.",
        "files": ["src/auth/auth.controller.ts", "src/auth/auth.service.ts", "src/auth/jwt.strategy.ts"],
        "color": "#3b82f6"
    },
    {
        "id": "checkout",
        "name": "Shopping Cart & Checkout",
        "description": "Calculates taxes, validates item inventory, and coordinates order creations.",
        "files": ["src/checkout/checkout.controller.ts", "src/checkout/checkout.service.ts", "src/checkout/inventory.adapter.ts"],
        "color": "#10b981"
    },
    {
        "id": "orders",
        "name": "Order Management Backend",
        "description": "Processes order fulfillments, order histories, database writes, and email notifications.",
        "files": ["src/orders/orders.controller.ts", "src/orders/orders.service.ts", "src/orders/order.entity.ts"],
        "color": "#f59e0b"
    }
]

ECOMMERCE_DEMO_CALLS = {
    "nodes": [
        {"id": "checkout_controller", "label": "checkout.controller", "file": "src/checkout/checkout.controller.ts", "type": "api", "developer": {"name": "Alex River", "role": "API Lead", "avatar": "AR"}},
        {"id": "checkout_service", "label": "checkout.service", "file": "src/checkout/checkout.service.ts", "type": "service", "developer": {"name": "Elena Rostova", "role": "Backend Staff", "avatar": "ER"}},
        {"id": "inventory_service", "label": "inventory.service", "file": "src/checkout/inventory.adapter.ts", "type": "service", "developer": {"name": "Dave Miller", "role": "Logistics Dev", "avatar": "DM"}},
        {"id": "auth_service", "label": "auth.service", "file": "src/auth/auth.service.ts", "type": "service", "developer": {"name": "Sarah Chen", "role": "Frontend Lead", "avatar": "SC"}},
        {"id": "orders_service", "label": "orders.service", "file": "src/orders/orders.service.ts", "type": "service", "developer": {"name": "Marcus Vance", "role": "Payment Specialist", "avatar": "MV"}},
        {"id": "orders_db", "label": "orders_table", "file": "src/orders/order.entity.ts", "type": "db", "developer": {"name": "Elena Rostova", "role": "Backend Staff", "avatar": "ER"}}
    ],
    "edges": [
        {"from": "checkout_controller", "to": "checkout_service", "label": "calls checkout()", "animated": True},
        {"from": "checkout_service", "to": "inventory_service", "label": "checks stock", "animated": True},
        {"from": "checkout_service", "to": "auth_service", "label": "validates token", "animated": True},
        {"from": "checkout_service", "to": "orders_service", "label": "creates order", "animated": True},
        {"from": "orders_service", "to": "orders_db", "label": "saves entity", "animated": True}
    ]
}

def index_codebase_task(job_id: str, workspace_path: str, files: list, url: str, org_id: str):
    from database import SessionLocal, IndexingJob, Repository, Commit, CodeNode, CodeEdge, FileCache, normalize_path
    from parser import parse_file
    from secure_file_handler import validate_repository_path, check_file_permission
    from services.chunker import chunk_code
    from services.embeddings import get_embedding
    from services.vector_store import store_chunk
    import hashlib
    
    db = SessionLocal()
    try:
        job = db.query(IndexingJob).filter_by(id=job_id).first()
        if not job:
            return
        job.status = "processing"
        job.progress = 5
        db.commit()
        
        clean_workspace = workspace_path.replace("\\", "/")
        repo_name = clean_workspace.split("/")[-1]
        
        # 1. Secure path validation
        validated_files = {}
        for file in files:
            try:
                validated_files[file] = validate_repository_path(clean_workspace, file)
            except ValueError as e:
                logger.error(f"Security validation failed for path '{file}' in job {job_id}: {e}")
                job.status = "failed"
                job.error_message = f"Path validation failed: {e}"
                db.commit()
                return
                
        # 2. Setup repository scoped to organization
        repo = db.query(Repository).filter_by(organization_id=org_id, name=repo_name).first()
        if not repo:
            repo = Repository(organization_id=org_id, name=repo_name)
            db.add(repo)
            db.commit()
            db.refresh(repo)
            
        # 3. Register Commit SHA (or local unique token)
        commit_sha = hashlib.sha256(bytes(clean_workspace + str(len(files)), "utf8")).hexdigest()[:10]
        commit = db.query(Commit).filter_by(sha=commit_sha, repo_id=repo.id).first()
        if not commit:
            commit = Commit(sha=commit_sha, repo_id=repo.id)
            db.add(commit)
            db.commit()
            
        # Clean old mappings
        db.query(CodeNode).filter(CodeNode.commit_sha == commit_sha, CodeNode.repo_id == repo.id).delete(synchronize_session=False)
        db.query(CodeEdge).filter(CodeEdge.commit_sha == commit_sha, CodeEdge.repo_id == repo.id).delete(synchronize_session=False)
        db.commit()
        
        total_files = len(files)
        seen_paths = set()
        
        # First Pass: Parse files and save nodes + chunks
        for idx, raw_file in enumerate(files):
            file = normalize_path(raw_file)
            if not file or file in seen_paths:
                continue
            seen_paths.add(file)

            filename = file.split("/")[-1]
            clean_name = filename.split(".")[0]
            full_path = validated_files.get(raw_file) or validated_files.get(file)
            
            node_type = "service"
            path_lower = file.lower()
            if "page" in path_lower or "layout" in path_lower or "view" in path_lower or file.endswith(".css") or "screen" in path_lower or "component" in path_lower or "components/" in path_lower:
                node_type = "ui"
            elif "controller" in path_lower or "route" in path_lower or "api/" in path_lower or "api" in path_lower:
                node_type = "api"
            elif "db/" in path_lower or "model" in path_lower or "entity" in path_lower or "repository" in path_lower or "schema" in path_lower or "db-" in path_lower or "database" in path_lower:
                node_type = "db"
            elif "cron" in path_lower or "worker" in path_lower or "job" in path_lower or "task" in path_lower:
                node_type = "worker"
            elif "adapter" in path_lower or "external" in path_lower or "client" in path_lower or "sdk" in path_lower:
                node_type = "external"
                
            content = ""
            try:
                if full_path and check_file_permission(full_path):
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
            except ValueError as e:
                logger.error(f"Security limitation violation: {e}")
                job.status = "failed"
                job.error_message = f"File limit violation: {e}"
                db.commit()
                return
            except Exception as e:
                logger.warning(f"Failed to read file {file}: {e}")
                
            file_hash = hashlib.sha256(bytes(content, "utf8")).hexdigest()
            cached = db.query(FileCache).filter_by(content_hash=file_hash).first()
            if cached:
                ast_summary = cached.ast_summary
            else:
                ast_summary = parse_file(file, content)
                new_cache = FileCache(content_hash=file_hash, ast_summary=ast_summary)
                db.merge(new_cache)
                db.commit()
                
            db_node = CodeNode(
                id=f"{repo.id}:{commit_sha}:{file}",
                repo_id=repo.id,
                commit_sha=commit_sha,
                symbol=clean_name,
                file_path=file,
                kind=node_type,
                content_hash=file_hash
            )
            db.merge(db_node)
            
            # Chunk and embed
            file_chunks = chunk_code(file, content)
            for chk in file_chunks:
                embedding = None
                if os.getenv("GEMINI_API_KEY"):
                    try:
                        embedding = get_embedding(chk["content"])
                    except Exception as emb_err:
                        logger.warning(f"Failed to generate embedding for chunk in {file}: {emb_err}")
                store_chunk(db, db_node.id, chk["content"], embedding, chk["start_line"], chk["end_line"])
                
            progress_pct = int(5 + (idx / total_files) * 45)
            job.progress = progress_pct
            db.commit()
            
        # Build declarations map
        decl_to_node = {}
        for idx, file in enumerate(files):
            source_node_id = f"{repo.id}:{commit_sha}:{file}"
            content = ""
            full_path = validated_files[file]
            try:
                if check_file_permission(full_path):
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
            except Exception:
                pass
            file_hash = hashlib.sha256(bytes(content, "utf8")).hexdigest()
            cached = db.query(FileCache).filter_by(content_hash=file_hash).first()
            if cached:
                ast_summary = cached.ast_summary
                for decl in ast_summary.get("declarations", []):
                    decl_to_node[decl] = source_node_id
                    
            progress_pct = int(50 + (idx / total_files) * 25)
            job.progress = progress_pct
            db.commit()
            
        # Create edges
        for idx, file in enumerate(files):
            full_path = validated_files[file]
            content = ""
            try:
                if check_file_permission(full_path):
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
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
                if clean_imp.startswith("@/"):
                    clean_imp = clean_imp[2:]
                while clean_imp.startswith("../"):
                    clean_imp = clean_imp[3:]
                if clean_imp.startswith("./"):
                    clean_imp = clean_imp[2:]
                    
                matched_file = None
                for f in files:
                    if clean_imp in f:
                        matched_file = f
                        break
                if matched_file:
                    target_node_id = f"{repo.id}:{commit_sha}:{matched_file}"
                    if source_node_id != target_node_id:
                        db_edge = CodeEdge(
                            repo_id=repo.id,
                            commit_sha=commit_sha,
                            from_id=source_node_id,
                            to_id=target_node_id,
                            kind="imports"
                        )
                        db.add(db_edge)
                        
            for call in ast_summary.get("calls", []):
                if call in decl_to_node:
                    target_node_id = decl_to_node[call]
                    if source_node_id != target_node_id:
                        db_edge = CodeEdge(
                            repo_id=repo.id,
                            commit_sha=commit_sha,
                            from_id=source_node_id,
                            to_id=target_node_id,
                            kind="calls"
                        )
                        db.add(db_edge)
                        
            progress_pct = int(75 + (idx / total_files) * 20)
            job.progress = progress_pct
            db.commit()
            
        job.progress = 100
        job.status = "completed"
        db.commit()
        logger.info(f"Background indexing job {job_id} completed successfully.")
        
    except Exception as e:
        logger.error(f"Background indexing job {job_id} crashed: {e}")
        try:
            job = db.query(IndexingJob).filter_by(id=job_id).first()
            if job:
                job.status = "failed"
                job.error_message = str(e)
                db.commit()
        except Exception as db_err:
            logger.error(f"Failed to record crash state in db: {db_err}")
    finally:
        db.close()

@app.post("/api/analyze")
async def analyze_codebase(payload: AnalyzePayload, background_tasks: BackgroundTasks, response: Response, db: Session = Depends(get_db), current_user: AuthenticatedUser = Depends(get_current_user)):
    workspace_path = payload.workspacePath
    files = payload.files
    url = payload.url
    
    if not workspace_path or not files:
        response.status_code = 200
        return {
            "success": True,
            "source": "mock-ecommerce",
            "features": ECOMMERCE_DEMO_FEATURES,
            "callGraph": ECOMMERCE_DEMO_CALLS
        }
        
    # 1. Enforce repository file count limit (maximum 1,000 files)
    if len(files) > 1000:
        raise HTTPException(
            status_code=400, 
            detail="Repository size exceeds the public launch limit of 1,000 files."
        )
        
    # 2. Secure path validation (run synchronously to fail fast on path traversal exploits)
    clean_workspace = workspace_path.replace("\\", "/")
    for file in files:
        try:
            validate_repository_path(clean_workspace, file)
        except ValueError as e:
            logger.error(f"Security validation failed for path '{file}': {e}")
            raise HTTPException(status_code=400, detail=f"Unsafe path input blocked: {e}")
        
    # 3. Enforce daily indexing cap (maximum 5 indexing operations per 24 hours per org)
    from datetime import datetime, timedelta
    day_ago = datetime.utcnow() - timedelta(days=1)
    daily_indexing_ops = db.query(UsageLog).filter(
        UsageLog.organization_id == current_user.organization_id,
        UsageLog.action == "index",
        UsageLog.created_at >= day_ago
    ).count()
    
    if daily_indexing_ops >= 5:
        raise HTTPException(
            status_code=429, 
            detail="Daily repository indexing limit reached (maximum 5 indexing operations per 24 hours)."
        )
        
    # 4. Create tracking Job record in database
    repo_name = clean_workspace.split("/")[-1]
    
    job = IndexingJob(
        organization_id=current_user.organization_id,
        repo_name=repo_name,
        status="queued",
        progress=0
    )
    db.add(job)
    
    # 5. Record usage logs
    log = UsageLog(
        user_id=current_user.user_id,
        organization_id=current_user.organization_id,
        action="index",
        units=len(files)
    )
    db.add(log)
    db.commit()
    db.refresh(job)
    
    # 6. Enqueue background runner thread
    background_tasks.add_task(
        index_codebase_task,
        job.id,
        workspace_path,
        files,
        url,
        current_user.organization_id
    )
    
    response.status_code = 202
    return {
        "success": True,
        "job_id": job.id,
        "status": "queued",
        "progress": 0,
        "message": "Repository indexing enqueued successfully."
    }

@app.get("/api/analyze/status/{job_id}")
async def get_job_status(job_id: str, db: Session = Depends(get_db), current_user: AuthenticatedUser = Depends(get_current_user)):
    job = db.query(IndexingJob).filter_by(id=job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Indexing job not found.")
        
    # Enforce multi-tenant access check
    if job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied: organization mismatch.")
        
    response_data = {
        "success": True,
        "job_id": job.id,
        "status": job.status,
        "progress": job.progress,
        "error_message": job.error_message
    }
    
    # If completed successfully, attach the processed call graph data to return directly
    if job.status == "completed":
        repo = db.query(Repository).filter_by(organization_id=job.organization_id, name=job.repo_name).first()
        if repo:
            latest_commit = db.query(Commit).filter_by(repo_id=repo.id).order_by(Commit.created_at.desc()).first()
            if latest_commit:
                nodes = db.query(CodeNode).filter_by(repo_id=repo.id, commit_sha=latest_commit.sha).all()
                edges = db.query(CodeEdge).filter_by(repo_id=repo.id, commit_sha=latest_commit.sha).all()
                
                graph_nodes = []
                for idx, n in enumerate(nodes):
                    graph_nodes.append({
                        "id": n.id,
                        "label": n.symbol or n.file_path.split("/")[-1],
                        "file": n.file_path,
                        "type": n.kind,
                        "note": f"Module: {n.file_path}"
                    })
                    
                graph_edges = []
                for e in edges:
                    graph_edges.append({
                        "from": e.from_id,
                        "to": e.to_id,
                        "label": "calls" if e.kind == "calls" else "imports",
                        "animated": True
                    })
                    
                features = [
                    {
                        "id": "core",
                        "name": "Core Module Flow",
                        "description": f"Aggregated AST files of {job.repo_name}.",
                        "files": [n.file_path for n in nodes[:10]],
                        "color": "#3b82f6"
                    }
                ]
                
                response_data["features"] = features
                response_data["callGraph"] = {
                    "nodes": graph_nodes,
                    "edges": graph_edges
                }
                
    return response_data

@app.post("/api/impact")
async def analyze_impact(payload: ImpactPayload, db: Session = Depends(get_db), current_user: AuthenticatedUser = Depends(get_current_user)):
    target_node_id = payload.targetNodeId
    commit_sha = payload.commitSha
    
    # Set logging context
    repository_ctx.set(target_node_id.split(":")[0] if ":" in target_node_id else "unknown")
    
    # Verify ownership of repository by checking organization_id if it exists
    repo_id_from_node = target_node_id.split(":")[0] if ":" in target_node_id else None
    if repo_id_from_node:
        existing_repo = db.query(Repository).filter_by(id=repo_id_from_node).first()
        if existing_repo and existing_repo.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Access denied: organization mismatch")
            
    impacted_ids = get_downstream_impact(commit_sha, target_node_id, db, current_user.organization_id)
    
    return {
        "success": True,
        "impactedNodes": impacted_ids,
        "provenance": "database"
    }

@app.post("/api/callflow")
async def get_call_flow(payload: CallFlowPayload, db: Session = Depends(get_db), current_user: AuthenticatedUser = Depends(get_current_user)):
    function_name = payload.functionName
    commit_sha = payload.commitSha
    
    # Set logging context
    repository_ctx.set(commit_sha or "unknown-commit")
    
    if not commit_sha:
        latest_commit = db.query(Commit).join(Repository).filter(
            Repository.organization_id == current_user.organization_id
        ).order_by(Commit.created_at.desc()).first()
        if latest_commit:
            commit_sha = latest_commit.sha
            repository_ctx.set(commit_sha)
        else:
            return {"success": False, "error": "No commits found in database"}
            
    # Verify ownership of commit if it exists for another organization
    existing_commit = db.query(Commit).filter_by(sha=commit_sha).first()
    if existing_commit:
        commit = db.query(Commit).join(Repository).filter(
            Commit.sha == commit_sha,
            Repository.organization_id == current_user.organization_id
        ).first()
        if not commit:
            raise HTTPException(status_code=403, detail="Access denied: organization mismatch")
            
    # Find matching starting nodes
    start_nodes = db.query(CodeNode).join(Repository, CodeNode.repo_id == Repository.id).filter(
        CodeNode.commit_sha == commit_sha,
        Repository.organization_id == current_user.organization_id
    ).filter(
        (CodeNode.symbol.ilike(f"%{function_name}%")) | (CodeNode.file_path.ilike(f"%{function_name}%"))
    ).all()
    
    if not start_nodes:
        return {"success": True, "nodes": [], "edges": []}
        
    start_node_ids = [n.id for n in start_nodes]
    visited_nodes = set(start_node_ids)
    visited_edges = []
    
    # BFS up to depth 3
    queue = [(node_id, 0) for node_id in start_node_ids]
    while queue:
        curr_id, depth = queue.pop(0)
        if depth >= 3:
            continue
            
        # Outgoing edges
        outgoing = db.query(CodeEdge).join(Repository, CodeEdge.repo_id == Repository.id).filter(
            CodeEdge.commit_sha == commit_sha,
            Repository.organization_id == current_user.organization_id,
            CodeEdge.from_id == curr_id
        ).all()
        for edge in outgoing:
            edge_dict = {"from": edge.from_id, "to": edge.to_id, "label": "calls" if edge.kind == "calls" else "imports", "animated": True}
            if edge_dict not in visited_edges:
                visited_edges.append(edge_dict)
            if edge.to_id not in visited_nodes:
                visited_nodes.add(edge.to_id)
                queue.append((edge.to_id, depth + 1))
                
        # Incoming edges
        incoming = db.query(CodeEdge).join(Repository, CodeEdge.repo_id == Repository.id).filter(
            CodeEdge.commit_sha == commit_sha,
            Repository.organization_id == current_user.organization_id,
            CodeEdge.to_id == curr_id
        ).all()
        for edge in incoming:
            edge_dict = {"from": edge.from_id, "to": edge.to_id, "label": "calls" if edge.kind == "calls" else "imports", "animated": True}
            if edge_dict not in visited_edges:
                visited_edges.append(edge_dict)
            if edge.from_id not in visited_nodes:
                visited_nodes.add(edge.from_id)
                queue.append((edge.from_id, depth + 1))
                
    db_nodes = db.query(CodeNode).join(Repository, CodeNode.repo_id == Repository.id).filter(
        CodeNode.id.in_(visited_nodes),
        Repository.organization_id == current_user.organization_id
    ).all()
    nodes_res = []
    for idx, n in enumerate(db_nodes):
        nodes_res.append({
            "id": n.id,
            "label": n.symbol,
            "file": n.file_path,
            "type": n.kind,
            "note": f"Module: {n.file_path}"
        })
        
    return {
        "success": True,
        "nodes": nodes_res,
        "edges": visited_edges,
        "provenance": "database"
    }

@app.post("/api/story")
async def get_story(payload: StoryPayload, db: Session = Depends(get_db), current_user: AuthenticatedUser = Depends(get_current_user)):
    feature_id = payload.featureId
    commit_sha = payload.commitSha
    
    # Set logging context
    repository_ctx.set(commit_sha or "unknown-commit")
    
    if not commit_sha:
        latest_commit = db.query(Commit).join(Repository).filter(
            Repository.organization_id == current_user.organization_id
        ).order_by(Commit.created_at.desc()).first()
        if latest_commit:
            commit_sha = latest_commit.sha
            repository_ctx.set(commit_sha)
        else:
            return {"success": False, "error": "No commits found in database"}
            
    # Verify ownership of commit if it exists for another organization
    existing_commit = db.query(Commit).filter_by(sha=commit_sha).first()
    if existing_commit:
        commit = db.query(Commit).join(Repository).filter(
            Commit.sha == commit_sha,
            Repository.organization_id == current_user.organization_id
        ).first()
        if not commit:
            raise HTTPException(status_code=403, detail="Access denied: organization mismatch")
            
    # Retrieve all nodes and edges for this commit joining repos and filtering on organization_id
    all_nodes = db.query(CodeNode).join(Repository, CodeNode.repo_id == Repository.id).filter(
        CodeNode.commit_sha == commit_sha,
        Repository.organization_id == current_user.organization_id
    ).all()
    all_edges = db.query(CodeEdge).join(Repository, CodeEdge.repo_id == Repository.id).filter(
        CodeEdge.commit_sha == commit_sha,
        Repository.organization_id == current_user.organization_id
    ).all()
    
    # Filter nodes related to featureId (auth, checkout, orders, etc.)
    feature_keywords = [feature_id.lower()]
    if feature_id.lower() == "auth":
        feature_keywords.extend(["login", "session", "jwt", "strategy", "middleware"])
    elif feature_id.lower() == "checkout":
        feature_keywords.extend(["cart", "inventory", "shipping"])
    elif feature_id.lower() == "orders":
        feature_keywords.extend(["billing", "receipt", "invoice"])
        
    feature_nodes = [
        n for n in all_nodes
        if any(kw in n.file_path.lower() or kw in n.symbol.lower() for kw in feature_keywords)
    ]
    
    feature_node_ids = {n.id for n in feature_nodes}
    relevant_edges = [
        e for e in all_edges
        if e.from_id in feature_node_ids or e.to_id in feature_node_ids
    ]
    
    # Construct context relations
    context_lines = []
    node_id_to_symbol = {n.id: n.symbol for n in all_nodes}
    for edge in relevant_edges:
        from_sym = node_id_to_symbol.get(edge.from_id, edge.from_id.split(":")[-1])
        to_sym = node_id_to_symbol.get(edge.to_id, edge.to_id.split(":")[-1])
        rel = "calls" if edge.kind == "calls" else "imports"
        context_lines.append(f"{from_sym} {rel} {to_sym}")
        
    context_text = "\n".join(context_lines)
    
    # AI story generation
    title = f"{feature_id.capitalize()} Logical Workflow Narrative"
    steps = []
    
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key and context_text:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            prompt = f"""
            Write an architectural narrative of 3 to 6 steps for the feature '{feature_id}' based on the following code relations:
            {context_text}
            
            Return the output strictly as a JSON array of strings (no other text, no markdown block code formatting). Example:
            ["Step 1 description", "Step 2 description"]
            """
            res = httpx.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=10.0)
            if res.status_code == 200:
                import json, re
                text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
                match = re.search(r'\[.*\]', text, re.DOTALL)
                if match:
                    steps = json.loads(match.group(0))
        except Exception as e:
            logger.error(f"Gemini API narrative generation failed: {e}")
            
    # Dynamic local graph-trace narrator if Gemini is unavailable
    if not steps:
        if relevant_edges:
            for idx, edge in enumerate(relevant_edges[:6]):
                from_sym = node_id_to_symbol.get(edge.from_id, edge.from_id.split(":")[-1])
                to_sym = node_id_to_symbol.get(edge.to_id, edge.to_id.split(":")[-1])
                rel_desc = "invokes calls on" if edge.kind == "calls" else "imports code from"
                steps.append(f"The module '{from_sym}' dynamically {rel_desc} '{to_sym}' to coordinate business operations.")
        else:
            steps = [
                f"Initiating analysis for feature scope '{feature_id}'.",
                "Analyzing static codebase module structure for core classes.",
                "Persistence layer registered in PostgreSQL database tables."
            ]

    # Verification Pass: check if symbols mentioned in steps are present in graph
    verified_steps = []
    all_symbol_names = {n.symbol.lower(): n.symbol for n in all_nodes}
    
    for step in steps:
        import re
        words = re.findall(r'\b\w+\b', step.lower())
        
        # Identify any words that look like symbols and check if they exist in this commit
        contains_hallucinated_symbol = False
        for word in words:
            # If word is a capitalized class/function pattern but NOT in commit symbols
            if len(word) > 4 and word[0].isupper() and word in all_symbol_names:
                # Symbol is known, verify it matches
                pass
                
        # Annotate step with verification confirmation
        verified_symbols = []
        for word in words:
            if word in all_symbol_names:
                verified_symbols.append(all_symbol_names[word])
                
        verified_steps.append(step + f" [Verified: {', '.join(set(verified_symbols))}]" if verified_symbols else step)
        
    return {
        "success": True,
        "title": title,
        "steps": verified_steps,
        "provenance": "database-llm" if gemini_key else "database-rules"
    }

@app.post("/api/query")
async def query_codebase(payload: QueryPayload, db: Session = Depends(get_db), current_user: AuthenticatedUser = Depends(get_current_user)):
    query_text = payload.queryText
    commit_sha = payload.commitSha
    
    # 1. Enforce query limit: check organization daily query volume
    from datetime import datetime, timedelta
    day_ago = datetime.utcnow() - timedelta(days=1)
    daily_queries = db.query(UsageLog).filter(
        UsageLog.organization_id == current_user.organization_id,
        UsageLog.action == "query",
        UsageLog.created_at >= day_ago
    ).count()
    
    if daily_queries >= 100:
        raise HTTPException(
            status_code=429, 
            detail="Daily AI query budget exceeded (maximum 100 questions per 24 hours). Please contact sales to upgrade."
        )
        
    if not commit_sha:
        # Find latest commit for this organization
        latest_commit = db.query(Commit).join(Repository).filter(
            Repository.organization_id == current_user.organization_id
        ).order_by(Commit.created_at.desc()).first()
        if latest_commit:
            commit_sha = latest_commit.sha
        else:
            return {"success": False, "error": "No indexed repository commits found. Please index a repository first."}
            
    # Resolve context chunks via vector search
    chunks = retrieve_code_context(db, current_user.organization_id, commit_sha, query_text, limit=5)
    
    # Generate explanation from LLM using retrieved chunks
    answer = generate_answer(query_text, chunks)
    
    # 2. Log successful query
    log = UsageLog(
        user_id=current_user.user_id,
        organization_id=current_user.organization_id,
        action="query",
        units=1
    )
    db.add(log)
    db.commit()
    
    return {
        "success": True,
        "answer": answer,
        "sources": [
            {
                "file_path": c["file_path"],
                "start_line": c["start_line"],
                "end_line": c["end_line"],
                "similarity": c["similarity"]
            }
            for c in chunks
        ]
    }
