import { getUnsyncedAttempts, markSynced } from './db.js';
import { apiRequest, getStudentId, getStudentToken } from './api.js';

const BATCH_SIZE = 100;
// Prevents overlapping flushes (e.g. two 'online' events in a row).
let running = false;

// Sends queued attempts for the signed-in student only. Rows are marked synced only for the uuids
// the server lists as accepted. Nothing is sent when no student token is held.
export async function flushQueue() {
  if (running) return false;
  running = true;
  try {
    // Offline: skip quietly; the 'online' listener will retry later.
    if (navigator.onLine === false) return true;
    const token = getStudentToken();
    const studentId = getStudentId();
    if (!token || !studentId) return false;

    const pending = (await getUnsyncedAttempts()).filter((r) => r.profileId === studentId);
    if (pending.length === 0) return true;

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      // Send only the fields the server's Attempt model accepts; no local id or synced flag.
      const batch = pending.slice(i, i + BATCH_SIZE).map((r) => ({
        uuid: r.uuid,
        profileId: r.profileId,
        questionId: r.questionId,
        correct: r.correct,
        topic: r.topic ?? '',
        hintsUsed: r.hintsUsed ?? 0,
        solutionShown: r.solutionShown ?? false,
        timestamp: r.timestamp ?? '',
      }));
      const sent = new Set(batch.map((a) => a.uuid));
      // Stop without marking on any error: unaccepted rows stay queued for the next flush.
      const json = await apiRequest('/api/sync', {
        method: 'POST',
        token,
        body: { attempts: batch },
      });
      const accepted = (json?.accepted || []).filter((u) => sent.has(u));
      await markSynced(accepted);
    }
    return true;
  } catch {
    return false;
  } finally {
    running = false;
  }
}

export function startSyncOnReconnect() {
  flushQueue();
  const onOnline = () => flushQueue();
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}
