"""Services 业务逻辑层：对话、角色、TTS、时间线、心智、摘要、世界编排。"""

from app.services.actor_mind_service import (
    get_or_create,
    load_for_prompt,
    seed_minds_no_commit,
    upsert_increment_no_commit,
)
from app.services.conversation_service import (
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    rename_conversation,
)
from app.services.digest_service import get_digest, schedule_refresh, should_refresh
from app.services.roles_service import (
    avatar_api_path,
    create_custom_role,
    custom_role_slug,
    delete_custom_role,
    get_available_roles_for_user,
    get_my_role,
    get_speaker_id_for_role,
    init_builtin_roles_if_enabled,
    list_ingame_registry,
    resolve_role_registry_entry,
    seed_builtin_roles,
    update_custom_role,
)
from app.services.timeline_service import (
    Compactor,
    append_entries_no_commit,
    list_timeline,
    render_timeline_for_messages,
)
from app.services.tts_service import (
    get_tts_cache,
    set_tts_cache,
    synthesize_role_voice,
)
from app.services.world_service import (
    WorldController,
    apply_world_patches,
    build_world_state,
    ensure_chat_target_entity,
    ensure_conversation_world,
    switch_played_role,
)

__all__ = [
    "Compactor",
    "WorldController",
    "append_entries_no_commit",
    "apply_world_patches",
    "avatar_api_path",
    "build_world_state",
    "create_conversation",
    "create_custom_role",
    "custom_role_slug",
    "delete_conversation",
    "delete_custom_role",
    "ensure_chat_target_entity",
    "ensure_conversation_world",
    "get_available_roles_for_user",
    "get_conversation",
    "get_digest",
    "get_my_role",
    "get_or_create",
    "get_speaker_id_for_role",
    "get_tts_cache",
    "init_builtin_roles_if_enabled",
    "list_conversations",
    "list_ingame_registry",
    "list_timeline",
    "load_for_prompt",
    "render_timeline_for_messages",
    "rename_conversation",
    "resolve_role_registry_entry",
    "schedule_refresh",
    "seed_builtin_roles",
    "seed_minds_no_commit",
    "set_tts_cache",
    "should_refresh",
    "switch_played_role",
    "synthesize_role_voice",
    "update_custom_role",
    "upsert_increment_no_commit",
]
