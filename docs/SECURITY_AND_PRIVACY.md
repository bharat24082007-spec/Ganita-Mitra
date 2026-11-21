# Security and Privacy — The Last-Mile Tutor

This page describes, in plain language, how The Last-Mile Tutor handles roles, logins, data, and secrets. It describes what the code does. It is **not** a legal compliance statement and it is **not** a security certification. No formal security audit has been completed.

> **Verification status:** Browser and Android runtime verification has **NOT** been completed. Deployment configuration has **NOT** been checked. Items marked "not verified" below need checking before any real use.

## 1. Role separation

The app has two kinds of users:

- **Students:** Log in with a student profile and PIN. Student tokens carry a subject (`sub`) and an expiry (`exp`).
- **Parents:** Use a parent token. Parent tokens carry the role `parent`.

Student routes reject tokens that carry a role claim. This keeps parent tokens out of student routes.

## 2. Student data isolation

- **Not verified:** Whether every student route checks that the token's student matches the requested data. A full review was not completed.
- **Public data:** The student profile list (`GET /api/students`) does not require login. It returns `id`, `display_name`, `avatar`, `class_level`, `preferred_language`, and `created_at`.
- **Public data:** The question list does not require login. It returns questions without answers.

## 3. Session storage approach

Session values are kept in the browser's storage. Only key names are listed here:

- `lmt.studentSession` — student session, stored in `sessionStorage`.
- `lmt.parentToken` — parent token, stored in `sessionStorage`.
- `lmt.lastSynced` — last sync time, stored in `localStorage`.

Notes:

- Values in browser storage can be read by code running in the page, so they are only as safe as the device and browser.
- Tokens are **not** revoked on the server when the user logs out. See section 4.

## 4. Token design

- Tokens are custom **HMAC-SHA256** tokens. They are not JWTs.
- Tokens expire after **8 hours**.
- There is **no server-side revocation** and **no logout invalidation**. A token stays valid until it expires, even after logout.

## 5. PIN authentication and lockout

- PINs are checked with **PBKDF2-SHA256** using **200,000 iterations** and a **16-byte salt**.
- The PIN comparison uses a **constant-time comparison**.
- **Lockout:** After **5 failed PIN attempts**, the account is locked for **15 minutes**.
- The failure counter resets when a lock is applied and after a successful PIN entry.
- The PIN hashes and salts are stored on the backend. They are not shown in this document.

## 6. Parent setup token

- Parent setup uses an `X-Setup-Token` request header.
- The expected value comes from the `PARENT_SETUP_TOKEN` environment variable. It is read when the call is made.
- Parent setup can be done **once only**. After setup, further calls return HTTP 409.
- **Search result:** A search of `src/` and `public/` found no reference to `PARENT_SETUP_TOKEN`. Keeping it out of frontend code should still be confirmed in the built output.

Set the real value only in the server's environment. Do not write it in any file that is committed to the repository.

## 7. API key protection

- The Gemini API is called **only from the server**. The browser never calls Gemini directly.
- The Gemini key is read from the server environment (`GEMINI_API_KEY`).
- **Search result:** A search of `src/` and `public/` found no reference to `GEMINI_API_KEY`.
- The key must not be placed in frontend code, in `public/`, or in committed files.

## 8. Tutor rate limit

- The AI tutor is limited to **20 requests per 60 seconds per student**.
- The limiter is kept **in memory**. It resets when the backend restarts.

## 9. CORS and transport

- CORS allows only `http://localhost:5173` and `http://127.0.0.1:5173`.
- Allowed methods are `GET` and `POST`.
- **Not in code:** No HTTPS redirect, no scheme check, and no HSTS header were found in the code.
- **Not verified:** Deployment configuration (for example, reverse proxy or hosting HTTPS settings) was not checked.

## 10. Tutor conversation privacy and parent report

- Tutor messages are stored in the `tutor_messages` table.
- The parent report includes **recommendations**.
- **Not verified:** Whether the parent report includes the tutor conversation. Check this before describing parent visibility to anyone.

## 11. Data stored locally and on the backend

**On the device (browser):**

- IndexedDB database `ganita-mitra` (version 5) with stores `attempts`, `lessonViews`, `prefs`, `questions`, `pendingAttempts`, and `pendingCompletions`.
- Session values listed in section 3.

**On the backend (database tables):**

- `students`
- `questions` (rows are upserted from the chapter JSON on startup)
- `attempts`
- `lesson_progress`
- `tutor_messages`
- `parent_config`

## 12. Limitations

- Tokens cannot be revoked before they expire (8 hours).
- The tutor rate limiter resets on backend restart.
- `DATABASE_PATH` in `backend/.env` is read when the module is imported, before dotenv loads. It is ignored unless it is set in the real process environment.
- Browsers may clear IndexedDB and storage at any time.
- No HTTPS enforcement exists in the code.
- Runtime behaviour in browsers and on Android has **not** been verified.

## 13. Recommended production safeguards

These are **recommendations**, not features that exist in the code today.

1. Serve the app and API only over HTTPS, and redirect HTTP to HTTPS.
2. Add HSTS once HTTPS is confirmed.
3. Set `PARENT_SETUP_TOKEN`, `GEMINI_API_KEY`, and the token signing secret only in the server environment or a secrets manager. Never commit them.
4. Add a server-side token revocation or logout mechanism, or shorten token lifetime.
5. Review every student route for cross-student access.
6. Decide whether student profile and question lists should require authentication.
7. Move the rate limiter to shared storage if more than one backend instance is run.
8. Confirm the parent report's contents, including whether tutor conversations are shown.
9. Set `DATABASE_PATH` in the real process environment, or fix the load order.
10. Run a proper security review and runtime tests on browsers and Android before real student use.
