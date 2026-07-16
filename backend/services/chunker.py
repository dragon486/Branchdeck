def chunk_code(filepath: str, content: str) -> list:
    """
    Chunks file content into chunks of up to 40 lines with a 10-line overlap.
    Returns a list of dictionaries with chunk keys: 'content', 'start_line', 'end_line'.
    """
    lines = content.splitlines()
    total_lines = len(lines)
    if total_lines == 0:
        return []
        
    chunk_size = 40
    overlap = 10
    chunks = []
    
    start = 0
    while start < total_lines:
        end = min(start + chunk_size, total_lines)
        chunk_lines = lines[start:end]
        
        # Build contextual prefix
        prefix = f"// File: {filepath} (Lines {start + 1}-{end})\n"
        chunk_content = prefix + "\n".join(chunk_lines)
        
        chunks.append({
            "content": chunk_content,
            "start_line": start + 1,
            "end_line": end
        })
        
        if end == total_lines:
            break
            
        start += (chunk_size - overlap)
        
    return chunks
