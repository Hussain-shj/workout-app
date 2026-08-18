from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.training import Exercise, ExerciseAlternative
from app.models.user import User
from app.schemas.training import AlternativeResponse, ExerciseResponse

router = APIRouter(prefix="/exercises", tags=["Exercises"])


@router.get("", response_model=list[ExerciseResponse])
def list_exercises(
    muscle: str | None = None,
    equipment: str | None = None,
    movement: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Exercise).where(Exercise.is_active.is_(True))
    if muscle:
        stmt = stmt.where(Exercise.primary_muscle.ilike(muscle))
    if equipment:
        stmt = stmt.where(Exercise.equipment.ilike(equipment))
    if movement:
        stmt = stmt.where(Exercise.movement_pattern.ilike(movement))
    if q:
        stmt = stmt.where(or_(Exercise.name_en.ilike(f"%{q}%"), Exercise.name_ar.ilike(f"%{q}%")))
    return list(db.scalars(stmt.order_by(Exercise.primary_muscle, Exercise.name_en)).all())


@router.get("/{exercise_id}", response_model=ExerciseResponse)
def get_exercise(
    exercise_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exercise = db.get(Exercise, exercise_id)
    if not exercise or not exercise.is_active:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


@router.get("/{exercise_id}/alternatives", response_model=list[AlternativeResponse])
def get_alternatives(
    exercise_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exercise = db.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    explicit = db.execute(
        select(ExerciseAlternative, Exercise)
        .join(Exercise, Exercise.id == ExerciseAlternative.alternative_exercise_id)
        .where(ExerciseAlternative.exercise_id == exercise_id, Exercise.is_active.is_(True))
        .order_by(ExerciseAlternative.priority)
    ).all()
    if explicit:
        return [AlternativeResponse(exercise=alt_ex, priority=link.priority, reason=link.reason) for link, alt_ex in explicit]

    fallback = list(db.scalars(
        select(Exercise).where(
            Exercise.id != exercise_id,
            Exercise.is_active.is_(True),
            Exercise.primary_muscle == exercise.primary_muscle,
            Exercise.movement_pattern == exercise.movement_pattern,
        ).limit(8)
    ).all())
    return [AlternativeResponse(exercise=item, priority=100 + i, reason="Same muscle and movement pattern") for i, item in enumerate(fallback)]
