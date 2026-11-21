"""Ganita Mitra backend: student profiles, PIN auth, AI tutor proxy and attempt sync."""
import hmac
import json
import os
import pathlib
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

import db
import security
import tutor as tutor_mod
from checker import check_answer, classify_mistake, hint_for, solution_for
from tutor import (
    HISTORY_TURNS,
    RATE_LIMITER,
    msg,
    TutorNotConfigured,
    TutorUpstreamError,
    NOT_CONFIGURED_TE,
    NOT_CONFIGURED_EN,
    RATE_LIMITED_TE,
    RATE_LIMITED_EN,
    UPSTREAM_TE,
    UPSTREAM_EN,
)

# Config comes from environment variables. backend/.env is loaded here for local
# development; variables already set in the environment take precedence.
load_dotenv(pathlib.Path(__file__).with_name(".env"))

# db.py reads DATABASE_PATH itself; nothing about the database location is hardcoded here.
db.init_db()

# Chapter content is loaded once at startup. Verification data and Telugu content are kept in
# memory because the questions table has no column for them; the DB holds the columns it defines.
CHAPTER_PATH = pathlib.Path(__file__).with_name("chapter_linear_equations.json")
with CHAPTER_PATH.open(encoding="utf-8") as _chapter_file:
    CHAPTER = json.load(_chapter_file)
QUESTIONS = {q["id"]: q for q in CHAPTER["questions"]}
LESSON_IDS = {lesson["id"] for lesson in CHAPTER["lessons"]}


def _verification_for(q: dict) -> dict:
    qtype = q["question_type"]
    if qtype == "coefficients":
        return {"equation": q["equation"]}
    if qtype == "ordered_pair":
        return {"equations": q["equations"]}
    if qtype == "numeric":
        return {"equation_check": q["equation_check"]}
    return {}


VERIFICATION = {qid: _verification_for(q) for qid, q in QUESTIONS.items()}

db.upsert_questions(
    [
        {
            "id": q["id"],
            "lesson_id": q["lesson_id"],
            "topic": q["topic"],
            "difficulty": q["difficulty"],
            "question_type": q["question_type"],
            "prompt": q["prompt_en"],
            "answer": q["answer"],
            "solution_steps": q["solution_steps_en"],
            "hints": [h["en"] for h in q["hints"]],
        }
        for q in QUESTIONS.values()
    ]
)

SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
SESSION_TTL_SECONDS = 8 * 3600
MAX_PROFILES = 3
PARENT_ROLE = "parent"
PARENT_SUBJECT = "parent"


# Serialises the count-then-insert in create_student so two requests cannot exceed the cap.
_profile_lock = threading.Lock()

app = FastAPI()

# Only the Vite dev server may call this API from a browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class TutorRequest(BaseModel):
    # extra="forbid" rejects client-supplied solution steps or any other unexpected field.
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=500)
    questionId: str | None = Field(default=None, min_length=1, max_length=20)
    language: Literal["te", "en"] = "te"

    @field_validator("message")
    @classmethod
    def message_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("message must not be blank")
        return v


class StudentCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=30)
    avatar: Literal["lion", "flower", "rocket", "owl", "panda", "star"]
    class_level: Literal[9]
    preferred_language: Literal["te", "en"]
    pin: str = Field(pattern=r"^[0-9]{4}$")

    @field_validator("display_name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("display_name must not be blank")
        return v


class PinVerify(BaseModel):
    pin: str = Field(pattern=r"^[0-9]{4}$")


class Attempt(BaseModel):
    uuid: str = Field(min_length=1, max_length=64)
    profileId: str = Field(min_length=1, max_length=64)
    questionId: str = Field(min_length=1, max_length=20)
    correct: bool
    topic: str = Field(default="", max_length=100)
    hintsUsed: int = Field(ge=0, le=2)
    solutionShown: bool
    timestamp: str = Field(default="", max_length=40)


class SyncRequest(BaseModel):
    attempts: list[Attempt] = Field(max_length=200)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_secret() -> str:
    """Return the session secret or raise 503 if it is not configured."""
    if not SESSION_SECRET:
        raise HTTPException(status_code=503, detail="Session secret not configured")
    return SESSION_SECRET


def require_student(authorization: str | None = Header(None)) -> str:
    """Dependency: validate 'Authorization: Bearer <token>' and return the student id."""
    secret = _require_secret()
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required")
    subject = security.verify_token(parts[1].strip(), secret)
    if subject is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return subject


def require_parent(authorization: str | None = Header(None)) -> str:
    """Dependency: accept only a parent-role token.

    No token or a bad token gets 401. A valid student token gets 403.
    """
    secret = _require_secret()
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required")
    token = parts[1].strip()
    role_claim = security.verify_role_token(token, secret)
    if role_claim is not None:
        subject, role = role_claim
        if role == PARENT_ROLE:
            return subject
        raise HTTPException(status_code=403, detail="Parent access required")
    if security.verify_token(token, secret) is not None:
        raise HTTPException(status_code=403, detail="Parent access required")
    raise HTTPException(status_code=401, detail="Authentication required")



@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/students", status_code=201)
def create_student(req: StudentCreate):
    with _profile_lock:
        if db.count_students() >= MAX_PROFILES:
            raise HTTPException(status_code=409, detail="Maximum 3 student profiles per device")
        pin_hash, pin_salt = security.hash_pin(req.pin)
        student_id = uuid.uuid4().hex
        db.insert_student(
            {
                "id": student_id,
                "display_name": req.display_name,
                "avatar": req.avatar,
                "class_level": req.class_level,
                "preferred_language": req.preferred_language,
                "pin_hash": pin_hash,
                "pin_salt": pin_salt,
                "created_at": _utc_now_iso(),
            }
        )
    return db.get_student_public(student_id)


@app.get("/api/students")
def list_students():
    return db.list_students()


@app.post("/api/students/{student_id}/verify-pin")
def verify_student_pin(student_id: str, req: PinVerify):
    secret = _require_secret()
    student = db.get_student_auth(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if student["locked_until"] > time.time():
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    if not security.verify_pin(req.pin, student["pin_hash"], student["pin_salt"]):
        db.record_pin_failure(student_id, time.time())
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    db.reset_pin_failures(student_id)
    return {
        "ok": True,
        "token": security.make_token(student_id, secret, ttl_seconds=SESSION_TTL_SECONDS),
        "expires_in": SESSION_TTL_SECONDS,
    }


@app.post("/api/parents/setup", status_code=201)
def setup_parent(req: PinVerify, x_setup_token: str | None = Header(None, alias="X-Setup-Token")):
    # One-time setup: needs the operator's PARENT_SETUP_TOKEN. There is no default PIN and no replace route.
    expected = os.environ.get("PARENT_SETUP_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Parent setup not configured")
    if not x_setup_token or not hmac.compare_digest(x_setup_token.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid setup token")
    pin_hash, pin_salt = security.hash_pin(req.pin)
    if not db.create_parent_if_absent(pin_hash, pin_salt, _utc_now_iso()):
        raise HTTPException(status_code=409, detail="Parent account already set up")
    return {"ok": True}


@app.post("/api/parents/login")
def parent_login(req: PinVerify):
    secret = _require_secret()
    parent = db.get_parent_auth()
    if parent is None:
        raise HTTPException(status_code=404, detail="Parent account not set up")
    if parent["locked_until"] > time.time():
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    if not security.verify_pin(req.pin, parent["pin_hash"], parent["pin_salt"]):
        db.record_parent_failure(time.time())
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    db.reset_parent_failures()
    return {
        "ok": True,
        "role": PARENT_ROLE,
        "token": security.make_role_token(
            PARENT_SUBJECT, PARENT_ROLE, secret, ttl_seconds=SESSION_TTL_SECONDS
        ),
        "expires_in": SESSION_TTL_SECONDS,
    }



@app.post("/api/tutor")
def tutor(req: TutorRequest, subject: str = Depends(require_student)):
    # The student id comes only from the verified token; the client never names a student.
    question = None
    if req.questionId is not None:
        question = QUESTIONS.get(req.questionId)
        if question is None:
            raise HTTPException(status_code=404, detail="Question not found")

    if not RATE_LIMITER.allow(subject):
        raise HTTPException(status_code=429, detail=msg(req.language, RATE_LIMITED_TE, RATE_LIMITED_EN))

    # db.list_tutor_messages only returns rows for this student.
    history = db.list_tutor_messages(subject, limit=HISTORY_TURNS)

    try:
        result = tutor_mod.answer_tutor(req.message, question, req.language, history)
    except TutorNotConfigured:
        raise HTTPException(status_code=503, detail=msg(req.language, NOT_CONFIGURED_TE, NOT_CONFIGURED_EN))
    except TutorUpstreamError:
        raise HTTPException(status_code=502, detail=msg(req.language, UPSTREAM_TE, UPSTREAM_EN))

    db.insert_tutor_message(subject, "student", req.message, _utc_now_iso())
    db.insert_tutor_message(subject, "tutor", result["reply"], _utc_now_iso())

    return {
        "reply": result["reply"],
        "hint": result["hint"],
        "steps": result["steps"],
        "final_answer": result["final_answer"],
        "needs_clarification": result["needs_clarification"],
        "reply_type": result["reply_type"],
    }


@app.post("/api/sync")
def sync(req: SyncRequest, subject: str = Depends(require_student)):
    for a in req.attempts:
        if a.profileId != subject:
            raise HTTPException(status_code=403, detail="Cannot sync another profile's attempts")
    if db.get_student_public(subject) is None:
        raise HTTPException(status_code=404, detail="Student not found")

    # insert_attempt_if_new ignores a client_id it has already stored, so a retried batch
    # cannot duplicate rows; every uuid in the batch is safe to mark as synced.
    for a in req.attempts:
        db.insert_attempt_if_new(
            {
                "client_id": a.uuid,
                "student_id": a.profileId,
                "question_id": a.questionId,
                "topic": a.topic,
                "submitted_answer": "",
                "is_correct": a.correct,
                "attempts_count": a.hintsUsed + 1,
                "created_at": a.timestamp or _utc_now_iso(),
            }
        )
    return {"accepted": [a.uuid for a in req.attempts]}


class CheckRequest(BaseModel):
    answer: str = Field(max_length=100)
    lang: Literal["te", "en"] = "te"
    clientId: str | None = Field(default=None, min_length=1, max_length=64)


MASTERY_BANDS = [(0, 39, "needs_support"), (40, 69, "learning"), (70, 89, "improving"), (90, 100, "strong")]


def _pct(part: int, whole: int) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


def _mastery(attempted: int, accuracy_pct: float) -> str:
    if attempted < 3:
        return "not_enough_data"
    for _low, high, band in MASTERY_BANDS:
        if accuracy_pct < high + 1:
            return band
    return "not_enough_data"


@app.get("/api/chapters/linear-equations/questions")
def list_chapter_questions(
    lesson_id: str | None = Query(default=None, max_length=10),
    topic: str | None = Query(default=None, max_length=30),
):
    out = []
    for q in QUESTIONS.values():
        if lesson_id is not None and q["lesson_id"] != lesson_id:
            continue
        if topic is not None and q["topic"] != topic:
            continue
        out.append(
            {
                "id": q["id"],
                "lesson_id": q["lesson_id"],
                "topic": q["topic"],
                "difficulty": q["difficulty"],
                "question_type": q["question_type"],
                "prompt_en": q["prompt_en"],
                "prompt_te": q["prompt_te"],
                "hint_count": len(q["hints"]),
            }
        )
    return {"questions": out}


@app.post("/api/questions/{question_id}/check")
def check_question(question_id: str, body: CheckRequest, subject: str = Depends(require_student)):
    if question_id not in QUESTIONS:
        raise HTTPException(status_code=404, detail="Question not found")
    q = QUESTIONS[question_id]
    prior = db.count_prior_wrong_attempts(subject, question_id)
    is_correct = check_answer(q["question_type"], q["answer"], body.answer, VERIFICATION[question_id])
    wrong_count = prior + (0 if is_correct else 1)
    client_id = body.clientId if body.clientId is not None else uuid.uuid4().hex
    recorded = db.insert_attempt_if_new(
        {
            "client_id": client_id,
            "student_id": subject,
            "question_id": question_id,
            "topic": q["topic"],
            "submitted_answer": body.answer,
            "is_correct": int(is_correct),
            "attempts_count": prior + 1,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    if not recorded:
        # This client id was already recorded (a replay, possibly by another student).
        # Reveal nothing about the stored row and write nothing new.
        return {
            "is_correct": is_correct,
            "attempts": prior,
            "hint": None,
            "solution": None,
            "explanation_en": None,
            "explanation_te": None,
            "mistake_hint": None,
        }
    return {
        "is_correct": is_correct,
        "attempts": prior + 1,
        "hint": hint_for(q, wrong_count) if not is_correct else None,
        "solution": solution_for(q) if (not is_correct and wrong_count >= 3) else None,
        "explanation_en": q["explanation_en"] if is_correct else None,
        "explanation_te": q["explanation_te"] if is_correct else None,
        "mistake_hint": classify_mistake(q["question_type"], q["answer"], body.answer) if not is_correct else None,
    }


def _progress_report(student_id: str) -> dict:
    """Learning progress for one student. Shared by the student and parent report routes.

    Reads attempts and lesson progress only; tutor messages are never touched here.
    """
    attempts = db.list_attempts(student_id)
    progress = db.list_lesson_progress(student_id)

    n = len(attempts)
    correct = sum(1 for a in attempts if a["is_correct"])

    by_topic: dict[str, list[bool]] = {}
    for a in attempts:
        by_topic.setdefault(a["topic"], []).append(bool(a["is_correct"]))

    topics = []
    for name in sorted(by_topic):
        results = by_topic[name]
        attempted = len(results)
        topic_correct = sum(results)
        accuracy = _pct(topic_correct, attempted)
        topics.append(
            {
                "topic": name,
                "attempted": attempted,
                "correct": topic_correct,
                "accuracy_pct": accuracy,
                "mastery": _mastery(attempted, accuracy),
            }
        )

    weak_topics = [t["topic"] for t in topics if t["mastery"] in ("needs_support", "learning")]
    recent = sorted(attempts, key=lambda a: a["created_at"], reverse=True)[:10]

    return {
        "questions_attempted": n,
        "correct": correct,
        "accuracy_pct": _pct(correct, n),
        "lessons_completed": sum(1 for p in progress if p["completed"]),
        "topics": topics,
        "weak_topics": weak_topics,
        "recent_activity": [
            {"question_id": a["question_id"], "is_correct": bool(a["is_correct"]), "created_at": a["created_at"]}
            for a in recent
        ],
    }


def _recommendations(report: dict) -> list[str]:
    """Plain-language next steps for a parent, built only from the report numbers."""
    if report["questions_attempted"] == 0:
        return ["No practice attempts yet. Encourage them to try a few questions."]
    tips = []
    for t in report["topics"]:
        if t["mastery"] == "needs_support":
            tips.append(
                f"Needs extra support with {t['topic']} (accuracy {t['accuracy_pct']}%). "
                "Practise it again before moving on."
            )
        elif t["mastery"] == "learning":
            tips.append(
                f"Still learning {t['topic']} (accuracy {t['accuracy_pct']}%). "
                "More practice will help."
            )
    if not tips:
        tips.append("Doing well across all topics. Keep up the regular practice.")
    return tips


@app.get("/api/students/{student_id}/progress")
def student_progress(student_id: str, subject: str = Depends(require_student)):
    if subject != student_id:
        raise HTTPException(status_code=403, detail="Cannot view another profile's progress")
    if db.get_student_public(student_id) is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return _progress_report(student_id)



@app.post("/api/lessons/{lesson_id}/complete")
def complete_lesson(lesson_id: str, subject: str = Depends(require_student)):
    if lesson_id not in LESSON_IDS:
        raise HTTPException(status_code=404, detail="Lesson not found")
    db.set_lesson_completed(subject, lesson_id, True, datetime.now(timezone.utc).isoformat())
    return {"lesson_id": lesson_id, "completed": True}



@app.get("/api/parents/students")
def parent_list_students(_parent: str = Depends(require_parent)):
    # list_students returns public profile columns only (no PIN hash or salt).
    return {"students": db.list_students()}


@app.get("/api/parents/students/{student_id}/report")
def parent_student_report(student_id: str, _parent: str = Depends(require_parent)):
    student = db.get_student_public(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    report = _progress_report(student_id)
    return {
        "student": {
            "id": student["id"],
            "display_name": student["display_name"],
            "avatar": student["avatar"],
        },
        **report,
        "recommendations": _recommendations(report),
    }

