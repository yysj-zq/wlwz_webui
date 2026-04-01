"""Infrastructure adapters for external systems."""

from app.infra.model_client import call_model_api
from app.infra.tts_cache import get_tts_cache, set_tts_cache

__all__ = [
    "call_model_api",
    "get_tts_cache",
    "set_tts_cache",
]
