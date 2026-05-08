from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    open_ai_api_key: str | None = None
    ai_provider: str = "auto"
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_model: str = "gpt-5.4-mini"
    openai_analyzer_model: str | None = None
    database_url: str = "sqlite:///./vibefocus.db"
    cors_origins: str = "http://localhost:5173"
    port: int = 8000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def _valid_secret(self, value: str | None) -> bool:
        if not value:
            return False
        placeholders = {"your_api_key_here", "your_openai_api_key_here", "changeme"}
        clean = value.strip().strip("\"'")
        return bool(clean and clean.lower() not in placeholders)

    @property
    def has_anthropic(self) -> bool:
        if not self._valid_secret(self.anthropic_api_key):
            return False
        return self.anthropic_api_key.strip().strip("\"'").startswith("sk-ant-")

    @property
    def effective_openai_api_key(self) -> str | None:
        return self.openai_api_key or self.open_ai_api_key

    @property
    def has_openai(self) -> bool:
        if not self._valid_secret(self.effective_openai_api_key):
            return False
        return self.effective_openai_api_key.strip().strip("\"'").startswith("sk-")

    @property
    def resolved_ai_provider(self) -> str:
        provider = self.ai_provider.lower().strip()
        if provider in {"anthropic", "openai"}:
            return provider
        if self.has_anthropic:
            return "anthropic"
        if self.has_openai:
            return "openai"
        return "none"


settings = Settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite only
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
