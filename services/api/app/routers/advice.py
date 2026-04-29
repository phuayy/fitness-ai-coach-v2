from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import get_current_user
from app.models import RepEvent, User
from app.routers.sessions import get_owned_session
from app.schemas import AdviceRead
from app.services.advice_service import build_advice

router = APIRouter(prefix="/advice", tags=["advice"])


@router.get("/session/{session_id}", response_model=AdviceRead)
def session_advice(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
) -> AdviceRead:
    session = get_owned_session(session_id, current_user, db)
    reps = list(db.scalars(select(RepEvent).where(RepEvent.session_id == session.id).order_by(RepEvent.rep_index)))
    return AdviceRead(advice=build_advice(session, reps))
