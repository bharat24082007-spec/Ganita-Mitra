import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.checker import (  # noqa: E402
    check_answer,
    classify_mistake,
    hint_for,
    parse_linear,
    solution_for,
)

CHAPTER = json.loads(
    (Path(__file__).resolve().parents[1] / "chapter_linear_equations.json").read_text(encoding="utf-8")
)
QS = {q["id"]: q for q in CHAPTER["questions"]}


def verification(q):
    v = {}
    for key in ("equation", "equations", "equation_check"):
        if key in q:
            v[key] = q[key]
    return v


def _first(qtype):
    return next(q for q in CHAPTER["questions"] if q["question_type"] == qtype)


def test_parse_linear_standard_and_rearranged_forms():
    assert parse_linear("2x + 3y - 6 = 0") == (2, 3, -6)
    assert parse_linear("x - y = 3") == (1, -1, -3)
    assert parse_linear("2x - y + 3 = 0") == (2, -1, 3)
    assert parse_linear("x + y = 9") == (1, 1, -9)


def test_parse_linear_rejects_unparseable_input():
    try:
        parse_linear("2x + 3y ? 6 = 0")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for '2x + 3y ? 6 = 0'")


def test_coefficients_answer_checking():
    q = _first("coefficients")
    eq = q["equation"]
    a, b, c = eq["a"], eq["b"], eq["c"]
    v = verification(q)
    correct = f"a={a}, b={b}, c={c}"
    assert check_answer("coefficients", q["answer"], correct, v) is True
    assert check_answer("coefficients", q["answer"], f"c={c}, a={a}, b={b}", v) is True
    assert check_answer("coefficients", q["answer"], f"a={a + 1}, b={b}, c={c}", v) is False
    assert check_answer("coefficients", q["answer"], f"a={a}, b={b}, c={-c}", v) is False


def test_ordered_pair_answer_checking():
    q = _first("ordered_pair")
    v = verification(q)
    assert check_answer("ordered_pair", q["answer"], q["answer"], v) is True
    # Same values in bracket form, derived from the stored answer "x=X, y=Y".
    x_part, y_part = q["answer"].split(",")
    X = x_part.split("=")[1].strip()
    Y = y_part.split("=")[1].strip()
    assert check_answer("ordered_pair", q["answer"], f"({X}, {Y})", v) is True
    assert check_answer("ordered_pair", q["answer"], f"({int(X) + 1}, {Y})", v) is False
    assert check_answer("ordered_pair", q["answer"], f"x={X}", v) is False


def test_numeric_answer_checking():
    numeric_qs = [q for q in CHAPTER["questions"] if q["question_type"] == "numeric"]
    assert numeric_qs
    for q in numeric_qs:
        v = verification(q)
        stored = q["answer"]
        opposite = "no" if stored == "yes" else "yes"
        assert check_answer("numeric", stored, stored, v) is True
        assert check_answer("numeric", stored, opposite, v) is False
        assert check_answer("numeric", stored, "maybe", v) is False


def test_unsupported_type_is_false():
    assert check_answer("unknown", "x", "x", {}) is False


def test_hint_for_progression_and_no_answer_leak():
    q = QS["q1"]
    hints = q["hints"]
    assert len(hints) >= 2
    assert hint_for(q, 1) == hints[0]
    assert hint_for(q, 2) == hints[1]
    assert hint_for(q, 5) == hints[1]
    for hint in hints:
        assert "answer" not in str(hint)
        assert q["answer"] not in hint["en"]
        assert q["answer"] not in hint["te"]


def test_solution_for_returns_full_worked_solution():
    q = QS["q1"]
    sol = solution_for(q)
    assert set(sol) >= {"answer", "solution_steps_en", "solution_steps_te"}
    assert sol["answer"]
    assert sol["solution_steps_en"]
    assert sol["solution_steps_te"]


def test_classify_mistake_sign_errors_and_none_cases():
    q = _first("coefficients")
    eq = q["equation"]
    a, b, c = eq["a"], eq["b"], eq["c"]
    key = f"a={a}, b={b}, c={c}"
    assert classify_mistake("coefficients", key, f"a={a}, b={b}, c={-c}") == "sign_of_constant"
    assert classify_mistake("coefficients", key, f"a={a}, b={-b}, c={c}") == "sign_of_coefficient"
    assert classify_mistake("coefficients", key, key) is None
    assert classify_mistake("coefficients", key, "not an equation") is None
