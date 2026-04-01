import io
import struct
import time
import wave
from functools import lru_cache
from typing import Any

import requests

from app.core.logging import get_logger
from app.core.settings import settings

logger = get_logger(__name__)


def _build_tts_payload(text: str, speaker_id: str) -> dict[str, Any]:
    return {
        "inputs": [
            {"name": "target_text", "shape": [1, 1], "datatype": "BYTES", "data": [text]},
            {"name": "speaker_id", "shape": [1, 1], "datatype": "BYTES", "data": [speaker_id]},
        ]
    }


def _float_to_pcm16(audio_f32: list[float]) -> bytes:
    pcm_data = bytearray()
    for sample in audio_f32:
        clipped = max(-1.0, min(1.0, float(sample)))
        pcm_data += struct.pack("<h", int(clipped * 32767.0))
    return bytes(pcm_data)


def _build_wav_bytes(audio_f32: list[float], sample_rate: int) -> bytes:
    pcm16 = _float_to_pcm16(audio_f32)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16)
    return buffer.getvalue()


def _get_sample_rate(model_name: str) -> int:
    return 16000 if model_name == "spark_tts" else 24000


def _extract_audio_data(audio_data: Any) -> list[float]:
    if isinstance(audio_data, list) and audio_data and isinstance(audio_data[0], list):
        if len(audio_data) == 1:
            audio_data = audio_data[0]
        else:
            flattened = []
            for row in audio_data:
                if isinstance(row, list):
                    flattened.extend(row)
            audio_data = flattened
    if not isinstance(audio_data, list):
        raise ValueError("TTS 输出格式非法，audio_data 不是列表")

    values: list[float] = []
    for item in audio_data:
        try:
            values.append(float(item))
        except (TypeError, ValueError):
            continue
    if not values:
        raise ValueError("TTS 输出为空")
    return values


@lru_cache(maxsize=16)
def _is_decoupled_model(triton_url: str, model_name: str) -> bool:
    config_url = f"{triton_url}/v2/models/{model_name}/config"
    t0 = time.monotonic()
    logger.info("tts_config_request", url=config_url)
    resp = requests.get(config_url, timeout=settings.TTS_REQUEST_TIMEOUT, verify=False)
    logger.info(
        "tts_upstream_response",
        url=config_url,
        status_code=resp.status_code,
        duration_s=round(time.monotonic() - t0, 3),
    )
    resp.raise_for_status()
    config = resp.json()
    return bool(config.get("model_transaction_policy", {}).get("decoupled", False))


def synthesize_role_voice(text: str, speaker_id: str) -> bytes:
    if not text or not text.strip():
        raise ValueError("text 不能为空")
    if not speaker_id:
        raise ValueError("speaker_id 不能为空")

    triton_url = settings.TTS_TRITON_URL.rstrip("/")
    model_name = settings.TTS_MODEL_NAME
    infer_url = f"{triton_url}/v2/models/{model_name}/infer"
    payload = _build_tts_payload(text.strip(), speaker_id)
    try:
        if _is_decoupled_model(triton_url, model_name):
            raise ValueError(
                f"当前模型 {model_name} 启用了 decoupled transaction policy，"
                "Triton HTTP /infer 不支持。请切换到非 decoupled 的 TTS 模型，或改为 gRPC 流式推理。"
            )
        resp = requests.post(
            infer_url,
            headers={"Content-Type": "application/json"},
            json=payload,
            params={"request_id": "0"},
            timeout=settings.TTS_REQUEST_TIMEOUT,
            verify=False,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Triton 返回错误 {resp.status_code}: {resp.text.strip()}")
        result = resp.json()
        audio_raw = result["outputs"][0]["data"]
        audio_f32 = _extract_audio_data(audio_raw)
        return _build_wav_bytes(audio_f32, _get_sample_rate(model_name))
    except requests.RequestException as exc:
        raise RuntimeError(f"TTS 请求失败: {exc}") from exc
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError(f"TTS 响应解析失败: {exc}") from exc
