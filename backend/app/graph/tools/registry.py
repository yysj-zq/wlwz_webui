"""Director / NPC 静态工具集。

工具用 langchain @tool 装饰器定义为模块级单例。
query 类通过 config["configurable"]["controller"] 读取 WorldController；
submit 类返回 langgraph Command 直接把决策写入 graph state。
"""

from __future__ import annotations

from typing import Annotated, Any

from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import InjectedToolCallId, tool
from langgraph.prebuilt import InjectedState
from langgraph.types import Command
from pydantic import Field

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
def query_entity(
    actor_id: Annotated[str, Field(description="要查询的实体 id，取自当前世界状态中存在的实体")],
    config: RunnableConfig,
) -> dict[str, Any]:
    """查询一个实体的完整状态。用于了解某个角色或物件的当前情况。

    返回该实体的全部字段：id、name、kind、position {x, y}、direction（朝向，可能为 null）、
    public_state（公开状态字典，如 mood）、interactable（是否可交互）。
    若实体不存在，返回 {"error": "未知实体: <id>"}。
    """
    controller = config["configurable"]["controller"]
    ws = controller.world_state
    if actor_id not in ws.entities:
        return {"error": f"未知实体: {actor_id}"}
    return ws.entities[actor_id].model_dump(mode="json")


@tool
def query_neighbors(
    actor_id: Annotated[str, Field(description="作为中心的实体 id，取自当前世界状态中存在的实体")],
    radius: Annotated[int, Field(description="搜索半径，单位为格（曼哈顿距离）")] = 3,
    *,
    config: RunnableConfig,
) -> list[str]:
    """查询某实体周围 radius 格（曼哈顿距离）内有哪些实体。用于判断谁在附近、能否听见对话。

    返回实体 id 的字符串列表（含中心实体自身）。若中心实体不存在，返回 []。
    """
    controller = config["configurable"]["controller"]
    ws = controller.world_state
    if actor_id not in ws.entities:
        return []
    center = ws.entities[actor_id].position
    return [
        eid for eid, e in ws.entities.items() if abs(e.position.x - center.x) + abs(e.position.y - center.y) <= radius
    ]


@tool
def query_timeline(
    limit: Annotated[int, Field(description="返回最近多少条时间线记录")] = 6,
    *,
    config: RunnableConfig,
) -> list[dict[str, Any]]:
    """查询最近的时间线事件，用于了解刚才发生了什么。

    返回按时间正序排列的记录列表（最多 limit 条），每条含：actor_id（行动者，可能为 null）、
    kind（事件类型）、speak（台词，可能为 null）、act_patch（实体状态变更列表，可能为 null）。
    无时间线时返回 []。
    """
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
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command[Any]:
    """结束导演回合，提交本回合决策。world_writes 填实体状态变更列表（如玩家移动、物件状态改变），无变更传 []。perceivers 填因本次事件需要做出响应的 NPC 列表，每项含 actor_id 和 perception_reason（说明为何得知此事），无人需响应传 []。必须调用此工具来结束回合。"""
    dispatch = DirectorDispatch(world_writes=world_writes, perceivers=perceivers)
    # 必坑：director 的 ToolNode 用 messages_key="director_messages"，ToolMessage 必须落进该键，
    # 否则 langgraph 抛 ValueError: Expected to have a matching ToolMessage。
    return Command(update={
        "dispatch": dispatch,
        "director_messages": [ToolMessage("已提交导演决策。", tool_call_id=tool_call_id)],
    })


@tool
def submit_response(
    act_patch: list[WorldEntityPatch],
    memory_writes: list[MemoryWrite],
    inventory_ops: list[InventoryOp],
    tool_call_id: Annotated[str, InjectedToolCallId],
    perceiver: Annotated[Perceiver, InjectedState("npc_perceiver")],
    speak: str | None = None,
    goal_update: GoalPatch | None = None,
) -> Command[Any]:
    """结束扮演回合，提交你的响应。speak 填你说出口的台词原文（不说话就不传）。act_patch 填你的动作引起的世界实体状态变化（如自己移动、情绪变化），其中 entity_id 通常应是你自己；除非你的动作直接作用于某物件（如开门、拿起桌上的东西），否则不要修改其他角色的状态，无变化传 []。memory_writes 填你要记住的新事实，无新记忆传 []。inventory_ops 填物品增减，无变化传 []。必须调用此工具来结束回合。"""
    # perceiver 经 InjectedState 从子图 state["npc_perceiver"] 注入，用来拿 actor_id；
    # 依赖 NPC 子图 state 存在 npc_perceiver 键。tool_call_id / perceiver 无默认值，
    # 故必须排在有默认值的 speak / goal_update 之前。
    response = NPCResponse(
        speak=speak,
        act_patch=act_patch,
        memory_writes=memory_writes,
        goal_update=goal_update,
        inventory_ops=inventory_ops,
    )
    return Command(update={
        "npc_responses": [(perceiver.actor_id, response)],
        "messages": [ToolMessage("已提交扮演响应。", tool_call_id=tool_call_id)],
    })


DIRECTOR_TOOLS = [query_entity, query_neighbors, query_timeline, submit_dispatch]
NPC_TOOLS = [query_entity, query_neighbors, query_timeline, submit_response]
