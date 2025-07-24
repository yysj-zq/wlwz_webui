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

    # CORS设置
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")

    # 日志配置
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: Optional[str] = os.getenv("LOG_FILE", './logs/app.log')

    # 大模型配置
    MODEL_BASE_URL: str = os.getenv("MODEL_BASE_URL", "http://localhost:8080")
    MODEL_API_KEY: Optional[str] = os.getenv("MODEL_API_KEY")
    MODEL_NAME: str = os.getenv("MODEL_NAME")

    # 响应设置
    STREAM_DELAY: float = float(os.getenv("STREAM_DELAY", "0.02"))

    class Config:
        env_file = ".env"
        case_sensitive = True

# 创建全局配置实例
settings = Settings()
