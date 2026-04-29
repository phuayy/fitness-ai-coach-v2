from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.models import User
from app.schemas import TokenRead, UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Annotated[Session, Depends(get_db)]) -> User:
    email = payload.email.lower().strip()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="Email is already registered")

    user = User(email=email, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenRead)
def login(payload: UserCreate, db: Annotated[Session, Depends(get_db)]) -> TokenRead:
    email = payload.email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return TokenRead(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserRead)
def me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user
