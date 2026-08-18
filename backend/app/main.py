from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.exercises import router as exercises_router
from app.api.routes.programs import router as programs_router
from app.api.routes.recovery import router as recovery_router
from app.api.routes.workouts import router as workouts_router
from app.db.init_db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Workout APP API", version="0.4.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://workout-frontend-production-067c.up.railway.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(exercises_router)
app.include_router(programs_router)
app.include_router(workouts_router)
app.include_router(recovery_router)


@app.get("/")
def root():
    return {"app": "Workout APP", "status": "ok", "version": "0.4.1"}


@app.get("/health")
def health():
    return {"status": "healthy"}
