# Tauchlogbuch – PWA

Persönliches Tauchlogbuch als Progressive Web App, abgeleitet 1:1 aus der
Datenstruktur deiner bestehenden Excel-Datei (`Daten`-Blatt: TG, Datum,
Tiefe, Dauer, Land, Ort, Tauchplatz). Läuft komplett lokal im Browser,
speichert alle Daten in IndexedDB auf dem Gerät, kein Backend nötig.

**Status:** Datenmodell, Oberfläche, Speicherung, Erfassung/Bearbeitung
(manuell, per Excel-Import, per Copy/Paste aus Excel und per Spracheingabe),
Dashboard/Statistiken, Excel-Export, Backup/Wiederherstellung als JSON-Datei,
eine Datenqualitätsprüfung sowie das Löschen aller Tauchgänge sind umgesetzt.
Deine 682 realen Tauchgänge aus der Excel-Datei sind als Startdaten enthalten.
Alle Eingabewege (Formular, Sprache, Excel-Import, Copy/Paste, Backup-Restore)
nutzen dieselbe zentrale Validierung (`js/validation.js`), damit über keinen
Weg ungültige Daten in die Datenbank gelangen können.

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
  Geräts** – die App selbst sendet keine Tauchgangsdaten an einen Server
  (Ausnahmen: der Ladevorgang der SheetJS-Bibliothek, siehe Punkt 1, und die
  browsereigene Spracherkennung, siehe Punkt 5).
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

- **Manuell eingeben** – das bekannte Formular. Die TG-Nummer wird dabei
  nirgends eingegeben: Sie wird immer automatisch als „aktuelle Anzahl
  Tauchgänge + 1" berechnet und nur schreibgeschützt (read-only) angezeigt.
- **Excel-Datei importieren** – lädt eine `.xlsx`/`.xls`-Datei mit den
  Spalten `Datum, Tiefe, Dauer, Land, Ort, Tauchplatz` (Kopfzeile nötig,
  `TG` optional). Auf derselben Seite steht
  zusätzlich **„Zeilen aus Excel einfügen"**: markierte Zeilen aus Excel
  kopieren und in ein Textfeld einfügen (mit oder ohne Kopfzeile, Tab- oder
  Semikolon-getrennt) — funktioniert auch offline, ohne Dateiauswahl. Beide
  Wege teilen sich dieselbe Vorschau (erkannte / neue / bereits vorhandene /
  fehlerhafte Zeilen); bereits vorhandene Tauchgänge werden per
  Datum + Tiefe + Dauer + Tauchplatz erkannt und automatisch übersprungen.
  Eine ggf. vorhandene `TG`-Spalte in der Quelle wird beim Import **immer
  ignoriert** — die TG-Nummer wird für jeden importierten Tauchgang genau wie
  bei der manuellen Eingabe automatisch und fortlaufend vom System vergeben
  (erst beim endgültigen Bestätigen des Imports, nicht schon in der
  Vorschau). Das gilt nur für den Excel-/Copy-Paste-Import: Beim
  **Backup-Restore** (Abschnitt „Daten") werden die TG-Nummern aus der
  Backup-Datei unverändert übernommen, da ein Backup den vollständigen,
  bereits konsistenten Datenbestand darstellt.
- **Per Sprache eingeben** – nutzt die Spracherkennung des Browsers
  (funktioniert z. B. in Chrome für Android; kostenlos, keine eigene
  externe KI-API der App). **Hinweis:** Die Web-Speech-API kann je nach
  Browser die Audioaufnahme zur Erkennung an einen Server des
  Browser-Herstellers (z. B. Google bei Chrome) senden — die Spracheingabe
  ist daher nicht garantiert lokal. Die App fragt die Felder
  **einzeln nacheinander** ab (Datum, Land, Ort, Tauchplatz, Tiefe,
  Dauer) — jede Sprachaufnahme entspricht dabei genau einem Feld, statt
  einen ganzen Satz zu diktieren und ihn per Kommas zu zerlegen (Browser-
  Spracherkennung liefert i. d. R. keine Satzzeichen zurück, ein
  Freitext-Diktat wäre dadurch unzuverlässig). Nach jeder Aufnahme siehst
  du das erkannte Ergebnis und kannst es bei Bedarf wiederholen. Am Ende
  öffnet sich das normale Formular, vorausgefüllt mit allen erfassten
  Werten; unsicher erkannte Felder sind mit „unsicher"/„prüfen"
  gekennzeichnet. Gespeichert wird erst nach deiner Bestätigung.

## 6. Reiter „Daten": Backup, Excel & Datenqualität

Im vierten Reiter **„Daten"** (💾) findest du:

- **💾 Backup erstellen / wiederherstellen** – eine generische, vollständige
  Sicherung des App-Zustands als JSON-Datei (alle Tauchgänge inkl. interner
  IDs, Seed-Version, Theme) — zusätzlich zum Excel-Export, z. B. für einen
  1:1-Gerätewechsel oder zum Zusammenführen von Smartphone und Tablet. Beim
  Wiederherstellen zeigt die App zuerst eine Vorschau und lässt dich zwischen
  **Zusammenführen** (fehlende Tauchgänge ergänzen, nichts überschreiben) und
  **Ersetzen** (kompletter Bestand wird 1:1 durch die Sicherung ersetzt, mit
  optionalem Sicherheits-Backup davor) wählen. Der Vorgang läuft in einer
  einzigen Datenbank-Transaktion: entweder wird alles übernommen, oder gar
  nichts geändert. Solange kein Backup existiert bzw. das letzte länger als
  30 Tage her ist, erscheint im Dashboard ein Hinweis-Banner.
- **⬇️ Als Excel exportieren** – erzeugt eine `.xlsx`-Datei mit den Spalten
  `TG, Datum, Tiefe, Dauer, Land, Ort, Tauchplatz`, sortiert wie im Original
  nach Datum/TG-Nummer. Das ist ein **Datenexport der 7 Spalten, kein
  vollständiges Backup** des App-Zustands (siehe oben). Die Aktion steht nur
  hier unter „Daten"; im Reiter „Tauchgänge" gibt es sie bewusst nicht mehr
  doppelt.
- **🔍 Daten prüfen** – eine Datenqualitätsprüfung, die alle gespeicherten
  Tauchgänge auf ungültige IDs/Daten, negative oder fehlende Werte,
  doppelte TG-Nummern sowie fehlende Tauchplätze prüft und auffällige
  Einträge direkt zum Bearbeiten verlinkt.

Das Löschen aller Tauchgänge bleibt im Reiter **„Tauchgänge"** (🗑️ Alle
löschen) — nach einer ausdrücklichen Sicherheitsabfrage; erstelle vorher
ein Backup, falls du die Daten behalten möchtest.

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
├── service-worker.js    Offline-Caching des App-Gerüsts (Cache-Version v4)
├── css/styles.css       Design (helle/dunkle Farbvariablen)
├── js/validation.js      Zentrale Validierung (Formular, Sprache, Excel,
│                          Copy/Paste, Backup-Restore) & Duplikat-Erkennung
├── js/db.js             IndexedDB-Speicherschicht (nutzt js/validation.js)
├── js/dashboard.js       KPI- und Diagramm-Berechnungen
├── js/app.js             UI-Logik: Formulare, Excel-Import/-Export & Copy/
│                          Paste, Sprache, Backup/Restore, Datenqualität
├── data/seed-data.json   Deine 682 realen Tauchgänge (Erstimport)
└── icons/                App-Icons (192px, 512px)
```

Datenmodell je Tauchgang (`js/db.js`, Objektspeicher `dives`):

```js
{ id, tgNumber, date, depth, duration, country, location, site }
```

`tgNumber` wird nie vom Nutzer erfasst, sondern beim Anlegen automatisch
als aktuelle Anzahl Tauchgänge + 1 vergeben (und danach unverändert
mitgeführt).

Hinweise zur Wartung:

- **Service Worker:** App-Dateien (HTML/CSS/JS) werden „Network-first"
  geladen — bei Internet bekommst du immer den neuesten Stand, offline
  greift der zwischengespeicherte. Das Erhöhen von `CACHE_NAME` (aktuell
  `v4`) ist nur noch zum Aufräumen alter Cache-Einträge nötig.
- **Validierung:** `validateDive()` in `js/validation.js` prüft Datum
  (echtes Kalenderdatum), Tiefe/Dauer (Zahl ≥ 0) und Pflichtangaben (Land,
  Ort; Tauchplatz ist optional, da in der Original-Excel teils leer)
  zentral für manuelle Eingabe, Sprache, Excel-Import, Copy/Paste-Import
  und Backup-Wiederherstellung. `js/db.js` validiert vor jedem Schreiben
  zusätzlich selbst (`assertValidDive`), damit kein Weg — auch nicht ein
  künftiger — diese Prüfung umgehen kann.
- **Startdaten:** `CURRENT_SEED_VERSION` in `js/app.js` erhöhen, wenn
  `data/seed-data.json` erweitert wird. Nachgeladen werden nur fehlende
  IDs — vorhandene/bearbeitete Tauchgänge werden nie überschrieben.
- **Datenbank-Schema:** Änderungen am Datenmodell als neuer
  `if (oldVersion < N)`-Block in `js/db.js` ergänzen und `DB_VERSION` erhöhen.
- **Excel offline:** SheetJS wird vom CDN geladen. Für Offline-Betrieb die
  Datei `xlsx.full.min.js` (Version 0.18.5) herunterladen, als
  `js/vendor/xlsx.full.min.js` ins Projekt legen, in `index.html` den
  `<script>`-Pfad darauf ändern und den Pfad in `service-worker.js` zu
  `STATIC_ASSETS` hinzufügen.

## Nächste Schritte (auf Wunsch)

- **Sync zwischen mehreren Geräten** (über Backup/Restore hinaus)
- **SheetJS offline bündeln** (siehe Hinweis oben zu „Excel offline")
- **Migration auf „Network First"** für den Service Worker war bereits
  nötig und ist umgesetzt; weitere Schema-Migrationen folgen dem
  vorbereiteten `if (oldVersion < N)`-Gerüst in `js/db.js`.

Sag einfach Bescheid, was als Nächstes umgesetzt werden soll.
