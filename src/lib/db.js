const DB_NAME = 'ganita-mitra';
// Version 2 adds uuid + synced fields to attempts so they can be synced later.
// Version 3 adds the lessonViews store used for the progress screen.
// Version 4 adds the prefs store used for the language choice.
const DB_VERSION = 4;

// Cached so every caller shares one connection instead of reopening the DB.
let dbPromise = null;

// Random ids let the server de-duplicate retried uploads. Fallback covers older browsers.
export function newUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        const tx = event.target.transaction;
        let store;
        // Guard so re-running the upgrade never throws on an existing store or index.
        if (!db.objectStoreNames.contains('attempts')) {
          store = db.createObjectStore('attempts', { keyPath: 'id', autoIncrement: true });
        } else {
          store = tx.objectStore('attempts');
        }
        // The profileId index lets us load one profile's history without scanning all rows.
        if (!store.indexNames.contains('profileId')) {
          store.createIndex('profileId', 'profileId');
        }
        // Backfill old (v1) rows so every attempt has a uuid and is marked unsynced.
        if (event.oldVersion < 2) {
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;
            const record = cursor.value;
            if (!record.uuid) {
              record.uuid = newUuid();
              record.synced = false;
              cursor.update(record);
            }
            cursor.continue();
          };
        }
        // Keyed by profileId:lessonId so each lesson counts once per profile.
        if (event.oldVersion < 3 && !db.objectStoreNames.contains('lessonViews')) {
          db.createObjectStore('lessonViews', { keyPath: 'key' });
        }
        // Small key/value store for per-profile settings such as language.
        if (event.oldVersion < 4 && !db.objectStoreNames.contains('prefs')) {
          db.createObjectStore('prefs', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      // Clear the cache on failure so a later call can retry.
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

export async function addAttempt(attempt) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attempts', 'readwrite');
    // Stored in the same call so the attempt is never lost before it is synced.
    const req = tx.objectStore('attempts').add({
      ...attempt,
      timestamp: new Date().toISOString(),
      uuid: newUuid(),
      synced: false,
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAttempts(profileId) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction('attempts', 'readonly')
        .objectStore('attempts')
        .index('profileId')
        .getAll(IDBKeyRange.only(profileId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Missing or broken history should not crash the lesson screen.
    return [];
  }
}

// Unsynced = synced flag missing or false. Filtered in JS to keep the query simple.
export async function getUnsyncedAttempts() {
  try {
    const db = await openDB();
    const all = await new Promise((resolve, reject) => {
      const req = db.transaction('attempts', 'readonly').objectStore('attempts').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return all.filter((r) => r.synced !== true);
  } catch {
    return [];
  }
}

// One readwrite transaction so either all accepted rows are marked or none are.
export async function markSynced(uuids) {
  if (!uuids || uuids.length === 0) return;
  const db = await openDB();
  const wanted = new Set(uuids);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attempts', 'readwrite');
    const store = tx.objectStore('attempts');
    const req = store.getAll();
    req.onsuccess = () => {
      for (const record of req.result) {
        if (wanted.has(record.uuid)) {
          record.synced = true;
          store.put(record);
        }
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Records that a learner opened a lesson. Never throws: progress tracking must not block lessons.
export async function markLessonViewed(profileId, lessonId) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('lessonViews', 'readwrite');
      tx.objectStore('lessonViews').put({
        key: profileId + ':' + lessonId,
        profileId,
        lessonId,
        viewedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Swallowed on purpose; a failed view record is not worth an error screen.
  }
}

// Returns the saved language ('te' or 'en') for one profile, or null if none. Never throws.
export async function getLang(profileId) {
  try {
    const db = await openDB();
    const row = await new Promise((resolve, reject) => {
      const req = db.transaction('prefs', 'readonly').objectStore('prefs').get('lang:' + profileId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return row ? row.lang : null;
  } catch {
    return null;
  }
}

// Saves the language for one profile. Never throws, so a failed save never blocks the UI.
export async function setLang(profileId, lang) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('prefs', 'readwrite');
      tx.objectStore('prefs').put({ key: 'lang:' + profileId, lang });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Swallowed on purpose; the language still works for this session.
  }
}

// Last language picked anywhere, used on the profile screen before a profile is chosen.
export async function getLastLang() {
  try {
    const db = await openDB();
    const row = await new Promise((resolve, reject) => {
      const req = db.transaction('prefs', 'readonly').objectStore('prefs').get('__last__');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return row ? row.lang : 'te';
  } catch {
    return 'te';
  }
}

// Saves the last language picked. Never throws.
export async function setLastLang(lang) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('prefs', 'readwrite');
      tx.objectStore('prefs').put({ key: '__last__', lang });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Swallowed on purpose; the default language is used next time.
  }
}

// Returns all lesson view records for one profile. Filtered in JS, like getUnsyncedAttempts.
export async function getLessonViews(profileId) {
  try {
    const db = await openDB();
    const all = await new Promise((resolve, reject) => {
      const req = db.transaction('lessonViews', 'readonly').objectStore('lessonViews').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return all.filter((r) => r.profileId === profileId);
  } catch {
    return [];
  }
}
