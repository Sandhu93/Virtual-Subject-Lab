from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.example"), extra="ignore")

    app_env: str = Field(default="development", alias="APP_ENV")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    worker_poll_seconds: int = Field(default=2, alias="WORKER_POLL_SECONDS")

    database_url: str = Field(
        default="postgresql+psycopg://virtual_subject:virtual_subject@localhost:5432/virtual_subject",
        alias="DATABASE_URL",
    )
    minio_endpoint: str = Field(default="localhost:9000", alias="MINIO_ENDPOINT")
    minio_access_key: str = Field(default="minioadmin", alias="MINIO_ACCESS_KEY")
    minio_secret_key: str = Field(default="minioadmin", alias="MINIO_SECRET_KEY")
    minio_bucket: str = Field(default="virtual-subject", alias="MINIO_BUCKET")
    minio_secure: bool = Field(default=False, alias="MINIO_SECURE")
    storage_backend: str = Field(default="minio", alias="STORAGE_BACKEND")

    tribe_mode: str = Field(default="mock", alias="TRIBE_MODE")
    tribe_model_id: str = Field(default="facebook/tribev2", alias="TRIBE_MODEL_ID")
    tribe_cache_dir: Path = Field(default=Path(".cache/tribe"), alias="TRIBE_CACHE_DIR")
    tribe_device: str = Field(default="auto", alias="TRIBE_DEVICE")
    tribe_upstream_version: str = Field(default="0.1.0", alias="TRIBE_UPSTREAM_VERSION")
    tribe_weights_source: str = Field(
        default="huggingface:facebook/tribev2",
        alias="TRIBE_WEIGHTS_SOURCE",
    )

    default_project_name: str = Field(default="Default Project", alias="DEFAULT_PROJECT_NAME")
    default_user_email: str = Field(
        default="researcher@example.com",
        alias="DEFAULT_USER_EMAIL",
    )
    default_user_name: str = Field(default="Researcher", alias="DEFAULT_USER_NAME")

    oat_version: str = Field(default="0.5.1", alias="OAT_VERSION")
    app_git_commit: str = Field(default="unknown", alias="APP_GIT_COMMIT")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
