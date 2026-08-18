from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.training import Exercise, ExerciseAlternative


EXERCISES = [
    ("Barbell Bench Press", "بنش برس بالبار", "Chest", "Triceps, Front Delts", "Horizontal Push", "Barbell", 6, 10, 2.5),
    ("Dumbbell Bench Press", "بنش برس دمبل", "Chest", "Triceps, Front Delts", "Horizontal Push", "Dumbbell", 8, 12, 2.0),
    ("Smith Machine Bench Press", "بنش برس سميث", "Chest", "Triceps, Front Delts", "Horizontal Push", "Smith Machine", 8, 12, 2.5),
    ("Machine Chest Press", "ضغط صدر جهاز", "Chest", "Triceps, Front Delts", "Horizontal Push", "Machine", 8, 12, 5.0),
    ("Incline Dumbbell Press", "ضغط صدر علوي دمبل", "Chest", "Triceps, Front Delts", "Horizontal Push", "Dumbbell", 8, 12, 2.0),
    ("Cable Fly", "تفتيح صدر كيبل", "Chest", None, "Isolation", "Cable", 10, 15, 2.5),
    ("Overhead Press", "ضغط كتف بالبار", "Shoulders", "Triceps", "Vertical Push", "Barbell", 6, 10, 2.5),
    ("Dumbbell Shoulder Press", "ضغط كتف دمبل", "Shoulders", "Triceps", "Vertical Push", "Dumbbell", 8, 12, 2.0),
    ("Lateral Raise", "رفرفة جانبية", "Shoulders", None, "Isolation", "Dumbbell", 12, 20, 1.0),
    ("Cable Lateral Raise", "رفرفة جانبية كيبل", "Shoulders", None, "Isolation", "Cable", 12, 20, 1.25),
    ("Lat Pulldown", "سحب علوي", "Back", "Biceps", "Vertical Pull", "Cable", 8, 12, 5.0),
    ("Neutral Grip Pulldown", "سحب علوي قبضة محايدة", "Back", "Biceps", "Vertical Pull", "Cable", 8, 12, 5.0),
    ("Assisted Pull-Up", "عقلة بمساعدة", "Back", "Biceps", "Vertical Pull", "Machine", 6, 10, 5.0),
    ("Single Arm Cable Pulldown", "سحب علوي يد واحدة", "Back", "Biceps", "Vertical Pull", "Cable", 10, 15, 2.5),
    ("Seated Cable Row", "تجديف كيبل جالس", "Back", "Biceps, Rear Delts", "Horizontal Pull", "Cable", 8, 12, 5.0),
    ("Chest Supported Row", "تجديف مدعوم للصدر", "Back", "Biceps, Rear Delts", "Horizontal Pull", "Machine", 8, 12, 5.0),
    ("Barbell Row", "تجديف بالبار", "Back", "Biceps, Rear Delts", "Horizontal Pull", "Barbell", 6, 10, 2.5),
    ("Rear Delt Fly", "تفتيح كتف خلفي", "Shoulders", "Upper Back", "Isolation", "Machine", 12, 20, 5.0),
    ("Dumbbell Curl", "بايسبس دمبل", "Biceps", None, "Isolation", "Dumbbell", 8, 12, 1.0),
    ("Cable Curl", "بايسبس كيبل", "Biceps", None, "Isolation", "Cable", 10, 15, 2.5),
    ("Rope Pushdown", "ترايسبس حبل", "Triceps", None, "Isolation", "Cable", 10, 15, 2.5),
    ("Overhead Cable Extension", "تمديد ترايسبس فوق الرأس", "Triceps", None, "Isolation", "Cable", 10, 15, 2.5),
    ("Back Squat", "سكوات بالبار", "Quadriceps", "Glutes, Hamstrings", "Squat", "Barbell", 6, 10, 2.5),
    ("Hack Squat", "هاك سكوات", "Quadriceps", "Glutes", "Squat", "Machine", 8, 12, 5.0),
    ("Leg Press", "ضغط أرجل", "Quadriceps", "Glutes", "Squat", "Machine", 8, 15, 5.0),
    ("Leg Extension", "تمديد الأرجل", "Quadriceps", None, "Isolation", "Machine", 10, 15, 5.0),
    ("Romanian Deadlift", "ديدلفت روماني", "Glutes", "Hamstrings, Back", "Hip Hinge", "Barbell", 6, 10, 2.5),
    ("Dumbbell Romanian Deadlift", "ديدلفت روماني دمبل", "Glutes", "Hamstrings", "Hip Hinge", "Dumbbell", 8, 12, 2.0),
    ("Lying Leg Curl", "ليج كيرل مستلقي", "Hamstrings", None, "Knee Flexion", "Machine", 8, 12, 5.0),
    ("Seated Leg Curl", "ليج كيرل جالس", "Hamstrings", None, "Knee Flexion", "Machine", 8, 12, 5.0),
    ("Standing Calf Raise", "سمانة واقف", "Calves", None, "Isolation", "Machine", 10, 20, 5.0),
    ("Seated Calf Raise", "سمانة جالس", "Calves", None, "Isolation", "Machine", 10, 20, 5.0),
]


def _youtube_search(name: str) -> str:
    return "https://www.youtube.com/results?search_query=" + name.replace(" ", "+") + "+exercise+form"


def seed_exercises(db: Session) -> None:
    if db.scalar(select(Exercise.id).limit(1)):
        return

    created = {}
    for name_en, name_ar, muscle, secondary, movement, equipment, rep_min, rep_max, increment in EXERCISES:
        item = Exercise(
            name_en=name_en,
            name_ar=name_ar,
            primary_muscle=muscle,
            secondary_muscles=secondary,
            movement_pattern=movement,
            equipment=equipment,
            difficulty="Intermediate",
            rep_min=rep_min,
            rep_max=rep_max,
            minimum_weight_increment=increment,
            youtube_url=_youtube_search(name_en),
            is_active=True,
        )
        db.add(item)
        db.flush()
        created[name_en] = item

    alternative_groups = [
        ["Barbell Bench Press", "Dumbbell Bench Press", "Smith Machine Bench Press", "Machine Chest Press"],
        ["Lateral Raise", "Cable Lateral Raise"],
        ["Lat Pulldown", "Neutral Grip Pulldown", "Assisted Pull-Up", "Single Arm Cable Pulldown"],
        ["Seated Cable Row", "Chest Supported Row", "Barbell Row"],
        ["Dumbbell Curl", "Cable Curl"],
        ["Rope Pushdown", "Overhead Cable Extension"],
        ["Back Squat", "Hack Squat", "Leg Press"],
        ["Romanian Deadlift", "Dumbbell Romanian Deadlift"],
        ["Lying Leg Curl", "Seated Leg Curl"],
        ["Standing Calf Raise", "Seated Calf Raise"],
    ]

    for group in alternative_groups:
        for source_name in group:
            source = created[source_name]
            priority = 1
            for alt_name in group:
                if alt_name == source_name:
                    continue
                db.add(ExerciseAlternative(
                    exercise_id=source.id,
                    alternative_exercise_id=created[alt_name].id,
                    priority=priority,
                    reason="Same primary muscle and similar movement pattern",
                ))
                priority += 1

    db.commit()
