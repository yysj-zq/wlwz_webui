# 后端开发者指南

面向在本仓库中开发、调试与提交代码的贡献者：运行方式、数据库迁移、测试与质量门禁。

## 本地运行

在 `backend/` 目录：

```bash
uv sync
cp .env.example .env
# 编辑 .env（至少确认 DATABASE_URL）
make dev
```

`make dev` 会依次执行 `uv run alembic upgrade head` 与 `uv run python main.py`。迁移在进程外执行，**不在**应用 `lifespan` 里跑 DDL。

若分步执行，须先 `uv run alembic upgrade head`，再 `uv run python main.py`。未执行过 `upgrade` 时，库结构可能与 ORM 不一致。


## 数据库迁移（Alembic）

表结构由 **Alembic** 管理（`alembic/versions/`）。

修改 ORM 模型后：

1. 生成迁移：`uv run alembic revision --autogenerate -m "描述变更"`（检查 diff，必要时手改）
2. 应用迁移：`uv run alembic upgrade head`

部署或发布前应在启动应用**之前**单独执行 `uv run alembic upgrade head`。本地在 SQLite 与 PostgreSQL 上使用同一套迁移脚本（JSON 列在 PostgreSQL 为 `JSONB`，在 SQLite 为 `TEXT` 变体）。

### Revision 与 CI 检测

- CI（`.github/workflows/backend-quality.yml`）在 **SQLite** 与 **PostgreSQL** 两个 job 上各执行一次 `alembic upgrade head` 与 `alembic check`，用于发现「模型已改但未提交对应迁移」一类问题。

## 本地与 CI 测试期望

| 环境 | 期望 | 默认假设 |
|------|------|----------|
| **本地 `pytest`** | **不**要求验双库；默认使用**临时 SQLite 文件**（`tmp_path`），只验证**业务与 ORM 逻辑**。 | 迁移脚本与模型在 **CI 已验证**；本地不重复承担方言/迁移门禁。 |
| **CI** | **实际**跑 **SQLite** 与 **PostgreSQL** 两个并行 job；SQLite job 仅设 `DATABASE_URL`（alembic 用），pytest 用独立临时文件；Postgres job 设 `DATABASE_URL` 与 `TEST_DATABASE_URL`（同值），再依次执行质量检查、`alembic upgrade head`、`alembic check`、`pytest`。 | 双库 + Alembic 门禁是 **CI 责任**；合并前以 CI 全部通过为准。 |

可选：本地设置 `TEST_DATABASE_URL` 可让 pytest 连指定库（**非默认**，不强制每人装 Postgres）。**不要**用 `DATABASE_URL` 跑测试，以免加载 `.env` 时误连开发库。

### pytest 与 Alembic 的分工

- **pytest** 用 `create_all` / `drop_all` 建表，只验证 ORM 与业务逻辑；**不**等同于跑完一遍 migration 脚本。
- **CI** 里在 pytest 之前的 `alembic upgrade head` 与 `alembic check` 管迁移与模型是否一致。
- 同一 `TEST_DATABASE_URL` 上不要与 `pytest-xdist` 并行（多 worker 会互相 `drop_all`）。

CI 工作流：`.github/workflows/backend-quality.yml`（SQLite / Postgres 两个 job，共用 `.github/actions/backend-quality`；Postgres job 才起数据库服务）。步骤为 checkout → 依赖 → ruff → mypy → alembic → pytest。

## 代码风格与质量检查

使用 `ruff`（格式化 + lint）、`mypy`（strict）

在 `backend/` 下：

```bash
uv run ruff format .
uv run ruff check .
uv run mypy .
```

可选：在仓库根目录安装 pre-commit：

```bash
uv sync --group dev
uv run pre-commit install
```

## 测试

采用 **平行 tests 目录**：

- `tests/api/`：API 契约测试
- `tests/services/`：服务层测试

```bash
uv run pytest
```

### 测试数据库（SQLite / PostgreSQL）

pytest **只**读取 **`TEST_DATABASE_URL`** 指定测试库；未设置时使用**临时 SQLite 文件**，无需额外配置、**无需**本地先建库或验双库。

指定环境变量时，fixture 会在每次用例前重置 schema（`drop_all` + `create_all`），以便在 PostgreSQL 或共享 SQLite 文件上安全重复跑用例。

CI 在 SQLite 与 Postgres 两个 job 上各跑一遍同一套用例；本地默认只跑临时 SQLite，不复制 CI 双库。


## 导入与包公开接口

- 统一使用绝对导入（`from app...`），不使用相对导入。
- 优先从包级公开接口导入（如 `app.api.schemas`、`app.db.models`）。
- 聚合包通过 `__init__.py` 与 `__all__` 提供稳定公开面：
  - API 层：`app.api`、`app.api.schemas`、`app.api.routers`、`app.api.dependencies`、`app.api.middleware`
  - 业务层：`app.services`
  - 数据层：`app.db`、`app.db.models`
  - 基础设施：`app.core`、`app.common`、`app.infra`
- `app` 顶层包作为命名空间入口，不承载业务聚合导出。
