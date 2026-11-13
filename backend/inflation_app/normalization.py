"""Normalize known dimensions only; missing contents never become guessed prices."""

from decimal import Decimal, localcontext
from .validation import ValidationError, decimal_value, UNITS

UNIT_FACTORS = {
    "g": ("kg", Decimal(".001")),
    "kg": ("kg", Decimal(1)),
    "ml": ("l", Decimal(".001")),
    "l": ("l", Decimal(1)),
    "Stück": ("Stück", Decimal(1)),
    "m": ("m", Decimal(1)),
    "m²": ("m²", Decimal(1)),
    "Blatt": ("Blatt", Decimal(1)),
    "Waschladung": ("Waschladung", Decimal(1)),
}


def normalize_item(item):
    unit = item.get("unit", "Stück")
    if unit not in UNITS:
        raise ValidationError("Unbekannte Einheit.")
    quantity = decimal_value(item.get("quantity", "1"), "quantity", positive=True)
    amount = decimal_value(item.get("line_total", "0"), "line_total")
    discount = decimal_value(item.get("discount", "0"), "discount")
    deposit = decimal_value(item.get("deposit", "0"), "deposit")
    if discount > amount:
        raise ValidationError("Rabatt darf den Warenbetrag nicht überschreiten.")
    package = item.get("package_size")
    package = (
        None
        if package in (None, "")
        else decimal_value(package, "package_size", positive=True)
    )
    result = dict(
        quantity=str(quantity),
        package_size=None if package is None else str(package),
        unit=unit,
        line_total=str(amount),
        discount=str(discount),
        deposit=str(deposit),
        normalized_quantity=None,
        normalized_unit=None,
        comparison_price=None,
        comparison_unit=None,
        calculation_status="missing_package_size",
    )
    if package is not None:
        normalized_unit, factor = UNIT_FACTORS[unit]
        with localcontext() as context:
            context.prec = 64
            normalized = quantity * package * factor
            resolution = Decimal("0.000001")
            maximum = Decimal("1e24")
            if normalized < resolution or normalized >= maximum:
                raise ValidationError(
                    "Normalisierte Menge muss mindestens 0,000001 und kleiner als 10²⁴ sein."
                )
            if normalized != normalized.quantize(resolution):
                raise ValidationError(
                    "Normalisierte Menge benötigt mehr als sechs Nachkommastellen. Bitte Menge und Einheit prüfen."
                )
            comparison = (
                (amount - discount) / normalized * (100 if unit == "Blatt" else 1)
            )
            comparison = comparison.quantize(resolution)
            if comparison >= maximum:
                raise ValidationError(
                    "Berechneter Grundpreis überschreitet den unterstützten Wertebereich."
                )
        result.update(
            normalized_quantity=f"{normalized:.6f}",
            normalized_unit=normalized_unit,
            comparison_price=f"{comparison:.6f}",
            comparison_unit="100 Blatt" if unit == "Blatt" else normalized_unit,
            calculation_status="ok",
        )
    return result
