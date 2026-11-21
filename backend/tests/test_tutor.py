"""Tests for the Mitra tutor. Every Gemini call goes through httpx.MockTransport, so no live key is needed."""
import json
import pathlib
import sys
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import db  # noqa: E402
import main  # noqa: E402
import security  # noqa: E402
import tutor  # noqa: E402

SECRET = "test-secret-for-tutor-tests"


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "tutor-test.db"))
    db.init_db()
    monkeypatch.setattr(main, "SESSION_SECRET", SECRET)
    monkeypatch.setattr(main, "RATE_LIMITER", tutor.RateLimiter())
    monkeypatch.setenv("GEMINI_API_KEY", "placeholder-test-key")
    monkeypatch.setenv("MODEL_NAME", "placeholder-test-model")
    return TestClient(main.app)


def _make_student(name="Student"):
    student_id = uuid.uuid4().hex
    pin_hash, pin_salt = security.hash_pin("1234")
    db.insert_student(
        {
            "id": student_id,
            "display_name": name,
            "avatar": "owl",
            "class_level": 9,
            "preferred_language": "te",
            "pin_hash": pin_hash,
            "pin_salt": pin_salt,
        }
    )
    return student_id


def _auth(student_id):
    token = security.make_token(student_id, SECRET, ttl_seconds=600)
    return {"Authorization": "Bearer " + token}


def _ordered_pair_question():
    return next(q for q in main.QUESTIONS.values() if q["question_type"] == "ordered_pair")


def _gemini_ok(reply_obj=None, raw_text=None):
    text = raw_text if raw_text is not None else json.dumps(reply_obj)
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def _valid_reply(reply="సమాధానం", final_answer="", reply_type_hint=False):
    return {
        "reply": reply,
        "hint": "ముందుగా ఒక సమీకరణాన్ని ఎంచుకోండి.",
        "steps": ["దశ 1"],
        "final_answer": final_answer,
        "needs_clarification": reply_type_hint,
    }


def _use_transport(monkeypatch, handler):
    """Route every tutor.answer_tutor call through a MockTransport built from `handler`."""
    transport = httpx.MockTransport(handler)
    original = tutor.answer_tutor
    monkeypatch.setattr(tutor, "answer_tutor", lambda *a, **k: original(*a, transport=transport, **k))


def _ok_handler(reply_obj, captured=None):
    def handler(request):
        if captured is not None:
            captured.append(request)
        return httpx.Response(200, json=_gemini_ok(reply_obj))
    return handler


def test_missing_key_returns_503_and_makes_no_outbound_call(env, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    captured = []
    _use_transport(monkeypatch, _ok_handler(_valid_reply(), captured))
    student = _make_student()

    r = env.post("/api/tutor", json={"message": "Help me"}, headers=_auth(student))

    assert r.status_code == 503
    assert captured == []


def test_successful_telugu_reply_is_returned(env, monkeypatch):
    _use_transport(monkeypatch, _ok_handler(_valid_reply(reply="ఇది తెలుగు జవాబు")))
    student = _make_student()

    r = env.post("/api/tutor", json={"message": "నాకు సందేహం ఉంది", "language": "te"}, headers=_auth(student))

    assert r.status_code == 200
    body = r.json()
    assert body["reply"] == "ఇది తెలుగు జవాబు"
    assert body["reply_type"] == "answer"
    assert body["steps"] == ["దశ 1"]
    assert set(body) == {"reply", "hint", "steps", "final_answer", "needs_clarification", "reply_type"}


def test_successful_english_reply_is_returned(env, monkeypatch):
    _use_transport(monkeypatch, _ok_handler(_valid_reply(reply="Here is a hint.")))
    student = _make_student()

    r = env.post("/api/tutor", json={"message": "I am stuck", "language": "en"}, headers=_auth(student))

    assert r.status_code == 200
    assert r.json()["reply"] == "Here is a hint."
    assert r.json()["reply_type"] == "answer"


def test_timeout_maps_to_502_with_fallback_message(env, monkeypatch):
    def handler(request):
        raise httpx.ReadTimeout("timed out", request=request)

    _use_transport(monkeypatch, handler)
    student = _make_student()

    r = env.post("/api/tutor", json={"message": "Help", "language": "en"}, headers=_auth(student))

    assert r.status_code == 502
    assert r.json()["detail"] == tutor.UPSTREAM_EN


@pytest.mark.parametrize(
    "raw_text",
    [
        "this is not json",
        json.dumps({"reply": ""}),
        json.dumps({"reply": "ok", "unexpected_field": 1}),
        json.dumps({"reply": "ok", "steps": ["x" * 301]}),
    ],
)
def test_malformed_or_schema_invalid_reply_maps_to_502(env, monkeypatch, raw_text):
    def handler(request):
        return httpx.Response(200, json=_gemini_ok(raw_text=raw_text))

    _use_transport(monkeypatch, handler)
    student = _make_student()

    r = env.post("/api/tutor", json={"message": "Help", "language": "te"}, headers=_auth(student))

    assert r.status_code == 502
    assert r.json()["detail"] == tutor.UPSTREAM_TE


def test_rate_limit_is_per_student(env, monkeypatch):
    _use_transport(monkeypatch, _ok_handler(_valid_reply()))
    student_a = _make_student("A")
    student_b = _make_student("B")

    statuses = [
        env.post("/api/tutor", json={"message": "hi", "language": "en"}, headers=_auth(student_a)).status_code
        for _ in range(21)
    ]

    assert statuses[:20] == [200] * 20
    assert statuses[20] == 429
    r_b = env.post("/api/tutor", json={"message": "hi", "language": "en"}, headers=_auth(student_b))
    assert r_b.status_code == 200


def test_missing_token_returns_401(env, monkeypatch):
    captured = []
    _use_transport(monkeypatch, _ok_handler(_valid_reply(), captured))

    r = env.post("/api/tutor", json={"message": "Help"})

    assert r.status_code == 401
    assert captured == []


def test_question_context_comes_from_server_and_prompt_has_verified_answer(env, monkeypatch):
    question = _ordered_pair_question()
    captured = []
    _use_transport(monkeypatch, _ok_handler(_valid_reply(), captured))
    student = _make_student()

    r = env.post(
        "/api/tutor",
        json={"message": "How do I start?", "questionId": question["id"], "language": "en"},
        headers=_auth(student),
    )

    assert r.status_code == 200
    assert len(captured) == 1
    sent = captured[0].content.decode("utf-8")
    assert question["answer"] in sent
    assert "VERIFIED_ANSWER" in sent


def test_client_supplied_solution_steps_are_rejected_before_gemini(env, monkeypatch):
    captured = []
    _use_transport(monkeypatch, _ok_handler(_valid_reply(), captured))
    student = _make_student()

    r = env.post(
        "/api/tutor",
        json={"message": "Help", "solutionSteps": ["x = 1, y = 1"], "language": "en"},
        headers=_auth(student),
    )

    assert r.status_code == 422
    assert captured == []


def test_student_history_is_isolated(env, monkeypatch):
    captured = []
    _use_transport(monkeypatch, _ok_handler(_valid_reply(reply="bravo-reply"), captured))
    student_a = _make_student("A")
    student_b = _make_student("B")

    env.post("/api/tutor", json={"message": "alpha-secret-line", "language": "en"}, headers=_auth(student_a))
    env.post("/api/tutor", json={"message": "bravo-first-line", "language": "en"}, headers=_auth(student_b))
    env.post("/api/tutor", json={"message": "bravo-second-line", "language": "en"}, headers=_auth(student_b))

    sent_to_b = captured[-1].content.decode("utf-8")
    assert "bravo-first-line" in sent_to_b
    assert "alpha-secret-line" not in sent_to_b

    rows_b = db.list_tutor_messages(student_b)
    assert rows_b and all(row["student_id"] == student_b for row in rows_b)
    assert not any("alpha-secret-line" in row["content"] for row in rows_b)


def test_contradictory_final_answer_is_rejected_and_fallback_returned(env, monkeypatch):
    question = _ordered_pair_question()
    _use_transport(
        monkeypatch,
        _ok_handler(_valid_reply(reply="contradicting-text", final_answer="x = 99, y = 99")),
    )
    student = _make_student()

    r = env.post(
        "/api/tutor",
        json={"message": "Tell me the answer", "questionId": question["id"], "language": "en"},
        headers=_auth(student),
    )

    assert r.status_code == 200
    body = r.json()
    assert body["reply_type"] == "fallback"
    assert body["final_answer"] == ""
    assert "contradicting-text" not in body["reply"]
    assert body["reply"] == (question.get("explanation_en") or tutor.FALLBACK_EN)


def test_successful_call_stores_student_and_tutor_rows(env, monkeypatch):
    _use_transport(monkeypatch, _ok_handler(_valid_reply(reply="stored-reply")))
    student = _make_student()

    r = env.post("/api/tutor", json={"message": "stored-question", "language": "en"}, headers=_auth(student))

    assert r.status_code == 200
    rows = db.list_tutor_messages(student)
    assert len(rows) == 2
    assert sorted(row["role"] for row in rows) == ["student", "tutor"]
    assert {row["content"] for row in rows} == {"stored-question", "stored-reply"}


def test_rate_limiter_window_expiry():
    now = [0.0]
    limiter = tutor.RateLimiter(max_requests=2, window_seconds=60, clock=lambda: now[0])

    assert limiter.allow("s") is True
    assert limiter.allow("s") is True
    assert limiter.allow("s") is False
    now[0] = 59.9
    assert limiter.allow("s") is False
    now[0] = 60.0
    assert limiter.allow("s") is True
