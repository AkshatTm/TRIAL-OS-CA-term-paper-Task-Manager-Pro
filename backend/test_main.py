"""
Basic tests for Task Manager Pro Backend
Run with: pytest test_main.py
"""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_root_endpoint():
    """Test the root endpoint returns API info"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "version" in data
    assert data["version"] == "1.0.0"


def test_system_stats():
    """Test system stats endpoint returns expected structure"""
    response = client.get("/api/system/stats")
    assert response.status_code == 200
    data = response.json()
    
    # Check main sections exist
    assert "cpu" in data
    assert "memory" in data
    assert "disk" in data
    assert "network" in data
    assert "system" in data
    
    # Check CPU data
    assert "percent" in data["cpu"]
    assert "cores" in data["cpu"]
    assert "per_core" in data["cpu"]
    assert isinstance(data["cpu"]["percent"], (int, float))
    assert 0 <= data["cpu"]["percent"] <= 100
    
    # Check memory data
    assert "total" in data["memory"]
    assert "used" in data["memory"]
    assert "percent" in data["memory"]
    assert isinstance(data["memory"]["percent"], (int, float))
    assert 0 <= data["memory"]["percent"] <= 100


def test_processes_list():
    """Test processes endpoint returns list"""
    response = client.get("/api/processes")
    assert response.status_code == 200
    data = response.json()
    
    assert "count" in data
    assert "processes" in data
    assert isinstance(data["processes"], list)
    assert data["count"] == len(data["processes"])
    
    # Check first process structure if any exist
    if data["processes"]:
        proc = data["processes"][0]
        assert "pid" in proc
        assert "name" in proc
        assert "cpu_percent" in proc
        assert "memory_mb" in proc
        assert "status" in proc
        assert "protected" in proc


def test_invalid_process_details():
    """Test getting details for non-existent process"""
    response = client.get("/api/process/999999999")
    assert response.status_code == 404


def test_kill_protected_process():
    """Test that protected processes cannot be killed"""
    # Attempt to kill a typical protected process (PID 0 or similar)
    response = client.post("/api/process/0/kill")
    # Should fail with 403 or 404
    assert response.status_code in [403, 404]


def test_pydantic_models():
    """Test that response models are properly validated"""
    response = client.get("/api/processes")
    assert response.status_code == 200
    # If Pydantic models are working, this should not raise validation errors
    data = response.json()
    assert "count" in data
    assert "processes" in data
