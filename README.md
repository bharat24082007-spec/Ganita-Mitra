# The Last-Mile Tutor

## Overview

The Last-Mile Tutor is a learning app for Class 9 students of the Telangana Board, currently covering the linear equations chapter. It is Telugu-first with an English option.

- **AI tutor "Mitra"** gives hint-first guidance (server-side Gemini calls only).
- **Offline lessons and practice** work in the browser after the first load.
- **Up to three student profiles per device.**
- **PIN-based student login.**
- **Parent dashboard**: set up once with a setup token, then log in to view progress.
- **Progress tracking and sync** from offline queues to the server.
- **Installable PWA** (service worker plus web manifest).

> **Naming inconsistency (to fix later):** some code still uses the name "Ganita Mitra", and the web manifest name is in Telugu. The product name is The Last-Mile Tutor.

## Implemented vs Pending

### Implemented

- Chapter content (linear equations) served as static data.
- Student profiles (up to three per device) with PIN-based login.
- Practice with server-side answer checking.
- AI tutor "Mitra" via FastAPI and Gemini (hint-first, rate limited, online only).
- Offline lessons and practice with IndexedDB queues for attempts and lesson completions.
- Background sync to the server with retry (up to 8 tries).
- Parent setup (one-time, with setup token) and parent login.
- Progress tracking stored in SQLite.
- Service worker with precaching and web manifest for installation.

### Pending real-device verification

No browser or Android test has been run. The following must be verified on real devices:

- Browser offline reload
- Offline answer submission
- Offline lesson completion
- Reconnection sync
- Duplicate prevention
- Multi-profile use on one device
- Parent/student isolation
- Service-worker updates
- Android install
- 360px and 430px layouts

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** FastAPI + Python
- **Server database:** SQLite
- **Browser offline storage:** IndexedDB
- **PWA:** service worker + web manifest
- **AI tutor:** Gemini API (server-side only)

## Prerequisites

- **Python 3.x:** version not pinned in this repo; use a recent Python 3 and verify it works.
- **Node.js and npm:** no `engines` field is set; use the current LTS release (not pinned).
- **Git:** optional.

## Backend Setup (Windows)

Run these from the repository root:

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Create your local environment file from the example (the example lives at `backend\.env.example`):

```bat
copy .env.example .env
```

Edit `backend\.env` and put in real values for `GEMINI_API_KEY`, `MODEL_NAME`, `SESSION_SECRET`, and `PARENT_SETUP_TOKEN`. **Never commit `.env`.**

Start the API from the `backend` folder:

```bat
uvicorn main:app --reload --port 8000
```

Health check: http://127.0.0.1:8000/api/health (returns a status JSON).

**Database path:** the default is `backend/data/tutor.db`, relative to the working directory. `DATABASE_PATH` in `.env` is read before dotenv loads, so it is ignored there. If you need a custom path, set `DATABASE_PATH` as a real environment variable instead.

## Frontend Setup (Windows)

Run these from the repository root:

```bat
npm.cmd install
npm.cmd run dev
```

The dev server runs at http://localhost:5173 and Vite proxies `/api` to port 8000, so start the backend first.

- Optional: `VITE_API_BASE` can override the API base URL (optional; not required for local development).
- Build: `npm.cmd run build`
- Preview the production build: `npm.cmd run preview`

## Security Notes

- Never commit `.env` files. Only `backend\.env.example` (placeholders) belongs in git.
- The Gemini API key stays on the backend. It is never sent to the browser.
- The parent setup token never belongs in frontend code.

See [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) for details.

## Project Structure

Top level (repo root):

- `backend/` - FastAPI server, SQLite access, tutor and checker logic, tests.
- `src/` - React frontend source (`App.jsx`, `main.jsx`, `index.css`, `components/`, `lib/`).
- `public/` - static assets served by Vite, including the service worker.
- `docs/` - project documentation.
- `scripts/` - helper scripts.
- `.codebenders/` - internal project tooling files.
- `.vscode/` - editor settings.
- `index.html` - Vite entry HTML.
- `package.json`, `package-lock.json`, `vite.config.js`, `postcss.config.mjs` - frontend build configuration.
- `npm-install.log` - log from a previous npm install.

Backend (`backend/`):

- `main.py` - FastAPI app and routes.
- `db.py` - SQLite access.
- `security.py` - PIN, token, and session handling.
- `tutor.py` - Gemini tutor integration.
- `checker.py` - answer checking.
- `verify_content.py` - content verification script.
- `chapter_linear_equations.json` - chapter content.
- `requirements.txt` - Python dependencies.
- `.env.example` - environment variable template (placeholders only).
- `data/` - local data folder (default location for `tutor.db`).
- `ganita_mitra.db` - an existing SQLite database file.
- `tests/` - backend tests.

Frontend (`src/`):

- `App.jsx`, `main.jsx` - app entry and root component.
- `index.css` - styles.
- `components/` - React components.
- `lib/` - client logic (API, offline queue, sync, service worker registration).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Offline and PWA](docs/OFFLINE_AND_PWA.md)
- [Security and Privacy](docs/SECURITY_AND_PRIVACY.md)
- [Testing](docs/TESTING.md)
