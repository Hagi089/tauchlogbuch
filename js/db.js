/*
 * db.js — IndexedDB-Speicherschicht für das Tauchlogbuch.
 * Kapselt alle Datenbankzugriffe. Kein Framework, reine IndexedDB-API.
 */

const DB_NAME = "tauchlogbuch-db";
const DB_VERSION = 1;
const STORE_DIVES = "dives";
const STORE_META = "meta";

let dbInstance = null;
let dbOpenPromise = null;

function openDatabase() {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbOpenPromise) return dbOpenPromise;

  dbOpenPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    // Migrations-Gerüst: pro Versionssprung ein eigener if-Block, damit
    // künftige Schema-Änderungen (z. B. neue Felder/Indizes) bestehende
    // Nutzerdaten nicht gefährden. Aktuell gibt es nur Version 1.
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE_DIVES, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("tgNumber", "tgNumber", { unique: false });
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
      // Beispiel für eine künftige Erweiterung:
      // if (oldVersion < 2) { ... zusätzliche Felder/Indizes migrieren ... }
    };

    req.onsuccess = (event) => {
      dbInstance = event.target.result;
      // Falls die Verbindung von außen geschlossen wird (z. B. weil in einem
      // anderen Tab ein Schema-Upgrade läuft) oder ungültig wird, merken wir
      // uns das NICHT als weiterhin gültige Instanz — beim nächsten Zugriff
      // wird die Verbindung dann automatisch neu aufgebaut, statt dass die
      // App in einem eingefrorenen Zustand hängen bleibt.
      dbInstance.onclose = () => { dbInstance = null; dbOpenPromise = null; };
      // Fehler, die bis zur Verbindung durchblubbern: nächste Nutzung öffnet neu.
      dbInstance.onerror = () => { /* einzelne Request-Fehler behandeln die Aufrufer */ };
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
        dbOpenPromise = null;
      };
      resolve(dbInstance);
    };
    req.onerror = () => { dbOpenPromise = null; reject(req.error); };
    req.onblocked = () => { dbOpenPromise = null; reject(new Error("Datenbank ist durch einen anderen Tab blockiert.")); };
  });

  return dbOpenPromise;
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

function assertValidDive(dive, label) {
  if (!dive || typeof dive !== "object" || typeof dive.id !== "string" || !dive.id) {
    throw new Error(`${label}: keine gültige id vorhanden.`);
  }
  const check = window.DiveValidation.validateDive(dive);
  if (!check.valid) throw new Error(`${label}: ${check.errors.join(", ")}`);
}

// Fasst Transaktion + Einzel-Requests zusammen: jeder Fehler (auch eines
// einzelnen put()-Requests) bricht die gesamte Transaktion ab und lehnt ab.
function runWriteTransaction(db, storeNames, work) {
  return new Promise((resolve, reject) => {
    let failure = null;
    const tx = db.transaction(storeNames, "readwrite");
    const fail = (err) => { if (!failure) failure = err; };
    work(tx, (req) => { req.onerror = () => fail(req.error); });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(failure || tx.error);
    tx.onabort = () => reject(failure || tx.error || new Error("Transaktion abgebrochen."));
  });
}

async function putDive(dive) {
  assertValidDive(dive, "Ungültiger Tauchgang");
  const db = await openDatabase();
  await runWriteTransaction(db, STORE_DIVES, (tx, track) => {
    track(tx.objectStore(STORE_DIVES).put(dive));
  });
  return dive;
}

// Schreibt viele Tauchgänge ALLES-ODER-NICHTS: zuerst wird jeder Datensatz
// geprüft; ist einer ungültig, wird nichts geschrieben.
async function putDivesBulk(dives) {
  if (!Array.isArray(dives)) throw new Error("Ungültige Daten: Liste erwartet.");
  if (!dives.length) return;
  dives.forEach((d, i) => assertValidDive(d, `Datensatz ${i + 1}`));
  const db = await openDatabase();
  await runWriteTransaction(db, STORE_DIVES, (tx, track) => {
    const store = tx.objectStore(STORE_DIVES);
    dives.forEach((d) => track(store.put(d)));
  });
}

// Ersetzt den gesamten Bestand atomar (für Backup-Restore): alle Tauchgänge
// werden vorab validiert, dann in EINER Transaktion gelöscht und neu
// geschrieben. Schlägt irgendetwas fehl, bleibt der alte Bestand unverändert.
async function replaceAllDives(dives, metaEntries) {
  if (!Array.isArray(dives)) throw new Error("Ungültige Daten: Liste erwartet.");
  const ids = new Set();
  dives.forEach((d, i) => {
    assertValidDive(d, `Datensatz ${i + 1}`);
    if (ids.has(d.id)) throw new Error(`Datensatz ${i + 1}: id doppelt (${d.id}).`);
    ids.add(d.id);
  });
  const db = await openDatabase();
  await runWriteTransaction(db, [STORE_DIVES, STORE_META], (tx, track) => {
    const store = tx.objectStore(STORE_DIVES);
    store.clear();
    dives.forEach((d) => track(store.put(d)));
    const meta = tx.objectStore(STORE_META);
    Object.entries(metaEntries || {}).forEach(([key, value]) => track(meta.put({ key, value })));
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
  replaceAllDives,
  deleteDive,
  clearAllDives,
  getMeta,
  setMeta,
  generateId,
  DB_VERSION,
};
