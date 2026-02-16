"""Security utilities: pairing, session tokens, rate limiting, credential redaction."""

from __future__ import annotations

import re
import secrets
import time
import uuid
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request

# ─── Pairing & Sessions ──────────────────────────────────────────────

# Set by CLI at startup
_pairing_code: str = ""
_sessions: dict[str, float] = {}  # token -> expiry timestamp
_SESSION_TTL = 3600 * 4  # 4 hours


def set_pairing_code(code: str) -> None:
    global _pairing_code
    _pairing_code = code


def get_pairing_code() -> str:
    return _pairing_code


def generate_pairing_code() -> str:
    """Generate a 6-digit numeric pairing code."""
    return f"{secrets.randbelow(1_000_000):06d}"


def verify_pairing_code(code: str) -> Optional[str]:
    """Verify pairing code. Returns session token on success, None on failure."""
    if not secrets.compare_digest(code.strip(), _pairing_code):
        return None
    token = uuid.uuid4().hex
    _sessions[token] = time.time() + _SESSION_TTL
    return token


def validate_session(token: str) -> bool:
    expiry = _sessions.get(token)
    if expiry is None:
        return False
    if time.time() > expiry:
        _sessions.pop(token, None)
        return False
    return True


# ─── FastAPI dependency ──────────────────────────────────────────────

async def require_session(authorization: str = Header(...)) -> str:
    """FastAPI dependency that enforces a valid session token."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    if not validate_session(token):
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    return token


# ─── Rate Limiter ─────────────────────────────────────────────────────

class RateLimiter:
    """Simple in-memory rate limiter keyed by client IP."""

    def __init__(self, max_requests: int = 30, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._hits: dict[str, list[float]] = {}

    def check(self, request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        timestamps = self._hits.setdefault(ip, [])
        # purge old
        timestamps[:] = [t for t in timestamps if now - t < self.window]
        if len(timestamps) >= self.max_requests:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        timestamps.append(now)


rate_limiter = RateLimiter()


async def rate_limit_dep(request: Request) -> None:
    rate_limiter.check(request)


# ─── Credential Redaction ─────────────────────────────────────────────

_PASSWORD_PATTERNS = [
    re.compile(r"(password=)([^ &;]+)", re.IGNORECASE),
    re.compile(r"(:\/\/[^:]+:)([^@]+)(@)", re.IGNORECASE),
]


def redact_password(text: str) -> str:
    """Replace password values in DSN/connection strings with '***'."""
    result = text
    for pattern in _PASSWORD_PATTERNS:
        result = pattern.sub(lambda m: m.group(1) + "***" + (m.group(3) if m.lastindex and m.lastindex >= 3 else ""), result)
    return result
