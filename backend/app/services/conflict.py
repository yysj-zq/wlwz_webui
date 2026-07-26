"""乐观锁冲突域：状态版本不匹配时抛出的异常 + 校验工具。

前端可基于 ``state_version`` 字段做并发控制：当客户端缓存的版本与
服务端当前世界状态版本不一致时，视为冲突，拒绝应用本次 turn 并回传
最新世界状态，提示客户端重渲染。

设计要点：
- 异常携带 ``current_state_version`` 和 ``current_world_state``，便于
  API 层直接 409 响应体里原样返还给客户端。
- ``assert_state_version_matches`` 要求客户端必须传入 expected 版本号。
"""

from __future__ import annotations

from app.schemas import WorldState


class StateVersionConflict(Exception):
    """客户端提交的 state_version 与服务端当前世界 state_version 不一致。

    用于 API 层把乐观锁冲突统一映射为 409 响应，并把最新世界状态一起
    返还给客户端以触发其重渲染。
    """

    def __init__(
        self,
        current_state_version: int,
        current_world_state: WorldState,
        *,
        expected_state_version: int,
    ) -> None:
        self.current_state_version = current_state_version
        self.current_world_state = current_world_state
        self.expected_state_version = expected_state_version
        super().__init__(
            f"state_version conflict: expected {expected_state_version} but current is {current_state_version}"
        )


def assert_state_version_matches(current: WorldState, expected: int) -> None:
    """断言客户端传来的 expected 版本号与 current.state_version 一致。

    不一致时抛 :class:`StateVersionConflict`，由 API 层映射为 409。
    """
    if current.state_version != expected:
        raise StateVersionConflict(
            current_state_version=current.state_version,
            current_world_state=current,
            expected_state_version=expected,
        )
