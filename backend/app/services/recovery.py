from dataclasses import dataclass


@dataclass
class RecoveryDecision:
    recovery_score: float
    fatigue_score: float
    recommendation: str


def calculate_recovery(
    sleep: int,
    energy: int,
    soreness: int,
    motivation: int,
    stress: int,
    performance_decline_pct: float = 0,
) -> RecoveryDecision:
    positive = ((sleep + energy + motivation) / 15) * 60
    soreness_component = ((6 - soreness) / 5) * 20
    stress_component = ((6 - stress) / 5) * 20
    recovery_score = max(0, min(100, round(positive + soreness_component + stress_component, 1)))

    subjective_fatigue = 100 - recovery_score
    performance_penalty = min(30, max(0, performance_decline_pct) * 3)
    fatigue_score = max(0, min(100, round(subjective_fatigue * 0.75 + performance_penalty, 1)))

    if fatigue_score >= 75 and performance_decline_pct >= 5:
        recommendation = "DELOAD_RECOMMENDED"
    elif fatigue_score >= 65:
        recommendation = "REDUCE_VOLUME"
    elif recovery_score < 55:
        recommendation = "MAINTAIN_OR_REDUCE_LOAD"
    else:
        recommendation = "NORMAL_TRAINING"

    return RecoveryDecision(recovery_score, fatigue_score, recommendation)
