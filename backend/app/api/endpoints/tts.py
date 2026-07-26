from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core import get_db, get_logger
from app.models import User
from app.schemas import TTSRequest
from app.services import (
    get_speaker_id_for_role,
    get_tts_cache,
    set_tts_cache,
    synthesize_role_voice,
)

router = APIRouter()
logger = get_logger(__name__)


@router.post(
    "/tts",
    tags=["TTS"],
    summary="文本转语音（TTS）",
    description=(
        "将文本合成为 WAV 音频并以 `audio/wav` 返回。\n\n"
        "解析顺序：\n"
        "1. 若请求中传入 `speakerId`，直接使用。\n"
        "2. 否则根据 `assistantRole` 查询该用户可用的默认 `default_speaker_id`。\n"
        "3. 若都拿不到 speaker：返回 400。\n\n"
        "成功后按 (user_id, text, speaker_id) 写入 Redis 缓存，下次命中直接返回缓存。\n\n"
        "错误：\n"
        "- 400：角色未配置语音且未传入 speakerId。\n"
        "- 401：未登录。\n"
        "- 500：TTS 上游或本地推理异常。\n"
        "- 502：TTS 服务不可用 / 响应错误。"
    ),
    response_description="WAV 音频二进制流（Content-Type: audio/wav）。",
    responses={
        200: {
            "description": "成功合成并返回 WAV 音频。",
            "content": {"audio/wav": {}},
        },
        400: {"description": "角色未配置语音且未传入 speakerId。"},
        401: {"description": "未提供有效 JWT。"},
        500: {"description": "TTS 上游或本地推理异常。"},
        502: {"description": "TTS 服务不可用或响应错误。"},
    },
)
async def tts(
    request: TTSRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """将文本合成为语音（WAV）。

    优先使用请求中的 `speakerId`；若为空则根据角色查询默认 speaker，再尝试 Redis 缓存。

    Args:
        request: TTS 请求体。
        db: 数据库会话（依赖注入）。
        current_user: 当前用户。

    Returns:
        WAV 二进制内容的 HTTP 响应。
    """
    try:
        speaker_id = request.speakerId
        if speaker_id is None or speaker_id == "":
            speaker_id = await get_speaker_id_for_role(db, request.assistantRole, current_user)
        if speaker_id is None or speaker_id == "":
            raise HTTPException(status_code=400, detail="该角色未配置语音，请传入 speakerId 或配置 default_speaker_id")

        cached = await get_tts_cache(current_user.id, request.text, speaker_id)
        if cached is not None:
            logger.info("tts_cache_hit", user_id=current_user.id)
            wav_bytes = cached
        else:
            wav_bytes = synthesize_role_voice(text=request.text, speaker_id=speaker_id)
            await set_tts_cache(current_user.id, request.text, speaker_id, wav_bytes)
        return Response(content=wav_bytes, media_type="audio/wav")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
