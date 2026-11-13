# Quelltext lesen und manuell ändern

## Einstieg in 15 Minuten

1. `backend/inflation_app/normalization.py` lesen: eine Funktion bildet den fachlichen Kern der Mengen- und Preisumrechnung.
2. `backend/inflation_app/models.py` daneben öffnen: Das sind die gespeicherten Felder, nicht bloß Anzeigewerte.
3. `backend/inflation_app/purchases.py` ansehen: Eingaben werden geprüft, dann innerhalb einer Transaktion gespeichert.
4. `frontend/src/components/PurchaseEditor.tsx` öffnen: dieselben Felder erscheinen im Formular.
5. `frontend/src/pages/Comparisons.tsx` ansehen: API-Daten werden in Tabellen und Diagramme übersetzt.

Die Dateien sind regulärer Python-, TypeScript- und CSS-Quelltext. Ein Frontend-Build erzeugt zusätzlich optimierte Dateien in `frontend/dist`; zum Bearbeiten immer `frontend/src` verwenden. Der vollständige Originalquelltext ist im ZIP enthalten.

## Anfrage vom Browser zur Datenbank

Das React-Formular erstellt ein normales JSON-Objekt. `api.ts` fügt den CSRF-Token hinzu. Flask prüft in `auth.py` Anmeldung und Token. Die Route in `purchases.py` ruft die Fachlogik auf. `normalization.py` berechnet mit `Decimal`. SQLAlchemy speichert Original- und Vergleichswerte in MySQL. Die Antwort enthält Dezimalwerte als Strings. React formatiert sie nur zur Anzeige.

Die unverbindliche Sofortvorschau im Browser verwendet JavaScript-Zahlen. Die gespeicherte Berechnung erfolgt immer erneut im Backend; die Browser-Vorschau ist keine vertrauenswürdige Eingabe.

## Eine neue Produkteigenschaft ergänzen

Für ein einzelnes Produkt etwa `Herkunft: Deutschland` über die Merkmalsmaske hinterlegen. Neue Merkmale werden als benannte JSON-Werte gespeichert und benötigen keine neue Datenbankspalte. Zahl/Ja-Nein/Text bleiben unterscheidbar. Preisentscheidende Merkmale beim Vergleichen bewusst beachten: gleiche Einheit alleine bedeutet nicht gleiche Qualität.

Wenn ein Merkmal später stark gefiltert oder verbindlich validiert werden soll, eine zentrale Merkmalsdefinition oder eine eigene Spalte ergänzen. Die flexible Ablage ist keine Aufforderung, Zahlen wie Gewicht als beliebigen Text statt in den vorgesehenen Mengenfeldern zu speichern.

## Eine Vergleichseinheit ergänzen

1. Einheit in `validation.py` und den TypeScript-Einheiten in `types.ts` aufnehmen.
2. Dimension und Umrechnungsfaktor in `normalization.py` definieren.
3. Dieselbe Vergleichsbasis in `analytics.py` unter `BASKET_UNITS` hinterlegen.
4. Testfall mit konkreter Menge und erwartetem Preis in `backend/tests` schreiben.
5. Tests und Frontend-Build ausführen.

Keine Umrechnung zwischen Gewicht, Volumen und Stück ohne belastbaren produktbezogenen Faktor hinzufügen. Persistierte Mengen dürfen nicht zu null gerundet werden. Bestehende gespeicherte Beobachtungen werden nach einer Regeländerung nicht blind rückwirkend überschrieben.

## Ein dauerhaftes Datenbankfeld ergänzen

Beispiel: optionales `district` am Kaufvorgang.

1. Feld am `Purchase`-Modell ergänzen.
2. Validierung und Serialisierung in `purchases.py`/`models.py` ergänzen.
3. In TypeScript `Purchase` und das Formular erweitern.
4. CSV-/JSON-Import, Export, Wiederherstellung und Tests prüfen.
5. Im Backend Migration erzeugen und die erzeugte Datei lesen:

```bash
flask --app wsgi:app db migrate -m "Add optional district to purchases"
flask --app wsgi:app db upgrade
```

`db.create_all()` ist nur ein Schnellstart für neue lokale Datenbanken. Es ändert keine bestehenden Tabellen. Für bestehende Daten immer Migrationen verwenden. Vor Migrationen eine Sicherung anlegen.

## Preisberechnung und Statistik

- Positions-Warenbetrag = `line_total - discount`; Pfand ist separat.
- Normmenge = `quantity × package_size × Einheitenfaktor`.
- Vergleichspreis = Warenbetrag / Normmenge; bei Blatt zusätzlich auf 100 Blatt beziehen.
- Preisbeobachtungen berücksichtigen bestätigte Einkäufe, keine Retouren.
- Ausgaben berücksichtigen Retouren mit negativem Vorzeichen und schließen Pfand aus.
- Monats-, Filial- und Regionalwerte sind Mediane der beobachteten Grundpreise.
- Warenkorbkosten verwenden dieselben festen Mengen in beiden Perioden.

Ein höherer Gesamteinkaufspreis ist allein kein Inflationsnachweis. Auch Produktwechsel, Qualitätsunterschiede und andere Einkaufsmengen können ihn erklären.

## Strukturentscheidungen

Kein Microservice-System, kein versteckter Codegenerator. Flask-Blueprints trennen fachliche Aufgaben. Die größeren Module sind bewusst direkte, nachvollziehbare Funktionen; bei größerem Umfang können sie weiter zerlegt werden. Das Frontend nutzt lesbares CSS und eine kleine SVG-Diagrammkomponente statt mehrerer zusätzlicher UI-/Chart-Abstraktionen. SQLAlchemy und Alembic übernehmen Datenbankzugriff und Änderungen.

Redis/Celery ist in dieser ersten Version nicht erforderlich. Der KI-Request läuft mit Zeitlimit synchron, schreibt aber nie automatisch einen Kauf. Eine spätere Warteschlange kann das Extraktionsmodul aufrufen, ohne Preisberechnung und Formulare neu zu schreiben.
