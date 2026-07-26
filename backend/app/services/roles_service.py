import mimetypes
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import get_logger, settings
from app.models import RoleProfile, User
from app.repositories import role_repository
from app.schemas import Direction, RoleOut, RoleRegistryEntry, RoleSpawn

logger = get_logger(__name__)

# 自定义角色被临时拉进 chat 时的兜底出生点（放在地图边角，不与内置阵容/物件抢位）。
_CUSTOM_EDGE_SPAWN = RoleSpawn(x=1, y=1, direction=Direction.SOUTH)


def _guess_avatar_mime_type(filename: str) -> str:
    mt, _ = mimetypes.guess_type(filename)
    if mt:
        return mt
    if filename.lower().endswith(".svg"):
        return "image/svg+xml"
    return "application/octet-stream"


def avatar_api_path(role_id: int) -> str:
    return f"{settings.API_PREFIX}/roles/{role_id}/avatar"


def custom_role_slug(role_id: int) -> str:
    """自定义角色的稳定 slug（= actor_id）：f"custom{id}"。"""
    return f"custom{role_id}"


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


def _read_avatar_seed(seed_path_raw: str, config_dir: Path) -> tuple[bytes | None, str | None]:
    """读取头像种子文件，返回 (blob, mime)。未配置路径时返回 (None, None)。"""
    seed_path_raw = (seed_path_raw or "").strip()
    if not seed_path_raw:
        return None, None
    seed_path = Path(seed_path_raw)
    avatar_path = seed_path if seed_path.is_absolute() else (config_dir / seed_path)
    if not avatar_path.exists():
        raise RuntimeError(f"builtin_avatar_seed_missing: {seed_path_raw}")
    return avatar_path.read_bytes(), _guess_avatar_mime_type(avatar_path.name)


def _build_builtin_config_json(item: dict[str, Any]) -> dict[str, Any]:
    """把 yaml 里的扩展字段收敛进 config_json，作为角色注册表的持久化载体。"""
    return {
        "in_game": bool(item.get("in_game", False)),
        "spawn": item.get("spawn") or {},
        "persona": item.get("persona") or "",
        "relations": item.get("relations") or {},
        "goal": item.get("goal") or {},
    }


async def seed_builtin_roles(db: AsyncSession) -> int:
    """按 yaml 删旧建新，写入内置角色（含 slug 与 config_json）。返回写入条数。"""
    await role_repository.delete_all_builtin(db)
    await db.commit()
    roles_data = _load_roles_config()
    config_dir = _resolve_roles_config_path().parent
    for item in roles_data:
        avatar_blob, avatar_mime_type = _read_avatar_seed(item.get("avatar_seed_path") or "", config_dir)
        db.add(
            RoleProfile(
                user_id=None,
                name=(item.get("name") or "").strip(),
                slug=(item.get("slug") or "").strip() or None,
                system_prompt=item.get("system_prompt") or None,
                default_speaker_id=item.get("default_speaker_id") or None,
                config_json=_build_builtin_config_json(item),
                is_builtin=True,
                avatar_blob=avatar_blob,
                avatar_mime_type=avatar_mime_type,
            )
        )
    await db.commit()
    return len(roles_data)


async def init_builtin_roles_if_enabled(db: AsyncSession) -> None:
    if not settings.INIT_BUILTIN_ROLES_ON_START:
        return
    count = await seed_builtin_roles(db)
    logger.info("builtin_roles_initialized", count=count)


def _role_slug(r: RoleProfile) -> str:
    return r.slug if r.is_builtin and r.slug else custom_role_slug(r.id)


def _role_in_game(r: RoleProfile) -> bool:
    if not r.is_builtin:
        return False
    return bool((r.config_json or {}).get("in_game", False))


async def get_available_roles_for_user(db: AsyncSession, user: User | None) -> list[RoleOut]:
    roles = await role_repository.get_builtin_and_user_roles(db, user.id if user else None)
    return [
        RoleOut(
            id=r.id,
            slug=_role_slug(r),
            name=r.name,
            system_prompt=r.system_prompt,
            default_speaker_id=r.default_speaker_id,
            avatar_url=avatar_api_path(r.id) if r.avatar_blob else None,
            is_builtin=r.is_builtin,
            is_mine=user is not None and r.user_id == user.id,
            in_game=_role_in_game(r),
        )
        for r in roles
    ]


def _registry_entry_from_builtin(r: RoleProfile) -> RoleRegistryEntry:
    """把内置 RoleProfile 行投影成注册项。仅对 in_game 行调用（保证 spawn 存在）。"""
    cfg = r.config_json or {}
    spawn = cfg["spawn"]
    return RoleRegistryEntry(
        id=r.id,
        slug=r.slug or "",
        name=r.name,
        default_speaker_id=r.default_speaker_id,
        in_game=bool(cfg.get("in_game", False)),
        spawn=RoleSpawn(x=spawn["x"], y=spawn["y"], direction=spawn.get("direction", Direction.SOUTH)),
        persona=cfg.get("persona") or "",
        relations=dict(cfg.get("relations") or {}),
        goal=dict(cfg.get("goal") or {}),
    )


async def list_ingame_registry(db: AsyncSession) -> list[RoleRegistryEntry]:
    """可进入游戏的内置角色注册表：世界构建与心智播种的统一数据源。"""
    rows = await role_repository.list_builtin(db)
    entries = [_registry_entry_from_builtin(r) for r in rows if (r.config_json or {}).get("in_game")]
    entries.sort(key=lambda e: e.id)
    return entries


async def resolve_role_registry_entry(db: AsyncSession, user: User | None, slug: str) -> RoleRegistryEntry | None:
    """把任意角色 slug 解析为注册项，供 chat 目标健壮化使用。

    - 内置 in_game 角色：返回其完整注册项。
    - 当前用户的自定义角色（slug=f"custom{id}"）：派生一个边角出生点的注册项，
      persona 取角色 system_prompt，relations/goal 留空，in_game=False。
    - 其余：None（非法目标）。
    """
    for entry in await list_ingame_registry(db):
        if entry.slug == slug:
            return entry

    if user is not None and slug.startswith("custom"):
        suffix = slug[len("custom") :]
        if suffix.isdigit():
            r = await role_repository.get_user_role(db, user.id, int(suffix))
            if r is not None:
                return RoleRegistryEntry(
                    id=r.id,
                    slug=slug,
                    name=r.name,
                    default_speaker_id=r.default_speaker_id,
                    in_game=False,
                    spawn=_CUSTOM_EDGE_SPAWN,
                    persona=r.system_prompt or "",
                    relations={},
                    goal={},
                )
    return None


async def get_speaker_id_for_role(db: AsyncSession, role_name: str, user: User | None) -> str | None:
    row = await role_repository.get_by_name(db, role_name, user_id=user.id if user else None)
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
    await db.flush()  # 先拿到自增 id，据此生成稳定 slug
    r.slug = custom_role_slug(r.id)
    await db.commit()
    await db.refresh(r)
    return r


async def get_my_role(db: AsyncSession, user: User, role_id: int) -> RoleProfile | None:
    return await role_repository.get_user_role(db, user.id, role_id)


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
