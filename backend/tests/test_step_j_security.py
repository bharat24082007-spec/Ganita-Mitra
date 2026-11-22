"""Step J security and configuration tests.

Covers: DATABASE_PATH resolution (relative, absolute, default), the strict CheckRequest
contract, the tutor upstream error mapping (429 / 502) with no credential leakage, the
removal of the public student list, duplicate-PIN rejection, and PIN-only login with
per-device lockout.
"""
import importlib
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent
for _path in (PROJECT_ROOT, BACKEND_DIR):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

SECRET = "test-secret-step-j"
STUDENT = {
    "display_name": "Asha",
    "avatar": "owl",
    "class_level": 9,
    "preferred_language": "te",
    "pin": "1234",
}
CHECK_QID = "q1"


def _print_db_path(cwd, extra_env=None):
    """Import db in a fresh interpreter and print DB_PATH. DATABASE_PATH is removed unless given."""
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_PATH"}
    env["PYTHONPATH"] = str(BACKEND_DIR)
    if extra_env:
        env.update(extra_env)
    result = subprocess.run(
        [sys.executable, "-c", "import db; print(db.DB_PATH)"],
        cwd=str(cwd),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip().splitlines()[-1]


# a) Default path: absolute, under <project root>/backend/data/tutor.db, independent of cwd.
def test_default_db_path_is_project_root_and_cwd_independent():
    expected = os.path.normpath(os.path.join(str(PROJECT_ROOT), "backend", "data", "tutor.db"))
    from_root = _print_db_path(PROJECT_ROOT)
    from_backend = _print_db_path(BACKEND_DIR)
    assert os.path.normpath(from_root) == expected
    assert os.path.normpath(from_backend) == expected
    assert from_root == from_backend


# b) Absolute DATABASE_PATH is honoured unchanged.
def test_absolute_database_path_is_honoured():
    tmp_dir = tempfile.mkdtemp(prefix="step_j_db_")
    try:
        abs_db = os.path.join(tmp_dir, "abs-test.db")
        printed = _print_db_path(PROJECT_ROOT, extra_env={"DATABASE_PATH": abs_db})
        assert os.path.normpath(printed) == os.path.normpath(abs_db)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@pytest.fixture
def api(tmp_path, monkeypatch):
    """Fresh temporary database per test; db and main are reloaded so they pick up the env."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "step-j.db"))
    monkeypatch.setenv("SESSION_SECRET", SECRET)
    import db
    import main

    importlib.reload(db)
    importlib.reload(main)
    client = TestClient(main.app)
    return client, main, db


def _student_token(client):
    sid = client.post("/api/students", json=STUDENT).json()["id"]
    return client.post(f"/api/students/{sid}/verify-pin", json={"pin": "1234"}).json()["token"]


# c) CheckRequest rejects unexpected fields (extra="forbid"); the real field "lang" is accepted.
def test_check_rejects_unexpected_language_field(api):
    client, _main, _db = api
    headers = {"Authorization": "Bearer " + _student_token(client)}
    r = client.post(
        f"/api/questions/{CHECK_QID}/check",
        json={"language": "en", "answer": "x"},
        headers=headers,
    )
    assert r.status_code == 422


def test_check_accepts_lang_field_on_schema_grounds(api):
    client, _main, _db = api
    headers = {"Authorization": "Bearer " + _student_token(client)}
    r = client.post(
        f"/api/questions/{CHECK_QID}/check",
        json={"lang": "en", "answer": "x"},
        headers=headers,
    )
    assert r.status_code != 422


# d) Tutor upstream errors: RateLimited -> 429, other TutorUpstreamError -> 502, no leakage.
@pytest.mark.parametrize(
    "exc_factory, expected_status",
    [
        (lambda tutor_mod: tutor_mod.RateLimited(), 429),
        (lambda tutor_mod: tutor_mod.TutorUpstreamError("status"), 502),
    ],
)
def test_tutor_upstream_errors_map_to_status_without_leaking(api, monkeypatch, exc_factory, expected_status):
    client, main, _db = api
    import tutor

    monkeypatch.setattr(main, "RATE_LIMITER", tutor.RateLimiter())

    def _raise(*_args, **_kwargs):
        raise exc_factory(tutor)

    monkeypatch.setattr(tutor, "answer_tutor", _raise)
    headers = {"Authorization": "Bearer " + _student_token(client)}
    r = client.post("/api/tutor", json={"message": "help me", "language": "en"}, headers=headers)
    assert r.status_code == expected_status
    body_text = r.text.lower()
    assert "traceback" not in body_text
    assert "api" not in body_text
    assert "key" not in body_text
    assert "detail" in r.json()


# e) The public student list is removed: GET /api/students no longer returns student names or IDs.
# Starlette answers 405 here (the path exists for POST only) or 404 if no route matches.
def test_students_list_not_public(api):
    client, _main, _db = api
    created = client.post("/api/students", json=STUDENT).json()
    r = client.get("/api/students")
    assert r.status_code in (404, 405)
    assert created["display_name"] not in r.text
    assert created["id"] not in r.text


def _create_with_pin(client, pin, display_name="Asha"):
    return client.post("/api/students", json={**STUDENT, "pin": pin, "display_name": display_name})


def _login_by_pin(client, pin, device_id="device-a"):
    return client.post("/api/students/login-by-pin", json={"pin": pin, "device_id": device_id})


# f) PIN-only login: correct PIN returns a token; wrong PIN returns 401.
def test_login_by_pin_correct_pin_returns_token(api):
    client, _main, _db = api
    _create_with_pin(client, "1234")
    r = _login_by_pin(client, "1234")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert isinstance(body["token"], str) and body["token"]
    assert body["expires_in"] == 28800
    assert set(body) == {"ok", "student_id", "display_name", "avatar", "preferred_language", "token", "expires_in"}


def test_login_by_pin_returns_student_id(api):
    client, _main, _db = api
    created = _create_with_pin(client, "1234").json()
    r = _login_by_pin(client, "1234")
    assert r.status_code == 200
    body = r.json()
    assert body["student_id"] == created["id"]
    assert body["display_name"] == "Asha"


def test_login_by_pin_returns_avatar_and_language(api):
    client, _main, _db = api
    created = client.post(
        "/api/students",
        json={**STUDENT, "pin": "1234", "avatar": "owl", "preferred_language": "en"},
    )
    assert created.status_code == 201
    r = _login_by_pin(client, "1234")
    assert r.status_code == 200
    body = r.json()
    assert body["avatar"] == "owl"
    assert body["preferred_language"] == "en"
    assert "pin_hash" not in body
    assert "pin_salt" not in body


def test_login_by_pin_wrong_pin_returns_401(api):
    client, _main, _db = api
    _create_with_pin(client, "1234")
    assert _login_by_pin(client, "9999").status_code == 401


# g) Five wrong PINs from one device lock that device, even for the correct PIN.
def test_login_by_pin_five_failures_lock_device(api):
    client, _main, _db = api
    _create_with_pin(client, "1234")
    for _ in range(5):
        assert _login_by_pin(client, "9999", device_id="device-lock").status_code == 401
    assert _login_by_pin(client, "1234", device_id="device-lock").status_code == 429


# h) A different device is not locked by another device's failures.
def test_login_by_pin_lockout_is_per_device(api):
    client, _main, _db = api
    _create_with_pin(client, "1234")
    for _ in range(5):
        _login_by_pin(client, "9999", device_id="device-one")
    assert _login_by_pin(client, "1234", device_id="device-one").status_code == 429
    assert _login_by_pin(client, "1234", device_id="device-two").status_code == 200


# i) A second profile cannot reuse an existing PIN.
def test_create_student_with_existing_pin_returns_409(api):
    client, _main, _db = api
    assert _create_with_pin(client, "1234", "Asha").status_code == 201
    r = _create_with_pin(client, "1234", "Ravi")
    assert r.status_code == 409
    assert r.json()["detail"] == "PIN already in use on this device. Choose a different PIN."
