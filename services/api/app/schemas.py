from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: datetime


class TokenRead(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class SessionStart(BaseModel):
    exercise_type: Literal["squat", "pushup"]


class SessionFinish(BaseModel):
    total_reps: int = Field(ge=0)
    valid_reps: int = Field(ge=0)
    duration_seconds: int = Field(ge=0)


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_type: str
    started_at: datetime
    ended_at: datetime | None
    total_reps: int
    valid_reps: int
    duration_seconds: int | None
    notes: str | None


class RepCreate(BaseModel):
    rep_index: int = Field(ge=1)
    is_valid: bool
    confidence: float = Field(ge=0, le=1)
    feedback: str = Field(max_length=1000)
    metrics: dict[str, Any] = Field(default_factory=dict)


class AdviceRead(BaseModel):
    advice: list[str]
