import os
import re
from pathlib import Path

ALLOWED_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".py", ".go"}
MAX_FILE_SIZE_MB = 2.0

def is_subpath(child: Path, parent: Path) -> bool:
    try:
        # Resolves relative subpath; raises ValueError if not a subpath
        child.relative_to(parent)
        return True
    except ValueError:
        return False

def validate_repository_path(base_dir: str, relative_path: str) -> str:
    """
    Validates that the relative path resolved against base_dir remains strictly within base_dir.
    Rejects path traversals, symbolic link escapes, directory targets, and disallowed file types.
    """
    if not base_dir:
        raise ValueError("Repository base directory must be specified.")
        
    # Resolve absolute paths and normalize slashes
    base_path = Path(base_dir).resolve()
    
    # Strip any drive letters, leading slashes/backslashes to prevent absolute path injection
    cleaned_rel = relative_path.replace("\\", "/").lstrip("/")
    while cleaned_rel.startswith("../"):
        raise ValueError(f"Path traversal attempt blocked: {relative_path}")
        
    target_path = Path(os.path.join(str(base_path), cleaned_rel)).resolve()
    
    # Enforce subpath isolation
    if not is_subpath(target_path, base_path):
        raise ValueError(f"Path traversal detected: {relative_path} attempts to escape workspace root.")
        
    # Check for symlink escapes
    if target_path.is_symlink():
        real_target = target_path.resolve()
        if not is_subpath(real_target, base_path):
            raise ValueError(f"Symlink targets folder outside workspace: {relative_path}")
            
    # Allowed file extensions check
    if target_path.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file extension: '{target_path.suffix}' in path: {relative_path}")
        
    return str(target_path)

def check_file_permission(filepath: str) -> bool:
    """
    Checks if a file exists, is a file (not directory), and is readable.
    Also validates that its file size does not exceed MAX_FILE_SIZE_MB.
    """
    path = Path(filepath)
    if not path.exists() or not path.is_file():
        return False
        
    if not os.access(filepath, os.R_OK):
        return False
        
    # Validate file size
    size_bytes = os.path.getsize(filepath)
    max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024
    if size_bytes > max_bytes:
        raise ValueError(f"File size exceeds the limit of {MAX_FILE_SIZE_MB}MB.")
        
    return True

def sanitize_filename(filename: str) -> str:
    """
    Sanitizes single file names by retaining only standard alphanumeric and safe punctuation characters.
    """
    return re.sub(r'[^a-zA-Z0-9_\-\.]', '', filename)
