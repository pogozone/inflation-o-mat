"""Portabler Export, atomare Wiederherstellung und ausdrücklich geladene Demo."""

import csv
import io
import json
from datetime import date

from flask import Blueprint, Response, jsonify, request

from .models import Basket, BasketItem, Product, Purchase, Setting, db
from .products import product_data
from .purchases import create_purchase, filtered_observations
from .validation import ValidationError

transfer_bp = Blueprint("transfer", __name__, url_prefix="/api")


def safe_csv_value(value):
    """Text darf in Excel/LibreOffice keine Formel auslösen."""
    text = "" if value is None else str(value)
    if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(
        ("\t", "\r", "\n")
    ):
        return "'" + text
    return text


def full_export():
    products = []
    for product in db.session.scalars(db.select(Product).order_by(Product.id)):
        products.append(
            {
                **product.to_dict(),
                "merged_into_id": product.merged_into_id,
                "merge_history": product.merge_history,
            }
        )
    official = db.session.get(Setting, "official_index")
    return {
        "schema_version": 1,
        "products": products,
        "purchases": [
            p.to_dict()
            for p in db.session.scalars(db.select(Purchase).order_by(Purchase.id))
        ],
        "baskets": [
            b.to_dict()
            for b in db.session.scalars(db.select(Basket).order_by(Basket.id))
        ],
        "official_index": official.value
        if official
        else {"series": [], "source": "", "base_year": ""},
    }


@transfer_bp.get("/export/json")
def export_json():
    content = json.dumps(full_export(), ensure_ascii=False, indent=2, allow_nan=False)
    return Response(
        content,
        mimetype="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="inflation-o-mat_sicherung.json"'
        },
    )


@transfer_bp.get("/export/csv")
def export_csv():
    rows = filtered_observations(request.args)
    columns = [
        "purchased_at",
        "merchant",
        "branch",
        "city",
        "postal_code",
        "country",
        "product_id",
        "product_name",
        "comparison_price",
        "comparison_unit",
        "normalized_quantity",
        "normalized_unit",
        "line_total",
        "discount",
        "deposit",
        "currency",
        "purchase_id",
    ]
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(columns)
    for row in rows:
        writer.writerow([safe_csv_value(row.get(key)) for key in columns])
    return Response(
        "\ufeff" + buffer.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="inflation-o-mat_preisbeobachtungen.csv"'
        },
    )


def restore_export(data):
    """Referenzen werden explizit umgeschlüsselt, niemals blind überschrieben."""
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise ValidationError("Eine Sicherung mit schema_version 1 wird benötigt.")
    for key in ("products", "purchases", "baskets"):
        if not isinstance(data.get(key), list):
            raise ValidationError(f"Sicherung enthält keine gültige Liste {key}.")
        if len(data[key]) > 10000:
            raise ValidationError(
                "Sicherung überschreitet das Importlimit (10.000 Einträge je Liste)."
            )
    if any(
        db.session.scalar(db.select(model.id).limit(1))
        for model in (Product, Purchase, Basket)
    ):
        raise ValidationError(
            "Wiederherstellung ist nur in einer leeren Datensammlung möglich. Bestehende Daten zuerst sichern.",
            status=409,
        )
    product_map, item_map = {}, {}
    try:
        for entry in data["products"]:
            if not isinstance(entry, dict):
                raise ValidationError("Jedes Produkt muss ein Objekt sein.")
            old_id = entry.get("id")
            if (
                not isinstance(old_id, int)
                or isinstance(old_id, bool)
                or old_id in product_map
            ):
                raise ValidationError(
                    "Produkt-IDs in der Sicherung müssen eindeutige Ganzzahlen sein."
                )
            product = Product(**product_data(entry))
            db.session.add(product)
            db.session.flush()
            product_map[old_id] = product.id
        for saved in data["purchases"]:
            if not isinstance(saved, dict) or not isinstance(saved.get("items"), list):
                raise ValidationError("Jeder Kauf benötigt ein Objekt mit Positionen.")
            payload = {**saved, "items": []}
            for saved_item in saved.get("items", []):
                if not isinstance(saved_item, dict):
                    raise ValidationError("Jede Kaufposition muss ein Objekt sein.")
                item = dict(saved_item)
                old_product_id = item.get("product_id")
                if old_product_id is not None and old_product_id not in product_map:
                    raise ValidationError(
                        "Eine Kaufposition verweist auf ein fehlendes Produkt."
                    )
                item["product_id"] = product_map.get(old_product_id)
                payload["items"].append(item)
            purchase = create_purchase(payload, commit=False, allow_duplicate=True)
            purchase.created_at = saved.get("created_at") or purchase.created_at
            for item, saved_item in zip(purchase.items, saved["items"]):
                snapshot = saved_item.get("product_snapshot")
                if isinstance(snapshot, dict):
                    item.product_snapshot = {
                        **snapshot,
                        "id": product_map.get(snapshot.get("id"), item.product_id),
                    }
                if "id" in saved_item:
                    item_map[saved_item["id"]] = item.id
        for saved in data["baskets"]:
            if not isinstance(saved, dict) or not isinstance(saved.get("items"), list):
                raise ValidationError("Jeder Warenkorb benötigt eine Liste Positionen.")
            basket = Basket(name=str(saved.get("name", "Warenkorb"))[:255])
            for entry in saved.get("items", []):
                if not isinstance(entry, dict):
                    raise ValidationError(
                        "Jede Warenkorbposition muss ein Objekt sein."
                    )
                from .analytics import BASKET_UNITS, positive_decimal

                if (
                    entry.get("product_id") not in product_map
                    or entry.get("unit") not in BASKET_UNITS
                ):
                    raise ValidationError(
                        "Ungültige Warenkorbreferenz in der Sicherung."
                    )
                basket.items.append(
                    BasketItem(
                        product_id=product_map[entry["product_id"]],
                        quantity=positive_decimal(entry["quantity"]),
                        unit=entry["unit"],
                    )
                )
            db.session.add(basket)
        # Merges erst nach dem Einlesen aktivieren, damit Kaufreferenzen gültig bleiben.
        for saved in data["products"]:
            if saved.get("merged_into_id") is not None:
                target = product_map.get(saved["merged_into_id"])
                if target is None or target == product_map[saved["id"]]:
                    raise ValidationError("Ungültige Zusammenführung in der Sicherung.")
                product = db.session.get(Product, product_map[saved["id"]])
                product.merged_into_id = target
                history = saved.get("merge_history") or {}
                product.merge_history = {
                    "item_ids": [
                        item_map[i]
                        for i in history.get("item_ids", [])
                        if i in item_map
                    ]
                }
        official = data.get("official_index")
        if isinstance(official, dict) and official.get("series"):
            setting = db.session.get(Setting, "official_index")
            if setting:
                setting.value = official
            else:
                db.session.add(Setting(key="official_index", value=official))
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return {"created": len(data["purchases"]), "products": len(product_map)}


@transfer_bp.post("/restore")
def restore():
    if "file" not in request.files:
        raise ValidationError("Eine JSON-Sicherungsdatei fehlt.")
    try:
        data = json.load(request.files["file"])
    except (ValueError, UnicodeError) as exc:
        raise ValidationError(
            "Die Sicherung enthält kein gültiges UTF-8-JSON."
        ) from exc
    return jsonify(restore_export(data))


@transfer_bp.post("/demo")
def demo():
    if db.session.scalar(db.select(Purchase.id).limit(1)) or db.session.scalar(
        db.select(Product.id).limit(1)
    ):
        raise ValidationError(
            "Demo kann nur in eine leere Datensammlung geladen werden.", status=409
        )
    definitions = [
        (
            "Bio-H-Milch 3,5 %",
            "Milchprodukte",
            "l",
            {"Bio": True, "Fettgehalt": "3,5 %", "Haltbarmachung": "H-Milch"},
        ),
        ("Haferflocken", "Lebensmittel", "g", {"Art": "zart"}),
        ("Filterkaffee", "Genussmittel", "g", {"Röstung": "mittel"}),
        (
            "Toilettenpapier Recycling",
            "Haushalt",
            "Blatt",
            {"Lagen": 3, "Recycling": True},
        ),
    ]
    product_ids = []
    try:
        for name, category, unit, attrs in definitions:
            product = Product(
                name=name,
                brand="Demomarke",
                category=category,
                unit=unit,
                tags=["Täglicher Bedarf"],
                attributes=attrs,
                aliases=[],
            )
            db.session.add(product)
            db.session.flush()
            product_ids.append(product.id)
        count = 0
        today = date.today()
        for months_ago in range(5, -1, -1):
            month_index = today.year * 12 + today.month - 1 - months_ago
            year, month = divmod(month_index, 12)
            for market_index, (merchant, city, postal) in enumerate(
                [
                    ("Demo-Markt Isar", "München", "80802"),
                    ("Demo-Markt Elbe", "Dresden", "01067"),
                ]
            ):
                progress = 5 - months_ago
                prices = [
                    1.19 + progress * 0.04 + market_index * 0.05,
                    0.79 + progress * 0.02 + market_index * 0.03,
                    4.49 + progress * 0.1 + market_index * 0.15,
                    3.99 + progress * 0.06 + market_index * 0.1,
                ]
                sizes = ["1", "500", "500", "1200"]
                units = ["l", "g", "g", "Blatt"]
                create_purchase(
                    {
                        "purchased_at": f"{year:04}-{month + 1:02}-05",
                        "merchant": merchant,
                        "branch": "Demo-Filiale",
                        "city": city,
                        "postal_code": postal,
                        "country": "DE",
                        "currency": "EUR",
                        "channel": "store",
                        "status": "confirmed",
                        "notes": "DEMO – künstliche Beispieldaten, keine echten Marktpreise.",
                        "items": [
                            {
                                "product_id": product_ids[i],
                                "raw_name": definitions[i][0],
                                "quantity": "1",
                                "package_size": sizes[i],
                                "unit": units[i],
                                "line_total": f"{prices[i]:.2f}",
                                "discount": "0",
                                "deposit": "0",
                                "is_offer": False,
                                "is_return": False,
                                "attributes": {},
                            }
                            for i in range(4)
                        ],
                    },
                    commit=False,
                )
                count += 1
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify(created=count)
