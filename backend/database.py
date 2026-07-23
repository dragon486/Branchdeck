import os
from datetime import datetime
import uuid
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
from sqlalchemy import create_engine, Column, String, ForeignKey, DateTime, JSON, Text, select, text, Float, Integer, Index, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.types import TypeDecorator, NullType

def normalize_path(path: str) -> str:
    if not path:
        return ""
    normalized = path.replace("\\", "/").strip()
    while normalized.startswith("./") or normalized.startswith("/"):
        if normalized.startswith("./"):
            normalized = normalized[2:]
        elif normalized.startswith("/"):
            normalized = normalized[1:]
    return normalized

# SafeVector handles pgvector on PostgreSQL and falls back to JSON on SQLite
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

# Database URL from environment variables
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")

engine = None
SessionLocal = None

def setup_db(url):
    global engine, SessionLocal
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False})
    else:
        engine = create_engine(url, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

setup_db(DATABASE_URL)

Base = declarative_base()

class Repository(Base):
    __tablename__ = "repos"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(100), nullable=False)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_repos_org", "organization_id"),
    )

class Commit(Base):
    __tablename__ = "commits"
    
    sha = Column(String(40), primary_key=True)
    repo_id = Column(String(36), ForeignKey("repos.id", ondelete="CASCADE"), nullable=False)
    parent_sha = Column(String(40), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_commits_repo", "repo_id"),
    )

class CodeNode(Base):
    __tablename__ = "code_nodes"
    
    id = Column(String(150), primary_key=True) # repo_id:commit_sha:file_path
    repo_id = Column(String(36), ForeignKey("repos.id", ondelete="CASCADE"), nullable=False)
    commit_sha = Column(String(40), ForeignKey("commits.sha", ondelete="CASCADE"), nullable=False)
    symbol = Column(String(100), nullable=False)
    file_path = Column(String(255), nullable=False)
    kind = Column(String(30), nullable=False) # ui, api, service, db, external, worker
    content_hash = Column(String(64), nullable=False)
    embedding = Column(SafeVector(768), nullable=True) # safe pgvector embeddings

    __table_args__ = (
        Index("idx_nodes_repo_commit", "repo_id", "commit_sha"),
        UniqueConstraint("repo_id", "commit_sha", "file_path", name="uix_nodes_repo_commit_file"),
    )

class CodeEdge(Base):
    __tablename__ = "code_edges"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repo_id = Column(String(36), ForeignKey("repos.id", ondelete="CASCADE"), nullable=False)
    commit_sha = Column(String(40), ForeignKey("commits.sha", ondelete="CASCADE"), nullable=False)
    from_id = Column(String(150), ForeignKey("code_nodes.id", ondelete="CASCADE"), nullable=False)
    to_id = Column(String(150), ForeignKey("code_nodes.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(30), nullable=False) # imports, calls

    __table_args__ = (
        Index("idx_edges_repo_commit", "repo_id", "commit_sha"),
        Index("idx_edges_from", "from_id"),
        Index("idx_edges_to", "to_id"),
    )

class CodeChunk(Base):
    __tablename__ = "code_chunks"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    node_id = Column(String(150), ForeignKey("code_nodes.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(SafeVector(768), nullable=True)
    start_line = Column(Integer, nullable=False)
    end_line = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_chunks_node", "node_id"),
    )

class OrgMembership(Base):
    __tablename__ = "org_memberships"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(100), nullable=False)
    organization_id = Column(String(100), nullable=False)
    role = Column(String(50), nullable=False, default="Developer")
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_memberships_user", "user_id"),
    )

class TeamInvitation(Base):
    __tablename__ = "team_invitations"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(100), nullable=False)
    invited_by = Column(String(100), nullable=False)
    invitee_email = Column(String(100), nullable=False)
    role = Column(String(50), nullable=False, default="Developer")
    repo_source = Column(String(255), nullable=True)
    token = Column(String(64), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default="pending") # pending, accepted, expired
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    __table_args__ = (
        Index("idx_invitations_token", "token"),
    )

class FileCache(Base):
    __tablename__ = "file_cache"
    
    content_hash = Column(String(64), primary_key=True)
    ast_summary = Column(JSON, nullable=False) # Contains {"imports": [], "calls": []}
    created_at = Column(DateTime, default=datetime.utcnow)

class IndexingJob(Base):
    __tablename__ = "indexing_jobs"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(100), nullable=False)
    repo_name = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False, default="queued") # queued, processing, completed, failed
    progress = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_jobs_org", "organization_id"),
    )

class UsageLog(Base):
    __tablename__ = "usage_logs"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(100), nullable=False)
    organization_id = Column(String(100), nullable=False)
    action = Column(String(50), nullable=False) # query, index
    units = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_usage_org_date", "organization_id", "created_at"),
    )

# Database Session Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

# Initialize tables
def init_db():
    global DATABASE_URL
    max_retries = 5
    backoff = 1.0
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Database initialization attempt {attempt}/{max_retries}...")
            # Try connecting and executing a simple query
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            Base.metadata.create_all(bind=engine)
            logger.info("Database initialized successfully.")
            return
        except Exception as e:
            logger.error(f"Database initialization attempt {attempt} failed: {e}")
            if attempt == max_retries:
                if "postgresql" in DATABASE_URL:
                    logger.critical("Max retries reached. PostgreSQL is unreachable. Failing fast to prevent silent database substitution.")
                    raise e
                else:
                    fallback_url = "sqlite:///branchdeck.db"
                    logger.critical(f"Max retries reached. Falling back to SQLite: {fallback_url}")
                    setup_db(fallback_url)
                    Base.metadata.create_all(bind=engine)
                    logger.info("SQLite database initialized successfully.")
            else:
                logger.info(f"Retrying in {backoff} seconds...")
                time.sleep(backoff)
                backoff *= 2

# Executes the recursive CTE query to trace transitive caller connections
def get_downstream_impact(commit_sha: str, target_node_id: str, db, organization_id: str) -> list:
    query = text("""
        WITH RECURSIVE downstream AS (
          -- Anchor: direct nodes calling the target
          SELECT e.from_id, e.to_id, 1 as depth
          FROM code_edges e
          INNER JOIN repos r ON e.repo_id = r.id
          WHERE e.to_id = :target_node_id 
            AND e.commit_sha = :commit_sha 
            AND r.organization_id = :organization_id
          
          UNION ALL
          
          -- Recursive step: callers of those callers
          SELECT e.from_id, e.to_id, d.depth + 1
          FROM code_edges e
          INNER JOIN repos r ON e.repo_id = r.id
          INNER JOIN downstream d ON e.to_id = d.from_id
          WHERE e.commit_sha = :commit_sha 
            AND r.organization_id = :organization_id
            AND d.depth < 10
        )
        SELECT DISTINCT from_id FROM downstream;
    """)
    result = db.execute(query, {
        "target_node_id": target_node_id, 
        "commit_sha": commit_sha,
        "organization_id": organization_id
    })
    return [row[0] for row in result.fetchall()]
