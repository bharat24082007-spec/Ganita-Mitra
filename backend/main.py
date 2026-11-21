"""Ganita Mitra backend: AI tutor proxy and attempt sync endpoint."""
import os
import sqlite3
import pathlib

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from tutor import (
    ask_model,
    check_reply,
    TutorNotConfigured,
    TutorUpstreamError,
    NOT_CONFIGURED_TE,
    UPSTREAM_TE,
)

# Config comes from environment variables only; backend/.env must be exported
# or loaded by the launcher. It is never read from frontend requests.

DB_PATH = os.environ.get("DB_PATH", str(pathlib.Path(__file__).parent / "ganita_mitra.db"))


def get_db():
    return sqlite3.connect(DB_PATH)


# Create the table once at import, then close the connection.
_init_conn = get_db()
_init_conn.execute(
    """CREATE TABLE IF NOT EXISTS attempts (
        uuid TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        correct INTEGER NOT NULL,
        topic TEXT,
        hints_used INTEGER,
        solution_shown INTEGER,
        timestamp TEXT,
        received_at TEXT DEFAULT CURRENT_TIMESTAMP
    )"""
)
_init_conn.commit()
_init_conn.close()

app = FastAPI()

# Only the Vite dev server may call this API from a browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class TutorRequest(BaseModel):
    doubt: str = Field(min_length=1, max_length=500)
    questionId: str = Field(max_length=20)
    solutionSteps: list[str] = Field(min_length=1, max_length=20)

    @field_validator("doubt")
    @classmethod
    def doubt_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("doubt must not be blank")
        return v

    @field_validator("solutionSteps")
    @classmethod
    def steps_short_enough(cls, v: list[str]) -> list[str]:
        if any(len(step) > 300 for step in v):
            raise ValueError("each solution step must be at most 300 characters")
        return v


class Attempt(BaseModel):
    uuid: str = Field(min_length=1, max_length=64)
    profileId: str = Field(min_length=1, max_length=20)
    questionId: str = Field(min_length=1, max_length=20)
    correct: bool
    topic: str = Field(default="", max_length=100)
    hintsUsed: int = Field(ge=0, le=2)
    solutionShown: bool
    timestamp: str = Field(default="", max_length=40)


class SyncRequest(BaseModel):
    attempts: list[Attempt] = Field(max_length=200)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/tutor")
async def tutor(req: TutorRequest):
    # Fail fast with a clear Telugu message if the server is not configured.
    if not os.environ.get("GEMINI_API_KEY") or not os.environ.get("MODEL_NAME"):
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED_TE)

    try:
        raw = await ask_model(req.doubt, req.questionId, req.solutionSteps)
    except TutorNotConfigured:
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED_TE)
    except TutorUpstreamError:
        raise HTTPException(status_code=502, detail=UPSTREAM_TE)

    return {"reply": check_reply(raw, req.solutionSteps)}


@app.post("/api/sync")
def sync(req: SyncRequest):
    conn = get_db()
    try:
        # INSERT OR IGNORE plus the uuid primary key means a retried batch cannot
        # duplicate rows; every uuid in the batch is now stored, so all are safe to mark synced.
        for a in req.attempts:
            conn.execute(
                "INSERT OR IGNORE INTO attempts (uuid, profile_id, question_id, correct, topic, hints_used, solution_shown, timestamp) VALUES (?,?,?,?,?,?,?,?)",
                (
                    a.uuid,
                    a.profileId,
                    a.questionId,
                    int(a.correct),
                    a.topic,
                    a.hintsUsed,
                    int(a.solutionShown),
                    a.timestamp,
                ),
            )
        conn.commit()
    finally:
        conn.close()
    return {"accepted": [a.uuid for a in req.attempts]}
