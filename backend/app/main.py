from fastapi import FastAPI

app = FastAPI(title="Workout APP API", version="0.1.0")


@app.get("/")
def root():
    return {"app": "Workout APP", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "healthy"}
