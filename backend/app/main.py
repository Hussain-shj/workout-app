from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes.auth import router as auth_router
from app.db.init_db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Workout APP API", version="0.2.0", lifespan=lifespan)
app.include_router(auth_router)


@app.get("/")
def root():
    return {"app": "Workout APP", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "healthy"}
