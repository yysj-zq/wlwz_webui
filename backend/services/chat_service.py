from typing import AsyncIterator, Dict, List

from logging_config import get_logger

from .models import Message
from utils.model_client import call_model_api
from utils.prompt import SYSTEM_PROMPT_TEMPLATE

logger = get_logger(__name__)

async def generate_response(
    messages: List[Message],
    user_role: str,
    assistant_role: str
) -> str:
    """
    生成对话响应（非流式）

    Args:
        messages: 消息历史
        user_role: 用户角色
        assistant_role: AI助手角色

    Returns:
        str: 完整的响应文本
    """

    # 预处理消息
    processed_messages = preprocess_message(messages, user_role, assistant_role)

    # 调用大模型API获取响应
    response = await call_model_api(
        messages=processed_messages,
        stream=False,
    )

    return response

async def generate_response_stream(
    messages: List[Message],
    user_role: str,
    assistant_role: str
) -> AsyncIterator[str]:
    """
    生成流式对话响应

    Args:
        messages: 消息历史
        user_role: 用户角色
        assistant_role: AI助手角色

    Yields:
        str: 响应文本块
    """

    # 预处理消息
    processed_messages = preprocess_message(messages, user_role, assistant_role)

    # 调用大模型API获取流式响应
    stream_generator = await call_model_api(
        messages=processed_messages,
        stream=True,
    )
    async for chunk in stream_generator:
        yield chunk

def preprocess_message(
        messages: List[Message],
        user_role: str, 
        assistant_role: str
) -> List[Dict[str, str]]:
    """
    预处理消息：
    1.合并所有用户消息和助手消息为一条用户消息
    2.为最新发言添加“{发言人}：”前缀
    3.更新system_prompt为当前指定角色的system_prompt

    Args:
        messages: 消息历史

    Returns:
        List[Message]: 处理后的消息历史
    """
    wlwz_messages = [{"role": "system", "content": SYSTEM_PROMPT_TEMPLATE.format(role=assistant_role)}]
    user_message = ""
    
    for message in messages:
        if message.role == assistant_role:
            wlwz_messages.append({"role": "user", "content": user_message.strip()})
            user_message = ""

            assistant_message = f"{message.role}：{message.content}"
            wlwz_messages.append({"role": "assistant", "content": assistant_message})
        else:
            user_message += f"{message.role}：{message.content}\n"
    wlwz_messages.append({"role": "user", "content": user_message.strip()})

    logger.info(
        "chat_messages_preprocessed",
        message_count=len(wlwz_messages),
        user_role=user_role,
        assistant_role=assistant_role,
    )
    return wlwz_messages


