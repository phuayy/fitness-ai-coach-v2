from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from .config import get_settings

settings = get_settings()
connect_args = {"check_same_thread": False} if settings.sqlalchemy_database_url.startswith("sqlite") else {}
engine = create_engine(settings.sqlalchemy_database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_db_and_tables() -> None:
    # MVP convenience. Replace with Alembic migrations before serious production use.
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
