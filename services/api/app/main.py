import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.db import create_db_and_tables
from app.routers import advice, auth, health, sessions

settings = get_settings()
logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Fitness AI API in %s mode", settings.app_env)
    create_db_and_tables()
    yield


app = FastAPI(
    title="Fitness AI Local Pose Coach API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(advice.router)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": "Fitness AI Local Pose Coach API", "docs": "/docs"}
