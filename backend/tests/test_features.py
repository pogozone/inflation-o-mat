"""Fachliche Regressionstests: tatsächliche Preise statt Oberflächen-Details."""

from decimal import Decimal

import pytest


def observation(price, date="2026-10-01", city="München", product_id=1):
    return {
        "id": 1,
        "purchase_id": 1,
        "product_id": product_id,
        "product_name": "Milch",
        "comparison_unit": "l",
        "comparison_price": price,
        "purchased_at": date,
        "merchant": "Markt",
        "branch": "Zentrum",
        "city": city,
        "postal_code": "08001",
        "country": "DE",
        "channel": "store",
        "line_total": price,
        "discount": "0",
        "deposit": "0",
    }


def test_monthly_medians_do_not_mix_products_or_units():
    from inflation_app.analytics import aggregate

    rows = [observation("1"), observation("3"), observation("9", product_id=2)]
    report = aggregate(rows)
    assert report["monthly"][0]["median_price"] == "2.000000"
    assert len(report["monthly"]) == 2
    assert report["summary"]["total_spend"] == "13.00"


def test_regional_comparison_preserves_postcode_and_counts_branches():
    from inflation_app.analytics import aggregate

    report = aggregate([observation("1"), observation("2")])
    region = report["regions"][0]
    assert region["postal_code"] == "08001"
    assert region["branch_count"] == 1
    assert region["median_price"] == "1.500000"


def test_changes_use_monthly_medians_and_not_arbitrary_same_day_order():
    from inflation_app.analytics import aggregate

    report = aggregate(
        [
            observation("1", "2026-09-01"),
            observation("3", "2026-09-01"),
            observation("2.5", "2026-10-01"),
        ]
    )
    assert Decimal(report["changes"][0]["change_percent"]) == Decimal("25")


def test_market_time_series_keeps_separate_merchants():
    from inflation_app.analytics import aggregate

    first, second = observation("1"), observation("3")
    second["merchant"] = "Anderer Markt"
    report = aggregate([first, second])
    assert len(report["monthly"]) == 1
    assert len(report["market_monthly"]) == 2
    assert {row["median_price"] for row in report["market_monthly"]} == {
        "1.000000",
        "3.000000",
    }


def test_equal_branch_names_in_different_cities_remain_distinct():
    from inflation_app.analytics import aggregate

    report = aggregate(
        [observation("1", city="München"), observation("2", city="Dresden")]
    )
    assert len(report["markets"]) == 2
    assert len(report["market_monthly"]) == 2


def test_csv_preserves_postcode_and_explicitly_marks_missing_grouping():
    from inflation_app.imports import parse_import

    content = "purchased_at;merchant;city;postal_code;raw_name;quantity;package_size;unit;line_total\n2026-10-01;Markt;Zwickau;08001;Milch;2;500;ml;1,99\n"
    result = parse_import(content, "csv")
    assert result["purchases"][0]["postal_code"] == "08001"
    assert result["purchases"][0]["items"][0]["line_total"] == "1.99"
    assert result["warnings"]


def test_import_rejects_unsupported_schema_and_inconsistent_purchase_group():
    from inflation_app.imports import parse_import
    from inflation_app.validation import ValidationError

    with pytest.raises(ValidationError):
        parse_import('{"schema_version":99,"purchases":[]}', "json")
    content = "purchase_key,merchant,city,raw_name,line_total\na,A,München,Milch,1\na,B,Berlin,Brot,2\n"
    with pytest.raises(ValidationError):
        parse_import(content, "csv")


def test_basket_missing_price_has_no_complete_index():
    from inflation_app.analytics import calculate_basket

    items = [{"product_id": 1, "name": "Milch", "quantity": "2", "unit": "l"}]
    result = calculate_basket(items, [observation("1")], [])
    assert result["complete"] is False
    assert result["index"] is None
    assert result["coverage_percent"] == "0.00"


def test_basket_keeps_quantities_fixed_and_converts_grams():
    from inflation_app.analytics import calculate_basket

    items = [{"product_id": 1, "name": "Kaffee", "quantity": "500", "unit": "g"}]
    base, current = observation("10"), observation("12.5")
    base["comparison_unit"] = current["comparison_unit"] = "kg"
    result = calculate_basket(items, [base], [current])
    assert result["base_cost"] == "5.00"
    assert result["current_cost"] == "6.25"
    assert result["index"] == "125.00"


def test_csv_export_escapes_spreadsheet_formulas():
    from inflation_app.transfer import safe_csv_value

    assert safe_csv_value("=1+1") == "'=1+1"
    assert safe_csv_value("  @SUM(A1)") == "'  @SUM(A1)"
    assert safe_csv_value("Milch") == "Milch"
