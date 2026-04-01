from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_current_user_optional
from app.api.schemas import RoleCreate, RoleOut, RoleUpdate
from app.db.models import RoleProfile, User
from app.db.session import get_db
from app.services.roles_service import (
    avatar_api_path,
    create_custom_role,
    delete_custom_role,
    get_available_roles_for_user,
    get_my_role,
    update_custom_role,
)

router = APIRouter()


@router.get("/roles", response_model=dict[str, Any])
async def get_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> dict[str, Any]:
    """获取可用角色列表（内置 + 当前用户自定义）。"""
    return await get_available_roles_for_user(db, current_user)


@router.post("/roles/my", response_model=RoleOut)
async def create_my_role(
    payload: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RoleOut:
    """创建当前用户的自定义角色。"""
    try:
        r = await create_custom_role(
            db,
            current_user,
            name=payload.name,
            system_prompt=payload.system_prompt,
            default_speaker_id=payload.default_speaker_id,
        )
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise HTTPException(status_code=400, detail="角色名已存在") from exc
        raise
    return RoleOut(
        id=r.id,
        name=r.name,
        system_prompt=r.system_prompt,
        default_speaker_id=r.default_speaker_id,
        avatar_url=avatar_api_path(r.id) if r.avatar_blob else None,
        is_builtin=False,
        is_mine=True,
    )


@router.put("/roles/my/{role_id}", response_model=RoleOut)
async def update_my_role(
    role_id: int,
    payload: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RoleOut:
    """更新当前用户的自定义角色。"""
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
        avatar_url=avatar_api_path(r.id) if r.avatar_blob else None,
        is_builtin=False,
        is_mine=True,
    )


@router.delete("/roles/my/{role_id}", status_code=204)
async def delete_my_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """删除当前用户的自定义角色。"""
    ok = await delete_custom_role(db, current_user, role_id)
    if not ok:
        raise HTTPException(status_code=404, detail="角色不存在或无权删除")


@router.post("/roles/{role_id}/avatar", response_model=RoleOut)
async def upload_role_avatar(
    role_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RoleOut:
    """上传并更新指定自定义角色的头像。"""
    r = await get_my_role(db, current_user, role_id)
    if r is None:
        raise HTTPException(status_code=404, detail="角色不存在或无权修改")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="请上传图片文件")
    content = await file.read()
    r.avatar_blob = content
    r.avatar_mime_type = file.content_type
    await db.commit()
    await db.refresh(r)
    return RoleOut(
        id=r.id,
        name=r.name,
        system_prompt=r.system_prompt,
        default_speaker_id=r.default_speaker_id,
        avatar_url=avatar_api_path(r.id) if r.avatar_blob else None,
        is_builtin=False,
        is_mine=True,
    )


@router.get("/roles/{role_id}/avatar")
async def get_role_avatar(role_id: int, db: AsyncSession = Depends(get_db)) -> Response:
    """获取角色头像图片。"""
    row = await db.execute(select(RoleProfile).where(RoleProfile.id == role_id))
    r = row.scalar_one_or_none()
    if r is None or not r.avatar_blob or not r.avatar_mime_type:
        raise HTTPException(status_code=404, detail="头像不存在")
    return Response(content=r.avatar_blob, media_type=r.avatar_mime_type)
