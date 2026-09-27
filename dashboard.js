/*
 * dashboard.js — berechnet KPIs und Diagrammdaten aus den gespeicherten
 * Tauchgängen. Bildet die Kennzahlen der ursprünglichen Excel-Datei
 * (Blatt "Dashboard") formelgetreu nach:
 *   Anzahl Tauchgänge      = COUNT(Datum)
 *   Anzahl Tauchtage       = Anzahl eindeutiger Datumswerte
 *   Ø TG pro Tauchtag      = Anzahl Tauchgänge / Anzahl Tauchtage
 *   Letzter TG             = MAX(Datum)
 *   Tiefster TG            = MAX(Tiefe)
 *   Tauchzeit (min/h/Tage) = SUM(Dauer) und Umrechnungen
 *   Ø Tauchzeit pro TG     = SUM(Dauer) / Anzahl Tauchgänge
 *   Längster TG            = MAX(Dauer)
 * "Anzahl TG pro Tag" wird bewusst nicht gespeichert, sondern hier live
 * aus der Anzahl der Einträge je Datum berechnet (siehe Analyse-Notizen).
 */

function computeStats(dives) {
  const total = dives.length;
  if (total === 0) {
    return {
      total: 0, diveDays: 0, avgPerDay: 0, lastDate: null, maxDepth: 0,
      totalMinutes: 0, totalHours: 0, totalDaysUnderwater: 0,
      avgDuration: 0, maxDuration: 0,
    };
  }
  const uniqueDates = new Set(dives.map((d) => d.date));
  const totalMinutes = dives.reduce((s, d) => s + (Number(d.duration) || 0), 0);
  const maxDepth = Math.max(...dives.map((d) => Number(d.depth) || 0));
  const maxDuration = Math.max(...dives.map((d) => Number(d.duration) || 0));
  const lastDate = dives.reduce((max, d) => (d.date > max ? d.date : max), dives[0].date);

  return {
    total,
    diveDays: uniqueDates.size,
    avgPerDay: total / uniqueDates.size,
    lastDate,
    maxDepth,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    totalDaysUnderwater: Math.round((totalMinutes / 60 / 24) * 100) / 100,
    avgDuration: Math.round((totalMinutes / total) * 100) / 100,
    maxDuration,
  };
}

// Tiefen-Buckets exakt wie im Original (Blatt "Cluster"):
// <20m / 20-<30m / 30-<40m / >=40m
function computeDepthBuckets(dives) {
  const buckets = [
    { label: "< 20 m", min: -Infinity, max: 20, count: 0 },
    { label: "20–30 m", min: 20, max: 30, count: 0 },
    { label: "30–40 m", min: 30, max: 40, count: 0 },
    { label: "≥ 40 m", min: 40, max: Infinity, count: 0 },
  ];
  dives.forEach((d) => {
    const depth = Number(d.depth);
    const b = buckets.find((b) => depth >= b.min && depth < b.max);
    if (b) b.count++;
  });
  return buckets;
}

// Dauer-Buckets exakt wie im Original:
// <30min / 30-<45min / 45-<60min / >=60min
function computeDurationBuckets(dives) {
  const buckets = [
    { label: "< 30 min", min: -Infinity, max: 30, count: 0 },
    { label: "30–45 min", min: 30, max: 45, count: 0 },
    { label: "45–60 min", min: 45, max: 60, count: 0 },
    { label: "≥ 60 min", min: 60, max: Infinity, count: 0 },
  ];
  dives.forEach((d) => {
    const dur = Number(d.duration);
    const b = buckets.find((b) => dur >= b.min && dur < b.max);
    if (b) b.count++;
  });
  return buckets;
}

function computeCountryCounts(dives) {
  const map = new Map();
  dives.forEach((d) => {
    const key = d.country || "Unbekannt";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

// Jahres-Verlauf: über den vollständigen, aktuellen Datenbestand berechnet
// (im Original brach dieses Diagramm bei nachträglich ergänzten Zeilen ab —
// hier wird es immer über alle vorhandenen Tauchgänge aktualisiert).
function computeYearCounts(dives) {
  const map = new Map();
  dives.forEach((d) => {
    const year = (d.date || "").slice(0, 4);
    if (!year) return;
    map.set(year, (map.get(year) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));
}

function computeTopSites(dives, limit = 5) {
  const map = new Map();
  dives.forEach((d) => {
    const key = d.site || "Unbekannt";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Wie viele Tauchgänge gab es am selben Datum wie dieser Tauchgang?
// Ersetzt die frühere manuelle Spalte "Anzahl TG".
function divesOnSameDay(dive, allDives) {
  return allDives.filter((d) => d.date === dive.date).length;
}

window.Dashboard = {
  computeStats,
  computeDepthBuckets,
  computeDurationBuckets,
  computeCountryCounts,
  computeYearCounts,
  computeTopSites,
  divesOnSameDay,
};
