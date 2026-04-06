import mimetypes
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.settings import settings
from app.db.models import RoleProfile, User

logger = get_logger(__name__)


def _guess_avatar_mime_type(filename: str) -> str:
    mt, _ = mimetypes.guess_type(filename)
    if mt:
        return mt
    if filename.lower().endswith(".svg"):
        return "image/svg+xml"
    return "application/octet-stream"


def avatar_api_path(role_id: int) -> str:
    return f"{settings.API_PREFIX}/roles/{role_id}/avatar"


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_roles_config_path() -> Path:
    path = Path(settings.ROLES_CONFIG_PATH)
    if path.is_absolute():
        return path
    return _backend_root() / path


def _load_roles_config() -> list[dict[str, Any]]:
    path = _resolve_roles_config_path()
    if not path.exists():
        logger.warning("roles_config_missing", path=str(path))
        return []
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("builtin_roles") or []


async def init_builtin_roles_if_enabled(db: AsyncSession) -> None:
    """按配置初始化内置角色数据。"""
    if not settings.INIT_BUILTIN_ROLES_ON_START:
        return
    await db.execute(delete(RoleProfile).where(RoleProfile.is_builtin.is_(True)))
    await db.commit()
    roles_data = _load_roles_config()
    config_dir = _resolve_roles_config_path().parent
    for item in roles_data:
        seed_path_raw = (item.get("avatar_seed_path") or "").strip()
        avatar_blob = None
        avatar_mime_type = None
        if seed_path_raw:
            seed_path = Path(seed_path_raw)
            avatar_path = seed_path if seed_path.is_absolute() else (config_dir / seed_path)
            if not avatar_path.exists():
                raise RuntimeError(f"builtin_avatar_seed_missing: {seed_path_raw}")
            avatar_blob = avatar_path.read_bytes()
            avatar_mime_type = _guess_avatar_mime_type(avatar_path.name)
        db.add(
            RoleProfile(
                user_id=None,
                name=item.get("name", "").strip(),
                system_prompt=item.get("system_prompt") or None,
                default_speaker_id=item.get("default_speaker_id") or None,
                config_json=None,
                is_builtin=True,
                avatar_blob=avatar_blob,
                avatar_mime_type=avatar_mime_type,
            )
        )
    await db.commit()
    logger.info("builtin_roles_initialized", count=len(roles_data))


async def get_available_roles_for_user(db: AsyncSession, user: User | None) -> dict[str, Any]:
    """获取当前用户可用的角色列表与辅助映射信息。"""
    stmt = select(RoleProfile).where(RoleProfile.is_builtin.is_(True))
    if user is not None:
        stmt = select(RoleProfile).where(or_(RoleProfile.is_builtin.is_(True), RoleProfile.user_id == user.id))
    result = await db.execute(stmt)
    roles = list(result.scalars().unique().all())
    names = [r.name for r in roles]
    voice_map = {r.name: (r.default_speaker_id or "") for r in roles}
    role_list = [
        {
            "id": r.id,
            "name": r.name,
            "system_prompt": r.system_prompt,
            "default_speaker_id": r.default_speaker_id,
            "avatar_url": avatar_api_path(r.id) if r.avatar_blob else None,
            "is_builtin": r.is_builtin,
            "is_mine": user is not None and r.user_id == user.id,
        }
        for r in roles
    ]
    return {
        "userRoles": names,
        "assistantRoles": names,
        "assistantVoiceMap": voice_map,
        "defaultSpeakerId": "",
        "roles": role_list,
    }


async def get_speaker_id_for_role(db: AsyncSession, role_name: str, user: User | None) -> str | None:
    """根据角色名获取对应的默认 speaker_id（如有）。"""
    stmt = select(RoleProfile).where(RoleProfile.name == role_name)
    if user is not None:
        stmt = stmt.where(or_(RoleProfile.is_builtin.is_(True), RoleProfile.user_id == user.id))
    else:
        stmt = stmt.where(RoleProfile.is_builtin.is_(True))
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row and row.default_speaker_id:
        return row.default_speaker_id
    return None


async def create_custom_role(
    db: AsyncSession,
    user: User,
    name: str,
    system_prompt: str | None = None,
    default_speaker_id: str | None = None,
) -> RoleProfile:
    r = RoleProfile(
        user_id=user.id,
        name=name.strip(),
        system_prompt=system_prompt,
        default_speaker_id=default_speaker_id,
        is_builtin=False,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r


async def get_my_role(db: AsyncSession, user: User, role_id: int) -> RoleProfile | None:
    """获取当前用户的自定义角色（非内置）。"""
    result = await db.execute(
        select(RoleProfile).where(
            RoleProfile.id == role_id,
            RoleProfile.user_id == user.id,
            RoleProfile.is_builtin.is_(False),
        )
    )
    return result.scalar_one_or_none()


async def update_custom_role(
    db: AsyncSession,
    user: User,
    role_id: int,
    name: str | None = None,
    system_prompt: str | None = None,
    default_speaker_id: str | None = None,
) -> RoleProfile | None:
    r = await get_my_role(db, user, role_id)
    if not r:
        return None
    if name is not None:
        r.name = name.strip()
    if system_prompt is not None:
        r.system_prompt = system_prompt
    if default_speaker_id is not None:
        r.default_speaker_id = default_speaker_id
    await db.commit()
    await db.refresh(r)
    return r


async def delete_custom_role(db: AsyncSession, user: User, role_id: int) -> bool:
    r = await get_my_role(db, user, role_id)
    if not r:
        return False
    await db.delete(r)
    await db.commit()
    return True
