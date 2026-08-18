# Workout APP

Adaptive gym workout tracking application.

## Stack
- Frontend: React + TypeScript
- Backend: FastAPI + Python
- Database: PostgreSQL
- ORM: SQLAlchemy
- Deployment: Railway

## MVP Goals
- User authentication and onboarding
- 3-day PPL and 5-day Push/Pull/Legs/Upper/Lower programs
- Exercise library and intelligent exercise replacement
- Workout tracking: sets, reps, weight, RIR, optional RPE, notes
- Workout and exercise history
- Personal records
- Rules-based progressive overload
- Recovery and fatigue tracking
- Deload recommendation framework

## Architecture
```text
frontend/
backend/
  app/
    api/
    core/
    db/
    models/
    schemas/
    services/
    engines/
```

The AI layer will remain separate from the rules-based training, progression, and recovery engines so the core app continues to work even if AI services are unavailable.
