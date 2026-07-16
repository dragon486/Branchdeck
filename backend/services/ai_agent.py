import os
import httpx
import logging

logger = logging.getLogger("branchdeck.ai_agent")

def generate_answer(query: str, chunks: list) -> str:
    """
    Constructs a context prompt containing the retrieved code snippets
    and queries Gemini 1.5 Flash to generate a natural language explanation.
    """
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        logger.warning("GEMINI_API_KEY is not configured in the environment.")
        return "Google Gemini API key is missing. Please configure GEMINI_API_KEY to activate AI Codebase Q&A."
        
    if not chunks:
        return "I could not find any relevant code structures matching your search in this repository. Try adding files to search or rephrasing."

    # Construct the retrieved code text blocks
    context_parts = []
    for chunk in chunks:
        context_parts.append(
            f"--- File: {chunk['file_path']} ---\n"
            f"{chunk['content']}\n"
        )
    context_text = "\n".join(context_parts)
    
    prompt = f"""
You are Branchdeck AI, an expert software architecture assistant.
Use the following retrieved code snippets from the codebase repository to answer the user's question.

Retrieved Code Snippets:
{context_text}

User Question:
{query}

Guidelines:
1. Answer the question accurately using ONLY the code snippets provided.
2. Cite the exact file names, symbols, and line numbers.
3. Be professional, technical, and concise.
4. If the snippets do not contain the answer, state that you cannot verify it from the active context.

Answer:
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ]
    }
    
    try:
        response = httpx.post(url, json=payload, timeout=25.0)
        if response.status_code != 200:
            logger.error(f"Gemini API returned status {response.status_code} during Q&A: {response.text}")
            return "Failed to query the AI reasoning service. Please check your credentials or try again."
            
        data = response.json()
        answer = data["candidates"][0]["content"]["parts"][0]["text"]
        return answer.strip()
    except Exception as e:
        logger.error(f"Exception during AI Q&A generation: {e}")
        return f"An error occurred while generating the response: {str(e)}"
