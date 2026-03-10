import json
import aiohttp
import asyncio
from typing import List, Dict, Any, AsyncIterator, Optional
from config import settings

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
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"API调用失败: {response.status}, {error_text}")

                data = await response.json()
                return data["choices"][0]["message"]["content"]
    except Exception as e:
        # 在实际应用中，应该进行更详细的错误处理和日志记录
        raise Exception(f"调用模型API时出错: {str(e)}")

async def stream_response(url: str, headers: Dict[str, str], payload: Dict[str, Any]) -> AsyncIterator[str]:
    """流式获取响应文本"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"API调用失败: {response.status}, {error_text}")

                # 兼容 OpenAI 风格 SSE：event/data 可能在同一网络分块中，也可能被拆分
                buffer = ""
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
                                yield content
                        except json.JSONDecodeError:
                            pass
    except Exception as e:
        # 在实际应用中，应该进行更详细的错误处理和日志记录
        raise Exception(f"流式调用模型API时出错: {str(e)}")
