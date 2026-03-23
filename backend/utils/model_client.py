import json
import time
from typing import Any, AsyncIterator, Dict, List

import aiohttp

from config import settings
from logging_config import get_logger

logger = get_logger(__name__)

async def call_model_api(
    messages: List[Dict[str, str]],
    stream: bool = False
) -> Any:
    """
    调用外部大模型API

    Args:
        messages: 消息历史
        stream: 是否使用流式响应

    Returns:
        完整响应或流式响应生成器
    """
    url = f"{settings.MODEL_BASE_URL}/v1/chat/completions"
    
    headers = {
        "Content-Type": "application/json"
    }

    if settings.MODEL_API_KEY:
        headers["Authorization"] = f"Bearer {settings.MODEL_API_KEY}"

    payload = {
        "model": settings.MODEL_NAME,
        "messages": messages,
        "stream": stream
    }

    if stream:
        return stream_response(url, headers, payload)
    else:
        return await get_full_response(url, headers, payload)

async def get_full_response(url: str, headers: Dict[str, str], payload: Dict[str, Any]) -> str:
    """获取完整的响应文本"""
    t0 = time.monotonic()
    logger.info(
        "llm_request_start",
        url=url,
        model=settings.MODEL_NAME,
        stream=False,
    )
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(
                        "llm_upstream_error",
                        url=url,
                        status=response.status,
                        duration_s=round(time.monotonic() - t0, 3),
                        detail=error_text[:2000],
                    )
                    raise Exception(f"API调用失败: {response.status}, {error_text}")

                data = await response.json()
                content = data["choices"][0]["message"]["content"]
                logger.info(
                    "llm_response",
                    url=url,
                    status=response.status,
                    duration_s=round(time.monotonic() - t0, 3),
                    content_chars=len(content),
                )
                return content
    except Exception as e:
        logger.exception("llm_request_failed", url=url)
        raise Exception(f"调用模型API时出错: {str(e)}") from e

async def stream_response(url: str, headers: Dict[str, str], payload: Dict[str, Any]) -> AsyncIterator[str]:
    """流式获取响应文本"""
    t0 = time.monotonic()
    logger.info(
        "llm_request_start",
        url=url,
        model=settings.MODEL_NAME,
        stream=True,
    )
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(
                        "llm_upstream_error",
                        url=url,
                        status=response.status,
                        duration_s=round(time.monotonic() - t0, 3),
                        detail=error_text[:2000],
                    )
                    raise Exception(f"API调用失败: {response.status}, {error_text}")

                logger.info(
                    "llm_stream_open",
                    url=url,
                    status=response.status,
                    ttfb_s=round(time.monotonic() - t0, 3),
                )

                # 兼容 OpenAI 风格 SSE：event/data 可能在同一网络分块中，也可能被拆分
                buffer = ""
                chunk_index = 0
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

                        try:
                            json_data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        content = json_data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if content:
                            chunk_index += 1
                            yield content

                # 处理最后残留的一行
                tail = buffer.strip()
                if tail.startswith("data:"):
                    data_str = tail[5:].strip()
                    if data_str and data_str != "[DONE]":
                        try:
                            json_data = json.loads(data_str)
                            content = json_data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if content:
                                chunk_index += 1
                                yield content
                        except json.JSONDecodeError:
                            pass

                logger.info(
                    "llm_stream_done",
                    url=url,
                    duration_s=round(time.monotonic() - t0, 3),
                    delta_chunks=chunk_index,
                )
    except Exception as e:
        logger.exception("llm_stream_failed", url=url)
        raise Exception(f"流式调用模型API时出错: {str(e)}") from e
