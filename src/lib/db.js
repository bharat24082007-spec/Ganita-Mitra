const DB_NAME = 'ganita-mitra';
const DB_VERSION = 1;

// Cached so every caller shares one connection instead of reopening the DB.
let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        // The profileId index lets us load one profile's history without scanning all rows.
        const store = req.result.createObjectStore('attempts', { keyPath: 'id', autoIncrement: true });
        store.createIndex('profileId', 'profileId');
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
    const req = tx.objectStore('attempts').add({ ...attempt, timestamp: new Date().toISOString() });
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
