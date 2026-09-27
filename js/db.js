/*
 * db.js — IndexedDB-Speicherschicht für das Tauchlogbuch.
 * Kapselt alle Datenbankzugriffe. Kein Framework, reine IndexedDB-API.
 */

const DB_NAME = "tauchlogbuch-db";
const DB_VERSION = 1;
const STORE_DIVES = "dives";
const STORE_META = "meta";

let dbInstance = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_DIVES)) {
        const store = db.createObjectStore(STORE_DIVES, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("tgNumber", "tgNumber", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    req.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getMeta(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => reject(req.error);
  });
}

async function setMeta(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllDives() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIVES, "readonly");
    const req = tx.objectStore(STORE_DIVES).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getDive(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIVES, "readonly");
    const req = tx.objectStore(STORE_DIVES).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putDive(dive) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIVES, "readwrite");
    tx.objectStore(STORE_DIVES).put(dive);
    tx.oncomplete = () => resolve(dive);
    tx.onerror = () => reject(tx.error);
  });
}

async function putDivesBulk(dives) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIVES, "readwrite");
    const store = tx.objectStore(STORE_DIVES);
    dives.forEach((d) => store.put(d));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteDive(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIVES, "readwrite");
    tx.objectStore(STORE_DIVES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAllDives() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIVES, "readwrite");
    tx.objectStore(STORE_DIVES).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function generateId() {
  return "dive-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

window.DiveDB = {
  getAllDives,
  getDive,
  putDive,
  putDivesBulk,
  deleteDive,
  clearAllDives,
  getMeta,
  setMeta,
  generateId,
};
