"""PIN hashing and signed-token helpers (standard library only).

Two token kinds share one format, '<base64url(json)>.<hmac-sha256 hex>':
- student tokens carry only 'sub' and 'exp' (make_token / verify_token);
- role tokens also carry a 'role' claim (make_role_token / verify_role_token).
verify_token rejects role tokens, so a parent token can never act as a student.
"""

import base64
import hashlib
import hmac
import json
import re
import secrets
import time

PBKDF2_ITERATIONS = 200_000

_PIN_RE = re.compile(r"[0-9]{4}")


def _is_valid_pin(pin: object) -> bool:
    return isinstance(pin, str) and _PIN_RE.fullmatch(pin) is not None


def _derive_pin_hash(pin: str, salt_hex: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", pin.encode(), bytes.fromhex(salt_hex), PBKDF2_ITERATIONS
    ).hex()


def hash_pin(pin: str) -> tuple[str, str]:
    """Return (pin_hash_hex, salt_hex) for a 4-digit PIN."""
    if not _is_valid_pin(pin):
        raise ValueError("PIN must be exactly 4 digits")
    salt = secrets.token_hex(16)
    return _derive_pin_hash(pin, salt), salt


def verify_pin(pin: str, pin_hash: str, salt: str) -> bool:
    """Return True if pin matches the stored hash/salt. Never raises."""
    try:
        if not _is_valid_pin(pin) or not isinstance(pin_hash, str) or not isinstance(salt, str):
            return False
        derived = _derive_pin_hash(pin, salt)
        return hmac.compare_digest(derived, pin_hash)
    except (ValueError, TypeError):
        return False


def _require_secret(secret: str) -> None:
    if not secret:
        raise ValueError("secret must not be empty")


def _sign(payload: str, secret: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _encode_claims(claims: dict, secret: str) -> str:
    body = json.dumps(claims, separators=(",", ":"), sort_keys=True)
    payload = base64.urlsafe_b64encode(body.encode()).decode().rstrip("=")
    return f"{payload}.{_sign(payload, secret)}"


def _decode_claims(token: str, secret: str, now: int | None = None) -> dict | None:
    """Return the verified, unexpired claims dict, or None. Never raises on a bad token."""
    _require_secret(secret)
    try:
        if not isinstance(token, str) or token.count(".") != 1:
            return None
        payload, sig = token.split(".")
        if not hmac.compare_digest(_sign(payload, secret), sig):
            return None
        padded = payload + "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        if not isinstance(data, dict):
            return None
        if not isinstance(data.get("sub"), str):
            return None
        expires_at = data.get("exp")
        if isinstance(expires_at, bool) or not isinstance(expires_at, (int, float)):
            return None
        current = int(time.time()) if now is None else now
        if current >= expires_at:
            return None
        return data
    except (ValueError, TypeError, KeyError, AttributeError):
        return None


def make_token(
    subject: str,
    secret: str,
    ttl_seconds: int = 8 * 3600,
    now: int | None = None,
) -> str:
    """Create a student token (no role claim)."""
    _require_secret(secret)
    issued_at = int(time.time()) if now is None else now
    return _encode_claims({"sub": subject, "exp": issued_at + ttl_seconds}, secret)


def verify_token(token: str, secret: str, now: int | None = None) -> str | None:
    """Return the subject if the token is an authentic, unexpired student token, else None.

    Tokens that carry a role claim are rejected here.
    """
    data = _decode_claims(token, secret, now)
    if data is None or "role" in data:
        return None
    return data["sub"]


def make_role_token(
    subject: str,
    role: str,
    secret: str,
    ttl_seconds: int = 28800,
    now: int | None = None,
) -> str:
    """Create a token that carries a role claim (e.g. 'parent')."""
    _require_secret(secret)
    if not isinstance(role, str) or not role:
        raise ValueError("role must be a non-empty string")
    issued_at = int(time.time()) if now is None else now
    return _encode_claims(
        {"sub": subject, "role": role, "exp": issued_at + ttl_seconds}, secret
    )


def verify_role_token(token: str, secret: str, now: int | None = None) -> tuple[str, str] | None:
    """Return (subject, role) for an authentic, unexpired role token, else None.

    Student tokens (no role claim) return None.
    """
    data = _decode_claims(token, secret, now)
    if data is None:
        return None
    role = data.get("role")
    if not isinstance(role, str) or not role:
        return None
    return data["sub"], role
