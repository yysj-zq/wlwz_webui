from fastapi import APIRouter, Depends, HTTPException, Response

from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models.db_models import User
from services.models import TTSRequest
from services.roles_service import get_speaker_id_for_role
from services.tts_service import synthesize_role_voice
from utils.security import get_current_user
from utils.tts_cache import get_tts_cache, set_tts_cache
from logging_config import get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.post("/tts")
async def tts(
    request: TTSRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        speaker_id = request.speakerId
        if speaker_id is None or speaker_id == "":
            speaker_id = await get_speaker_id_for_role(
                db, request.assistantRole, current_user
            )
        if speaker_id is None or speaker_id == "":
            raise HTTPException(
                status_code=400,
                detail="该角色未配置语音（default_speaker_id），请在前端传入 speakerId 或在角色配置中设置",
            )
        preview = (request.text or "").replace("\n", " ").strip()
        if len(preview) > 80:
            preview = preview[:80] + "..."
        logger.info(
            "tts_route_request",
            assistant_role=request.assistantRole,
            speaker_id=speaker_id,
            text_len=len(request.text or ""),
            text_preview=preview,
        )
        # Redis 缓存：同一用户 + 文本 + 声音在短时间内直接复用
        cached = await get_tts_cache(current_user.id, request.text, speaker_id)
        if cached is not None:
            logger.info("tts_cache_hit", user_id=current_user.id)
            wav_bytes = cached
        else:
            wav_bytes = synthesize_role_voice(text=request.text, speaker_id=speaker_id)
            await set_tts_cache(current_user.id, request.text, speaker_id, wav_bytes)
        return Response(content=wav_bytes, media_type="audio/wav")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
