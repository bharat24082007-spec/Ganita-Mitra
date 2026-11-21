import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import sqlite3  # noqa: E402

import pytest  # noqa: E402

import backend.db as db  # noqa: E402


SECRET_KEYS = {"pin_hash", "pin_salt", "failed_pin_count", "locked_until"}


@pytest.fixture
def path(tmp_path):
    p = tmp_path / "t.db"
    db.init_db(p)
    return p


def _student(sid, name="Student"):
    return {
        "id": sid,
        "display_name": name,
        "avatar": "fox",
        "class_level": 8,
        "preferred_language": "en",
        "pin_hash": "hash-" + sid,
        "pin_salt": "salt-" + sid,
        "created_at": "2024-01-01T00:00:00+00:00",
    }


def _question(qid, lesson_id="linear-equations"):
    return {
        "id": qid,
        "lesson_id": lesson_id,
        "topic": "linear",
        "difficulty": 1,
        "question_type": "numeric",
        "prompt": "Solve x + 2 = 5",
        "answer": "3",
        "solution_steps": ["x = 5 - 2", "x = 3"],
        "hints": ["Subtract 2 from both sides"],
    }


def _attempt(student_id, client_id, question_id="q1", is_correct=True, created_at=None):
    row = {
        "client_id": client_id,
        "student_id": student_id,
        "question_id": question_id,
        "topic": "linear",
        "submitted_answer": "3" if is_correct else "4",
        "is_correct": is_correct,
        "attempts_count": 1,
    }
    if created_at is not None:
        row["created_at"] = created_at
    return row


def test_init_db_twice_does_not_raise(tmp_path):
    p = tmp_path / "twice.db"
    db.init_db(p)
    db.init_db(p)


def test_insert_student_and_list_has_no_secrets(path):
    db.insert_student(_student("s1"), path=path)
    assert db.count_students(path=path) == 1
    rows = db.list_students(path=path)
    assert len(rows) == 1
    assert SECRET_KEYS.isdisjoint(rows[0].keys())


def test_public_student_has_no_secrets_and_auth_has_pin_hash(path):
    db.insert_student(_student("s1"), path=path)
    public = db.get_student_public("s1", path=path)
    assert public is not None
    assert SECRET_KEYS.isdisjoint(public.keys())
    auth = db.get_student_auth("s1", path=path)
    assert auth is not None
    assert "pin_hash" in auth


def test_record_pin_failure_locks_on_fifth(path):
    db.insert_student(_student("s1"), path=path)
    for _ in range(4):
        db.record_pin_failure("s1", 1000.0, path=path)
    auth = db.get_student_auth("s1", path=path)
    assert auth["failed_pin_count"] == 4
    assert auth["locked_until"] == 0

    db.record_pin_failure("s1", 1000.0, path=path)
    auth = db.get_student_auth("s1", path=path)
    assert auth["locked_until"] == 1000.0 + 900
    assert auth["failed_pin_count"] == 0


def test_reset_pin_failures_sets_count_to_zero(path):
    db.insert_student(_student("s1"), path=path)
    db.record_pin_failure("s1", 1000.0, path=path)
    db.record_pin_failure("s1", 1000.0, path=path)
    db.reset_pin_failures("s1", path=path)
    assert db.get_student_auth("s1", path=path)["failed_pin_count"] == 0


def test_upsert_and_list_questions(path):
    db.upsert_questions([_question("q1"), _question("q2", lesson_id="other")], path=path)

    rows = db.list_questions(lesson_id="linear-equations", path=path)
    assert len(rows) == 1
    assert rows[0]["id"] == "q1"
    assert isinstance(rows[0]["hints"], list)
    assert isinstance(rows[0]["solution_steps"], list)
    assert rows[0]["hints"] == ["Subtract 2 from both sides"]

    q = db.get_question("q2", path=path)
    assert q is not None
    assert q["id"] == "q2"

    assert db.get_question("missing", path=path) is None


def test_insert_attempt_if_new_is_idempotent_by_client_id(path):
    db.insert_student(_student("s1"), path=path)
    row = _attempt("s1", "client-1")
    assert db.insert_attempt_if_new(row, path=path) is True
    assert db.insert_attempt_if_new(row, path=path) is False
    assert len(db.list_attempts("s1", path=path)) == 1


def test_count_prior_wrong_attempts_counts_only_wrong(path):
    db.insert_student(_student("s1"), path=path)
    db.insert_attempt_if_new(_attempt("s1", "c1", "q1", is_correct=False), path=path)
    db.insert_attempt_if_new(_attempt("s1", "c2", "q1", is_correct=False), path=path)
    db.insert_attempt_if_new(_attempt("s1", "c3", "q1", is_correct=True), path=path)
    db.insert_attempt_if_new(_attempt("s1", "c4", "q2", is_correct=False), path=path)
    assert db.count_prior_wrong_attempts("s1", "q1", path=path) == 2


def test_set_lesson_completed_shows_in_progress(path):
    db.insert_student(_student("s1"), path=path)
    db.set_lesson_completed("s1", "linear-equations", True, "2024-01-02T00:00:00+00:00", path=path)
    progress = db.list_lesson_progress("s1", path=path)
    done = [p for p in progress if p["lesson_id"] == "linear-equations"]
    assert len(done) == 1
    assert done[0]["completed"]


def test_tutor_messages_limit_order_and_since(path):
    db.insert_student(_student("s1"), path=path)
    db.insert_tutor_message("s1", "student", "m1", "2024-01-01T10:00:00+00:00", path=path)
    db.insert_tutor_message("s1", "tutor", "m2", "2024-01-01T10:01:00+00:00", path=path)
    db.insert_tutor_message("s1", "student", "m3", "2024-01-01T10:02:00+00:00", path=path)

    last_two = db.list_tutor_messages("s1", limit=2, path=path)
    assert [m["content"] for m in last_two] == ["m2", "m3"]

    assert db.count_tutor_messages_since("s1", "2024-01-01T09:00:00+00:00", path=path) == 3
    assert db.count_tutor_messages_since("s1", "2024-01-01T11:00:00+00:00", path=path) == 0


def test_attempts_isolated_per_student(path):
    db.insert_student(_student("A", "Asha"), path=path)
    db.insert_student(_student("B", "Bala"), path=path)
    db.insert_attempt_if_new(_attempt("A", "a1"), path=path)
    db.insert_attempt_if_new(_attempt("B", "b1"), path=path)

    rows_a = db.list_attempts("A", path=path)
    assert len(rows_a) == 1
    assert all(r["student_id"] == "A" for r in rows_a)


def test_delete_student_cascades(path):
    db.insert_student(_student("s1"), path=path)
    db.insert_attempt_if_new(_attempt("s1", "c1"), path=path)
    db.insert_tutor_message("s1", "student", "hi", "2024-01-01T10:00:00+00:00", path=path)

    db.delete_student("s1", path=path)

    assert db.get_student_public("s1", path=path) is None
    assert db.list_attempts("s1", path=path) == []
    assert db.list_tutor_messages("s1", path=path) == []


def test_insert_attempt_for_missing_student_raises(path):
    with pytest.raises(sqlite3.IntegrityError):
        db.insert_attempt_if_new(_attempt("no-such-student", "c1"), path=path)
