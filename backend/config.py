import os
from pydantic_settings import BaseSettings
from typing import Optional
from dotenv import load_dotenv

# 加载.env文件中的环境变量（如果存在）
load_dotenv()

class Settings(BaseSettings):
    """应用配置设置"""

    # 服务配置
    API_PREFIX: str = "/api"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    PROJECT_NAME: str = "角色扮演对话API"
    DESCRIPTION: str = "提供角色扮演和聊天功能的后端 API"
    VERSION: str = "1.0.0"
    PORT: int = int(os.getenv("PORT", 8081))
    # CORS设置
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")

    # 日志配置
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: Optional[str] = os.getenv("LOG_FILE", './logs/app.log')

    # 大模型配置
    MODEL_BASE_URL: str = os.getenv("MODEL_BASE_URL", "http://localhost:8080")
    MODEL_API_KEY: Optional[str] = os.getenv("MODEL_API_KEY")
    MODEL_NAME: str = os.getenv("MODEL_NAME", "default-model")

    # 响应设置
    STREAM_DELAY: float = float(os.getenv("STREAM_DELAY", "0.02"))

    # TTS（Triton）配置
    TTS_TRITON_URL: str = os.getenv("TTS_TRITON_URL", "http://localhost:8000")
    TTS_MODEL_NAME: str = os.getenv("TTS_MODEL_NAME", "spark_tts")
    TTS_REQUEST_TIMEOUT: float = float(os.getenv("TTS_REQUEST_TIMEOUT", "30"))

    # 数据库配置
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite+aiosqlite:///./app.db"
    )

    # 认证 / JWT 配置
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-this-in-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
    )

    # Redis / TTS 缓存配置
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    TTS_CACHE_TTL_SECONDS: int = int(os.getenv("TTS_CACHE_TTL_SECONDS", "3600"))

    # 角色初始化：为 true 时每次启动根据配置文件重建内置角色
    INIT_BUILTIN_ROLES_ON_START: bool = os.getenv("INIT_BUILTIN_ROLES_ON_START", "false").lower() == "true"
    ROLES_CONFIG_PATH: str = os.getenv("ROLES_CONFIG_PATH", "config/roles.yaml")

    class Config:
        env_file = ".env"
        case_sensitive = True

# 创建全局配置实例
settings = Settings()
