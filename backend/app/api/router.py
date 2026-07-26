from fastapi import APIRouter

from app.api.endpoints import auth, conversation, roles, tts

# 注意：不在 include_router 处设置 tags，避免与各 endpoint 装饰器上的 tags 合并重复。
# 端点级 tags 由 OpenAPI_TAGS（在 app.main 中定义）提供一致的英文标签。
api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(conversation.router)
api_router.include_router(roles.router)
api_router.include_router(tts.router)
