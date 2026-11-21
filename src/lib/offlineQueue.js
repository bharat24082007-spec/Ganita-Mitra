export const MAX_ANSWER_LENGTH = 100;
export const MAX_RETRY_ATTEMPTS = 8;

function requireValue(value, name) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new TypeError(`${name} is required`);
  }
}

export function makePendingAttempt({ profileId, questionId, answer, lang, uuid, createdAt } = {}) {
  requireValue(profileId, 'profileId');
  requireValue(questionId, 'questionId');
  requireValue(uuid, 'uuid');
  const trimmed = String(answer ?? '').trim();
  if (trimmed === '') {
    throw new TypeError('answer is required');
  }
  if (trimmed.length > MAX_ANSWER_LENGTH) {
    throw new TypeError(`answer must be at most ${MAX_ANSWER_LENGTH} characters`);
  }
  return {
    uuid,
    profileId,
    questionId,
    answer: trimmed,
    lang: lang === 'en' ? 'en' : 'te',
    createdAt,
    status: 'pending',
    tries: 0,
    lastError: null,
  };
}

export function makePendingCompletion({ profileId, lessonId, completedAt } = {}) {
  requireValue(profileId, 'profileId');
  requireValue(lessonId, 'lessonId');
  return {
    key: profileId + ':' + lessonId,
    profileId,
    lessonId,
    completedAt,
    status: 'pending',
    tries: 0,
    lastError: null,
  };
}

export function pendingForProfile(rows, profileId) {
  return rows.filter((r) => r.profileId === profileId && r.status === 'pending');
}

export function retryDelayMs(tries) {
  if (!Number.isInteger(tries) || tries < 0) {
    throw new RangeError('tries must be a non-negative integer');
  }
  return Math.min(60000, 1000 * 2 ** tries);
}

export function shouldGiveUp(tries) {
  return tries >= MAX_RETRY_ATTEMPTS;
}

export function isOfflineError(err) {
  if (err === null || err === undefined) return false;
  if (err instanceof TypeError) return true;
  return err.code === 'network' || err.code === 'NETWORK' || err.status === 0;
}

export function checkBody({ answer, lang, clientId } = {}) {
  requireValue(clientId, 'clientId');
  return { answer, lang, clientId };
}
