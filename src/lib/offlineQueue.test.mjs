import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makePendingAttempt,
  makePendingCompletion,
  pendingForProfile,
  retryDelayMs,
  shouldGiveUp,
  isOfflineError,
  checkBody,
} from './offlineQueue.js';

test('makePendingAttempt trims the answer and sets status pending', () => {
  const row = makePendingAttempt({
    profileId: 'p1',
    questionId: 'q1',
    answer: '  42  ',
    lang: 'en',
    uuid: 'u1',
    createdAt: 1000,
  });
  assert.equal(row.answer, '42');
  assert.equal(row.status, 'pending');
  assert.equal(row.lang, 'en');
  assert.equal(row.tries, 0);
  assert.equal(row.lastError, null);
});

test('makePendingAttempt throws TypeError for empty answer, 101-character answer, and empty uuid', () => {
  assert.throws(
    () => makePendingAttempt({ profileId: 'p1', questionId: 'q1', answer: '   ', lang: 'te', uuid: 'u1' }),
    TypeError,
  );
  assert.throws(
    () => makePendingAttempt({ profileId: 'p1', questionId: 'q1', answer: 'a'.repeat(101), lang: 'te', uuid: 'u1' }),
    TypeError,
  );
  assert.throws(
    () => makePendingAttempt({ profileId: 'p1', questionId: 'q1', answer: 'x', lang: 'te', uuid: '' }),
    TypeError,
  );
});

test('makePendingCompletion key equals profileId + ":" + lessonId', () => {
  const row = makePendingCompletion({ profileId: 'p1', lessonId: 'l7', completedAt: 5 });
  assert.equal(row.key, 'p1:l7');
  assert.equal(row.status, 'pending');
});

test('pendingForProfile keeps only the requested profile pending rows', () => {
  const rows = [
    { profileId: 'p1', status: 'pending', uuid: 'a' },
    { profileId: 'p1', status: 'done', uuid: 'b' },
    { profileId: 'p2', status: 'pending', uuid: 'c' },
    { profileId: 'p1', status: 'pending', uuid: 'd' },
  ];
  const result = pendingForProfile(rows, 'p1');
  assert.deepEqual(result.map((r) => r.uuid), ['a', 'd']);
});

test('retryDelayMs computes capped exponential backoff and rejects invalid tries', () => {
  assert.equal(retryDelayMs(0), 1000);
  assert.equal(retryDelayMs(3), 8000);
  assert.equal(retryDelayMs(20), 60000);
  assert.throws(() => retryDelayMs(-1), RangeError);
  assert.throws(() => retryDelayMs(1.5), RangeError);
});

test('shouldGiveUp starts at MAX_RETRY_ATTEMPTS (8)', () => {
  assert.equal(shouldGiveUp(7), false);
  assert.equal(shouldGiveUp(8), true);
});

test('isOfflineError detects fetch TypeError and NETWORK code', () => {
  assert.equal(isOfflineError(new TypeError('Failed to fetch')), true);
  assert.equal(isOfflineError(new Error('x')), false);
  assert.equal(isOfflineError(Object.assign(new Error('n'), { code: 'NETWORK' })), true);
});

test('isOfflineError detects ApiError network shape (code network, status 0)', () => {
  assert.equal(isOfflineError(Object.assign(new Error('network_error'), { code: 'network', status: 0 })), true);
  assert.equal(isOfflineError({ status: 0 }), true);
});

test('isOfflineError rejects HTTP error statuses and null/undefined', () => {
  assert.equal(isOfflineError({ status: 401 }), false);
  assert.equal(isOfflineError({ status: 503, code: 'upstream' }), false);
  assert.equal(isOfflineError(null), false);
  assert.equal(isOfflineError(undefined), false);
});

test('checkBody returns only answer, lang, clientId and rejects empty clientId', () => {
  const body = checkBody({ answer: 'x=2, y=3', lang: 'en', clientId: 'c1', extra: 1 });
  assert.deepEqual(body, { answer: 'x=2, y=3', lang: 'en', clientId: 'c1' });
  assert.throws(() => checkBody({ answer: 'x', lang: 'en', clientId: '' }), TypeError);
});
