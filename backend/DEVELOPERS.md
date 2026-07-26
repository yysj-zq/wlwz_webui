# 后端开发者指南

面向修改本后端的贡献者：包结构、开发步骤与约定。

使用者向说明见 [README.md](README.md)。

## 架构分层

```
api（HTTP） → services / graph → repositories → models
                 ↑
              schemas（DTO，与 OpenAPI 同源）
core（config / db / security / llm）为基础设施，不承载业务编排。
```

| 包 | 职责 |
|----|------|
| `app.api` | 路由、依赖注入、中间件；薄适配，不写领域逻辑 |
| `app.schemas` | Pydantic 请求/响应；对外字段 camelCase（`CamelModel`） |
| `app.services` | 会话、世界、角色、时间线、摘要等用例 |
| `app.graph` | LangGraph 回合拓扑与 runner（game / chat） |
| `app.repositories` | 持久化读写 |
| `app.models` | SQLAlchemy ORM |
| `app.core` | 配置、引擎、鉴权、LLM 客户端、日志 |

**领域要点（既有模型，改动时保持）：**

- Conversation 容器承载世界快照与时间线；chat / game 共用同一会话与 timeline。
- 玩家动作经 `act_patch` 进入世界；导演 / NPC 经图节点产出变更与旁白后 `commit_turn`。
- 提交携带 `stateVersion`；冲突由服务抛出并映射为 HTTP 409 与标准冲突体，供客户端对齐缓存。

## 本地运行

```bash
uv sync
cp .env.example .env
make dev
```

`make dev` = `alembic upgrade head` + `python main.py`。迁移**不在**应用 lifespan 内执行。

默认 SQLite 即可开发；需要与 CI 一致的行锁 / JSONB 行为时用 PostgreSQL（见仓库 `dev-infra/`）。

## 改 API / Schema 后

1. 改 `app.schemas` 与 endpoints；端点保持 `response_model_by_alias=True`。
2. `make openapi` 更新仓库根 `openapi.json`。
3. 前端执行 `pnpm openapi`，确认生成与类型检查通过。

## 数据库迁移

1. 改 `app.models`
2. `uv run alembic revision --autogenerate -m "描述"`
3. 检查 diff 后 `uv run alembic upgrade head`

CI（`.github/workflows/backend-quality.yml`）在 SQLite 与 PostgreSQL 上跑 `upgrade` + `alembic check` + pytest。

## 测试

| 环境 | 行为 |
|------|------|
| 本地 `uv run pytest` | 默认临时 SQLite；只验业务与 ORM |
| CI | SQLite + Postgres 双 job |

- pytest 用 `create_all`/`drop_all`，**不等于**验证 migration 脚本。
- 指定库时只用 `TEST_DATABASE_URL`，不要用 `DATABASE_URL` 跑测。
- 目录：`tests/api/`、`tests/services/`、`tests/graph/`、`tests/repositories/` 等。

## 质量命令

```bash
uv run ruff format .
uv run ruff check .
uv run mypy .
uv run pytest
```

可选 pre-commit：`uv sync --group dev && uv run pre-commit install`。

## 代码约定

- 一律绝对导入：`from app...`；跨包优先走包门面（`app.schemas`、`app.services`…），避免无必要的深层耦合。
- API 层不直接堆业务；业务在 services / graph。
- Schema 继承 `CamelModel`；解析可接受 snake/camel，响应按 alias 输出。
- 新增公开符号写入对应 `__all__`。
- 类型：mypy strict；格式与 lint 以 ruff 为准。
