// Student profiles come from the backend. No PIN is stored or compared in the browser.
import { apiRequest, getStudentToken, setStudentSession } from './api.js';

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
  setStudentSession(studentId, res.token);
  return res;
}

// PIN-only login. The server returns a token and no student name or ID.
// device_id only limits PIN guessing per device; it is not a credential.
export async function loginByPin(pin, deviceId) {
  return apiRequest('/api/students/login-by-pin', {
    method: 'POST',
    body: { pin, device_id: deviceId },
  });
}

const DEVICE_ID_KEY = 'lmt.deviceId';
const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
let memoryDeviceId = null;

function newDeviceId() {
  let id = '';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    id = crypto.randomUUID().replace(/-/g, '');
  }
  if (!id) {
    for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}

// Random per-browser id sent with PIN login. Stored in localStorage, or in memory if storage is blocked.
export function getDeviceId() {
  try {
    const saved = localStorage.getItem(DEVICE_ID_KEY);
    if (saved && DEVICE_ID_PATTERN.test(saved)) {
      memoryDeviceId = saved;
      return saved;
    }
  } catch {
    /* storage unavailable */
  }
  if (!memoryDeviceId || !DEVICE_ID_PATTERN.test(memoryDeviceId)) memoryDeviceId = newDeviceId();
  try {
    localStorage.setItem(DEVICE_ID_KEY, memoryDeviceId);
  } catch {
    /* storage unavailable */
  }
  return memoryDeviceId;
}


export function hasStudentToken() {
  return Boolean(getStudentToken());
}
