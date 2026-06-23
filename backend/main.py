import uvicorn

from app.core.logging import get_logger
from app.core.config import settings

logger = get_logger(__name__)


if __name__ == "__main__":
    logger.info("app_start", address=f"0.0.0.0:{settings.PORT}")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True,
        access_log=False,
    )
