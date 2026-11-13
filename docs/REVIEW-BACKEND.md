> Historische Review-Befunde. Die bestätigten wichtigen Probleme wurden nach dieser Review behoben. Aktueller Prüfstand: VERIFICATION.md und Tests.

# Backend-Review

Stand: 2026-11-02. Read-only-Review gegen API-CONTRACT.md und IMPLEMENTATION-PLAN.md; keine Implementierung geändert. Die bereits grüne Gesamtsuite wurde nicht wiederholt. Drei gezielte In-Memory-Proben mit `venv/bin/python` bestätigen die folgenden Befunde. MySQL stand nicht zur Laufzeitprüfung zur Verfügung.

## P1: Abgeleitete Dezimalwerte passen nicht zuverlässig ins Datenbankschema

**Ort:** `backend/inflation_app/normalization.py:50-54`, `validation.py:26-27`; Zielspalten `models.py` sind `Numeric(36,12)`.

Die Eingaben sind einzeln begrenzt, ihre Produkte und Quotienten jedoch nicht. Akzeptierte `quantity=1000000000000`, `package_size=1000000000000`, `unit=kg` ergeben eine normalisierte Menge von `1000000000000000000000000.000000`. Das überschreitet die 24 Ganzzahlstellen von DECIMAL(36,12). Akzeptierte Mengen `quantity=0.000000000001`, `package_size=0.000000000001`, `unit=g`, `line_total=1000000000000` ergeben einen Vergleichspreis von 10^39. MySQL kann diese Werte nicht korrekt speichern; je nach SQL-Modus resultiert ein Fehler oder ein begrenzter Wert. SQLite ersetzt keine Prüfung dieser Grenzen.

Zusätzlich wird bereits vor Speicherung auf sechs Nachkommastellen gerundet: `quantity=1`, `package_size=0.000001`, `unit=g`, `line_total=1` liefert `normalized_quantity=0.000000`, aber `comparison_price=1000000000.000000` und `calculation_status=ok`. Eine positive Originalmenge wird damit als Nullmenge veröffentlicht.

**Empfehlung/Test:** Abgeleitete Größen vor dem Schreiben gegen die tatsächliche Datenbankpräzision prüfen; positive Mengen dürfen nicht durch Quantisierung Null werden. Original- und interne Rechenpräzision von Anzeigeformatierung trennen. Grenzfälle oben über Kauf-POST prüfen; außerhalb des darstellbaren Bereichs einen verständlichen 400-Fehler erwarten, innerhalb des Bereichs eine positive Menge und konsistente Grundpreisrechnung. Ein MySQL-Integrationstest bleibt erforderlich.

## P1: Kaufbearbeitung zerstört die Referenzen für Merge-Rücknahme

**Ort:** `backend/inflation_app/purchases.py:186`, in Verbindung mit `products.py:95` und `products.py:108-113`.

Ein Merge merkt sich die IDs der betroffenen Kaufpositionen. Jede Kaufbearbeitung ersetzt jedoch sämtliche Positionen durch neue Datensätze, selbst wenn nur die Kaufnotiz geändert wird. Die anschließende Merge-Rücknahme findet die gespeicherten Positionen nicht mehr und meldet trotzdem Erfolg; die betroffenen Käufe bleiben dem Zielprodukt zugeordnet. Anschließend wird auch die Merge-Historie gelöscht.

**Bestätigte Reproduktion:** Produkt A mit Kaufposition ID 1 anlegen; A nach B zusammenführen; denselben Kauf unverändert per PUT speichern; A zurückführen. Die Position hatte danach ID 4 und weiterhin `product_id=B`, erwartet wäre A. Damit verändern alltägliche Korrekturen die spätere Produkthistorie dauerhaft.

**Empfehlung/Test:** Vorhandene Positionen anhand stabiler IDs aktualisieren und nur echte neue/gelöschte Positionen erzeugen/entfernen, oder Merge-Provenienz ausdrücklich auf Ersatzpositionen übertragen. Regressionstest: Merge → Kaufnotiz ändern → Undo → ursprüngliche Zuordnung und historischer Snapshot wiederhergestellt.

## P2: PUT umgeht die Dublettenprüfung

**Ort:** `backend/inflation_app/purchases.py:172-176`; die Prüfung existiert ausschließlich in `create_purchase`, Zeilen 150-158.

Zwei unterschiedliche Käufe lassen sich zunächst legal anlegen. Wird der zweite anschließend auf die Daten des ersten geändert, akzeptiert PUT die Änderung ohne 409 oder ausdrückliches `allow_duplicate`. Die Probe ergab zwei gespeicherte Käufe mit identischem Fingerprint. Das kann Beobachtungen, Mediane und Ausgabensummen unbemerkt doppelt zählen.

**Empfehlung/Test:** Dieselbe Fingerprintprüfung vor Änderungen durchführen, dabei den bearbeiteten Kauf ausschließen und die dokumentierte ausdrückliche Dublettenfreigabe berücksichtigen. Regressionstest mit zwei Käufen an verschiedenen Tagen; PUT des zweiten auf das Datum des ersten muss 409 liefern und seinen bisherigen Zustand erhalten. Unverändertes Speichern des ersten darf keinen Eigenkonflikt auslösen.

## Weitere Bewertung und Grenzen

- Der gemeinsame `before_request`-Schutz verlangt eine gültige Anmeldung für Datenendpunkte und vergleicht CSRF-Tokens bei schreibenden Requests. Hier wurde kein konkreter Umgehungsweg gefunden.
- Import und Restore verwenden eine gemeinsame Transaktion mit Rollback bei Fehlern; keine erkennbare Zwischen-Commit-Lücke. Restore behandelt fehlerhafte verschachtelte Typen allerdings stellenweise als ungefangenen Python-Fehler statt als dokumentierten JSON-Validierungsfehler; gezielt etwa `products:[null]` prüfen. Das ist ein nachrangiger Fehler der Fehlermeldung, kein belegter Teilimport.
- Monatsmediane und Warenkörbe trennen Vergleichseinheiten. Rückgaben werden aus Preisbeobachtungen ausgeschlossen und bei Ausgaben gegengerechnet. Datums-, Stadt- und PLZ-Filter werden aus demselben Beobachtungsdienst angewandt.
- Warenkorbmengen verwenden eine andere Dezimalvalidierung (`analytics.py:95-104`) ohne Skalenprüfung. Mengen unter 10^-12 können beim Speichern in `Numeric(36,12)` auf Null fallen und einen späteren Vergleich scheitern lassen. Die Präzisionskorrektur aus P1 sollte diese Eingabestelle und Restore ebenfalls einschließen.
- Historische Produktmerkmale werden bei Stammdatenänderungen als Snapshot erhalten. Die oben beschriebene Positionsersetzung gefährdet jedoch die separat gespeicherte Merge-Provenienz.
- Die dokumentierte synchrone KI-Anfrage ist für den vereinbarten v1-Umfang kein Reviewfehler. Echte MySQL-Laufzeitprüfung, externe KI-Erreichbarkeit und produktive Lastprüfung sind durch dieses Review nicht nachgewiesen.
