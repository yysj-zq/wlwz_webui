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
    """查询一个实体的完整状态（位置、朝向、公开属性等）。传入实体 id，返回其当前数据。"""
    controller = config["configurable"]["controller"]
    ws = controller.world_state
    if actor_id not in ws.entities:
        return {"error": f"未知实体: {actor_id}"}
    return ws.entities[actor_id].model_dump(mode="json")


@tool
def query_neighbors(actor_id: str, radius: int = 3, *, config: RunnableConfig) -> list[str]:
    """查询某实体周围 radius 格内有哪些实体。返回 id 列表。"""
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
    """查询最近的时间线事件。返回最近 limit 条，含 actor_id、kind、speak 等。"""
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
    """结束导演回合。world_writes 填本回合的实体状态变更（无变更传 []）；perceivers 填需要响应的 NPC 列表（无人需响应传 []）。必须调用此工具来结束回合。"""
    dispatch = DirectorDispatch(world_writes=world_writes, perceivers=perceivers)
    return dispatch.model_dump_json()


@tool
def submit_response(
    speak: str | None = None,
    act_patch: list[WorldEntityPatch] | None = None,
    memory_writes: list[MemoryWrite] | None = None,
    goal_update: GoalPatch | None = None,
    inventory_ops: list[InventoryOp] | None = None,
) -> str:
    """结束 NPC 回合。speak 填你要说的台词文本；act_patch 填你的动作导致的实体状态变化；都不填表示本回合沉默。必须调用此工具来结束回合。"""
    response = NPCResponse(
        speak=speak,
        act_patch=act_patch or [],
        memory_writes=memory_writes or [],
        goal_update=goal_update,
        inventory_ops=inventory_ops or [],
    )
    return response.model_dump_json()


DIRECTOR_TOOLS = [query_entity, query_neighbors, query_timeline, submit_dispatch]
NPC_TOOLS = [query_entity, query_neighbors, query_timeline, submit_response]
