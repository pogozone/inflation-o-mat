# Prüfung des ausgelieferten Projekts

Projektstand: 2. November 2026. Prüfungen während dieser Umsetzung ausgeführt.

## Tatsächlich ausgeführt

- Backend: `python -m pytest` → **35 Tests bestanden** mit isolierter SQLite-Testdatenbank.
- Frontend: `npm --prefix frontend test` → **8 Tests bestanden**, zwei Testdateien.
- Frontend: `npm --prefix frontend run build` → TypeScript-Prüfung und Vite-Produktionsbuild erfolgreich, 44 Module.
- Integrierter Flask-HTTP-Smoke-Test: gebautes HTML ausgeliefert; Health-Endpunkt, Session/CSRF, Ersteinrichtung, CSV-Vorschau und persistierte normalisierte Position geprüft.
- MySQL-Migrationen mit `flask --app wsgi:app db upgrade --sql` für den echten MySQL-Dialekt kompiliert. Ergebnis in `schema-mysql.sql`. Das ist keine ausgeführte Datenbankmigration auf einem MySQL-Server.
- Python-Dateien mit Ruff formatiert; React/TypeScript/CSS mit Prettier formatiert.
- Unabhängige Backend- und Frontend-Code-Review durchgeführt. Die konkret bestätigten wichtigen Befunde wurden behoben; die Backend-Regressionen und Frontend-Gruppierungs-/API-Regressionen laufen in den genannten Suiten.

## Nicht live ausgeführt

- Kein Docker/MySQL-Server in dieser Umgebung verfügbar: kein echter Docker-Build und kein MySQL-Laufzeittest. `compose.yaml` und `scripts/mysql-smoke.py` sind zur lokalen Prüfung enthalten.
- Kein OpenAI-API-Schlüssel für kostenpflichtige echte Belegbilder verwendet. Fehlender Schlüssel und Zustimmungspflicht sind getestet; Live-Modellverfügbarkeit und Erkennungsqualität müssen mit dem eigenen Schlüssel geprüft werden.
- Die verwaltete Browser-Vorschau konnte die Python-Umgebung nicht starten. Daher kein visueller Browser-/Mobiltest und kein Playwright-End-to-End-Lauf. TypeScript/Build, HTTP-Integration und gezielte Frontend-Tests sind durchgeführt; sie ersetzen keine visuelle Prüfung.

## Abweichungen vom umfassenderen Konzept

Diese Lieferung ist eine funktionierende erste Version, kein Abschluss aller später vorgeschlagenen Erweiterungen. Flexible Merkmale werden als JSON-Werte statt bereits über einen zentralen Merkmalskatalog gepflegt. Händler-/Filialangaben und Packungsgrößen stehen historisch am Einkauf; eigene Stammtabellen/GTIN-Varianten folgen später. KI arbeitet synchron mit Zeitlimit, ohne persistente Queue. Es gibt kein automatisches Scraping, keine fingierten amtlichen Reihen und keine behauptete aktuelle Markt-Vollabdeckung. Details und Betriebshinweise stehen in README.md.

## Relevante behobene Review-Befunde

- Abgeleitete Mengen und Preise gegen Datenbankgrenzen und unzulässige Rundung geprüft.
- Dublettenprüfung auch bei Bearbeitung, ausdrückliche Ausnahme im Frontend.
- Positionsidentität bei Korrekturen erhalten, sodass Zusammenführen → Bearbeiten → Rückgängig funktioniert.
- Retouren mindern Ausgaben und erscheinen nicht als negative Marktpreise.
- Fehlerhafte Importe/Wiederherstellungen rollen vollständig zurück.
- Diagrammserien trennen Produkt-IDs, Einheiten und konkrete Filialstandorte; fehlende Monate bleiben Lücken.
- Warenkorbergebnisse und Filterdaten bleiben bei Änderungen/Fehlern nicht irreführend stehen.
- Sitzungsablauf erhält offene Formulare und ermöglicht erneute Anmeldung.

Die Review-Dateien dokumentieren die ursprünglichen Befunde; der maßgebliche aktuelle Status steht hier und in den Tests.
