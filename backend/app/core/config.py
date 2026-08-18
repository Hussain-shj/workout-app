from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Workout APP"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/workout"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 30

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
