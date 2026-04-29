from functools import lru_cache
import json
from typing import Annotated, Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def parse_string_list(value: Any, *, field_name: str) -> list[str]:
    """Parse a settings field that may be a JSON list or comma-separated string.

    pydantic-settings parses complex types such as list[str] as JSON before
    validators run. The Settings model uses NoDecode for frontend_origins so this
    function can accept developer-friendly values such as:

      FRONTEND_ORIGINS=http://localhost:5173,https://example.vercel.app

    It also accepts strict JSON for teams that prefer platform-native JSON:

      FRONTEND_ORIGINS=["http://localhost:5173","https://example.vercel.app"]
    """
    if isinstance(value, list):
        parsed = value
    elif isinstance(value, str):
        raw_value = value.strip()
        if not raw_value:
            return []

        if raw_value.startswith("["):
            try:
                decoded = json.loads(raw_value)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"{field_name} must be either a comma-separated string or a JSON array of strings."
                ) from exc

            if not isinstance(decoded, list):
                raise ValueError(f"{field_name} JSON value must be an array of strings.")
            parsed = decoded
        else:
            parsed = raw_value.split(",")
    else:
        raise ValueError(f"{field_name} must be a string or a list of strings.")

    origins = [str(item).strip() for item in parsed if str(item).strip()]
    if not origins:
        raise ValueError(f"{field_name} must contain at least one origin.")
    return origins


class Settings(BaseSettings):
    app_env: str = "local"
    log_level: str = "INFO"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expires_minutes: int = 60 * 24 * 7
    database_url: str = "sqlite:///./fitness_ai.sqlite3"

    # NoDecode is important here. Without it, pydantic-settings tries to parse
    # FRONTEND_ORIGINS as JSON before our validator receives the value, so a
    # normal comma-separated .env value causes a SettingsError at app startup.
    frontend_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def parse_frontend_origins(cls, value: Any) -> list[str]:
        return parse_string_list(value, field_name="FRONTEND_ORIGINS")

    @property
    def sqlalchemy_database_url(self) -> str:
        # Render and several hosted databases may expose postgres://.
        # SQLAlchemy expects postgresql+psycopg:// when using psycopg 3.
        if self.database_url.startswith("postgres://"):
            return self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
