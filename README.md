# Inflation-o-mat

Eine deutschsprachige Preisvergleichs-App mit **Python/Flask, MySQL und React/TypeScript**. Der vollständige Originalquelltext ist enthalten, sauber formatiert und nach Aufgaben getrennt. Es gibt keinen proprietären App-Generator und keine Voraussetzung, Änderungen mit einer KI vorzunehmen.

## Was diese Version kann

- Eigenes Benutzerkonto beim ersten Start einrichten; danach Anmeldung per Cookie-Session mit CSRF-Schutz.
- Produkte, Marken, Kategorien, Tags, Bon-Aliasse und zusätzliche Merkmale pflegen.
- Einkäufe mit Datum, Händler, Filiale, Stadt, PLZ, Land, Kanal und Positionen anlegen, korrigieren und löschen.
- Originalmengen UND normalisierte Mengen/Grundpreise dauerhaft speichern und anzeigen.
- Masse, Volumen, Stück, Länge, Fläche, Blatt und Waschladungen unterscheiden; Pfand und Rabatte getrennt behandeln.
- Bestätigte Preise nach Datum, Produkt, Händler, Stadt, PLZ, Kategorie, Tag und Angebot filtern.
- Preisverläufe, monatliche Mediane, Händler- und Regionalvergleiche als Tabellen und Grafiken anzeigen.
- Einen festen persönlichen Warenkorb über zwei Zeiträume vergleichen; bei fehlenden Preisen keinen vollständigen Index vortäuschen.
- CSV und JSON zuerst prüfen und bearbeiten, dann atomar importieren; mögliche Dubletten erkennen.
- Kassenzettelbilder über eine echte, optionale OpenAI-Anbindung als überprüfbare Entwürfe auslesen.
- Produkte bewusst zusammenführen und diese Zuordnung wieder lösen; historische Merkmale erhalten.
- JSON-Sicherung exportieren und in eine leere Datensammlung wiederherstellen; Preisbeobachtungen als CSV exportieren.
- Eine eigene amtliche Indexreihe mit Quelle und Basisjahr hinterlegen und getrennt anzeigen.
- Ausschließlich auf ausdrücklichen Wunsch künstliche, gekennzeichnete Demo-Einkäufe laden.

## Schnellstart mit MySQL und Docker

Voraussetzung: Docker mit Compose. Befehle im entpackten Ordner `inflation-o-mat` ausführen.

1. `.env.example` nach `.env` kopieren.
2. `SECRET_KEY`, `MYSQL_PASSWORD` und `MYSQL_ROOT_PASSWORD` durch eigene Werte ersetzen. Einen zufälligen Anwendungsschlüssel erhältst du mit `python -c "import secrets; print(secrets.token_hex(32))"`.
3. Starten:

```bash
docker compose up --build
```

4. Im Browser **http://localhost:5000** öffnen und das eigene Konto einrichten (Passwort mindestens 12 Zeichen).

Die Daten liegen dauerhaft im Docker-Volume `mysql-data`. Die Datenbank hat keinen veröffentlichten Port. Die Web-App ist zunächst nur auf deinem Rechner erreichbar. Schemaänderungen werden beim Start über Alembic eingespielt.

```bash
# Stoppen; Daten bleiben erhalten:
docker compose down

# Nach Quelltextänderungen neu bauen:
docker compose up --build

# Protokolle lesen:
docker compose logs -f app
```

`docker compose down -v` löscht das Datenbankvolume. Diesen Befehl nur nach bewusster Entscheidung und Sicherung ausführen.

## Ohne Docker ausprobieren

Voraussetzungen: Python 3.12 oder neuer sowie Node.js 22 oder neuer. Dieser Weg verwendet ausdrücklich **SQLite für den lokalen Schnellstart**, solange kein `DATABASE_URL` oder MySQL-Host konfiguriert ist. Das produktive Ziel bleibt MySQL.

```bash
python -m venv .venv
```

Virtuelle Umgebung aktivieren:

```bash
# Linux/macOS:
source .venv/bin/activate

# Windows PowerShell:
.venv\Scripts\Activate.ps1
```

Danach:

```bash
python -m pip install -r backend/requirements.lock
npm --prefix frontend ci
npm --prefix frontend run build
npm run dev
```

Die App ist unter **http://localhost:5000** erreichbar. Der Schnellstart legt `backend/instance/inflation.db` an. Die integrierte Flask-Entwicklungsumgebung ist für lokale Entwicklung gedacht, nicht für öffentliche Bereitstellung. Die geprüften Python-Versionen stehen in `requirements.lock`; `requirements.txt` beschreibt die direkten Abhängigkeiten und ihre zulässigen Bereiche.

Für eine vorhandene MySQL-Instanz `DATABASE_URL` setzen, z. B. `mysql+pymysql://BENUTZER:URLENCODED_PASSWORT@127.0.0.1:3306/inflation?charset=utf8mb4`. Die Datenbank zuerst anlegen. Alternativ `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD` und `MYSQL_DATABASE` verwenden; dabei wird das Passwort sicher als URL-Komponente kodiert. Anschließend im Backend `flask --app wsgi:app db upgrade` ausführen.

## Oberfläche entwickeln

Backend wie oben starten. In einem zweiten Terminal:

```bash
npm --prefix frontend run dev
```

Vite zeigt seine lokale Adresse an und leitet `/api` an Flask auf Port 5000 weiter. Änderungen an React und CSS erscheinen beim Entwickeln direkt. Für den normalen Flask-Start nach Änderungen wieder `npm --prefix frontend run build` ausführen.

## Wo ändere ich was?

| Gewünschte Änderung | Datei |
|---|---|
| Farben, Abstände, mobile Darstellung | `frontend/src/styles.css` |
| Navigation und Seitenüberschriften | `frontend/src/App.tsx` |
| Formular für Kaufvorgänge und Positionen | `frontend/src/components/PurchaseEditor.tsx` |
| Produktverwaltung | `frontend/src/pages/Products.tsx` |
| Preisdiagramm | `frontend/src/components/PriceChart.tsx` |
| API-Anfragen und Zahlenformatierung | `frontend/src/api.ts` |
| Einheiten und Grundpreisformel | `backend/inflation_app/normalization.py` |
| Kaufvalidierung, Snapshot, Dubletten | `backend/inflation_app/purchases.py` |
| Datenbanktabellen und Felder | `backend/inflation_app/models.py` |
| Mediane, Regionen und Warenkorbindex | `backend/inflation_app/analytics.py` |
| CSV-/JSON-Eingabe | `backend/inflation_app/imports.py` |
| KI-Anweisung und Ausgabeschema | `backend/inflation_app/receipts.py` |
| Sicherung, Wiederherstellung und Demo | `backend/inflation_app/transfer.py` |

Weiterführend: [Quelltext-Wegweiser](docs/CODE-GUIDE.md), [Erstellungs-Prompt](docs/PROMPT.md), [API-Vertrag](docs/API-CONTRACT.md).

## Beispiel: Preisangaben richtig eingeben

Du kaufst zwei Packungen Kaffee mit jeweils 500 g für zusammen 5,00 €:

- Kaufmenge: `2`
- Inhalt je Packung: `500`
- Einheit: `g`
- Warenbetrag vor separat angegebenem Rabatt: `5.00`
- Rabatt: `0`
- Pfand: `0`

Gespeichert werden die Originalangaben, insgesamt `1 kg` und `5 €/kg`. Bei loser Ware ist die Kaufmenge `1` und der Packungsinhalt das tatsächlich gewogene Gesamtgewicht. Bei Toilettenpapier wird als Inhalt die bekannte Gesamtblattzahl einer gekauften Packung angegeben; verglichen wird in €/100 Blatt. Rollen und Lagen lassen sich als Merkmale erfassen. Bei unbekanntem Packungsinhalt bleibt der Grundpreis leer.

`line_total` ist der gesamte Warenpositionsbetrag **vor dem zusätzlich eingetragenen Rabatt, ohne Pfand und inklusive Umsatzsteuer**. Wenn der Kassenzettel bereits einen reduzierten Endpreis ausweist und kein separater Rabatt rekonstruiert werden kann, diesen Endpreis mit Rabatt `0` erfassen. Einen Rabatt niemals doppelt abziehen.

Entwürfe fließen nicht in die Preisstatistik ein. Ladenkäufe benötigen für die Bestätigung Stadt und PLZ. Die optionale Belegsumme wird inklusive Pfand und Retouren geprüft; mehr als 0,02 € ungeklärte Abweichung verhindert die Bestätigung.

## KI-Belege konfigurieren

In `.env` setzen und die App neu starten:

```dotenv
OPENAI_API_KEY=dein_eigener_api_schluessel
OPENAI_MODEL=gpt-4.1-mini
```

Der Modellname ist konfigurierbar und muss im verwendeten API-Projekt verfügbar sein sowie Bildverarbeitung und Structured Outputs unterstützen. Der Schlüssel bleibt im Backend. API-Aufrufe können Kosten verursachen. Ein ChatGPT-Abonnement ersetzt keine API-Konfiguration.

Die App sendet das ausgewählte Bild erst nach ausdrücklicher Zustimmung an OpenAI. **Das gesamte Bild wird übertragen**: Vorher selbst Zahlungs-/Kundeninformationen schwärzen, wenn sie nicht übertragen werden sollen. In dieser Version findet keine automatische Schwärzung statt. Die App speichert das Originalbild nicht dauerhaft; der Browser zeigt es zum Prüfen an. Extrahierte Zahlungs-/Kundeninformationen werden nicht in das Einkaufsschema übernommen. Der Entwurf wird erst nach Prüfung gespeichert. Packungsinhalte, Datum oder Preise werden bei Unleserlichkeit nicht erfunden.

Unterstützt: JPEG, PNG und WebP bis 8 MB. PDF/HEIC vorher in ein unterstütztes Bild umwandeln. Die erste Version verarbeitet KI-Anfragen synchron mit Zeitlimit und höchstens einer automatischen API-Wiederholung. Eine persistente Celery-/Redis-Warteschlange ist ein späterer Ausbau; laufende KI-Aufträge werden bei einem Serverneustart nicht fortgesetzt.

## Daten sichern und Demo ausprobieren

Unter **Import & Export** einen vollständigen JSON-Export herunterladen. Er enthält Produkte, Einkäufe mit historischen Mengen/Metadaten, Warenkörbe und die hinterlegte amtliche Reihe. CSV enthält die gefilterten bestätigten Preisbeobachtungen, keine vollständige Datenbanksicherung. Für eine vollständige Betriebssicherung zusätzlich MySQL sichern (inklusive Benutzerkonto und Korrekturprotokoll).

JSON-Wiederherstellung funktioniert nur bei leerer Produkt-/Kaufsammlung und überschreibt keine vorhandenen Einkäufe. Das lokale Konto bleibt bestehen. Passwörter und Sitzungen werden nicht exportiert. Die interne Änderungshistorie ist bewusst nicht Teil des portablen JSON-Exports.

Demo-Preise sind künstlich. Für ein unverfälschtes echtes Archiv Demo in einer getrennten Testdatenbank ausprobieren. Keine amtlichen Daten werden als Demo erfunden.

## Tests

Mit aktivierter virtueller Umgebung im Projektordner:

```bash
python -m pytest
npm --prefix frontend run build
```

Die Backend-Tests verwenden eine isolierte SQLite-Datenbank. Eine MySQL-Installation ist für diese Tests nicht nötig. Für einen echten MySQL-Smoke-Test stehen `scripts/mysql-smoke.py` und die Docker-Konfiguration bereit. Der Smoke-Test legt einen Testbenutzer nur in einer eigens dafür eingerichteten leeren Testdatenbank an.

## Bewusste Grenzen dieser ersten Version

- Ein privates Konto/eine Datensammlung; keine Mehrhaushalts- oder öffentliche Plattform.
- EUR als einzige gespeicherte Währung; keine verdeckte Währungsumrechnung.
- Produkte haben flexible typisierte JSON-Werte, Kategorien und Tags; eine zentral administrierbare Merkmalsdefinition mit Regeln je Warengruppe ist noch nicht umgesetzt.
- Händler und Filialen stehen als historische Texte am Einkauf. Ein separater Händler-/Filialstamm mit Adressverwaltung und Dublettenauflösung ist ein weiterer Ausbauschritt.
- Produktgrößen stehen historisch an den Kaufpositionen. Eigene GTIN-/Varianten-Stammtabellen, Barcode-Scan und unscharfe KI-Katalogsuche sind noch nicht enthalten. Exakte bestätigte Bon-Aliasse werden bei der KI-Übernahme wiedererkannt.
- Belegweite Rabatte müssen vor Bestätigung manuell passend zugeordnet werden; keine automatische Verteilung ohne gesicherte Grundlage.
- Amtlicher Index wird manuell mit Quelle importiert. Kein automatischer Destatis-Abruf, keine Repräsentativitätsbehauptung für eigene Daten.
- Keine Umkreissuche oder PLZ-Gebietsgeometrien. Regionsvergleiche beziehen sich auf die explizit erfassten Orte und die aktuelle Stichprobe.
- Preisabfragen sind auf private Datenmengen ausgelegt. Größere Sammlungen benötigen SQL-seitige Aggregation und Pagination.

## Öffentlicher Betrieb

Die mitgelieferte Konfiguration bindet an localhost. Für öffentlichen Betrieb sind HTTPS-Reverse-Proxy, `COOKIE_SECURE=true`, ein stabiler eigener `SECRET_KEY`, ein bewusst eingerichtetes Konto, Backups und ein Schutz gegen massenhafte Login-/KI-Anfragen erforderlich. Datenbankzugang und API-Schlüssel gehören nie in Git oder Frontend-Dateien. Zunächst lokal ausprobieren und die dokumentierten Grenzen prüfen.
