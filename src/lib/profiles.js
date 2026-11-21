// Student profiles come from the backend. No PIN is stored or compared in the browser.
import { apiRequest, getStudentToken, setStudentToken, setStudentId } from './api.js';

// Backend avatar keys mapped to the emoji shown on screen
export const AVATARS = [
  { key: 'lion', emoji: '🦁' },
  { key: 'flower', emoji: '🌸' },
  { key: 'rocket', emoji: '🚀' },
  { key: 'owl', emoji: '🦉' },
  { key: 'panda', emoji: '🐼' },
  { key: 'star', emoji: '⭐' },
];

const AVATAR_EMOJI = Object.fromEntries(AVATARS.map((a) => [a.key, a.emoji]));

// Maps a backend student row to the shape the UI uses
export function toProfile(row) {
  return {
    id: row.id,
    name: row.display_name,
    avatar: AVATAR_EMOJI[row.avatar] ?? '🙂',
    avatarKey: row.avatar,
    preferredLanguage: row.preferred_language,
  };
}

export async function listStudents() {
  const rows = await apiRequest('/api/students');
  return (rows || []).map(toProfile);
}

export async function createStudent({ displayName, avatar, preferredLanguage, pin }) {
  const row = await apiRequest('/api/students', {
    method: 'POST',
    body: {
      display_name: displayName,
      avatar,
      class_level: 9,
      preferred_language: preferredLanguage,
      pin,
    },
  });
  return toProfile(row);
}

// Verifies the PIN on the server and keeps the returned student token in sessionStorage only
export async function verifyStudentPin(studentId, pin) {
  const res = await apiRequest(`/api/students/${encodeURIComponent(studentId)}/verify-pin`, {
    method: 'POST',
    body: { pin },
  });
  setStudentToken(res.token);
  setStudentId(studentId);
  return res;
}

export function hasStudentToken() {
  return Boolean(getStudentToken());
}
