import importlib
import json
import pathlib
import sys

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent
for _path in (PROJECT_ROOT, BACKEND_DIR):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

SECRET = "test-secret-value"
SETUP_TOKEN = "test-setup-token"
PARENT_PIN = "4321"

STUDENT = {
    "display_name": "Asha",
    "avatar": "owl",
    "class_level": 9,
    "preferred_language": "te",
}

CHAPTER = json.loads((BACKEND_DIR / "chapter_linear_equations.json").read_text(encoding="utf-8"))
QUESTIONS = {q["id"]: q for q in CHAPTER["questions"]}

COEF_QID = "q1"
COEF_TOPIC = QUESTIONS[COEF_QID]["topic"]
COEF_EQ = QUESTIONS[COEF_QID]["equation"]
COEF_CORRECT = f"a={COEF_EQ['a']}, b={COEF_EQ['b']}, c={COEF_EQ['c']}"
COEF_WRONG = "a=99, b=99, c=99"


@pytest.fixture
def api(tmp_path, monkeypatch):
    """Fresh database per test; db and main are reloaded so they pick up the env."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("SESSION_SECRET", SECRET)
    monkeypatch.setenv("PARENT_SETUP_TOKEN", SETUP_TOKEN)
    import db
    import main

    importlib.reload(db)
    importlib.reload(main)
    client = TestClient(main.app)
    return client, main, db


def _create_student(client, pin="1234", **overrides):
    body = {**STUDENT, "pin": pin, **overrides}
    return client.post("/api/students", json=body)


def _student_login(client, sid, pin="1234"):
    return client.post(f"/api/students/{sid}/verify-pin", json={"pin": pin})


def _setup(client, pin=PARENT_PIN, setup_token=SETUP_TOKEN):
    headers = {} if setup_token is None else {"X-Setup-Token": setup_token}
    return client.post("/api/parents/setup", json={"pin": pin}, headers=headers)


def _parent_login(client, pin=PARENT_PIN):
    return client.post("/api/parents/login", json={"pin": pin})


def _parent_headers(client):
    token = _parent_login(client).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _student_headers(client, sid):
    token = _student_login(client, sid).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _check(client, headers, qid, answer):
    return client.post(f"/api/questions/{qid}/check", json={"answer": answer}, headers=headers)


# ------------------------------------------------------------- setup and login

def test_setup_success_creates_parent(api):
    client, _main, _db = api
    resp = _setup(client)
    assert resp.status_code == 201
    assert resp.json() == {"ok": True}


def test_repeated_setup_is_409(api):
    client, _main, _db = api
    assert _setup(client).status_code == 201
    assert _setup(client, pin="9999").status_code == 409
    # The first PIN still works; the second setup did not replace it.
    assert _parent_login(client, PARENT_PIN).status_code == 200
    assert _parent_login(client, "9999").status_code == 401


def test_setup_without_token_is_401(api):
    client, _main, _db = api
    assert _setup(client, setup_token=None).status_code == 401


def test_setup_with_wrong_token_is_401(api):
    client, _main, _db = api
    assert _setup(client, setup_token="not-the-token").status_code == 401


def test_setup_is_503_when_env_unset(api, monkeypatch):
    client, _main, _db = api
    monkeypatch.delenv("PARENT_SETUP_TOKEN", raising=False)
    assert _setup(client).status_code == 503


def test_pin_is_stored_hashed(api):
    client, _main, db = api
    _setup(client)
    row = db.get_parent_auth()
    assert row["pin_hash"] != PARENT_PIN
    assert row["pin_salt"]
    assert len(row["pin_hash"]) == 64
    assert PARENT_PIN not in (row["pin_hash"], row["pin_salt"])


def test_correct_login_returns_parent_role_token(api):
    client, _main, _db = api
    _setup(client)
    resp = _parent_login(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "parent"
    import security

    assert security.verify_role_token(body["token"], SECRET) == ("parent", "parent")


def test_wrong_pin_is_401(api):
    client, _main, _db = api
    _setup(client)
    assert _parent_login(client, "0000").status_code == 401


def test_lockout_after_five_failures_returns_429(api):
    client, _main, _db = api
    _setup(client)
    for _ in range(5):
        assert _parent_login(client, "0000").status_code == 401
    # Locked: even the correct PIN is refused.
    assert _parent_login(client, PARENT_PIN).status_code == 429


def test_successful_login_resets_failure_count(api):
    client, _main, _db = api
    _setup(client)
    for _ in range(4):
        assert _parent_login(client, "0000").status_code == 401
    assert _parent_login(client, PARENT_PIN).status_code == 200
    # Counter was reset, so four more failures do not lock.
    for _ in range(4):
        assert _parent_login(client, "0000").status_code == 401
    assert _parent_login(client, PARENT_PIN).status_code == 200


# ------------------------------------------------------- parent endpoint access

def test_no_token_is_401_on_parent_endpoints(api):
    client, _main, _db = api
    _setup(client)
    assert client.get("/api/parents/students").status_code == 401
    assert client.get("/api/parents/students/abc/report").status_code == 401


def test_student_token_is_403_on_parent_endpoints(api):
    client, _main, _db = api
    _setup(client)
    sid = _create_student(client).json()["id"]
    headers = _student_headers(client, sid)
    assert client.get("/api/parents/students", headers=headers).status_code == 403
    assert client.get(f"/api/parents/students/{sid}/report", headers=headers).status_code == 403


def test_parent_token_rejected_by_student_endpoints(api):
    client, _main, _db = api
    _setup(client)
    sid = _create_student(client).json()["id"]
    headers = _parent_headers(client)
    assert client.get(f"/api/students/{sid}/progress", headers=headers).status_code == 401
    assert client.post("/api/questions/q1/check", json={"answer": "x"}, headers=headers).status_code == 401


# ------------------------------------------------------------ parent reports

def test_list_students_has_no_secrets(api):
    client, _main, _db = api
    _setup(client)
    sid = _create_student(client).json()["id"]
    resp = client.get("/api/parents/students", headers=_parent_headers(client))
    assert resp.status_code == 200
    students = resp.json()["students"]
    assert [s["id"] for s in students] == [sid]
    assert students[0]["display_name"] == "Asha"
    text = resp.text
    assert "pin_hash" not in text and "pin_salt" not in text


def test_individual_report_accuracy_and_weak_topics(api):
    client, _main, _db = api
    _setup(client)
    sid = _create_student(client).json()["id"]
    student_headers = _student_headers(client, sid)
    # Four attempts on one topic: one correct, three wrong -> 25% -> needs_support.
    _check(client, student_headers, COEF_QID, COEF_CORRECT)
    for _ in range(3):
        _check(client, student_headers, COEF_QID, COEF_WRONG)

    resp = client.get(f"/api/parents/students/{sid}/report", headers=_parent_headers(client))
    assert resp.status_code == 200
    report = resp.json()

    assert report["student"] == {"id": sid, "display_name": "Asha", "avatar": "owl"}
    assert report["questions_attempted"] == 4
    assert report["correct"] == 1
    assert report["accuracy_pct"] == 25.0
    topic = next(t for t in report["topics"] if t["topic"] == COEF_TOPIC)
    assert topic["attempted"] == 4
    assert topic["mastery"] == "needs_support"
    assert COEF_TOPIC in report["weak_topics"]
    assert any(COEF_TOPIC in tip for tip in report["recommendations"])


def test_report_matches_student_progress_numbers(api):
    client, _main, _db = api
    _setup(client)
    sid = _create_student(client).json()["id"]
    student_headers = _student_headers(client, sid)
    _check(client, student_headers, COEF_QID, COEF_CORRECT)
    _check(client, student_headers, COEF_QID, COEF_WRONG)

    own = client.get(f"/api/students/{sid}/progress", headers=student_headers).json()
    parent = client.get(f"/api/parents/students/{sid}/report", headers=_parent_headers(client)).json()
    for key in ("questions_attempted", "correct", "accuracy_pct", "topics", "weak_topics", "recent_activity"):
        assert parent[key] == own[key]


def test_report_has_no_tutor_content_or_hashes(api):
    client, _main, db = api
    _setup(client)
    sid = _create_student(client).json()["id"]
    marker = "SECRET-TUTOR-MARKER-XYZ"
    db.insert_tutor_message(sid, "student", marker, "2024-01-01T00:00:00+00:00")
    db.insert_tutor_message(sid, "tutor", marker, "2024-01-01T00:00:01+00:00")
    _check(client, _student_headers(client, sid), COEF_QID, COEF_WRONG)

    headers = _parent_headers(client)
    resp = client.get(f"/api/parents/students/{sid}/report", headers=headers)
    assert resp.status_code == 200
    text = resp.text
    assert marker not in text
    student_row = db.get_student_auth(sid)
    assert student_row["pin_hash"] not in text
    assert student_row["pin_salt"] not in text
    parent_row = db.get_parent_auth()
    assert parent_row["pin_hash"] not in text
    assert parent_row["pin_salt"] not in text
    assert "token" not in resp.json()


def test_nonexistent_student_report_is_404(api):
    client, _main, _db = api
    _setup(client)
    resp = client.get("/api/parents/students/does-not-exist/report", headers=_parent_headers(client))
    assert resp.status_code == 404


# ---------------------------------------------------- student backward compat

def test_student_token_still_works_unchanged(api):
    client, _main, _db = api
    _setup(client)
    sid = _create_student(client).json()["id"]
    token = _student_login(client, sid).json()["token"]
    import security

    # Student tokens have no role claim, verify_token accepts them, role verifier does not.
    assert security.verify_token(token, SECRET) == sid
    assert security.verify_role_token(token, SECRET) is None
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get(f"/api/students/{sid}/progress", headers=headers).status_code == 200
    assert _check(client, headers, COEF_QID, COEF_CORRECT).status_code == 200


def test_parent_token_is_not_a_student_token(api):
    client, _main, _db = api
    _setup(client)
    token = _parent_login(client).json()["token"]
    import security

    assert security.verify_token(token, SECRET) is None
