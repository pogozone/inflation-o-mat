"""Flask application factory; production schema changes run through Flask-Migrate."""

import os
from pathlib import Path
from flask import Flask, send_from_directory
from flask_migrate import Migrate
from werkzeug.exceptions import HTTPException
from sqlalchemy.engine import URL
from .models import db
from .validation import ValidationError


def create_app(test_config=None):
    frontend = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    app = Flask(__name__, static_folder=None)
    database_url = os.environ.get("DATABASE_URL")
    if not database_url and os.environ.get("MYSQL_HOST"):
        # URL.create behandelt auch Passwörter mit @, / oder : korrekt.
        database_url = URL.create(
            "mysql+pymysql",
            username=os.environ.get("MYSQL_USER", "inflation"),
            password=os.environ.get("MYSQL_PASSWORD", ""),
            host=os.environ["MYSQL_HOST"],
            port=int(os.environ.get("MYSQL_PORT", "3306")),
            database=os.environ.get("MYSQL_DATABASE", "inflation"),
            query={"charset": "utf8mb4"},
        )
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY") or os.urandom(32),
        SQLALCHEMY_DATABASE_URI=database_url or "sqlite:///inflation.db",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        MAX_CONTENT_LENGTH=10 * 1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "false").lower()
        == "true",
    )
    if test_config:
        app.config.update(test_config)
    db.init_app(app)
    Migrate(app, db)
    from .auth import auth_bp, protect_api
    from .products import products_bp
    from .purchases import purchases_bp
    from .imports import imports_bp
    from .analytics import analytics_bp
    from .receipts import receipts_bp
    from .transfer import transfer_bp

    app.before_request(protect_api)
    for blueprint in (
        auth_bp,
        products_bp,
        purchases_bp,
        imports_bp,
        analytics_bp,
        receipts_bp,
        transfer_bp,
    ):
        app.register_blueprint(blueprint)

    @app.errorhandler(ValidationError)
    def validation_error(error):
        db.session.rollback()
        result = {"error": str(error)}
        if error.details is not None:
            result["details"] = error.details
        return result, error.status

    @app.errorhandler(HTTPException)
    def http_error(error):
        db.session.rollback()
        return {"error": error.description}, error.code

    @app.get("/api/health")
    def health():
        db.session.execute(db.text("SELECT 1"))
        return {
            "status": "ok",
            "database": db.engine.dialect.name,
            "ai_configured": bool(os.environ.get("OPENAI_API_KEY")),
        }

    @app.get("/")
    @app.get("/<path:path>")
    def frontend_files(path=""):
        if path.startswith("api/"):
            return {"error": "Unbekannter API-Endpunkt."}, 404
        if not (frontend / "index.html").exists():
            return {"error": "Frontend zuerst mit npm run build erstellen."}, 404
        if path and (frontend / path).is_file():
            return send_from_directory(frontend, path)
        return send_from_directory(frontend, "index.html")

    @app.cli.command("init-db")
    def init_db():
        """Create the initial schema for a local development database."""
        db.create_all()

    return app
