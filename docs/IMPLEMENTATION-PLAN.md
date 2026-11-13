# Inflation-o-mat Implementation Plan

> For agentic workers: execute the approved concept and the API contract, test first. The user explicitly requested implementation with Flask and readable source.

**Goal:** Lauffähige, verständlich veränderbare Preisvergleichs-App mit Flask, MySQL und React liefern.
**Architecture:** Ein Flask-Backend mit Fachmodulen und SQLAlchemy; React als getrenntes Frontend, produktiv von Flask ausgeliefert. Hintergrund-KI in erster Version begrenzter synchroner Request mit Fehlerzuständen; Celery erst bei echtem Lastbedarf, damit der Quelltext überschaubar bleibt.
**Tech Stack:** Python/Flask, SQLAlchemy/Flask-Migrate, MySQL, React/TypeScript/Vite, CSS, pytest.
**Spec:** API-CONTRACT.md plus bestehendes Step-1-Konzept. Bei Konflikten gilt die im Gespräch vereinbarte Flask-Architektur.

## Global Constraints
- Unkomprimierter lesbarer Originalquelltext, beschreibende Namen, kleine Module, deutsche Dokumentation.
- Dezimalrechnung; Original- UND normalisierte Mengen/Preise; historische Stadt/PLZ/Land.
- Keine fingierte KI oder amtlichen Werte; Demo-Daten kenntlich machen.
- Fehlende Grundpreise bleiben null; Vergleiche nur identischer Produkte und kompatibler Einheiten.
- Flask/MySQL sind verbindlich; SQLite nur offengelegter Entwicklungs-/Testmodus.

## Review Focus
- Nichtendliche und negative Mengen/Preise dürfen keine Statistik beschädigen.
- Regions- und Zeitfilter gelten konsistent in Tabellen/Grafiken.
- Ein fehlgeschlagener Mehrfachimport darf keine Teilkäufe hinterlassen.
- Anmeldung/CSRF schützt sämtliche Datenendpunkte, Dateiimporte sind größenbegrenzt.
- Historische Produktmerkmale und Mengen bleiben bei Stammdatenänderung erhalten.

### Task 1: Backend-Kern
Files: backend/inflation_app/{__init__,models,validation,normalization,purchases,products,auth}.py; backend/tests/.
Interfaces: API-CONTRACT.md. Test: Grundpreise, Datum/PLZ, Auth/CSRF, Summen, CRUD, Merge/Undo, atomare DB-Schreibvorgänge.
- [x] Tests zuerst schreiben und rot ausführen.
- [x] Backend-Kern implementieren; alle Tests grün.

### Task 2: Frontend
Files: frontend/src/{App,api,types,components,pages}, styles.css.
Interfaces: ausschließlich API-CONTRACT.md, keine Backend-Dateien ändern.
- [x] API-Typen und Client erstellen, echte Screens/Masks implementieren.
- [x] TypeScript prüfen, Build erstellen und responsive UI überprüfen.

### Task 3: Importe und Auswertungen
Files: backend/inflation_app/{imports,analytics,receipts,transfer}.py; tests/test_features.py.
Interfaces: models + purchases services aus Task 1, API-CONTRACT.md.
- [x] Verhaltensprüfungen für Mediane, Warenkorb, Dubletten, fehlerhafte Importe und fehlende KI schreiben/rot sehen.
- [x] CSV/JSON-Prüfung, KI-Extraktion, Auswertung und Export/Restore implementieren.
- [x] Vollständige Testsuite ausführen.

### Task 4: Integration und Auslieferung
Files: README.md, Dockerfile, compose.yaml, .env.example, docs/PROMPT.md, docs/CODE-GUIDE.md, examples/.
- [x] Backend/Frontend integrieren, Live-API und Build prüfen.
- [x] Frische Code-Review durchführen, relevante Fehler beheben.
- [x] Quelltext-ZIP, ausgearbeiteten Prompt und getestete Startanleitung speichern.

## Fortschritt und Entscheidungen
- User hat Umsetzung und Tech-Stack bestätigt. Kein erneuter Freigabeschritt erforderlich.
- Hosting mit Workers unterstützt Flask/MySQL nicht; unabhängiges Quellprojekt statt Technologieaustausch.
- Styling bewusst in lesbarem CSS, einfache Tabellen statt zusätzlicher Table-Abstraktion; Diagramme als transparente SVG-Komponente. Kein Verlust fachlicher Funktionen.

## Abschluss
35 Backend-Tests, 8 Frontend-Tests und Produktionsbuild bestanden. HTTP-Integration mit Beispieldatei geprüft. Grenzen: kein echter MySQL-/Docker-Lauf, kein kostenpflichtiger Live-KI-Aufruf und kein visueller Browserlauf. Siehe VERIFICATION.md.
