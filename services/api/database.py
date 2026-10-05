"""Async database setup — SQLite (dev) or PostgreSQL (prod) via DATABASE_URL env var."""
from __future__ import annotations
import os
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.orm import DeclarativeBase

_raw_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./dc_digital_twin.db")

# common/database.py expects a plain postgresql:// URI; upgrade to asyncpg dialect here
if _raw_url.startswith("postgresql://"):
    DATABASE_URL: str = _raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _raw_url.startswith("postgres://"):
    DATABASE_URL: str = _raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
else:
    DATABASE_URL: str = _raw_url

engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    pool_pre_ping=True,
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
