"""Upgrade known databases and verify the deployed legacy schema before boot."""

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from flask_migrate import upgrade
from sqlalchemy import inspect

from inflation_app.models import ReceiptUsage, db
from wsgi import app

LEGACY_REVISION = "c4b1e0a5d332"
SUPPORTED_HEAD = "b531bdd56e30"


def incompatible_changes(context, metadata, allowed_missing_table=None):
    problems = []
    for change in compare_metadata(context, metadata):
        if isinstance(change, list):
            problems.extend(f"{entry[0]}: {entry[2]}.{entry[3]}" for entry in change)
            continue
        operation = change[0]
        if operation == "add_table" and change[1].name == allowed_missing_table:
            continue
        if operation == "add_index" and change[1].table.name == allowed_missing_table:
            continue
        if operation in {"remove_table", "remove_index"}:
            continue
        if operation == "remove_column":
            column = change[3]
            if not column.nullable and column.server_default is None:
                problems.append(
                    f"{change[2]}.{column.name}: additional required column without a default"
                )
            continue
        problems.append(f"{operation}: {change[-1]}")
    return problems


def update_database():
    with app.app_context():
        config = app.extensions["migrate"].migrate.get_config()

        head = ScriptDirectory.from_config(config).get_current_head()
        with db.engine.connect() as connection:
            context = MigrationContext.configure(connection)
            if context.get_current_heads() == (LEGACY_REVISION,):
                # Never rewrite the recorded revision for a migration we do not have.
                usage_table = ReceiptUsage.__table__
                missing_usage_table = not inspect(connection).has_table(
                    usage_table.name
                )
                differences = incompatible_changes(
                    context,
                    db.metadata,
                    allowed_missing_table=usage_table.name
                    if missing_usage_table
                    else None,
                )
                if head != SUPPORTED_HEAD or differences:
                    operations = ", ".join(differences)
                    raise SystemExit(
                        f"Legacy schema {LEGACY_REVISION} cannot be used with "
                        f"head {head}. Schema differences: {operations or 'none'}."
                    )
                usage_table.create(connection, checkfirst=True)
                connection.commit()
                print(f"Verified legacy schema {LEGACY_REVISION}.")
                return
        upgrade()


if __name__ == "__main__":
    update_database()
