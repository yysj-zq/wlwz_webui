"""工具级快测：submit_* 工具返回 Command 直写 state（不碰 DB）。

锁两条契约：
1. 必坑：director 的 ToolNode 用 messages_key="director_messages"，submit_dispatch
   返回的 ToolMessage 必须落进 director_messages，否则会抛
   ``ValueError: Expected to have a matching ToolMessage``。
2. submit_response 经 InjectedState 拿到 npc_perceiver.actor_id，写 npc_responses。
"""

from __future__ import annotations

import operator
import uuid
from typing import Annotated, Any, NotRequired, TypedDict

import pytest
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode

from app.graph.tools.registry import submit_dispatch, submit_response
from app.schemas.world import DirectorDispatch, NPCResponse, Perceiver


class _DirState(TypedDict):
    director_messages: Annotated[list[BaseMessage], operator.add]
    dispatch: NotRequired[DirectorDispatch]


class _NpcState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    npc_perceiver: Perceiver
    npc_responses: NotRequired[list[tuple[str, NPCResponse]]]


def _compile(state_type: type[Any], tool: Any, messages_key: str) -> CompiledStateGraph[Any, None, Any, Any]:
    g = StateGraph(state_type)
    g.add_node("tools", ToolNode([tool], messages_key=messages_key))
    g.add_edge(START, "tools")
    g.add_edge("tools", END)
    return g.compile()


@pytest.mark.asyncio
async def test_submit_dispatch_command_writes_dispatch_into_director_messages() -> None:
    call_id = uuid.uuid4().hex
    ai = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "submit_dispatch",
                "args": {
                    "world_writes": [],
                    "perceivers": [{"actor_id": "baizhantang", "perception_reason": "被直接称呼"}],
                },
                "id": call_id,
            }
        ],
    )
    graph = _compile(_DirState, submit_dispatch, "director_messages")

    result = await graph.ainvoke({"director_messages": [ai]})

    # dispatch 被工具直接写入 state
    dispatch = result["dispatch"]
    assert isinstance(dispatch, DirectorDispatch)
    assert [p.actor_id for p in dispatch.perceivers] == ["baizhantang"]

    # ToolMessage 落进 director_messages（必坑：放 messages 会抛 ValueError），且 success
    last = result["director_messages"][-1]
    assert isinstance(last, ToolMessage)
    assert last.status == "success"
    assert last.tool_call_id == call_id


@pytest.mark.asyncio
async def test_submit_response_command_writes_npc_responses_via_injected_state() -> None:
    call_id = uuid.uuid4().hex
    ai = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "submit_response",
                "args": {
                    "act_patch": [],
                    "memory_writes": [],
                    "inventory_ops": [],
                    "speak": "客官请讲。",
                },
                "id": call_id,
            }
        ],
    )
    graph = _compile(_NpcState, submit_response, "messages")

    result = await graph.ainvoke(
        {
            "messages": [ai],
            "npc_perceiver": Perceiver(actor_id="baizhantang", perception_reason="被直接称呼"),
        }
    )

    responses = result["npc_responses"]
    assert len(responses) == 1
    actor_id, resp = responses[0]
    assert actor_id == "baizhantang"  # 来自 InjectedState 注入的 npc_perceiver
    assert isinstance(resp, NPCResponse)
    assert resp.speak == "客官请讲。"

    last = result["messages"][-1]
    assert isinstance(last, ToolMessage)
    assert last.status == "success"
    assert last.tool_call_id == call_id
