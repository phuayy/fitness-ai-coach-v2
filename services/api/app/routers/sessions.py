from datetime import datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import get_current_user
from app.models import RepEvent, User, WorkoutSession
from app.schemas import RepCreate, SessionFinish, SessionRead, SessionStart

router = APIRouter(prefix="/sessions", tags=["sessions"])


def get_owned_session(session_id: int, user: User, db: Session) -> WorkoutSession:
    session = db.scalar(select(WorkoutSession).where(WorkoutSession.id == session_id, WorkoutSession.user_id == user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/start", response_model=SessionRead)
def start_session(
    payload: SessionStart,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
) -> WorkoutSession:
    session = WorkoutSession(user_id=current_user.id, exercise_type=payload.exercise_type)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/reps")
def record_rep(
    session_id: int,
    payload: RepCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, bool]:
    session = get_owned_session(session_id, current_user, db)
    if session.ended_at is not None:
        raise HTTPException(status_code=400, detail="Session is already finished")

    rep = RepEvent(
        session_id=session.id,
        rep_index=payload.rep_index,
        is_valid=payload.is_valid,
        confidence=payload.confidence,
        feedback=payload.feedback,
        metrics_json=payload.metrics
    )
    session.total_reps = max(session.total_reps, payload.rep_index)
    if payload.is_valid:
        session.valid_reps = max(session.valid_reps, sum(1 for item in session.reps if item.is_valid) + 1)

    db.add(rep)
    db.add(session)
    db.commit()
    return {"ok": True}


@router.post("/{session_id}/finish", response_model=SessionRead)
def finish_session(
    session_id: int,
    payload: SessionFinish,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
) -> WorkoutSession:
    session = get_owned_session(session_id, current_user, db)
    session.ended_at = datetime.now(timezone.utc)
    session.total_reps = payload.total_reps
    session.valid_reps = min(payload.valid_reps, payload.total_reps)
    session.duration_seconds = payload.duration_seconds
    session.metrics_json = {
        "valid_ratio": (session.valid_reps / session.total_reps) if session.total_reps else 0,
        "rep_rate_per_minute": (session.total_reps / payload.duration_seconds * 60) if payload.duration_seconds else None
    }
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("", response_model=list[SessionRead])
def list_sessions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
) -> list[WorkoutSession]:
    return list(db.scalars(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == current_user.id)
        .order_by(desc(WorkoutSession.started_at))
        .limit(25)
    ))
