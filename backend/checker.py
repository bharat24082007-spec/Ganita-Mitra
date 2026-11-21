"""Deterministic answer checking for chapter questions. Pure functions; no LLM is used for correctness."""

import re
from fractions import Fraction

_COEFF_RE = re.compile(r"([abc])\s*=\s*(-?\d+)")
_ORDERED_PAIR_RES = (
    re.compile(r"^\s*x\s*=\s*(-?\d+)\s*,\s*y\s*=\s*(-?\d+)\s*$"),
    re.compile(r"^\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)\s*$"),
)


def parse_linear(expr: str) -> tuple[int, int, int]:
    """Parse a linear expression such as '2x - 3y + 4' or 'x + 2y = 6'.

    Spaces are ignored. If an '=' is present, the right side is moved to the
    left by negating its terms. Returns (a, b, c) for a*x + b*y + c.
    Raises ValueError if the expression cannot be fully tokenised.
    """
    cleaned = expr.replace(" ", "")
    if "=" in cleaned:
        left, right = cleaned.split("=", 1)
        if not right or right[0] not in "+-":
            right = "+" + right
        flipped = right.translate(str.maketrans("+-", "-+"))
        left = left + flipped
    else:
        left = cleaned

    tokens = re.findall(r"[+-]?\d*[xy]|[+-]?\d+", left)
    if "".join(tokens) != left:
        raise ValueError(f"cannot parse linear expression: {expr!r}")

    a = 0
    b = 0
    c = 0
    for tok in tokens:
        if tok[-1] in "xy":
            coef_text = tok[:-1]
            if coef_text in ("", "+"):
                coef = 1
            elif coef_text == "-":
                coef = -1
            else:
                coef = int(coef_text)
            if tok[-1] == "x":
                a += coef
            else:
                b += coef
        else:
            c += int(tok)
    return a, b, c


def _parse_coefficients(text: str) -> tuple[int, int, int] | None:
    """Return (a, b, c) from text like 'a = 2, b = -3, c = 6', or None if malformed."""
    matches = _COEFF_RE.findall(text)
    if len(matches) != 3:
        return None
    found = {letter: int(value) for letter, value in matches}
    if set(found) != {"a", "b", "c"}:
        return None
    return found["a"], found["b"], found["c"]


def check_answer(question_type: str, answer_key: str, submitted: str, verification: dict) -> bool:
    """Check a submitted answer against the verification data for a question.

    question_type is one of "coefficients", "ordered_pair", "numeric".
    answer_key is kept for interface compatibility; correctness is decided
    from the verification data. Returns True only for a correct answer.
    """
    if question_type == "coefficients":
        submitted_coeffs = _parse_coefficients(submitted)
        if submitted_coeffs is None:
            return False
        eq = verification["equation"]
        expected = (int(eq["a"]), int(eq["b"]), int(eq["c"]))
        return submitted_coeffs == expected

    if question_type == "ordered_pair":
        match = None
        for pattern in _ORDERED_PAIR_RES:
            match = pattern.match(submitted)
            if match:
                break
        if not match:
            return False
        x = Fraction(match.group(1))
        y = Fraction(match.group(2))
        for eq in verification["equations"]:
            lhs, rhs = eq.split("=", 1)
            la, lb, lc = parse_linear(lhs)
            ra, rb, rc = parse_linear(rhs)
            a = la - ra
            b = lb - rb
            c = lc - rc
            if a * x + b * y + c != 0:
                return False
        return True

    if question_type == "numeric":
        answer = submitted.strip().lower()
        if answer not in ("yes", "no"):
            return False
        point = verification["equation_check"]["point"]
        a, b, c = parse_linear(verification["equation_check"]["equation"])
        truth = a * Fraction(point[0]) + b * Fraction(point[1]) + c == 0
        return answer == ("yes" if truth else "no")

    return False


def hint_for(question: dict, wrong_count: int) -> dict | None:
    """Return the hint to show after wrong_count wrong attempts, or None if there are no hints."""
    hints = question.get("hints") or []
    if not hints:
        return None
    return hints[0] if wrong_count <= 1 else hints[min(1, len(hints) - 1)]


def solution_for(question: dict) -> dict:
    """Return the answer and worked solution for a question."""
    return {
        "answer": question["answer"],
        "solution_steps_en": question["solution_steps_en"],
        "solution_steps_te": question["solution_steps_te"],
    }


def classify_mistake(question_type: str, answer_key: str, submitted: str) -> str | None:
    """Guess the kind of mistake behind a wrong answer.

    This is a heuristic, not a proof: it only looks at coefficient answers and
    flags a sign error on the constant or on a coefficient when the submitted
    values match the key with that sign flipped. Returns "sign_of_constant",
    "sign_of_coefficient", or None when no pattern is recognised.
    """
    if question_type != "coefficients":
        return None
    submitted_coeffs = _parse_coefficients(submitted)
    key_coeffs = _parse_coefficients(answer_key)
    if submitted_coeffs is None or key_coeffs is None:
        return None
    if submitted == answer_key:
        return None
    sa, sb, sc = submitted_coeffs
    ka, kb, kc = key_coeffs
    if (sa, sb, sc) == (ka, kb, -kc):
        return "sign_of_constant"
    if (sa, sb, sc) == (ka, -kb, kc):
        return "sign_of_coefficient"
    return None
