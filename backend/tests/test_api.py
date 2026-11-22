import importlib
import os
import pathlib
import sys

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

SECRET = "test-secret-value"

STUDENT = {
    "display_name": "Asha",
    "avatar": "owl",
    "class_level": 9,
    "preferred_language": "te",
}


@pytest.fixture
def api(tmp_path, monkeypatch):
    """Fresh database per test; db and main are reloaded so they pick up the env."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("SESSION_SECRET", SECRET)
    import db
    import main

    importlib.reload(db)
    importlib.reload(main)
    client = TestClient(main.app)
    return client, main, db


def _create(client, pin="1234", **overrides):
    body = {**STUDENT, "pin": pin, **overrides}
    return client.post("/api/students", json=body)


def _login(client, sid, pin="1234"):
    return client.post(f"/api/students/{sid}/verify-pin", json={"pin": pin})


def _attempt(sid, uuid_value="a-1"):
    return {
        "uuid": uuid_value,
        "profileId": sid,
        "questionId": "q1",
        "correct": True,
        "topic": "fractions",
        "hintsUsed": 0,
        "solutionShown": False,
        "timestamp": "2024-01-01T10:00:00Z",
    }


def test_create_student_response_has_no_pin_fields(api):
    client, _main, _db = api
    r = _create(client)
    assert r.status_code == 201
    body = r.json()
    assert body["display_name"] == "Asha"
    for key in ("pin", "pin_hash", "pin_salt"):
        assert key not in body


def test_fourth_student_create_returns_409(api):
    client, _main, _db = api
    # Distinct PINs: a repeated PIN is now rejected (409) before the profile cap is reached.
    for pin in ("1111", "2222", "3333"):
        assert _create(client, pin=pin).status_code == 201
    r = _create(client, pin="4444")
    assert r.status_code == 409


def test_wrong_pin_returns_401(api):
    client, _main, _db = api
    sid = _create(client).json()["id"]
    assert _login(client, sid, pin="9999").status_code == 401


def test_five_wrong_pins_then_429(api):
    client, _main, _db = api
    sid = _create(client).json()["id"]
    for _ in range(5):
        assert _login(client, sid, pin="9999").status_code == 401
    assert _login(client, sid, pin="9999").status_code == 429


def test_correct_pin_returns_token(api):
    client, _main, _db = api
    sid = _create(client).json()["id"]
    r = _login(client, sid)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert isinstance(body["token"], str) and body["token"]
    assert body["expires_in"] == 28800


def test_sync_without_token_returns_401(api):
    client, _main, _db = api
    sid = _create(client).json()["id"]
    r = client.post("/api/sync", json={"attempts": [_attempt(sid)]})
    assert r.status_code == 401


def test_sync_with_other_profiles_token_returns_403(api):
    client, _main, _db = api
    sid_a = _create(client, pin="1111").json()["id"]
    sid_b = _create(client, pin="2222").json()["id"]
    token_b = _login(client, sid_b, pin="2222").json()["token"]
    r = client.post(
        "/api/sync",
        json={"attempts": [_attempt(sid_a)]},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r.status_code == 403


def test_sync_with_own_token_is_idempotent(api):
    client, _main, db = api
    sid = _create(client).json()["id"]
    token = _login(client, sid).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"attempts": [_attempt(sid, "a-1")]}

    r1 = client.post("/api/sync", json=payload, headers=headers)
    assert r1.status_code == 200
    assert r1.json() == {"accepted": ["a-1"]}

    r2 = client.post("/api/sync", json=payload, headers=headers)
    assert r2.status_code == 200
    assert r2.json() == {"accepted": ["a-1"]}

    assert len(db.list_attempts(sid)) == 1
