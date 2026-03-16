from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://healthbridge:healthbridge@db:5432/healthbridge"
    JWT_SECRET: str = "change-me"
    JWT_EXPIRE_DAYS: int = 30
    API_KEY_AI_STUDIO: str = "change-me"
    FCM_DEVICE_TOKEN: str = ""
    FIREBASE_SA_PATH: str = "firebase-sa.json"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
