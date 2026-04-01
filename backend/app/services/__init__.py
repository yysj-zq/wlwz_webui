"""Application service layer."""

from app.services.chat_service import generate_response, generate_response_stream, preprocess_messages
from app.services.conversation_service import (
    append_messages,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    rename_conversation,
)
from app.services.roles_service import (
    avatar_api_path,
    create_custom_role,
    delete_custom_role,
    get_available_roles_for_user,
    get_my_role,
    get_speaker_id_for_role,
    init_builtin_roles_if_enabled,
    update_custom_role,
)
from app.services.tts_service import synthesize_role_voice

__all__ = [
    "append_messages",
    "avatar_api_path",
    "create_conversation",
    "create_custom_role",
    "delete_conversation",
    "delete_custom_role",
    "generate_response",
    "generate_response_stream",
    "get_available_roles_for_user",
    "get_conversation",
    "get_my_role",
    "get_speaker_id_for_role",
    "init_builtin_roles_if_enabled",
    "list_conversations",
    "preprocess_messages",
    "rename_conversation",
    "synthesize_role_voice",
    "update_custom_role",
]
