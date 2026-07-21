from dotenv import load_dotenv

load_dotenv()

import uvicorn

from app.core.config import settings
from app.core.logging import get_logger

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
