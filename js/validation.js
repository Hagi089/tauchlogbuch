/*
 * validation.js — zentrale Datenvalidierung für das Tauchlogbuch.
 * Wird von ALLEN Eingabewegen genutzt (Formular, Sprache, Excel-Import,
 * Copy/Paste-Import, Backup-Restore) sowie von der Speicherschicht (db.js),
 * damit kein ungültiger Datensatz in IndexedDB landen kann.
 */
(function () {
  const MAX_PLAUSIBLE_DEPTH = 150;    // m — darüber nur Warnung, kein Fehler
  const MAX_PLAUSIBLE_DURATION = 300; // min — darüber nur Warnung, kein Fehler

  // Echtes Kalenderdatum im Format YYYY-MM-DD (lehnt "2026-99-99" und "2026-02-30" ab).
  function isValidISODate(dateStr) {
    if (typeof dateStr !== "string") return false;
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (year < 1900 || month < 1 || month > 12) return false;
    return day >= 1 && day <= new Date(year, month, 0).getDate();
  }

  function localTodayISO() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  }

  function hasTg(d) {
    return d.tgNumber !== null && d.tgNumber !== undefined && d.tgNumber !== "";
  }

  function isNonNegativeNumber(v) {
    return typeof v === "number" && Number.isFinite(v) && v >= 0;
  }

  // Liefert { valid, errors, warnings }. Fehler verhindern das Speichern,
  // Warnungen sind nur Hinweise (z. B. auffällige Werte).
  function validateDive(dive) {
    const errors = [];
    const warnings = [];
    if (!dive || typeof dive !== "object") {
      return { valid: false, errors: ["Kein gültiger Datensatz"], warnings };
    }
    if (!isValidISODate(dive.date)) errors.push("Ungültiges Datum");
    if (!isNonNegativeNumber(dive.depth)) errors.push("Tiefe fehlt oder ist ungültig (Zahl ≥ 0)");
    if (!isNonNegativeNumber(dive.duration)) errors.push("Dauer fehlt oder ist ungültig (Zahl ≥ 0)");
    if (typeof dive.country !== "string" || !dive.country.trim()) errors.push("Land fehlt");
    if (typeof dive.location !== "string" || !dive.location.trim()) errors.push("Ort fehlt");

    if (hasTg(dive) && !(Number.isInteger(Number(dive.tgNumber)) && Number(dive.tgNumber) > 0)) {
      warnings.push("TG-Nummer ist ungültig");
    }
    // Tauchplatz ist optional (in der Original-Excel gibt es Tauchgänge ohne Tauchplatz).
    if (typeof dive.site !== "string" || !dive.site.trim()) warnings.push("Tauchplatz fehlt");
    if (isNonNegativeNumber(dive.depth) && dive.depth > MAX_PLAUSIBLE_DEPTH) warnings.push(`Tiefe über ${MAX_PLAUSIBLE_DEPTH} m – bitte prüfen`);
    if (isNonNegativeNumber(dive.duration) && dive.duration > MAX_PLAUSIBLE_DURATION) warnings.push(`Dauer über ${MAX_PLAUSIBLE_DURATION} min – bitte prüfen`);
    if (isValidISODate(dive.date) && dive.date > localTodayISO()) warnings.push("Datum liegt in der Zukunft");
    return { valid: errors.length === 0, errors, warnings };
  }

  // Schlüssel zur Duplikaterkennung: bevorzugt TG-Nummer, sonst Datum+Tiefe+Dauer+Tauchplatz.
  function diveDuplicateKey(d) {
    if (hasTg(d) && Number.isFinite(Number(d.tgNumber))) return `tg:${Number(d.tgNumber)}`;
    return `key:${d.date}|${d.depth}|${d.duration}|${d.site}`;
  }

  window.DiveValidation = { isValidISODate, validateDive, diveDuplicateKey, hasTg };
})();
