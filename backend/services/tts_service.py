import io
import logging
import struct
import wave
from functools import lru_cache
from typing import List

import requests

from config import settings

logger = logging.getLogger(__name__)


def _build_tts_payload(text: str, speaker_id: str) -> dict:
    return {
        "inputs": [
            {
                "name": "target_text",
                "shape": [1, 1],
                "datatype": "BYTES",
                "data": [text],
            },
            {
                "name": "speaker_id",
                "shape": [1, 1],
                "datatype": "BYTES",
                "data": [speaker_id],
            },
        ]
    }


def _float_to_pcm16(audio_f32: List[float]) -> bytes:
    pcm_data = bytearray()
    for sample in audio_f32:
        clipped = max(-1.0, min(1.0, float(sample)))
        pcm_value = int(clipped * 32767.0)
        pcm_data += struct.pack("<h", pcm_value)
    return bytes(pcm_data)


def _build_wav_bytes(audio_f32: List[float], sample_rate: int) -> bytes:
    pcm16 = _float_to_pcm16(audio_f32)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16)
    return buffer.getvalue()


def _get_sample_rate(model_name: str) -> int:
    if model_name == "spark_tts":
        return 16000
    return 24000


def _extract_audio_data(audio_data) -> List[float]:
    # 兼容 Triton 可能返回 [N] 或 [1, N]
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

    values: List[float] = []
    for item in audio_data:
        try:
            values.append(float(item))
        except (TypeError, ValueError):
            continue

    if not values:
        raise ValueError("TTS 输出为空")

    max_abs = max(abs(v) for v in values)
    min_v = min(values)
    max_v = max(values)
    logger.info(
        "TTS waveform stats before normalize: len=%d min=%.6f max=%.6f max_abs=%.6f",
        len(values),
        min_v,
        max_v,
        max_abs,
    )
    return values


@lru_cache(maxsize=16)
def _is_decoupled_model(triton_url: str, model_name: str) -> bool:
    config_url = f"{triton_url}/v2/models/{model_name}/config"
    resp = requests.get(config_url, timeout=settings.TTS_REQUEST_TIMEOUT, verify=False)
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
        logger.info(
            "TTS upstream request: model=%s url=%s speaker_id=%s text_len=%d",
            model_name,
            infer_url,
            speaker_id,
            len(text.strip()),
        )
        if _is_decoupled_model(triton_url, model_name):
            raise ValueError(
                f"当前模型 {model_name} 启用了 decoupled transaction policy，"
                "Triton HTTP /infer 不支持。请切换到非 decoupled 的 TTS 模型（如 spark_tts/f5_tts），"
                "或改为 gRPC 流式推理。"
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
            detail = resp.text.strip()
            logger.error(
                "TTS upstream error: model=%s status=%s detail=%s",
                model_name,
                resp.status_code,
                detail,
            )
            if "speech_token" in detail:
                raise RuntimeError(
                    "Triton cosyvoice2 推理失败：缺少 speech_token。"
                    "通常表示当前 speaker_id 未在服务端缓存，或该模型需要 reference_wav/reference_text 才能合成。"
                    f" 上游返回: {detail}"
                )
            raise RuntimeError(f"Triton 返回错误 {resp.status_code}: {detail}")

        result = resp.json()
        audio_raw = result["outputs"][0]["data"]
        audio_f32 = _extract_audio_data(audio_raw)
        return _build_wav_bytes(audio_f32, _get_sample_rate(model_name))
    except requests.RequestException as exc:
        logger.exception("TTS Triton 请求失败")
        raise RuntimeError(f"TTS 请求失败: {exc}") from exc
    except (KeyError, TypeError, ValueError) as exc:
        logger.exception("TTS 响应解析失败")
        raise RuntimeError(f"TTS 响应解析失败: {exc}") from exc
