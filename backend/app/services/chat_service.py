from typing import AsyncIterator

from app.common.prompt import SYSTEM_PROMPT_TEMPLATE
from app.core.logging import get_logger
from app.infra.model_client import call_model_api
from app.api.schemas.chat import MessageIn

logger = get_logger(__name__)


def preprocess_messages(messages: list[MessageIn], user_role: str, assistant_role: str) -> list[dict[str, str]]:
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
    logger.debug(
        "[service]chat_messages",
        message=wlwz_messages,
        message_count=len(wlwz_messages),
        user_role=user_role,
        assistant_role=assistant_role,
    )
    return wlwz_messages


async def generate_response(messages: list[MessageIn], user_role: str, assistant_role: str) -> str:
    processed_messages = preprocess_messages(messages, user_role, assistant_role)
    return await call_model_api(messages=processed_messages, stream=False)


async def generate_response_stream(
    messages: list[MessageIn],
    user_role: str,
    assistant_role: str,
) -> AsyncIterator[str]:
    processed_messages = preprocess_messages(messages, user_role, assistant_role)
    stream_generator = await call_model_api(messages=processed_messages, stream=True)
    async for chunk in stream_generator:
        yield chunk
