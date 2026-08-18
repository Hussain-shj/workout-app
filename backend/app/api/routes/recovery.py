from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.training import RecoveryLog
from app.models.user import User
from app.schemas.training import RecoveryCreate, RecoveryResponse
from app.services.recovery import calculate_recovery

router = APIRouter(prefix="/recovery", tags=["Recovery"])


@router.post("", response_model=RecoveryResponse)
def create_recovery_log(
    payload: RecoveryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    decision = calculate_recovery(
        sleep=payload.sleep,
        energy=payload.energy,
        soreness=payload.soreness,
        motivation=payload.motivation,
        stress=payload.stress,
    )

    existing = db.scalar(select(RecoveryLog).where(RecoveryLog.user_id == current_user.id, RecoveryLog.log_date == date.today()))
    if existing:
        existing.sleep = payload.sleep
        existing.energy = payload.energy
        existing.soreness = payload.soreness
        existing.motivation = payload.motivation
        existing.stress = payload.stress
        existing.recovery_score = decision.recovery_score
        existing.fatigue_score = decision.fatigue_score
        item = existing
    else:
        item = RecoveryLog(
            user_id=current_user.id,
            sleep=payload.sleep,
            energy=payload.energy,
            soreness=payload.soreness,
            motivation=payload.motivation,
            stress=payload.stress,
            recovery_score=decision.recovery_score,
            fatigue_score=decision.fatigue_score,
        )
        db.add(item)

    db.commit()
    db.refresh(item)
    return RecoveryResponse(
        id=item.id,
        log_date=item.log_date,
        sleep=item.sleep,
        energy=item.energy,
        soreness=item.soreness,
        motivation=item.motivation,
        stress=item.stress,
        recovery_score=item.recovery_score or 0,
        fatigue_score=item.fatigue_score or 0,
        recommendation=decision.recommendation,
    )


@router.get("/latest", response_model=RecoveryResponse | None)
def latest_recovery(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.scalar(
        select(RecoveryLog)
        .where(RecoveryLog.user_id == current_user.id)
        .order_by(RecoveryLog.log_date.desc(), RecoveryLog.id.desc())
    )
    if not item:
        return None
    decision = calculate_recovery(item.sleep, item.energy, item.soreness, item.motivation, item.stress)
    return RecoveryResponse(
        id=item.id,
        log_date=item.log_date,
        sleep=item.sleep,
        energy=item.energy,
        soreness=item.soreness,
        motivation=item.motivation,
        stress=item.stress,
        recovery_score=item.recovery_score or 0,
        fatigue_score=item.fatigue_score or 0,
        recommendation=decision.recommendation,
    )
