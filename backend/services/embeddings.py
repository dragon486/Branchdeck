import os
import httpx
import logging

logger = logging.getLogger("branchdeck.embeddings")

def get_embedding(text: str) -> list:
    """
    Calls Google's Gemini API to generate a 768-dimensional text embedding using text-embedding-004.
    Requires GEMINI_API_KEY to be set in environment variables.
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
    
    try:
        response = httpx.post(url, json=payload, timeout=15.0)
        if response.status_code != 200:
            logger.error(f"Gemini API returned status {response.status_code}: {response.text}")
            raise ValueError(f"Gemini API returned status code {response.status_code}: {response.text}")
            
        data = response.json()
        values = data.get("embedding", {}).get("values")
        if not values or len(values) != 768:
            logger.error(f"Invalid embedding dimensions returned from Gemini. Expected 768, got: {len(values) if values else 0}")
            raise ValueError("Invalid embedding schema or dimension size returned from Gemini API.")
            
        return values
    except Exception as e:
        logger.error(f"Exception during Gemini embedding API call: {e}")
        raise e
