/*
 * app.js — UI-Logik der Tauchlogbuch-App.
 * Reines Vanilla JavaScript (kein Framework), da die Anwendung klein und
 * wartungsarm bleiben soll (siehe Anforderung "vermeide unnötige Frameworks").
 */

const state = {
  view: "dashboard", // dashboard | list | form
  dives: [],
  editingId: null,
  search: "",
  countryFilter: "",
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

// ---------- Rendering: shell ----------

function render() {
  document.querySelectorAll("nav.bottom-nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view || (state.view === "form" && b.dataset.view === "new"));
  });

  const titles = { dashboard: "Dashboard", list: "Tauchgänge", form: state.editingId ? "Tauchgang bearbeiten" : "Neuer Tauchgang" };
  els.title.textContent = titles[state.view] || "Tauchlogbuch";

  if (state.view === "dashboard") renderDashboard();
  else if (state.view === "list") renderList();
  else if (state.view === "form") renderForm();
}

// ---------- Dashboard ----------

function renderDashboard() {
  const dives = state.dives;
  if (dives.length === 0) {
    els.main.innerHTML = `<div class="empty-state">
      <p>Noch keine Tauchgänge erfasst.</p>
      <p>Leg über „Tauchgänge → +” deinen ersten Tauchgang an.</p>
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
}

// ---------- Form ----------

function renderForm() {
  const editing = state.editingId ? state.dives.find((d) => d.id === state.editingId) : null;
  const d = editing || {
    tgNumber: nextTgNumber(),
    date: new Date().toISOString().slice(0, 10),
    depth: "",
    duration: "",
    country: "",
    location: "",
    site: "",
  };

  els.main.innerHTML = `
    <form class="dive-form" id="dive-form">
      <label for="f-date">Datum *</label>
      <input type="date" id="f-date" required value="${escapeHtml(d.date)}">

      <div class="form-row2">
        <div>
          <label for="f-depth">Tiefe (m) *</label>
          <input type="number" id="f-depth" step="0.1" min="0" required value="${escapeHtml(d.depth)}">
        </div>
        <div>
          <label for="f-duration">Dauer (min) *</label>
          <input type="number" id="f-duration" step="0.5" min="0" required value="${escapeHtml(d.duration)}">
        </div>
      </div>

      <label for="f-country">Land *</label>
      <input type="text" id="f-country" list="country-list" required value="${escapeHtml(d.country)}">
      <datalist id="country-list">
        ${[...new Set(state.dives.map((x) => x.country).filter(Boolean))].sort().map((c) => `<option value="${escapeHtml(c)}">`).join("")}
      </datalist>

      <label for="f-location">Ort *</label>
      <input type="text" id="f-location" list="location-list" required value="${escapeHtml(d.location)}">
      <datalist id="location-list">
        ${[...new Set(state.dives.map((x) => x.location).filter(Boolean))].sort().map((c) => `<option value="${escapeHtml(c)}">`).join("")}
      </datalist>

      <label for="f-site">Tauchplatz *</label>
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
      if (b.dataset.view === "new") openDiveForm(null);
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
