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
    logger.info(
        "[http] out",
        url=url,
        headers=headers,
        payload=payload,
    )
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"API调用失败: {response.status}, {error_text}")

                data = await response.json()
                logger.info(
                    "[http] out-done",
                    status=response.status,
                    data=data,
                )
                content = data["choices"][0]["message"]["content"]
                return content
    except Exception as e:
        logger.exception(
            "[http] out-error",
            url=url,
            headers=headers,
            payload=payload,
        )
        raise Exception(f"调用模型API时出错: {str(e)}") from e

async def stream_response(url: str, headers: Dict[str, str], payload: Dict[str, Any]) -> AsyncIterator[str]:
    """流式获取响应文本"""
    t0 = time.monotonic()
    logger.info(
        "[http] out_stream",
        url=url,
        headers=headers,
        payload=payload,
    )
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"API调用失败: {response.status}, {error_text}")

                logger.info(
                    "[http] out_stream",
                    status=response.status,
                    ttfb_s=round(time.monotonic() - t0, 3),
                )

                # 兼容 OpenAI 风格 SSE：event/data 可能在同一网络分块中，也可能被拆分
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

                        logger.debug(
                            "[http] out_stream",
                            data=data_str,
                        )
                        try:
                            json_data = json.loads(data_str)
                        except json.JSONDecodeError:
                            logger.exception(
                                "[http] out_stream: json解析失败",
                                data=data_str,
                            )
                            continue

                        content = json_data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if content:
                            chunk_index += 1
                            full_content_parts.append(content)
                            logger.info(
                                "[http] out_stream",
                                delta_index=chunk_index,
                                content=content,
                            )
                            yield content

                # 处理最后残留的一行
                tail = buffer.strip()
                if tail.startswith("data:"):
                    data_str = tail[5:].strip()
                    if data_str and data_str != "[DONE]":
                        logger.debug(
                            "[http] out_stream",
                            data=data_str,
                        )
                        try:
                            json_data = json.loads(data_str)
                            content = json_data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if content:
                                chunk_index += 1
                                full_content_parts.append(content)
                                logger.info(
                                    "[http] out_stream",
                                    delta_index=chunk_index,
                                    content=content,
                                )
                                yield content
                        except json.JSONDecodeError:
                            logger.exception(
                                "[http] out_stream: json解析失败",
                                data=data_str,
                            )

                full_content = "".join(full_content_parts)
                logger.info(
                    "[http] out_stream-done",
                    delta_chunks=chunk_index,
                    full_content=full_content,
                    full_content_chars=len(full_content),
                )
    except Exception as e:
        logger.exception(
            "[http] out_stream-error",
            url=url,
            headers=headers,
            payload=payload,
        )
        raise Exception(f"流式调用模型API时出错: {str(e)}") from e
