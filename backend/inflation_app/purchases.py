"""Purchase validation, snapshots and observation filtering."""

import hashlib
import json
import re
from decimal import Decimal
from flask import Blueprint, request, jsonify
from .models import db, Product, Purchase, PurchaseItem, AuditLog
from .normalization import normalize_item
from .validation import (
    json_attributes,
    ValidationError,
    iso_date,
    text,
    object_payload,
)

purchases_bp = Blueprint("purchases", __name__)


def prepare_purchase(payload):
    payload = object_payload(payload)
    data = {"purchased_at": iso_date(payload.get("purchased_at"))}
    for key, default, limit in [
        ("merchant", "", 255),
        ("branch", "", 255),
        ("city", "", 255),
        ("postal_code", "", 30),
        ("country", "DE", 2),
        ("channel", "store", 20),
        ("currency", "EUR", 3),
        ("status", "draft", 20),
        ("notes", "", 10000),
    ]:
        data[key] = text(payload.get(key, default), key, limit)
    if (
        data["channel"] not in ("store", "online")
        or data["status"] not in ("draft", "confirmed")
        or not re.fullmatch("[A-Z]{2}", data["country"])
        or data["currency"] != "EUR"
    ):
        raise ValidationError("Land, Währung, Kanal oder Status ungültig.")
    if (
        data["postal_code"]
        and data["country"] == "DE"
        and not re.fullmatch(r"\d{5}", data["postal_code"])
    ):
        raise ValidationError("Deutsche PLZ muss fünf Ziffern enthalten.")
    if (
        data["status"] == "confirmed"
        and data["channel"] == "store"
        and (not data["city"] or not data["postal_code"])
    ):
        raise ValidationError("Bestätigte Ladenkäufe benötigen Stadt und PLZ.")
    if data["status"] == "confirmed" and not data["merchant"]:
        raise ValidationError("Bestätigte Käufe benötigen einen Händler.")
    raw_items = payload.get("items")
    if not isinstance(raw_items, list) or not raw_items or len(raw_items) > 500:
        raise ValidationError("Ein Kauf benötigt 1 bis 500 Positionen.")
    items = []
    for raw in raw_items:
        object_payload(raw)
        item = normalize_item(raw)
        for flag in ("is_offer", "is_return"):
            if flag in raw and not isinstance(raw[flag], bool):
                raise ValidationError(f"{flag}: boolescher Wert erforderlich.")
            item[flag] = raw.get(flag, False)
        item["raw_name"] = text(raw.get("raw_name", ""), "raw_name")
        if not item["raw_name"]:
            raise ValidationError("Jede Position benötigt eine Bezeichnung.")
        item["attributes"] = json_attributes(raw.get("attributes", {}))
        product_id = raw.get("product_id")
        product = None
        if product_id is not None:
            if isinstance(product_id, bool) or not isinstance(product_id, int):
                raise ValidationError("product_id muss eine ganze Zahl sein.")
            product = db.session.get(Product, product_id)
            if product is not None and product.merged_into_id:
                raise ValidationError(
                    "Zusammengeführtes Produkt: bitte das Zielprodukt wählen."
                )
            if product is None:
                raise ValidationError("Unbekanntes Produkt.")
        item["product_id"] = product_id
        item["product_snapshot"] = product.to_dict() if product else {}
        items.append(item)
    identity = {
        key: data[key]
        for key in (
            "purchased_at",
            "merchant",
            "branch",
            "city",
            "postal_code",
            "country",
            "channel",
            "currency",
        )
    }
    # Canonical decimals make 5, 5.0 and 5.00 the same duplicate candidate.
    identity["items"] = [
        {
            key: (
                str(Decimal(value).normalize())
                if key
                in ("quantity", "package_size", "line_total", "discount", "deposit")
                and value is not None
                else value
            )
            for key, value in item.items()
            if key
            not in (
                "product_snapshot",
                "normalized_quantity",
                "comparison_price",
                "calculation_status",
            )
        }
        for item in items
    ]
    data["fingerprint"] = hashlib.sha256(
        json.dumps(identity, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    return data, items


def create_purchase(
    payload, commit=True, allow_duplicate=False, trusted_snapshots=False
):
    data, items = prepare_purchase(payload)
    duplicate = db.session.scalar(
        db.select(Purchase).filter_by(fingerprint=data["fingerprint"])
    )
    if duplicate and not (allow_duplicate or payload.get("allow_duplicate") is True):
        raise ValidationError(
            "Mögliche Dublette. Bitte ausdrücklich bestätigen.",
            {"duplicate_id": duplicate.id},
            409,
        )
    if trusted_snapshots:
        for raw, item in zip(payload["items"], items):
            if isinstance(raw.get("product_snapshot"), dict):
                item["product_snapshot"] = raw["product_snapshot"]
    purchase = Purchase(**data)
    purchase.items = [PurchaseItem(**item) for item in items]
    db.session.add(purchase)
    db.session.flush()
    if commit:
        db.session.commit()
    return purchase


def update_purchase(purchase, payload):
    data, items = prepare_purchase(payload)
    duplicate = db.session.scalar(
        db.select(Purchase).where(
            Purchase.fingerprint == data["fingerprint"], Purchase.id != purchase.id
        )
    )
    if duplicate and payload.get("allow_duplicate") is not True:
        raise ValidationError(
            "Mögliche Dublette. Bitte ausdrücklich bestätigen.",
            {"duplicate_id": duplicate.id},
            409,
        )
    before = purchase.to_dict()
    previous_items = list(purchase.items)
    previous = {item.id: item for item in previous_items}
    retained = set()
    updated_items = []
    for index, item in enumerate(items):
        raw = payload["items"][index]
        supplied_id = raw.get("id")
        if supplied_id is not None:
            if (
                isinstance(supplied_id, bool)
                or not isinstance(supplied_id, int)
                or supplied_id not in previous
            ):
                raise ValidationError("Position gehört nicht zu diesem Kauf.")
            old = previous[supplied_id]
        else:
            old = previous_items[index] if index < len(previous_items) else None
        if old is not None:
            if old.id in retained:
                raise ValidationError(
                    "Eine Positions-ID darf nicht mehrfach vorkommen."
                )
            retained.add(old.id)
            if old.product_id == item["product_id"]:
                item["product_snapshot"] = old.product_snapshot
            for key, value in item.items():
                setattr(old, key, value)
            updated_items.append(old)
        else:
            updated_items.append(PurchaseItem(**item))
    for key, value in data.items():
        setattr(purchase, key, value)
    # Bestehende IDs erhalten auch nach Korrekturen die reversible Merge-Zuordnung.
    purchase.items = updated_items
    db.session.flush()
    db.session.add(
        AuditLog(
            action="update",
            entity="purchase",
            entity_id=purchase.id,
            before=before,
            after=purchase.to_dict(),
        )
    )
    db.session.commit()
    return purchase


def filtered_observations(args, include_returns=False):
    start, end = args.get("from"), args.get("to")
    if start:
        iso_date(start, "from")
    if end:
        iso_date(end, "to")
    if start and end and start > end:
        raise ValidationError("Beginn muss vor Ende liegen.")
    offer_filter = args.get("include_offers", "true")
    if offer_filter not in ("true", "false"):
        raise ValidationError("include_offers muss true oder false sein.")
    observations = []
    for purchase in db.session.scalars(
        db.select(Purchase)
        .filter_by(status="confirmed")
        .order_by(Purchase.purchased_at, Purchase.id)
    ):
        if (
            start
            and purchase.purchased_at < start
            or end
            and purchase.purchased_at > end
        ):
            continue
        if any(
            args.get(key) and args[key] != getattr(purchase, key)
            for key in (
                "city",
                "postal_code",
                "merchant",
                "country",
                "channel",
                "currency",
            )
        ):
            continue
        for item in purchase.items:
            if (
                (item.is_return and not include_returns)
                or offer_filter == "false"
                and item.is_offer
            ):
                continue
            if args.get("product_id") and str(item.product_id) != str(
                args["product_id"]
            ):
                continue
            snapshot = item.product_snapshot or {}
            if args.get("category") and snapshot.get("category") != args["category"]:
                continue
            if args.get("tag") and args["tag"] not in snapshot.get("tags", []):
                continue
            row = {
                key: getattr(purchase, key)
                for key in (
                    "purchased_at",
                    "merchant",
                    "branch",
                    "city",
                    "postal_code",
                    "country",
                    "channel",
                    "currency",
                )
            }
            row.update(
                {
                    key: item.to_dict()[key]
                    for key in (
                        "id",
                        "product_id",
                        "quantity",
                        "normalized_quantity",
                        "normalized_unit",
                        "comparison_price",
                        "comparison_unit",
                        "line_total",
                        "discount",
                        "is_offer",
                        "is_return",
                    )
                }
            )
            canonical = (
                db.session.get(Product, item.product_id) if item.product_id else None
            )
            row.update(
                purchase_id=purchase.id,
                product_name=canonical.name
                if canonical
                else snapshot.get("name", item.raw_name),
                category=snapshot.get("category", ""),
                tags=snapshot.get("tags", []),
                brand=snapshot.get("brand", ""),
                attributes={**snapshot.get("attributes", {}), **item.attributes},
            )
            observations.append(row)
    return observations


@purchases_bp.get("/api/purchases")
def list_purchases():
    return jsonify(
        [
            p.to_dict()
            for p in db.session.scalars(
                db.select(Purchase).order_by(
                    Purchase.purchased_at.desc(), Purchase.id.desc()
                )
            )
        ]
    )


@purchases_bp.post("/api/purchases")
def add_purchase():
    return jsonify(create_purchase(request.get_json()).to_dict()), 201


@purchases_bp.put("/api/purchases/<int:identifier>")
def edit_purchase(identifier):
    return jsonify(
        update_purchase(
            db.get_or_404(Purchase, identifier), request.get_json()
        ).to_dict()
    )


@purchases_bp.delete("/api/purchases/<int:identifier>")
def delete_purchase(identifier):
    purchase = db.get_or_404(Purchase, identifier)
    db.session.add(
        AuditLog(
            action="delete",
            entity="purchase",
            entity_id=identifier,
            before=purchase.to_dict(),
        )
    )
    db.session.delete(purchase)
    db.session.commit()
    return {"ok": True}


@purchases_bp.get("/api/observations")
def observations():
    return jsonify(filtered_observations(request.args))
