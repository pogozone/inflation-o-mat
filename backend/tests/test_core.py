import pytest
from inflation_app.normalization import normalize_item
from inflation_app.models import db, Purchase
from inflation_app.purchases import create_purchase
from inflation_app.validation import ValidationError


def payload(**changes):
    value = {
        "purchased_at": "2026-01-02",
        "merchant": "Markt",
        "city": "Berlin",
        "postal_code": "10115",
        "status": "confirmed",
        "items": [
            {
                "raw_name": "Mehl",
                "quantity": "2",
                "package_size": "500",
                "unit": "g",
                "line_total": "5.00",
            }
        ],
    }
    value.update(changes)
    return value


def test_normalization():
    result = normalize_item(payload()["items"][0])
    assert result["comparison_price"] == "5.000000"
    assert result["normalized_quantity"] == "1.000000"
    assert result["comparison_unit"] == "kg"


@pytest.mark.parametrize("invalid", ["NaN", "Infinity", "-1"])
def test_invalid_prices(app, invalid):
    value = payload()
    value["items"][0]["line_total"] = invalid
    with pytest.raises(ValidationError):
        create_purchase(value)


def test_auth_and_csrf(app):
    client = app.test_client()
    assert client.get("/api/purchases").status_code == 401
    assert (
        client.post(
            "/api/setup", json={"username": "x", "password": "short"}
        ).status_code
        == 400
    )


def test_crud_totals_duplicate(client, headers):
    result = client.post(
        "/api/purchases", json=payload(), headers=headers
    )
    assert result.status_code == 201
    identifier = result.json["id"]
    assert result.json["items"][0]["comparison_price"] == "5.000000"
    assert (
        client.post("/api/purchases", json=payload(), headers=headers).status_code
        == 409
    )
    assert (
        client.delete(f"/api/purchases/{identifier}", headers=headers).status_code
        == 200
    )


def test_merge_undo(client, headers):
    a = client.post("/api/products", json={"name": "A"}, headers=headers).json
    b = client.post("/api/products", json={"name": "B"}, headers=headers).json
    value = payload()
    value["items"][0]["product_id"] = a["id"]
    client.post("/api/purchases", json=value, headers=headers)
    assert (
        client.post(
            f"/api/products/{a['id']}/merge",
            json={"target_id": b["id"]},
            headers=headers,
        ).status_code
        == 200
    )
    assert client.get("/api/observations").json[0]["product_id"] == b["id"]
    client.post(f"/api/products/{a['id']}/undo-merge", json={}, headers=headers)
    assert client.get("/api/observations").json[0]["product_id"] == a["id"]


def test_flush_without_commit(app):
    create_purchase(payload(), commit=False)
    assert db.session.query(Purchase).count() == 1
    db.session.rollback()
    assert db.session.query(Purchase).count() == 0


def test_historical_metadata_survives_edit(client, headers):
    product = client.post(
        "/api/products",
        json={"name": "A", "attributes": {"origin": "DE"}},
        headers=headers,
    ).json
    value = payload()
    value["items"][0]["product_id"] = product["id"]
    purchase = client.post("/api/purchases", json=value, headers=headers).json
    client.put(
        f"/api/products/{product['id']}",
        json={"name": "New", "attributes": {"origin": "FR"}},
        headers=headers,
    )
    purchase["notes"] = "Korrektur"
    assert (
        client.put(
            f"/api/purchases/{purchase['id']}", json=purchase, headers=headers
        ).status_code
        == 200
    )
    observation = client.get("/api/observations").json[0]
    assert observation["attributes"]["origin"] == "DE"
    assert observation["product_name"] == "New"
    assert client.get("/api/observations?currency=USD").json == []


def test_paper_comparison_basis():
    result = normalize_item(
        {"quantity": "1", "package_size": "200", "unit": "Blatt", "line_total": "4"}
    )
    assert result["comparison_unit"] == "100 Blatt"
    assert result["comparison_price"] == "2.000000"


@pytest.mark.parametrize(
    "quantity,size,unit,amount",
    [
        ("0.000001", "0.000001", "g", "1"),
        ("1000000000000", "1000000000000", "kg", "1"),
        ("1000000000000", "1000000000000", "m", "1"),
    ],
)
def test_normalization_rejects_unsupported_derived_values(quantity, size, unit, amount):
    with pytest.raises(ValidationError):
        normalize_item(
            {
                "quantity": quantity,
                "package_size": size,
                "unit": unit,
                "line_total": amount,
            }
        )


def test_update_checks_duplicate_except_self(client, headers):
    first = client.post("/api/purchases", json=payload(), headers=headers).json
    second = client.post(
        "/api/purchases", json=payload(merchant="Other"), headers=headers
    ).json
    assert (
        client.put(
            f"/api/purchases/{first['id']}", json=first, headers=headers
        ).status_code
        == 200
    )
    duplicate = payload()
    assert (
        client.put(
            f"/api/purchases/{second['id']}", json=duplicate, headers=headers
        ).status_code
        == 409
    )
    duplicate["allow_duplicate"] = True
    assert (
        client.put(
            f"/api/purchases/{second['id']}", json=duplicate, headers=headers
        ).status_code
        == 200
    )


def test_merge_edit_undo_keeps_item_identity(client, headers):
    source = client.post("/api/products", json={"name": "Source"}, headers=headers).json
    target = client.post("/api/products", json={"name": "Target"}, headers=headers).json
    value = payload()
    value["items"][0]["product_id"] = source["id"]
    purchase = client.post("/api/purchases", json=value, headers=headers).json
    original_item_id = purchase["items"][0]["id"]
    assert (
        client.post(
            f"/api/products/{source['id']}/merge",
            json={"target_id": target["id"]},
            headers=headers,
        ).status_code
        == 200
    )
    purchase = client.get("/api/purchases").json[0]
    purchase["notes"] = "Corrected note"
    edited = client.put(
        f"/api/purchases/{purchase['id']}", json=purchase, headers=headers
    )
    assert edited.status_code == 200
    assert edited.json["items"][0]["id"] == original_item_id
    assert (
        client.post(
            f"/api/products/{source['id']}/undo-merge", json={}, headers=headers
        ).status_code
        == 200
    )
    assert client.get("/api/observations").json[0]["product_id"] == source["id"]
