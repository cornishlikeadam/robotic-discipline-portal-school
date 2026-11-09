#!/usr/bin/env python3
"""
Who is asking? Resolves a request's `Authorization: Bearer <token>` header to a user.

* Supabase mode (SUPABASE_URL + SUPABASE_ANON_KEY set): the browser signs in
  with an email link/code through supabase-js and sends its access token. The
  server asks Supabase who that token belongs to (GET /auth/v1/user), so no
  JWT secret has to live in this app.
* Dev mode (local only): when Supabase isn't configured AND the app isn't
  running on Vercel, a token like "dev:kj" signs you in as "dev:kj". This mode
  can never turn on in a Vercel deployment.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Tuple


@dataclass(frozen=True)
class User:
    id: str
    email: str = ""


def supabase_settings() -> Tuple[str, str]:
    return (
        os.environ.get("SUPABASE_URL", "").strip().rstrip("/"),
        os.environ.get("SUPABASE_ANON_KEY", "").strip(),
    )


def supabase_enabled() -> bool:
    url, key = supabase_settings()
    return bool(url and key)


def dev_auth_enabled() -> bool:
    if supabase_enabled():
        return False
    if os.environ.get("VERCEL"):
        return False
    return os.environ.get("CREATURE_DEV_AUTH", "1") != "0"


def auth_mode() -> str:
    if supabase_enabled():
        return "supabase"
    if dev_auth_enabled():
        return "dev"
    return "off"


def _bearer(header_value: Optional[str]) -> str:
    if not header_value:
        return ""
    parts = header_value.strip().split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return ""


# token -> (user or None, expires_at). Short cache so each chat turn doesn't
# round-trip to Supabase; a signed-out token stops working within a minute.
_CACHE: Dict[str, Tuple[Optional[User], float]] = {}
_CACHE_SECONDS = 60.0


def _fetch_supabase_user(token: str) -> Optional[User]:
    url, key = supabase_settings()
    req = urllib.request.Request(
        f"{url}/auth/v1/user",
        headers={"apikey": key, "Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return None
        raise
    user_id = data.get("id")
    if not user_id:
        return None
    return User(id=str(user_id), email=str(data.get("email") or ""))


# Swappable in tests.
supabase_user_fetcher: Callable[[str], Optional[User]] = _fetch_supabase_user


def resolve_user(authorization_header: Optional[str]) -> Optional[User]:
    token = _bearer(authorization_header)
    if not token:
        return None

    if dev_auth_enabled():
        if token.startswith("dev:") and 4 < len(token) <= 64:
            handle = "".join(ch for ch in token[4:].lower() if ch.isalnum() or ch in "-_.")
            if handle:
                return User(id=f"dev:{handle}", email=f"{handle}@dev.local")
        return None

    if not supabase_enabled():
        return None

    now = time.time()
    cached = _CACHE.get(token)
    if cached and cached[1] > now:
        return cached[0]
    user = supabase_user_fetcher(token)
    if len(_CACHE) > 2000:
        _CACHE.clear()
    _CACHE[token] = (user, now + _CACHE_SECONDS)
    return user
