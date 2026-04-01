"""
角色服务：仅从数据库与配置文件（仅初始化时）读取，无硬编码兜底。
"""
from pathlib import Path
from typing import Any, Dict, List, Optional

import mimetypes
import yaml
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from logging_config import get_logger
from models.db_models import RoleProfile, User

logger = get_logger(__name__)


def _guess_avatar_mime_type(filename: str) -> str:
    mt, _ = mimetypes.guess_type(filename)
    if mt:
        return mt
    if filename.lower().endswith(".svg"):
        return "image/svg+xml"
    return "application/octet-stream"


def _avatar_api_path(role_id: int) -> str:
    return f"{settings.API_PREFIX}/roles/{role_id}/avatar"


def _load_roles_config() -> List[Dict[str, Any]]:
    """仅在初始化时调用，从 ROLES_CONFIG_PATH 读取 builtin_roles。"""
    path = Path(settings.ROLES_CONFIG_PATH)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / path
    if not path.exists():
        logger.warning("roles_config_missing", path=str(path))
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("builtin_roles") or []


async def init_builtin_roles_if_enabled(db: AsyncSession) -> None:
    """
    当 INIT_BUILTIN_ROLES_ON_START 为 true 时：
    删除所有 is_builtin=true 的记录，再根据配置文件重新插入。
    """
    if not settings.INIT_BUILTIN_ROLES_ON_START:
        return
    await db.execute(delete(RoleProfile).where(RoleProfile.is_builtin == True))
    await db.commit()
    roles_data = _load_roles_config()
    config_path = Path(settings.ROLES_CONFIG_PATH)
    if not config_path.is_absolute():
        config_path = Path(__file__).resolve().parent.parent / config_path
    config_dir = config_path.parent
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
        r = RoleProfile(
            user_id=None,
            name=item.get("name", "").strip(),
            system_prompt=item.get("system_prompt") or None,
            default_speaker_id=item.get("default_speaker_id") or None,
            config_json=None,
            is_builtin=True,
            avatar_blob=avatar_blob,
            avatar_mime_type=avatar_mime_type,
        )
        db.add(r)
    await db.commit()
    logger.info("builtin_roles_initialized", count=len(roles_data))


async def get_available_roles_for_user(
    db: AsyncSession,
    user: Optional[User],
) -> Dict[str, Any]:
    """
    未登录：只返回 is_builtin=true 的角色。
    已登录：返回 is_builtin=true 或 user_id=current_user.id 的角色。
    """
    stmt = select(RoleProfile).where(RoleProfile.is_builtin == True)
    if user is not None:
        from sqlalchemy import or_
        stmt = select(RoleProfile).where(
            or_(RoleProfile.is_builtin == True, RoleProfile.user_id == user.id)
        )
    result = await db.execute(stmt)
    roles: List[RoleProfile] = list(result.scalars().unique().all())
    names = [r.name for r in roles]
    voice_map = {r.name: (r.default_speaker_id or "") for r in roles}
    role_list = [
        {
            "id": r.id,
            "name": r.name,
            "system_prompt": r.system_prompt,
            "default_speaker_id": r.default_speaker_id,
            "avatar_url": _avatar_api_path(r.id) if r.avatar_blob else None,
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


async def get_speaker_id_for_role(
    db: AsyncSession,
    role_name: str,
    user: Optional[User],
) -> Optional[str]:
    """
    根据角色名从库中查 default_speaker_id。
    先查 builtin，再查当前用户的自定义角色。无则返回 None（无硬编码兜底）。
    """
    from sqlalchemy import or_
    stmt = select(RoleProfile).where(RoleProfile.name == role_name)
    if user is not None:
        stmt = stmt.where(
            or_(RoleProfile.is_builtin == True, RoleProfile.user_id == user.id)
        )
    else:
        stmt = stmt.where(RoleProfile.is_builtin == True)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row and row.default_speaker_id:
        return row.default_speaker_id
    return None


async def create_custom_role(
    db: AsyncSession,
    user: User,
    name: str,
    system_prompt: Optional[str] = None,
    default_speaker_id: Optional[str] = None,
) -> RoleProfile:
    """创建当前用户的自定义角色。同名冲突由唯一约束保证，调用方需捕获。"""
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


async def get_my_role(
    db: AsyncSession,
    user: User,
    role_id: int,
) -> Optional[RoleProfile]:
    """获取当前用户拥有的角色（仅自定义，非 builtin）。"""
    result = await db.execute(
        select(RoleProfile).where(
            RoleProfile.id == role_id,
            RoleProfile.user_id == user.id,
            RoleProfile.is_builtin == False,
        )
    )
    return result.scalar_one_or_none()


async def update_custom_role(
    db: AsyncSession,
    user: User,
    role_id: int,
    name: Optional[str] = None,
    system_prompt: Optional[str] = None,
    default_speaker_id: Optional[str] = None,
) -> Optional[RoleProfile]:
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


async def delete_custom_role(
    db: AsyncSession,
    user: User,
    role_id: int,
) -> bool:
    r = await get_my_role(db, user, role_id)
    if not r:
        return False
    await db.delete(r)
    await db.commit()
    return True
