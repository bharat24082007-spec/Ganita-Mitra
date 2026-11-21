# The Last-Mile Tutor: API Reference

## Introduction

- The backend is a FastAPI application served at `http://127.0.0.1:8000` for local development.
- All routes are mounted under `/api`.
- The backend is the source of truth for answer checking. The frontend must not decide correctness.
- This document contains no real secrets or credentials. Placeholders are used throughout, for example `<student-token>` and `<4-digit PIN>`.

## Authentication

| Route group | Required header | Notes |
|---|---|---|
| Student routes | `Authorization: Bearer <student-token>` | Token is issued by `POST /api/students/{student_id}/verify-pin`. |
| Parent routes | `Authorization: Bearer <parent-token>` | Token is issued by `POST /api/parents/login`. |
| Parent setup | `X-Setup-Token: <setup token>` | Used only by `POST /api/parents/setup`. |

- Tokens expire after 8 hours (`expires_in: 28800`).
- Tokens are HMAC-signed. There is no server-side revocation.
- A missing or invalid student token returns `401 "Authentication required"`.
- A missing or invalid parent token returns `401 "Authentication required"`.
- A valid token without the parent role returns `403 "Parent access required"`.
- Any authenticated route returns `503 "Session secret not configured"` if `SESSION_SECRET` is unset.

## Endpoints

### 1. Health check

| Item | Value |
|---|---|
| Method and path | `GET /api/health` |
| Auth | None |
| Request fields | None |
| Response fields | `status` |
| Status codes | 200 |

### 2. Create student profile

| Item | Value |
|---|---|
| Method and path | `POST /api/students` |
| Auth | None |
| Request fields | `display_name` (1 to 30 characters, trimmed, not blank); `avatar` (one of `lion`, `flower`, `rocket`, `owl`, `panda`, `star`); `class_level` (`9`); `preferred_language` (`te` or `en`); `pin` (4 digits) |
| Response fields | Public profile |
| Status codes | 201 created; 409 `"Maximum 3 student profiles per device"` |

### 3. List student profiles

| Item | Value |
|---|---|
| Method and path | `GET /api/students` |
| Auth | None |
| Request fields | None |
| Response fields | `id`, `display_name`, `avatar`, `class_level`, `preferred_language`, `created_at`. No PIN data is returned. |
| Status codes | 200 |

### 4. Verify student PIN

| Item | Value |
|---|---|
| Method and path | `POST /api/students/{student_id}/verify-pin` |
| Auth | None |
| Request fields | `pin` (`<4-digit PIN>`) |
| Response fields | `ok`, `token` (`<student-token>`), `expires_in` |
| Status codes | 200; 404 `"Student not found"`; 429 `"Too many attempts. Try again later."`; 401 `"Incorrect PIN"` |

### 5. Parent setup

| Item | Value |
|---|---|
| Method and path | `POST /api/parents/setup` |
| Auth | `X-Setup-Token: <setup token>` |
| Request fields | Not verified in this document |
| Response fields | `ok: true` |
| Status codes | 201; 503 `"Parent setup not configured"` (`PARENT_SETUP_TOKEN` unset); 401 `"Invalid setup token"`; 409 `"Parent account already set up"` |

### 6. Parent login

| Item | Value |
|---|---|
| Method and path | `POST /api/parents/login` |
| Auth | None |
| Request fields | `pin` (`<4-digit PIN>`) |
| Response fields | `ok`, `role`, `token` (`<parent-token>`), `expires_in` |
| Status codes | 200; 404 `"Parent account not set up"`; 429 `"Too many attempts. Try again later."`; 401 `"Incorrect PIN"` |

### 7. Tutor

| Item | Value |
|---|---|
| Method and path | `POST /api/tutor` |
| Auth | Student (`Bearer <student-token>`) |
| Request fields | `message` (required, 1 to 500 characters); `questionId` (optional, 1 to 20 characters); `language` (`te` or `en`, default `te`). Unknown fields are rejected. |
| Response fields | `reply`, `hint`, `steps`, `final_answer`, `needs_clarification`, `reply_type` |
| Status codes | 200; 404 `"Question not found"`; 429 (limit of 20 requests per 60 seconds per student, sliding window, held in memory); 503 (Gemini key or model missing); 502 (upstream or Gemini failure, with localised message text) |

### 8. Sync attempts

| Item | Value |
|---|---|
| Method and path | `POST /api/sync` |
| Auth | Student (`Bearer <student-token>`) |
| Request fields | Batch of up to 200 attempts. Each attempt is deduplicated by `uuid`. Attempt fields beyond `uuid` and `profileId` are not documented here. Exact request field names are not verified in this document. Batches over 200 attempts return 422 from request validation. |
| Response fields | Every `uuid` in the batch is listed as accepted, including duplicates. |
| Status codes | 200; 403 `"Cannot sync another profile's attempts"` (applies to the whole batch when `profileId` does not match the token subject); 404 `"Student not found"`; 422 (batch over 200 attempts) |

Notes:
- `submitted_answer` is stored as an empty string on the server.

### 9. List linear-equations questions

| Item | Value |
|---|---|
| Method and path | `GET /api/chapters/linear-equations/questions` |
| Auth | None |
| Request fields | Optional query parameters: `lesson_id` (max 10 characters); `topic` (max 30 characters) |
| Response fields | Questions. Answers are not included. |
| Status codes | 200; 422 (query validation failure) |

### 10. Check answer

| Item | Value |
|---|---|
| Method and path | `POST /api/questions/{question_id}/check` |
| Auth | Student (`Bearer <student-token>`) |
| Request fields | `answer` (no minimum length; an empty string is graded incorrect). `lang` is accepted but ignored by this endpoint. |
| Response fields | `is_correct`, `attempts`, plus hint, solution, and explanation fields. On replay of an already-recorded answer, only `is_correct` and `attempts` are returned, and the hint, solution, and explanation fields are `null`. |
| Status codes | 200; 404 `"Question not found"` |

Notes:
- The verdict is computed on the server.

### 11. Student progress

| Item | Value |
|---|---|
| Method and path | `GET /api/students/{student_id}/progress` |
| Auth | Student (own profile only) |
| Request fields | None |
| Response fields | Not verified in this document |
| Status codes | 200; 403 `"Cannot view another profile's progress"`; 404 `"Student not found"` |

### 12. Complete lesson

| Item | Value |
|---|---|
| Method and path | `POST /api/lessons/{lesson_id}/complete` |
| Auth | Student (`Bearer <student-token>`) |
| Request fields | Not verified in this document |
| Response fields | Not verified in this document |
| Status codes | 404 `"Lesson not found"`; other codes not verified in this document |

### 13. Parent: list students

| Item | Value |
|---|---|
| Method and path | `GET /api/parents/students` |
| Auth | Parent (`Bearer <parent-token>`) |
| Request fields | None |
| Response fields | List of students. Individual fields not verified in this document. |
| Status codes | Not verified in this document (see Common status codes for auth errors) |

### 14. Parent: student report

| Item | Value |
|---|---|
| Method and path | `GET /api/parents/students/{student_id}/report` |
| Auth | Parent (`Bearer <parent-token>`) |
| Request fields | None |
| Response fields | Report, including recommendations. Other fields not verified in this document. |
| Status codes | 200; 404 `"Student not found"` |

## Common status codes

| Code | Meaning | Typical message |
|---|---|---|
| 401 | Missing or invalid token, or incorrect PIN or setup token | `"Authentication required"`, `"Incorrect PIN"`, `"Invalid setup token"` |
| 403 | Valid token but wrong role or wrong profile | `"Parent access required"`, `"Cannot view another profile's progress"`, `"Cannot sync another profile's attempts"` |
| 404 | Resource not found | `"Student not found"`, `"Question not found"`, `"Lesson not found"`, `"Parent account not set up"` |
| 409 | Conflict with existing state | `"Maximum 3 student profiles per device"`, `"Parent account already set up"` |
| 422 | Request validation failure | Returned by FastAPI validation, for example a sync batch over 200 attempts |
| 429 | Rate or attempt limit reached | `"Too many attempts. Try again later."`; tutor limit of 20 requests per 60 seconds per student |
| 502 | Upstream AI failure | Localised error text |
| 503 | Server configuration missing | `"Session secret not configured"`, `"Parent setup not configured"`, Gemini key or model missing |
