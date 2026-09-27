/*
 * app.js — UI-Logik der Tauchlogbuch-App.
 * Reines Vanilla JavaScript (kein Framework), da die Anwendung klein und
 * wartungsarm bleiben soll (siehe Anforderung "vermeide unnötige Frameworks").
 */

const state = {
  view: "dashboard", // dashboard | list | form | new-menu | excel-import | voice
  dives: [],
  editingId: null,
  search: "",
  countryFilter: "",
  prefill: null,        // vorausgefüllte Werte nach Spracheingabe
  prefillUnsure: [],     // Feldnamen, die bei der Spracherkennung unsicher blieben
  importPreview: null,   // { newRows, dupRows, errors, total }
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

function nextTgNumber() {
  const nums = state.dives.map((d) => Number(d.tgNumber) || 0);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

// ---------- Theme ----------

function initTheme() {
  const saved = localStorage.getItem("theme");
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
  localStorage.setItem("theme", next);
  updateThemeIcon();
}

function updateThemeIcon() {
  const current = document.documentElement.getAttribute("data-theme")
    || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  els.themeBtn.textContent = current === "dark" ? "☀️" : "🌙";
}

// ---------- Data loading & first-run seed ----------

async function loadDives() {
  state.dives = await window.DiveDB.getAllDives();
}

async function maybeSeedInitialData() {
  const seeded = await window.DiveDB.getMeta("seeded");
  if (seeded) return;
  try {
    const res = await fetch("data/seed-data.json");
    const seedDives = await res.json();
    await window.DiveDB.putDivesBulk(seedDives);
    await window.DiveDB.setMeta("seeded", true);
    toast(`${seedDives.length} Tauchgänge aus deiner Excel-Datei importiert`);
  } catch (e) {
    // Kein Blocker: App funktioniert auch ohne Seed-Daten (leerer Start).
    await window.DiveDB.setMeta("seeded", true);
  }
}

// ---------- Navigation ----------

function goTo(view) {
  state.view = view;
  state.editingId = null;
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
  };
  els.title.textContent = titles[state.view] || "Tauchlogbuch";

  if (state.view === "dashboard") renderDashboard();
  else if (state.view === "list") renderList();
  else if (state.view === "form") renderForm();
  else if (state.view === "new-menu") renderNewMenu();
  else if (state.view === "excel-import") renderExcelImport();
  else if (state.view === "voice") renderVoice();
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
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(i.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(i.count / max) * 100}%"></div></div>
        <div class="bar-count">${i.count}</div>
      </div>`).join("");
  };

  els.main.innerHTML = `
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
}

// ---------- List ----------

function renderList() {
  let dives = [...state.dives].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

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
    const sameDayCount = window.Dashboard.divesOnSameDay(d, state.dives);
    return `
    <div class="dive-list-item" data-id="${escapeHtml(d.id)}">
      <div class="main">
        <div class="site">${escapeHtml(d.site || "Ohne Tauchplatz")}</div>
        <div class="meta">${formatDate(d.date)} · ${escapeHtml(d.location || "")}, ${escapeHtml(d.country || "")}${sameDayCount > 1 ? ` · TG ${sameDayCount}/Tag` : ""}</div>
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
      <button type="button" id="export-excel-btn" class="btn btn-secondary">⬇️ Als Excel exportieren</button>
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

  const exportBtn = document.getElementById("export-excel-btn");
  if (exportBtn) exportBtn.addEventListener("click", exportToExcel);

  const deleteAllBtn = document.getElementById("delete-all-btn");
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener("click", async () => {
      const count = state.dives.length;
      if (confirm(`Wirklich ALLE ${count} Tauchgänge unwiderruflich löschen? Das kann nicht rückgängig gemacht werden. Tipp: exportiere vorher als Excel, falls du sie sichern möchtest.`)) {
        try {
          await window.DiveDB.clearAllDives();
          await window.DiveDB.setMeta("seeded", true); // verhindert erneutes Nachladen der Startdaten
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
  const rows = [["TG", "Datum", "Anzahl TG", "Tiefe", "Dauer", "Land", "Ort", "Tauchplatz"]];
  const sorted = [...state.dives].sort((a, b) => {
    if (a.date !== b.date) return (a.date || "").localeCompare(b.date || "");
    return (a.tgNumber || 0) - (b.tgNumber || 0);
  });
  sorted.forEach((d) => {
    rows.push([
      d.tgNumber ?? "",
      formatDate(d.date),
      window.Dashboard.divesOnSameDay(d, state.dives),
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
  const filename = `Tauchlogbuch-Export-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
      <div class="section-title">📄 Excel-Datei importieren</div>
      <p style="color:var(--text-muted);font-size:13px;margin:0">Mehrere Tauchgänge auf einmal aus einer Excel-Datei übernehmen.</p>
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
  if (v instanceof Date && !isNaN(v)) return toISODate(v);
  if (typeof v === "number" && typeof XLSX !== "undefined" && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const s = v.trim();
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return null;
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
        (optional: TG). Die Spalte „Anzahl TG" wird nicht benötigt — sie wird automatisch berechnet.
      </p>
      <input type="file" id="excel-file-input" accept=".xlsx,.xls">
    </div>
    <div id="import-preview-area"></div>
    <button type="button" id="excel-cancel" class="btn btn-secondary">Abbrechen</button>
  `;
  document.getElementById("excel-cancel").addEventListener("click", () => goTo("list"));
  document.getElementById("excel-file-input").addEventListener("change", handleExcelFile);
}

async function handleExcelFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (typeof XLSX === "undefined") {
    toast("Die Excel-Bibliothek ist nicht geladen. Bitte Internetverbindung prüfen und erneut versuchen.");
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames.includes("Daten") ? "Daten" : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    if (!rows.length) { toast("Die Datei enthält keine Daten."); return; }

    const headers = rows[0];
    const colIndex = (name) => headers.findIndex((h) => String(h || "").trim().toLowerCase() === name.toLowerCase());
    const idx = {
      tg: colIndex("TG"), date: colIndex("Datum"), depth: colIndex("Tiefe"),
      duration: colIndex("Dauer"), country: colIndex("Land"), location: colIndex("Ort"), site: colIndex("Tauchplatz"),
    };
    const requiredLabels = { date: "Datum", depth: "Tiefe", duration: "Dauer", country: "Land", location: "Ort", site: "Tauchplatz" };
    const missing = Object.keys(requiredLabels).filter((k) => idx[k] === -1);
    if (missing.length) {
      document.getElementById("import-preview-area").innerHTML =
        `<div class="card"><p style="color:var(--danger)">Folgende Spalten wurden in der Kopfzeile nicht gefunden: ${missing.map((k) => requiredLabels[k]).join(", ")}. Bitte prüfe die Spaltenüberschriften deiner Datei.</p></div>`;
      return;
    }

    const parsed = [];
    const errors = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((v) => v === null || v === "")) continue;
      const date = parseDateCell(row[idx.date]);
      const depth = parseNumberCell(row[idx.depth]);
      const duration = parseNumberCell(row[idx.duration]);
      const country = row[idx.country] != null ? String(row[idx.country]).trim() : "";
      const location = row[idx.location] != null ? String(row[idx.location]).trim() : "";
      const site = row[idx.site] != null ? String(row[idx.site]).trim() : "";
      const tgRaw = idx.tg >= 0 ? row[idx.tg] : null;
      const tgNumber = (tgRaw != null && tgRaw !== "") ? parseInt(tgRaw, 10) : null;
      if (!date || depth == null || duration == null || !country || !location || !site) {
        errors.push(r + 1);
        continue;
      }
      parsed.push({ tgNumber, date, depth, duration, country, location, site });
    }

    // Duplikaterkennung: Datum + Tiefe + Dauer + Tauchplatz identisch zu vorhandenem Tauchgang
    const existingKeys = new Set(state.dives.map((d) => `${d.date}|${d.depth}|${d.duration}|${d.site}`));
    const newRows = [];
    const dupRows = [];
    parsed.forEach((p) => {
      const key = `${p.date}|${p.depth}|${p.duration}|${p.site}`;
      if (existingKeys.has(key)) dupRows.push(p);
      else { newRows.push(p); existingKeys.add(key); }
    });

    state.importPreview = { newRows, dupRows, errors, total: rows.length - 1 };
    renderImportPreview();
  } catch (err) {
    toast("Die Datei konnte nicht gelesen werden. Ist es eine gültige Excel-Datei?");
  }
}

function renderImportPreview() {
  const p = state.importPreview;
  document.getElementById("import-preview-area").innerHTML = `
    <div class="card">
      <div class="section-title">Vorschau</div>
      <p>${p.total} Zeile(n) erkannt</p>
      <p>✅ ${p.newRows.length} neue Tauchgänge</p>
      <p>↔️ ${p.dupRows.length} bereits vorhanden (werden übersprungen)</p>
      ${p.errors.length ? `<p style="color:var(--danger)">⚠️ ${p.errors.length} fehlerhafte Zeile(n) (Zeile ${p.errors.join(", ")}) — werden übersprungen</p>` : ""}
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
        toast("Der Import konnte nicht abgeschlossen werden.");
      }
    });
  }
}

// ---------- Spracheingabe ----------

const MONTHS_DE = {
  januar: 1, februar: 2, "märz": 3, maerz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

function parseSpeechTranscript(text) {
  const unsure = [];
  let remaining = text;

  let date = null;
  let m = remaining.match(/(\d{1,2})\.\s*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{4})?/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = MONTHS_DE[m[2].toLowerCase()];
    const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    remaining = remaining.replace(m[0], "");
  } else {
    m = remaining.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) {
      date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      remaining = remaining.replace(m[0], "");
    }
  }
  if (!date) unsure.push("date");

  let depth = null;
  m = remaining.match(/(\d+[.,]?\d*)\s*Meter\s*(maximale\s*)?[Tt]iefe/)
    || remaining.match(/[Tt]iefe[^\d]{0,15}(\d+[.,]?\d*)\s*Meter/);
  if (m) {
    depth = parseFloat(m[1].replace(",", "."));
    remaining = remaining.replace(m[0], "");
  }
  if (depth == null) unsure.push("depth");

  let duration = null;
  m = remaining.match(/(\d+[.,]?\d*)\s*Minuten/);
  if (m) {
    duration = parseFloat(m[1].replace(",", "."));
    remaining = remaining.replace(m[0], "");
  }
  if (duration == null) unsure.push("duration");

  // Bekannte, im Datenmodell nicht vorhandene Zusatzangaben herausfiltern
  remaining = remaining
    .replace(/Sichtweite[^,]*/gi, "")
    .replace(/Wasser(temperatur)?[^,]*/gi, "")
    .replace(/Nitrox[^,]*/gi, "")
    .replace(/\bGas[^,]*/gi, "")
    .replace(/^\s*Neuer Tauchgang[,]?/i, "");

  const parts = remaining.split(",").map((s) => s.trim()).filter(Boolean);
  const country = parts[0] || ""; if (!country) unsure.push("country");
  const location = parts[1] || ""; if (!location) unsure.push("location");
  const site = parts[2] || ""; if (!site) unsure.push("site");

  return {
    fields: {
      tgNumber: null,
      date: date || new Date().toISOString().slice(0, 10),
      depth: depth ?? "",
      duration: duration ?? "",
      country, location, site,
    },
    unsure,
  };
}

function renderVoice() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!Rec;
  els.main.innerHTML = `
    <div class="card">
      <div class="section-title">Per Sprache eingeben</div>
      ${supported ? `
        <p style="color:var(--text-muted);font-size:13px">
          Sprich z. B.: „26. September 2026, Ägypten, Sharm El Sheikh, Far Garden, 24 Meter Tiefe, 52 Minuten"
        </p>
        <button type="button" id="voice-start" class="btn btn-primary">🎙️ Aufnahme starten</button>
        <p id="voice-status" style="margin-top:10px;color:var(--text-muted);font-size:13px"></p>
      ` : `<p style="color:var(--danger)">Dein Browser unterstützt leider keine Spracheingabe (funktioniert z. B. in Chrome für Android). Nutze bitte die manuelle Eingabe.</p>`}
    </div>
    <button type="button" id="voice-cancel" class="btn btn-secondary">Abbrechen</button>
  `;
  document.getElementById("voice-cancel").addEventListener("click", () => goTo("list"));
  if (supported) {
    document.getElementById("voice-start").addEventListener("click", () => startVoiceRecognition(Rec));
  }
}

function startVoiceRecognition(Rec) {
  const rec = new Rec();
  rec.lang = "de-DE";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  const status = document.getElementById("voice-status");
  status.textContent = "Höre zu …";
  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    const { fields, unsure } = parseSpeechTranscript(transcript);
    state.prefill = fields;
    state.prefillUnsure = unsure;
    toast(`Erkannt: „${transcript}"`);
    openDiveForm(null);
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
    date: new Date().toISOString().slice(0, 10),
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

      <label for="f-site">Tauchplatz *${flag("site")}</label>
      <input type="text" id="f-site" list="site-list" required value="${escapeHtml(d.site)}">
      <datalist id="site-list">
        ${[...new Set(state.dives.map((x) => x.site).filter(Boolean))].sort().map((c) => `<option value="${escapeHtml(c)}">`).join("")}
      </datalist>

      <label for="f-tg">TG-Nummer</label>
      <input type="number" id="f-tg" step="1" min="1" value="${escapeHtml(d.tgNumber ?? "")}">

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
  const tgRaw = document.getElementById("f-tg").value;
  const tgNumber = tgRaw ? parseInt(tgRaw, 10) : null;

  if (!date || isNaN(depth) || isNaN(duration) || !country || !location || !site) {
    toast("Bitte überprüfe die markierten Pflichtfelder.");
    return;
  }
  if (depth < 0 || duration < 0) {
    toast("Tiefe und Dauer müssen positive Zahlen sein.");
    return;
  }

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

  try {
    await window.DiveDB.putDive(dive);
    await loadDives();
    toast(editing ? "Tauchgang aktualisiert" : "Tauchgang gespeichert");
    goTo("list");
  } catch (err) {
    toast("Der Tauchgang konnte nicht gespeichert werden. Bitte versuche es erneut.");
  }
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
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

init();
