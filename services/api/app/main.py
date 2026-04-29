from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import advice
from app.api.routes import auth
from app.api.routes import health as health_routes
from app.api.routes import reps
from app.api.routes import sessions
from app.core.config import get_settings
from app.core.db import create_db_and_tables

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(levelname)s:%(name)s:%(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Fitness AI Local Pose Coach API",
    version="0.1.0",
    description="Backend API for account, session, rep-history, and AI advice storage.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()


app.include_router(health_routes.router)
app.include_router(auth.router, prefix="/auth")
app.include_router(sessions.router, prefix="/sessions")
app.include_router(reps.router, prefix="/reps")
app.include_router(advice.router, prefix="/advice")