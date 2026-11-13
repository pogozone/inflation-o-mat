"""Cookie authentication with server-validated CSRF on every mutating API call."""

import hmac
import secrets
from flask import Blueprint, request, session
from werkzeug.security import generate_password_hash, check_password_hash
from .models import db, User
from .validation import ValidationError, object_payload, text

auth_bp = Blueprint("auth", __name__)


def session_state():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    user = (
        db.session.get(User, session.get("user_id")) if session.get("user_id") else None
    )
    return {
        "authenticated": bool(user),
        "csrf_token": session["csrf_token"],
        "setup_required": db.session.scalar(db.select(User.id).limit(1)) is None,
        "username": user.username if user else None,
    }


def protect_api():
    if not request.path.startswith("/api/") or request.path == "/api/health":
        return
    public = request.path in ("/api/session", "/api/setup", "/api/login")
    if not public and not session_state()["authenticated"]:
        raise ValidationError("Anmeldung erforderlich.", status=401)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        expected = session.get("csrf_token", "")
        supplied = request.headers.get("X-CSRF-Token", "")
        if not expected or not hmac.compare_digest(expected, supplied):
            raise ValidationError("CSRF-Token fehlt oder ist ungültig.")


@auth_bp.get("/api/session")
def get_session():
    return session_state()


@auth_bp.post("/api/setup")
def setup():
    if db.session.scalar(db.select(User.id).limit(1)) is not None:
        raise ValidationError("Einrichtung bereits abgeschlossen.", status=409)
    payload = object_payload(request.get_json())
    username = text(payload.get("username", ""), "username")
    password = payload.get("password", "")
    if (
        not username
        or not isinstance(password, str)
        or len(password) < 12
        or len(password) > 1024
    ):
        raise ValidationError(
            "Benutzername und Passwort mit mindestens 12 Zeichen erforderlich."
        )
    user = User(username=username, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    session.clear()
    session["user_id"] = user.id
    return session_state()


@auth_bp.post("/api/login")
def login():
    payload = object_payload(request.get_json())
    username = text(payload.get("username", ""), "username")
    password = payload.get("password", "")
    user = db.session.scalar(db.select(User).filter_by(username=username))
    if (
        not isinstance(password, str)
        or len(password) > 1024
        or not user
        or not check_password_hash(user.password_hash, password)
    ):
        raise ValidationError("Anmeldedaten ungültig.", status=401)
    session.clear()
    session["user_id"] = user.id
    return session_state()


@auth_bp.post("/api/logout")
def logout():
    session.clear()
    return session_state()
