from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.training import (
    Exercise,
    ExerciseAlternative,
    ExerciseSession,
    Program,
    ProgramDay,
    ProgramExercise,
    ProgressionRecommendation,
    WorkoutSession,
    WorkoutSet,
)
from app.models.user import User
from app.schemas.training import (
    CompleteWorkoutRequest,
    ExerciseNoteUpdate,
    ExerciseSwapRequest,
    ProgressionResponse,
    StartWorkoutRequest,
    WorkoutSetCreate,
    WorkoutSetResponse,
)
from app.services.progression import evaluate_progression

router = APIRouter(prefix="/workouts", tags=["Workouts"])


@router.get("/today")
def todays_workout(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    program = db.scalar(
        select(Program)
        .where(Program.user_id == current_user.id, Program.is_active.is_(True))
        .order_by(Program.id.desc())
    )
    if not program:
        raise HTTPException(status_code=404, detail="No active program")

    days = list(db.scalars(
        select(ProgramDay).where(ProgramDay.program_id == program.id).order_by(ProgramDay.day_order)
    ).all())
    if not days:
        raise HTTPException(status_code=404, detail="Program has no training days")

    completed_count = db.scalar(
        select(func.count(WorkoutSession.id)).where(
            WorkoutSession.user_id == current_user.id,
            WorkoutSession.completed_at.is_not(None),
        )
    ) or 0
    day = days[completed_count % len(days)]

    rows = db.execute(
        select(ProgramExercise, Exercise)
        .join(Exercise, Exercise.id == ProgramExercise.exercise_id)
        .where(ProgramExercise.program_day_id == day.id)
        .order_by(ProgramExercise.exercise_order)
    ).all()

    exercises = []
    for pe, exercise in rows:
        previous = db.execute(
            select(WorkoutSet.weight_kg, WorkoutSet.reps, WorkoutSet.rir)
            .join(ExerciseSession, ExerciseSession.id == WorkoutSet.exercise_session_id)
            .join(WorkoutSession, WorkoutSession.id == ExerciseSession.workout_session_id)
            .where(
                WorkoutSession.user_id == current_user.id,
                ExerciseSession.exercise_id == exercise.id,
                WorkoutSet.completed.is_(True),
            )
            .order_by(WorkoutSession.workout_date.desc(), WorkoutSet.set_number.asc())
            .limit(pe.target_sets)
        ).all()
        exercises.append({
            "program_exercise_id": pe.id,
            "exercise_id": exercise.id,
            "name": exercise.name_en,
            "name_ar": exercise.name_ar,
            "target_sets": pe.target_sets,
            "target_rep_min": pe.target_rep_min,
            "target_rep_max": pe.target_rep_max,
            "target_rir": pe.target_rir,
            "youtube_url": exercise.youtube_url,
            "previous_sets": [
                {"weight_kg": row.weight_kg, "reps": row.reps, "rir": row.rir} for row in previous
            ],
        })

    return {
        "program_id": program.id,
        "program_day_id": day.id,
        "day_name": day.name,
        "day_order": day.day_order,
        "exercise_count": len(exercises),
        "estimated_sets": sum(item[0].target_sets for item in rows),
        "exercises": exercises,
    }


@router.post("/start")
def start_workout(payload: StartWorkoutRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    day = db.scalar(
        select(ProgramDay)
        .join(Program, Program.id == ProgramDay.program_id)
        .where(ProgramDay.id == payload.program_day_id, Program.user_id == current_user.id, Program.is_active.is_(True))
    )
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
            "name_ar": exercise.name_ar,
            "primary_muscle": exercise.primary_muscle,
            "movement_pattern": exercise.movement_pattern,
            "youtube_url": exercise.youtube_url,
            "target_sets": pe.target_sets,
            "target_rep_min": pe.target_rep_min,
            "target_rep_max": pe.target_rep_max,
            "target_rir": pe.target_rir,
            "notes": None,
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


@router.put("/{workout_id}/exercises/{exercise_session_id}/notes")
def update_exercise_notes(
    workout_id: int,
    exercise_session_id: int,
    payload: ExerciseNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workout = db.get(WorkoutSession, workout_id)
    if not workout or workout.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workout not found")
    exercise_session = db.get(ExerciseSession, exercise_session_id)
    if not exercise_session or exercise_session.workout_session_id != workout.id:
        raise HTTPException(status_code=404, detail="Exercise session not found")
    exercise_session.notes = payload.notes.strip() if payload.notes else None
    db.commit()
    return {"exercise_session_id": exercise_session.id, "notes": exercise_session.notes}


@router.post("/{workout_id}/exercises/{exercise_session_id}/swap")
def swap_exercise(
    workout_id: int,
    exercise_session_id: int,
    payload: ExerciseSwapRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workout = db.get(WorkoutSession, workout_id)
    if not workout or workout.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workout not found")
    if workout.completed_at:
        raise HTTPException(status_code=400, detail="Workout already completed")

    exercise_session = db.get(ExerciseSession, exercise_session_id)
    if not exercise_session or exercise_session.workout_session_id != workout.id:
        raise HTTPException(status_code=404, detail="Exercise session not found")
    if db.scalar(select(func.count(WorkoutSet.id)).where(WorkoutSet.exercise_session_id == exercise_session.id)):
        raise HTTPException(status_code=400, detail="Cannot replace an exercise after sets have been recorded")

    current_exercise = db.get(Exercise, exercise_session.exercise_id)
    alternative = db.get(Exercise, payload.alternative_exercise_id)
    if not current_exercise or not alternative or not alternative.is_active:
        raise HTTPException(status_code=404, detail="Alternative exercise not found")

    explicit = db.scalar(
        select(ExerciseAlternative.id).where(
            ExerciseAlternative.exercise_id == current_exercise.id,
            ExerciseAlternative.alternative_exercise_id == alternative.id,
        )
    )
    same_pattern = (
        current_exercise.primary_muscle == alternative.primary_muscle
        and current_exercise.movement_pattern == alternative.movement_pattern
    )
    if not explicit and not same_pattern:
        raise HTTPException(status_code=400, detail="Selected exercise is not a compatible alternative")

    exercise_session.exercise_id = alternative.id

    if workout.program_day_id:
        program_exercise = db.scalar(
            select(ProgramExercise).where(
                ProgramExercise.program_day_id == workout.program_day_id,
                ProgramExercise.exercise_order == exercise_session.exercise_order,
            )
        )
        if program_exercise:
            program_exercise.exercise_id = alternative.id
            program_exercise.target_rep_min = alternative.rep_min or program_exercise.target_rep_min
            program_exercise.target_rep_max = alternative.rep_max or program_exercise.target_rep_max

    db.commit()
    return {
        "exercise_session_id": exercise_session.id,
        "exercise_id": alternative.id,
        "name": alternative.name_en,
        "name_ar": alternative.name_ar,
        "primary_muscle": alternative.primary_muscle,
        "movement_pattern": alternative.movement_pattern,
        "youtube_url": alternative.youtube_url,
        "target_rep_min": alternative.rep_min or 8,
        "target_rep_max": alternative.rep_max or 12,
    }


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
            "exercise": {"id": exercise.id, "name": exercise.name_en, "name_ar": exercise.name_ar, "youtube_url": exercise.youtube_url},
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
