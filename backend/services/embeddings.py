import os
import time
import httpx
import logging

logger = logging.getLogger("branchdeck.embeddings")

_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 1.0  # seconds; doubles on each retry

def get_embedding(text: str) -> list:
    """
    Calls Google's Gemini API to generate a 768-dimensional text embedding using text-embedding-004.
    Requires GEMINI_API_KEY to be set in environment variables.
    Retries up to 3 times with exponential backoff on transient failures.
    """
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        logger.error("Missing GEMINI_API_KEY environment variable.")
        raise ValueError("GEMINI_API_KEY is not configured in the environment.")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={gemini_key}"
    payload = {
        "content": {
            "parts": [{"text": text}]
        }
    }
    
    last_error: Exception = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = httpx.post(url, json=payload, timeout=15.0)
            if response.status_code != 200:
                # Truncate response body to 200 chars to avoid logging any credential-adjacent data
                body_snippet = response.text[:200] if response.text else ""
                logger.error(f"Gemini API returned status {response.status_code} (attempt {attempt}): {body_snippet}")
                last_error = ValueError(f"Gemini API returned status code {response.status_code}")
                if response.status_code in (429, 500, 502, 503, 504):
                    # Transient errors — retry with backoff
                    delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    logger.info(f"Retrying embedding call in {delay}s (attempt {attempt}/{_MAX_RETRIES})...")
                    time.sleep(delay)
                    continue
                raise last_error  # Non-retryable (400, 401, 403, etc.)
                
            data = response.json()
            values = data.get("embedding", {}).get("values")
            if not values or len(values) != 768:
                logger.error(f"Invalid embedding dimensions returned from Gemini. Expected 768, got: {len(values) if values else 0}")
                raise ValueError("Invalid embedding schema or dimension size returned from Gemini API.")
                
            return values
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_error = e
            delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
            logger.warning(f"Network error during Gemini embedding call (attempt {attempt}/{_MAX_RETRIES}): {e}. Retrying in {delay}s...")
            time.sleep(delay)
        except ValueError:
            raise  # Propagate validation errors immediately
        except Exception as e:
            last_error = e
            logger.error(f"Unexpected exception during Gemini embedding API call (attempt {attempt}): {e}")
            break
    
    logger.error(f"Gemini embedding call failed after {_MAX_RETRIES} attempts.")
    raise last_error or RuntimeError("Embedding generation failed after all retries.")
