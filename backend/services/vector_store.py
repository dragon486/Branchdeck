import math
import logging
import json
from sqlalchemy import text
from sqlalchemy.orm import Session
from database import CodeChunk

logger = logging.getLogger("branchdeck.vector_store")

def dot_product(v1, v2):
    return sum(x * y for x, y in zip(v1, v2))

def magnitude(v):
    return math.sqrt(sum(x * x for x in v))

def cosine_similarity(v1, v2):
    m1 = magnitude(v1)
    m2 = magnitude(v2)
    if m1 == 0 or m2 == 0:
        return 0.0
    return dot_product(v1, v2) / (m1 * m2)

def store_chunk(db: Session, node_id: str, content: str, embedding: list, start_line: int, end_line: int) -> CodeChunk:
    """
    Inserts a codebase chunk and its vector representation into the database.
    """
    # SQLite fallback: store list directly (SqlAlchemy JSON type handles serialization)
    chunk = CodeChunk(
        node_id=node_id,
        content=content,
        embedding=embedding,
        start_line=start_line,
        end_line=end_line
    )
    db.add(chunk)
    return chunk

def search_chunks(db: Session, org_id: str, commit_sha: str, query_embedding: list, limit: int = 5) -> list:
    """
    Searches for codebase chunks closest to the query embedding.
    Uses pgvector operator <=> in PostgreSQL production database, or falls back
    to pure Python cosine similarity if SQLite or non-vector PostgreSQL is in use.
    """
    dialect_name = db.bind.dialect.name
    
    if dialect_name == 'postgresql':
        try:
            # Check if pgvector operator is executable
            # Stringify list to postgres vector style: '[val1,val2,...]'
            vector_str = "[" + ",".join(map(str, query_embedding)) + "]"
            query = text("""
                SELECT c.node_id, c.content, c.start_line, c.end_line, n.file_path, n.symbol,
                       (1 - (c.embedding <=> :query_embedding)) as similarity
                FROM code_chunks c
                JOIN code_nodes n ON c.node_id = n.id
                JOIN repos r ON n.repo_id = r.id
                WHERE r.organization_id = :org_id 
                  AND n.commit_sha = :commit_sha
                  AND c.embedding IS NOT NULL
                ORDER BY c.embedding <=> :query_embedding
                LIMIT :limit
            """)
            result = db.execute(query, {
                "org_id": org_id,
                "commit_sha": commit_sha,
                "query_embedding": vector_str,
                "limit": limit
            })
            
            results = []
            for row in result.fetchall():
                results.append({
                    "node_id": row[0],
                    "content": row[1],
                    "start_line": row[2],
                    "end_line": row[3],
                    "file_path": row[4],
                    "symbol": row[5],
                    "similarity": float(row[6])
                })
            return results
        except Exception as e:
            logger.warning(f"PostgreSQL pgvector query failed: {e}. Falling back to Python-based similarity.")
            
    # Python-based Fallback (for SQLite or non-pgvector Postgres)
    query = text("""
        SELECT c.node_id, c.content, c.start_line, c.end_line, n.file_path, n.symbol, c.embedding
        FROM code_chunks c
        JOIN code_nodes n ON c.node_id = n.id
        JOIN repos r ON n.repo_id = r.id
        WHERE r.organization_id = :org_id 
          AND n.commit_sha = :commit_sha
          AND c.embedding IS NOT NULL
    """)
    
    try:
        result = db.execute(query, {
            "org_id": org_id,
            "commit_sha": commit_sha
        })
        
        candidates = []
        for row in result.fetchall():
            node_id, content, start_line, end_line, file_path, symbol, embedding_raw = row
            
            # Parse embedding if serialized as string
            embedding = None
            if isinstance(embedding_raw, str):
                try:
                    embedding = json.loads(embedding_raw)
                except Exception:
                    pass
            elif isinstance(embedding_raw, list):
                embedding = embedding_raw
                
            if not embedding or len(embedding) != len(query_embedding):
                continue
                
            sim = cosine_similarity(query_embedding, embedding)
            candidates.append({
                "node_id": node_id,
                "content": content,
                "start_line": start_line,
                "end_line": end_line,
                "file_path": file_path,
                "symbol": symbol,
                "similarity": sim
            })
            
        # Sort descending by similarity score
        candidates.sort(key=lambda x: x["similarity"], reverse=True)
        return candidates[:limit]
        
    except Exception as e:
        logger.error(f"Search candidates fetch error: {e}")
        return []
