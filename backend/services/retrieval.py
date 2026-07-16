from sqlalchemy.orm import Session
from services.embeddings import get_embedding
from services.vector_store import search_chunks

def retrieve_code_context(db: Session, org_id: str, commit_sha: str, query: str, limit: int = 5) -> list:
    """
    Given a user natural language query, generates its vector embedding and
    retrieves the top matching code chunks scoped to the active organization and commit SHA.
    """
    try:
        query_embedding = get_embedding(query)
        return search_chunks(db, org_id, commit_sha, query_embedding, limit=limit)
    except Exception:
        # Graceful return of empty context if embeddings service fails
        return []
