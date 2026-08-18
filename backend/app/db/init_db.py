from app import models  # noqa: F401
from app.db.seed import seed_exercises
from app.db.session import Base, SessionLocal, engine


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_exercises(db)
    finally:
        db.close()
