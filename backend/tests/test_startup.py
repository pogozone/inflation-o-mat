from alembic.migration import MigrationContext
from sqlalchemy import Column, Integer, MetaData, Table, create_engine

from startup import incompatible_changes


def test_legacy_schema_can_have_extra_objects():
    expected = MetaData()
    Table("purchase", expected, Column("id", Integer, primary_key=True))
    engine = create_engine("sqlite://")
    expected.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE legacy (id INTEGER)")
        connection.exec_driver_sql("ALTER TABLE purchase ADD COLUMN legacy_id INTEGER")
        connection.exec_driver_sql("CREATE INDEX ix_legacy ON purchase (legacy_id)")
        context = MigrationContext.configure(connection)
        assert incompatible_changes(context, expected) == []
        connection.exec_driver_sql(
            "ALTER TABLE purchase ADD COLUMN required_value INTEGER NOT NULL"
        )
        assert incompatible_changes(context, expected) == [
            "purchase.required_value: additional required column without a default"
        ]
        expected.tables["purchase"].append_column(Column("missing", Integer))
        assert any("add_column" in change for change in incompatible_changes(context, expected))
