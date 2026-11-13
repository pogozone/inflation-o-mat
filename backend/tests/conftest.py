import pytest
from inflation_app import create_app
from inflation_app.models import db


@pytest.fixture
def app():
    app = create_app(
        {"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite://", "SECRET_KEY": "tests"}
    )
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    client = app.test_client()
    token = client.get("/api/session").json["csrf_token"]
    client.post(
        "/api/setup",
        json={"username": "test", "password": "long-password-123"},
        headers={"X-CSRF-Token": token},
    )
    return client


@pytest.fixture
def headers(client):
    return {"X-CSRF-Token": client.get("/api/session").json["csrf_token"]}
