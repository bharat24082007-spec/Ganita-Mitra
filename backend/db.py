"""SQLite data-access layer for The Last-Mile Tutor.

This is the only module containing SQL. The schema is plain (TEXT/INTEGER/REAL,
JSON stored as text, named indexes, CHECK constraints) so it can be migrated to
Postgres later by changing this module alone.

Every public function takes an optional ``path`` argument (defaults to
``DB_PATH``) so tests can point at a temporary database file. All values are
passed as bound parameters; no SQL is built from string-formatted values.
Public-facing functions never return ``pin_hash`` or ``pin_salt``.
"""

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = os.environ.get("DATABASE_PATH", "backend/data/tutor.db")

_write_lock = threading.Lock()

_SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        avatar TEXT NOT NULL,
        class_level INTEGER NOT NULL,
        preferred_language TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        pin_salt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        failed_pin_count INTEGER NOT NULL DEFAULT 0,
        locked_until REAL NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        lesson_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        question_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        answer TEXT NOT NULL,
        solution_steps TEXT NOT NULL,
        hints TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY,
        client_id TEXT UNIQUE,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        submitted_answer TEXT NOT NULL,
        is_correct INTEGER NOT NULL,
        attempts_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS lesson_progress (
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        lesson_id TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        last_accessed TEXT,
        PRIMARY KEY(student_id, lesson_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tutor_messages (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('student','tutor')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS parent_config (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        pin_hash TEXT NOT NULL,
        pin_salt TEXT NOT NULL,
        failed_pin_count INTEGER NOT NULL DEFAULT 0,
        locked_until REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_attempts_student_topic ON attempts(student_id, topic)",
    "CREATE INDEX IF NOT EXISTS idx_tutor_messages_student_created ON tutor_messages(student_id, created_at)",
]

_STUDENT_PUBLIC_COLS = "id, display_name, avatar, class_level, preferred_language, created_at"


def _resolve(path):
    return str(path) if path is not None else DB_PATH


def get_conn(path=None):
    """Open a connection with Row factory and foreign keys enforced."""
    db = _resolve(path)
    if db != ":memory:":
        Path(db).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def _read(path, sql, params=()):
    conn = get_conn(path)
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def _read_one(path, sql, params=()):
    conn = get_conn(path)
    try:
        return conn.execute(sql, params).fetchone()
    finally:
        conn.close()


def _write(path, sql, params=()):
    """Run one write statement under the module write lock. Returns rowcount."""
    with _write_lock:
        conn = get_conn(path)
        try:
            cur = conn.execute(sql, params)
            conn.commit()
            return cur.rowcount
        finally:
            conn.close()


def _write_many(path, sql, rows):
    with _write_lock:
        conn = get_conn(path)
        try:
            conn.executemany(sql, rows)
            conn.commit()
        finally:
            conn.close()


def init_db(path=None):
    """Create all tables and indexes. Safe to call repeatedly."""
    with _write_lock:
        conn = get_conn(path)
        try:
            for stmt in _SCHEMA:
                conn.execute(stmt)
            conn.commit()
        finally:
            conn.close()


# ---------------------------------------------------------------- students

def count_students(path=None):
    row = _read_one(path, "SELECT COUNT(*) AS n FROM students")
    return int(row["n"])


def insert_student(row, path=None):
    params = {
        "id": row["id"],
        "display_name": row["display_name"],
        "avatar": row["avatar"],
        "class_level": row["class_level"],
        "preferred_language": row["preferred_language"],
        "pin_hash": row["pin_hash"],
        "pin_salt": row["pin_salt"],
        "created_at": row.get("created_at") or _utc_now_iso(),
        "failed_pin_count": row.get("failed_pin_count", 0),
        "locked_until": row.get("locked_until", 0),
    }
    _write(
        path,
        """
        INSERT INTO students (id, display_name, avatar, class_level, preferred_language,
                              pin_hash, pin_salt, created_at, failed_pin_count, locked_until)
        VALUES (:id, :display_name, :avatar, :class_level, :preferred_language,
                :pin_hash, :pin_salt, :created_at, :failed_pin_count, :locked_until)
        """,
        params,
    )


def list_students(path=None):
    rows = _read(path, f"SELECT {_STUDENT_PUBLIC_COLS} FROM students ORDER BY created_at, id")
    return [dict(r) for r in rows]


def get_student_auth(student_id, path=None):
    """Includes pin_hash / pin_salt. Internal use only (PIN verification)."""
    row = _read_one(path, "SELECT * FROM students WHERE id = ?", (student_id,))
    return dict(row) if row is not None else None


def get_student_public(student_id, path=None):
    row = _read_one(
        path,
        f"SELECT {_STUDENT_PUBLIC_COLS} FROM students WHERE id = ?",
        (student_id,),
    )
    return dict(row) if row is not None else None


def record_pin_failure(student_id, now, max_failures=5, lock_seconds=900, path=None):
    """Count a failed PIN. On reaching max_failures, lock and reset the counter.

    Single atomic UPDATE: every CASE expression reads the pre-update values.
    """
    reaches_limit = "(failed_pin_count + 1 >= ?)"
    _write(
        path,
        f"""
        UPDATE students
           SET locked_until = CASE WHEN {reaches_limit} THEN ? ELSE locked_until END,
               failed_pin_count = CASE WHEN {reaches_limit} THEN 0 ELSE failed_pin_count + 1 END
         WHERE id = ?
        """,
        (max_failures, float(now) + float(lock_seconds), max_failures, student_id),
    )


def reset_pin_failures(student_id, path=None):
    _write(
        path,
        "UPDATE students SET failed_pin_count = 0, locked_until = 0 WHERE id = ?",
        (student_id,),
    )


def delete_student(student_id, path=None):
    """Deletes the student; attempts, progress and tutor messages cascade."""
    _write(path, "DELETE FROM students WHERE id = ?", (student_id,))


# ----------------------------------------------------------------- parent

def get_parent_auth(path=None):
    """Includes pin_hash / pin_salt. Internal use only (PIN verification)."""
    row = _read_one(path, "SELECT * FROM parent_config WHERE id = 1")
    return dict(row) if row is not None else None


def create_parent_if_absent(pin_hash, pin_salt, created_at_iso, path=None):
    """Single atomic insert of the one parent row. True only for the call that created it."""
    rowcount = _write(
        path,
        """
        INSERT OR IGNORE INTO parent_config (id, pin_hash, pin_salt, failed_pin_count, locked_until, created_at)
        VALUES (1, ?, ?, 0, 0, ?)
        """,
        (pin_hash, pin_salt, created_at_iso),
    )
    return rowcount == 1


def record_parent_failure(now, max_failures=5, lock_seconds=900, path=None):
    """Count a failed parent PIN. On reaching max_failures, lock and reset the counter.

    Single atomic UPDATE: every CASE expression reads the pre-update values.
    """
    reaches_limit = "(failed_pin_count + 1 >= ?)"
    _write(
        path,
        f"""
        UPDATE parent_config
           SET locked_until = CASE WHEN {reaches_limit} THEN ? ELSE locked_until END,
               failed_pin_count = CASE WHEN {reaches_limit} THEN 0 ELSE failed_pin_count + 1 END
         WHERE id = 1
        """,
        (max_failures, float(now) + float(lock_seconds), max_failures),
    )


def reset_parent_failures(path=None):
    _write(path, "UPDATE parent_config SET failed_pin_count = 0, locked_until = 0 WHERE id = 1")


# --------------------------------------------------------------- questions

def upsert_questions(rows, path=None):
    params = [
        (
            q["id"],
            q["lesson_id"],
            q["topic"],
            int(q["difficulty"]),
            q["question_type"],
            q["prompt"],
            q["answer"],
            json.dumps(q.get("solution_steps", [])),
            json.dumps(q.get("hints", [])),
        )
        for q in rows
    ]
    _write_many(
        path,
        """
        INSERT INTO questions (id, lesson_id, topic, difficulty, question_type,
                               prompt, answer, solution_steps, hints)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            lesson_id = excluded.lesson_id,
            topic = excluded.topic,
            difficulty = excluded.difficulty,
            question_type = excluded.question_type,
            prompt = excluded.prompt,
            answer = excluded.answer,
            solution_steps = excluded.solution_steps,
            hints = excluded.hints
        """,
        params,
    )


def _question_from_row(row):
    d = dict(row)
    d["solution_steps"] = json.loads(d["solution_steps"])
    d["hints"] = json.loads(d["hints"])
    return d


def list_questions(lesson_id=None, topic=None, path=None):
    clauses = []
    params = []
    if lesson_id is not None:
        clauses.append("lesson_id = ?")
        params.append(lesson_id)
    if topic is not None:
        clauses.append("topic = ?")
        params.append(topic)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = _read(path, f"SELECT * FROM questions{where} ORDER BY lesson_id, difficulty, id", tuple(params))
    return [_question_from_row(r) for r in rows]


def get_question(question_id, path=None):
    row = _read_one(path, "SELECT * FROM questions WHERE id = ?", (question_id,))
    return _question_from_row(row) if row is not None else None


# ---------------------------------------------------------------- attempts

def insert_attempt_if_new(row, path=None):
    """Insert keyed by client_id; duplicates are ignored. True if a row was inserted."""
    params = {
        "id": row.get("id") or str(uuid.uuid4()),
        "client_id": row.get("client_id"),
        "student_id": row["student_id"],
        "question_id": row["question_id"],
        "topic": row["topic"],
        "submitted_answer": row["submitted_answer"],
        "is_correct": 1 if row["is_correct"] else 0,
        "attempts_count": int(row["attempts_count"]),
        "created_at": row.get("created_at") or _utc_now_iso(),
    }
    rowcount = _write(
        path,
        """
        INSERT OR IGNORE INTO attempts (id, client_id, student_id, question_id, topic,
                                         submitted_answer, is_correct, attempts_count, created_at)
        VALUES (:id, :client_id, :student_id, :question_id, :topic,
                :submitted_answer, :is_correct, :attempts_count, :created_at)
        """,
        params,
    )
    return rowcount == 1


def count_prior_wrong_attempts(student_id, question_id, path=None):
    row = _read_one(
        path,
        "SELECT COUNT(*) AS n FROM attempts WHERE student_id = ? AND question_id = ? AND is_correct = 0",
        (student_id, question_id),
    )
    return int(row["n"])


def list_attempts(student_id, path=None):
    rows = _read(
        path,
        "SELECT * FROM attempts WHERE student_id = ? ORDER BY created_at, rowid",
        (student_id,),
    )
    out = []
    for r in rows:
        d = dict(r)
        d["is_correct"] = bool(d["is_correct"])
        out.append(d)
    return out


# ---------------------------------------------------------------- progress

def set_lesson_completed(student_id, lesson_id, completed, now_iso, path=None):
    done = 1 if completed else 0
    _write(
        path,
        """
        INSERT INTO lesson_progress (student_id, lesson_id, completed, completed_at, last_accessed)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(student_id, lesson_id) DO UPDATE SET
            completed = excluded.completed,
            completed_at = excluded.completed_at,
            last_accessed = excluded.last_accessed
        """,
        (student_id, lesson_id, done, now_iso if completed else None, now_iso),
    )


def list_lesson_progress(student_id, path=None):
    rows = _read(
        path,
        """
        SELECT student_id, lesson_id, completed, completed_at, last_accessed
          FROM lesson_progress WHERE student_id = ? ORDER BY lesson_id
        """,
        (student_id,),
    )
    out = []
    for r in rows:
        d = dict(r)
        d["completed"] = bool(d["completed"])
        out.append(d)
    return out


# ------------------------------------------------------------ tutor messages

def insert_tutor_message(student_id, role, content, created_at_iso, path=None):
    _write(
        path,
        """
        INSERT INTO tutor_messages (id, student_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (str(uuid.uuid4()), student_id, role, content, created_at_iso),
    )


def list_tutor_messages(student_id, limit=20, path=None):
    """Most recent `limit` messages, returned oldest first."""
    rows = _read(
        path,
        """
        SELECT id, student_id, role, content, created_at FROM (
            SELECT id, student_id, role, content, created_at, rowid AS rid
              FROM tutor_messages
             WHERE student_id = ?
             ORDER BY created_at DESC, rowid DESC
             LIMIT ?
        ) ORDER BY created_at ASC, rid ASC
        """,
        (student_id, int(limit)),
    )
    return [dict(r) for r in rows]


def count_tutor_messages_since(student_id, since_iso, path=None):
    row = _read_one(
        path,
        "SELECT COUNT(*) AS n FROM tutor_messages WHERE student_id = ? AND created_at >= ?",
        (student_id, since_iso),
    )
    return int(row["n"])


def delete_tutor_messages(student_id, path=None):
    _write(path, "DELETE FROM tutor_messages WHERE student_id = ?", (student_id,))
