from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models.db_models import User
from services.models import RoleCreate, RoleOut, RoleUpdate
from services.roles_service import (
    create_custom_role,
    delete_custom_role,
    get_available_roles_for_user,
    get_my_role,
    update_custom_role,
)
from pathlib import Path
from utils.security import get_current_user, get_current_user_optional

router = APIRouter()

# 与 main 中挂载的 static 一致：backend/static/role-avatars
_ROLE_AVATAR_DIR = Path(__file__).resolve().parent.parent / "static" / "role-avatars"
AVATAR_URL_PREFIX = "/static/role-avatars"


@router.get("/roles", response_model=Dict[str, Any])
async def get_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    """
    未登录：仅返回内置角色。
    已登录：返回内置 + 当前用户自定义角色。
    """
    return await get_available_roles_for_user(db, current_user)


@router.post("/roles/my", response_model=RoleOut)
async def create_my_role(
    payload: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建自定义角色（需登录）。"""
    try:
        r = await create_custom_role(
            db,
            current_user,
            name=payload.name,
            system_prompt=payload.system_prompt,
            default_speaker_id=payload.default_speaker_id,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=400, detail="角色名已存在")
        raise
    return RoleOut(
        id=r.id,
        name=r.name,
        system_prompt=r.system_prompt,
        default_speaker_id=r.default_speaker_id,
        avatar_url=r.avatar_url,
        is_builtin=False,
        is_mine=True,
    )


@router.put("/roles/my/{role_id}", response_model=RoleOut)
async def update_my_role(
    role_id: int,
    payload: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新自定义角色（需登录，仅能改自己的）。"""
    r = await update_custom_role(
        db,
        current_user,
        role_id,
        name=payload.name,
        system_prompt=payload.system_prompt,
        default_speaker_id=payload.default_speaker_id,
    )
    if r is None:
        raise HTTPException(status_code=404, detail="角色不存在或无权修改")
    return RoleOut(
        id=r.id,
        name=r.name,
        system_prompt=r.system_prompt,
        default_speaker_id=r.default_speaker_id,
        avatar_url=r.avatar_url,
        is_builtin=False,
        is_mine=True,
    )


@router.delete("/roles/my/{role_id}", status_code=204)
async def delete_my_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除自定义角色（需登录）。"""
    ok = await delete_custom_role(db, current_user, role_id)
    if not ok:
        raise HTTPException(status_code=404, detail="角色不存在或无权删除")


@router.post("/roles/{role_id}/avatar", response_model=RoleOut)
async def upload_role_avatar(
    role_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """上传角色头像（仅限自己的自定义角色）。"""
    r = await get_my_role(db, current_user, role_id)
    if r is None:
        raise HTTPException(status_code=404, detail="角色不存在或无权修改")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="请上传图片文件")
    import uuid
    ext = ".png"
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        ext = ".png"
    _ROLE_AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"role_{role_id}_{uuid.uuid4().hex[:8]}{ext}"
    path = _ROLE_AVATAR_DIR / filename
    content = await file.read()
    path.write_bytes(content)
    avatar_url = f"{AVATAR_URL_PREFIX}/{filename}"
    r.avatar_url = avatar_url
    await db.commit()
    await db.refresh(r)
    return RoleOut(
        id=r.id,
        name=r.name,
        system_prompt=r.system_prompt,
        default_speaker_id=r.default_speaker_id,
        avatar_url=r.avatar_url,
        is_builtin=False,
        is_mine=True,
    )
