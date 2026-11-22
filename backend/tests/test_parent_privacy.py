"""Parent privacy regression tests (Step J, priority 1).

Pins the current real behaviour of the parent routes, the student progress route and
tutor message storage. Uses a throwaway temp database; the project DBs are never touched.

Routes exercised:
  GET  /api/parents/students
  GET  /api/parents/students/{student_id}/report
  POST /api/parents/setup   (setup-token gated; checked for role separation only)
  POST /api/parents/login   (public by design; used only to obtain a parent token)
  GET  /api/students/{student_id}/progress
"""
import importlib
import pathlib
import sqlite3
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent
for _path in (PROJECT_ROOT, BACKEND_DIR):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

SECRET = "test-secret-parent-privacy"
SETUP_TOKEN = "test-setup-token-parent-privacy"
PARENT_PIN = "5150"
QID = "q1"
WRONG_ANSWER = "a=99, b=99, c=99"

STUDENT_A = {
    "display_name": "ZetaAlphaKid",
    "avatar": "lion",
    "class_level": 9,
    "preferred_language": "en",
    "pin": "4826",
}
STUDENT_B = {
    "display_name": "OmegaBetaKid",
    "avatar": "owl",
    "class_level": 9,
    "preferred_language": "en",
    "pin": "7391",
}
TUTOR_STUDENT_TEXT = "TUTORMARK-PRIV-7f3c what is x?"
TUTOR_REPLY_TEXT = "TUTORMARK-PRIV-reply-9d21 try isolating x"

FORBIDDEN_SUBSTRINGS = ("pin", "salt", "token", "secret", "password", "tutor", "message", "answer_key", "solution")
REPORT_TOP_KEYS = {
    "accuracy_pct",
    "correct",
    "lessons_completed",
    "questions_attempted",
    "recent_activity",
    "recommendations",
    "student",
    "topics",
    "weak_topics",
}
REPORT_STUDENT_KEYS = {"avatar", "display_name", "id"}
ACTIVITY_FORBIDDEN_KEYS = {"message", "text", "conversation", "answer", "submitted"}
LIST_FORBIDDEN_KEYS = {"pin", "pin_hash", "salt", "token", "password"}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_student(client, body):
    r = client.post("/api/students", json=body)
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    token = client.post(f"/api/students/{sid}/verify-pin", json={"pin": body["pin"]}).json()["token"]
    return sid, token


def _collect_keys(obj, acc):
    """Recursively collect every dict key in a JSON value."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            acc.add(k)
            _collect_keys(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            _collect_keys(v, acc)
    return acc


@pytest.fixture
def world(tmp_path, monkeypatch):
    """Fresh temp DB per test: two students with attempts and tutor rows, plus one parent."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "parent-privacy.db"))
    monkeypatch.setenv("SESSION_SECRET", SECRET)
    monkeypatch.setenv("PARENT_SETUP_TOKEN", SETUP_TOKEN)
    import db
    import main

    importlib.reload(db)
    importlib.reload(main)
    client = TestClient(main.app)

    a_id, a_token = _make_student(client, STUDENT_A)
    b_id, b_token = _make_student(client, STUDENT_B)

    setup = client.post("/api/parents/setup", json={"pin": PARENT_PIN}, headers={"X-Setup-Token": SETUP_TOKEN})
    assert setup.status_code == 201, setup.text
    parent_token = client.post("/api/parents/login", json={"pin": PARENT_PIN}).json()["token"]

    # Attempts for student A so recent_activity is populated.
    for _ in range(2):
        client.post(f"/api/questions/{QID}/check", json={"answer": WRONG_ANSWER, "lang": "en"}, headers=_auth(a_token))

    # Tutor conversation rows for student A, written straight to storage.
    now = datetime.now(timezone.utc).isoformat()
    db.insert_tutor_message(a_id, "student", TUTOR_STUDENT_TEXT, now)
    db.insert_tutor_message(a_id, "tutor", TUTOR_REPLY_TEXT, now)

    return SimpleNamespace(
        client=client,
        db=db,
        a_id=a_id,
        a_token=a_token,
        b_id=b_id,
        b_token=b_token,
        parent_token=parent_token,
    )


# 1. Parent routes with no auth -> 401/403, and no student display names in the body.
def test_parent_routes_without_auth_are_rejected_and_leak_no_names(world):
    c = world.client
    urls = [
        "/api/parents/students",
        f"/api/parents/students/{world.a_id}/report",
    ]
    for url in urls:
        r = c.get(url)
        assert r.status_code in (401, 403), f"{url}: expected 401/403, got {r.status_code}"
        for name in (STUDENT_A["display_name"], STUDENT_B["display_name"]):
            assert name not in r.text, f"{url}: body leaks display name {name!r}"


# 2. Student A's token on every authenticated /api/parents/* route -> 401/403.
def test_student_token_is_rejected_on_parent_routes(world):
    c = world.client
    headers = _auth(world.a_token)
    r_list = c.get("/api/parents/students", headers=headers)
    assert r_list.status_code in (401, 403), f"list: got {r_list.status_code}"
    r_report = c.get(f"/api/parents/students/{world.a_id}/report", headers=headers)
    assert r_report.status_code in (401, 403), f"report: got {r_report.status_code}"
    # Setup without the setup token: rejected regardless of the student token's role.
    r_setup = c.post("/api/parents/setup", json={"pin": "6161"}, headers=headers)
    assert r_setup.status_code in (401, 403), f"setup: got {r_setup.status_code}"


# 3. Student A's token on student B's progress -> 401/403/404; on its own progress -> 200.
def test_student_cannot_read_other_students_progress(world):
    c = world.client
    r_other = c.get(f"/api/students/{world.b_id}/progress", headers=_auth(world.a_token))
    assert r_other.status_code in (401, 403, 404), f"A->B progress: got {r_other.status_code}"
    r_own = c.get(f"/api/students/{world.a_id}/progress", headers=_auth(world.a_token))
    assert r_own.status_code == 200, f"A->own progress: got {r_own.status_code}"


# 4. Parent token on report for student A -> 200 with exact key sets.
def test_parent_report_has_exact_key_sets(world):
    r = world.client.get(f"/api/parents/students/{world.a_id}/report", headers=_auth(world.parent_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) == REPORT_TOP_KEYS, f"top-level keys: {sorted(body.keys())}"
    assert set(body["student"].keys()) == REPORT_STUDENT_KEYS, f"student keys: {sorted(body['student'].keys())}"


# 5. The report JSON text contains no forbidden words and no tutor message text.
def test_parent_report_text_has_no_forbidden_words_or_tutor_text(world):
    r = world.client.get(f"/api/parents/students/{world.a_id}/report", headers=_auth(world.parent_token))
    assert r.status_code == 200, r.text
    lowered = r.text.lower()
    for word in FORBIDDEN_SUBSTRINGS:
        assert word not in lowered, f"report text contains forbidden word {word!r}"
    assert TUTOR_STUDENT_TEXT not in r.text, "report leaks tutor student message"
    assert TUTOR_REPLY_TEXT not in r.text, "report leaks tutor reply message"


# 6. Every recent_activity item only carries allowed keys.
def test_recent_activity_items_have_no_message_or_answer_keys(world):
    r = world.client.get(f"/api/parents/students/{world.a_id}/report", headers=_auth(world.parent_token))
    assert r.status_code == 200, r.text
    items = r.json()["recent_activity"]
    assert items, "recent_activity is empty; the test needs attempts to inspect"
    for item in items:
        bad = ACTIVITY_FORBIDDEN_KEYS & set(item.keys())
        assert not bad, f"recent_activity item keys {sorted(item.keys())} include forbidden {sorted(bad)}"


# 7. Parent student list contains no credential-like keys anywhere (recursive check).
def test_parent_student_list_has_no_credential_keys(world):
    r = world.client.get("/api/parents/students", headers=_auth(world.parent_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("students"), "student list is empty; expected the two test students"
    keys = _collect_keys(body, set())
    bad = LIST_FORBIDDEN_KEYS & keys
    assert not bad, f"parent student list exposes keys {sorted(bad)}"


# 8. parent_config schema keeps the single-row CHECK constraint.
def test_parent_config_schema_keeps_single_row_check(world):
    conn = sqlite3.connect(world.db.DB_PATH)
    try:
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'parent_config'"
        ).fetchone()
    finally:
        conn.close()
    assert row is not None, "parent_config table not found"
    normalised = " ".join(row[0].split())
    assert ("CHECK (id = 1)" in normalised) or ("CHECK(id = 1)" in normalised), normalised
