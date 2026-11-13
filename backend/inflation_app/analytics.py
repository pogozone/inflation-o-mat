"""Nachvollziehbare Auswertungen über bestätigte Preisbeobachtungen.

Jede Gruppierung enthält Produkt UND Vergleichseinheit. Ein Liter Milch und
ein Kilogramm Kaffee dürfen niemals zu einem gemeinsamen Preis verschmelzen.
"""

from collections import defaultdict
from decimal import Decimal
from statistics import median

from flask import Blueprint, jsonify, request

from .models import Basket, BasketItem, Product, Purchase, Setting, db
from .purchases import filtered_observations
from .validation import ValidationError

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api")


def number(value, places=6):
    return f"{Decimal(value):.{places}f}"


def aggregate(observations):
    """Berechnet Mediane, keine mengenabhängigen Durchschnittspreise."""
    monthly, regions, markets = defaultdict(list), defaultdict(list), defaultdict(list)
    market_monthly = defaultdict(list)
    for row in observations:
        if row["comparison_price"] is None or row["product_id"] is None:
            continue
        identity = (row["product_id"], row["product_name"], row["comparison_unit"])
        monthly[(row["purchased_at"][:7], *identity)].append(row)
        location = (
            row.get("country", ""),
            row.get("city", ""),
            row.get("postal_code", ""),
        )
        markets[(row["merchant"], row["branch"], *location, *identity)].append(row)
        market_monthly[
            (
                row["purchased_at"][:7],
                row["merchant"],
                row["branch"],
                *location,
                *identity,
            )
        ].append(row)
        if (
            row.get("city")
            and row.get("postal_code")
            and row.get("channel") != "online"
        ):
            regions[
                (row.get("country", "DE"), row["city"], row["postal_code"], *identity)
            ].append(row)

    def prices(rows):
        return median(Decimal(row["comparison_price"]) for row in rows)

    month_rows = [
        {
            "month": key[0],
            "product_id": key[1],
            "product_name": key[2],
            "comparison_unit": key[3],
            "median_price": number(prices(rows)),
            "count": len(rows),
        }
        for key, rows in sorted(monthly.items())
    ]
    region_rows = [
        {
            "country": key[0],
            "city": key[1],
            "postal_code": key[2],
            "product_id": key[3],
            "product_name": key[4],
            "comparison_unit": key[5],
            "median_price": number(prices(rows)),
            "count": len(rows),
            "branch_count": len({(r["merchant"], r["branch"]) for r in rows}),
            "last_date": max(r["purchased_at"] for r in rows),
        }
        for key, rows in sorted(regions.items())
    ]
    market_month_rows = [
        {
            "month": key[0],
            "merchant": key[1],
            "branch": key[2],
            "country": key[3],
            "city": key[4],
            "postal_code": key[5],
            "product_id": key[6],
            "product_name": key[7],
            "comparison_unit": key[8],
            "median_price": number(prices(rows)),
            "count": len(rows),
        }
        for key, rows in sorted(market_monthly.items())
    ]
    market_rows = [
        {
            "merchant": key[0],
            "branch": key[1],
            "country": key[2],
            "city": key[3],
            "postal_code": key[4],
            "product_id": key[5],
            "product_name": key[6],
            "comparison_unit": key[7],
            "median_price": number(prices(rows)),
            "count": len(rows),
            "last_date": max(r["purchased_at"] for r in rows),
        }
        for key, rows in sorted(markets.items())
    ]
    by_product = defaultdict(list)
    for row in month_rows:
        by_product[(row["product_id"], row["comparison_unit"])].append(row)
    changes = []
    for rows in by_product.values():
        if len(rows) < 2:
            continue
        first, last = rows[0], rows[-1]
        basis = Decimal(first["median_price"])
        if basis <= 0:
            continue
        changes.append(
            {
                "product_id": first["product_id"],
                "product_name": first["product_name"],
                "comparison_unit": first["comparison_unit"],
                "first_price": first["median_price"],
                "last_price": last["median_price"],
                "first_month": first["month"],
                "last_month": last["month"],
                "count": sum(r["count"] for r in rows),
                "change_percent": number(
                    (Decimal(last["median_price"]) / basis - 1) * 100, 2
                ),
            }
        )
    spend = sum(
        (
            Decimal(r["line_total"]) - Decimal(r.get("discount", "0"))
            for r in observations
        ),
        Decimal(0),
    )
    return {
        "summary": {
            "purchase_count": len({r["purchase_id"] for r in observations}),
            "observation_count": len(observations),
            "total_spend": number(spend, 2),
            "product_count": len(
                {r["product_id"] for r in observations if r["product_id"]}
            ),
        },
        "monthly": month_rows,
        "market_monthly": market_month_rows,
        "regions": region_rows,
        "markets": market_rows,
        "changes": sorted(
            changes, key=lambda r: abs(Decimal(r["change_percent"])), reverse=True
        ),
    }


@analytics_bp.get("/analytics")
def analytics():
    report = aggregate(filtered_observations(request.args))
    expense_rows = filtered_observations(request.args, include_returns=True)
    spend = sum(
        (
            (Decimal(row["line_total"]) - Decimal(row["discount"]))
            * (-1 if row.get("is_return") else 1)
            for row in expense_rows
        ),
        Decimal(0),
    )
    report["summary"]["total_spend"] = number(spend, 2)
    report["summary"]["purchase_count"] = len(
        {row["purchase_id"] for row in expense_rows}
    )
    return jsonify(report)


def positive_decimal(value):
    try:
        result = Decimal(str(value))
        if (
            not result.is_finite()
            or result <= 0
            or result > Decimal("1000000000")
            or result.as_tuple().exponent < -12
        ):
            raise ValueError
        return result
    except (ValueError, ArithmeticError):
        raise ValidationError("Menge muss eine endliche positive Zahl sein.")


def basket_dict(basket):
    return {
        "id": basket.id,
        "name": basket.name,
        "items": [
            {
                "product_id": item.product_id,
                "quantity": str(item.quantity),
                "unit": item.unit,
                "name": db.session.get(Product, item.product_id).name,
            }
            for item in basket.items
        ],
    }


@analytics_bp.get("/baskets")
def baskets():
    return jsonify(
        [basket_dict(b) for b in db.session.scalars(db.select(Basket)).all()]
    )


@analytics_bp.post("/baskets")
def create_basket():
    data = request.get_json()
    if not isinstance(data, dict) or not str(data.get("name", "")).strip():
        raise ValidationError("Ein Name für den Warenkorb fehlt.")
    if not isinstance(data.get("items"), list) or not data["items"]:
        raise ValidationError("Der Warenkorb benötigt mindestens ein Produkt.")
    basket = Basket(name=str(data["name"]).strip()[:200])
    seen = set()
    for entry in data["items"]:
        if not isinstance(entry, dict):
            raise ValidationError("Ungültige Warenkorbposition.")
        product = db.session.get(Product, entry.get("product_id"))
        if not product or product.id in seen or product.merged_into_id:
            raise ValidationError(
                "Warenkorbprodukte müssen existieren und eindeutig sein."
            )
        quantity = positive_decimal(entry.get("quantity"))
        unit = entry.get("unit", "")
        if unit not in BASKET_UNITS:
            raise ValidationError("Unbekannte Vergleichseinheit.")
        seen.add(product.id)
        basket.items.append(
            BasketItem(product_id=product.id, quantity=quantity, unit=unit)
        )
    db.session.add(basket)
    db.session.commit()
    return jsonify(basket_dict(basket)), 201


@analytics_bp.delete("/baskets/<int:basket_id>")
def delete_basket(basket_id):
    basket = db.session.get(Basket, basket_id)
    if not basket:
        raise ValidationError("Warenkorb nicht gefunden.", status=404)
    db.session.delete(basket)
    db.session.commit()
    return jsonify(ok=True)


BASKET_UNITS = {
    "g": ("kg", Decimal("0.001")),
    "kg": ("kg", Decimal(1)),
    "ml": ("l", Decimal("0.001")),
    "l": ("l", Decimal(1)),
    "Stück": ("Stück", Decimal(1)),
    "m": ("m", Decimal(1)),
    "m²": ("m²", Decimal(1)),
    "Blatt": ("100 Blatt", Decimal("0.01")),
    "Waschladung": ("Waschladung", Decimal(1)),
}


def calculate_basket(items, base_rows, current_rows):
    """Fester Warenkorb; ein fehlender Preis verhindert einen Gesamtindex."""

    def price_map(rows):
        grouped = defaultdict(list)
        for row in rows:
            if row["comparison_price"] is not None:
                grouped[(row["product_id"], row["comparison_unit"])].append(
                    Decimal(row["comparison_price"])
                )
        return {key: median(values) for key, values in grouped.items()}

    base, current = price_map(base_rows), price_map(current_rows)
    base_cost = current_cost = covered_basis = known_basis = Decimal(0)
    missing, details = [], []
    for item in items:
        comparison_unit, factor = BASKET_UNITS[item["unit"]]
        quantity = positive_decimal(item["quantity"]) * factor
        key = (item["product_id"], comparison_unit)
        first, last = base.get(key), current.get(key)
        if first is not None:
            known_basis += quantity * first
        if first is None or last is None:
            missing.append(item.get("name", str(item["product_id"])))
        else:
            base_cost += quantity * first
            current_cost += quantity * last
            covered_basis += quantity * first
        details.append(
            {
                **item,
                "comparison_unit": comparison_unit,
                "base_price": number(first) if first is not None else None,
                "current_price": number(last) if last is not None else None,
            }
        )
    complete = bool(items) and not missing and base_cost > 0
    # Fehlende Basispreise machen eine Kostenabdeckung unbekannt, nicht 100%.
    basis_known = all(row["base_price"] is not None for row in details)
    coverage = (
        covered_basis / known_basis * 100
        if basis_known and known_basis > 0
        else Decimal(0)
    )
    return {
        "complete": complete,
        "index": number(current_cost / base_cost * 100, 2) if complete else None,
        "change_percent": number((current_cost / base_cost - 1) * 100, 2)
        if complete
        else None,
        "base_cost": number(base_cost, 2) if complete else None,
        "current_cost": number(current_cost, 2) if complete else None,
        "coverage_percent": number(coverage, 2),
        "coverage_known": basis_known,
        "missing": missing,
        "items": details,
    }


@analytics_bp.post("/baskets/<int:basket_id>/compare")
def compare_basket(basket_id):
    basket = db.session.get(Basket, basket_id)
    if not basket:
        raise ValidationError("Warenkorb nicht gefunden.", status=404)
    data = request.get_json()
    if not isinstance(data, dict) or any(
        not data.get(k) for k in ("base_from", "base_to", "current_from", "current_to")
    ):
        raise ValidationError(
            "Beide Vergleichszeiträume müssen vollständig angegeben sein."
        )
    base = filtered_observations({"from": data["base_from"], "to": data["base_to"]})
    current = filtered_observations(
        {"from": data["current_from"], "to": data["current_to"]}
    )
    return jsonify(calculate_basket(basket_dict(basket)["items"], base, current))


@analytics_bp.get("/official-index")
def official_index():
    setting = db.session.get(Setting, "official_index")
    return jsonify(
        setting.value if setting else {"series": [], "source": "", "base_year": ""}
    )


@analytics_bp.put("/official-index")
def set_official_index():
    import re

    data = request.get_json()
    if (
        not isinstance(data, dict)
        or not data.get("source")
        or not data.get("base_year")
    ):
        raise ValidationError("Quelle und Basisjahr sind erforderlich.")
    if not isinstance(data.get("series"), list) or not data["series"]:
        raise ValidationError("Eine Indexreihe wird benötigt.")
    series, periods = [], set()
    for point in data["series"]:
        if not isinstance(point, dict):
            raise ValidationError("Jeder Indexwert muss ein Objekt sein.")
        period = point.get("period", "")
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", period) or period in periods:
            raise ValidationError(
                "Monate müssen eindeutig im Format JJJJ-MM vorliegen."
            )
        periods.add(period)
        series.append(
            {
                "period": period,
                "index_value": number(positive_decimal(point.get("index_value"))),
            }
        )
    value = {
        "series": sorted(series, key=lambda p: p["period"]),
        "source": str(data["source"])[:1000],
        "base_year": str(data["base_year"])[:100],
    }
    setting = db.session.get(Setting, "official_index")
    if setting:
        setting.value = value
    else:
        db.session.add(Setting(key="official_index", value=value))
    db.session.commit()
    return jsonify(value)
