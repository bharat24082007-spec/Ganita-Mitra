import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import json  # noqa: E402

import pytest  # noqa: E402

from backend.verify_content import verify_all  # noqa: E402


BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def chapter():
    path = BACKEND_DIR / "chapter_linear_equations.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_all_questions_verify(chapter):
    results = verify_all(chapter)
    assert results, "chapter has no questions to verify"
    failures = [(qid, reason) for qid, ok, reason in results if not ok]
    assert failures == []


def test_every_lesson_has_a_question(chapter):
    covered = {q["lesson_id"] for q in chapter["questions"]}
    lesson_ids = [lesson["id"] for lesson in chapter["lessons"]]
    missing = [lid for lid in lesson_ids if lid not in covered]
    assert missing == []
