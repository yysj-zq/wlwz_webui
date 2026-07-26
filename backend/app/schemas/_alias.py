"""共享 Pydantic 基类：snake_case ↔ camelCase 自动归一化。

所有 API 暴露的 schema 必须继承自 :class:`CamelModel`：

- 内部字段继续用 snake_case（与 Python 风格、SQLAlchemy 列名、单元测试保持一致）。
- 对外（OpenAPI / 响应体 / 请求解析）统一用 camelCase，前端 orval 生成的 TS 类型直接可用。
- ``populate_by_name=True`` 让解析阶段同时接受 snake_case 与 camelCase，
  便于本地调试与逐步迁移；对外序列化则交给端点上的
  ``response_model_by_alias=True`` 控制。
- ``from_attributes=True`` 让 schema 可以直接从 ORM 行（``ModelOut.model_validate(row)``）构造。
- ``alias_generator=to_camel`` 自动为所有 snake_case 字段生成 camelCase 别名。

典型用法（请求/响应模型）::

    from app.schemas._alias import CamelModel

    class FooRequest(CamelModel):
        actor_id: str
        state_version: int = 0

    class FooResponse(CamelModel):
        actor_id: str
        state_version: int
        world_state: WorldState

    @router.post("/foo", response_model=FooResponse, response_model_by_alias=True)
    async def foo(req: FooRequest) -> FooResponse:
        ...

注意事项：

- Python 侧字段一律 snake_case；``to_camel`` 自动生成 camelCase 别名供
  OpenAPI / JSON 序列化，调用方在 Python 代码里使用 ``payload.conversation_id``
  等形式。
- 需要在子类里追加 ``model_config`` 项（例如 ``WorldEntityPatch`` 仍要
  ``extra="forbid"``）时，Pydantic V2 会与父类 ``model_config`` 自动合并。
- 端点上一定要加 ``response_model_by_alias=True``，否则 OpenAPI 仍会暴露
  snake_case 字段，前端 orval 生成类型会全部跑偏。
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """所有 API schema 的统一基类，启用 snake_case ↔ camelCase 别名。"""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )


__all__ = ["CamelModel"]
