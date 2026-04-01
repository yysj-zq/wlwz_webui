from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.session import get_db
from app.api.dependencies import get_current_user
from app.infra.tts_cache import get_tts_cache, set_tts_cache
from app.db.models import User
from app.api.schemas.tts import TTSRequest
from app.services.roles_service import get_speaker_id_for_role
from app.services.tts_service import synthesize_role_voice

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
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
