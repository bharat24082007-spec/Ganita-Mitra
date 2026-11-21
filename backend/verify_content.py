"""Verify the linear-equations chapter content (chapter_linear_equations.json).

Standard library only. Run from any directory:

    python backend/verify_content.py

Exit codes: 0 = all questions pass, 1 = at least one failed,
2 = chapter file missing or unreadable.
"""

import json
import re
import sys
from fractions import Fraction
from pathlib import Path

CHAPTER_FILE = Path(__file__).resolve().parent / "chapter_linear_equations.json"

REQUIRED_KEYS = (
    "id",
    "lesson_id",
    "topic",
    "difficulty",
    "question_type",
    "prompt_en",
    "prompt_te",
    "answer",
    "solution_steps_en",
    "solution_steps_te",
    "hints",
    "explanation_en",
    "explanation_te",
)
ALLOWED_TOPICS = {
    "coefficients",
    "standard_form",
    "solutions",
    "ordered_pairs",
    "graphs",
    "elimination",
    "substitution",
}
ALLOWED_DIFFICULTIES = {1, 2, 3}

COEFFICIENTS_ANSWER = re.compile(r"^a=(-?\d+),\s*b=(-?\d+),\s*c=(-?\d+)$")
ORDERED_PAIR_ANSWER = re.compile(r"^x=(-?\d+),\s*y=(-?\d+)$")
# One signed term: "2x", "-y", "x", "+3", "-7".
TERM = re.compile(r"[+-]?(?:\d*[xy]|\d+)")


def _parse_side(text):
    """Parse one side of an equation into (x_coeff, y_coeff, constant)."""
    s = text.replace(" ", "")
    if not s:
        raise ValueError("empty expression")
    coeffs = {"x": 0, "y": 0, "c": 0}
    pos = 0
    while pos < len(s):
        m = TERM.match(s, pos)
        if m is None:
            raise ValueError(f"cannot parse {s[pos:]!r} in {text!r}")
        token = m.group(0)
        if pos > 0 and token[0] not in "+-":
            raise ValueError(f"terms must be joined by + or - in {text!r}")
        pos = m.end()
        if token[-1] in "xy":
            digits = token[:-1]
            if digits in ("", "+"):
                value = 1
            elif digits == "-":
                value = -1
            else:
                value = int(digits)
            coeffs[token[-1]] += value
        else:
            coeffs["c"] += int(token)
    return coeffs["x"], coeffs["y"], coeffs["c"]


def _parse_equation(text):
    """Parse 'lhs = rhs' into two coefficient triples."""
    parts = text.split("=")
    if len(parts) != 2:
        raise ValueError(f"expected exactly one '=' in {text!r}")
    return _parse_side(parts[0]), _parse_side(parts[1])


def _value(side, x, y):
    cx, cy, cc = side
    return cx * x + cy * y + cc


def _check_coefficients(q):
    m = COEFFICIENTS_ANSWER.match(q["answer"])
    if m is None:
        return "answer must look like 'a=.., b=.., c=..'"
    got = tuple(int(g) for g in m.groups())
    eq = q["equation"]
    want = (eq["a"], eq["b"], eq["c"])
    if got != want:
        return f"answer {got} does not match equation {want}"
    return None


def _check_ordered_pair(q):
    m = ORDERED_PAIR_ANSWER.match(q["answer"])
    if m is None:
        return "answer must look like 'x=.., y=..'"
    x = Fraction(int(m.group(1)))
    y = Fraction(int(m.group(2)))
    equations = q["equations"]
    if not equations:
        return "no equations to check"
    for text in equations:
        lhs, rhs = _parse_equation(text)
        if _value(lhs, x, y) != _value(rhs, x, y):
            return f"({x}, {y}) does not satisfy {text!r}"
    return None


def _check_numeric(q):
    check = q["equation_check"]
    x = Fraction(check["point"][0])
    y = Fraction(check["point"][1])
    lhs, rhs = _parse_equation(check["equation"])
    a = lhs[0] - rhs[0]
    b = lhs[1] - rhs[1]
    c = lhs[2] - rhs[2]
    satisfied = a * x + b * y + c == 0
    expected = "yes" if satisfied else "no"
    answer = str(q["answer"]).strip().lower()
    if answer != expected:
        verdict = "satisfies" if satisfied else "does not satisfy"
        return f"answer {q['answer']!r} but the point {verdict} the equation"
    return None


VERIFIERS = {
    "coefficients": _check_coefficients,
    "ordered_pair": _check_ordered_pair,
    "numeric": _check_numeric,
}


def _check_question(q, lesson_ids):
    """Return None if the question passes, otherwise the failure reason."""
    missing = [key for key in REQUIRED_KEYS if key not in q]
    if missing:
        return "missing keys: " + ", ".join(missing)
    if q["topic"] not in ALLOWED_TOPICS:
        return f"topic {q['topic']!r} is not allowed"
    if q["difficulty"] not in ALLOWED_DIFFICULTIES:
        return f"difficulty {q['difficulty']!r} must be 1, 2 or 3"
    if q["lesson_id"] not in lesson_ids:
        return f"lesson_id {q['lesson_id']!r} does not exist"
    if not isinstance(q["hints"], list) or not q["hints"]:
        return "needs at least one hint"
    if not str(q["explanation_en"]).strip():
        return "explanation_en is empty"
    verifier = VERIFIERS.get(q["question_type"])
    if verifier is None:
        return "unsupported verification form"
    return verifier(q)


def verify_all(data):
    """Return a list of (question_id, passed, reason) for every question."""
    questions = data.get("questions")
    lessons = data.get("lessons")
    if not isinstance(questions, list) or not isinstance(lessons, list):
        return [("<chapter>", False, "chapter must contain 'lessons' and 'questions' lists")]

    lesson_ids = {lesson.get("id") for lesson in lessons if isinstance(lesson, dict)}
    seen_ids = set()
    results = []
    for q in questions:
        if not isinstance(q, dict):
            results.append(("<invalid>", False, "question is not an object"))
            continue
        qid = str(q.get("id"))
        if qid in seen_ids:
            reason = "duplicate id"
        else:
            try:
                reason = _check_question(q, lesson_ids)
            except (KeyError, TypeError, ValueError, IndexError, AttributeError) as exc:
                reason = f"could not verify: {exc}"
        seen_ids.add(qid)
        results.append((qid, reason is None, reason or "ok"))
    return results


def main():
    if not CHAPTER_FILE.is_file():
        print("ERROR: chapter file missing")
        return 2
    try:
        data = json.loads(CHAPTER_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: chapter file unreadable: {exc}")
        return 2

    failed = 0
    results = verify_all(data)
    for qid, passed, reason in results:
        if passed:
            print(f"PASS {qid}")
        else:
            failed += 1
            print(f"FAIL {qid}: {reason}")
    print(f"TOTAL: {len(results) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
