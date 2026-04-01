import hashlib

from redis.asyncio import Redis

from app.core.settings import settings


def _make_key(user_id: int, text: str, speaker_id: str | None) -> str:
    payload = f"{user_id}:{speaker_id or ''}:{text}".encode()
    digest = hashlib.sha256(payload).hexdigest()
    return f"tts:{digest}"


_redis_client: Redis | None = None


def get_redis_client() -> Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.REDIS_URL)
    return _redis_client


async def get_tts_cache(user_id: int, text: str, speaker_id: str | None) -> bytes | None:
    """从 Redis 读取 TTS 缓存（若存在）。"""
    client = get_redis_client()
    key = _make_key(user_id, text, speaker_id)
    cached = await client.get(key)
    if cached is None:
        return None
    return bytes(cached)


async def set_tts_cache(user_id: int, text: str, speaker_id: str | None, data: bytes) -> None:
    client = get_redis_client()
    key = _make_key(user_id, text, speaker_id)
    await client.setex(key, settings.TTS_CACHE_TTL_SECONDS, data)
