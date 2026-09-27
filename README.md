# Tauchlogbuch – PWA

Persönliches Tauchlogbuch als Progressive Web App, abgeleitet 1:1 aus der
Datenstruktur deiner bestehenden Excel-Datei (`Daten`-Blatt: TG, Datum,
Tiefe, Dauer, Land, Ort, Tauchplatz). Läuft komplett lokal im Browser,
speichert alle Daten in IndexedDB auf dem Gerät, kein Backend nötig.

**Status:** Dies ist der erste, voll funktionsfähige Ausbauschritt
(Phasen 1–6 deiner Anforderung: Datenmodell, Oberfläche, Speicherung,
Erfassung/Bearbeitung, Dashboard/Statistiken). Deine 682 realen
Tauchgänge aus der Excel-Datei sind bereits als Startdaten enthalten –
keine Platzhalter. **Noch nicht enthalten** sind Excel-Import/-Export,
Copy/Paste-Import, Datensicherung/-wiederherstellung als Datei und die
Spracheingabe (Phasen 7–9) – siehe „Nächste Schritte" unten.

## 1. Installation

Keine Installation von Abhängigkeiten nötig – reines HTML/CSS/JavaScript,
keine Build-Schritte, kein `npm install`.

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
  Geräts** – es werden keine Daten an einen Server gesendet.
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
   des App-Gerüsts über den Service Worker.

## 5.–9. Excel-Import, Excel-Export, Copy/Paste-Import, Datensicherung,
   Spracheingabe

Noch nicht umgesetzt – geplant als nächste Ausbaustufen, siehe unten.

## 10. Dark Mode

Umschalter oben rechts (🌙/☀️). Die Wahl wird gespeichert und beim
nächsten Start wiederhergestellt; ohne bisherige Auswahl wird die
Systemeinstellung des Geräts übernommen.

## 11. Anpassung und Weiterentwicklung

Projektstruktur:

```
tauchlogbuch-app/
├── index.html          Grundgerüst, Bottom-Navigation
├── manifest.webmanifest PWA-Manifest
├── service-worker.js    Offline-Caching des App-Gerüsts
├── css/styles.css       Design (helle/dunkle Farbvariablen)
├── js/db.js             IndexedDB-Speicherschicht
├── js/dashboard.js       KPI- und Diagramm-Berechnungen
├── js/app.js             UI-Logik, Formulare, Navigation
├── data/seed-data.json   Deine 682 realen Tauchgänge (Erstimport)
└── icons/                App-Icons (192px, 512px)
```

Datenmodell je Tauchgang (`js/db.js`, Objektspeicher `dives`):

```js
{ id, tgNumber, date, depth, duration, country, location, site }
```

Hinweis zu zwei Entscheidungen aus der Excel-Analyse: Die frühere Spalte
„Anzahl TG" (Tauchgänge pro Tag) wird nicht mehr gespeichert, sondern in
`js/dashboard.js` (`divesOnSameDay`) live aus den vorhandenen Zeilen
berechnet. Bekannte Schreibweise-Unterschiede aus der Quelle (z. B.
„Thailand" mit/ohne Leerzeichen) wurden beim Erstimport bereinigt.

## Nächste Schritte (Phase 7–9, auf Wunsch)

- **Excel-Import/-Export** (SheetJS) mit Vorschau und Duplikaterkennung
- **Copy/Paste-Import** aus Excel-Zwischenablage
- **Datensicherung/-wiederherstellung** als Exportdatei (Geräte-Umzug)
- **Spracheingabe** über die Web-Speech-API des Android-Browsers, mit
  Bestätigungs-Zusammenfassung vor dem Speichern

Sag einfach Bescheid, welche davon als Nächstes umgesetzt werden soll.
