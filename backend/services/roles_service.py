import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

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

ROLE_SPEAKER_MAP = {
    "佟湘玉": "tongxiaongyu",
    "白展堂": "baizhantang",
    "郭芙蓉": "guofurong",
    "李大嘴": "lidazui",
    "吕秀才": "lvxiucai",
    "莫小贝": "moxiaobei",
    "燕小六": "yanxiaoliu",
    "祝无双": "zhuwushuang",
    "邢育森": "xingyusen",
}

DEFAULT_SPEAKER_ID = ""


def get_speaker_id_by_role(role: str) -> str:
    speaker_id = ROLE_SPEAKER_MAP.get(role)
    if speaker_id:
        return speaker_id
    logger.warning("角色 %s 未配置 speaker_id，使用默认值 %s", role, DEFAULT_SPEAKER_ID)
    return DEFAULT_SPEAKER_ID


def get_available_roles() -> Dict[str, Any]:
    """
    获取可用的用户角色和AI助手角色列表

    Returns:
        Dict[str, List[str]]: 包含用户角色和助手角色的字典
    """
    # 实际应用中，这些角色可能从数据库或配置文件中加载
    return {
        "userRoles": DEFAULT_USER_ROLES,
        "assistantRoles": DEFAULT_ASSISTANT_ROLES,
        "assistantVoiceMap": ROLE_SPEAKER_MAP,
        "defaultSpeakerId": DEFAULT_SPEAKER_ID,
    }
