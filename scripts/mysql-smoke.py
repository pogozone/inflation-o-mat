"""Optionaler echter MySQL-Test in einer explizit LEEREN *_test-Datenbank.

Aufruf nach Anlegen einer separaten Testdatenbank und Aktivieren der .venv:
MYSQL_TEST_DATABASE_URL='mysql+pymysql://.../inflation_test' python scripts/mysql-smoke.py
Windows: Umgebungsvariable vor dem Aufruf in PowerShell setzen.
Es werden keine bestehenden Tabellen gelöscht. Testdaten bleiben zur Inspektion.
"""

import os
import secrets
import sys
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.engine import make_url

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from inflation_app import create_app
from inflation_app.models import db

database_url = os.environ.get("MYSQL_TEST_DATABASE_URL", "")
if not database_url:
    raise SystemExit(
        "MYSQL_TEST_DATABASE_URL muss auf eine eigene leere *_test-Datenbank zeigen."
    )
parsed = make_url(database_url)
if parsed.get_backend_name() != "mysql" or not (parsed.database or "").endswith(
    "_test"
):
    raise SystemExit(
        "Aus Sicherheitsgründen ist nur MySQL mit Datenbankname *_test zulässig."
    )
app = create_app(
    {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": database_url,
        "SECRET_KEY": secrets.token_hex(32),
    }
)
with app.app_context():
    if inspect(db.engine).get_table_names():
        raise SystemExit(
            "Die Testdatenbank ist nicht leer. Keine Änderungen ausgeführt."
        )
    db.create_all()
client = app.test_client()
token = client.get("/api/session").json["csrf_token"]
result = client.post(
    "/api/setup",
    json={"username": "smoke-test", "password": secrets.token_urlsafe(24)},
    headers={"X-CSRF-Token": token},
)
assert result.status_code == 200, "Setup fehlgeschlagen"
headers = {"X-CSRF-Token": result.json["csrf_token"]}
created = client.post(
    "/api/products", json={"name": "TEST Kaffee", "unit": "g"}, headers=headers
)
assert created.status_code == 201, created.json
purchase = client.post(
    "/api/purchases",
    json={
        "purchased_at": "2026-01-01",
        "merchant": "TEST",
        "city": "Dresden",
        "postal_code": "01067",
        "country": "DE",
        "currency": "EUR",
        "status": "confirmed",
        "notes": "MYSQL SMOKE TEST",
        "items": [
            {
                "product_id": created.json["id"],
                "raw_name": "TEST Kaffee",
                "quantity": "2",
                "package_size": "500",
                "unit": "g",
                "line_total": "5.00",
            }
        ],
    },
    headers=headers,
)
assert purchase.status_code == 201, purchase.json
assert purchase.json["items"][0]["comparison_price"] == "5.000000"
assert (
    client.get("/api/analytics?postal_code=01067").json["summary"]["observation_count"]
    == 1
)
assert client.get("/api/export/json").json["purchases"][0]["postal_code"] == "01067"
print(
    "MySQL-Smoke-Test bestanden. Testdaten bleiben in der separaten *_test-Datenbank."
)
