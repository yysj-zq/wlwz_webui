from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    API_PREFIX: str = Field(default="/api")
    DEBUG: bool = Field(default=False)
    PROJECT_NAME: str = Field(default="角色扮演对话API")
    DESCRIPTION: str = Field(default="提供角色扮演和聊天功能的后端 API")
    VERSION: str = Field(default="1.0.0")
    PORT: int = Field(default=8081)
    CORS_ORIGINS: str = Field(default="*")

    LOG_LEVEL: str = Field(default="INFO")
    LOG_FILE: str = Field(default="./logs/app.log")
    LOG_JSON: bool = Field(default=False)
    LOG_ENABLE_FILE: bool = Field(default=True)

    MODEL_BASE_URL: str = Field(default="http://localhost:8080")
    MODEL_API_KEY: str | None = Field(default=None)
    MODEL_NAME: str = Field(default="default-model")
    STREAM_DELAY: float = Field(default=0.02)

    TTS_TRITON_URL: str = Field(default="http://localhost:8000")
    TTS_MODEL_NAME: str = Field(default="spark_tts")
    TTS_REQUEST_TIMEOUT: float = Field(default=30)

    DATABASE_URL: str = Field(default="sqlite+aiosqlite:///./app.db")
    SQLALCHEMY_ECHO: bool = Field(default=False)
    # 仅 pytest/CI 使用（见 tests/conftest）；应用运行时不读取，但 .env 中若存在须声明以免 extra_forbidden
    TEST_DATABASE_URL: str | None = Field(default=None)

    JWT_SECRET_KEY: str = Field(default="change-this-in-production")
    JWT_ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=1440)

    REDIS_URL: str = Field(default="redis://localhost:6379/0")
    TTS_CACHE_TTL_SECONDS: int = Field(default=3600)

    INIT_BUILTIN_ROLES_ON_START: bool = Field(default=False)
    ROLES_CONFIG_PATH: str = Field(default="config/roles.yaml")

    def cors_origins_list(self) -> list[str]:
        raw = (self.CORS_ORIGINS or "").strip()
        if not raw or raw == "*":
            return ["*"]
        return [item.strip() for item in raw.split(",") if item.strip()]


settings = Settings()
