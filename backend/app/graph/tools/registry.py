"""Director / NPC 静态工具集。

工具用 langchain @tool 装饰器定义为模块级单例。
query 类通过 config["configurable"]["controller"] 读取 WorldController；
submit 类纯验证+序列化，不依赖外部状态。
"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from app.schemas.world import (
    DirectorDispatch,
    GoalPatch,
    InventoryOp,
    MemoryWrite,
    NPCResponse,
    Perceiver,
    WorldEntityPatch,
)


@tool
def query_entity(actor_id: str, config: RunnableConfig) -> dict[str, Any]:
    """查询一个实体的完整状态。传入实体 id（如 baizhantang、player、table），返回其位置、朝向、public_state 等全部字段。用于了解某个角色或物件的当前情况。"""
    controller = config["configurable"]["controller"]
    ws = controller.world_state
    if actor_id not in ws.entities:
        return {"error": f"未知实体: {actor_id}"}
    return ws.entities[actor_id].model_dump(mode="json")


@tool
def query_neighbors(actor_id: str, radius: int = 3, *, config: RunnableConfig) -> list[str]:
    """查询某实体周围 radius 格（曼哈顿距离）内有哪些实体。返回 id 列表（含自身）。用于判断谁在附近、能否听见对话。"""
    controller = config["configurable"]["controller"]
    ws = controller.world_state
    if actor_id not in ws.entities:
        return []
    center = ws.entities[actor_id].position
    return [
        eid
        for eid, e in ws.entities.items()
        if abs(e.position.x - center.x) + abs(e.position.y - center.y) <= radius
    ]


@tool
def query_timeline(limit: int = 6, *, config: RunnableConfig) -> list[dict[str, Any]]:
    """查询最近的时间线事件。返回最近 limit 条记录，每条含 actor_id、kind、speak、act_patch。用于了解刚才发生了什么。"""
    controller = config["configurable"]["controller"]
    timeline = controller._last_loaded_timeline
    if timeline is None:
        return []
    out: list[dict[str, Any]] = []
    for entry in timeline[-limit:]:
        out.append(
            {
                "actor_id": entry.actor_id,
                "kind": entry.kind,
                "speak": entry.speak,
                "act_patch": [ep.model_dump(mode="json") for ep in entry.act_patch] if entry.act_patch else None,
            }
        )
    return out


@tool
def submit_dispatch(
    world_writes: list[WorldEntityPatch],
    perceivers: list[Perceiver],
) -> str:
    """结束导演回合，提交本回合决策。world_writes 填实体状态变更列表（如玩家移动、物件状态改变），无变更传 []。perceivers 填因本次事件需要做出响应的 NPC 列表，每项含 actor_id 和 perception_reason（说明为何得知此事），无人需响应传 []。必须调用此工具来结束回合。"""
    dispatch = DirectorDispatch(world_writes=world_writes, perceivers=perceivers)
    return dispatch.model_dump_json()


@tool
def submit_response(
    act_patch: list[WorldEntityPatch],
    memory_writes: list[MemoryWrite],
    inventory_ops: list[InventoryOp],
    speak: str | None = None,
    goal_update: GoalPatch | None = None,
) -> str:
    """结束扮演回合，提交你的响应。speak 填你说出口的台词原文（不说话就不传）。act_patch 填你的动作引起的世界实体状态变化（如自己移动、情绪变化），无变化传 []。memory_writes 填你要记住的新事实，无新记忆传 []。inventory_ops 填物品增减，无变化传 []。必须调用此工具来结束回合。"""
    response = NPCResponse(
        speak=speak,
        act_patch=act_patch,
        memory_writes=memory_writes,
        goal_update=goal_update,
        inventory_ops=inventory_ops,
    )
    return response.model_dump_json()


DIRECTOR_TOOLS = [query_entity, query_neighbors, query_timeline, submit_dispatch]
NPC_TOOLS = [query_entity, query_neighbors, query_timeline, submit_response]
