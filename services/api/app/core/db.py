from __future__ import annotations

from collections.abc import Generator
import logging

from fastapi import HTTPException, status
from sqlalchemy import create_engine
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class Base(DeclarativeBase):
    pass


engine = None
SessionLocal: sessionmaker[Session] | None = None


def mask_database_url(url: str) -> str:
    if "://" not in url:
        return "***"

    scheme, rest = url.split("://", 1)

    if "@" not in rest:
        return f"{scheme}://***"

    _, host_part = rest.rsplit("@", 1)
    return f"{scheme}://***:***@{host_part}"


def initialize_database_engine() -> None:
    global engine, SessionLocal

    database_url = settings.sqlalchemy_database_url

    if not database_url:
        logger.warning(
            "[db] Database is disabled or DATABASE_URL is a placeholder. "
            "API will start, but database-dependent routes will return 503."
        )
        return

    connect_args = (
        {"check_same_thread": False}
        if database_url.startswith("sqlite")
        else {}
    )

    try:
        logger.info("[db] Creating database engine: %s", mask_database_url(database_url))

        engine = create_engine(
            database_url,
            connect_args=connect_args,
            pool_pre_ping=True,
        )

        SessionLocal = sessionmaker(
            bind=engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )

    except ArgumentError as exc:
        logger.exception("[db] Invalid DATABASE_URL. Starting with database disabled.")

        engine = None
        SessionLocal = None

    except Exception:
        logger.exception("[db] Failed to initialize database engine.")

        engine = None
        SessionLocal = None


initialize_database_engine()


def is_database_available() -> bool:
    return engine is not None and SessionLocal is not None


def get_db() -> Generator[Session, None, None]:
    if SessionLocal is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "database_disabled",
                "message": (
                    "Database storage is not configured yet. "
                    "The app is running in placeholder mode. "
                    "Set DB_ENABLED=true and provide a valid DATABASE_URL to enable this route."
                ),
            },
        )

    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def create_db_and_tables() -> None:
    if engine is None:
        logger.warning("[db] Skipping table creation because database is disabled.")
        return

    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)