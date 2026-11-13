"""Lokaler Schnellstart nach dem Frontend-Build, ohne Docker.

Die integrierte Flask-Entwicklungsumgebung ist nur für Entwicklung gedacht.
Docker verwendet stattdessen Gunicorn und Datenbankmigrationen.
"""

import os

from dotenv import load_dotenv

load_dotenv()

from inflation_app import create_app
from inflation_app.models import db

app = create_app()
with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(
        host=os.environ.get("FLASK_HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
        debug=False,
    )
