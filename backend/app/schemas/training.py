from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class ExerciseResponse(BaseModel):
    id: int
    name_en: str
    name_ar: str | None = None
    primary_muscle: str
    secondary_muscles: str | None = None
    movement_pattern: str
    equipment: str
    difficulty: str | None = None
    rep_min: int | None = None
    rep_max: int | None = None
    minimum_weight_increment: float | None = None
    instructions: str | None = None
    common_mistakes: str | None = None
    youtube_url: str | None = None

    model_config = {"from_attributes": True}


class AlternativeResponse(BaseModel):
    exercise: ExerciseResponse
    priority: int
    reason: str | None = None


class ProgramGenerateRequest(BaseModel):
    training_days: Literal[3, 5]


class ProgramExerciseResponse(BaseModel):
    id: int
    exercise_order: int
    target_sets: int
    target_rep_min: int
    target_rep_max: int
    target_rir: float | None
    exercise: ExerciseResponse


class ProgramDayResponse(BaseModel):
    id: int
    day_order: int
    name: str
    exercises: list[ProgramExerciseResponse]


class ProgramResponse(BaseModel):
    id: int
    name: str
    training_days_per_week: int
    goal: str | None
    days: list[ProgramDayResponse]


class StartWorkoutRequest(BaseModel):
    program_day_id: int


class WorkoutSetCreate(BaseModel):
    exercise_session_id: int
    weight_kg: float = Field(ge=0)
    reps: int = Field(ge=1, le=100)
    rir: float = Field(ge=0, le=10)
    rpe: float | None = Field(default=None, ge=0, le=10)
    completed: bool = True


class WorkoutSetUpdate(BaseModel):
    weight_kg: float = Field(ge=0)
    reps: int = Field(ge=1, le=100)
    rir: float = Field(ge=0, le=10)
    rpe: float | None = Field(default=None, ge=0, le=10)
    completed: bool = True


class WorkoutSetResponse(WorkoutSetCreate):
    id: int
    set_number: int

    model_config = {"from_attributes": True}


class ExerciseSessionResponse(BaseModel):
    id: int
    exercise_order: int
    notes: str | None
    exercise: ExerciseResponse
    sets: list[WorkoutSetResponse]


class WorkoutResponse(BaseModel):
    id: int
    workout_date: date
    started_at: datetime | None
    completed_at: datetime | None
    duration_minutes: int | None
    total_volume_kg: float
    notes: str | None
    day_name: str | None
    exercises: list[ExerciseSessionResponse]


class CompleteWorkoutRequest(BaseModel):
    notes: str | None = None


class ExerciseNoteUpdate(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)


class ExerciseSwapRequest(BaseModel):
    alternative_exercise_id: int


class RecoveryCreate(BaseModel):
    sleep: int = Field(ge=1, le=5)
    energy: int = Field(ge=1, le=5)
    soreness: int = Field(ge=1, le=5)
    motivation: int = Field(ge=1, le=5)
    stress: int = Field(ge=1, le=5)


class RecoveryResponse(RecoveryCreate):
    id: int
    log_date: date
    recovery_score: float
    fatigue_score: float
    recommendation: str


class ProgressionResponse(BaseModel):
    decision: str
    current_weight_kg: float | None
    recommended_weight_kg: float | None
    reason: str