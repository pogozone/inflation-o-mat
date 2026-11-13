"""Database entities. Monetary values stay decimal strings across SQLite and MySQL."""

from datetime import datetime, timezone
from decimal import Decimal
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    brand = db.Column(db.String(255), default="")
    category = db.Column(db.String(255), default="")
    unit = db.Column(db.String(30), default="Stück")
    tags = db.Column(db.JSON, default=list)
    attributes = db.Column(db.JSON, default=dict)
    aliases = db.Column(db.JSON, default=list)
    merged_into_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=True)
    merge_history = db.Column(db.JSON, nullable=True)

    def to_dict(self):
        return {
            key: getattr(self, key)
            for key in (
                "id",
                "name",
                "brand",
                "category",
                "unit",
                "tags",
                "attributes",
                "aliases",
                "merged_into_id",
            )
        }


class Purchase(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    purchased_at = db.Column(db.String(10), nullable=False)
    merchant = db.Column(db.String(255), default="")
    branch = db.Column(db.String(255), default="")
    city = db.Column(db.String(255), default="")
    postal_code = db.Column(db.String(30), default="")
    country = db.Column(db.String(2), default="DE")
    channel = db.Column(db.String(20), default="store")
    currency = db.Column(db.String(3), default="EUR")
    status = db.Column(db.String(20), default="draft")
    receipt_total = db.Column(db.Numeric(36, 12), nullable=True)
    notes = db.Column(db.Text, default="")
    created_at = db.Column(
        db.String(40), default=lambda: datetime.now(timezone.utc).isoformat()
    )
    fingerprint = db.Column(db.String(64), index=True, nullable=False)
    items = db.relationship(
        "PurchaseItem",
        cascade="all, delete-orphan",
        backref="purchase",
        order_by="PurchaseItem.id",
    )

    def to_dict(self):
        data = {
            key: getattr(self, key)
            for key in (
                "id",
                "purchased_at",
                "merchant",
                "branch",
                "city",
                "postal_code",
                "country",
                "channel",
                "currency",
                "status",
                "receipt_total",
                "notes",
                "created_at",
                "fingerprint",
            )
        }
        if data["receipt_total"] is not None:
            data["receipt_total"] = f"{Decimal(str(data['receipt_total'])):.2f}"
        data["items"] = [item.to_dict() for item in self.items]
        return data


class PurchaseItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    purchase_id = db.Column(db.Integer, db.ForeignKey("purchase.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=True)
    product_snapshot = db.Column(db.JSON, default=dict)
    raw_name = db.Column(db.String(255), default="")
    quantity = db.Column(db.Numeric(36, 12), nullable=False)
    package_size = db.Column(db.Numeric(36, 12), nullable=True)
    unit = db.Column(db.String(30), nullable=False)
    line_total = db.Column(db.Numeric(36, 12), nullable=False)
    discount = db.Column(db.Numeric(36, 12), default="0")
    deposit = db.Column(db.Numeric(36, 12), default="0")
    is_offer = db.Column(db.Boolean, default=False)
    is_return = db.Column(db.Boolean, default=False)
    attributes = db.Column(db.JSON, default=dict)
    normalized_quantity = db.Column(db.Numeric(36, 12), nullable=True)
    normalized_unit = db.Column(db.String(30), nullable=True)
    comparison_price = db.Column(db.Numeric(36, 12), nullable=True)
    comparison_unit = db.Column(db.String(30), nullable=True)
    calculation_status = db.Column(db.String(80), default="missing_package_size")

    def to_dict(self):
        data = {
            column.name: getattr(self, column.name)
            for column in self.__table__.columns
            if column.name != "purchase_id"
        }
        for key, value in data.items():
            if isinstance(value, Decimal):
                data[key] = (
                    f"{value:.6f}"
                    if key in ("normalized_quantity", "comparison_price")
                    else format(value.normalize(), "f")
                )
        return data


class Basket(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    items = db.relationship(
        "BasketItem", cascade="all, delete-orphan", backref="basket"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "items": [item.to_dict() for item in self.items],
        }


class BasketItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    basket_id = db.Column(db.Integer, db.ForeignKey("basket.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=False)
    quantity = db.Column(db.Numeric(36, 12), nullable=False)
    unit = db.Column(db.String(30), nullable=False)

    def to_dict(self):
        return {
            "product_id": self.product_id,
            "quantity": format(Decimal(self.quantity).normalize(), "f"),
            "unit": self.unit,
        }


class Setting(db.Model):
    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.JSON, nullable=False)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(255), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)


class AuditLog(db.Model):
    """Unveränderliche Korrekturhistorie innerhalb derselben Transaktion."""

    id = db.Column(db.Integer, primary_key=True)
    action = db.Column(db.String(30), nullable=False)
    entity = db.Column(db.String(30), nullable=False)
    entity_id = db.Column(db.Integer, nullable=False)
    before = db.Column(db.JSON, nullable=True)
    after = db.Column(db.JSON, nullable=True)
    created_at = db.Column(
        db.String(40), default=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self):
        return {
            column.name: getattr(self, column.name) for column in self.__table__.columns
        }
