"""AI doubt tutor: calls the Gemini API and checks the reply against approved steps.

Stdlib + httpx only. Config comes from environment variables; the doubt text
is never logged or printed.
"""
import os
import re

import httpx

SYSTEM_PROMPT = (
    "You are a patient Class 9 Telangana maths teacher. Reply ONLY in simple Telugu. "
    "Use English for math symbols (x, y, =, numerals). Explain using ONLY the approved "
    "solution steps provided. Give a hint before the full answer. Never contradict the "
    "approved answer; never state a final numerical answer that differs from it."
)

FALLBACK_TE = "క్షమించండి, ఈ జవాబును నేను ధృవీకరించలేకపోయాను. దయచేసి పాఠంలోని పరిష్కార దశలను చూడండి."
NOT_CONFIGURED_TE = "ట్యూటర్ సెట్ చేయలేదు. నిర్వాహకుడిని సంప్రదించండి."
UPSTREAM_TE = "ట్యూటర్ ప్రస్తుతం అందుబాటులో లేదు. కొద్దిసేపు తర్వాత ప్రయత్నించండి."


class TutorNotConfigured(Exception):
    """Raised when GEMINI_API_KEY or MODEL_NAME is not set."""


class TutorUpstreamError(Exception):
    """Raised when the Gemini call fails or returns an unexpected shape."""


async def ask_model(doubt, question_id, solution_steps) -> str:
    # Key and model come only from the environment so they never reach frontend code.
    key = os.environ.get("GEMINI_API_KEY")
    model = os.environ.get("MODEL_NAME")
    if not key or not model:
        raise TutorNotConfigured()

    numbered = "\n".join(f"{i}. {step}" for i, step in enumerate(solution_steps, start=1))
    user_text = (
        "ప్రశ్న ID: " + question_id + "\n"
        "ఆమోదించబడిన పరిష్కార దశలు:\n" + numbered + "\n\n"
        "విద్యార్థి సందేహం: " + doubt
    )

    url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent"
    headers = {"x-goog-api-key": key, "Content-Type": "application/json"}
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_text}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 600},
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError:
        raise TutorUpstreamError()

    if resp.status_code != 200:
        raise TutorUpstreamError()

    try:
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError, ValueError):
        raise TutorUpstreamError()


_PAIR_RE = re.compile(r"\b([xy])\s*=\s*(-?\d+(?:\.\d+)?)")


def check_reply(reply, solution_steps) -> str:
    # A model can still state a wrong number even when told not to,
    # so every x/y value in the reply is checked against the approved steps.
    approved = set(_PAIR_RE.findall(" ".join(solution_steps)))
    for pair in _PAIR_RE.findall(reply):
        if pair not in approved:
            return FALLBACK_TE
    return reply
