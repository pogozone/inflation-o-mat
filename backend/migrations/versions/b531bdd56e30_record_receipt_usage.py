"""Record token usage for receipt recognition."""

from alembic import op
import sqlalchemy as sa

revision = "b531bdd56e30"
down_revision = "3a6ccaac11f2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "receipt_usage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("model", sa.String(255), nullable=False),
        sa.Column("input_tokens", sa.BigInteger(), nullable=False),
        sa.Column("output_tokens", sa.BigInteger(), nullable=False),
        sa.Column("total_tokens", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_receipt_usage_recorded_at", "receipt_usage", ["recorded_at"])


def downgrade():
    op.drop_table("receipt_usage")
