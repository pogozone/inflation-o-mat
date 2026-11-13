"""Strict validation shared by manual entry and transactional imports."""

import re
from datetime import date
from decimal import Decimal, InvalidOperation

UNITS = {"g", "kg", "ml", "l", "Stück", "m", "m²", "Blatt", "Waschladung"}


class ValidationError(ValueError):
    def __init__(self, message, details=None, status=400):
        super().__init__(message)
        self.details = details
        self.status = status


def decimal_value(value, field="value", positive=False, allow_zero=True):
    raw = str(value).strip()
    if re.fullmatch(r"[+-]?[0-9]*,[0-9]+", raw):
        raw = raw.replace(",", ".")
    try:
        number = Decimal(raw)
    except (InvalidOperation, ValueError, TypeError):
        raise ValidationError(f"{field}: gültige Dezimalzahl erforderlich.")
    if (
        not number.is_finite()
        or number < 0
        or (positive and number == 0)
        or (not allow_zero and number == 0)
        or abs(number) > Decimal("1000000000000")
        or number.as_tuple().exponent < -12
    ):
        raise ValidationError(f"{field}: ungültiger Wertebereich.")
    return number


def iso_date(value, field="purchased_at"):
    try:
        if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValidationError(f"{field}: Datum als YYYY-MM-DD erforderlich.")
    return value


def text(value, field, limit=255):
    if not isinstance(value, str) or len(value) > limit:
        raise ValidationError(
            f"{field}: Text mit höchstens {limit} Zeichen erforderlich."
        )
    return value.strip()


def object_payload(value):
    if not isinstance(value, dict):
        raise ValidationError("Ein JSON-Objekt ist erforderlich.")
    return value


def json_attributes(value):
    """Zusatzmerkmale bleiben erhalten; nichtendliche Zahlen werden abgewiesen."""
    import math

    object_payload(value)

    def check(node, depth=0):
        if depth > 20:
            raise ValidationError("Zusatzmerkmale sind zu tief verschachtelt.")
        if isinstance(node, float) and not math.isfinite(node):
            raise ValidationError(
                "Zusatzmerkmale dürfen keine nichtendlichen Zahlen enthalten."
            )
        if isinstance(node, dict):
            for key, child in node.items():
                if not isinstance(key, str):
                    raise ValidationError("Zusatzmerkmale benötigen Textschlüssel.")
                check(child, depth + 1)
        elif isinstance(node, list):
            for child in node:
                check(child, depth + 1)
        elif node is not None and not isinstance(node, (str, int, float, bool)):
            raise ValidationError("Zusatzmerkmale müssen JSON-Werte sein.")

    check(value)
    return value
