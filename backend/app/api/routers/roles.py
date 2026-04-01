from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.api.dependencies import get_current_user, get_current_user_optional
from app.db.models import RoleProfile, User
from app.api.schemas.roles import RoleCreate, RoleOut, RoleUpdate
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
    return await get_available_roles_for_user(db, current_user)


@router.post("/roles/my", response_model=RoleOut)
async def create_my_role(
    payload: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
):
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
):
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
    row = await db.execute(select(RoleProfile).where(RoleProfile.id == role_id))
    r = row.scalar_one_or_none()
    if r is None or not r.avatar_blob or not r.avatar_mime_type:
        raise HTTPException(status_code=404, detail="头像不存在")
    return Response(content=r.avatar_blob, media_type=r.avatar_mime_type)
