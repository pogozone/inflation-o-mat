"""CSV und JSON werden erst geprüft, anschließend ausdrücklich übernommen."""

import csv
import hashlib
import io
import json
from collections import OrderedDict

from flask import Blueprint, jsonify, request

from .models import Purchase, db
from .purchases import create_purchase, prepare_purchase
from .validation import ValidationError

imports_bp = Blueprint("imports", __name__, url_prefix="/api/import")

PURCHASE_FIELDS = (
    "purchased_at",
    "merchant",
    "branch",
    "city",
    "postal_code",
    "country",
    "currency",
    "channel",
)
ITEM_FIELDS = (
    "raw_name",
    "quantity",
    "package_size",
    "unit",
    "line_total",
    "discount",
    "deposit",
    "product_id",
)
DECIMAL_FIELDS = {"quantity", "package_size", "line_total", "discount", "deposit"}


def parse_import(content, format_name, mapping=None, delimiter=None):
    """Liefert editierbare Vorschläge; schreibt niemals in die Datenbank."""
    warnings = []
    if not isinstance(content, str) or not content.strip():
        raise ValidationError("Der Import enthält keinen Text.")
    if format_name == "json":
        try:
            parsed = json.loads(content)
        except (ValueError, TypeError) as exc:
            raise ValidationError("JSON konnte nicht gelesen werden.") from exc
        if (
            isinstance(parsed, dict)
            and "schema_version" in parsed
            and parsed["schema_version"] != 1
        ):
            raise ValidationError("Diese JSON-Schemaversion wird nicht unterstützt.")
        if isinstance(parsed, dict) and "products" in parsed:
            raise ValidationError(
                "Vollständige Sicherung erkannt: Bitte Wiederherstellen verwenden, damit Produktreferenzen erhalten bleiben."
            )
        if isinstance(parsed, dict) and "purchases" in parsed:
            purchases = parsed["purchases"]
        elif isinstance(parsed, list):
            purchases = parsed
        elif isinstance(parsed, dict) and "items" in parsed:
            purchases = [parsed]
        else:
            raise ValidationError(
                "JSON muss einen Kauf oder eine Liste purchases enthalten."
            )
        if isinstance(parsed, dict) and "products" in parsed:
            warnings.append(
                "Vollständige Sicherung erkannt: Für den Erhalt der Produktreferenzen Wiederherstellen verwenden."
            )
    elif format_name == "csv":
        purchases, warnings = parse_csv(content, mapping, delimiter)
    else:
        raise ValidationError("Unterstützt werden CSV und JSON.")
    if not isinstance(purchases, list) or not purchases or len(purchases) > 500:
        raise ValidationError("Import muss 1 bis 500 Kaufvorgänge enthalten.")
    for purchase in purchases:
        if not isinstance(purchase, dict) or not isinstance(
            purchase.get("items"), list
        ):
            raise ValidationError("Jeder Kaufvorgang benötigt eine Liste items.")
        purchase["status"] = "draft"
        purchase.pop("id", None)
        purchase.pop("created_at", None)
        purchase.pop("fingerprint", None)
        purchase.pop("receipt_total", None)
    return {
        "purchases": purchases,
        "warnings": warnings,
        "errors": [],
        "duplicate_ids": [],
        "source_hash": hashlib.sha256(content.encode("utf-8")).hexdigest(),
    }


def parse_csv(content, mapping=None, delimiter=None):
    mapping = mapping or {}
    if not isinstance(mapping, dict):
        raise ValidationError("Die Spaltenzuordnung muss ein Objekt sein.")
    if delimiter not in (None, ",", ";", "\t"):
        raise ValidationError("Trennzeichen muss Komma, Semikolon oder Tab sein.")
    if delimiter is None:
        try:
            delimiter = csv.Sniffer().sniff(content[:8192], delimiters=",;\t").delimiter
        except csv.Error:
            delimiter = ";"
    reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")), delimiter=delimiter)
    if not reader.fieldnames:
        raise ValidationError("Die CSV-Datei hat keine Kopfzeile.")
    if len(set(reader.fieldnames)) != len(reader.fieldnames):
        raise ValidationError("CSV-Spaltennamen müssen eindeutig sein.")
    headers = {name.strip(): name for name in reader.fieldnames}
    if any(value not in headers for value in mapping.values()):
        raise ValidationError("Eine zugeordnete CSV-Spalte existiert nicht.")

    def field(row, name, default=""):
        source = mapping.get(name, name)
        return (row.get(headers.get(source, source)) or default).strip()

    grouped = OrderedDict()
    has_key = mapping.get("purchase_key", "purchase_key") in headers
    warnings = (
        []
        if has_key
        else [
            "Keine Kauf-ID-Spalte: Alle Zeilen wurden als EIN Einkauf vorgeschlagen. Bitte Gruppierung ausdrücklich prüfen."
        ]
    )
    for line_number, row in enumerate(reader, start=2):
        if line_number > 5001:
            raise ValidationError("Maximal 5.000 CSV-Positionen je Import.")
        if None in row:
            raise ValidationError(
                f"Zeile {line_number}: Zu viele Spalten; Trennzeichen prüfen."
            )
        key = field(row, "purchase_key") if has_key else "single"
        if not key:
            raise ValidationError(f"Zeile {line_number}: Kauf-ID fehlt.")
        purchase_values = {name: field(row, name) for name in PURCHASE_FIELDS}
        purchase_values.update(
            country=purchase_values["country"] or "DE",
            currency=purchase_values["currency"] or "EUR",
            channel=purchase_values["channel"] or "store",
        )
        if key not in grouped:
            grouped[key] = {
                **purchase_values,
                "items": [],
                "notes": "CSV-Import: bitte prüfen.",
                "status": "draft",
            }
        elif any(
            grouped[key][name] != purchase_values[name] for name in PURCHASE_FIELDS
        ):
            raise ValidationError(
                f"Zeile {line_number}: Kauf-ID {key} enthält widersprüchliche Einkaufsorte oder Daten."
            )
        item = {}
        for name in ITEM_FIELDS:
            value = field(row, name)
            if name in DECIMAL_FIELDS:
                # Dezimalkomma ja; mehrdeutige Tausendertrennzeichen nein.
                if "," in value and "." in value:
                    raise ValidationError(
                        f"Zeile {line_number}: Zahl {value} ist mehrdeutig."
                    )
                value = value.replace(",", ".")
            item[name] = value
        if item["product_id"]:
            try:
                item["product_id"] = int(item["product_id"])
            except ValueError as exc:
                raise ValidationError(
                    f"Zeile {line_number}: product_id muss eine Ganzzahl sein."
                ) from exc
        else:
            item["product_id"] = None
        item.update(
            quantity=item["quantity"] or "1",
            package_size=item["package_size"] or None,
            discount=item["discount"] or "0",
            deposit=item["deposit"] or "0",
            is_offer=field(row, "is_offer").lower() in ("true", "1", "ja"),
            is_return=field(row, "is_return").lower() in ("true", "1", "ja"),
            attributes={},
        )
        grouped[key]["items"].append(item)
    return list(grouped.values()), warnings


@imports_bp.post("/preview")
def preview():
    if "file" in request.files:
        upload = request.files["file"]
        extension = (upload.filename or "").rsplit(".", 1)[-1].lower()
        try:
            content = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValidationError("Bitte eine UTF-8-Datei verwenden.") from exc
        mapping = None
        if request.form.get("mapping"):
            try:
                mapping = json.loads(request.form["mapping"])
            except ValueError as exc:
                raise ValidationError(
                    "Spaltenzuordnung ist kein gültiges JSON."
                ) from exc
        result = parse_import(
            content, extension, mapping, request.form.get("delimiter") or None
        )
    else:
        data = request.get_json()
        if not isinstance(data, dict):
            raise ValidationError("Ein Importobjekt wird erwartet.")
        result = parse_import(
            data.get("content", ""),
            data.get("format"),
            data.get("mapping"),
            data.get("delimiter"),
        )
    duplicates = set()
    for index, payload in enumerate(result["purchases"], 1):
        try:
            prepared, _ = prepare_purchase(payload)
            existing = db.session.scalar(
                db.select(Purchase).filter_by(fingerprint=prepared["fingerprint"])
            )
            if existing:
                duplicates.add(existing.id)
        except ValidationError as error:
            result["errors"].append(f"Einkauf {index}: {error}")
    result["duplicate_ids"] = sorted(duplicates)
    return jsonify(result)


@imports_bp.post("/commit")
def commit_import():
    data = request.get_json()
    if not isinstance(data, dict) or not isinstance(data.get("purchases"), list):
        raise ValidationError("Eine Liste purchases wird erwartet.")
    if not 1 <= len(data["purchases"]) <= 500:
        raise ValidationError("1 bis 500 Einkäufe je Import zulässig.")
    created = []
    try:
        for payload in data["purchases"]:
            purchase = create_purchase(
                payload,
                commit=False,
                allow_duplicate=data.get("allow_duplicates") is True,
            )
            created.append(purchase.id)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify(created=len(created), ids=created), 201
