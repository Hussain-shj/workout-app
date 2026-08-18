from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.training import Exercise, Program, ProgramDay, ProgramExercise
from app.models.user import User
from app.schemas.training import ProgramDayResponse, ProgramExerciseResponse, ProgramGenerateRequest, ProgramResponse

router = APIRouter(prefix="/program", tags=["Programs"])


TEMPLATES = {
    3: [
        ("Push", [("Chest", "Horizontal Push", 2), ("Shoulders", "Vertical Push", 1), ("Triceps", "Isolation", 1)]),
        ("Pull", [("Back", "Vertical Pull", 1), ("Back", "Horizontal Pull", 1), ("Biceps", "Isolation", 1), ("Shoulders", "Isolation", 1)]),
        ("Legs", [("Quadriceps", "Squat", 1), ("Hamstrings", "Knee Flexion", 1), ("Glutes", "Hip Hinge", 1), ("Calves", "Isolation", 1)]),
    ],
    5: [
        ("Push", [("Chest", "Horizontal Push", 2), ("Shoulders", "Vertical Push", 1), ("Triceps", "Isolation", 1)]),
        ("Pull", [("Back", "Vertical Pull", 1), ("Back", "Horizontal Pull", 1), ("Biceps", "Isolation", 1)]),
        ("Legs", [("Quadriceps", "Squat", 1), ("Hamstrings", "Knee Flexion", 1), ("Glutes", "Hip Hinge", 1), ("Calves", "Isolation", 1)]),
        ("Upper", [("Chest", "Horizontal Push", 1), ("Back", "Horizontal Pull", 1), ("Back", "Vertical Pull", 1), ("Shoulders", "Isolation", 1)]),
        ("Lower", [("Quadriceps", "Squat", 1), ("Hamstrings", "Knee Flexion", 1), ("Glutes", "Hip Hinge", 1), ("Calves", "Isolation", 1)]),
    ],
}


def _serialize_program(program: Program, db: Session) -> ProgramResponse:
    days = list(db.scalars(select(ProgramDay).where(ProgramDay.program_id == program.id).order_by(ProgramDay.day_order)).all())
    day_responses = []
    for day in days:
        rows = db.execute(
            select(ProgramExercise, Exercise)
            .join(Exercise, Exercise.id == ProgramExercise.exercise_id)
            .where(ProgramExercise.program_day_id == day.id)
            .order_by(ProgramExercise.exercise_order)
        ).all()
        exercises = [
            ProgramExerciseResponse(
                id=pe.id,
                exercise_order=pe.exercise_order,
                target_sets=pe.target_sets,
                target_rep_min=pe.target_rep_min,
                target_rep_max=pe.target_rep_max,
                target_rir=pe.target_rir,
                exercise=ex,
            )
            for pe, ex in rows
        ]
        day_responses.append(ProgramDayResponse(id=day.id, day_order=day.day_order, name=day.name, exercises=exercises))
    return ProgramResponse(id=program.id, name=program.name, training_days_per_week=program.training_days_per_week, goal=program.goal, days=day_responses)


@router.get("", response_model=ProgramResponse)
def get_active_program(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    program = db.scalar(select(Program).where(Program.user_id == current_user.id, Program.is_active.is_(True)).order_by(Program.id.desc()))
    if not program:
        raise HTTPException(status_code=404, detail="No active program")
    return _serialize_program(program, db)


@router.post("/generate", response_model=ProgramResponse)
def generate_program(payload: ProgramGenerateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    training_days = int(payload.training_days)
    template = TEMPLATES[training_days]

    db.execute(update(Program).where(Program.user_id == current_user.id).values(is_active=False))
    program = Program(
        user_id=current_user.id,
        name=f"{training_days}-Day Adaptive Program",
        training_days_per_week=training_days,
        goal=current_user.training_goal,
        is_active=True,
    )
    db.add(program)
    db.flush()

    for day_order, (day_name, slots) in enumerate(template, start=1):
        day = ProgramDay(program_id=program.id, day_order=day_order, name=day_name)
        db.add(day)
        db.flush()
        exercise_order = 1
        for muscle, movement, count in slots:
            candidates = list(db.scalars(
                select(Exercise).where(
                    Exercise.is_active.is_(True),
                    Exercise.primary_muscle == muscle,
                    Exercise.movement_pattern == movement,
                ).order_by(Exercise.id).limit(count)
            ).all())
            for exercise in candidates:
                db.add(ProgramExercise(
                    program_day_id=day.id,
                    exercise_id=exercise.id,
                    exercise_order=exercise_order,
                    target_sets=3,
                    target_rep_min=exercise.rep_min or 8,
                    target_rep_max=exercise.rep_max or 12,
                    target_rir=2.0,
                ))
                exercise_order += 1

    current_user.available_training_days = training_days
    current_user.onboarding_complete = True
    db.commit()
    db.refresh(program)
    return _serialize_program(program, db)
