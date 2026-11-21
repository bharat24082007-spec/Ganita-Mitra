import {
  listPendingAttempts,
  updatePendingAttempt,
  deletePendingAttempt,
  listPendingCompletions,
  deletePendingCompletion,
  savePendingCompletion,
} from './db.js';
import { apiRequest, ApiError, getStudentSession } from './api.js';
import {
  pendingForProfile,
  retryDelayMs,
  shouldGiveUp,
  isOfflineError,
  checkBody,
} from './offlineQueue.js';

// A timestamp only (not a secret). Kept so the indicator can show when the last real sync happened.
const LAST_SYNCED_KEY = 'lmt.lastSynced';
const GAVE_UP = 'GAVE_UP';

function readLastSynced() {
  try {
    return localStorage.getItem(LAST_SYNCED_KEY);
  } catch {
    return null;
  }
}

function writeLastSynced(iso) {
  try {
    localStorage.setItem(LAST_SYNCED_KEY, iso);
  } catch {
    /* storage unavailable */
  }
}

// state: 'idle' | 'syncing' | 'synced' | 'offline' | 'failed' | 'no_session'
// 'synced' is only set after the server has confirmed every item in a pass.
let status = { state: 'idle', pending: 0, lastSynced: readLastSynced(), lastError: null };
const listeners = new Set();
let inFlight = null;
let retryTimer = null;

export function getSyncStatus() {
  return status;
}

export function subscribeSyncStatus(callback) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function setStatus(patch) {
  status = { ...status, ...patch };
  for (const cb of [...listeners]) {
    try {
      cb(status);
    } catch {
      /* one bad subscriber must not stop the others */
    }
  }
}

function clearRetry() {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

// Retries only rows that have not hit the give-up limit, so the timer can never loop forever.
function scheduleRetry(triesList) {
  clearRetry();
  const live = triesList.filter((t) => !shouldGiveUp(t));
  if (live.length === 0) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    flushQueue();
  }, retryDelayMs(Math.max(...live)));
}

const byCreated = (x, y) =>
  String(x.createdAt ?? x.completedAt ?? '').localeCompare(String(y.createdAt ?? y.completedAt ?? ''));

// Pending rows for one profile only, oldest first.
async function loadPending(studentId) {
  if (!studentId) return { attempts: [], completions: [] };
  const [attemptRows, completionRows] = await Promise.all([
    listPendingAttempts(studentId),
    listPendingCompletions(studentId),
  ]);
  return {
    attempts: pendingForProfile(attemptRows, studentId).sort(byCreated),
    completions: pendingForProfile(completionRows, studentId).sort(byCreated),
  };
}

function buildItems(attempts, completions, token) {
  const items = [];
  for (const r of attempts) {
    items.push({
      tries: r.tries ?? 0,
      send: () =>
        apiRequest(`/api/questions/${encodeURIComponent(r.questionId)}/check`, {
          method: 'POST',
          token,
          body: checkBody({ answer: r.answer, lang: r.lang, clientId: r.uuid }),
        }),
      remove: () => deletePendingAttempt(r.uuid),
      record: (patch) => updatePendingAttempt(r.uuid, patch),
    });
  }
  for (const r of completions) {
    items.push({
      tries: r.tries ?? 0,
      send: () =>
        apiRequest(`/api/lessons/${encodeURIComponent(r.lessonId)}/complete`, {
          method: 'POST',
          token,
        }),
      remove: () => deletePendingCompletion(r.key),
      // put() keyed by row.key, so writing the merged row back updates it in place.
      record: (patch) => savePendingCompletion({ ...r, ...patch }),
    });
  }
  return items;
}

async function bump(item, lastError) {
  item.tries += 1;
  await item.record({ tries: item.tries, lastError });
}

async function runFlush() {
  clearRetry();
  const { id: studentId, token } = getStudentSession();
  const { attempts, completions } = await loadPending(studentId);
  const pendingCount = attempts.length + completions.length;

  if (!studentId || !token) {
    setStatus({ state: 'no_session', pending: pendingCount, lastError: null });
    return;
  }

  const items = buildItems(attempts, completions, token);
  if (items.length > 0 && typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ state: 'offline', pending: pendingCount, lastError: 'NETWORK' });
    return;
  }
  if (items.length > 0) setStatus({ state: 'syncing', pending: pendingCount, lastError: null });

  let sent = 0;
  let failed = false;
  let transient = false;
  let stop = null; // 'no_session' | 'offline' | 'retry'
  let lastError = null;
  const failingTries = [];

  for (const item of items) {
    if (shouldGiveUp(item.tries)) {
      failed = true;
      lastError = GAVE_UP;
      continue;
    }
    try {
      await item.send();
      await item.remove();
      sent += 1;
    } catch (err) {
      const httpStatus = err instanceof ApiError ? err.status : undefined;
      if (httpStatus === 401) {
        // Bad or expired student token: stop and keep every row.
        stop = 'no_session';
        break;
      }
      const isNetwork = err instanceof ApiError ? !httpStatus : isOfflineError(err);
      if (isNetwork) {
        stop = 'offline';
        failed = true;
        transient = true;
        lastError = 'NETWORK';
        await bump(item, 'NETWORK');
        failingTries.push(item.tries);
        break;
      }
      const code = err instanceof ApiError ? httpStatus : 'ERROR';
      lastError = String(code);
      failed = true;
      await bump(item, String(code));
      failingTries.push(item.tries);
      if (code === 429 || code === 503) {
        transient = true;
        stop = 'retry';
        break;
      }
      if (typeof code === 'number' && code >= 500) transient = true;
    }
  }

  const pendingNow = pendingCount - sent;

  if (stop === 'no_session') {
    setStatus({ state: 'no_session', pending: pendingNow, lastError: 'UNAUTHORIZED' });
    return;
  }
  if (stop === 'offline') {
    setStatus({ state: 'offline', pending: pendingNow, lastError: 'NETWORK' });
    scheduleRetry(failingTries);
    return;
  }
  if (failed) {
    setStatus({ state: 'failed', pending: pendingNow, lastError });
    if (transient) scheduleRetry(failingTries);
    return;
  }

  let lastSynced = status.lastSynced;
  if (sent > 0) {
    lastSynced = new Date().toISOString();
    writeLastSynced(lastSynced);
  }
  setStatus({ state: 'synced', pending: pendingNow, lastSynced, lastError: null });
}

async function runFlushSafely() {
  try {
    await runFlush();
  } catch {
    // Unexpected error: nothing is deleted on this path, so every row stays queued.
    setStatus({ state: 'failed', lastError: 'UNEXPECTED' });
  }
}

// Sends queued answers and lesson completions for the signed-in student only.
// Only one flush runs at a time; a second call gets the running promise. Never throws.
export function flushQueue() {
  if (inFlight) return inFlight;
  inFlight = runFlushSafely().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function triggerSync() {
  return flushQueue();
}

// Flushes once now and again whenever the browser reports it is back online.
export function startSyncOnReconnect() {
  flushQueue();
  const onOnline = () => {
    flushQueue();
  };
  window.addEventListener('online', onOnline);
  return () => {
    window.removeEventListener('online', onOnline);
    clearRetry();
  };
}
