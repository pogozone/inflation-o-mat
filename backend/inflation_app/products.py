"""Product metadata and reversible, explicit identity consolidation."""

import math
from flask import Blueprint, request, jsonify
from .models import db, Product, PurchaseItem, BasketItem
from .validation import ValidationError, object_payload, text, UNITS

products_bp = Blueprint("products", __name__)


def product_data(payload):
    object_payload(payload)
    data = {
        key: text(payload.get(key, default), key)
        for key, default in [
            ("name", ""),
            ("brand", ""),
            ("category", ""),
            ("unit", "Stück"),
        ]
    }
    if not data["name"] or data["unit"] not in UNITS:
        raise ValidationError("Produktname und gültige Einheit erforderlich.")
    for key in ("tags", "aliases"):
        values = payload.get(key, [])
        if (
            not isinstance(values, list)
            or len(values) > 100
            or any(not isinstance(v, str) or len(v) > 255 for v in values)
        ):
            raise ValidationError(f"{key}: Liste kurzer Texte erforderlich.")
        data[key] = values
    data["attributes"] = object_payload(payload.get("attributes", {}))
    if any(
        not isinstance(key, str)
        or not isinstance(value, (str, int, float, bool))
        or isinstance(value, float)
        and not math.isfinite(value)
        for key, value in data["attributes"].items()
    ):
        raise ValidationError("Produktmerkmale müssen einfache Werte enthalten.")
    return data


@products_bp.get("/api/products")
def products():
    return jsonify(
        [
            p.to_dict()
            for p in db.session.scalars(db.select(Product).order_by(Product.name))
        ]
    )


@products_bp.post("/api/products")
def add_product():
    product = Product(**product_data(request.get_json()))
    db.session.add(product)
    db.session.commit()
    return jsonify(product.to_dict()), 201


@products_bp.put("/api/products/<int:identifier>")
def edit_product(identifier):
    product = db.get_or_404(Product, identifier)
    for key, value in product_data(request.get_json()).items():
        setattr(product, key, value)
    db.session.commit()
    return jsonify(product.to_dict())


@products_bp.post("/api/products/<int:identifier>/merge")
def merge_product(identifier):
    source = db.get_or_404(Product, identifier)
    target_id = object_payload(request.get_json()).get("target_id")
    if not isinstance(target_id, int) or isinstance(target_id, bool):
        raise ValidationError("target_id erforderlich.")
    target = db.get_or_404(Product, target_id)
    if (
        source.id == target.id
        or source.merged_into_id
        or target.merged_into_id
        or db.session.scalar(db.select(Product).filter_by(merged_into_id=source.id))
    ):
        raise ValidationError("Dieser Merge würde eine unklare Produktkette erzeugen.")
    if db.session.scalar(
        db.select(BasketItem.id).filter_by(product_id=source.id).limit(1)
    ):
        raise ValidationError(
            "Produkt wird in einem Warenkorb verwendet. Bitte zuerst dort ersetzen."
        )
    items = list(
        db.session.scalars(db.select(PurchaseItem).filter_by(product_id=source.id))
    )
    source.merge_history = {"item_ids": [item.id for item in items]}
    source.merged_into_id = target.id
    for item in items:
        item.product_id = target.id
    db.session.commit()
    return jsonify(source.to_dict())


@products_bp.post("/api/products/<int:identifier>/undo-merge")
def undo_merge(identifier):
    source = db.get_or_404(Product, identifier)
    if not source.merged_into_id:
        raise ValidationError("Kein Merge vorhanden.")
    for item_id in (source.merge_history or {}).get("item_ids", []):
        item = db.session.get(PurchaseItem, item_id)
        if item and item.product_id == source.merged_into_id:
            item.product_id = source.id
    source.merged_into_id = None
    source.merge_history = None
    db.session.commit()
    return jsonify(source.to_dict())
