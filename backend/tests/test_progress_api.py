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
COEF_SOLUTION_STEP = QUESTIONS[COEF_QID]["solution_steps_en"][0]

OP_QID = "q8"
NUM_QID = "q5"
NUM_ANSWER = QUESTIONS[NUM_QID]["answer"]

FORBIDDEN_KEYS = {
    "answer",
    "solution_steps_en",
    "solution_steps_te",
    "equation",
    "equations",
    "equation_check",
    "explanation_en",
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


def _student_with_token(client, pin):
    sid = _create(client, pin=pin).json()["id"]
    token = _login(client, sid, pin=pin).json()["token"]
    return sid, token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _check(client, token, qid, answer, lang="en"):
    return client.post(
        f"/api/questions/{qid}/check",
        json={"answer": answer, "lang": lang},
        headers=_auth(token),
    )


def test_question_list_hides_answers(api):
    client, _main, _db = api
    r = client.get("/api/chapters/linear-equations/questions")
    assert r.status_code == 200
    items = r.json()["questions"]
    assert items
    for item in items:
        for key in ("id", "lesson_id", "topic", "difficulty", "question_type", "prompt_en", "prompt_te", "hint_count"):
            assert key in item
        assert not (FORBIDDEN_KEYS & set(item))
    assert COEF_CORRECT not in r.text

    r_l1 = client.get("/api/chapters/linear-equations/questions", params={"lesson_id": "l1"})
    assert r_l1.status_code == 200
    l1_items = r_l1.json()["questions"]
    assert l1_items
    assert all(item["lesson_id"] == "l1" for item in l1_items)


def test_wrong_answer_returns_hint_not_solution(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    r = _check(client, token, COEF_QID, COEF_WRONG)
    assert r.status_code == 200
    body = r.json()
    assert body["is_correct"] is False
    assert body["hint"] is not None
    assert body["solution"] is None
    assert body["explanation_en"] is None


def test_third_wrong_attempt_reveals_solution(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    for _ in range(2):
        r = _check(client, token, COEF_QID, COEF_WRONG)
        assert r.status_code == 200
        assert r.json()["solution"] is None
    r = _check(client, token, COEF_QID, COEF_WRONG)
    assert r.status_code == 200
    body = r.json()
    assert body["solution"] is not None
    assert COEF_SOLUTION_STEP in r.text
    assert body["attempts"] == 3


def test_correct_answer_returns_explanation(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    r = _check(client, token, COEF_QID, COEF_CORRECT)
    assert r.status_code == 200
    body = r.json()
    assert body["is_correct"] is True
    assert body["explanation_en"]
    assert body["solution"] is None

    r_num = _check(client, token, NUM_QID, NUM_ANSWER)
    assert r_num.status_code == 200
    assert r_num.json()["is_correct"] is True


def test_check_requires_auth(api):
    client, _main, _db = api
    r = client.post(
        f"/api/questions/{COEF_QID}/check",
        json={"answer": COEF_CORRECT, "lang": "en"},
    )
    assert r.status_code == 401


def test_check_unknown_question_404(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    r = _check(client, token, "zz999", COEF_CORRECT)
    assert r.status_code == 404


def test_attempts_recorded_per_student(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1111")
    assert _check(client, token, COEF_QID, COEF_WRONG).status_code == 200
    assert _check(client, token, COEF_QID, COEF_CORRECT).status_code == 200
    r = client.get(f"/api/students/{sid}/progress", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["questions_attempted"] == 2
    assert body["correct"] == 1
    assert body["accuracy_pct"] == 50.0


def test_progress_forbidden_for_other_profile(api):
    client, _main, _db = api
    sid_a, _token_a = _student_with_token(client, "1111")
    _sid_b, token_b = _student_with_token(client, "2222")
    r = client.get(f"/api/students/{sid_a}/progress", headers=_auth(token_b))
    assert r.status_code == 403


def test_progress_is_isolated(api):
    client, _main, _db = api
    sid_a, token_a = _student_with_token(client, "1111")
    sid_b, token_b = _student_with_token(client, "2222")
    assert _check(client, token_a, COEF_QID, COEF_CORRECT).status_code == 200
    r = client.get(f"/api/students/{sid_b}/progress", headers=_auth(token_b))
    assert r.status_code == 200
    body = r.json()
    assert body["questions_attempted"] == 0
    assert body["accuracy_pct"] == 0.0


def test_mastery_bands_and_not_enough_data(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")

    for _ in range(2):
        assert _check(client, token, COEF_QID, COEF_WRONG).status_code == 200
    r = client.get(f"/api/students/{sid}/progress", headers=_auth(token))
    assert r.status_code == 200
    topic_entry = next(t for t in r.json()["topics"] if t["topic"] == COEF_TOPIC)
    assert topic_entry["attempted"] == 2
    assert topic_entry["mastery"] == "not_enough_data"

    assert _check(client, token, COEF_QID, COEF_WRONG).status_code == 200
    r = client.get(f"/api/students/{sid}/progress", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    topic_entry = next(t for t in body["topics"] if t["topic"] == COEF_TOPIC)
    assert topic_entry["attempted"] == 3
    assert topic_entry["correct"] == 0
    assert topic_entry["accuracy_pct"] == 0.0
    assert topic_entry["mastery"] == "needs_support"
    assert COEF_TOPIC in body["weak_topics"]


def test_lesson_complete_marks_progress(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    r = client.post("/api/lessons/l1/complete", headers=_auth(token))
    assert r.status_code == 200
    assert r.json() == {"lesson_id": "l1", "completed": True}
    r = client.get(f"/api/students/{sid}/progress", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["lessons_completed"] == 1


def test_lesson_complete_unknown_404(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    r = client.post("/api/lessons/zz/complete", headers=_auth(token))
    assert r.status_code == 404


def test_lesson_complete_requires_auth(api):
    client, _main, _db = api
    r = client.post("/api/lessons/l1/complete")
    assert r.status_code == 401



def test_first_and_second_wrong_return_hint_no_solution(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    for _ in range(2):
        r = _check(client, token, COEF_QID, COEF_WRONG)
        assert r.status_code == 200
        body = r.json()
        assert body["is_correct"] is False
        assert body["hint"] is not None
        assert body["solution"] is None


def test_third_consecutive_wrong_reveals_solution(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    for _ in range(2):
        assert _check(client, token, COEF_QID, COEF_WRONG).status_code == 200
    r = _check(client, token, COEF_QID, COEF_WRONG)
    assert r.status_code == 200
    body = r.json()
    assert body["is_correct"] is False
    assert body["solution"] is not None
    assert COEF_SOLUTION_STEP in r.text


def test_correct_after_three_wrong_has_no_solution(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    for _ in range(3):
        assert _check(client, token, COEF_QID, COEF_WRONG).status_code == 200
    r = _check(client, token, COEF_QID, COEF_CORRECT)
    assert r.status_code == 200
    body = r.json()
    assert body["is_correct"] is True
    assert body["solution"] is None
    assert body["explanation_en"] is not None


def test_fourth_wrong_after_three_wrong_still_has_solution(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    for _ in range(3):
        assert _check(client, token, COEF_QID, COEF_WRONG).status_code == 200
    r = _check(client, token, COEF_QID, COEF_WRONG)
    assert r.status_code == 200
    body = r.json()
    assert body["is_correct"] is False
    assert body["solution"] is not None


def test_correct_before_threshold_has_no_solution(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    r = _check(client, token, COEF_QID, COEF_CORRECT)
    assert r.status_code == 200
    body = r.json()
    assert body["is_correct"] is True
    assert body["solution"] is None


def test_one_wrong_then_correct_has_no_solution(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    assert _check(client, token, COEF_QID, COEF_WRONG).status_code == 200
    r = _check(client, token, COEF_QID, COEF_CORRECT)
    assert r.status_code == 200
    body = r.json()
    assert body["is_correct"] is True
    assert body["solution"] is None



def _check_with_client_id(client, token, qid, answer, client_id, lang="en"):
    return client.post(
        f"/api/questions/{qid}/check",
        json={"answer": answer, "lang": lang, "clientId": client_id},
        headers=_auth(token),
    )


def test_client_id_is_recorded_once(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    cid = "11111111-aaaa-4aaa-8aaa-000000000001"
    assert _check_with_client_id(client, token, COEF_QID, COEF_WRONG, cid).status_code == 200
    assert _check_with_client_id(client, token, COEF_QID, COEF_WRONG, cid).status_code == 200
    r = client.get(f"/api/students/{sid}/progress", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["questions_attempted"] == 1


def test_replayed_client_id_has_no_hint_or_solution(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    cid = "11111111-aaaa-4aaa-8aaa-000000000002"
    first = _check_with_client_id(client, token, COEF_QID, COEF_WRONG, cid)
    assert first.status_code == 200
    assert first.json()["hint"] is not None
    r = _check_with_client_id(client, token, COEF_QID, COEF_WRONG, cid)
    assert r.status_code == 200
    body = r.json()
    assert body["hint"] is None
    assert body["solution"] is None
    assert body["is_correct"] is False


def test_client_id_collision_across_students_does_not_leak_or_record(api):
    client, _main, _db = api
    sid_a, token_a = _student_with_token(client, "1111")
    sid_b, token_b = _student_with_token(client, "2222")
    cid = "11111111-aaaa-4aaa-8aaa-000000000003"
    assert _check_with_client_id(client, token_a, COEF_QID, COEF_WRONG, cid).status_code == 200
    r = _check_with_client_id(client, token_b, COEF_QID, COEF_WRONG, cid)
    assert r.status_code == 200
    body = r.json()
    assert body["hint"] is None
    assert body["solution"] is None
    r_b = client.get(f"/api/students/{sid_b}/progress", headers=_auth(token_b))
    assert r_b.status_code == 200
    assert r_b.json()["questions_attempted"] == 0
    r_a = client.get(f"/api/students/{sid_a}/progress", headers=_auth(token_a))
    assert r_a.status_code == 200
    assert r_a.json()["questions_attempted"] == 1


def test_check_without_client_id_unchanged(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    for _ in range(2):
        r = _check(client, token, COEF_QID, COEF_WRONG)
        assert r.status_code == 200
        assert r.json()["is_correct"] is False
    r = client.get(f"/api/students/{sid}/progress", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["questions_attempted"] == 2


def test_client_id_too_long_rejected(api):
    client, _main, _db = api
    sid, token = _student_with_token(client, "1234")
    too_long = "a" * 65
    r = _check_with_client_id(client, token, COEF_QID, COEF_WRONG, too_long)
    assert r.status_code == 422

