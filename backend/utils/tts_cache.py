import hashlib
from typing import Optional

from redis.asyncio import Redis

from config import settings


def _make_key(user_id: int, text: str, speaker_id: Optional[str]) -> str:
    payload = f"{user_id}:{speaker_id or ''}:{text}".encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()
    return f"tts:{digest}"


_redis_client: Optional[Redis] = None


def get_redis_client() -> Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.REDIS_URL)
    return _redis_client


async def get_tts_cache(
    user_id: int,
    text: str,
    speaker_id: Optional[str],
) -> Optional[bytes]:
    client = get_redis_client()
    key = _make_key(user_id, text, speaker_id)
    data = await client.get(key)
    return data


async def set_tts_cache(
    user_id: int,
    text: str,
    speaker_id: Optional[str],
    data: bytes,
) -> None:
    client = get_redis_client()
    key = _make_key(user_id, text, speaker_id)
    await client.setex(
        key,
        settings.TTS_CACHE_TTL_SECONDS,
        data,
    )


