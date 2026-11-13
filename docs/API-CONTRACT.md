# Inflation-o-mat: verbindliche Schnittstelle der ersten Version

Flask-Backend, React/TypeScript/Vite-Frontend, SQLAlchemy, MySQL/InnoDB. SQLite ausschließlich für lokalen Schnellstart/Tests. Deutsche Oberfläche. Preise über API als Dezimalstrings. API unter /api. Cookie-Session, CSRF für schreibende Aufrufe (Header X-CSRF-Token). Gleiche Domain. Keine JWT erforderlich.

## Authentifizierung
GET /api/session → {authenticated:boolean, csrf_token:string, setup_required:boolean, username:string|null}
POST /api/setup {username,password} → session object. Nur wenn kein Benutzer existiert. Passwort >=12 Zeichen. POST /api/login {username,password}; POST /api/logout {}.
Fehler immer {error:string, details?:object}; HTTP 400 Validierung, 401 Anmeldung fehlt, 409 Dublette.

## Produkt
GET /api/products → Product[]; POST /api/products → Product; PUT /api/products/<id> → Product.
Product: {id:number,name:string,brand:string,category:string,tags:string[],attributes:Record<string,string|number|boolean>,aliases:string[],unit:string}.
POST /api/products/<id>/merge {target_id:number}; POST /api/products/<id>/undo-merge {}. Historie erhalten. Basis- und Zielprodukt nicht löschen.
Produkt-Payload ohne id. unit aus g,kg,ml,l,Stück,m,m²,Blatt,Waschladung; Kategorie/Tags frei. Zusätzliche Merkmale bleiben erhalten.

## Kauf
GET /api/purchases → Purchase[]; POST /api/purchases → Purchase; PUT /api/purchases/<id> → Purchase; DELETE /api/purchases/<id> → {ok:true}.
GET /api/observations?from=YYYY-MM-DD&to=...&city=...&postal_code=...&merchant=...&product_id=...&category=...&tag=...&include_offers=true|false → Observation[]. Filter kombinierbar, Datum inklusiv. Bestätigte Käufe, keine Retouren.
Purchase: {id,purchased_at:'YYYY-MM-DD',merchant,branch,city,postal_code,country:'DE',channel:'store'|'online',currency:'EUR',status:'draft'|'confirmed',notes:string,items:Item[],created_at, fingerprint:string}.
PurchasePayload: gleiche schreibbare Felder ohne id/created_at/fingerprint; zusätzlich allow_duplicate?:boolean.
Item: {id?,product_id:number|null,raw_name:string,quantity:string,package_size:string|null,unit:string,line_total:string,discount:string,deposit:string,is_offer:boolean,is_return:boolean,attributes:object,normalized_quantity:string|null,normalized_unit:string|null,comparison_price:string|null,comparison_unit:string|null,calculation_status:string}.
quantity = Packungszahl, package_size = Inhalt je Packung. Bei loser Ware quantity=1, package_size=Gesamtgewicht. unit=Stück erlaubt package_size=1. line_total = Warenpositionspreis VOR positionsbezogenem discount, OHNE deposit, inklusive Steuer. Endgültiger Warenbetrag=line_total-discount. Preisbeispiel zwei 500g-Packungen: quantity=2, package_size=500, unit=g,line_total=5.00,discount=0,deposit=0. comparison_price=5.000000 und comparison_unit=kg. In Summe Warenbetrag+deposit; Retouren ziehen diesen Betrag ab. city und postal_code für confirmed/store erforderlich, draft/online unbekannt erlaubt. country ISO2. Keine geschätzten Standorte. Einkaufssnapshot unabhängig vom Händlerstamm. Übernahme unbekannter Produktzuordnung erlaubt, aber kein erfundener Match.
Observation: {id,purchase_id,product_id,product_name,category,tags,attributes,brand,purchased_at,merchant,branch,city,postal_code,country,channel,currency,quantity,normalized_quantity,normalized_unit,comparison_price,comparison_unit,line_total,discount,deposit,is_offer}. Dezimalwerte Strings/null.

## Import (Agent root implementiert)
POST /api/import/preview multipart file (CSV,JSON) oder JSON {format:'json'|'csv',content:string,mapping?:Record<string,string>,delimiter?:string} → {purchases:PurchasePayload[],warnings:string[],errors:string[],duplicate_ids:number[],source_hash:string}. CSV Header-Mapping von kanonischem Feld zu Eingabespalte. CSV eine Zeile je Position, purchase_key Pflicht bei mehreren Vorgängen; falls fehlend Vorschau als EIN Kauf mit Warnung und verpflichtender Bestätigung. Keys purchased_at,merchant,branch,city,postal_code,country,raw_name,quantity,package_size,unit,line_total,discount,deposit,product_id.
POST /api/import/commit {purchases:PurchasePayload[],allow_duplicates?:boolean} → {created:number,ids:number[]}; atomar.
POST /api/receipts/extract multipart file + consent='true' → {purchases:PurchasePayload[],warnings:string[],errors:string[],source_hash:string}; ohne Key 503. Echte OpenAI-Anbindung, Bildgrößenlimit, keine Behauptung bereits bestätigter Einkäufe. Extraktion als editierbarer Entwurf mit sichtbaren Unsicherheiten. PDF nicht in v1. POST nie automatisch commit.

## Auswertung (Agent root implementiert)
GET /api/analytics?gleiche Filter → {summary:{purchase_count,observation_count,total_spend:string,product_count},market_monthly:[{month,merchant,branch,country,city,postal_code,product_id,product_name,comparison_unit,median_price,count}],monthly:[{month,product_id,product_name,comparison_unit,median_price:string,count:number}],regions:[{city,postal_code,product_id,product_name,comparison_unit,median_price:string,count,branch_count,last_date}],markets:[{merchant,branch,product_id,product_name,comparison_unit,median_price:string,count,last_date}],changes:[{product_id,product_name,comparison_unit,first_price,last_price,change_percent,count}],all strings für Dezimalwerte}. Monatsmediane je Produkt+Einheit; keine Vermischung.
GET /api/baskets → Basket[]; POST /api/baskets {name,items:[{product_id,quantity:string,unit:string}]} → Basket; DELETE /api/baskets/<id>.
POST /api/baskets/<id>/compare {base_from,base_to,current_from,current_to} → {complete:boolean,index:string|null,change_percent:string|null,base_cost:string|null,current_cost:string|null,coverage_percent:string,missing:string[],items:object[]}. Median je Produkt, identische Einheiten, keine Fortschreibung.
GET /api/official-index → {series:[{period,index_value:string}],source:string,base_year:string}; PUT /api/official-index {series:[...],source,base_year}. Validierte manuell importierte amtliche Reihe; keine erfundenen Werte.

## Datentransfer
GET /api/export/json → vollständiger strukturierter versionierter Export {schema_version:1,products:[],purchases:[],baskets:[],official_index:{...}}.
GET /api/export/csv → CSV (Schutz vor Formelinjektion).
POST /api/restore multipart file → vollständigen Export wiederherstellen, nur in leere Datenbank (Benutzer bleibt); transaktional. Konflikt 409.
POST /api/demo {} → {created:number}. Nur leere Kaufdatenbank; Demo-Markierung in notes und Hinweis Frontend. Niemals automatisch in reale Daten mischen.
GET /api/health → {status:'ok',database:string,ai_configured:boolean}.

## Frontend-Umfang
Ruhiges Editorial-/Finanzdashboard: cremeweißer Hintergrund, dunkles Petrol, orange Akzentfarbe, große Zahlen, klare Tabellen. Navigation Übersicht, Einkäufe, Produkte, Vergleiche, Warenkorb, Import & Export. Vollständig responsive. Kein externer CDN notwendig. Preisgrafik mit zugänglicher Tabelle. Auth/setup flow. API-Fehler sichtbar. Eingabemasken mit Zeilenpositionen und live unverbindlicher Grundpreisvorschau. Importprüfung lässt JSON als gut lesbares Fallback editieren; besser Formular. Regionalfilter und Produktfilter. API-Client zentral, kein localStorage für Einkaufsdaten. React-Dateien nach Aufgaben getrennt, keine Minified-Quelldateien. README erklärt jede Datei.

## Tatsächlich gelieferter Stand
Der finale Quelltext und README sind für Implementierungsdetails maßgeblich. Normalisierte Masse/Volumen werden als kg/l gespeichert; Originaleinheiten bleiben erhalten. Historische Ortsdaten stehen direkt am Kauf, kein separater Filialstamm. Vergleichspreis für Blatt gilt je 100 Blatt. KI synchron mit Zeitlimit, Bilder nicht dauerhaft gespeichert.
