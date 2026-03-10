import logging

from fastapi import APIRouter, HTTPException, Response

from services.models import TTSRequest
from services.roles_service import get_speaker_id_by_role
from services.tts_service import synthesize_role_voice

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/tts")
async def tts(request: TTSRequest):
    try:
        speaker_id = request.speakerId or get_speaker_id_by_role(request.assistantRole)
        preview = (request.text or "").replace("\n", " ").strip()
        if len(preview) > 80:
            preview = preview[:80] + "..."
        logger.info(
            "TTS request: assistant_role=%s speaker_id=%s text_len=%d text_preview=%s",
            request.assistantRole,
            speaker_id,
            len(request.text or ""),
            preview,
        )
        wav_bytes = synthesize_role_voice(text=request.text, speaker_id=speaker_id)
        return Response(content=wav_bytes, media_type="audio/wav")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
