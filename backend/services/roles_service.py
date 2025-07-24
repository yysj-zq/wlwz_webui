from typing import Dict, List

# 这些角色列表可以从配置文件或数据库加载
# 这里使用硬编码的示例数据
DEFAULT_USER_ROLES = [
    "佟湘玉",
    "白展堂",
    "郭芙蓉",
    "李大嘴",
    "吕秀才",
    "莫小贝",
    "燕小六",
    "祝无双",
    "邢育森",
]

DEFAULT_ASSISTANT_ROLES = [
    "佟湘玉",
    "白展堂",
    "郭芙蓉",
    "李大嘴",
    "吕秀才",
    "莫小贝",
    "燕小六",
    "祝无双",
    "邢育森",
]


def get_available_roles() -> Dict[str, List[str]]:
    """
    获取可用的用户角色和AI助手角色列表

    Returns:
        Dict[str, List[str]]: 包含用户角色和助手角色的字典
    """
    # 实际应用中，这些角色可能从数据库或配置文件中加载
    return {"userRoles": DEFAULT_USER_ROLES, "assistantRoles": DEFAULT_ASSISTANT_ROLES}
