# Offline Use and PWA Behaviour — The Last-Mile Tutor

This page explains, in plain language, what The Last-Mile Tutor can do without internet, how offline answers are saved and sent later, and how the app's offline support (service worker and PWA install) works.

> **Verification status:** Browser and Android runtime verification has **NOT** been completed. The behaviour described here is taken from the code. It has not been tested on real browsers or on Android devices.

## 1. What works offline

- Opening the app shell (the main page and its core files) after it has been cached once, through the service worker.
- Viewing lesson content that is already cached (`/data/chapter.json`).
- Answering practice questions. The answer is saved on the device and queued for sync.
- Completing a lesson. The completion is saved on the device and queued for sync.

## 2. What needs internet

- **AI tutor:** Needs internet. The tutor panel blocks sending when the browser reports offline.
- **Answer verdict (correct / incorrect):** The server computes it. It appears only after the server responds.
- **Sync:** Pending answers and completions are sent to the server only when the device is online.
- **Parent features:** Parent login and reports need the server.
- **Student login:** Needs the server to check the PIN and issue a session.
- **Student profile list and question list:** These are served by the backend API and need a connection to load.

## 3. What gets cached

The service worker (`public/sw.js`) precaches these files on install:

- `/`
- `/index.html`
- the web app manifest
- the app icon
- `/data/chapter.json`

Caching rules:

- **Navigation requests** (opening pages) use a **network-first** approach. The app tries the network first and falls back to cache.
- **Static assets** use a **cache-first** approach.
- Only same-origin responses with HTTP status 200 and response type `basic` are cached.
- Requests to `/api/` are never intercepted or cached. API data is not stored by the service worker.

## 4. How pending answers are stored

- Answers are saved in the browser's **IndexedDB** database named `ganita-mitra` (database version 5).
- The database has these stores: `attempts`, `lessonViews`, `prefs`, `questions`, `pendingAttempts`, `pendingCompletions`.
- Unsent answers are kept in the `pendingAttempts` store, managed by `src/lib/offlineQueue.js`.
- Each pending row has these fields: `status`, `tries`, and `lastError`.
- Each attempt has a unique ID (`uuid`). See the note in section 6 about how this ID and the server's `client_id` relate.

When an answer is saved offline, the app only confirms that the answer was **saved**. It does not show whether the answer is correct.

## 5. How lesson completion is queued

- Lesson completions are saved in the `pendingCompletions` store while the device is offline.
- They are sent to the server when sync runs with the device online. The exact completion send path was not separately verified.

## 6. Sync after reconnection and trigger points

Sync is attempted at these points:

1. The browser's `online` event fires.
2. The app starts (`startSyncOnReconnect`).
3. The user opens the profile entry.
4. A retry timer runs.
5. The user clicks the **SyncIndicator** manually.
6. The practice screen's "queued, then online" path runs after an answer was queued and the device comes back online.

Other points to know:

- No periodic background sync interval was found in the code.
- Sync is skipped while the device is offline. It runs again when the `online` event fires.
- The server **deduplicates by uuid**, so retrying a sync does not create duplicate attempts. The code also shows a `client_id` field with a unique constraint on the `attempts` table. Whether the uuid and `client_id` dedupe work together as described: **not both verified**.

## 7. Retries and GAVE_UP behaviour

- The maximum number of retry attempts is `MAX_RETRY_ATTEMPTS = 8`.
- After 8 failed tries, the pending row is marked with `lastError = GAVE_UP`.
- **Note:** There is no `exhausted` status string in the code. The give-up marker is the `lastError` value `GAVE_UP`.
- What the user sees for rows marked `GAVE_UP` was not verified.

## 8. Why offline answers are not marked correct or incorrect

- The server computes the verdict, so the app cannot show it while offline.
- The offline save path therefore shows only "saved".
- The verdict appears after the server responds.

## 9. Service-worker updates

- The service worker does **not** call `skipWaiting` on install.
- The app posts a `SKIP_WAITING` message to activate a waiting worker.
- `clients.claim()` runs on activate.
- The page reloads when the `controllerchange` event fires.
- `registerServiceWorker` accepts an `onUpdateReady` callback. The UI component that supplies this callback was **not located**, so the update prompt UI is **not verified**.

## 10. Web app manifest

- The manifest is `public/manifest.webmanifest`.
- **Inconsistency:** The manifest `name` is in Telugu (`గణిత మిత్ర`). The project name is "The Last-Mile Tutor". These names differ. Decide which name should be shown to users and align the manifest.

## 11. Limitations

- Browsers may clear IndexedDB and other storage at any time, which can remove pending answers before they are sent.
- Offline answers have no verdict until the server responds.
- The AI tutor does not work offline.
- No periodic sync exists, so answers wait until one of the trigger points above happens.
- Runtime behaviour on browsers and Android has **not** been verified (see status note at the top).

## 12. Verification status

- **Browser runtime verification: NOT completed.**
- **Android runtime verification: NOT completed.**
- Build, offline queue tests, and service worker syntax checks were not run as part of this document.
