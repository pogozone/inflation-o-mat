from inflation_app.receipts import ReceiptExtraction, receipt_to_preview


def line(raw_name, **kwargs):
    return {
        "raw_name": raw_name,
        "quantity": "1",
        "package_size": "1",
        "unit": "Stück",
        "line_total": "1.00",
        "discount": "0",
        "deposit": "0",
        "is_offer": False,
        "is_return": False,
        "uncertainty": None,
        **kwargs,
    }


def extraction(*items):
    return ReceiptExtraction(
        purchased_at="2026-11-01",
        merchant="REWE",
        branch=None,
        city="Jena",
        postal_code="07743",
        country="DE",
        currency="EUR",
        items=list(items),
        warnings=[],
    )


def test_deposit_lines_are_removed(app):
    with app.app_context():
        preview = receipt_to_preview(
            extraction(
                line("PFAND"),
                line("LEERGUT GLAS", is_return=True),
                line("Joghurt", deposit="0.15"),
                line("Erdbeere"),  # kontrolliert: kein falscher Treffer
            ),
            "ab" * 32,
        )
    items = preview["purchases"][0]["items"]
    assert [item["raw_name"] for item in items] == ["Joghurt", "Erdbeere"]
    assert all(item["deposit"] == "0" for item in items)
    assert any(
        "Pfandzeile entfernt" in warning for warning in preview["warnings"]
    )
    assert not any(
        "Pfandzeile entfernt: Erdbeere" in warning for warning in preview["warnings"]
    )
