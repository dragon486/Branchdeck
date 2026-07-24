import pytest
from parser import parse_file

def test_typescript_parsing():
    mock_code = """
    import { login, register } from './auth';
    import db from '@/lib/db';
    
    export function handleRequest() {
        console.log("Processing request");
        login();
        db.saveUser();
    }
    """
    
    result = parse_file("src/app/page.tsx", mock_code)
    
    assert result["hash"] is not None
    assert "./auth" in result["imports"]
    assert "@/lib/db" in result["imports"]
    assert "login" in result["calls"]
    assert "saveUser" in result["calls"]
    assert "handleRequest" in result["declarations"]

def test_is_source_file():
    from main import is_source_file
    
    # Valid source files must return True
    assert is_source_file("webapp/src/app/api/admin/waitlist/route.ts") is True
    assert is_source_file("webapp/src/app/api/analyze/route.ts") is True
    assert is_source_file("backend/main.py") is True
    assert is_source_file("src/service.go") is True
    
    # Non-source files (dotfiles, static HTML, config) must return False
    assert is_source_file(".gitignore") is False
    assert is_source_file(".env") is False
    assert is_source_file("landing/googleee953fd7828421f3.html") is False
    assert is_source_file("index.html") is False
    assert is_source_file("README.md") is False
    assert is_source_file("package.json") is False
    assert is_source_file("package-lock.json") is False

