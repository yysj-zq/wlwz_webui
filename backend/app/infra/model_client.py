import json
import time
from typing import Any, AsyncIterator

import aiohttp

from app.core.logging import get_logger
from app.core.settings import settings

logger = get_logger(__name__)


async def call_model_api(messages: list[dict[str, str]], stream: bool = False) -> Any:
    url = f"{settings.MODEL_BASE_URL}/v1/chat/completions"
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.MODEL_API_KEY:
        headers["Authorization"] = f"Bearer {settings.MODEL_API_KEY}"
    payload = {"model": settings.MODEL_NAME, "messages": messages, "stream": stream}

    if stream:
        return stream_response(url, headers, payload)
    return await get_full_response(url, headers, payload)


async def get_full_response(url: str, headers: dict[str, str], payload: dict[str, Any]) -> str:
    logger.info("[http] out", url=url, headers=headers, payload=payload)
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"API调用失败: {response.status}, {error_text}")
                data = await response.json()
                logger.info("[http] out-done", status=response.status, data=data)
                return data["choices"][0]["message"]["content"]
    except Exception as e:
        logger.exception("[http] out-error", url=url, headers=headers, payload=payload)
        raise Exception(f"调用模型API时出错: {str(e)}") from e


async def stream_response(url: str, headers: dict[str, str], payload: dict[str, Any]) -> AsyncIterator[str]:
    t0 = time.monotonic()
    logger.info("[http] out_stream", url=url, headers=headers, payload=payload)
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"API调用失败: {response.status}, {error_text}")
                logger.info("[http] out_stream", status=response.status, ttfb_s=round(time.monotonic() - t0, 3))

                buffer = ""
                chunk_index = 0
                full_content_parts: list[str] = []
                async for chunk in response.content:
                    buffer += chunk.decode("utf-8", errors="ignore")
                    lines = buffer.split("\n")
                    buffer = lines.pop() if lines else ""

                    for raw_line in lines:
                        line = raw_line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if not data_str or data_str == "[DONE]":
                            continue
                        logger.debug("[http] out_stream", data=data_str)
                        try:
                            json_data = json.loads(data_str)
                        except json.JSONDecodeError:
                            logger.exception("[http] out_stream: json解析失败", data=data_str)
                            continue
                        content = json_data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if content:
                            chunk_index += 1
                            full_content_parts.append(content)
                            logger.info("[http] out_stream", delta_index=chunk_index, content=content)
                            yield content

                tail = buffer.strip()
                if tail.startswith("data:"):
                    data_str = tail[5:].strip()
                    if data_str and data_str != "[DONE]":
                        try:
                            json_data = json.loads(data_str)
                            content = json_data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if content:
                                chunk_index += 1
                                full_content_parts.append(content)
                                logger.info("[http] out_stream", delta_index=chunk_index, content=content)
                                yield content
                        except json.JSONDecodeError:
                            logger.exception("[http] out_stream: json解析失败", data=data_str)

                full_content = "".join(full_content_parts)
                logger.info(
                    "[http] out_stream-done",
                    delta_chunks=chunk_index,
                    full_content=full_content,
                    full_content_chars=len(full_content),
                )
    except Exception as e:
        logger.exception("[http] out_stream-error", url=url, headers=headers, payload=payload)
        raise Exception(f"流式调用模型API时出错: {str(e)}") from e
