# Tauchlogbuch – PWA

Persönliches Tauchlogbuch als Progressive Web App, abgeleitet 1:1 aus der
Datenstruktur deiner bestehenden Excel-Datei (`Daten`-Blatt: TG, Datum,
Tiefe, Dauer, Land, Ort, Tauchplatz). Läuft komplett lokal im Browser,
speichert alle Daten in IndexedDB auf dem Gerät, kein Backend nötig.

**Status:** Phasen 1–7 und 9 deiner Anforderung sind umgesetzt: Datenmodell,
Oberfläche, Speicherung, Erfassung/Bearbeitung (manuell, per Excel-Import
und per Spracheingabe), Dashboard/Statistiken, Excel-Export sowie das
Löschen aller Tauchgänge. Deine 682 realen Tauchgänge aus der Excel-Datei
sind als Startdaten enthalten. **Noch nicht enthalten**: Copy/Paste-Import
aus der Zwischenablage und eine separate Datensicherung/-wiederherstellung
als generische Backup-Datei (der Excel-Export deckt die Datensicherung in
der Praxis bereits weitgehend ab) – siehe „Nächste Schritte" unten.

## 1. Installation

Keine Installation von Abhängigkeiten nötig – reines HTML/CSS/JavaScript,
keine Build-Schritte, kein `npm install`. Für Excel-Import/-Export wird
beim Öffnen der Seite zusätzlich die Bibliothek SheetJS von einem CDN
nachgeladen (ca. 1 MB, einmalig, danach vom Browser gecacht) – dafür ist
beim ersten Aufruf eine Internetverbindung nötig.

## 2. Start der Anwendung

Browser können `index.html` aus Sicherheitsgründen nicht direkt per
`file://` mit vollem IndexedDB-/Service-Worker-Funktionsumfang öffnen.
Starte stattdessen einen einfachen lokalen Webserver im Projektordner:

```bash
# Python (meist vorinstalliert)
python3 -m http.server 8080

# oder Node.js
npx serve .
```

Danach im Browser öffnen: `http://localhost:8080`

## 3. Lokale Nutzung

- Alle Daten liegen ausschließlich in IndexedDB **im Browser dieses
  Geräts** – es werden keine Daten an einen Server gesendet (Ausnahme:
  der Ladevorgang der SheetJS-Bibliothek selbst, siehe Punkt 1).
- Beim allerersten Start werden automatisch deine 682 Tauchgänge aus
  `data/seed-data.json` importiert (einmalig).
- Nach dem Schließen und erneuten Öffnen der App sind alle Änderungen
  weiterhin vorhanden.

## 4. PWA-Installation auf Android

1. Projekt wie unter Punkt 2 auf einem erreichbaren Server bereitstellen
   (z. B. GitHub Pages, oder lokal im selben WLAN erreichbar) – für die
   Installation als App ist eine `https://`- oder `localhost`-Adresse
   nötig, kein `file://`.
2. Seite in Chrome auf dem Android-Gerät öffnen.
3. Menü (⋮) → „App installieren" bzw. „Zum Startbildschirm hinzufügen".
4. Die App startet danach wie eine eigenständige App, inkl. Offline-Start
   des App-Gerüsts über den Service Worker (der Excel-Import/-Export
   benötigt weiterhin Internet für die SheetJS-Bibliothek).

## 5. Neuer Tauchgang: drei Wege

Über den Reiter **„Neu"** öffnet sich eine Auswahl:

- **Manuell eingeben** – das bekannte Formular.
- **Excel-Datei importieren** – lädt eine `.xlsx`/`.xls`-Datei mit den
  Spalten `Datum, Tiefe, Dauer, Land, Ort, Tauchplatz` (Kopfzeile nötig,
  `TG` optional, `Anzahl TG` wird ignoriert). Vor dem Übernehmen zeigt die
  App eine Vorschau (erkannte / neue / bereits vorhandene / fehlerhafte
  Zeilen); bereits vorhandene Tauchgänge (gleiches Datum, gleiche Tiefe,
  Dauer und Tauchplatz) werden automatisch übersprungen.
- **Per Sprache eingeben** – nutzt die Spracherkennung des Browsers
  (funktioniert z. B. in Chrome für Android; kostenlos, keine externe
  KI-API, keine Datenübertragung nach außen). Sprich z. B.: „26. September
  2026, Ägypten, Sharm El Sheikh, Far Garden, 24 Meter Tiefe, 52 Minuten".
  Danach öffnet sich das normale Formular, vorausgefüllt mit den
  erkannten Werten; unsicher erkannte Felder sind mit „prüfen"
  gekennzeichnet. Gespeichert wird erst nach deiner Bestätigung.

## 6. Excel-Export & alle Tauchgänge löschen

Im Bereich **„Tauchgänge"** stehen zwei zusätzliche Aktionen:

- **⬇️ Als Excel exportieren** – erzeugt eine `.xlsx`-Datei mit der
  ursprünglichen Spaltenstruktur (inkl. live berechneter „Anzahl TG"),
  sortiert wie im Original nach Datum/TG-Nummer.
- **🗑️ Alle löschen** – löscht sämtliche gespeicherten Tauchgänge nach
  einer ausdrücklichen Sicherheitsabfrage. Das kann nicht rückgängig
  gemacht werden; exportiere vorher als Excel, falls du die Daten
  behalten möchtest.

## 7. Dark Mode

Umschalter oben rechts (🌙/☀️). Die Wahl wird gespeichert und beim
nächsten Start wiederhergestellt; ohne bisherige Auswahl wird die
Systemeinstellung des Geräts übernommen.

## 8. Anpassung und Weiterentwicklung

Projektstruktur:

```
tauchlogbuch-app/
├── index.html          Grundgerüst, Bottom-Navigation, SheetJS-Einbindung
├── manifest.webmanifest PWA-Manifest
├── service-worker.js    Offline-Caching des App-Gerüsts (Cache-Version v2)
├── css/styles.css       Design (helle/dunkle Farbvariablen)
├── js/db.js             IndexedDB-Speicherschicht
├── js/dashboard.js       KPI- und Diagramm-Berechnungen
├── js/app.js             UI-Logik: Formulare, Excel-Import/-Export, Sprache
├── data/seed-data.json   Deine 682 realen Tauchgänge (Erstimport)
└── icons/                App-Icons (192px, 512px)
```

Datenmodell je Tauchgang (`js/db.js`, Objektspeicher `dives`):

```js
{ id, tgNumber, date, depth, duration, country, location, site }
```

Hinweis: Wenn du künftig `index.html`, `css/styles.css`, `js/app.js` oder
`service-worker.js` änderst, erhöhe in `service-worker.js` die
`CACHE_NAME`-Versionsnummer (z. B. `v2` → `v3`) — sonst liefert der
Service Worker bei wiederkehrenden Besuchen weiter die alten,
zwischengespeicherten Dateien aus.

## Nächste Schritte (auf Wunsch)

- **Copy/Paste-Import** aus der Excel-Zwischenablage (Tabulator-getrennter
  Text direkt einfügen, ohne Datei-Upload)
- **Generische Datensicherung/-wiederherstellung** als JSON-Datei
  (zusätzlich zum Excel-Export, z. B. für einen 1:1-Gerätewechsel)

Sag einfach Bescheid, welche davon als Nächstes umgesetzt werden soll.
