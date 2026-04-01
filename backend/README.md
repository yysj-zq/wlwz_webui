# 武林外传 AI 对话后端服务

FastAPI 后端，提供聊天、会话、角色、TTS 与认证等 API。

## 功能概览

- **聊天**：普通对话与流式对话（SSE），对接兼容 OpenAI Chat Completions 的 LLM
- **会话**：会话 CRUD，与用户关联并持久化到数据库
- **角色**：从 YAML 配置加载内置角色与头像，并支持自定义角色
- **TTS**：文本转语音（对接 Triton），可选 Redis 缓存
- **认证**：JWT 登录/注册，密码 Argon2 哈希

## 快速启动

```bash
uv sync
cp .env.example .env
# 编辑 .env 后启动
uv run main.py
```

服务默认在 **http://localhost:8081** 运行。API 文档：http://localhost:8081/docs 。

## 代码风格与质量检查

本项目使用 `ruff`（格式化 + lint）、`mypy`（strict）与 `pytest`（测试）做质量门禁。

在 `backend/` 目录下执行：

```bash
uv run ruff format .
uv run ruff check .
uv run mypy .
uv run pytest
```

也可以在仓库根目录启用提交前自动检查（需要安装开发依赖组）：

```bash
uv sync --group dev
uv run pre-commit install
```

## 测试约定

本项目采用 **平行 tests 目录**（Option B）：

- `tests/api/`：API 契约测试（认证、会话、聊天等）
- `tests/services/`：服务层纯逻辑/数据库交互测试

执行：

```bash
uv run pytest
```

## 环境变量

复制 `.env.example` 为 `.env` 后按需修改，主要项如下：

| 类别     | 变量示例 | 说明 |
|----------|----------|------|
| 应用     | `PORT=8081`、`CORS_ORIGINS` | 端口与允许的跨域来源 |
| 内置角色     | `INIT_BUILTIN_ROLES_ON_START`、`ROLES_CONFIG_PATH` | 是否从 YAML 初始化角色、配置文件路径 |
| 大模型   | `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME` | LLM API 地址与模型名 |
| TTS      | `TTS_TRITON_URL`、`TTS_MODEL_NAME` | Triton TTS 地址与模型名 |
| 数据库   | `DATABASE_URL` | 如 `sqlite+aiosqlite:///./app.db` |
| 认证     | `JWT_SECRET_KEY`、`ACCESS_TOKEN_EXPIRE_MINUTES` | JWT 密钥与过期时间 |
| 缓存     | `REDIS_URL`、`TTS_CACHE_TTL_SECONDS` | TTS 缓存（可选） |

完整列表见 `.env.example`。

## 项目结构

```
backend/
├── app/
│   ├── api/
│   │   ├── dependencies/        # FastAPI 依赖注入（认证等）
│   │   ├── middleware/          # HTTP 中间件
│   │   ├── routers/             # 各业务路由（协议层）
│   │   ├── schemas/             # Pydantic 请求/响应模型
│   │   └── router.py            # API 聚合路由
│   ├── common/                  # 通用常量与上下文工具
│   ├── core/                    # 配置与日志
│   ├── db/                      # 数据库会话与 ORM 模型
│   │   ├── models/
│   │   └── session.py
│   ├── infra/                   # 外部系统适配（LLM/TTS 缓存）
│   ├── services/                # 业务服务层
│   └── main.py                  # 应用工厂与 lifespan
├── config/
│   └── roles.yaml               # 内置角色与头像 seed 配置
├── tests/
│   ├── api/                     # API 契约测试
│   └── services/                # 服务层测试
└── main.py                      # 运行入口（uvicorn）
```

## 导入与包公开接口约定

- 统一使用绝对导入（`from app...`），不使用相对导入。
- 优先从包级公开接口导入（例如 `app.api.schemas`、`app.db.models`）。
- 聚合包通过 `__init__.py` + `__all__` 提供稳定公开面：
  - `app.api`
  - `app.api.schemas`
  - `app.api.routers`
  - `app.api.dependencies`
  - `app.api.middleware`
  - `app.db.models`
  - `app.core`
  - `app.common`
  - `app.db`
  - `app.infra`
  - `app.services`
- `app` 顶层包作为命名空间入口，不承载业务聚合导出。

## 主要 API

- `POST /api/auth/register`、`POST /api/auth/login`：注册、登录
- `GET/POST/DELETE /api/conversations`：会话列表、创建、删除
- `POST /api/chat`、`POST /api/chat/stream`：普通对话、流式对话
- `GET /api/roles`：可用角色列表
- `POST /api/tts`：文本转语音，返回 WAV

认证接口除登录/注册外，需在请求头携带 `Authorization: Bearer <token>`。