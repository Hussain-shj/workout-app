from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.training import (
    Exercise,
    ExerciseSession,
    ProgramDay,
    ProgramExercise,
    ProgressionRecommendation,
    WorkoutSession,
    WorkoutSet,
)
from app.models.user import User
from app.schemas.training import CompleteWorkoutRequest, ProgressionResponse, StartWorkoutRequest, WorkoutSetCreate, WorkoutSetResponse
from app.services.progression import evaluate_progression

router = APIRouter(prefix="/workouts", tags=["Workouts"])


@router.post("/start")
def start_workout(payload: StartWorkoutRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    day = db.get(ProgramDay, payload.program_day_id)
    if not day:
        raise HTTPException(status_code=404, detail="Program day not found")

    session = WorkoutSession(
        user_id=current_user.id,
        program_day_id=day.id,
        started_at=datetime.utcnow(),
    )
    db.add(session)
    db.flush()

    rows = db.execute(
        select(ProgramExercise, Exercise)
        .join(Exercise, Exercise.id == ProgramExercise.exercise_id)
        .where(ProgramExercise.program_day_id == day.id)
        .order_by(ProgramExercise.exercise_order)
    ).all()

    exercises = []
    for pe, exercise in rows:
        ex_session = ExerciseSession(
            workout_session_id=session.id,
            exercise_id=exercise.id,
            exercise_order=pe.exercise_order,
        )
        db.add(ex_session)
        db.flush()
        exercises.append({
            "exercise_session_id": ex_session.id,
            "exercise_id": exercise.id,
            "name": exercise.name_en,
            "target_sets": pe.target_sets,
            "target_rep_min": pe.target_rep_min,
            "target_rep_max": pe.target_rep_max,
            "target_rir": pe.target_rir,
        })

    db.commit()
    return {"workout_session_id": session.id, "day_name": day.name, "started_at": session.started_at, "exercises": exercises}


@router.post("/{workout_id}/sets", response_model=WorkoutSetResponse)
def add_set(
    workout_id: int,
    payload: WorkoutSetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workout = db.get(WorkoutSession, workout_id)
    if not workout or workout.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workout not found")
    if workout.completed_at:
        raise HTTPException(status_code=400, detail="Workout already completed")

    ex_session = db.get(ExerciseSession, payload.exercise_session_id)
    if not ex_session or ex_session.workout_session_id != workout_id:
        raise HTTPException(status_code=400, detail="Invalid exercise session")

    next_number = (db.scalar(select(func.max(WorkoutSet.set_number)).where(WorkoutSet.exercise_session_id == ex_session.id)) or 0) + 1
    item = WorkoutSet(
        exercise_session_id=ex_session.id,
        set_number=next_number,
        weight_kg=payload.weight_kg,
        reps=payload.reps,
        rir=payload.rir,
        rpe=payload.rpe,
        completed=payload.completed,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{workout_id}/complete")
def complete_workout(
    workout_id: int,
    payload: CompleteWorkoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workout = db.get(WorkoutSession, workout_id)
    if not workout or workout.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workout not found")

    now = datetime.utcnow()
    workout.completed_at = now
    workout.notes = payload.notes
    if workout.started_at:
        workout.duration_minutes = max(1, int((now - workout.started_at).total_seconds() // 60))

    volume = db.scalar(
        select(func.coalesce(func.sum(WorkoutSet.weight_kg * WorkoutSet.reps), 0.0))
        .join(ExerciseSession, ExerciseSession.id == WorkoutSet.exercise_session_id)
        .where(ExerciseSession.workout_session_id == workout.id, WorkoutSet.completed.is_(True))
    ) or 0.0
    workout.total_volume_kg = float(volume)
    db.commit()
    return {"id": workout.id, "completed_at": workout.completed_at, "duration_minutes": workout.duration_minutes, "total_volume_kg": workout.total_volume_kg}


@router.get("/{workout_id}")
def get_workout(workout_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    workout = db.get(WorkoutSession, workout_id)
    if not workout or workout.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workout not found")

    day = db.get(ProgramDay, workout.program_day_id) if workout.program_day_id else None
    rows = db.execute(
        select(ExerciseSession, Exercise)
        .join(Exercise, Exercise.id == ExerciseSession.exercise_id)
        .where(ExerciseSession.workout_session_id == workout.id)
        .order_by(ExerciseSession.exercise_order)
    ).all()

    exercises = []
    for ex_session, exercise in rows:
        sets = list(db.scalars(select(WorkoutSet).where(WorkoutSet.exercise_session_id == ex_session.id).order_by(WorkoutSet.set_number)).all())
        exercises.append({
            "exercise_session_id": ex_session.id,
            "exercise": {"id": exercise.id, "name": exercise.name_en, "name_ar": exercise.name_ar},
            "notes": ex_session.notes,
            "sets": [{"id": s.id, "set_number": s.set_number, "weight_kg": s.weight_kg, "reps": s.reps, "rir": s.rir, "rpe": s.rpe, "completed": s.completed} for s in sets],
        })

    return {
        "id": workout.id,
        "day_name": day.name if day else None,
        "workout_date": workout.workout_date,
        "started_at": workout.started_at,
        "completed_at": workout.completed_at,
        "duration_minutes": workout.duration_minutes,
        "total_volume_kg": workout.total_volume_kg,
        "notes": workout.notes,
        "exercises": exercises,
    }


@router.get("/{workout_id}/progression", response_model=list[ProgressionResponse])
def workout_progression(workout_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    workout = db.get(WorkoutSession, workout_id)
    if not workout or workout.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workout not found")

    rows = db.execute(
        select(ExerciseSession, Exercise)
        .join(Exercise, Exercise.id == ExerciseSession.exercise_id)
        .where(ExerciseSession.workout_session_id == workout.id)
    ).all()
    output = []
    for ex_session, exercise in rows:
        sets = list(db.scalars(select(WorkoutSet).where(WorkoutSet.exercise_session_id == ex_session.id).order_by(WorkoutSet.set_number)).all())
        if not sets:
            continue
        decision = evaluate_progression(
            [{"weight_kg": s.weight_kg, "reps": s.reps, "rir": s.rir, "completed": s.completed} for s in sets],
            exercise.rep_min or 8,
            exercise.rep_max or 12,
            exercise.minimum_weight_increment or 2.5,
        )
        db.add(ProgressionRecommendation(
            user_id=current_user.id,
            exercise_id=exercise.id,
            decision=decision.decision,
            current_weight_kg=decision.current_weight_kg,
            recommended_weight_kg=decision.recommended_weight_kg,
            reason=decision.reason,
        ))
        output.append(ProgressionResponse(**decision.__dict__))

    db.commit()
    return output


@router.get("")
def workout_history(limit: int = 20, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sessions = list(db.scalars(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == current_user.id)
        .order_by(WorkoutSession.workout_date.desc(), WorkoutSession.id.desc())
        .limit(min(max(limit, 1), 100))
    ).all())
    return [
        {
            "id": w.id,
            "workout_date": w.workout_date,
            "completed_at": w.completed_at,
            "duration_minutes": w.duration_minutes,
            "total_volume_kg": w.total_volume_kg,
        }
        for w in sessions
    ]
