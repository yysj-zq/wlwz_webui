from pydantic import EmailStr, Field

from app.schemas._alias import CamelModel


class UserCreate(CamelModel):
    """注册新用户请求体。"""

    email: EmailStr = Field(
        ..., description="用户邮箱，作为登录账号，必须为合法邮箱格式。", examples=["alice@example.com"]
    )
    password: str = Field(
        ..., min_length=1, description="明文密码（服务端使用 bcrypt 加盐哈希后存储）。", examples=["S3cret!Pass"]
    )
    username: str | None = Field(
        default=None, description="可选显示名；为空时使用邮箱前缀作为默认。", examples=["alice"]
    )


class UserLogin(CamelModel):
    """用户登录请求体。"""

    email: EmailStr = Field(..., description="注册时使用的邮箱。", examples=["alice@example.com"])
    password: str = Field(..., description="明文密码。", examples=["S3cret!Pass"])


class Token(CamelModel):
    """登录成功响应：JWT access token。"""

    access_token: str = Field(
        ...,
        description="JWT access token，前端放入 Authorization: Bearer <token> 头。",
        examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."],
    )
    token_type: str = Field(default="bearer", description='Token 类型，固定为 "bearer"。', examples=["bearer"])


class UserOut(CamelModel):
    """用户公开信息（不含密码哈希）。"""

    id: int = Field(..., description="用户主键 ID。", examples=[1])
    email: EmailStr = Field(..., description="用户邮箱。", examples=["alice@example.com"])
    username: str | None = Field(default=None, description="显示名。", examples=["alice"])
    is_admin: bool = Field(..., description="是否管理员账号；管理员拥有后台管理权限。", examples=[False])
