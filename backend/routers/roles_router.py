from fastapi import APIRouter, HTTPException
from services.roles_service import get_available_roles

router = APIRouter()

@router.get("/roles")
async def get_roles():
    """
    获取可用的用户角色和AI助手角色列表
    """
    try:
        roles = get_available_roles()
        return roles
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
