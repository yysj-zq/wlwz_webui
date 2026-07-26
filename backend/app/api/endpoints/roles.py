from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_current_user_optional
from app.core import get_db
from app.models import RoleProfile, User
from app.schemas import RoleCreate, RoleOut, RoleUpdate
from app.services import (
    avatar_api_path,
    create_custom_role,
    delete_custom_role,
    get_available_roles_for_user,
    get_my_role,
    update_custom_role,
)

router = APIRouter()


@router.get(
    "/roles",
    response_model=list[RoleOut],
    response_model_by_alias=True,
    tags=["Roles"],
    summary="获取可用角色列表",
    description=(
        "返回当前用户可见的角色列表（`RoleOut` 数组）。\n\n"
        "- 内置角色（isBuiltin=True）始终可见。\n"
        "- 自定义角色（isMine=True）仅在已登录且属于当前用户时返回。\n"
        "- 未登录访问时，仅返回内置角色。"
    ),
    response_description="RoleOut 数组，字段为 camelCase。",
)
async def get_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[RoleOut]:
    """获取可用角色列表（内置 + 当前用户自定义）。"""
    return await get_available_roles_for_user(db, current_user)


@router.post(
    "/roles/my",
    response_model=RoleOut,
    response_model_by_alias=True,
    tags=["Roles"],
    summary="创建当前用户的自定义角色",
    description=(
        "为当前登录用户创建一个新的自定义角色。\n\n"
        "- `name` 在同一用户下唯一（重复返回 400）。\n"
        "- `default_speaker_id` 可选；未设置时后续 TTS 调用须显式传入 speakerId。\n"
        "- 头像请通过 `POST /roles/{roleId}/avatar` 单独上传。"
    ),
    response_description="新创建的自定义角色公开信息。",
    responses={
        400: {"description": "角色名重复，或请求体字段类型不合法。"},
        401: {"description": "未提供有效 JWT。"},
        422: {"description": "请求体字段类型或长度不合法。"},
    },
)
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
        slug=r.slug,
        name=r.name,
        system_prompt=r.system_prompt,
        default_speaker_id=r.default_speaker_id,
        avatar_url=avatar_api_path(r.id) if r.avatar_blob else None,
        is_builtin=False,
        is_mine=True,
        in_game=False,
    )


@router.put(
    "/roles/my/{role_id}",
    response_model=RoleOut,
    response_model_by_alias=True,
    tags=["Roles"],
    summary="更新当前用户的自定义角色",
    description=(
        "局部更新当前用户的指定自定义角色。仅修改提供的字段；未提供的字段保持不变。\n\n"
        "- 不允许修改内置角色。\n"
        "- 若 roleId 不存在或不属于当前用户：返回 404。"
    ),
    response_description="更新后的角色公开信息。",
    responses={
        404: {"description": "角色不存在或当前用户无权修改。"},
        422: {"description": "请求体字段类型不合法。"},
    },
)
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
        slug=r.slug,
        name=r.name,
        system_prompt=r.system_prompt,
        default_speaker_id=r.default_speaker_id,
        avatar_url=avatar_api_path(r.id) if r.avatar_blob else None,
        is_builtin=False,
        is_mine=True,
        in_game=False,
    )


@router.delete(
    "/roles/my/{role_id}",
    status_code=204,
    tags=["Roles"],
    summary="删除当前用户的自定义角色",
    description=(
        "硬删除当前用户拥有的指定自定义角色。不允许删除内置角色。\n\n- 若 roleId 不存在或不属于当前用户：返回 404。"
    ),
    response_description="删除成功，无响应体。",
    responses={
        204: {"description": "删除成功。"},
        404: {"description": "角色不存在或当前用户无权删除。"},
    },
)
async def delete_my_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """删除当前用户的自定义角色。"""
    ok = await delete_custom_role(db, current_user, role_id)
    if not ok:
        raise HTTPException(status_code=404, detail="角色不存在或无权删除")


@router.post(
    "/roles/{role_id}/avatar",
    response_model=RoleOut,
    response_model_by_alias=True,
    tags=["Roles"],
    summary="上传并更新角色头像",
    description=(
        "上传一张图片作为指定自定义角色的头像，支持 image/* MIME（PNG/JPEG/WebP）。\n\n"
        "- 仅允许修改当前用户拥有的自定义角色。\n"
        "- 若文件不是图片：返回 400。\n"
        "- 头像二进制存储于数据库（avatar_blob），获取请用 `GET /roles/{roleId}/avatar`。"
    ),
    response_description="更新头像后的角色公开信息（含 avatar_url）。",
    responses={
        400: {"description": "上传文件不是图片，或请求体不合法。"},
        404: {"description": "角色不存在或当前用户无权修改。"},
        413: {"description": "文件过大（超出后端限制）。"},
        422: {"description": "表单字段类型不合法。"},
    },
)
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
        slug=r.slug,
        name=r.name,
        system_prompt=r.system_prompt,
        default_speaker_id=r.default_speaker_id,
        avatar_url=avatar_api_path(r.id) if r.avatar_blob else None,
        is_builtin=False,
        is_mine=True,
        in_game=False,
    )


@router.get(
    "/roles/{role_id}/avatar",
    tags=["Roles"],
    summary="获取角色头像二进制",
    description=(
        "直接返回指定角色的头像图片原始字节，Content-Type 与上传时一致（如 image/png）。\n\n"
        "- 若角色不存在或未上传头像：返回 404。\n"
        "- 该端点不需要鉴权（头像可公开）。"
    ),
    response_description="头像二进制（image/*）。",
    responses={
        404: {"description": "角色不存在或尚未上传头像。"},
    },
)
async def get_role_avatar(role_id: int, db: AsyncSession = Depends(get_db)) -> Response:
    """获取角色头像图片。"""
    row = await db.execute(select(RoleProfile).where(RoleProfile.id == role_id))
    r = row.scalar_one_or_none()
    if r is None or not r.avatar_blob or not r.avatar_mime_type:
        raise HTTPException(status_code=404, detail="头像不存在")
    return Response(content=r.avatar_blob, media_type=r.avatar_mime_type)
