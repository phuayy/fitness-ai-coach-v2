from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def parse_frontend_origins(value: Any) -> list[str]:
    if value is None or value == "":
        return ["http://localhost:5173"]

    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]

    raw = str(value).strip()

    if raw.startswith("["):
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            raise ValueError("FRONTEND_ORIGINS JSON value must be a list")
        return [str(item).strip() for item in parsed if str(item).strip()]

    return [item.strip() for item in raw.split(",") if item.strip()]


def normalize_database_url(value: Any) -> str | None:
    raw = "" if value is None else str(value).strip().strip('"').strip("'")

    disabled_values = {
        "",
        "disabled",
        "__disabled__",
        "none",
        "null",
        "placeholder",
        "__placeholder__",
        "<your-render-postgres-internal-database-url>",
        "your-render-postgres-internal-database-url",
    }

    if raw.lower() in disabled_values:
        return None

    if raw.startswith("DATABASE_URL="):
        raw = raw.split("=", 1)[1].strip()

    lowered = raw.lower()

    placeholder_tokens = [
        "your-render-postgres",
        "your-database-url",
        "internal-database-url",
        "user:password@host",
        "<",
        ">",
    ]

    if any(token in lowered for token in placeholder_tokens):
        return None

    if raw.startswith("postgres://"):
        return raw.replace("postgres://", "postgresql+psycopg://", 1)

    if raw.startswith("postgresql://"):
        return raw.replace("postgresql://", "postgresql+psycopg://", 1)

    if raw.startswith("postgresql+psycopg://"):
        return raw

    if raw.startswith("sqlite:///") or raw.startswith("sqlite:////"):
        return raw

    return None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "local"
    log_level: str = "INFO"

    jwt_secret: str = "replace-this-with-a-long-random-secret"
    jwt_expires_minutes: int = 10080

    db_enabled: bool = True
    database_url: str = "sqlite:///./fitness_ai.sqlite3"

    frontend_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def validate_frontend_origins(cls, value: Any) -> list[str]:
        return parse_frontend_origins(value)

    @property
    def normalized_database_url(self) -> str | None:
        if not self.db_enabled:
            return None

        return normalize_database_url(self.database_url)

    @property
    def database_available(self) -> bool:
        return self.normalized_database_url is not None

    @property
    def sqlalchemy_database_url(self) -> str | None:
        return self.normalized_database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()