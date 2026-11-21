// Centralized API client for The Last-Mile Tutor backend.
// Tokens live in sessionStorage only. Never localStorage or IndexedDB.

export const API_BASE = import.meta.env.VITE_API_BASE || '';

const STUDENT_TOKEN_KEY = 'lmt.studentToken';
const PARENT_TOKEN_KEY = 'lmt.parentToken';

export const ERROR_CODES = {
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  VALIDATION: 'validation',
  RATE_LIMITED: 'rate_limited',
  UNAVAILABLE: 'unavailable',
  NETWORK: 'network',
  SERVER: 'server',
  UNKNOWN: 'unknown',
};

export class ApiError extends Error {
  constructor(status, code, detail) {
    super(typeof detail === 'string' ? detail : code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function codeForStatus(status) {
  switch (status) {
    case 401: return ERROR_CODES.UNAUTHORIZED;
    case 403: return ERROR_CODES.FORBIDDEN;
    case 404: return ERROR_CODES.NOT_FOUND;
    case 409: return ERROR_CODES.CONFLICT;
    case 422: return ERROR_CODES.VALIDATION;
    case 429: return ERROR_CODES.RATE_LIMITED;
    case 503: return ERROR_CODES.UNAVAILABLE;
    default:
      if (status >= 500) return ERROR_CODES.SERVER;
      return ERROR_CODES.UNKNOWN;
  }
}

// Maps an error to an i18n key for a short message. Used by PIN and profile screens.
export function errorKeyFor(err) {
  if (!(err instanceof ApiError)) return 'genericError';
  switch (err.code) {
    case ERROR_CODES.UNAUTHORIZED: return 'pinWrong';
    case ERROR_CODES.RATE_LIMITED: return 'pinLocked';
    case ERROR_CODES.NOT_FOUND: return 'profileMissing';
    case ERROR_CODES.CONFLICT: return 'maxProfiles';
    case ERROR_CODES.UNAVAILABLE: return 'serverUnavailable';
    case ERROR_CODES.NETWORK: return 'networkError';
    default: return 'genericError';
  }
}

async function readBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Perform a JSON request.
 * @param {string} path  e.g. '/api/students'
 * @param {{method?: string, body?: any, token?: string|null, headers?: Record<string,string>}} [opts]
 * @returns {Promise<any>} parsed JSON body on 2xx
 * @throws {ApiError}
 */
export async function apiRequest(path, { method = 'GET', body, token, headers = {} } = {}) {
  const finalHeaders = { Accept: 'application/json', ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(0, ERROR_CODES.NETWORK, 'network_error');
  }

  const data = await readBody(res);
  if (!res.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : (typeof data === 'string' ? data : res.statusText);
    throw new ApiError(res.status, codeForStatus(res.status), detail || codeForStatus(res.status));
  }
  return data;
}

// ---- Student token (sessionStorage only) ----

export function getStudentToken() {
  try {
    return sessionStorage.getItem(STUDENT_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStudentToken(token) {
  try {
    if (token) sessionStorage.setItem(STUDENT_TOKEN_KEY, token);
    else sessionStorage.removeItem(STUDENT_TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

// The active student's id, kept beside the token so the sync queue can send only that profile's rows.
const STUDENT_ID_KEY = 'lmt.studentId';

export function getStudentId() {
  try {
    return sessionStorage.getItem(STUDENT_ID_KEY);
  } catch {
    return null;
  }
}

export function setStudentId(id) {
  try {
    if (id) sessionStorage.setItem(STUDENT_ID_KEY, id);
    else sessionStorage.removeItem(STUDENT_ID_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function clearStudentToken() {
  setStudentToken(null);
  setStudentId(null);
}

// ---- Parent token (sessionStorage only) ----

export function getParentToken() {
  try {
    return sessionStorage.getItem(PARENT_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setParentToken(token) {
  try {
    if (token) sessionStorage.setItem(PARENT_TOKEN_KEY, token);
    else sessionStorage.removeItem(PARENT_TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function clearParentToken() {
  setParentToken(null);
}
