from fastapi import APIRouter

from app.api.routers import auth, chat, conversation, roles, tts

api_router = APIRouter()
api_router.include_router(auth.router, tags=["认证"])
api_router.include_router(conversation.router, tags=["会话"])
api_router.include_router(chat.router, tags=["聊天"])
api_router.include_router(roles.router, tags=["角色"])
api_router.include_router(tts.router, tags=["语音"])
