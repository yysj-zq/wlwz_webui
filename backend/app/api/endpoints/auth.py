from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core import create_access_token, get_db, get_password_hash, verify_password
from app.models import User
from app.schemas import Token, UserCreate, UserLogin, UserOut

router = APIRouter()


@router.post(
    "/auth/register",
    response_model=UserOut,
    response_model_by_alias=True,
    tags=["Auth"],
    summary="注册新用户",
    description=(
        "使用邮箱、密码与可选的用户名注册一个新账号。若邮箱已被注册则返回 400。\n\n"
        "成功后返回新建用户的公开信息（不含密码哈希）。"
    ),
    response_description="新创建的用户公开信息。",
    responses={
        400: {"description": "邮箱已被注册或请求体校验失败。"},
        422: {"description": "请求体字段类型或格式不合法（如邮箱格式错误、密码为空）。"},
    },
)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> UserOut:
    """注册新用户：校验邮箱唯一性、写入数据库并返回用户公开信息。"""
    result = await db.execute(select(User).where(User.email == payload.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱已注册")
    user = User(email=payload.email, username=payload.username, password_hash=get_password_hash(payload.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post(
    "/auth/login",
    response_model=Token,
    response_model_by_alias=True,
    tags=["Auth"],
    summary="用户登录并获取 JWT",
    description=(
        "使用邮箱与密码换取 JWT access token。\n\n"
        "- 邮箱不存在或密码错误：返回 401。\n"
        "- 账号被禁用：返回 400。\n"
        "成功后返回的 token 默认有效期由后端配置（ACCESS_TOKEN_EXPIRE_MINUTES）控制。"
    ),
    response_description="JWT 访问令牌及其类型。",
    responses={
        400: {"description": "账号已被禁用。"},
        401: {"description": "邮箱不存在或密码错误。"},
        422: {"description": "请求体字段类型或格式不合法。"},
    },
)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)) -> Token:
    """验证邮箱+密码并签发 JWT access token。"""
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="账号已被禁用")
    return Token(access_token=create_access_token(subject=user.email))


@router.get(
    "/auth/me",
    response_model=UserOut,
    response_model_by_alias=True,
    tags=["Auth"],
    summary="获取当前登录用户信息",
    description="解析请求头中的 JWT 并返回当前登录用户的公开信息。",
    response_description="当前登录用户公开信息。",
    responses={
        401: {"description": "未提供有效 JWT，或 token 已过期/被吊销。"},
        403: {"description": "凭据有效但当前被禁止访问该资源。"},
    },
)
async def read_me(current_user: User = Depends(get_current_user)) -> UserOut:
    """返回当前通过 JWT 鉴权登录的用户公开信息。"""
    return UserOut.model_validate(current_user)
