"""Endpunkt-Tests mit echter Testdatenbank, Session und CSRF-Schutz."""

import io
import json


def product(client, headers, name="Kaffee"):
    response = client.post(
        "/api/products",
        json={
            "name": name,
            "unit": "g",
            "category": "Lebensmittel",
            "tags": ["Bedarf"],
            "attributes": {},
            "aliases": [],
        },
        headers=headers,
    )
    assert response.status_code == 201
    return response.json["id"]


def purchase_payload(product_id, date="2026-10-01", price="5.00"):
    return {
        "purchased_at": date,
        "merchant": "Markt",
        "branch": "Filiale 1",
        "city": "Dresden",
        "postal_code": "01067",
        "country": "DE",
        "channel": "store",
        "currency": "EUR",
        "status": "confirmed",
        "notes": "Test",
        "items": [
            {
                "product_id": product_id,
                "raw_name": "Kaffee",
                "quantity": "2",
                "package_size": "500",
                "unit": "g",
                "line_total": price,
                "discount": "0",
                "deposit": "0",
                "is_offer": False,
                "is_return": False,
                "attributes": {},
            }
        ],
    }


def test_atomic_batch_rolls_back_earlier_valid_purchases(client, headers):
    identifier = product(client, headers)
    good = purchase_payload(identifier)
    bad = purchase_payload(identifier, date="not-a-date")
    result = client.post(
        "/api/import/commit", json={"purchases": [good, bad]}, headers=headers
    )
    assert result.status_code == 400
    assert client.get("/api/purchases").json == []


def test_export_restore_retains_snapshot_and_postcode(client, headers, app):
    identifier = product(client, headers)
    created = client.post(
        "/api/purchases", json=purchase_payload(identifier), headers=headers
    )
    assert created.status_code == 201
    backup = client.get("/api/export/json").json
    from inflation_app.models import db, Product, Purchase

    with app.app_context():
        for entry in db.session.scalars(db.select(Purchase)):
            db.session.delete(entry)
        db.session.flush()
        for entry in db.session.scalars(db.select(Product)):
            db.session.delete(entry)
        db.session.commit()
    restored = client.post(
        "/api/restore",
        data={"file": (io.BytesIO(json.dumps(backup).encode()), "backup.json")},
        headers=headers,
    )
    assert restored.status_code == 200, restored.json
    row = client.get("/api/purchases").json[0]
    assert row["postal_code"] == "01067"
    assert row["items"][0]["comparison_price"] == "5.000000"
    assert row["items"][0]["product_snapshot"]["name"] == "Kaffee"


def test_receipt_without_key_is_honest_and_requires_consent(
    client, headers, monkeypatch
):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = client.post(
        "/api/receipts/extract",
        data={"file": (io.BytesIO(b"image"), "receipt.png")},
        headers=headers,
    )
    assert result.status_code == 400
    result = client.post(
        "/api/receipts/extract",
        data={"consent": "true", "file": (io.BytesIO(b"image"), "receipt.png")},
        headers=headers,
    )
    assert result.status_code == 503
    assert "OPENAI_API_KEY" in result.json["error"]


def test_api_filters_and_basket_are_consistent(client, headers):
    identifier = product(client, headers)
    for period, price in [("2026-09-01", "5"), ("2026-10-01", "6.25")]:
        assert (
            client.post(
                "/api/purchases",
                json=purchase_payload(identifier, period, price),
                headers=headers,
            ).status_code
            == 201
        )
    query = "?from=2026-10-01&to=2026-10-31&postal_code=01067"
    rows = client.get("/api/observations" + query).json
    report = client.get("/api/analytics" + query).json
    assert len(rows) == report["summary"]["observation_count"] == 1
    assert report["regions"][0]["postal_code"] == "01067"
    basket = client.post(
        "/api/baskets",
        json={
            "name": "Mein Korb",
            "items": [{"product_id": identifier, "quantity": "500", "unit": "g"}],
        },
        headers=headers,
    )
    assert basket.status_code == 201, basket.json
    comparison = client.post(
        f"/api/baskets/{basket.json['id']}/compare",
        json={
            "base_from": "2026-09-01",
            "base_to": "2026-09-30",
            "current_from": "2026-10-01",
            "current_to": "2026-10-31",
        },
        headers=headers,
    )
    assert comparison.status_code == 200, comparison.json
    assert comparison.json["index"] == "125.00"


def test_demo_is_explicit_and_does_not_mix_with_real_data(client, headers):
    result = client.post("/api/demo", json={}, headers=headers)
    assert result.status_code == 200, result.json
    assert result.json["created"] == 12
    assert all("DEMO" in p["notes"] for p in client.get("/api/purchases").json)
    assert client.post("/api/demo", json={}, headers=headers).status_code == 409


def test_summary_subtracts_return_without_making_it_a_price_observation(
    client, headers
):
    identifier = product(client, headers)
    normal = purchase_payload(identifier, price="5")
    assert (
        client.post("/api/purchases", json=normal, headers=headers).status_code == 201
    )
    returned = purchase_payload(identifier, "2026-10-02", "2")
    returned["items"][0]["is_return"] = True
    assert (
        client.post("/api/purchases", json=returned, headers=headers).status_code == 201
    )
    report = client.get("/api/analytics").json
    assert report["summary"]["total_spend"] == "3.00"
    assert report["summary"]["observation_count"] == 1


def test_invalid_official_series_returns_validation_error(client, headers):
    result = client.put(
        "/api/official-index",
        json={"source": "Destatis", "base_year": "2020", "series": [None]},
        headers=headers,
    )
    assert result.status_code == 400


def test_import_preview_finds_duplicates_and_rejects_full_backup(client, headers):
    identifier = product(client, headers)
    payload = purchase_payload(identifier)
    assert (
        client.post("/api/purchases", json=payload, headers=headers).status_code == 201
    )
    preview = client.post(
        "/api/import/preview",
        json={"format": "json", "content": json.dumps([payload])},
        headers=headers,
    )
    assert preview.status_code == 200
    assert preview.json["duplicate_ids"]
    backup = client.get("/api/export/json").json
    result = client.post(
        "/api/import/preview",
        json={"format": "json", "content": json.dumps(backup)},
        headers=headers,
    )
    assert result.status_code == 400


def test_restore_malformed_objects_returns_400_and_remains_empty(client, headers):
    malformed = {
        "schema_version": 1,
        "products": [None],
        "purchases": [],
        "baskets": [],
    }
    result = client.post(
        "/api/restore",
        data={"file": (io.BytesIO(json.dumps(malformed).encode()), "bad.json")},
        headers=headers,
    )
    assert result.status_code == 400
    assert client.get("/api/products").json == []


def test_basket_rejects_more_precision_than_database_can_store(client, headers):
    identifier = product(client, headers)
    result = client.post(
        "/api/baskets",
        json={
            "name": "Korb",
            "items": [
                {"product_id": identifier, "quantity": "0.0000000000001", "unit": "g"}
            ],
        },
        headers=headers,
    )
    assert result.status_code == 400


def test_import_accepts_decimal_comma_in_edited_receipt(client, headers):
    payload = purchase_payload(None, price="5,00")
    response = client.post(
        "/api/import/commit", json={"purchases": [payload]}, headers=headers
    )
    assert response.status_code == 201, response.json
    assert client.get("/api/purchases").json[0]["items"][0]["line_total"] == "5"


def test_import_ignores_legacy_receipt_total(client, headers):
    payload = purchase_payload(None, price="7.25")
    payload["receipt_total"] = "8.00"
    result = client.post(
        "/api/import/commit", json={"purchases": [payload]}, headers=headers
    )
    assert result.status_code == 201, result.json
    assert "receipt_total" not in client.get("/api/purchases").json[0]
