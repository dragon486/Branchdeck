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
