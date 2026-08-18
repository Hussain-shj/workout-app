from dataclasses import dataclass


@dataclass
class ProgressionDecision:
    decision: str
    current_weight_kg: float | None
    recommended_weight_kg: float | None
    reason: str


def evaluate_progression(
    sets: list[dict],
    rep_min: int,
    rep_max: int,
    minimum_increment: float = 2.5,
    target_rir: float = 2.0,
) -> ProgressionDecision:
    completed = [s for s in sets if s.get("completed", True)]
    if not completed:
        return ProgressionDecision("MAINTAIN", None, None, "No completed sets available.")

    weights = [float(s["weight_kg"]) for s in completed]
    reps = [int(s["reps"]) for s in completed]
    rirs = [float(s["rir"]) for s in completed if s.get("rir") is not None]
    current_weight = max(weights) if weights else None
    avg_rir = sum(rirs) / len(rirs) if rirs else None

    same_weight = len(set(weights)) == 1
    all_top = all(r >= rep_max for r in reps)
    all_in_range = all(rep_min <= r <= rep_max for r in reps)
    any_below = any(r < rep_min for r in reps)

    if same_weight and all_top and (avg_rir is None or avg_rir >= max(1.0, target_rir - 0.5)):
        next_weight = round((current_weight or 0) + minimum_increment, 2)
        return ProgressionDecision(
            "INCREASE_WEIGHT",
            current_weight,
            next_weight,
            f"All working sets reached the top of the rep range ({rep_max}) with adequate reps in reserve.",
        )

    if any_below and avg_rir is not None and avg_rir <= 0.5:
        reduced = round(max(0, (current_weight or 0) - minimum_increment), 2)
        return ProgressionDecision(
            "REDUCE_LOAD",
            current_weight,
            reduced,
            "Repetitions fell below the target range while effort was near failure.",
        )

    if all_in_range:
        return ProgressionDecision(
            "INCREASE_REPS",
            current_weight,
            current_weight,
            "Keep the current load and progress repetitions toward the top of the target range.",
        )

    return ProgressionDecision(
        "MAINTAIN",
        current_weight,
        current_weight,
        "Maintain the current load until performance is stable inside the target rep range.",
    )
