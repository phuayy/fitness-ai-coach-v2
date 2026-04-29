from fastapi import APIRouter

from app.core.config import get_settings
from app.core.db import is_database_available

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "environment": settings.app_env,
        "database": {
            "enabled": settings.db_enabled,
            "available": is_database_available(),
            "mode": "active" if is_database_available() else "placeholder",
        },
    }


@router.get("/")
def root() -> dict:
    return {
        "message": "Fitness AI Local Pose Coach API",
        "health": "/health",
        "docs": "/docs",
    }