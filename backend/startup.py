"""Upgrade known databases and verify the deployed legacy schema before boot."""

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from flask_migrate import upgrade

from inflation_app.models import db
from wsgi import app

LEGACY_REVISION = "c4b1e0a5d332"
SUPPORTED_HEAD = "3a6ccaac11f2"


def incompatible_changes(context, metadata):
    problems = []
    for change in compare_metadata(context, metadata):
        if isinstance(change, list):
            problems.extend(f"{entry[0]}: {entry[2]}.{entry[3]}" for entry in change)
            continue
        operation = change[0]
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
                differences = incompatible_changes(context, db.metadata)
                if head != SUPPORTED_HEAD or differences:
                    operations = ", ".join(differences)
                    raise SystemExit(
                        f"Legacy schema {LEGACY_REVISION} cannot be used with "
                        f"head {head}. Schema differences: {operations or 'none'}."
                    )
                print(f"Verified legacy schema {LEGACY_REVISION}.")
                return
        upgrade()


if __name__ == "__main__":
    update_database()
