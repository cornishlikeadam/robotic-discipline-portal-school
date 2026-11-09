#!/usr/bin/env python3
"""
One small storage adapter so the Animal Scrypt kernel runs on either backend:

* SQLite  — local-first default (a file path or ":memory:")
* Postgres — Supabase (or any Postgres) when given a postgres:// / postgresql:// URL

The kernel keeps writing plain SQL with `?` placeholders. This adapter
translates placeholders for Postgres and returns rows that support both
`row["column"]` and `dict(row)` on either backend.
"""

from __future__ import annotations

import pathlib
import sqlite3
from typing import Any, Iterable, Optional

BASE_DIR = pathlib.Path(__file__).resolve().parent
POSTGRES_RLS_PATH = BASE_DIR / "postgres_rls.sql"


def is_postgres_url(target: str) -> bool:
    return target.startswith("postgres://") or target.startswith("postgresql://")


class Database:
    """Thin connection wrapper with the subset of sqlite3's API the kernel uses."""

    def __init__(self, target: str = ":memory:") -> None:
        self.target = target
        self.backend = "postgres" if is_postgres_url(target) else "sqlite"
        self._conn: Any = None
        self._connect()

    # --- connection management ---
    def _connect(self) -> None:
        if self.backend == "sqlite":
            self._conn = sqlite3.connect(self.target)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA foreign_keys = ON")
            return

        import psycopg  # imported lazily so SQLite-only installs need nothing extra
        from psycopg.rows import dict_row

        # prepare_threshold=None keeps this working behind Supabase's
        # transaction-mode pooler (port 6543), which can't hold prepared statements.
        self._conn = psycopg.connect(
            self.target,
            autocommit=False,
            row_factory=dict_row,
            prepare_threshold=None,
            connect_timeout=10,
        )

    def _ensure_open(self) -> None:
        if self.backend == "postgres" and (self._conn.closed or getattr(self._conn, "broken", False)):
            self._connect()

    # --- sqlite3-compatible surface ---
    def execute(self, sql: str, params: Iterable[Any] = ()) -> Any:
        params = tuple(params)
        if self.backend == "sqlite":
            return self._conn.execute(sql, params)

        self._ensure_open()
        cur = self._conn.cursor()
        try:
            cur.execute(sql.replace("?", "%s") if params else sql, params or None)
        except Exception:
            # A failed statement aborts the Postgres transaction; reset so the
            # next request on this warm connection isn't stuck.
            try:
                self._conn.rollback()
            except Exception:
                pass
            raise
        return cur

    def executescript(self, script: str) -> None:
        if self.backend == "sqlite":
            self._conn.executescript(script)
            return
        self._ensure_open()
        with self._conn.cursor() as cur:
            cur.execute(script)
        self._conn.commit()

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()

    # --- schema bootstrap ---
    def apply_schema(self, schema_sql: str) -> None:
        """Create tables if missing. On Postgres, also lock tables away from
        Supabase's public REST API (row level security with no policies)."""
        self.executescript(schema_sql)
        if self.backend == "postgres" and POSTGRES_RLS_PATH.exists():
            self.executescript(POSTGRES_RLS_PATH.read_text(encoding="utf-8"))


def open_database(target: Optional[str]) -> Database:
    return Database(target or ":memory:")
