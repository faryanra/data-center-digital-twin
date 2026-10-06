"""Async database setup — SQLite (dev) or PostgreSQL (prod) via DATABASE_URL env var."""
from __future__ import annotations

import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

_raw_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./dc_digital_twin.db")

# Upgrade a plain postgresql:// URI to the asyncpg dialect used by this engine.
if _raw_url.startswith("postgresql://"):
    DATABASE_URL: str = _raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _raw_url.startswith("postgres://"):
    DATABASE_URL: str = _raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
else:
    DATABASE_URL: str = _raw_url

# Managed Postgres providers (Neon, Supabase, Render) hand out libpq-style URLs
# with query params asyncpg rejects (sslmode, channel_binding). Strip them from
# the URL and translate to asyncpg's own connect args so the string works as-is.
_connect_args: dict = {}
if DATABASE_URL.startswith("postgresql+asyncpg://"):
    _parts = urlsplit(DATABASE_URL)
    _query = dict(parse_qsl(_parts.query))
    _sslmode = _query.pop("sslmode", None)
    _query.pop("channel_binding", None)
    if _sslmode and _sslmode != "disable":
        _connect_args["ssl"] = True
    DATABASE_URL = urlunsplit(
        (_parts.scheme, _parts.netloc, _parts.path, urlencode(_query), _parts.fragment)
    )

engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    pool_pre_ping=True,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
