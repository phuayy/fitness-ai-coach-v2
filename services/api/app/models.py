from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON
from app.core.db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    sessions: Mapped[list["WorkoutSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    exercise_type: Mapped[str] = mapped_column(String(64), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_reps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    valid_reps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    metrics_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    user: Mapped[User] = relationship(back_populates="sessions")
    reps: Mapped[list["RepEvent"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class RepEvent(Base):
    __tablename__ = "rep_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_sessions.id"), nullable=False, index=True)
    rep_index: Mapped[int] = mapped_column(Integer, nullable=False)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    feedback: Mapped[str] = mapped_column(Text, default="", nullable=False)
    metrics_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    session: Mapped[WorkoutSession] = relationship(back_populates="reps")
