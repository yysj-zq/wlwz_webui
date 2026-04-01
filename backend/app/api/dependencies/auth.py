from datetime import datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import settings
from app.db.models import User
from app.db.session import get_db

_password_hasher = PasswordHasher()

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_PREFIX}/auth/login",
    auto_error=False,
)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """校验明文密码是否匹配已存储的哈希值。

    Args:
        plain_password: 用户输入的明文密码。
        password_hash: 数据库中存储的密码哈希。

    Returns:
        密码匹配返回 True，否则返回 False。
    """
    try:
        _password_hasher.verify(password_hash, plain_password)
        return True
    except VerifyMismatchError:
        return False


def get_password_hash(password: str) -> str:
    """对明文密码进行哈希并返回结果。"""
    return _password_hasher.hash(password)


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    """创建 JWT access token。

    Args:
        subject: Token 主题（当前实现使用用户 email）。
        expires_delta: 可选的过期时长；为空则使用配置默认值。

    Returns:
        JWT 字符串。
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.utcnow() + expires_delta
    to_encode = {"sub": subject, "exp": expire}
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """解析并校验当前请求的用户身份。

    Args:
        token: OAuth2 Bearer token。
        db: 数据库会话（依赖注入）。

    Returns:
        当前登录用户。

    Raises:
        HTTPException: 当 token 缺失/无效、用户不存在或已禁用时抛出 401。
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        subject: str | None = payload.get("sub")
        if subject is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    result = await db.execute(select(User).where(User.email == subject))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


async def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """可选鉴权：若未登录则返回 None。"""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        subject = payload.get("sub")
        if subject is None:
            return None
    except JWTError:
        return None
    result = await db.execute(select(User).where(User.email == subject))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    return user
