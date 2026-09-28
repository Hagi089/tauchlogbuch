/*
 * app.js — UI-Logik der Tauchlogbuch-App.
 * Reines Vanilla JavaScript (kein Framework), da die Anwendung klein und
 * wartungsarm bleiben soll (siehe Anforderung "vermeide unnötige Frameworks").
 */

const state = {
  view: "dashboard", // dashboard | list | form | new-menu | excel-import | voice | data | restore | check
  dives: [],
  editingId: null,
  search: "",
  countryFilter: "",
  prefill: null,        // vorausgefüllte Werte nach Spracheingabe
  prefillUnsure: [],     // Feldnamen, die bei der Spracherkennung unsicher blieben
  importPreview: null,   // { newRows, dupRows, errors, total }
  voiceStep: 0,           // aktueller Schritt der schrittweisen Sprachabfrage
  voiceAnswers: {},       // bisher per Sprache erfasste Werte
  voiceUnsure: [],        // Feldnamen, die per Sprache nicht sicher erkannt wurden
  backupPreview: null,    // { parsed, mode } während einer Wiederherstellung
  lastBackupAt: null,     // ISO-Zeitstempel des letzten Backups
  reminderSnoozedUntil: null,
};

const els = {
  app: document.getElementById("app"),
  main: document.getElementById("main"),
  title: document.getElementById("view-title"),
  themeBtn: document.getElementById("theme-toggle"),
};

// ---------- Utilities ----------

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function toISODate(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// Die TG-Nummer wird nie manuell erfasst, sondern immer automatisch aus der
// aktuellen Anzahl gespeicherter Tauchgänge berechnet (Anzahl + 1) und nur
// read-only angezeigt.
function nextTgNumber() {
  return state.dives.length + 1;
}

// Validierung/Duplikat-Schlüssel liegen zentral in js/validation.js und werden
// von allen Eingabewegen UND der Speicherschicht (db.js) gemeinsam genutzt.
const { isValidISODate, validateDive, diveDuplicateKey } = window.DiveValidation;

// ---------- Theme ----------

function safeGetLocalStorage(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeSetLocalStorage(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* z. B. Privacy-Modus: einfach nicht persistieren */ }
}

function initTheme() {
  const saved = safeGetLocalStorage("theme");
  if (saved === "dark" || saved === "light") {
    document.documentElement.setAttribute("data-theme", saved);
  }
  updateThemeIcon();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme")
    || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  safeSetLocalStorage("theme", next);
  updateThemeIcon();
}

function updateThemeIcon() {
  const current = document.documentElement.getAttribute("data-theme")
    || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  els.themeBtn.textContent = current === "dark" ? "☀️" : "🌙";
}

// ---------- Data loading & first-run seed ----------

// Erhöhen, wenn data/seed-data.json künftig erweitert wird (z. B. mehr
// Tauchgänge). Das Nachladen ist rein additiv: bereits vorhandene
// Tauchgänge (gleiche id) werden NIE überschrieben, auch wenn der Nutzer
// sie inzwischen bearbeitet hat — es werden nur fehlende id's ergänzt.
const CURRENT_SEED_VERSION = 1;

async function loadDives() {
  state.dives = await window.DiveDB.getAllDives();
}

async function maybeSeedInitialData() {
  const seedVersion = await window.DiveDB.getMeta("seedVersion");
  if (typeof seedVersion === "number" && seedVersion >= CURRENT_SEED_VERSION) return;
  try {
    const res = await fetch("data/seed-data.json");
    const seedDives = await res.json();
    const existingIds = new Set((await window.DiveDB.getAllDives()).map((d) => d.id));
    const missing = seedDives.filter((d) => !existingIds.has(d.id));
    if (missing.length) {
      await window.DiveDB.putDivesBulk(missing);
      toast(`${missing.length} Tauchgänge aus deiner Excel-Datei importiert`);
    }
    await window.DiveDB.setMeta("seedVersion", CURRENT_SEED_VERSION);
  } catch (e) {
    // Kein Blocker: App funktioniert auch ohne Seed-Daten (leerer Start).
    await window.DiveDB.setMeta("seedVersion", CURRENT_SEED_VERSION);
  }
}

// ---------- Navigation ----------

function goTo(view) {
  state.view = view;
  state.editingId = null;
  if (view === "voice") {
    state.voiceStep = 0;
    state.voiceAnswers = {};
    state.voiceUnsure = [];
  }
  render();
  window.scrollTo(0, 0);
}

function openDiveForm(id) {
  state.view = "form";
  state.editingId = id || null;
  render();
  window.scrollTo(0, 0);
}

function activeTabFor(view, editingId) {
  if (view === "form") return editingId ? "list" : "new";
  if (view === "new-menu" || view === "excel-import" || view === "voice") return "new";
  if (view === "data" || view === "restore" || view === "check") return "data";
  return view;
}

// ---------- Rendering: shell ----------

function render() {
  const activeTab = activeTabFor(state.view, state.editingId);
  document.querySelectorAll("nav.bottom-nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === activeTab);
  });

  const titles = {
    dashboard: "Dashboard",
    list: "Tauchgänge",
    form: state.editingId ? "Tauchgang bearbeiten" : "Neuer Tauchgang",
    "new-menu": "Neuer Tauchgang",
    "excel-import": "Excel-Import",
    voice: "Per Sprache eingeben",
    data: "Daten",
    restore: "Backup wiederherstellen",
    check: "Daten prüfen",
  };
  els.title.textContent = titles[state.view] || "Tauchlogbuch";

  if (state.view === "dashboard") renderDashboard();
  else if (state.view === "list") renderList();
  else if (state.view === "form") renderForm();
  else if (state.view === "new-menu") renderNewMenu();
  else if (state.view === "excel-import") renderExcelImport();
  else if (state.view === "voice") renderVoice();
  else if (state.view === "data") renderData();
  else if (state.view === "restore") renderRestore();
  else if (state.view === "check") renderCheck();
}

// ---------- Dashboard ----------

function renderDashboard() {
  const dives = state.dives;
  if (dives.length === 0) {
    els.main.innerHTML = `<div class="empty-state">
      <p>Noch keine Tauchgänge erfasst.</p>
      <p>Leg über „Neu" deinen ersten Tauchgang an.</p>
    </div>`;
    return;
  }

  const s = window.Dashboard.computeStats(dives);
  const depthBuckets = window.Dashboard.computeDepthBuckets(dives);
  const durationBuckets = window.Dashboard.computeDurationBuckets(dives);
  const countries = window.Dashboard.computeCountryCounts(dives);
  const years = window.Dashboard.computeYearCounts(dives);
  const topSites = window.Dashboard.computeTopSites(dives, 5);

  const barList = (items, maxItems) => {
    const shown = maxItems ? items.slice(0, maxItems) : items;
    const max = Math.max(...shown.map((i) => i.count), 1);
    return shown.map((i) => `
      <div class="bar-row" role="img" aria-label="${escapeHtml(i.label)}: ${i.count}">
        <div class="bar-label">${escapeHtml(i.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(i.count / max) * 100}%"></div></div>
        <div class="bar-count">${i.count}</div>
      </div>`).join("");
  };

  els.main.innerHTML = `
    ${dashboardBannersHtml()}
    <div class="kpi-grid">
      <div class="kpi"><div class="value">${s.total}</div><div class="label">Tauchgänge</div></div>
      <div class="kpi"><div class="value">${s.diveDays}</div><div class="label">Tauchtage</div></div>
      <div class="kpi"><div class="value">${s.avgPerDay.toFixed(2)}</div><div class="label">Ø TG / Tauchtag</div></div>
      <div class="kpi"><div class="value">${formatDate(s.lastDate)}</div><div class="label">Letzter TG</div></div>
      <div class="kpi"><div class="value">${s.maxDepth} m</div><div class="label">Tiefster TG</div></div>
      <div class="kpi"><div class="value">${s.maxDuration} min</div><div class="label">Längster TG</div></div>
      <div class="kpi"><div class="value">${s.totalHours} h</div><div class="label">Tauchzeit gesamt</div></div>
      <div class="kpi"><div class="value">${s.avgDuration} min</div><div class="label">Ø Tauchzeit / TG</div></div>
    </div>

    <div class="card">
      <div class="section-title">Verteilung nach Tiefe</div>
      ${barList(depthBuckets)}
    </div>

    <div class="card">
      <div class="section-title">Verteilung nach Tauchzeit</div>
      ${barList(durationBuckets)}
    </div>

    <div class="card">
      <div class="section-title">Top 5 Tauchplätze</div>
      ${barList(topSites)}
    </div>

    <div class="card">
      <div class="section-title">Nach Ländern</div>
      ${barList(countries)}
    </div>

    <div class="card">
      <div class="section-title">Tauchgänge pro Jahr</div>
      ${barList(years)}
    </div>
  `;
  wireDashboardBanners();
}

// ---------- List ----------

function renderList() {
  let dives = [...state.dives].sort((a, b) => {
    const byDate = (b.date || "").localeCompare(a.date || "");
    if (byDate !== 0) return byDate;
    return (b.tgNumber || 0) - (a.tgNumber || 0);
  });

  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    dives = dives.filter((d) =>
      (d.site || "").toLowerCase().includes(q) ||
      (d.location || "").toLowerCase().includes(q) ||
      (d.country || "").toLowerCase().includes(q));
  }
  if (state.countryFilter) {
    dives = dives.filter((d) => d.country === state.countryFilter);
  }

  const allCountries = [...new Set(state.dives.map((d) => d.country).filter(Boolean))].sort();

  const listHtml = dives.length ? dives.map((d) => {
    return `
    <div class="dive-list-item" data-id="${escapeHtml(d.id)}">
      <div class="main">
        <div class="site">${escapeHtml(d.site || "Ohne Tauchplatz")}</div>
        <div class="meta">${formatDate(d.date)} · ${escapeHtml(d.location || "")}, ${escapeHtml(d.country || "")}</div>
      </div>
      <div class="stats">
        <div class="depth">${d.depth ?? "–"} m</div>
        <div>${d.duration ?? "–"} min</div>
      </div>
    </div>`;
  }).join("") : `<div class="empty-state">Keine Tauchgänge gefunden.</div>`;

  els.main.innerHTML = `
    <div class="toolbar-row">
      <input type="search" id="search-input" placeholder="Suche nach Tauchplatz, Ort, Land…" value="${escapeHtml(state.search)}">
      <select id="country-filter">
        <option value="">Alle Länder</option>
        ${allCountries.map((c) => `<option value="${escapeHtml(c)}" ${c === state.countryFilter ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
      </select>
    </div>
    ${state.dives.length ? `
    <div class="actions-row">
      <button type="button" id="delete-all-btn" class="btn btn-danger">🗑️ Alle löschen</button>
    </div>` : ""}
    <div>${listHtml}</div>
  `;

  document.getElementById("search-input").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderList();
  });
  document.getElementById("country-filter").addEventListener("change", (e) => {
    state.countryFilter = e.target.value;
    renderList();
  });
  els.main.querySelectorAll(".dive-list-item").forEach((el) => {
    el.addEventListener("click", () => openDiveForm(el.dataset.id));
  });

  const deleteAllBtn = document.getElementById("delete-all-btn");
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener("click", async () => {
      const count = state.dives.length;
      if (confirm(`Wirklich ALLE ${count} Tauchgänge unwiderruflich löschen? Das kann nicht rückgängig gemacht werden. Tipp: Erstelle vorher unter „Daten" ein Backup.`)) {
        try {
          await window.DiveDB.clearAllDives();
          await window.DiveDB.setMeta("seedVersion", CURRENT_SEED_VERSION); // verhindert erneutes Nachladen der Startdaten
          await loadDives();
          toast("Alle Tauchgänge wurden gelöscht");
          renderList();
        } catch (err) {
          toast("Die Tauchgänge konnten nicht gelöscht werden.");
        }
      }
    });
  }
}

// ---------- Excel-Export ----------

function exportToExcel() {
  if (typeof XLSX === "undefined") {
    toast("Die Excel-Bibliothek ist nicht geladen. Bitte Internetverbindung prüfen und erneut versuchen.");
    return;
  }
  const rows = [["TG", "Datum", "Tiefe", "Dauer", "Land", "Ort", "Tauchplatz"]];
  const sorted = [...state.dives].sort((a, b) => {
    if (a.date !== b.date) return (a.date || "").localeCompare(b.date || "");
    return (a.tgNumber || 0) - (b.tgNumber || 0);
  });
  sorted.forEach((d) => {
    rows.push([
      d.tgNumber ?? "",
      formatDate(d.date),
      d.depth,
      d.duration,
      d.country,
      d.location,
      d.site,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daten");
  const filename = `Tauchlogbuch-Export-${toISODate(new Date())}.xlsx`;
  try {
    XLSX.writeFile(wb, filename);
    toast(`${sorted.length} Tauchgänge exportiert`);
  } catch (err) {
    toast("Der Export ist fehlgeschlagen.");
  }
}

// ---------- Neu: Auswahlmenü ----------

function renderNewMenu() {
  els.main.innerHTML = `
    <div class="card option-card" id="opt-manual">
      <div class="section-title">✏️ Manuell eingeben</div>
      <p style="color:var(--text-muted);font-size:13px;margin:0">Tauchgang über ein Formular erfassen.</p>
    </div>
    <div class="card option-card" id="opt-excel">
      <div class="section-title">📄 Excel-Import</div>
      <p style="color:var(--text-muted);font-size:13px;margin:0">Mehrere Tauchgänge aus einer Excel-Datei übernehmen – oder Zeilen aus Excel einfügen (Copy &amp; Paste).</p>
    </div>
    <div class="card option-card" id="opt-voice">
      <div class="section-title">🎙️ Per Sprache eingeben</div>
      <p style="color:var(--text-muted);font-size:13px;margin:0">Tauchgang diktieren, danach prüfen und speichern.</p>
    </div>
  `;
  document.getElementById("opt-manual").addEventListener("click", () => openDiveForm(null));
  document.getElementById("opt-excel").addEventListener("click", () => goTo("excel-import"));
  document.getElementById("opt-voice").addEventListener("click", () => goTo("voice"));
}

// ---------- Excel-Import ----------

function parseDateCell(v) {
  let result = null;
  if (v instanceof Date && !isNaN(v)) result = toISODate(v);
  else if (typeof v === "number" && typeof XLSX !== "undefined" && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) result = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  } else if (typeof v === "string") {
    const s = v.trim();
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) result = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    else if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/))) {
      const yy = parseInt(m[3], 10);
      result = `${yy <= 69 ? 2000 + yy : 1900 + yy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    } else {
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) result = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    }
  }
  return isValidISODate(result) ? result : null;
}

function parseNumberCell(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.trim().replace(",", "."));
    return isNaN(n) ? null : n;
  }
  return null;
}

function renderExcelImport() {
  els.main.innerHTML = `
    <div class="card">
      <div class="section-title">Excel-Datei importieren</div>
      <p style="color:var(--text-muted);font-size:13px;margin-top:0">
        Erwartete Spalten in der Kopfzeile: <b>Datum, Tiefe, Dauer, Land, Ort, Tauchplatz</b>
        (optional: TG).
      </p>
      <input type="file" id="excel-file-input" accept=".xlsx,.xls">
    </div>

    <div class="card">
      <div class="section-title">Oder: Zeilen aus Excel einfügen</div>
      <p style="color:var(--text-muted);font-size:13px;margin-top:0">
        In Excel die Zeilen markieren, kopieren und hier einfügen — mit oder ohne Kopfzeile.
        Ohne Kopfzeile gilt die Spaltenreihenfolge deines Logbuchs
        (TG, Datum, Tiefe, Dauer, Land, Ort, Tauchplatz — eine ggf. vorhandene
        vierte Spalte mit der Tauchgangsanzahl pro Tag wird automatisch erkannt
        und übersprungen), alternativ ohne TG-Spalte.
        Dieser Weg funktioniert auch offline.
      </p>
      <textarea id="paste-input" class="paste-area" rows="6" spellcheck="false"
        placeholder="Hier einfügen (lange tippen → Einfügen) …" aria-label="Aus Excel kopierte Zeilen"></textarea>
      <div class="btn-stack">
        <button type="button" id="paste-clipboard" class="btn btn-secondary">📋 Aus Zwischenablage lesen</button>
        <button type="button" id="paste-preview" class="btn btn-primary">Vorschau erstellen</button>
      </div>
    </div>

    <div id="import-preview-area"></div>
    <button type="button" id="excel-cancel" class="btn btn-secondary">Abbrechen</button>
  `;
  document.getElementById("excel-cancel").addEventListener("click", () => goTo("list"));
  document.getElementById("excel-file-input").addEventListener("change", handleExcelFile);

  const area = document.getElementById("paste-input");
  document.getElementById("paste-preview").addEventListener("click", () => handlePasteImport(area.value));
  area.addEventListener("paste", () => setTimeout(() => handlePasteImport(area.value), 0));
  document.getElementById("paste-clipboard").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      area.value = text;
      handlePasteImport(text);
    } catch (err) {
      toast("Zwischenablage nicht lesbar – bitte manuell in das Feld einfügen.");
    }
  });
}

// TG-Nummer streng prüfen: nur positive ganze Zahlen ("12abc" ist ungültig, kein NaN).
function parseTgCell(raw) {
  if (raw === null || raw === undefined || raw === "") return { value: null, invalid: false };
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 ? { value: raw, invalid: false } : { value: null, invalid: true };
  }
  const s = String(raw).trim();
  if (s === "") return { value: null, invalid: false };
  if (/^\d+$/.test(s) && parseInt(s, 10) > 0) return { value: parseInt(s, 10), invalid: false };
  return { value: null, invalid: true };
}

// Tabellentext (aus der Zwischenablage) in Zeilen/Zellen zerlegen; unterstützt
// Anführungszeichen (Excel setzt Zellen mit Zeilenumbruch/Tab in "…").
function parseDelimited(text, delim) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"' && cell === "") inQuotes = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((v) => { const t = v.trim(); return t === "" ? null : t; }));
}

const POSITIONAL_LAYOUTS = {
  8: ["tg", "date", null, "depth", "duration", "country", "location", "site"],
  7: ["tg", "date", "depth", "duration", "country", "location", "site"],
  6: ["date", "depth", "duration", "country", "location", "site"],
};
const IMPORT_FIELD_LABELS = { date: "Datum", depth: "Tiefe", duration: "Dauer", country: "Land", location: "Ort", site: "Tauchplatz" };

// Gemeinsame Aufbereitung für Excel-Datei UND Copy/Paste: erkennt eine
// Kopfzeile (Spaltennamen) oder wendet die Spaltenreihenfolge des Logbuchs an,
// prüft jede Zeile mit validateDive() und liefert gültige Kandidaten + Fehler.
function prepareImportRows(rows) {
  const isEmptyRow = (row) => !row || row.every((v) => v === null || v === undefined || v === "");
  const firstIdx = rows.findIndex((r) => !isEmptyRow(r));
  if (firstIdx === -1) return { ok: false, message: "Keine Daten gefunden." };

  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const hasHeader = rows[firstIdx].some((h) => norm(h) === "datum");
  const idx = { tg: -1, date: -1, depth: -1, duration: -1, country: -1, location: -1, site: -1 };
  let start;

  if (hasHeader) {
    const headers = rows[firstIdx];
    const col = (name) => headers.findIndex((h) => norm(h) === name.toLowerCase());
    idx.tg = col("TG"); idx.date = col("Datum"); idx.depth = col("Tiefe"); idx.duration = col("Dauer");
    idx.country = col("Land"); idx.location = col("Ort"); idx.site = col("Tauchplatz");
    const missing = Object.keys(IMPORT_FIELD_LABELS).filter((k) => idx[k] === -1);
    if (missing.length) {
      return { ok: false, message: `Folgende Spalten wurden in der Kopfzeile nicht gefunden: ${missing.map((k) => IMPORT_FIELD_LABELS[k]).join(", ")}. Bitte prüfe die Spaltenüberschriften.` };
    }
    start = firstIdx + 1;
  } else {
    const dataRows = rows.filter((r) => !isEmptyRow(r));
    const rawWidth = Math.max(...dataRows.map((r) => r.length));
    const trimmedWidth = Math.max(...dataRows.map((r) => {
      let last = r.length - 1;
      while (last >= 0 && (r[last] === null || r[last] === undefined || r[last] === "")) last--;
      return last + 1;
    }));
    const layout = POSITIONAL_LAYOUTS[rawWidth] || POSITIONAL_LAYOUTS[trimmedWidth];
    if (!layout) {
      return { ok: false, message: `Ohne Kopfzeile erwarte ich 6, 7 oder 8 Spalten (siehe Hinweis oben), erkannt wurden ${trimmedWidth}. Tipp: Kopfzeile mitkopieren.` };
    }
    layout.forEach((key, i) => { if (key) idx[key] = i; });
    start = firstIdx;
  }

  const parsed = [];
  const errors = [];
  const warnings = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (isEmptyRow(row)) continue;
    const cell = (k) => (idx[k] >= 0 ? row[idx[k]] : null);
    const text = (k) => { const v = cell(k); return v === null || v === undefined ? "" : String(v).trim(); };
    const tg = parseTgCell(cell("tg"));
    const candidate = {
      tgNumber: tg.value,
      date: parseDateCell(cell("date")),
      depth: parseNumberCell(cell("depth")),
      duration: parseNumberCell(cell("duration")),
      country: text("country"),
      location: text("location"),
      site: text("site"),
    };
    const check = validateDive(candidate);
    const rowNo = r + 1;
    if (!check.valid) { errors.push({ row: rowNo, reasons: check.errors }); continue; }
    if (tg.invalid) warnings.push({ row: rowNo, text: `TG-Nummer „${cell("tg")}" ungültig – Tauchgang wird ohne TG-Nummer importiert` });
    check.warnings
      .filter((w) => w !== "Tauchplatz fehlt" && !w.startsWith("TG-Nummer"))
      .forEach((w) => warnings.push({ row: rowNo, text: w }));
    parsed.push(candidate);
  }
  return { ok: true, parsed, errors, warnings, total: parsed.length + errors.length };
}

function showImportMessage(message) {
  document.getElementById("import-preview-area").innerHTML =
    `<div class="card"><p style="color:var(--danger);margin:0">${escapeHtml(message)}</p></div>`;
}

// Duplikaterkennung + Vorschau für beide Importwege.
function applyImportRows(rows) {
  const prep = prepareImportRows(rows);
  if (!prep.ok) { state.importPreview = null; showImportMessage(prep.message); return; }

  const existingKeys = new Set(state.dives.map(diveDuplicateKey));
  const newRows = [];
  const dupRows = [];
  prep.parsed.forEach((p) => {
    const key = diveDuplicateKey(p);
    if (existingKeys.has(key)) dupRows.push(p);
    else { newRows.push(p); existingKeys.add(key); }
  });
  state.importPreview = { newRows, dupRows, errors: prep.errors, warnings: prep.warnings, total: prep.total };
  renderImportPreview();
}

async function handleExcelFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (typeof XLSX === "undefined") {
    toast("Die Excel-Bibliothek ist nicht geladen. Bitte Internetverbindung prüfen – oder Zeilen per Copy & Paste einfügen.");
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames.includes("Daten") ? "Daten" : wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
    applyImportRows(rows);
  } catch (err) {
    toast("Die Datei konnte nicht gelesen werden. Ist es eine gültige Excel-Datei?");
  }
}

function handlePasteImport(text) {
  if (!text || !text.trim()) { toast("Bitte zuerst Zeilen aus Excel einfügen."); return; }
  const delim = text.includes("\t") ? "\t" : (text.includes(";") ? ";" : "\t");
  applyImportRows(parseDelimited(text, delim));
}

function renderImportPreview() {
  const p = state.importPreview;
  const listLimit = 8;
  const errorLines = p.errors.slice(0, listLimit)
    .map((e) => `<li>Zeile ${e.row}: ${escapeHtml(e.reasons.join(", "))}</li>`).join("");
  const warnLines = p.warnings.slice(0, listLimit)
    .map((w) => `<li>Zeile ${w.row}: ${escapeHtml(w.text)}</li>`).join("");
  document.getElementById("import-preview-area").innerHTML = `
    <div class="card">
      <div class="section-title">Vorschau</div>
      <p>${p.total} Zeile(n) erkannt</p>
      <p>✅ ${p.newRows.length} neue Tauchgänge</p>
      <p>↔️ ${p.dupRows.length} bereits vorhanden (werden übersprungen)</p>
      ${p.errors.length ? `<p style="color:var(--danger)">❌ ${p.errors.length} fehlerhafte Zeile(n) — werden übersprungen</p>
        <ul class="issue-list">${errorLines}${p.errors.length > listLimit ? `<li>… und ${p.errors.length - listLimit} weitere</li>` : ""}</ul>` : ""}
      ${p.warnings.length ? `<p>⚠️ ${p.warnings.length} Hinweis(e)</p>
        <ul class="issue-list">${warnLines}${p.warnings.length > listLimit ? `<li>… und ${p.warnings.length - listLimit} weitere</li>` : ""}</ul>` : ""}
      <button type="button" id="confirm-import" class="btn btn-primary" ${p.newRows.length ? "" : "disabled"}>
        ${p.newRows.length} Tauchgänge importieren
      </button>
    </div>
  `;
  const btn = document.getElementById("confirm-import");
  if (btn) {
    btn.addEventListener("click", async () => {
      try {
        const withIds = p.newRows.map((r) => ({ id: window.DiveDB.generateId(), ...r }));
        await window.DiveDB.putDivesBulk(withIds);
        await loadDives();
        toast(`${withIds.length} Tauchgänge importiert`);
        state.importPreview = null;
        goTo("list");
      } catch (err) {
        toast("Der Import konnte nicht abgeschlossen werden – es wurde nichts gespeichert.");
      }
    });
  }
}

// ---------- Spracheingabe (schrittweise Abfrage) ----------
// Browser-Spracherkennung liefert i. d. R. Text OHNE Satzzeichen/Kommas
// zurück. Ein Freitext-Diktat mit anschließendem Komma-Parsing ist deshalb
// unzuverlässig. Stattdessen wird jedes Feld einzeln per kurzer, gezielter
// Sprachaufnahme erfasst — jede Aufnahme entspricht damit genau einem Feld.

const MONTHS_DE = {
  januar: 1, februar: 2, "märz": 3, maerz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

const VOICE_FIELDS = [
  { key: "date", label: "Datum", hint: 'Sag zum Beispiel: „26. September 2026"' },
  { key: "country", label: "Land", hint: 'Sag zum Beispiel: „Ägypten"' },
  { key: "location", label: "Ort", hint: 'Sag zum Beispiel: „Sharm El Sheikh"' },
  { key: "site", label: "Tauchplatz", hint: 'Sag zum Beispiel: „Far Garden"' },
  { key: "depth", label: "Tiefe in Metern", hint: 'Sag zum Beispiel: „24 Meter"' },
  { key: "duration", label: "Dauer in Minuten", hint: 'Sag zum Beispiel: „52 Minuten"' },
];

// Interpretiert die Antwort einer einzelnen Sprachaufnahme für genau ein Feld.
function interpretVoiceField(key, transcript) {
  if (key === "date") {
    let date = null;
    let m = transcript.match(/(\d{1,2})\.?\s*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{4})?/i);
    if (m) {
      const day = parseInt(m[1], 10);
      const month = MONTHS_DE[m[2].toLowerCase()];
      const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
      date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    } else {
      m = transcript.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m) date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    if (date && isValidISODate(date)) return { value: date, display: formatDate(date), ok: true };
    return { value: toISODate(new Date()), display: transcript, ok: false };
  }
  if (key === "depth" || key === "duration") {
    const m = transcript.match(/(\d+[.,]?\d*)/);
    if (m) {
      const val = parseFloat(m[1].replace(",", "."));
      return { value: val, display: String(val), ok: true };
    }
    return { value: "", display: transcript, ok: false };
  }
  // Land, Ort, Tauchplatz: die Antwort ist bereits genau dieses eine Feld —
  // kein Aufsplitten nötig, einfach den erkannten Text übernehmen.
  const cleaned = transcript.trim();
  return { value: cleaned, display: cleaned, ok: cleaned.length > 0 };
}

function renderVoice() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) {
    els.main.innerHTML = `
      <div class="card"><p style="color:var(--danger)">Dein Browser unterstützt leider keine Spracheingabe (funktioniert z. B. in Chrome für Android). Nutze bitte die manuelle Eingabe.</p></div>
      <button type="button" id="voice-cancel" class="btn btn-secondary">Abbrechen</button>
    `;
    document.getElementById("voice-cancel").addEventListener("click", () => goTo("list"));
    return;
  }

  const step = VOICE_FIELDS[state.voiceStep];
  const progress = `Schritt ${state.voiceStep + 1} von ${VOICE_FIELDS.length}`;
  els.main.innerHTML = `
    <div class="card">
      <div class="section-title">${progress}: ${escapeHtml(step.label)}</div>
      <p style="color:var(--text-muted);font-size:13px">${escapeHtml(step.hint)}</p>
      <button type="button" id="voice-record" class="btn btn-primary">🎙️ Aufnahme starten</button>
      <p id="voice-status" style="margin-top:10px;color:var(--text-muted);font-size:13px"></p>
      <div id="voice-result"></div>
    </div>
    <button type="button" id="voice-cancel" class="btn btn-secondary">Abbrechen</button>
  `;
  document.getElementById("voice-cancel").addEventListener("click", () => goTo("list"));
  document.getElementById("voice-record").addEventListener("click", () => recordVoiceStep(Rec, step));
}

function recordVoiceStep(Rec, step) {
  const rec = new Rec();
  rec.lang = "de-DE";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  const status = document.getElementById("voice-status");
  status.textContent = "Höre zu …";

  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript.trim();
    const { value, display, ok } = interpretVoiceField(step.key, transcript);
    status.textContent = "";
    document.getElementById("voice-result").innerHTML = `
      <p>Erkannt: „${escapeHtml(transcript)}" → <b>${escapeHtml(display)}</b>${ok ? "" : ' <span class="badge" style="background:var(--danger);color:#fff">unsicher</span>'}</p>
      <div class="btn-row"><button type="button" id="voice-next" class="btn btn-primary">Weiter</button></div>
      <div class="btn-row"><button type="button" id="voice-retry" class="btn btn-secondary">Erneut aufnehmen</button></div>
    `;
    document.getElementById("voice-next").addEventListener("click", () => {
      state.voiceAnswers[step.key] = value;
      if (!ok) state.voiceUnsure.push(step.key); else state.voiceUnsure = state.voiceUnsure.filter((k) => k !== step.key);
      state.voiceStep++;
      if (state.voiceStep >= VOICE_FIELDS.length) {
        state.prefill = {
          tgNumber: null,
          date: state.voiceAnswers.date || toISODate(new Date()),
          depth: state.voiceAnswers.depth ?? "",
          duration: state.voiceAnswers.duration ?? "",
          country: state.voiceAnswers.country || "",
          location: state.voiceAnswers.location || "",
          site: state.voiceAnswers.site || "",
        };
        state.prefillUnsure = state.voiceUnsure;
        openDiveForm(null);
      } else {
        render();
      }
    });
    document.getElementById("voice-retry").addEventListener("click", () => render());
  };
  rec.onerror = () => { if (status) status.textContent = "Spracheingabe fehlgeschlagen. Bitte erneut versuchen."; };
  rec.onend = () => { if (status && status.textContent === "Höre zu …") status.textContent = "Nichts erkannt. Bitte erneut versuchen."; };
  rec.start();
}

// ---------- Form (manuell + Vorausfüllung durch Sprache) ----------

function renderForm() {
  const editing = state.editingId ? state.dives.find((d) => d.id === state.editingId) : null;
  const pre = !editing && state.prefill ? state.prefill : null;
  const unsure = pre ? state.prefillUnsure : [];
  const d = editing || pre || {
    tgNumber: nextTgNumber(),
    date: toISODate(new Date()),
    depth: "",
    duration: "",
    country: "",
    location: "",
    site: "",
  };
  // Vorausfüllung ist nur für dieses eine Rendering gültig
  state.prefill = null;
  state.prefillUnsure = [];

  const flag = (name) => unsure.includes(name)
    ? ` <span class="badge" style="background:var(--danger);color:#fff">prüfen</span>`
    : "";

  els.main.innerHTML = `
    <form class="dive-form" id="dive-form">
      <label for="f-date">Datum *${flag("date")}</label>
      <input type="date" id="f-date" required value="${escapeHtml(d.date)}">

      <div class="form-row2">
        <div>
          <label for="f-depth">Tiefe (m) *${flag("depth")}</label>
          <input type="number" id="f-depth" step="0.1" min="0" required value="${escapeHtml(d.depth)}">
        </div>
        <div>
          <label for="f-duration">Dauer (min) *${flag("duration")}</label>
          <input type="number" id="f-duration" step="0.5" min="0" required value="${escapeHtml(d.duration)}">
        </div>
      </div>

      <label for="f-country">Land *${flag("country")}</label>
      <input type="text" id="f-country" list="country-list" required value="${escapeHtml(d.country)}">
      <datalist id="country-list">
        ${[...new Set(state.dives.map((x) => x.country).filter(Boolean))].sort().map((c) => `<option value="${escapeHtml(c)}">`).join("")}
      </datalist>

      <label for="f-location">Ort *${flag("location")}</label>
      <input type="text" id="f-location" list="location-list" required value="${escapeHtml(d.location)}">
      <datalist id="location-list">
        ${[...new Set(state.dives.map((x) => x.location).filter(Boolean))].sort().map((c) => `<option value="${escapeHtml(c)}">`).join("")}
      </datalist>

      <label for="f-site">Tauchplatz${flag("site")}</label>
      <input type="text" id="f-site" list="site-list" value="${escapeHtml(d.site)}">
      <datalist id="site-list">
        ${[...new Set(state.dives.map((x) => x.site).filter(Boolean))].sort().map((c) => `<option value="${escapeHtml(c)}">`).join("")}
      </datalist>

      <label for="f-tg">TG-Nummer</label>
      <input type="text" id="f-tg" value="${escapeHtml(editing ? (d.tgNumber ?? "–") : nextTgNumber())}" readonly tabindex="-1" aria-readonly="true">

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Speichern</button>
      </div>
      ${editing ? `<div class="btn-row"><button type="button" id="delete-btn" class="btn btn-danger">Tauchgang löschen</button></div>` : ""}
      <div class="btn-row"><button type="button" id="cancel-btn" class="btn btn-secondary">Abbrechen</button></div>
    </form>
  `;

  document.getElementById("dive-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveDiveFromForm(editing);
  });
  document.getElementById("cancel-btn").addEventListener("click", () => goTo("list"));
  const delBtn = document.getElementById("delete-btn");
  if (delBtn) {
    delBtn.addEventListener("click", async () => {
      if (confirm("Diesen Tauchgang wirklich löschen? Das kann nicht rückgängig gemacht werden.")) {
        try {
          await window.DiveDB.deleteDive(editing.id);
          await loadDives();
          toast("Tauchgang gelöscht");
          goTo("list");
        } catch (err) {
          toast("Der Tauchgang konnte nicht gelöscht werden.");
        }
      }
    });
  }
}

async function saveDiveFromForm(editing) {
  const date = document.getElementById("f-date").value;
  const depth = parseFloat(document.getElementById("f-depth").value);
  const duration = parseFloat(document.getElementById("f-duration").value);
  const country = document.getElementById("f-country").value.trim();
  const location = document.getElementById("f-location").value.trim();
  const site = document.getElementById("f-site").value.trim();
  // TG-Nummer wird nie aus dem (read-only) Feld übernommen, sondern automatisch
  // vergeben: beim Bearbeiten bleibt die vorhandene Nummer, bei neuen
  // Tauchgängen ist es die aktuelle Anzahl Tauchgänge + 1.
  const tgNumber = editing ? (editing.tgNumber ?? null) : nextTgNumber();

  const dive = {
    id: editing ? editing.id : window.DiveDB.generateId(),
    tgNumber,
    date,
    depth,
    duration,
    country,
    location,
    site,
  };

  const check = validateDive(dive);
  if (!check.valid) {
    toast(check.errors[0] + (check.errors.length > 1 ? ` (+${check.errors.length - 1} weitere)` : ""));
    return;
  }

  try {
    await window.DiveDB.putDive(dive);
    await loadDives();
    toast(editing ? "Tauchgang aktualisiert" : "Tauchgang gespeichert");
    goTo("list");
  } catch (err) {
    toast("Der Tauchgang konnte nicht gespeichert werden. Bitte versuche es erneut.");
  }
}

// ---------- Backup & Wiederherstellung (JSON) ----------
// Ein Backup ist eine vollständige Sicherung des App-Zustands (alle Tauchgänge
// inkl. interner IDs, Seed-Version, Theme) — im Gegensatz zum Excel-Export,
// der nur die 8 Spalten der Tauchgänge enthält.

const BACKUP_FORMAT = "tauchlogbuch-backup";
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_REMINDER_DAYS = 30;
const BACKUP_SNOOZE_DAYS = 7;
const DIVE_FIELDS = ["tgNumber", "date", "depth", "duration", "country", "location", "site"];

function daysSince(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function backupStatus() {
  const days = state.lastBackupAt ? daysSince(state.lastBackupAt) : null;
  if (days === null) return { days: null, due: true };
  return { days, due: days >= BACKUP_REMINDER_DAYS };
}

function describeAge(days) {
  return days === 0 ? "heute" : `vor ${days} Tag${days === 1 ? "" : "en"}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function createBackup() {
  try {
    const dives = (await window.DiveDB.getAllDives()).sort((a, b) =>
      (a.date || "").localeCompare(b.date || "") || (a.tgNumber || 0) - (b.tgNumber || 0));
    const now = new Date();
    const payload = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      dbVersion: window.DiveDB.DB_VERSION,
      exportedAt: now.toISOString(),
      diveCount: dives.length,
      meta: { seedVersion: (await window.DiveDB.getMeta("seedVersion")) ?? null },
      settings: { theme: safeGetLocalStorage("theme") },
      dives,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `Tauchlogbuch-Backup-${toISODate(now)}.json`);
    state.lastBackupAt = now.toISOString();
    state.reminderSnoozedUntil = null;
    await window.DiveDB.setMeta("lastBackupAt", state.lastBackupAt);
    await window.DiveDB.setMeta("backupReminderSnoozedUntil", null);
    toast(`Backup mit ${dives.length} Tauchgängen erstellt`);
    return true;
  } catch (err) {
    toast("Das Backup konnte nicht erstellt werden.");
    return false;
  }
}

async function loadBackupMeta() {
  try {
    state.lastBackupAt = (await window.DiveDB.getMeta("lastBackupAt")) || null;
    state.reminderSnoozedUntil = (await window.DiveDB.getMeta("backupReminderSnoozedUntil")) || null;
  } catch (err) { /* Erinnerung ist optional */ }
}

async function snoozeBackupReminder() {
  state.reminderSnoozedUntil = new Date(Date.now() + BACKUP_SNOOZE_DAYS * 86400000).toISOString();
  try { await window.DiveDB.setMeta("backupReminderSnoozedUntil", state.reminderSnoozedUntil); } catch (err) { /* egal */ }
  render();
}

// Banner oben im Dashboard: ungültige Daten + fällige Backup-Erinnerung.
function dashboardBannersHtml() {
  let html = "";
  const invalid = state.dives.filter((d) => !validateDive(d).valid).length;
  if (invalid) {
    html += `<div class="banner banner-danger" role="alert">
      <p>⚠️ ${invalid === 1 ? "Ein Tauchgang enthält" : `${invalid} Tauchgänge enthalten`} ungültige Werte und fehlt in Teilen der Statistik.</p>
      <div class="banner-actions"><button type="button" class="btn btn-secondary" data-banner="check">Daten prüfen</button></div>
    </div>`;
  }
  const st = backupStatus();
  const snoozed = state.reminderSnoozedUntil && new Date(state.reminderSnoozedUntil).getTime() > Date.now();
  if (st.due && state.dives.length && !snoozed) {
    const msg = st.days === null
      ? "Du hast noch kein Backup erstellt."
      : `Dein letztes Backup ist ${st.days} Tage alt.`;
    html += `<div class="banner" role="status">
      <p>💾 ${msg}</p>
      <div class="banner-actions">
        <button type="button" class="btn btn-primary" data-banner="backup">Backup erstellen</button>
        <button type="button" class="btn btn-secondary" data-banner="snooze">Später</button>
      </div>
    </div>`;
  }
  return html;
}

function wireDashboardBanners() {
  els.main.querySelectorAll("[data-banner]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.banner;
      if (action === "check") goTo("check");
      else if (action === "snooze") await snoozeBackupReminder();
      else if (action === "backup") { if (await createBackup()) render(); }
    });
  });
}

// ---------- Daten-Reiter ----------

function renderData() {
  const st = backupStatus();
  const lastText = st.days === null
    ? "Noch nie"
    : `${formatDate(toISODate(new Date(state.lastBackupAt)))} (${describeAge(st.days)})`;
  els.main.innerHTML = `
    <div class="card">
      <div class="section-title">💾 Datensicherung (Backup)</div>
      <p class="hint">Vollständige Sicherung als JSON-Datei: alle Tauchgänge inkl. interner IDs und Einstellungen.
        Geeignet für Gerätewechsel und zum Zusammenführen von Smartphone und Tablet.</p>
      <p class="hint"><b>Letztes Backup:</b> ${lastText}</p>
      <div class="btn-stack">
        <button type="button" id="data-backup" class="btn btn-primary">⬇️ Backup erstellen</button>
        <button type="button" id="data-restore" class="btn btn-secondary">⬆️ Backup wiederherstellen</button>
      </div>
    </div>

    <div class="card">
      <div class="section-title">📄 Excel</div>
      <p class="hint">Der Excel-Export enthält nur die Tauchgangs-Spalten und ist <b>kein</b> vollständiges Backup.</p>
      <div class="btn-stack">
        <button type="button" id="data-export" class="btn btn-secondary">⬇️ Als Excel exportieren</button>
        <button type="button" id="data-import" class="btn btn-secondary">⬆️ Excel-Import / Einfügen</button>
      </div>
    </div>

    <div class="card">
      <div class="section-title">🔍 Datenqualität</div>
      <p class="hint">Prüft alle gespeicherten Tauchgänge auf ungültige oder auffällige Werte.</p>
      <div class="btn-stack">
        <button type="button" id="data-check" class="btn btn-secondary">Daten prüfen</button>
      </div>
    </div>
  `;
  document.getElementById("data-backup").addEventListener("click", async () => { if (await createBackup()) renderData(); });
  document.getElementById("data-restore").addEventListener("click", () => goTo("restore"));
  document.getElementById("data-export").addEventListener("click", exportToExcel);
  document.getElementById("data-import").addEventListener("click", () => goTo("excel-import"));
  document.getElementById("data-check").addEventListener("click", () => goTo("check"));
}

// ---------- Restore ----------

function renderRestore() {
  els.main.innerHTML = `
    <div class="card">
      <div class="section-title">Backup-Datei wählen</div>
      <p class="hint" style="margin-top:0">Wähle eine zuvor erstellte Datei „Tauchlogbuch-Backup-….json". Vor jeder Änderung siehst du eine Vorschau.</p>
      <input type="file" id="backup-file-input" accept=".json,application/json">
    </div>
    <div id="restore-preview-area"></div>
    <button type="button" id="restore-cancel" class="btn btn-secondary">Abbrechen</button>
  `;
  document.getElementById("restore-cancel").addEventListener("click", () => goTo("data"));
  document.getElementById("backup-file-input").addEventListener("change", handleBackupFile);
}

function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (err) { return { ok: false, errors: ["Die Datei ist kein gültiges JSON."] }; }
  if (!obj || typeof obj !== "object" || obj.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ["Das ist keine Tauchlogbuch-Sicherung."] };
  }
  if (typeof obj.formatVersion !== "number" || obj.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, errors: ["Diese Sicherung stammt aus einer neueren App-Version und kann hier nicht gelesen werden."] };
  }
  if (!Array.isArray(obj.dives)) return { ok: false, errors: ["Die Sicherung enthält keine Tauchgangsliste."] };

  const errors = [];
  if (typeof obj.diveCount === "number" && obj.diveCount !== obj.dives.length) {
    errors.push(`Die Sicherung ist unvollständig (erwartet ${obj.diveCount}, gefunden ${obj.dives.length} Tauchgänge).`);
  }
  const seen = new Set();
  obj.dives.forEach((d, i) => {
    const label = `Eintrag ${i + 1}`;
    if (!d || typeof d !== "object") { errors.push(`${label}: kein Datensatz`); return; }
    if (typeof d.id !== "string" || !d.id) errors.push(`${label}: ID fehlt`);
    else if (seen.has(d.id)) errors.push(`${label}: ID doppelt`);
    else seen.add(d.id);
    const check = validateDive(d);
    if (!check.valid) errors.push(`${label}: ${check.errors.join(", ")}`);
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, dives: obj.dives, exportedAt: obj.exportedAt, settings: obj.settings || {} };
}

function sameDiveContent(a, b) {
  return DIVE_FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null));
}

// Zusammenführen: nur Tauchgänge hinzufügen, die es lokal noch nicht gibt.
// Gleiche ID => vorhanden (lokale Version bleibt), gleicher Fachschlüssel bei
// anderer ID => vermutliches Duplikat (wird übersprungen).
function computeMergePlan(backupDives) {
  const byId = new Map(state.dives.map((d) => [d.id, d]));
  const keys = new Set(state.dives.map(diveDuplicateKey));
  const toAdd = [];
  let identical = 0, differing = 0, duplicates = 0;
  backupDives.forEach((b) => {
    const existing = byId.get(b.id);
    if (existing) { if (sameDiveContent(existing, b)) identical++; else differing++; return; }
    const key = diveDuplicateKey(b);
    if (keys.has(key)) { duplicates++; return; }
    keys.add(key);
    toAdd.push(b);
  });
  return { toAdd, identical, differing, duplicates };
}

async function handleBackupFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const area = document.getElementById("restore-preview-area");
  let text;
  try { text = await file.text(); } catch (err) { toast("Die Datei konnte nicht gelesen werden."); return; }
  const parsed = parseBackup(text);
  if (!parsed.ok) {
    state.backupPreview = null;
    const shown = parsed.errors.slice(0, 8).map((m) => `<li>${escapeHtml(m)}</li>`).join("");
    area.innerHTML = `<div class="card">
      <p style="color:var(--danger);margin-top:0">❌ Die Sicherung wird nicht wiederhergestellt, damit nichts halb überschrieben wird:</p>
      <ul class="issue-list">${shown}${parsed.errors.length > 8 ? `<li>… und ${parsed.errors.length - 8} weitere</li>` : ""}</ul>
    </div>`;
    return;
  }
  state.backupPreview = { parsed, mode: "merge" };
  renderRestorePreview();
}

function renderRestorePreview() {
  const bp = state.backupPreview;
  const area = document.getElementById("restore-preview-area");
  if (!bp || !area) return;
  const { parsed, mode } = bp;
  const plan = computeMergePlan(parsed.dives);
  const created = parsed.exportedAt ? formatDate(toISODate(new Date(parsed.exportedAt))) : "unbekannt";

  const modeInfo = mode === "merge"
    ? `<p>✅ ${plan.toAdd.length} Tauchgänge werden hinzugefügt</p>
       <p>↔️ ${plan.identical} bereits identisch vorhanden</p>
       ${plan.differing ? `<p>✏️ ${plan.differing} mit gleicher ID, aber abweichenden Werten — deine lokale Version bleibt erhalten</p>` : ""}
       ${plan.duplicates ? `<p>↔️ ${plan.duplicates} vermutliche Duplikate (gleicher TG/Tauchplatz) — werden übersprungen</p>` : ""}`
    : `<p>⚠️ Alle aktuell gespeicherten ${state.dives.length} Tauchgänge werden durch die ${parsed.dives.length} aus der Sicherung ersetzt.</p>
       <label class="choice"><input type="checkbox" id="restore-safety" checked> Vorher automatisch ein Backup des aktuellen Stands herunterladen</label>`;

  area.innerHTML = `
    <div class="card">
      <div class="section-title">Vorschau</div>
      <p>Sicherung vom <b>${created}</b> mit <b>${parsed.dives.length}</b> Tauchgängen · aktuell gespeichert: <b>${state.dives.length}</b></p>
      <label class="choice"><input type="radio" name="restore-mode" value="merge" ${mode === "merge" ? "checked" : ""}>
        <span><b>Zusammenführen</b> (empfohlen) – fehlende Tauchgänge hinzufügen, vorhandene bleiben unverändert</span></label>
      <label class="choice"><input type="radio" name="restore-mode" value="replace" ${mode === "replace" ? "checked" : ""}>
        <span><b>Ersetzen</b> – kompletter Bestand wird durch die Sicherung ersetzt (z. B. Gerätewechsel)</span></label>
      <div style="margin-top:12px">${modeInfo}</div>
      <p class="hint">Der Vorgang ist atomar: entweder wird alles übernommen oder gar nichts geändert.</p>
      <button type="button" id="restore-confirm" class="btn ${mode === "replace" ? "btn-danger" : "btn-primary"}"
        ${mode === "merge" && !plan.toAdd.length ? "disabled" : ""}>
        ${mode === "merge" ? `${plan.toAdd.length} Tauchgänge hinzufügen` : "Bestand ersetzen"}
      </button>
    </div>
  `;
  area.querySelectorAll('input[name="restore-mode"]').forEach((r) =>
    r.addEventListener("change", () => { bp.mode = r.value; renderRestorePreview(); }));
  document.getElementById("restore-confirm").addEventListener("click", confirmRestore);
}

async function confirmRestore() {
  const bp = state.backupPreview;
  if (!bp) return;
  try {
    if (bp.mode === "replace") {
      if (!confirm(`Aktuell gespeicherte ${state.dives.length} Tauchgänge werden durch ${bp.parsed.dives.length} aus der Sicherung ersetzt. Fortfahren?`)) return;
      const safety = document.getElementById("restore-safety");
      if (safety && safety.checked && state.dives.length) {
        if (!(await createBackup())) { toast("Sicherheits-Backup fehlgeschlagen – Wiederherstellung abgebrochen."); return; }
      }
      // seedVersion auf aktuell setzen, damit Startdaten den ersetzten Bestand nicht wieder auffüllen.
      await window.DiveDB.replaceAllDives(bp.parsed.dives, { seedVersion: CURRENT_SEED_VERSION });
      const theme = bp.parsed.settings.theme;
      if (theme === "dark" || theme === "light") {
        safeSetLocalStorage("theme", theme);
        document.documentElement.setAttribute("data-theme", theme);
        updateThemeIcon();
      }
      toast(`${bp.parsed.dives.length} Tauchgänge wiederhergestellt`);
    } else {
      const plan = computeMergePlan(bp.parsed.dives);
      await window.DiveDB.putDivesBulk(plan.toAdd);
      toast(`${plan.toAdd.length} Tauchgänge hinzugefügt`);
    }
    await loadDives();
    state.backupPreview = null;
    goTo("list");
  } catch (err) {
    toast("Wiederherstellung fehlgeschlagen – es wurde nichts geändert.");
  }
}

// ---------- Datenqualitätsprüfung ----------

function analyzeData(dives) {
  const issues = new Map(); // id -> { dive, messages[] }
  const addIssue = (d, msg) => {
    if (!issues.has(d.id)) issues.set(d.id, { dive: d, messages: [] });
    issues.get(d.id).messages.push(msg);
  };
  let badId = 0, badDate = 0, badDepth = 0, badDuration = 0, badText = 0, noSite = 0, noTg = 0, oddValues = 0;
  const tgCounts = new Map();
  const isNum = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

  dives.forEach((d) => {
    if (typeof d.id !== "string" || !d.id) badId++;
    if (!window.DiveValidation.isValidISODate(d.date)) badDate++;
    if (!isNum(d.depth)) badDepth++;
    if (!isNum(d.duration)) badDuration++;
    if (!String(d.country || "").trim() || !String(d.location || "").trim()) badText++;
    if (!String(d.site || "").trim()) noSite++;
    if (window.DiveValidation.hasTg(d)) tgCounts.set(Number(d.tgNumber), (tgCounts.get(Number(d.tgNumber)) || 0) + 1);
    else noTg++;

    const check = validateDive(d);
    check.errors.forEach((m) => addIssue(d, m));
    check.warnings.filter((w) => w !== "Tauchplatz fehlt").forEach((w) => { addIssue(d, w); if (!w.startsWith("TG-Nummer")) oddValues++; });
  });

  const dupTgs = [...tgCounts.entries()].filter(([, c]) => c > 1).map(([n]) => n);
  dives.forEach((d) => {
    if (window.DiveValidation.hasTg(d) && dupTgs.includes(Number(d.tgNumber))) addIssue(d, `TG-Nummer ${d.tgNumber} mehrfach vergeben`);
  });

  const ok = (text) => ({ level: "ok", text });
  const warn = (text) => ({ level: "warn", text });
  const err = (text) => ({ level: "error", text });
  const checks = [];
  checks.push(badId ? err(`${badId} ohne gültige ID`) : ok(`${dives.length} gültige IDs`));
  checks.push(badDate ? err(`${badDate} mit ungültigem Datum`) : ok("alle Datumsangaben gültig"));
  checks.push(badDepth ? err(`${badDepth} mit ungültiger Tiefe`) : ok("keine negativen oder fehlenden Tiefen"));
  checks.push(badDuration ? err(`${badDuration} mit ungültiger Tauchzeit`) : ok("keine negativen oder fehlenden Tauchzeiten"));
  checks.push(badText ? err(`${badText} ohne Land oder Ort`) : ok("Land und Ort überall vorhanden"));
  checks.push(noTg ? warn(`${noTg} ohne TG-Nummer`) : ok(`${tgCounts.size} gültige TG-Nummern`));
  checks.push(dupTgs.length ? warn(`${dupTgs.length} mehrfach vergebene TG-Nummer(n): ${dupTgs.slice(0, 8).join(", ")}${dupTgs.length > 8 ? " …" : ""}`) : ok("keine doppelten TG-Nummern"));
  checks.push(noSite ? warn(`${noSite} Tauchgänge ohne Tauchplatz`) : ok("Tauchplatz überall vorhanden"));
  checks.push(oddValues ? warn(`${oddValues} Tauchgänge mit auffälligen Werten`) : ok("keine auffälligen Werte"));
  return { checks, issues: [...issues.values()] };
}

function renderCheck() {
  const { checks, issues } = analyzeData(state.dives);
  const icon = { ok: "✓", warn: "⚠️", error: "✖" };
  const shown = issues.slice(0, 40);
  els.main.innerHTML = `
    <div class="card">
      <div class="section-title">${state.dives.length} Tauchgänge geprüft</div>
      ${checks.map((c) => `<div class="check-row check-${c.level}"><span class="check-icon" aria-hidden="true">${icon[c.level]}</span><span>${escapeHtml(c.text)}</span></div>`).join("")}
    </div>
    ${issues.length ? `<div class="section-title" style="margin:6px 4px 10px">Details (${issues.length}) – antippen zum Bearbeiten</div>
      ${shown.map(({ dive, messages }) => `
        <div class="dive-list-item" data-id="${escapeHtml(dive.id)}">
          <div class="main">
            <div class="site">${escapeHtml(dive.site || "Ohne Tauchplatz")}</div>
            <div class="meta">${escapeHtml(dive.date || "kein Datum")} · TG ${escapeHtml(dive.tgNumber ?? "–")}</div>
            <div class="meta" style="color:var(--danger)">${escapeHtml(messages.join(" · "))}</div>
          </div>
        </div>`).join("")}
      ${issues.length > shown.length ? `<p class="hint" style="text-align:center">… und ${issues.length - shown.length} weitere</p>` : ""}` : ""}
    <button type="button" id="check-back" class="btn btn-secondary" style="margin-top:8px">Zurück</button>
  `;
  els.main.querySelectorAll(".dive-list-item").forEach((el) =>
    el.addEventListener("click", () => openDiveForm(el.dataset.id)));
  document.getElementById("check-back").addEventListener("click", () => goTo("data"));
}

// ---------- Init ----------

async function init() {
  initTheme();
  els.themeBtn.addEventListener("click", toggleTheme);
  document.querySelectorAll("nav.bottom-nav button").forEach((b) => {
    b.addEventListener("click", () => {
      if (b.dataset.view === "new") goTo("new-menu");
      else goTo(b.dataset.view);
    });
  });

  await maybeSeedInitialData();
  await loadDives();
  await loadBackupMeta();
  render();

  // Persistenten Speicher anfordern, damit der Browser die Tauchgänge nicht
  // bei Speicherknappheit automatisch entfernt (Fehler ignorieren).
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

init();
